import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { PathService } from './PathService'

export class TempFileService {
  constructor(private readonly paths: PathService) {}

  async create(jobId: string): Promise<string> {
    const directory = this.paths.jobDirectory(jobId)
    this.paths.assertWithinTemp(directory)
    await mkdir(directory, { recursive: false })
    return directory
  }

  async remove(directory: string): Promise<void> {
    this.paths.assertWithinTemp(directory)
    await rm(directory, { recursive: true, force: true })
  }

  async cleanAbandoned(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
    await mkdir(this.paths.temp, { recursive: true })
    const now = Date.now()
    for (const entry of await readdir(this.paths.temp, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const candidate = join(this.paths.temp, entry.name)
      this.paths.assertWithinTemp(candidate)
      try {
        if (now - (await stat(candidate)).mtimeMs > maxAgeMs) await this.remove(candidate)
      } catch { /* another cleanup may have removed it */ }
    }
  }

  async cleanAll(): Promise<void> {
    await mkdir(this.paths.temp, { recursive: true })
    for (const entry of await readdir(this.paths.temp, { withFileTypes: true })) {
      if (entry.isDirectory()) await this.remove(join(this.paths.temp, entry.name))
    }
  }
}
