import { readFile } from 'node:fs/promises'
import type { AppSettings } from '../../shared/types'
import { writeJsonAtomic } from '../utils/atomicFile'
import type { PathService } from './PathService'

export const defaultSettings: AppSettings = {
  schemaVersion: 1,
  setupComplete: false,
  activeModel: null,
  performanceProfile: 'balanced',
  hardwareAcceleration: 'auto',
  defaultLanguage: 'auto',
  timestamps: true
}

export class SettingsService {
  private value: AppSettings = { ...defaultSettings }

  constructor(private readonly paths: PathService) {}

  async load(): Promise<AppSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.paths.settingsFile, 'utf8')) as Partial<AppSettings>
      this.value = { ...defaultSettings, ...parsed, schemaVersion: 1 }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return this.get()
  }

  get(): AppSettings { return structuredClone(this.value) }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const allowed: Array<keyof AppSettings> = [
      'setupComplete', 'activeModel', 'performanceProfile', 'hardwareAcceleration',
      'defaultLanguage', 'timestamps', 'windowBounds'
    ]
    for (const key of allowed) {
      const next = patch[key]
      if (next !== undefined) Object.assign(this.value, { [key]: next })
    }
    await writeJsonAtomic(this.paths.settingsFile, this.value)
    return this.get()
  }
}
