import { access, chmod, mkdir, rename, rm, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArtifactDefinition, DownloadProgress, SetupStatus, SupportedPlatform } from '../../shared/types'
import { modelList } from '../manifests/modelManifest'
import { getRuntimeArtifacts, isVadArtifact, isWhisperArtifact, MEDIA_VERSION } from '../manifests/runtimeManifest'
import { verifyChecksum } from '../utils/checksum'
import { extractExpectedZipFiles } from '../utils/extractZip'
import type { DownloadManager } from './DownloadManager'
import type { InstallationStore } from './InstallationStore'
import type { Logger } from './Logger'
import type { PathService } from './PathService'
import type { SettingsService } from './SettingsService'

export class RuntimeManager {
  constructor(
    private readonly platform: SupportedPlatform | null,
    private readonly paths: PathService,
    private readonly downloads: DownloadManager,
    private readonly installations: InstallationStore,
    private readonly settings: SettingsService,
    private readonly logger: Logger
  ) {}

  async getStatus(): Promise<SetupStatus> {
    const runtimeReady = this.platform ? (await Promise.all(getRuntimeArtifacts(this.platform).map((item) => this.isValid(item)))).every(Boolean) : false
    const installed = this.installations.get().models
    const installedModelIds = (await Promise.all(modelList.map(async (model) => {
      const item = installed[model.id]
      if (!item) return null
      const expectedPath = this.paths.modelFile(model.fileName)
      if (item.path !== expectedPath || item.checksum.value !== model.checksum.value) return null
      try { return (await stat(expectedPath)).size === model.downloadSize ? model.id : null } catch { return null }
    }))).filter((id): id is SetupStatus['installedModelIds'][number] => id !== null) as SetupStatus['installedModelIds']
    const activeModel = this.settings.get().activeModel
    return {
      setupComplete: this.settings.get().setupComplete && runtimeReady && activeModel !== null && installedModelIds.includes(activeModel),
      supported: this.platform !== null,
      runtimeReady,
      installedModelIds,
      activeModel,
      runtimeVersion: this.platform ? getRuntimeArtifacts(this.platform).find(isWhisperArtifact)?.version ?? 'Unavailable' : 'Unsupported',
      mediaVersion: MEDIA_VERSION
    }
  }

  async install(onProgress: (progress: DownloadProgress) => void, force = false): Promise<SetupStatus> {
    if (!this.platform) throw new Error(`LocalScribe does not support ${process.platform} ${process.arch}`)
    for (const artifact of getRuntimeArtifacts(this.platform)) {
      if (!force && await this.isValid(artifact)) {
        onProgress({ artifactId: artifact.id, stage: 'complete', downloadedBytes: artifact.downloadSize, totalBytes: artifact.downloadSize, percent: 100, bytesPerSecond: 0 })
        continue
      }
      await this.installArtifact(artifact, onProgress)
    }
    return this.getStatus()
  }

  cancel(): void {
    if (!this.platform) return
    for (const artifact of getRuntimeArtifacts(this.platform)) this.downloads.cancel(artifact.id)
  }

  async verifyAndRepair(onProgress: (progress: DownloadProgress) => void): Promise<SetupStatus> {
    if (!this.platform) return this.getStatus()
    for (const artifact of getRuntimeArtifacts(this.platform)) {
      const archive = join(this.paths.downloads, `${artifact.id}-${artifact.version}.archive`)
      const checksumTarget = artifact.archiveType === 'none'
        ? join(this.paths.artifactDirectory(artifact.id, artifact.version), artifact.expectedFiles[0]!)
        : archive
      let valid = false
      try { valid = await verifyChecksum(checksumTarget, artifact.checksum) } catch { valid = false }
      if (!valid || !(await this.isValid(artifact))) await this.installArtifact(artifact, onProgress)
    }
    return this.getStatus()
  }

