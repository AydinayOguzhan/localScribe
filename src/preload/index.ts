import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type LocalScribeApi } from '../shared/ipc'
import type { DownloadProgress, FriendlyError, TranscriptionCompleted, TranscriptionProgress } from '../shared/types'

function subscription<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: LocalScribeApi = {
  system: { getInfo: () => ipcRenderer.invoke(IPC.systemInfo) },
  setup: {
    getStatus: () => ipcRenderer.invoke(IPC.setupStatus),
    installRuntime: () => ipcRenderer.invoke(IPC.setupInstallRuntime),
    complete: (modelId) => ipcRenderer.invoke(IPC.setupComplete, modelId),
    onProgress: (callback) => subscription<DownloadProgress>(IPC.downloadProgress, callback)
  },
  models: {
    list: () => ipcRenderer.invoke(IPC.modelsList),
    download: (modelId) => ipcRenderer.invoke(IPC.modelsDownload, modelId),
    cancel: (modelId) => ipcRenderer.invoke(IPC.modelsCancel, modelId),
    select: (modelId) => ipcRenderer.invoke(IPC.modelsSelect, modelId),
    delete: (modelId) => ipcRenderer.invoke(IPC.modelsDelete, modelId),
    repair: (modelId) => ipcRenderer.invoke(IPC.modelsRepair, modelId)
  },
  file: { choose: () => ipcRenderer.invoke(IPC.fileChoose), path: (file) => webUtils.getPathForFile(file) },
  media: { inspect: (path) => ipcRenderer.invoke(IPC.mediaInspect, path) },
  transcription: {
    start: (request) => ipcRenderer.invoke(IPC.transcriptionStart, request),
    cancel: () => ipcRenderer.invoke(IPC.transcriptionCancel),
    onProgress: (callback) => subscription<TranscriptionProgress>(IPC.transcriptionProgress, callback),
    onCompleted: (callback) => subscription<TranscriptionCompleted>(IPC.transcriptionCompleted, callback),
    onError: (callback) => subscription<FriendlyError>(IPC.transcriptionError, callback)
  },
  export: { save: (request) => ipcRenderer.invoke(IPC.exportSave, request) },
  clipboard: { copy: (text) => ipcRenderer.invoke(IPC.clipboardCopy, text) },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch)
  },
  storage: {
    info: () => ipcRenderer.invoke(IPC.storageInfo),
    open: (kind) => ipcRenderer.invoke(IPC.storageOpen, kind),
    cleanTemp: () => ipcRenderer.invoke(IPC.storageCleanTemp)
  },
  runtime: { info: () => ipcRenderer.invoke(IPC.runtimeInfo), repair: () => ipcRenderer.invoke(IPC.runtimeRepair) }
}

contextBridge.exposeInMainWorld('localScribe', api)
