import type { JobStage, ModelId } from '../../shared/types'

const transitions: Record<JobStage | 'IDLE', ReadonlyArray<JobStage>> = {
  IDLE: ['PREPARING'],
  PREPARING: ['EXTRACTING_AUDIO', 'FAILED', 'CANCELLED'],
  EXTRACTING_AUDIO: ['TRANSCRIBING', 'FAILED', 'CANCELLED'],
  TRANSCRIBING: ['FINALIZING', 'FAILED', 'CANCELLED'],
  FINALIZING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: ['PREPARING'],
  FAILED: ['PREPARING'],
  CANCELLED: ['PREPARING']
}

export class JobManager {
  private state: JobStage | 'IDLE' = 'IDLE'
  private jobId: string | null = null
  private modelId: ModelId | null = null

  start(jobId: string, modelId: ModelId): void {
    this.transition('PREPARING')
    this.jobId = jobId
    this.modelId = modelId
  }

  transition(next: JobStage): void {
    if (!transitions[this.state].includes(next)) throw new Error(`Invalid transcription state transition: ${this.state} → ${next}`)
    this.state = next
  }

  getState(): JobStage | 'IDLE' { return this.state }
  getJobId(): string | null { return this.jobId }
  isActive(): boolean { return !['IDLE', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(this.state) }
  isUsing(modelId: ModelId): boolean { return this.isActive() && this.modelId === modelId }
}
