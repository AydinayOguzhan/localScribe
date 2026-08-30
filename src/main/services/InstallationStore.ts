import { readFile } from 'node:fs/promises'
import type { InstalledComponents } from '../../shared/types'
import { writeJsonAtomic } from '../utils/atomicFile'
import type { PathService } from './PathService'

const empty: InstalledComponents = { schemaVersion: 1, artifacts: {}, models: {} }

export class InstallationStore {
  private value: InstalledComponents = structuredClone(empty)
  constructor(private readonly paths: PathService) {}

  async load(): Promise<InstalledComponents> {
    try {
      const parsed = JSON.parse(await readFile(this.paths.installedFile, 'utf8')) as InstalledComponents
      this.value = { schemaVersion: 1, artifacts: parsed.artifacts ?? {}, models: parsed.models ?? {} }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return this.get()
  }

  get(): InstalledComponents { return structuredClone(this.value) }
  async mutate(change: (value: InstalledComponents) => void): Promise<void> {
    change(this.value)
    await writeJsonAtomic(this.paths.installedFile, this.value)
  }
}
