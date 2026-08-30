import type { MediaMetadata } from '../../shared/types'
import type { ProcessManager } from '../services/ProcessManager'

interface ProbeOutput {
  format?: { duration?: string; format_name?: string }
  streams?: Array<{ codec_type?: string; codec_name?: string; duration?: string }>
}

export function buildFfprobeArgs(inputPath: string): string[] {
  return ['-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,duration', '-of', 'json', inputPath]
}

export class FfprobeAdapter {
  constructor(private readonly executable: () => string, private readonly processes: ProcessManager) {}

  async inspect(path: string, sizeBytes: number, fileName: string): Promise<MediaMetadata> {
    const process = this.processes.spawn('ffprobe', this.executable(), buildFfprobeArgs(path))
    let output = ''
    let diagnostics = ''
    process.child.stdout.on('data', (chunk: Buffer) => { if (output.length < 1_000_000) output += chunk.toString('utf8') })
    process.child.stderr.on('data', (chunk: Buffer) => { if (diagnostics.length < 32_000) diagnostics += chunk.toString('utf8') })
    const result = await process.completed
    if (result.code !== 0) throw new Error(`The selected file could not be read. ${diagnostics.trim()}`)
    let data: ProbeOutput
    try { data = JSON.parse(output) as ProbeOutput } catch { throw new Error('ffprobe returned invalid media metadata') }
    const streams = data.streams ?? []
    const audio = streams.find((stream) => stream.codec_type === 'audio')
    if (!audio) throw new Error('No audio track was found in this file.')
    const video = streams.some((stream) => stream.codec_type === 'video')
    const durationSeconds = Number(data.format?.duration ?? audio.duration ?? 0)
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('The media duration could not be determined.')
    return {
      path, fileName, sizeBytes, durationMs: Math.round(durationSeconds * 1000),
      kind: video ? 'video' : 'audio', audioCodec: audio.codec_name?.toUpperCase() ?? 'Audio',
      formatName: data.format?.format_name?.split(',')[0]?.toUpperCase() ?? 'Media'
    }
  }
}
