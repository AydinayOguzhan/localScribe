import type { TranscriptResult, TranscriptSegment } from './types'

export function formatClock(milliseconds: number, separator = '.'): string {
  const value = Math.max(0, Math.round(milliseconds))
  const hours = Math.floor(value / 3_600_000)
  const minutes = Math.floor(value % 3_600_000 / 60_000)
  const seconds = Math.floor(value % 60_000 / 1000)
  const millis = value % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`
}

export function formatShortClock(milliseconds: number): string {
  return formatClock(milliseconds).replace(/\.\d{3}$/, '')
}

export function toTxt(result: TranscriptResult, timestamps: boolean): string {
  return result.segments.map((segment) => timestamps ? `[${formatShortClock(segment.startMs)}] ${segment.text}` : segment.text).join('\n') + '\n'
}

export function toSrt(result: TranscriptResult): string {
  return result.segments.map((segment, index) => `${index + 1}\n${formatClock(segment.startMs, ',')} --> ${formatClock(segment.endMs, ',')}\n${segment.text}`).join('\n\n') + '\n'
}

export function toVtt(result: TranscriptResult): string {
  return `WEBVTT\n\n${result.segments.map((segment) => `${formatClock(segment.startMs)} --> ${formatClock(segment.endMs)}\n${segment.text}`).join('\n\n')}\n`
}

export function withEditedSegments(result: TranscriptResult, segments: TranscriptSegment[]): TranscriptResult {
  return { ...result, segments }
}
