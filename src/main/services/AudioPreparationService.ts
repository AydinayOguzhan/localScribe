import type { AudioStreamMetadata, LanguageId, MediaMetadata } from '../../shared/types'
import type { AudioAnalysis, AudioCandidate } from '../adapters/FfmpegAdapter'
import type { FfmpegAdapter } from '../adapters/FfmpegAdapter'
import type { Logger } from './Logger'

export interface PreparedAudioCandidate {
  candidate: AudioCandidate
  analysis: AudioAnalysis
  score: number
}

const languageAliases: Record<string, string> = {
  ara: 'ar', deu: 'de', dut: 'nl', eng: 'en', fra: 'fr', fre: 'fr', ger: 'de', hin: 'hi', ita: 'it',
  jpn: 'ja', kor: 'ko', nld: 'nl', pol: 'pl', por: 'pt', rus: 'ru', spa: 'es', tur: 'tr', ukr: 'uk', zho: 'zh', chi: 'zh'
}

function normalizedLanguage(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase().split('-')[0]!
  return languageAliases[normalized] ?? normalized
}

function volumeScore(db: number): number {
  if (!Number.isFinite(db)) return 0
  return Math.max(0, Math.min(1, (db + 55) / 37))
}

export function scoreAudioAnalysis(analysis: AudioAnalysis, stream: AudioStreamMetadata | undefined, requestedLanguage: LanguageId): number {
  const requested = requestedLanguage === 'auto' ? undefined : requestedLanguage
  const tagged = normalizedLanguage(stream?.language)
  const languageAdjustment = !requested || !tagged ? 0 : tagged === requested ? 0.12 : -0.18
  return analysis.nonSilentRatio * 0.68 + volumeScore(analysis.meanVolumeDb) * 0.24 + (stream?.isDefault ? 0.08 : 0) + languageAdjustment
}

function nonSilentIntervals(silence: Array<[number, number]>, durationMs: number): Array<[number, number]> {
  const intervals: Array<[number, number]> = []
  let cursor = 0
  for (const [rawStart, rawEnd] of [...silence].sort((a, b) => a[0] - b[0])) {
    const start = Math.max(cursor, Math.min(durationMs, rawStart))
    if (start > cursor) intervals.push([cursor, start])
    cursor = Math.max(cursor, Math.min(durationMs, rawEnd))
  }
  if (cursor < durationMs) intervals.push([cursor, durationMs])
  return intervals
}

function intervalDuration(intervals: Array<[number, number]>): number {
  return intervals.reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0)
}

function overlapDuration(left: Array<[number, number]>, right: Array<[number, number]>): number {
  let total = 0
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    const a = left[i]!
    const b = right[j]!
    total += Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]))
    if (a[1] < b[1]) i += 1
    else j += 1
  }
  return total
}

export function areComplementary(left: AudioAnalysis, right: AudioAnalysis, durationMs: number): boolean {
  const leftSound = nonSilentIntervals(left.silenceIntervalsMs, durationMs)
  const rightSound = nonSilentIntervals(right.silenceIntervalsMs, durationMs)
  const leftDuration = intervalDuration(leftSound)
  const rightDuration = intervalDuration(rightSound)
  const smaller = Math.min(leftDuration, rightDuration)
  if (smaller < 5_000) return false
  const overlap = overlapDuration(leftSound, rightSound)
  const union = leftDuration + rightDuration - overlap
  const gain = union - Math.max(leftDuration, rightDuration)
  return overlap / smaller < 0.65 && gain >= Math.max(10_000, durationMs * 0.04)
}

function mainCandidate(stream: AudioStreamMetadata): AudioCandidate {
  return { id: `stream-${stream.index}`, kind: 'stream', streamIndexes: [stream.index], label: `Audio track ${stream.ordinal + 1}` }
}

export class AudioPreparationService {
  constructor(private readonly ffmpeg: FfmpegAdapter, private readonly logger: Logger) {}

  async resolve(metadata: MediaMetadata, language: LanguageId, checkpoint: () => void = () => undefined): Promise<PreparedAudioCandidate[]> {
    checkpoint()
    const availableStreams = metadata.audioStreams ?? []
    const streams = [...availableStreams].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.ordinal - right.ordinal).slice(0, 8)
    if (availableStreams.length > streams.length) this.logger.info('audio track analysis capped', { available: availableStreams.length, analyzed: streams.length })
    if (streams.length === 0) {
      const candidate: AudioCandidate = { id: 'automatic', kind: 'auto', streamIndexes: [], label: 'Automatic audio' }
      const analysis = await this.ffmpeg.analyze(metadata.path, candidate, metadata.durationMs)
      checkpoint()
      return [{ candidate, analysis, score: scoreAudioAnalysis(analysis, undefined, language) }]
    }

