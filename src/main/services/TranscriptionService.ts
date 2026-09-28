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
import type { AudioPreparationService, PreparedAudioCandidate } from './AudioPreparationService'
import type { JobManager } from './JobManager'
import type { Logger } from './Logger'
import type { MediaService } from './MediaService'
import type { ModelManager } from './ModelManager'
import type { PathService } from './PathService'
import type { ProcessManager } from './ProcessManager'
import type { SettingsService } from './SettingsService'
import type { SystemInfoService } from './SystemInfoService'
import type { TempFileService } from './TempFileService'
import { assessTranscriptQuality, UnreliableTranscriptError } from './TranscriptQualityService'

interface ActiveJob {
  id: string
  cancelled: boolean
  directory: string | null
  startedAt: number
  lastProgressAt: number
}

export class TranscriptionCancelledError extends Error {
  constructor() { super('Transcription cancelled'); this.name = 'TranscriptionCancelledError' }
}

export class TranscriptionService extends EventEmitter {
  private active: ActiveJob | null = null

  constructor(
    private readonly jobs: JobManager,
    private readonly media: MediaService,
    private readonly models: ModelManager,
    private readonly audioPreparation: AudioPreparationService,
    private readonly ffmpeg: FfmpegAdapter,
    private readonly whisper: WhisperCliAdapter,
    private readonly processes: ProcessManager,
    private readonly tempFiles: TempFileService,
    private readonly paths: PathService,
    private readonly settings: SettingsService,
    private readonly system: SystemInfoService,
    private readonly logger: Logger,
    private readonly vadModelPath: () => string
  ) { super() }

  async execute(request: TranscriptionRequest, jobId: string = randomUUID()): Promise<TranscriptionCompleted> {
    if (this.active || this.jobs.isActive()) throw new Error('A transcription is already running.')
    const context: ActiveJob = { id: jobId, cancelled: false, directory: null, startedAt: Date.now(), lastProgressAt: 0 }
    this.active = context
    this.jobs.start(jobId, request.modelId)
    try {
      return await this.run(context, request)
    } finally {
      if (this.active === context) this.active = null
    }
  }

  async cancel(jobId?: string): Promise<void> {
    const context = this.active
    if (!context || (jobId && context.id !== jobId)) return
    context.cancelled = true
    await Promise.all([this.processes.terminate('ffmpeg'), this.processes.terminate('whisper')])
    this.logger.info('transcription cancellation requested', { job: context.id })
  }

  toFriendlyError(error: unknown): FriendlyError { return this.friendlyError(error) }

