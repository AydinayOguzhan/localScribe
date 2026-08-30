import type { ProcessManager } from '../services/ProcessManager'

export function buildFfmpegArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', inputPath,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav',
    '-progress', 'pipe:2', '-nostats', outputPath
  ]
}

export function parseFfmpegProgress(line: string): number | null {
  const match = /^(?:out_time_us|out_time_ms)=(\d+)$/.exec(line.trim())
  return match?.[1] ? Math.round(Number(match[1]) / 1000) : null
}

export class FfmpegAdapter {
  constructor(private readonly executable: () => string, private readonly processes: ProcessManager) {}

  async extract(inputPath: string, outputPath: string, onProgress: (processedMs: number) => void): Promise<void> {
    const process = this.processes.spawn('ffmpeg', this.executable(), buildFfmpegArgs(inputPath, outputPath))
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
