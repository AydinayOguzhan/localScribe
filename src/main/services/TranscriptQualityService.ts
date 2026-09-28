import type { TranscriptResult } from '../../shared/types'
import type { AudioAnalysis } from '../adapters/FfmpegAdapter'
import type { WhisperMetrics } from '../adapters/WhisperCliAdapter'

export interface TranscriptQualityAssessment {
  acceptable: boolean
  score: number
  reasons: string[]
  placeholderRatio: number
  repeatedRatio: number
}

const placeholder = /^\s*\[(?:blank[_ ]audio|foreign|silence|inaudible|music|applause|noise|speaking foreign language)\]\s*$/i

function normalized(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim()
}

export function assessTranscriptQuality(result: TranscriptResult, metrics: WhisperMetrics, audio: AudioAnalysis): TranscriptQualityAssessment {
  const segments = result.segments
  const normalizedSegments = segments.map((segment) => normalized(segment.text)).filter(Boolean)
  const placeholders = segments.filter((segment) => placeholder.test(segment.text)).length
  const placeholderRatio = segments.length > 0 ? placeholders / segments.length : 0
  const counts = new Map<string, number>()
  for (const text of normalizedSegments) counts.set(text, (counts.get(text) ?? 0) + 1)
  const mostRepeated = Math.max(0, ...counts.values())
  const repeatedRatio = normalizedSegments.length > 0 ? mostRepeated / normalizedSegments.length : 0
  let longestRun = 0
  let currentRun = 0
  let previous = ''
  for (const text of normalizedSegments) {
    currentRun = text === previous ? currentRun + 1 : 1
    previous = text
    longestRun = Math.max(longestRun, currentRun)
  }

  const textLength = segments.reduce((sum, segment) => sum + segment.text.trim().length, 0)
  const nonSilentMs = result.durationMs * audio.nonSilentRatio
  const nonSilentMinutes = Math.max(0.01, nonSilentMs / 60_000)
  const reasons: string[] = []
  if (segments.length > 0 && placeholderRatio >= 0.25) reasons.push('placeholder-heavy output')
  if (segments.length >= 6 && mostRepeated >= 4 && repeatedRatio >= 0.3) reasons.push('repeated hallucinated segments')
  if (segments.length >= 4 && longestRun >= 3) reasons.push('consecutive repeated segments')
  if (nonSilentMs >= 10_000 && textLength === 0) reasons.push('no text despite audible content')
  if (nonSilentMinutes >= 1 && textLength / nonSilentMinutes < 8) reasons.push('implausibly sparse output')
  if (metrics.tokenCount >= 20 && (metrics.averageTokenProbability ?? 1) < 0.18) reasons.push('very low recognition confidence')

  let score = 1
  score -= Math.min(0.55, placeholderRatio * 0.8)
  if (mostRepeated >= 4) score -= Math.min(0.45, repeatedRatio * 0.6)
  if (longestRun >= 3) score -= 0.25
  if (metrics.averageTokenProbability !== undefined) score *= Math.max(0.35, metrics.averageTokenProbability)
  return {
    acceptable: reasons.length === 0,
    score: Math.max(0, Math.min(1, score)),
    reasons,
    placeholderRatio,
    repeatedRatio
  }
}

export class UnreliableTranscriptError extends Error {
  constructor(readonly reasons: string[]) {
    super(`The recording contains audible material, but LocalScribe could not produce a reliable transcript after automatic audio recovery. ${reasons.join('; ')}`)
    this.name = 'UnreliableTranscriptError'
  }
}
