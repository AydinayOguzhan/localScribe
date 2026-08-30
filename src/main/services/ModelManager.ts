import { stat, unlink } from 'node:fs/promises'
import type { ArtifactDefinition, DownloadProgress, ModelId, ModelState, ModelView, SystemInfo } from '../../shared/types'
import { modelList, modelManifest } from '../manifests/modelManifest'
import { verifyChecksum } from '../utils/checksum'
import type { DownloadManager } from './DownloadManager'
import type { InstallationStore } from './InstallationStore'
import type { Logger } from './Logger'
import type { PathService } from './PathService'
import type { SettingsService } from './SettingsService'

export class ModelManager {
  private readonly transient = new Map<ModelId, ModelState>()
  constructor(
    private readonly paths: PathService,
    private readonly downloads: DownloadManager,
    private readonly installations: InstallationStore,
    private readonly settings: SettingsService,
    private readonly systemInfo: () => Promise<SystemInfo>,
    private readonly isInUse: (modelId: ModelId) => boolean,
    private readonly logger: Logger
  ) {}

  async list(): Promise<ModelView[]> {
    const active = this.settings.get().activeModel
    const system = await this.systemInfo()
    return Promise.all(modelList.map(async (model) => {
      const temporary = this.transient.get(model.id)
      const ready = await this.isValid(model.id)
      const state: ModelState = temporary ?? (ready ? (active === model.id ? 'ACTIVE' : 'READY') : 'NOT_INSTALLED')
      const warning = model.memoryBytes > system.totalMemoryBytes * 0.65
        ? `May use around ${this.formatBytes(model.memoryBytes)} of memory on a ${this.formatBytes(system.totalMemoryBytes)} system.`
        : undefined
      return { ...model, state, warning }
    }))
  }

  async download(modelId: ModelId, onProgress: (progress: DownloadProgress) => void): Promise<ModelView[]> {
    const model = modelManifest[modelId]
    if (await this.isValid(modelId)) return this.select(modelId)
    const artifactId = `model-${model.id}`
    if (this.downloads.isDownloading(artifactId)) {
      this.transient.set(modelId, 'DOWNLOADING')
      throw new Error(`${model.name} model is already downloading`)
    }
    this.transient.set(modelId, 'DOWNLOADING')
    const artifact: ArtifactDefinition = {
      id: artifactId, version: '1', label: `${model.name} model`, description: model.description,
      url: model.url, allowedHosts: model.allowedHosts, archiveType: 'none', downloadSize: model.downloadSize,
      installedSize: model.downloadSize, checksum: model.checksum, expectedFiles: [model.fileName], executableFiles: [], source: 'ggerganov/whisper.cpp on Hugging Face'
    }
    const partial = this.paths.partialFile(artifact.id)
    const final = this.paths.modelFile(model.fileName)
    try {
      await this.downloads.download(artifact, partial, final, (progress) => {
        this.transient.set(modelId, progress.stage === 'verifying' ? 'VERIFYING' : 'DOWNLOADING')
        onProgress(progress)
      })
      await this.installations.mutate((value) => {
        value.models[modelId] = {
          id: artifact.id, version: artifact.version, path: final, size: model.downloadSize,
          checksum: model.checksum, verifiedAt: new Date().toISOString()
        }
      })
      this.transient.delete(modelId)
      this.logger.info('model installed', { model: modelId })
      return this.select(modelId)
    } catch (error) {
      const cancelled = error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message))
      const alreadyDownloading = error instanceof Error && /already downloading/i.test(error.message)
      if (cancelled) this.transient.delete(modelId)
      else if (!alreadyDownloading) this.transient.set(modelId, 'ERROR')
      throw error
    }
  }

  cancel(modelId: ModelId): void {
    this.downloads.cancel(`model-${modelId}`)
    this.transient.delete(modelId)
  }

  async select(modelId: ModelId): Promise<ModelView[]> {
    if (!(await this.isValid(modelId))) throw new Error(`${modelManifest[modelId].name} is not installed`)
    await this.settings.update({ activeModel: modelId })
    return this.list()
  }

  async delete(modelId: ModelId): Promise<ModelView[]> {
    if (this.isInUse(modelId)) throw new Error('This model is being used by the active transcription')
    const installed = this.installations.get().models[modelId]
    if (installed) {
      const expectedPath = this.paths.modelFile(modelManifest[modelId].fileName)
      try { await unlink(expectedPath) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    await this.installations.mutate((value) => { delete value.models[modelId] })
    if (this.settings.get().activeModel === modelId) await this.settings.update({ activeModel: null })
    return this.list()
  }

  async repair(modelId: ModelId, onProgress: (progress: DownloadProgress) => void): Promise<ModelView[]> {
    const installed = this.installations.get().models[modelId]
    if (installed) {
      const expectedPath = this.paths.modelFile(modelManifest[modelId].fileName)
      try {
        if (installed.path === expectedPath && await verifyChecksum(expectedPath, modelManifest[modelId].checksum)) return this.list()
      } catch { /* download below replaces missing or invalid file */ }
      await this.delete(modelId)
    }
    return this.download(modelId, onProgress)
  }

  async isValid(modelId: ModelId): Promise<boolean> {
    const model = modelManifest[modelId]
    const installed = this.installations.get().models[modelId]
    const expectedPath = this.paths.modelFile(model.fileName)
    if (!installed || installed.path !== expectedPath || installed.checksum.value !== model.checksum.value) return false
    try { return (await stat(expectedPath)).size === model.downloadSize } catch { return false }
  }

  modelPath(modelId: ModelId): string { return this.paths.modelFile(modelManifest[modelId].fileName) }
  private formatBytes(value: number): string { return `${(value / 1024 ** 3).toFixed(1)} GB` }
}
