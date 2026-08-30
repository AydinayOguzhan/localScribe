import { access, mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { modelManifest } from '../src/main/manifests/modelManifest'
import { DownloadManager } from '../src/main/services/DownloadManager'
import { InstallationStore } from '../src/main/services/InstallationStore'
import { Logger } from '../src/main/services/Logger'
import { ModelManager } from '../src/main/services/ModelManager'
import { PathService } from '../src/main/services/PathService'
import { SettingsService } from '../src/main/services/SettingsService'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

describe('ModelManager state', () => {
  it('detects installed, active, and manually deleted model files without hashing at startup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'localscribe-model-')); directories.push(directory)
    const paths = new PathService(directory); await mkdir(paths.models, { recursive: true })
    const settings = new SettingsService(paths); const installations = new InstallationStore(paths)
    await Promise.all([settings.load(), installations.load()])
    const model = modelManifest.tiny; const file = paths.modelFile(model.fileName)
    await writeFile(file, '')
    await truncate(file, model.downloadSize)
    await installations.mutate((value) => { value.models.tiny = { id: 'model-tiny', version: '1', path: file, size: model.downloadSize, checksum: model.checksum, verifiedAt: new Date().toISOString() } })
    const manager = new ModelManager(paths, new DownloadManager(), installations, settings, async () => ({ platform: 'darwin', architecture: 'arm64', supportedPlatform: 'darwin-arm64', osName: 'macOS', cpuModel: 'Test', logicalCpuCount: 8, totalMemoryBytes: 16 * 1024 ** 3, freeDiskBytes: 10 ** 9, acceleration: 'Metal', deviceLabel: 'Mac' }), () => false, new Logger(paths))
    expect((await manager.list()).find((item) => item.id === 'tiny')?.state).toBe('READY')
    await manager.select('tiny')
    expect((await manager.list()).find((item) => item.id === 'tiny')?.state).toBe('ACTIVE')
    await rm(file)
    expect((await manager.list()).find((item) => item.id === 'tiny')?.state).toBe('NOT_INSTALLED')
  })

  it('does not turn an active download into an error when a duplicate request arrives', async () => {
    class BusyDownloadManager extends DownloadManager {
      override isDownloading(): boolean { return true }
    }
    const directory = await mkdtemp(join(tmpdir(), 'localscribe-model-')); directories.push(directory)
    const paths = new PathService(directory)
    const settings = new SettingsService(paths); const installations = new InstallationStore(paths)
    await Promise.all([settings.load(), installations.load()])
    const manager = new ModelManager(paths, new BusyDownloadManager(), installations, settings, async () => ({ platform: 'darwin', architecture: 'arm64', supportedPlatform: 'darwin-arm64', osName: 'macOS', cpuModel: 'Test', logicalCpuCount: 8, totalMemoryBytes: 16 * 1024 ** 3, freeDiskBytes: 10 ** 9, acceleration: 'Metal', deviceLabel: 'Mac' }), () => false, new Logger(paths))
    await expect(manager.download('small', () => undefined)).rejects.toThrow(/already downloading/)
    expect((await manager.list()).find((item) => item.id === 'small')?.state).toBe('DOWNLOADING')
  })

  it('never deletes a path injected through local installation metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'localscribe-model-')); directories.push(directory)
    const paths = new PathService(directory); await mkdir(paths.models, { recursive: true })
    const settings = new SettingsService(paths); const installations = new InstallationStore(paths)
    await Promise.all([settings.load(), installations.load()])
    const unrelated = join(directory, 'unrelated.txt'); await writeFile(unrelated, 'keep me')
    const model = modelManifest.tiny
    await installations.mutate((value) => {
      value.models.tiny = {
        id: 'model-tiny', version: '1', path: unrelated, size: model.downloadSize,
        checksum: model.checksum, verifiedAt: new Date().toISOString()
      }
    })
    const manager = new ModelManager(paths, new DownloadManager(), installations, settings, async () => ({ platform: 'darwin', architecture: 'arm64', supportedPlatform: 'darwin-arm64', osName: 'macOS', cpuModel: 'Test', logicalCpuCount: 8, totalMemoryBytes: 16 * 1024 ** 3, freeDiskBytes: 10 ** 9, acceleration: 'Metal', deviceLabel: 'Mac' }), () => false, new Logger(paths))
    await manager.delete('tiny')
    await expect(access(unrelated)).resolves.toBeUndefined()
  })
})