    const analyzed: PreparedAudioCandidate[] = []
    for (const stream of streams) {
      checkpoint()
      const candidate = mainCandidate(stream)
      try {
        const analysis = await this.ffmpeg.analyze(metadata.path, candidate, metadata.durationMs)
        analyzed.push({ candidate, analysis, score: scoreAudioAnalysis(analysis, stream, language) })
      } catch (error) {
        this.logger.info('audio track analysis skipped', { stream: stream.ordinal, message: error instanceof Error ? error.message : String(error) })
      }
      checkpoint()
    }
    if (analyzed.length === 0) throw new Error('FFmpeg could not analyze any audio track in this file.')
    analyzed.sort((a, b) => b.score - a.score)

    const best = analyzed[0]!
    const bestStream = streams.find((stream) => stream.index === best.candidate.streamIndexes[0])
    if (bestStream && bestStream.channels >= 2 && (best.analysis.nonSilentRatio < 0.08 || best.analysis.meanVolumeDb < -48)) {
      for (const channel of ['left', 'right'] as const) {
        checkpoint()
        const candidate: AudioCandidate = { ...mainCandidate(bestStream), id: `stream-${bestStream.index}-${channel}`, channel, label: `${mainCandidate(bestStream).label} ${channel} channel` }
        try {
          const analysis = await this.ffmpeg.analyze(metadata.path, candidate, metadata.durationMs)
          analyzed.push({ candidate, analysis, score: scoreAudioAnalysis(analysis, bestStream, language) - 0.02 })
        } catch { /* the regular downmix remains available */ }
        checkpoint()
      }
      analyzed.sort((a, b) => b.score - a.score)
    }

    const firstTwoStreams = analyzed.filter((entry) => !entry.candidate.channel && entry.candidate.kind === 'stream').slice(0, 2)
    if (firstTwoStreams.length === 2) {
      const [first, second] = firstTwoStreams as [PreparedAudioCandidate, PreparedAudioCandidate]
      const firstStream = streams.find((stream) => stream.index === first.candidate.streamIndexes[0])
      const secondStream = streams.find((stream) => stream.index === second.candidate.streamIndexes[0])
      const languagesCompatible = !firstStream?.language || !secondStream?.language || normalizedLanguage(firstStream.language) === normalizedLanguage(secondStream.language)
      if (languagesCompatible && areComplementary(first.analysis, second.analysis, metadata.durationMs)) {
        checkpoint()
        const streamIndexes = [first.candidate.streamIndexes[0]!, second.candidate.streamIndexes[0]!]
        const candidate: AudioCandidate = { id: `mix-${streamIndexes.join('-')}`, kind: 'mix', streamIndexes, label: 'Combined complementary audio' }
        try {
          const analysis = await this.ffmpeg.analyze(metadata.path, candidate, metadata.durationMs)
          analyzed.push({ candidate, analysis, score: Math.max(first.score, second.score) + 0.04 })
          analyzed.sort((a, b) => b.score - a.score)
        } catch { /* individual tracks remain available */ }
        checkpoint()
      }
    }

    if (streams.length > 1 && !analyzed.some((entry) => entry.candidate.kind === 'mix')) {
      const indexes = analyzed.filter((entry) => entry.candidate.kind === 'stream' && !entry.candidate.channel).slice(0, 2).map((entry) => entry.candidate.streamIndexes[0]!)
      if (indexes.length === 2) {
        checkpoint()
        const candidate: AudioCandidate = { id: `mix-${indexes.join('-')}`, kind: 'mix', streamIndexes: indexes, label: 'Combined audio fallback' }
        try {
          const analysis = await this.ffmpeg.analyze(metadata.path, candidate, metadata.durationMs)
          analyzed.push({ candidate, analysis, score: Math.min(...analyzed.map((entry) => entry.score)) - 0.05 })
        } catch { /* individual tracks remain available */ }
        checkpoint()
      }
    }

    const unique = new Map<string, PreparedAudioCandidate>()
    for (const entry of analyzed) if (!unique.has(entry.candidate.id)) unique.set(entry.candidate.id, entry)
    const result = [...unique.values()].slice(0, 4)
    this.logger.info('audio sources resolved', {
      tracks: streams.length,
      candidates: result.length,
      selected: result[0]?.candidate.label ?? 'none',
      nonSilentPercent: Math.round((result[0]?.analysis.nonSilentRatio ?? 0) * 100)
    })
    return result
  }
}
