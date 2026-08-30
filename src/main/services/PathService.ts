import { join, resolve, sep } from 'node:path'

export class PathService {
  readonly root: string
  readonly runtime: string
  readonly ffmpeg: string
  readonly whisper: string
  readonly models: string
  readonly temp: string
  readonly config: string
  readonly logs: string
  readonly downloads: string

  constructor(userDataPath: string) {
    this.root = userDataPath
    this.runtime = join(this.root, 'runtime')
    this.ffmpeg = join(this.runtime, 'ffmpeg')
    this.whisper = join(this.runtime, 'whisper')
    this.models = join(this.root, 'models')
    this.temp = join(this.root, 'temp')
    this.config = join(this.root, 'config')
    this.logs = join(this.root, 'logs')
    this.downloads = join(this.root, 'downloads')
  }

  get settingsFile(): string { return join(this.config, 'settings.json') }
  get installedFile(): string { return join(this.config, 'installed-components.json') }

  artifactDirectory(id: string, version: string): string {
    const base = id.startsWith('whisper-') ? this.whisper : this.ffmpeg
    return join(base, version, id)
  }

  modelFile(fileName: string): string { return join(this.models, fileName) }
  jobDirectory(jobId: string): string { return join(this.temp, jobId) }
  partialFile(id: string): string { return join(this.downloads, `${id}.part`) }

  assertWithinTemp(candidate: string): void {
    const root = `${resolve(this.temp)}${sep}`
    if (!`${resolve(candidate)}${sep}`.startsWith(root)) throw new Error('Refusing to operate outside LocalScribe temporary storage')
  }
}
