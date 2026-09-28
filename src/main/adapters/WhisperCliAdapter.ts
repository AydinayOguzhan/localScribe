import { readFile } from 'node:fs/promises'
import type { HardwareAcceleration, LanguageId, TranscriptResult, TranscriptSegment } from '../../shared/types'
import type { ProcessManager } from '../services/ProcessManager'

export interface WhisperOptions {
  audioPath: string
  modelPath: string
  outputPrefix: string
  threads: number
  language: LanguageId | string
  acceleration: HardwareAcceleration
  vadModelPath: string
  resetContext?: boolean
}

export interface WhisperMetrics {
  averageTokenProbability?: number
  tokenCount: number
}

export interface WhisperTranscriptionOutput {
  result: TranscriptResult
  metrics: WhisperMetrics
}

export interface WhisperLanguageOptions {
  audioPath: string
  modelPath: string
  threads: number
  acceleration: HardwareAcceleration
  vadModelPath: string
}

function vadArgs(vadModelPath: string): string[] {
  return ['--vad', '-vm', vadModelPath, '-vt', '0.5', '-vspd', '250', '-vsd', '500', '-vmsd', '100', '-vp', '250', '-vo', '0.1']
}

export function buildWhisperArgs(options: WhisperOptions): string[] {
  const args = [
    '-m', options.modelPath, '-f', options.audioPath, '-t', String(options.threads),
    '-l', options.language, '-ojf', '-of', options.outputPrefix, '-np', '-pp',
    ...vadArgs(options.vadModelPath)
  ]
  if (options.resetContext) args.push('-mc', '0')
  if (options.acceleration === 'cpu') args.push('-ng')
  return args
}

export function buildWhisperLanguageArgs(options: WhisperLanguageOptions): string[] {
  const args = [
    '-m', options.modelPath, '-f', options.audioPath, '-t', String(options.threads),
    '-l', 'auto', '-dl', ...vadArgs(options.vadModelPath)
  ]
  if (options.acceleration === 'cpu') args.push('-ng')
  return args
}

export function parseDetectedLanguage(text: string): { language: string; probability?: number } | null {
  const matches = [...text.matchAll(/auto-detected language:\s*([a-z]{2,3})(?:\s*\(p\s*=\s*([\d.]+)\))?/gi)]
  const match = matches.at(-1)
  if (!match?.[1]) return null
  const probability = match[2] === undefined ? undefined : Number(match[2])
  return { language: match[1].toLowerCase(), ...(Number.isFinite(probability) ? { probability } : {}) }
}

export function parseWhisperProgress(text: string): number | null {
  const matches = [...text.matchAll(/progress\s*=\s*(\d{1,3})%/gi)]
  const last = matches.at(-1)?.[1]
  return last ? Math.min(100, Number(last)) : null
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const match = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/.exec(value)
  if (!match) return null
  return (Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000 + Number(match[4])
}

interface WhisperJsonSegment {
  text?: string
  offsets?: { from?: number; to?: number }
  timestamps?: { from?: string; to?: string }
  tokens?: Array<{ text?: string; p?: number }>
}

interface WhisperJson {
  result?: { language?: string }
  transcription?: WhisperJsonSegment[]
}

export function parseWhisperJson(input: string, durationMs: number): TranscriptResult {
  const data = JSON.parse(input) as WhisperJson
  const segments: TranscriptSegment[] = (data.transcription ?? []).map((segment) => {
    const startMs = parseTimestamp(segment.offsets?.from) ?? parseTimestamp(segment.timestamps?.from) ?? 0
    const endMs = parseTimestamp(segment.offsets?.to) ?? parseTimestamp(segment.timestamps?.to) ?? startMs
    return { startMs, endMs, text: (segment.text ?? '').trim() }
  }).filter((segment) => segment.text.length > 0)
  return { language: data.result?.language, durationMs, segments }
}

export function parseWhisperOutput(input: string, durationMs: number): WhisperTranscriptionOutput {
  const data = JSON.parse(input) as WhisperJson
  const probabilities = (data.transcription ?? []).flatMap((segment) => segment.tokens ?? [])
    .map((token) => token.p)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
  return {
    result: parseWhisperJson(input, durationMs),
    metrics: {
      tokenCount: probabilities.length,
      ...(probabilities.length > 0 ? { averageTokenProbability: probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length } : {})
    }
  }
}

export class WhisperCliAdapter {
  constructor(private readonly executable: () => string, private readonly processes: ProcessManager) {}

  async detectLanguage(options: WhisperLanguageOptions): Promise<{ language: string; probability?: number } | null> {
    const process = this.processes.spawn('whisper', this.executable(), buildWhisperLanguageArgs(options))
    let diagnostics = ''
    const collect = (chunk: Buffer): void => { diagnostics = `${diagnostics}${chunk.toString('utf8')}`.slice(-64_000) }
    process.child.stdout.on('data', collect)
    process.child.stderr.on('data', collect)
    const result = await process.completed
    if (result.code !== 0) throw new Error(`LocalScribe could not detect the spoken language. ${diagnostics.trim()}`)
    return parseDetectedLanguage(diagnostics)
  }

  async transcribe(options: WhisperOptions, durationMs: number, onProgress: (percent: number) => void): Promise<WhisperTranscriptionOutput> {
    const process = this.processes.spawn('whisper', this.executable(), buildWhisperArgs(options))
    let diagnostics = ''
    const handleOutput = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      diagnostics = `${diagnostics}${text}`.slice(-64_000)
      const progress = parseWhisperProgress(text)
      if (progress !== null) onProgress(progress)
    }
    process.child.stdout.on('data', handleOutput)
    process.child.stderr.on('data', handleOutput)
    const result = await process.completed
    if (result.code !== 0) throw new Error(`LocalScribe could not start the transcription engine. ${diagnostics.trim()}`)
    const json = await readFile(`${options.outputPrefix}.json`, 'utf8')
    return parseWhisperOutput(json, durationMs)
  }
}
