import { clipboard, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { IPC } from '../../shared/ipc'
import type { AppSettings, DownloadProgress, FriendlyError, ModelId, TranscriptionCompleted, TranscriptionProgress } from '../../shared/types'
import type { JobManager } from '../services/JobManager'
import type { MediaService } from '../services/MediaService'
import type { ModelManager } from '../services/ModelManager'
import type { PathService } from '../services/PathService'
import type { RuntimeManager } from '../services/RuntimeManager'
import type { SettingsService } from '../services/SettingsService'
import type { SystemInfoService } from '../services/SystemInfoService'
import type { TempFileService } from '../services/TempFileService'
import type { TranscriptionService } from '../services/TranscriptionService'
import { RENDERER_URL } from '../utils/rendererProtocol'

const modelId = z.enum(['tiny', 'base', 'small', 'medium', 'large-v3-turbo'])
const languageId = z.enum(['auto', 'tr', 'en', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'uk', 'nl', 'ja', 'ko', 'zh', 'ar', 'hi'])
const pathValue = z.string().min(1).max(32_768)
const transcriptionRequest = z.object({ mediaPath: pathValue, modelId, language: languageId, timestamps: z.boolean() }).strict()
const settingsPatch = z.object({
  setupComplete: z.boolean().optional(), activeModel: modelId.nullable().optional(),
  performanceProfile: z.enum(['quiet', 'balanced', 'performance']).optional(),
  hardwareAcceleration: z.enum(['auto', 'cpu']).optional(), defaultLanguage: languageId.optional(),
  timestamps: z.boolean().optional()
}).strict()

export interface IpcServices {
  windows: () => BrowserWindow[]
  runtime: RuntimeManager
  models: ModelManager
  media: MediaService
  transcription: TranscriptionService
  jobs: JobManager
  settings: SettingsService
  system: SystemInfoService
  paths: PathService
  tempFiles: TempFileService
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame
  if (!frame || frame !== event.sender.mainFrame) throw new Error('IPC request was not sent by the main application frame')
  const actual = new URL(frame.url)
  const developmentUrl = process.env.ELECTRON_RENDERER_URL
  if (developmentUrl) {
    if (actual.origin !== new URL(developmentUrl).origin) throw new Error('IPC request came from an untrusted development origin')
    return
  }
  actual.hash = ''
  actual.search = ''
  const expected = new URL(RENDERER_URL).href
  if (actual.href !== expected) throw new Error('IPC request came from an untrusted application document')
}

export function registerIpc(services: IpcServices): void {
  const handle = (channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event)
      return listener(event, ...args)
    })
  }
  const send = (channel: string, value: unknown): void => {
    for (const window of services.windows()) if (!window.isDestroyed()) window.webContents.send(channel, value)
  }
  const progress = (value: DownloadProgress): void => send(IPC.downloadProgress, value)

  services.transcription.on('progress', (value: TranscriptionProgress) => send(IPC.transcriptionProgress, value))
  services.transcription.on('completed', (value: TranscriptionCompleted) => send(IPC.transcriptionCompleted, value))
  services.transcription.on('failed', (value: FriendlyError) => send(IPC.transcriptionError, value))

  handle(IPC.systemInfo, () => services.system.getInfo())
  handle(IPC.setupStatus, () => services.runtime.getStatus())
  handle(IPC.setupInstallRuntime, () => services.runtime.install(progress))
  handle(IPC.setupComplete, async (_event, raw: unknown) => {
    const id = modelId.parse(raw) as ModelId
    const status = await services.runtime.getStatus()
    if (!status.runtimeReady || !(await services.models.isValid(id))) throw new Error('Required runtime components and a model must be ready first.')
    await services.models.select(id)
    await services.settings.update({ setupComplete: true, activeModel: id })
    return services.runtime.getStatus()
  })

  handle(IPC.modelsList, () => services.models.list())
  handle(IPC.modelsDownload, (_event, raw: unknown) => services.models.download(modelId.parse(raw) as ModelId, progress))
  handle(IPC.modelsCancel, (_event, raw: unknown) => services.models.cancel(modelId.parse(raw) as ModelId))
  handle(IPC.modelsSelect, (_event, raw: unknown) => services.models.select(modelId.parse(raw) as ModelId))
  handle(IPC.modelsDelete, (_event, raw: unknown) => services.models.delete(modelId.parse(raw) as ModelId))
  handle(IPC.modelsRepair, (_event, raw: unknown) => services.models.repair(modelId.parse(raw) as ModelId, progress))

  handle(IPC.fileChoose, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose audio or video', properties: ['openFile'],
      filters: [{ name: 'Audio and video', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma'] }, { name: 'All files', extensions: ['*'] }]
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  handle(IPC.mediaInspect, (_event, raw: unknown) => services.media.inspect(pathValue.parse(raw)))

  handle(IPC.transcriptionStart, (_event, raw: unknown) => services.transcription.start(transcriptionRequest.parse(raw)))
  handle(IPC.transcriptionCancel, () => services.transcription.cancel())

  handle(IPC.exportSave, async (_event, raw: unknown) => {
    const request = z.object({
      format: z.enum(['txt', 'srt', 'vtt']), defaultName: z.string().min(1).max(255), content: z.string().max(100_000_000)
    }).strict().parse(raw)
    const result = await dialog.showSaveDialog({
      title: `Save ${request.format.toUpperCase()}`,
      defaultPath: request.defaultName,
      filters: [{ name: request.format.toUpperCase(), extensions: [request.format] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, request.content, 'utf8')
    return result.filePath
  })
  handle(IPC.clipboardCopy, (_event, raw: unknown) => clipboard.writeText(z.string().max(100_000_000).parse(raw)))

  handle(IPC.settingsGet, () => services.settings.get())
  handle(IPC.settingsUpdate, (_event, raw: unknown) => services.settings.update(settingsPatch.parse(raw) as Partial<AppSettings>))
  handle(IPC.storageInfo, async () => {
    await mkdir(services.paths.models, { recursive: true })
    let modelsBytes = 0
    for (const entry of await readdir(services.paths.models, { withFileTypes: true })) {
      if (entry.isFile()) modelsBytes += (await stat(join(services.paths.models, entry.name))).size
    }
    return { runtimeDirectory: services.paths.runtime, modelsDirectory: services.paths.models, tempDirectory: services.paths.temp, modelsBytes }
  })
  handle(IPC.storageOpen, async (_event, raw: unknown) => {
    const kind = z.enum(['runtime', 'models', 'temp']).parse(raw)
    const target = kind === 'runtime' ? services.paths.runtime : kind === 'models' ? services.paths.models : services.paths.temp
    await mkdir(target, { recursive: true })
    const failure = await shell.openPath(target)
    if (failure) throw new Error(failure)
  })
  handle(IPC.storageCleanTemp, () => {
    if (services.jobs.isActive()) throw new Error('Temporary files cannot be cleaned during transcription.')
    return services.tempFiles.cleanAll()
  })
  handle(IPC.runtimeInfo, async () => {
    const status = await services.runtime.getStatus()
    return { ready: status.runtimeReady, ffmpegVersion: status.mediaVersion, whisperVersion: status.runtimeVersion }
  })
  handle(IPC.runtimeRepair, () => services.runtime.verifyAndRepair(progress))
}
