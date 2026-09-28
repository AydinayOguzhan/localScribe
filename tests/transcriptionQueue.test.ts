import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { HistoryRecord, QueueAddRequest, TranscriptionCompleted, TranscriptionProgress, TranscriptionRequest } from '../src/shared/types'
import { TranscriptionQueueService } from '../src/main/services/TranscriptionQueueService'
import type { HistoryStore } from '../src/main/services/HistoryStore'
import type { Logger } from '../src/main/services/Logger'
import type { MediaService } from '../src/main/services/MediaService'
import type { TranscriptionService } from '../src/main/services/TranscriptionService'

class FakeTranscription extends EventEmitter {
  readonly requests: TranscriptionRequest[] = []
  running = 0
  maxRunning = 0
  blocker: Promise<void> | null = null
  release: (() => void) | null = null

  block(): void { this.blocker = new Promise((resolve) => { this.release = resolve }) }

  async execute(request: TranscriptionRequest, jobId: string): Promise<TranscriptionCompleted> {
    this.requests.push(request)
    this.running += 1
    this.maxRunning = Math.max(this.maxRunning, this.running)
    const progress: TranscriptionProgress = { jobId, stage: 'TRANSCRIBING', percent: 50, durationMs: 1_000, processedMs: 500, elapsedMs: 10 }
    this.emit('progress', progress)
    try {
      if (this.blocker) await this.blocker
      if (request.mediaPath.includes('fail')) throw new Error('FFmpeg failed')
      return {
        jobId,
        modelId: request.modelId,
        media: metadata(request.mediaPath),
        result: { language: request.language === 'auto' ? 'en' : request.language, durationMs: 1_000, segments: [{ startMs: 0, endMs: 1_000, text: request.mediaPath }] }
      }
    } finally { this.running -= 1 }
  }

  async cancel(): Promise<void> { this.release?.() }
  toFriendlyError(error: unknown): { code: string; message: string } { return { code: 'FAILED', message: error instanceof Error ? error.message : String(error) } }
}

function metadata(path: string) {
  return { path, fileName: path.split('/').at(-1)!, sizeBytes: 100, durationMs: 1_000, kind: 'audio' as const, audioCodec: 'PCM', formatName: 'WAV' }
}

function request(path: string, modelId: QueueAddRequest['modelId'] = 'small', language: QueueAddRequest['language'] = 'auto'): QueueAddRequest {
  return { mediaPath: path, modelId, language, timestamps: true }
}

function createQueue(transcription: FakeTranscription): TranscriptionQueueService {
  const media = { inspect: vi.fn(async (path: string) => metadata(path)) }
  const history = {
    insert: vi.fn((value: { media: ReturnType<typeof metadata>; modelId: QueueAddRequest['modelId']; requestedLanguage: QueueAddRequest['language']; timestamps: boolean; result: TranscriptionCompleted['result'] }) => ({
      id: crypto.randomUUID(),
      fileName: value.media.fileName,
      mediaKind: value.media.kind,
      sizeBytes: value.media.sizeBytes,
      durationMs: value.media.durationMs,
      audioCodec: value.media.audioCodec,
      formatName: value.media.formatName,
      modelId: value.modelId,
      requestedLanguage: value.requestedLanguage,
      detectedLanguage: value.result.language,
      timestamps: value.timestamps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: value.result
    } satisfies HistoryRecord))
  }
  const logger = { info: vi.fn(), error: vi.fn() }
  return new TranscriptionQueueService(
    transcription as unknown as TranscriptionService,
    media as unknown as MediaService,
    history as unknown as HistoryStore,
    logger as unknown as Logger
  )
}

describe('TranscriptionQueueService', () => {
  it('runs files sequentially, preserves per-file settings, and continues after failure', async () => {
    const transcription = new FakeTranscription()
    const queue = createQueue(transcription)
    await queue.add([request('/one.wav', 'base', 'tr'), request('/fail.wav', 'small', 'en'), request('/three.wav', 'tiny', 'auto')])
    await vi.waitFor(() => expect(queue.getSnapshot().items.every((item) => ['COMPLETED', 'FAILED'].includes(item.status))).toBe(true))
    expect(transcription.maxRunning).toBe(1)
    expect(transcription.requests.map((item) => [item.mediaPath, item.modelId, item.language])).toEqual([
      ['/one.wav', 'base', 'tr'],
      ['/fail.wav', 'small', 'en'],
      ['/three.wav', 'tiny', 'auto']
    ])
    expect(queue.getSnapshot().items.map((item) => item.status)).toEqual(['COMPLETED', 'FAILED', 'COMPLETED'])
    expect(queue.getResult(queue.getSnapshot().items[0]!.id)?.result.segments[0]?.text).toBe('/one.wav')
  })

  it('enforces ten live items and frees capacity after completion', async () => {
    const transcription = new FakeTranscription()
    transcription.block()
    const queue = createQueue(transcription)
    await queue.add(Array.from({ length: 10 }, (_, index) => request(`/${index}.wav`)))
    expect(queue.getSnapshot().availableSlots).toBe(0)
    await expect(queue.add([request('/overflow.wav')])).rejects.toThrow(/at most 10/)
    transcription.release?.()
    await vi.waitFor(() => expect(queue.getSnapshot().items.every((item) => item.status === 'COMPLETED')).toBe(true))
    expect(queue.getSnapshot().availableSlots).toBe(10)
  })
})
