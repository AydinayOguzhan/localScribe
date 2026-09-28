import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type LocalScribeApi } from '../shared/ipc'
import type { DownloadProgress, QueueSnapshot } from '../shared/types'

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
  file: {
    choose: () => ipcRenderer.invoke(IPC.fileChoose),
    chooseMany: () => ipcRenderer.invoke(IPC.fileChooseMany),
    path: (file) => webUtils.getPathForFile(file)
  },
  media: { inspect: (path) => ipcRenderer.invoke(IPC.mediaInspect, path) },
  queue: {
    get: () => ipcRenderer.invoke(IPC.queueGet),
    getResult: (itemId) => ipcRenderer.invoke(IPC.queueGetResult, itemId),
    add: (requests) => ipcRenderer.invoke(IPC.queueAdd, requests),
    cancel: (itemId) => ipcRenderer.invoke(IPC.queueCancel, itemId),
    cancelAll: () => ipcRenderer.invoke(IPC.queueCancelAll),
    retry: (itemId) => ipcRenderer.invoke(IPC.queueRetry, itemId),
    onChanged: (callback) => subscription<QueueSnapshot>(IPC.queueChanged, callback)
  },
  history: {
    list: () => ipcRenderer.invoke(IPC.historyList),
    get: (id) => ipcRenderer.invoke(IPC.historyGet, id),
    updateSegments: (id, segments) => ipcRenderer.invoke(IPC.historyUpdateSegments, { id, segments }),
    delete: (id) => ipcRenderer.invoke(IPC.historyDelete, id),
    clear: () => ipcRenderer.invoke(IPC.historyClear),
    onChanged: (callback) => subscription<null>(IPC.historyChanged, callback)
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
