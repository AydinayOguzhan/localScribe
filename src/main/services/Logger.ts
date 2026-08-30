import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { PathService } from './PathService'

export class Logger {
  private readonly file: string
  private queue = Promise.resolve()
  constructor(private readonly paths: PathService) { this.file = join(paths.logs, 'localscribe.log') }

  info(message: string, data?: Record<string, unknown>): void { this.write('INFO', message, data) }
  error(message: string, data?: Record<string, unknown>): void { this.write('ERROR', message, data) }

  private write(level: string, message: string, data?: Record<string, unknown>): void {
    const safe = data ? Object.fromEntries(Object.entries(data).map(([key, value]) => [key, this.redact(value)])) : undefined
    const line = `${new Date().toISOString()} ${level} ${message}${safe ? ` ${JSON.stringify(safe)}` : ''}\n`
    this.queue = this.queue.then(async () => {
      await mkdir(this.paths.logs, { recursive: true })
      try {
        if ((await stat(this.file)).size > 2_000_000) {
          await rm(`${this.file}.1`, { force: true })
          await rename(this.file, `${this.file}.1`)
        }
      } catch { /* a missing log is expected on first run */ }
      await appendFile(this.file, line, 'utf8')
    }).catch(() => undefined)
  }

  private redact(value: unknown): unknown {
    if (typeof value !== 'string') return value
    if (value.includes('/') || value.includes('\\')) return basename(value)
    return value
  }
}
