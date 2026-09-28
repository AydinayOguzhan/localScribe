import type { ProcessManager } from '../services/ProcessManager'

export type AudioChannel = 'left' | 'right'

export interface AudioCandidate {
  id: string
  kind: 'auto' | 'stream' | 'mix'
  streamIndexes: number[]
  channel?: AudioChannel
  label: string
}

export interface AudioAnalysis {
  candidate: AudioCandidate
  nonSilentRatio: number
  meanVolumeDb: number
  maxVolumeDb: number
  silenceIntervalsMs: Array<[number, number]>
}

const analysisFilter = 'silencedetect=noise=-45dB:d=0.4,volumedetect'

function sourceFilter(candidate: AudioCandidate, suffix = ''): { mapArgs: string[]; filterArgs: string[] } {
  if (candidate.kind === 'mix') {
    const inputs = candidate.streamIndexes.map((index, position) => `[0:${index}]loudnorm=I=-24:TP=-2:LRA=11[m${position}]`).join(';')
    const labels = candidate.streamIndexes.map((_index, position) => `[m${position}]`).join('')
    return {
      mapArgs: ['-map', '[mixed]'],
      filterArgs: ['-filter_complex', `${inputs};${labels}amix=inputs=${candidate.streamIndexes.length}:duration=longest:dropout_transition=0:normalize=1${suffix}[mixed]`]
    }
  }
  const mapArgs = candidate.kind === 'stream' && candidate.streamIndexes[0] !== undefined
    ? ['-map', `0:${candidate.streamIndexes[0]}`]
    : []
  const channel = candidate.channel === 'left' ? 'pan=mono|c0=c0' : candidate.channel === 'right' ? 'pan=mono|c0=c1' : ''
  const filter = [channel, suffix.replace(/^,/, '')].filter(Boolean).join(',')
  return { mapArgs, filterArgs: filter ? ['-af', filter] : [] }
}

export function buildFfmpegArgs(inputPath: string, outputPath: string, candidate: AudioCandidate = {
  id: 'auto', kind: 'auto', streamIndexes: [], label: 'Automatic audio'
}): string[] {
  const source = sourceFilter(candidate)
  return [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', inputPath,
    ...source.filterArgs, ...source.mapArgs,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav',
    '-progress', 'pipe:2', '-nostats', outputPath
  ]
}

export function buildFfmpegAnalysisArgs(inputPath: string, candidate: AudioCandidate): string[] {
  const source = sourceFilter(candidate, `,${analysisFilter}`)
  return [
    '-hide_banner', '-loglevel', 'info', '-nostdin', '-i', inputPath,
    ...source.filterArgs, ...source.mapArgs,
    '-vn', '-ac', '1', '-ar', '16000', '-f', 'null', '-'
  ]
}

export function parseFfmpegProgress(line: string): number | null {
  const match = /^(?:out_time_us|out_time_ms)=(\d+)$/.exec(line.trim())
  return match?.[1] ? Math.round(Number(match[1]) / 1000) : null
}

export function parseVolumeDb(line: string, kind: 'mean' | 'max'): number | null {
  const match = new RegExp(`${kind}_volume:\\s*(-?(?:\\d+(?:\\.\\d+)?|inf))\\s*dB`, 'i').exec(line)
  if (!match?.[1]) return null
  return match[1].toLowerCase() === '-inf' ? Number.NEGATIVE_INFINITY : Number(match[1])
}

export class FfmpegAdapter {
  constructor(private readonly executable: () => string, private readonly processes: ProcessManager) {}

  async analyze(inputPath: string, candidate: AudioCandidate, durationMs: number): Promise<AudioAnalysis> {
    const process = this.processes.spawn('ffmpeg', this.executable(), buildFfmpegAnalysisArgs(inputPath, candidate))
    let remainder = ''
    let diagnostics = ''
    let openSilenceMs: number | null = null
    let meanVolumeDb = Number.NEGATIVE_INFINITY
    let maxVolumeDb = Number.NEGATIVE_INFINITY
    const silenceIntervalsMs: Array<[number, number]> = []
    const handleLine = (line: string): void => {
      const start = /silence_start:\s*(-?\d+(?:\.\d+)?)/i.exec(line)?.[1]
      if (start !== undefined) openSilenceMs = Math.max(0, Number(start) * 1000)
      const end = /silence_end:\s*(-?\d+(?:\.\d+)?)/i.exec(line)?.[1]
      if (end !== undefined && openSilenceMs !== null) {
        silenceIntervalsMs.push([openSilenceMs, Math.min(durationMs, Math.max(openSilenceMs, Number(end) * 1000))])
        openSilenceMs = null
      }
      meanVolumeDb = parseVolumeDb(line, 'mean') ?? meanVolumeDb
      maxVolumeDb = parseVolumeDb(line, 'max') ?? maxVolumeDb
    }
    process.child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      diagnostics = `${diagnostics}${text}`.slice(-32_000)
      const lines = `${remainder}${text}`.split(/\r?\n/)
      remainder = lines.pop() ?? ''
      for (const line of lines) handleLine(line)
    })
    const result = await process.completed
    if (remainder) handleLine(remainder)
    if (result.code !== 0) throw new Error(`FFmpeg could not analyze this audio track. ${diagnostics.trim()}`)
    if (openSilenceMs !== null) silenceIntervalsMs.push([openSilenceMs, durationMs])
    const silentMs = silenceIntervalsMs.reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0)
    return {
      candidate,
      nonSilentRatio: durationMs > 0 ? Math.max(0, Math.min(1, 1 - silentMs / durationMs)) : 0,
      meanVolumeDb,
      maxVolumeDb,
      silenceIntervalsMs
    }
  }

  async extract(inputPath: string, outputPath: string, candidate: AudioCandidate, onProgress: (processedMs: number) => void): Promise<void> {
    const process = this.processes.spawn('ffmpeg', this.executable(), buildFfmpegArgs(inputPath, outputPath, candidate))
    let remainder = ''
    let diagnostics = ''
    process.child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      diagnostics = `${diagnostics}${text}`.slice(-32_000)
      const lines = `${remainder}${text}`.split(/\r?\n/)
      remainder = lines.pop() ?? ''
      for (const line of lines) {
        const progress = parseFfmpegProgress(line)
        if (progress !== null) onProgress(progress)
      }
    })
    const result = await process.completed
    if (result.code !== 0) throw new Error(`FFmpeg could not process this media file. ${diagnostics.trim()}`)
  }
}