  private async run(context: ActiveJob, request: TranscriptionRequest): Promise<TranscriptionCompleted> {
    let metadata: MediaMetadata | null = null
    try {
      metadata = await this.media.inspect(request.mediaPath)
      this.ensureActive(context)
      if (!(await this.models.isValid(request.modelId))) throw new Error('The selected model is missing or appears to be corrupted.')
      context.directory = await this.tempFiles.create(context.id)
      await this.assertDiskSpace(metadata.durationMs)
      this.emitProgress(context, 'PREPARING', metadata.durationMs, 0, true, 'Analyzing audio')
      const candidates = await this.audioPreparation.resolve(metadata, request.language, () => this.ensureActive(context))
      this.ensureActive(context)

      this.jobs.transition('EXTRACTING_AUDIO')
      const system = await this.system.getInfo()
      const settings: AppSettings = this.settings.get()
      const threads = threadCount(system.logicalCpuCount, settings.performanceProfile)
      const modelPath = this.models.modelPath(request.modelId)
      const vadModelPath = this.vadModelPath()
      const attempts = this.buildAttempts(candidates)
      let result: TranscriptionCompleted['result'] | null = null
      let lastQualityReasons: string[] = []

      for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
        this.ensureActive(context)
        const prepared = attempts[attemptIndex]!
        const wavPath = join(context.directory, `audio-${attemptIndex}.wav`)
        const outputPrefix = join(context.directory, `transcript-${attemptIndex}`)
        const recovering = attemptIndex > 0
        this.emitProgress(
          context,
          recovering ? 'TRANSCRIBING' : 'EXTRACTING_AUDIO',
          metadata.durationMs,
          0,
          true,
          recovering ? 'Improving transcription' : 'Preparing audio'
        )
        await this.ffmpeg.extract(metadata.path, wavPath, prepared.candidate, (processedMs) => {
          this.emitProgress(
            context,
            recovering ? 'TRANSCRIBING' : 'EXTRACTING_AUDIO',
            metadata!.durationMs,
            recovering ? 0 : processedMs,
            false,
            recovering ? 'Improving transcription' : 'Preparing audio'
          )
        })
        this.ensureActive(context)
        if (attemptIndex === 0) this.jobs.transition('TRANSCRIBING')

        let transcriptionLanguage: string = request.language
        if (request.language === 'auto') {
          this.emitProgress(context, 'TRANSCRIBING', metadata.durationMs, 0, true, 'Detecting spoken language')
          try {
            const detected = await this.whisper.detectLanguage({
              audioPath: wavPath,
              modelPath,
              threads,
              acceleration: settings.hardwareAcceleration,
              vadModelPath
            })
            if (detected?.language && (detected.probability === undefined || detected.probability >= 0.45)) {
              transcriptionLanguage = detected.language
            }
            this.logger.info('spoken language detection completed', {
              job: context.id,
              attempt: attemptIndex + 1,
              language: detected?.language ?? 'uncertain',
              probability: detected?.probability ?? 0
            })
          } catch (error) {
            this.logger.info('spoken language detection fallback', { job: context.id, message: error instanceof Error ? error.message : String(error) })
          }
          this.ensureActive(context)
        }

        this.emitProgress(context, 'TRANSCRIBING', metadata.durationMs, 0, true, recovering ? 'Improving transcription' : 'Transcribing')
        const output = await this.whisper.transcribe({
          audioPath: wavPath,
          modelPath,
          outputPrefix,
          threads,
          language: transcriptionLanguage,
          acceleration: settings.hardwareAcceleration,
          vadModelPath,
          resetContext: recovering
        }, metadata.durationMs, (percent) => {
          this.emitProgress(context, 'TRANSCRIBING', metadata!.durationMs, metadata!.durationMs * percent / 100, false, recovering ? 'Improving transcription' : 'Transcribing')
        })
        this.ensureActive(context)
        const assessment = assessTranscriptQuality(output.result, output.metrics, prepared.analysis)
        this.logger.info('transcription quality checked', {
          job: context.id,
          attempt: attemptIndex + 1,
          source: prepared.candidate.label,
          accepted: assessment.acceptable,
          score: Number(assessment.score.toFixed(3)),
          reasons: assessment.reasons.join(', ')
        })
        if (assessment.acceptable) {
          result = output.result
          break
        }
        lastQualityReasons = assessment.reasons
        try { await unlink(wavPath) } catch { /* completion cleanup removes the directory */ }
      }

      if (!result) throw new UnreliableTranscriptError(lastQualityReasons)

      this.jobs.transition('FINALIZING')
      this.emitProgress(context, 'FINALIZING', metadata.durationMs, metadata.durationMs, true)
      this.ensureActive(context)
      this.jobs.transition('COMPLETED')
      const completed: TranscriptionCompleted = { jobId: context.id, media: metadata, modelId: request.modelId, result }
      this.emitProgress(context, 'COMPLETED', metadata.durationMs, metadata.durationMs, true)
      this.logger.info('transcription completed', { job: context.id, model: request.modelId, durationMs: metadata.durationMs })
      return completed
    } catch (error) {
      if (context.cancelled) {
        if (this.jobs.isActive()) this.jobs.transition('CANCELLED')
        this.emitProgress(context, 'CANCELLED', metadata?.durationMs ?? 0, 0, true)
        this.logger.info('transcription cancelled', { job: context.id })
        throw new TranscriptionCancelledError()
      }
      if (this.jobs.isActive()) this.jobs.transition('FAILED')
      this.logger.error('transcription failed', { job: context.id, message: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      const directory = context.directory
      context.directory = null
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

  private buildAttempts(candidates: PreparedAudioCandidate[]): PreparedAudioCandidate[] {
    const attempts = candidates.slice(0, 3)
    if (attempts.length < 3 && candidates[0]) attempts.push(candidates[0])
    return attempts
  }

  private emitProgress(context: ActiveJob, stage: TranscriptionProgress['stage'], durationMs: number, processedMs: number, force = false, detail?: string): void {
    const now = Date.now()
    if (!force && now - context.lastProgressAt < 250) return
    context.lastProgressAt = now
    const progress: TranscriptionProgress = {
      jobId: context.id,
      stage,
      durationMs,
      processedMs,
      percent: durationMs > 0 ? Math.min(100, processedMs / durationMs * 100) : undefined,
      elapsedMs: now - context.startedAt,
      ...(detail ? { detail } : {})
    }
    this.emit('progress', progress)
  }

  private ensureActive(context: ActiveJob): void {
    if (context.cancelled || this.active !== context) throw new TranscriptionCancelledError()
  }

  private formatBytes(bytes: number): string { return `${Math.ceil(bytes / 1024 ** 2)} MB` }

  private friendlyError(error: unknown): FriendlyError {
    const details = error instanceof Error ? error.message : String(error)
    const message = error instanceof UnreliableTranscriptError ? 'LocalScribe could not find a reliable speech result after automatically checking the available audio.'
      : details.includes('No audio track') ? 'No audio track was found in this file.'
      : details.includes('disk space') ? details
      : details.includes('model') ? 'The selected model is missing or appears to be corrupted.'
      : details.includes('FFmpeg') ? 'FFmpeg could not process this media file.'
      : details.includes('transcription engine') ? 'LocalScribe could not start the transcription engine.'
      : 'Transcription could not be completed.'
    return { code: 'TRANSCRIPTION_FAILED', message, details, action: details.includes('model') ? 'repair' : 'retry' }
  }
}
