import { describe, expect, it } from 'vitest'
import { formatClock, toSrt, toTxt, toVtt } from '../src/shared/transcriptFormat'
import type { TranscriptResult } from '../src/shared/types'

const result: TranscriptResult = {
  language: 'tr', durationMs: 65_500,
  segments: [
    { startMs: 1_230, endMs: 4_560, text: 'Merhaba dünya.' },
    { startMs: 64_999, endMs: 65_500, text: 'До свидания.' }
  ]
}

describe('transcript formatting', () => {
  it('formats precise timestamps', () => expect(formatClock(3_726_007)).toBe('01:02:06.007'))
  it('creates timestamped and plain UTF-8 text', () => {
    expect(toTxt(result, true)).toContain('[00:00:01] Merhaba dünya.')
    expect(toTxt(result, false)).toBe('Merhaba dünya.\nДо свидания.\n')
  })
  it('creates valid SRT blocks', () => expect(toSrt(result)).toBe('1\n00:00:01,230 --> 00:00:04,560\nMerhaba dünya.\n\n2\n00:01:04,999 --> 00:01:05,500\nДо свидания.\n'))
  it('creates a valid VTT document', () => expect(toVtt(result)).toMatch(/^WEBVTT\n\n00:00:01\.230 --> 00:00:04\.560/))
})
