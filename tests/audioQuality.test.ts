import { describe, expect, it } from 'vitest'
import type { AudioAnalysis } from '../src/main/adapters/FfmpegAdapter'
import { areComplementary, scoreAudioAnalysis } from '../src/main/services/AudioPreparationService'
import { assessTranscriptQuality } from '../src/main/services/TranscriptQualityService'

function analysis(overrides: Partial<AudioAnalysis> = {}): AudioAnalysis {
  return {
    candidate: { id: 'stream-1', kind: 'stream', streamIndexes: [1], label: 'Audio track 1' },
    nonSilentRatio: 0.7,
    meanVolumeDb: -24,
    maxVolumeDb: -3,
    silenceIntervalsMs: [],
    ...overrides
  }
}

describe('automatic audio preparation', () => {
  it('prefers a matching language and default stream over an unrelated track', () => {
    const ru = scoreAudioAnalysis(analysis(), { index: 1, ordinal: 0, codec: 'AAC', channels: 2, language: 'rus', isDefault: true }, 'ru')
    const en = scoreAudioAnalysis(analysis(), { index: 2, ordinal: 1, codec: 'AAC', channels: 2, language: 'eng', isDefault: false }, 'ru')
    expect(ru).toBeGreaterThan(en)
  })

  it('combines tracks only when their audible regions add complementary coverage', () => {
    const left = analysis({ silenceIntervalsMs: [[50_000, 100_000]], nonSilentRatio: 0.5 })
    const right = analysis({ silenceIntervalsMs: [[0, 50_000]], nonSilentRatio: 0.5 })
    const duplicate = analysis({ silenceIntervalsMs: [[50_000, 100_000]], nonSilentRatio: 0.5 })
    expect(areComplementary(left, right, 100_000)).toBe(true)
    expect(areComplementary(left, duplicate, 100_000)).toBe(false)
  })
})

describe('transcript quality guard', () => {
  it('rejects placeholder-heavy auto-detect output', () => {
    const result = {
      durationMs: 120_000,
      segments: Array.from({ length: 8 }, (_value, index) => ({ startMs: index * 10_000, endMs: index * 10_000 + 5_000, text: index < 6 ? '[FOREIGN]' : 'hello' }))
    }
    expect(assessTranscriptQuality(result, { tokenCount: 0 }, analysis()).acceptable).toBe(false)
  })

  it('rejects repeated silence hallucinations but accepts varied speech', () => {
    const repeated = {
      durationMs: 120_000,
      segments: Array.from({ length: 8 }, (_value, index) => ({ startMs: index * 10_000, endMs: index * 10_000 + 5_000, text: 'Редактор субтитров Е.Воинова' }))
    }
    const varied = {
      durationMs: 30_000,
      segments: [
        { startMs: 0, endMs: 10_000, text: 'Сегодня мы обсуждаем новый проект.' },
        { startMs: 10_000, endMs: 20_000, text: 'Следующая встреча состоится во вторник.' },
        { startMs: 20_000, endMs: 30_000, text: 'Спасибо всем участникам.' }
      ]
    }
    expect(assessTranscriptQuality(repeated, { tokenCount: 0 }, analysis()).acceptable).toBe(false)
    expect(assessTranscriptQuality(varied, { tokenCount: 30, averageTokenProbability: 0.8 }, analysis()).acceptable).toBe(true)
  })
})
