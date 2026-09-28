import type {
  AppSettings,
  DownloadProgress,
  ExportRequest,
  HistoryRecord,
  HistorySummary,
  MediaMetadata,
  ModelId,
  ModelView,
  QueueAddRequest,
  QueueResult,
  QueueSnapshot,
  SetupStatus,
  StorageInfo,
  SystemInfo,
  RuntimeInfo,
  TranscriptSegment
} from './types'

export const IPC = {
  systemInfo: 'system:info',
  setupStatus: 'setup:status',
  setupInstallRuntime: 'setup:install-runtime',
  setupComplete: 'setup:complete',
  downloadProgress: 'download:progress',
  modelsList: 'models:list',
  modelsDownload: 'models:download',
  modelsCancel: 'models:cancel',
  modelsSelect: 'models:select',
  modelsDelete: 'models:delete',
  modelsRepair: 'models:repair',
  fileChoose: 'file:choose',
  fileChooseMany: 'file:choose-many',
  mediaInspect: 'media:inspect',
  queueGet: 'queue:get',
  queueGetResult: 'queue:get-result',
  queueAdd: 'queue:add',
  queueCancel: 'queue:cancel',
  queueCancelAll: 'queue:cancel-all',
  queueRetry: 'queue:retry',
  queueChanged: 'queue:changed',
  historyList: 'history:list',
  historyGet: 'history:get',
  historyUpdateSegments: 'history:update-segments',
  historyDelete: 'history:delete',
  historyClear: 'history:clear',
  historyChanged: 'history:changed',
  exportSave: 'export:save',
  clipboardCopy: 'clipboard:copy',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  storageInfo: 'storage:info',
  storageOpen: 'storage:open',
  storageCleanTemp: 'storage:clean-temp',
  runtimeInfo: 'runtime:info',
  runtimeRepair: 'runtime:repair'
} as const

export interface LocalScribeApi {
  system: { getInfo(): Promise<SystemInfo> }
  setup: {
    getStatus(): Promise<SetupStatus>
    installRuntime(): Promise<SetupStatus>
    complete(modelId: ModelId): Promise<SetupStatus>
    onProgress(callback: (progress: DownloadProgress) => void): () => void
  }
  models: {
    list(): Promise<ModelView[]>
    download(modelId: ModelId): Promise<ModelView[]>
    cancel(modelId: ModelId): Promise<void>
    select(modelId: ModelId): Promise<ModelView[]>
    delete(modelId: ModelId): Promise<ModelView[]>
    repair(modelId: ModelId): Promise<ModelView[]>
  }
  file: { choose(): Promise<string | null>; chooseMany(): Promise<string[]>; path(file: File): string }
  media: { inspect(path: string): Promise<MediaMetadata> }
  queue: {
    get(): Promise<QueueSnapshot>
    getResult(itemId: string): Promise<QueueResult | null>
    add(requests: QueueAddRequest[]): Promise<QueueSnapshot>
    cancel(itemId: string): Promise<QueueSnapshot>
    cancelAll(): Promise<QueueSnapshot>
    retry(itemId: string): Promise<QueueSnapshot>
    onChanged(callback: (snapshot: QueueSnapshot) => void): () => void
  }
  history: {
    list(): Promise<HistorySummary[]>
    get(id: string): Promise<HistoryRecord | null>
    updateSegments(id: string, segments: TranscriptSegment[]): Promise<HistoryRecord | null>
    delete(id: string): Promise<void>
    clear(): Promise<void>
    onChanged(callback: () => void): () => void
  }
  export: { save(request: ExportRequest): Promise<string | null> }
  clipboard: { copy(text: string): Promise<void> }
  settings: { get(): Promise<AppSettings>; update(patch: Partial<AppSettings>): Promise<AppSettings> }
  storage: {
    info(): Promise<StorageInfo>
    open(kind: 'runtime' | 'models' | 'temp'): Promise<void>
    cleanTemp(): Promise<void>
  }
  runtime: { info(): Promise<RuntimeInfo>; repair(): Promise<SetupStatus> }
}
