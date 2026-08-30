import { app, BrowserWindow, net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FfmpegAdapter } from './adapters/FfmpegAdapter'
import { FfprobeAdapter } from './adapters/FfprobeAdapter'
import { WhisperCliAdapter } from './adapters/WhisperCliAdapter'
import { registerIpc } from './ipc/registerIpc'
import { resolvePlatform } from './utils/platform'
import { DownloadManager } from './services/DownloadManager'
import { InstallationStore } from './services/InstallationStore'
import { JobManager } from './services/JobManager'
import { Logger } from './services/Logger'
import { MediaService } from './services/MediaService'
import { ModelManager } from './services/ModelManager'
import { PathService } from './services/PathService'
import { ProcessManager } from './services/ProcessManager'
import { RuntimeManager } from './services/RuntimeManager'
import { SettingsService } from './services/SettingsService'
import { SystemInfoService } from './services/SystemInfoService'
import { TempFileService } from './services/TempFileService'
import { TranscriptionService } from './services/TranscriptionService'
import { PRODUCTION_CSP, RENDERER_SCHEME, RENDERER_URL, resolveRendererAsset } from './utils/rendererProtocol'

protocol.registerSchemesAsPrivileged([{
  scheme: RENDERER_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true }
}])

let mainWindow: BrowserWindow | null = null
let processes: ProcessManager | null = null
let createWindow: (() => Promise<void>) | null = null

async function bootstrap(): Promise<void> {
  const rendererRoot = join(__dirname, '../renderer')
  protocol.handle(RENDERER_SCHEME, async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 })
    try {
      const response = await net.fetch(pathToFileURL(resolveRendererAsset(rendererRoot, request.url)).href)
      const headers = new Headers(response.headers)
      headers.set('Content-Security-Policy', PRODUCTION_CSP)
      headers.set('Cross-Origin-Resource-Policy', 'same-origin')
      headers.set('X-Content-Type-Options', 'nosniff')
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
    }
    catch { return new Response(null, { status: 404 }) }
  })
  const paths = new PathService(app.getPath('userData'))
  const settings = new SettingsService(paths)
  const installations = new InstallationStore(paths)
  await Promise.all([settings.load(), installations.load()])
  const logger = new Logger(paths)
  const system = new SystemInfoService(paths)
  const downloads = new DownloadManager()
  processes = new ProcessManager()
  const jobs = new JobManager()
  const tempFiles = new TempFileService(paths)
  await tempFiles.cleanAbandoned()
  const platform = resolvePlatform(process.platform, process.arch)
  const runtime = new RuntimeManager(platform, paths, downloads, installations, settings, logger)
  const probe = new FfprobeAdapter(() => runtime.getExecutable('ffprobe'), processes)
  const media = new MediaService(probe)
  const models = new ModelManager(paths, downloads, installations, settings, () => system.getInfo(), (id) => jobs.isUsing(id), logger)
  const ffmpeg = new FfmpegAdapter(() => runtime.getExecutable('ffmpeg'), processes)
  const whisper = new WhisperCliAdapter(() => runtime.getExecutable('whisper'), processes)
  const transcription = new TranscriptionService(jobs, media, models, ffmpeg, whisper, processes, tempFiles, paths, settings, system, logger)

  registerIpc({ windows: () => BrowserWindow.getAllWindows(), runtime, models, media, transcription, jobs, settings, system, paths, tempFiles })

  createWindow = async () => {
    const bounds = settings.get().windowBounds
    mainWindow = new BrowserWindow({
      width: bounds?.width ?? 1100,
      height: bounds?.height ?? 760,
      x: bounds?.x,
      y: bounds?.y,
      minWidth: 850,
      minHeight: 600,
      show: false,
      backgroundColor: '#0B0D10',
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        devTools: !app.isPackaged,
        navigateOnDragDrop: false,
        safeDialogs: true,
        spellcheck: false
      }
    })
    const window = mainWindow
    window.once('ready-to-show', () => window.show())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-attach-webview', (event) => event.preventDefault())
    window.webContents.session.setPermissionCheckHandler(() => false)
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    window.webContents.on('will-navigate', (event, url) => {
      const devUrl = process.env.ELECTRON_RENDERER_URL
      if (!devUrl || new URL(url).origin !== new URL(devUrl).origin) event.preventDefault()
    })
    window.on('close', () => { void settings.update({ windowBounds: window.getBounds() }) })
    window.on('closed', () => { if (mainWindow === window) mainWindow = null })
    if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL)
    else await window.loadURL(RENDERER_URL)
  }
  await createWindow()
  logger.info('application started', { version: app.getVersion(), platform: process.platform, architecture: process.arch })
}

app.whenReady().then(bootstrap).catch((error: unknown) => {
  process.stderr.write(`LocalScribe failed to start: ${error instanceof Error ? error.message : String(error)}\n`)
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && createWindow) void createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', (event) => {
  if (!processes) return
  event.preventDefault()
  const active = processes
  processes = null
  active.terminateAll().finally(() => app.exit(0))
})
