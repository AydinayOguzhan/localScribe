import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type {
  QueueAddRequest,
  QueueItem,
  QueueResult,
  QueueSnapshot,
  TranscriptionProgress,
  TranscriptionRequest
} from '../../shared/types'
import { MAX_QUEUE_ITEMS } from '../../shared/types'
import type { HistoryStore } from './HistoryStore'
import type { Logger } from './Logger'
import type { MediaService } from './MediaService'
import { TranscriptionCancelledError, type TranscriptionService } from './TranscriptionService'

const liveStatuses = new Set<QueueItem['status']>(['QUEUED', 'PREPARING', 'EXTRACTING_AUDIO', 'TRANSCRIBING', 'FINALIZING'])
const terminalStatuses = new Set<QueueItem['status']>(['COMPLETED', 'FAILED', 'CANCELLED'])

export class TranscriptionQueueService extends EventEmitter {
  private items: QueueItem[] = []
  private activeItemId: string | null = null
  private pumping = false
  private reservations = 0
  private results = new Map<string, QueueResult>()

  constructor(
    private readonly transcription: TranscriptionService,
    private readonly media: MediaService,
    private readonly history: HistoryStore,
    private readonly logger: Logger
  ) {
    super()
    this.transcription.on('progress', (progress: TranscriptionProgress) => this.onProgress(progress))
  }

  getSnapshot(): QueueSnapshot {
    return structuredClone({
      items: this.items,
      activeItemId: this.activeItemId,
      availableSlots: Math.max(0, MAX_QUEUE_ITEMS - this.liveCount() - this.reservations)
    })
  }

  getResult(itemId: string): QueueResult | null {
    const value = this.results.get(itemId)
    return value ? structuredClone(value) : null
  }

  async add(requests: QueueAddRequest[]): Promise<QueueSnapshot> {
    if (requests.length === 0) return this.getSnapshot()
    if (requests.length > MAX_QUEUE_ITEMS - this.liveCount() - this.reservations) {
      throw new Error(`The queue can contain at most ${MAX_QUEUE_ITEMS} active or waiting files.`)
    }
    this.reservations += requests.length
    let additions: QueueItem[]
    try {
      additions = []
      for (const request of requests) {
        const media = await this.media.inspect(request.mediaPath)
        additions.push({
          id: randomUUID(),
          jobId: null,
          media,
          settings: { modelId: request.modelId, language: request.language, timestamps: request.timestamps },
          status: 'QUEUED',
          createdAt: new Date().toISOString()
        })
      }
    } finally {
      this.reservations -= requests.length
    }
    this.items.push(...additions)
    this.pruneTerminalItems()
    this.emitChanged()
    void this.pump()
    return this.getSnapshot()
  }

  async cancel(itemId: string): Promise<QueueSnapshot> {
    const item = this.items.find((candidate) => candidate.id === itemId)
    if (!item || terminalStatuses.has(item.status)) return this.getSnapshot()
    if (item.status === 'QUEUED') {
      item.status = 'CANCELLED'
      this.emitChanged()
      return this.getSnapshot()
    }
    if (item.jobId) await this.transcription.cancel(item.jobId)
    item.status = 'CANCELLED'
    this.emitChanged()
    return this.getSnapshot()
  }

  async cancelAll(): Promise<QueueSnapshot> {
    for (const item of this.items) if (item.status === 'QUEUED') item.status = 'CANCELLED'
    const active = this.items.find((item) => item.id === this.activeItemId)
    if (active?.jobId) await this.transcription.cancel(active.jobId)
    if (active) active.status = 'CANCELLED'
    this.emitChanged()
    return this.getSnapshot()
  }

  retry(itemId: string): QueueSnapshot {
    const item = this.items.find((candidate) => candidate.id === itemId)
    if (!item || !['FAILED', 'CANCELLED'].includes(item.status)) throw new Error('Only failed or cancelled files can be retried.')
    if (this.liveCount() >= MAX_QUEUE_ITEMS) throw new Error(`The queue can contain at most ${MAX_QUEUE_ITEMS} active or waiting files.`)
    item.jobId = null
    item.status = 'QUEUED'
    delete item.progress
    delete item.error
    delete item.historyWarning
    this.emitChanged()
    void this.pump()
    return this.getSnapshot()
  }

  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    try {
      let item = this.items.find((candidate) => candidate.status === 'QUEUED')
      while (item) {
        const itemId = item.id
        this.activeItemId = item.id
        item.jobId = randomUUID()
        item.status = 'PREPARING'
        this.emitChanged()
        const request: TranscriptionRequest = {
          mediaPath: item.media.path,
          modelId: item.settings.modelId,
          language: item.settings.language,
          timestamps: item.settings.timestamps
        }
        try {
          const completed = await this.transcription.execute(request, item.jobId)
          this.results.set(item.id, {
            itemId: item.id,
            media: completed.media,
            settings: item.settings,
            result: completed.result
          })
          item.status = 'COMPLETED'
          item.progress = {
            jobId: item.jobId,
            stage: 'COMPLETED',
            percent: 100,
            processedMs: item.media.durationMs,
            durationMs: item.media.durationMs,
            elapsedMs: item.progress?.elapsedMs ?? 0
          }
          try {
            const record = this.history.insert({
              media: completed.media,
              modelId: item.settings.modelId,
              requestedLanguage: item.settings.language,
              timestamps: item.settings.timestamps,
              result: completed.result
            })
            item.historyId = record.id
            this.results.get(item.id)!.historyId = record.id
            this.emit('history-changed')
          } catch (error) {
            item.historyWarning = `Transcript completed, but it could not be saved to History. ${error instanceof Error ? error.message : String(error)}`
            this.logger.error('completed transcript was not saved to history', { job: item.jobId, message: item.historyWarning })
          }
        } catch (error) {
          const wasCancelled = this.items.find((candidate) => candidate.id === itemId)?.status === 'CANCELLED'
          if (error instanceof TranscriptionCancelledError || wasCancelled) item.status = 'CANCELLED'
          else { item.status = 'FAILED'; item.error = this.transcription.toFriendlyError(error) }
        } finally {
          this.activeItemId = null
          this.pruneTerminalItems()
          this.emitChanged()
        }
        item = this.items.find((candidate) => candidate.status === 'QUEUED')
      }
    } finally {
      this.pumping = false
      if (this.items.some((item) => item.status === 'QUEUED')) void this.pump()
    }
  }

  private onProgress(progress: TranscriptionProgress): void {
    const item = this.items.find((candidate) => candidate.jobId === progress.jobId)
    if (!item || terminalStatuses.has(item.status)) return
    item.progress = progress
    if (terminalStatuses.has(progress.stage)) return
    item.status = progress.stage
    this.emitChanged()
  }

  private liveCount(): number { return this.items.filter((item) => liveStatuses.has(item.status)).length }

  private pruneTerminalItems(): void {
    const terminals = this.items.filter((item) => terminalStatuses.has(item.status))
    if (terminals.length <= 10) return
    const keep = new Set(terminals.slice(-10).map((item) => item.id))
    for (const id of this.results.keys()) if (!keep.has(id)) this.results.delete(id)
    this.items = this.items.filter((item) => !terminalStatuses.has(item.status) || keep.has(item.id))
  }

  private emitChanged(): void { this.emit('changed', this.getSnapshot()) }
}
