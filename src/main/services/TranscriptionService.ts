import { randomUUID } from 'node:crypto'
import { mkdir, statfs, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import type {
  AppSettings,
  FriendlyError,
  MediaMetadata,
  TranscriptionCompleted,
  TranscriptionProgress,
  TranscriptionRequest
} from '../../shared/types'
import type { FfmpegAdapter } from '../adapters/FfmpegAdapter'
import type { WhisperCliAdapter } from '../adapters/WhisperCliAdapter'
import { threadCount } from '../utils/platform'
import type { JobManager } from './JobManager'
import type { Logger } from './Logger'
import type { MediaService } from './MediaService'
import type { ModelManager } from './ModelManager'
import type { PathService } from './PathService'
import type { ProcessManager } from './ProcessManager'
import type { SettingsService } from './SettingsService'
import type { SystemInfoService } from './SystemInfoService'
import type { TempFileService } from './TempFileService'

export class TranscriptionService extends EventEmitter {
  private cancelled = false
  private jobDirectory: string | null = null
  private startedAt = 0
  private lastProgressAt = 0

  constructor(
    private readonly jobs: JobManager,
    private readonly media: MediaService,
    private readonly models: ModelManager,
    private readonly ffmpeg: FfmpegAdapter,
    private readonly whisper: WhisperCliAdapter,
    private readonly processes: ProcessManager,
    private readonly tempFiles: TempFileService,
    private readonly paths: PathService,
    private readonly settings: SettingsService,
    private readonly system: SystemInfoService,
    private readonly logger: Logger
  ) { super() }

  start(request: TranscriptionRequest): string {
    if (this.jobs.isActive()) throw new Error('A transcription is already running.')
    const jobId = randomUUID()
    this.jobs.start(jobId, request.modelId)
    this.cancelled = false
    this.startedAt = Date.now()
    this.run(jobId, request).catch((error: unknown) => {
      const friendly = this.friendlyError(error)
      this.emit('failed', friendly)
    })
    return jobId
  }

  async cancel(): Promise<void> {
    if (!this.jobs.isActive()) return
    this.cancelled = true
    await this.processes.terminateAll()
    if (this.jobs.isActive()) this.jobs.transition('CANCELLED')
    if (this.jobDirectory) await this.tempFiles.remove(this.jobDirectory)
    this.emitProgress(this.jobs.getJobId() ?? '', 'CANCELLED', 0, 0, true)
    this.logger.info('transcription cancelled', { job: this.jobs.getJobId() ?? '' })
  }

  private async run(jobId: string, request: TranscriptionRequest): Promise<void> {
    let metadata: MediaMetadata | null = null
    try {
      metadata = await this.media.inspect(request.mediaPath)
      if (!(await this.models.isValid(request.modelId))) throw new Error('The selected model is missing or appears to be corrupted.')
      this.jobDirectory = await this.tempFiles.create(jobId)
      const wavPath = join(this.jobDirectory, 'audio.wav')
      const outputPrefix = join(this.jobDirectory, 'transcript')
      await this.assertDiskSpace(metadata.durationMs)
      this.emitProgress(jobId, 'PREPARING', metadata.durationMs, 0, true)

      this.jobs.transition('EXTRACTING_AUDIO')
      await this.ffmpeg.extract(metadata.path, wavPath, (processedMs) => {
        this.emitProgress(jobId, 'EXTRACTING_AUDIO', metadata!.durationMs, processedMs)
      })
      this.ensureActive()

      this.jobs.transition('TRANSCRIBING')
      const system = await this.system.getInfo()
      const settings: AppSettings = this.settings.get()
      const result = await this.whisper.transcribe({
        audioPath: wavPath,
        modelPath: this.models.modelPath(request.modelId),
        outputPrefix,
        threads: threadCount(system.logicalCpuCount, settings.performanceProfile),
        language: request.language,
        acceleration: settings.hardwareAcceleration
      }, metadata.durationMs, (percent) => {
        this.emitProgress(jobId, 'TRANSCRIBING', metadata!.durationMs, metadata!.durationMs * percent / 100)
      })
      this.ensureActive()

      this.jobs.transition('FINALIZING')
      this.emitProgress(jobId, 'FINALIZING', metadata.durationMs, metadata.durationMs, true)
      try { await unlink(wavPath) } catch { /* completion cleanup removes the directory */ }
      this.jobs.transition('COMPLETED')
      const completed: TranscriptionCompleted = { jobId, media: metadata, modelId: request.modelId, result }
      this.emitProgress(jobId, 'COMPLETED', metadata.durationMs, metadata.durationMs, true)
      this.emit('completed', completed)
      this.logger.info('transcription completed', { job: jobId, model: request.modelId, durationMs: metadata.durationMs })
    } catch (error) {
      if (this.cancelled) return
      if (this.jobs.isActive()) this.jobs.transition('FAILED')
      this.logger.error('transcription failed', { job: jobId, message: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      const directory = this.jobDirectory
      this.jobDirectory = null
      if (directory) {
        try { await this.tempFiles.remove(directory) } catch { /* cleanup will retry on next startup */ }
      }
    }
  }

  private async assertDiskSpace(durationMs: number): Promise<void> {
    await mkdir(this.paths.temp, { recursive: true })
    const estimated = Math.ceil(durationMs / 1000 * 32_000 + 44)
    const required = estimated + 256 * 1024 ** 2
    const disk = await statfs(this.paths.temp)
    const available = disk.bavail * disk.bsize
    if (available < required) {
      throw new Error(`LocalScribe needs approximately ${this.formatBytes(required)} of temporary disk space. Only ${this.formatBytes(available)} is currently available.`)
    }
  }

  private emitProgress(jobId: string, stage: TranscriptionProgress['stage'], durationMs: number, processedMs: number, force = false): void {
    const now = Date.now()
    if (!force && now - this.lastProgressAt < 250) return
    this.lastProgressAt = now
    const progress: TranscriptionProgress = {
      jobId, stage, durationMs, processedMs,
      percent: durationMs > 0 ? Math.min(100, processedMs / durationMs * 100) : undefined,
      elapsedMs: now - this.startedAt
    }
    this.emit('progress', progress)
  }

  private ensureActive(): void { if (this.cancelled) throw new Error('Transcription cancelled') }
  private formatBytes(bytes: number): string { return `${Math.ceil(bytes / 1024 ** 2)} MB` }
  private friendlyError(error: unknown): FriendlyError {
    const details = error instanceof Error ? error.message : String(error)
    const message = details.includes('No audio track') ? 'No audio track was found in this file.'
      : details.includes('disk space') ? details
      : details.includes('model') ? 'The selected model is missing or appears to be corrupted.'
      : details.includes('FFmpeg') ? 'FFmpeg could not process this media file.'
      : details.includes('transcription engine') ? 'LocalScribe could not start the transcription engine.'
      : 'Transcription could not be completed.'
    return { code: 'TRANSCRIPTION_FAILED', message, details, action: details.includes('model') ? 'repair' : 'retry' }
  }
}
