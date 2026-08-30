import { describe, expect, it } from 'vitest'
import { JobManager } from '../src/main/services/JobManager'

describe('JobManager', () => {
  it('enforces the transcription state machine', () => {
    const jobs = new JobManager()
    jobs.start('one', 'small')
    expect(jobs.isActive()).toBe(true)
    expect(jobs.isUsing('small')).toBe(true)
    expect(() => jobs.transition('COMPLETED')).toThrow(/Invalid/)
    jobs.transition('EXTRACTING_AUDIO')
    jobs.transition('TRANSCRIBING')
    jobs.transition('FINALIZING')
    jobs.transition('COMPLETED')
    expect(jobs.isActive()).toBe(false)
  })
  it('prevents a second active job', () => {
    const jobs = new JobManager()
    jobs.start('one', 'base')
    expect(() => jobs.start('two', 'small')).toThrow(/Invalid/)
  })
})