  async isValid(artifact: ArtifactDefinition): Promise<boolean> {
    const installed = this.installations.get().artifacts[artifact.id]
    if (!installed || installed.version !== artifact.version || installed.checksum.value !== artifact.checksum.value) return false
    const expectedPath = this.paths.artifactDirectory(artifact.id, artifact.version)
    if (installed.path !== expectedPath) return false
    try {
      for (const relative of artifact.expectedFiles) await access(join(expectedPath, relative))
      return true
    } catch { return false }
  }

  getExecutable(kind: 'ffmpeg' | 'ffprobe' | 'whisper'): string {
    if (!this.platform) throw new Error('Unsupported platform')
    const artifacts = getRuntimeArtifacts(this.platform)
    const artifact = kind === 'whisper'
      ? artifacts.find(isWhisperArtifact)
      : artifacts.find((item) => item.expectedFiles.some((file) => file.toLowerCase().includes(kind)))
    if (!artifact) throw new Error(`${kind} is not available for this platform`)
    const relative = artifact.expectedFiles.find((file) => file.toLowerCase().includes(kind))
    if (!relative) throw new Error(`${kind} executable is missing from the runtime manifest`)
    return join(this.paths.artifactDirectory(artifact.id, artifact.version), relative)
  }

  getVadModelPath(): string {
    if (!this.platform) throw new Error('Unsupported platform')
    const artifact = getRuntimeArtifacts(this.platform).find(isVadArtifact)
    const relative = artifact?.expectedFiles[0]
    if (!artifact || !relative) throw new Error('The voice activity detection model is missing from the runtime manifest')
    return join(this.paths.artifactDirectory(artifact.id, artifact.version), relative)
  }

  private async installArtifact(artifact: ArtifactDefinition, onProgress: (progress: DownloadProgress) => void): Promise<void> {
    const archive = join(this.paths.downloads, `${artifact.id}-${artifact.version}.archive`)
    const partial = this.paths.partialFile(`${artifact.id}-${artifact.version}`)
    this.logger.info('runtime download started', { artifact: artifact.id, version: artifact.version })
    await this.downloads.download(artifact, partial, archive, onProgress)
    onProgress({ artifactId: artifact.id, stage: 'extracting', downloadedBytes: artifact.downloadSize, totalBytes: artifact.downloadSize, percent: 100, bytesPerSecond: 0 })
    const target = this.paths.artifactDirectory(artifact.id, artifact.version)
    const staging = `${target}.installing`
    await rm(staging, { recursive: true, force: true })
    await mkdir(staging, { recursive: true })
    if (artifact.archiveType === 'zip') {
      await extractExpectedZipFiles(archive, staging, artifact.expectedFiles, {
        maxEntries: 50_000,
        maxUncompressedBytes: artifact.installedSize + 16 * 1024 ** 2
      })
    }
    else await rename(archive, join(staging, artifact.expectedFiles[0]!))
    onProgress({ artifactId: artifact.id, stage: 'validating', downloadedBytes: artifact.downloadSize, totalBytes: artifact.downloadSize, percent: 100, bytesPerSecond: 0 })
    for (const relative of artifact.expectedFiles) await access(join(staging, relative))
    for (const relative of artifact.executableFiles) {
      if (process.platform !== 'win32') await chmod(join(staging, relative), 0o755)
    }
    await rm(target, { recursive: true, force: true })
    await mkdir(join(target, '..'), { recursive: true })
    await rename(staging, target)
    await this.installations.mutate((value) => {
      value.artifacts[artifact.id] = {
        id: artifact.id, version: artifact.version, path: target,
        size: artifact.installedSize, checksum: artifact.checksum, verifiedAt: new Date().toISOString()
      }
    })
    onProgress({ artifactId: artifact.id, stage: 'complete', downloadedBytes: artifact.downloadSize, totalBytes: artifact.downloadSize, percent: 100, bytesPerSecond: 0 })
    this.logger.info('runtime installed', { artifact: artifact.id })
    try { await unlink(partial) } catch { /* no partial remains after successful rename */ }
  }
}
