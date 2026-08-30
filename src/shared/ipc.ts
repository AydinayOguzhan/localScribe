import type {
  AppSettings,
  DownloadProgress,
  ExportRequest,
  MediaMetadata,
  ModelId,
  ModelView,
  SetupStatus,
  StorageInfo,
  SystemInfo,
  TranscriptionCompleted,
  TranscriptionProgress,
  TranscriptionRequest,
  RuntimeInfo
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
  mediaInspect: 'media:inspect',
  transcriptionStart: 'transcription:start',
  transcriptionCancel: 'transcription:cancel',
  transcriptionProgress: 'transcription:progress',
  transcriptionCompleted: 'transcription:completed',
  transcriptionError: 'transcription:error',
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
  file: { choose(): Promise<string | null>; path(file: File): string }
  media: { inspect(path: string): Promise<MediaMetadata> }
  transcription: {
    start(request: TranscriptionRequest): Promise<string>
    cancel(): Promise<void>
    onProgress(callback: (progress: TranscriptionProgress) => void): () => void
    onCompleted(callback: (result: TranscriptionCompleted) => void): () => void
    onError(callback: (error: { message: string; details?: string }) => void): () => void
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
