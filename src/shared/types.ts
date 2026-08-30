export type SupportedPlatform = 'win32-x64' | 'darwin-x64' | 'darwin-arm64'
export type PerformanceProfile = 'quiet' | 'balanced' | 'performance'
export type HardwareAcceleration = 'auto' | 'cpu'
export type ModelId = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'
export type LanguageId = 'auto' | 'tr' | 'en' | 'ru' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'pl' | 'uk' | 'nl' | 'ja' | 'ko' | 'zh' | 'ar' | 'hi'

export interface AppSettings {
  schemaVersion: 1
  setupComplete: boolean
  activeModel: ModelId | null
  performanceProfile: PerformanceProfile
  hardwareAcceleration: HardwareAcceleration
  defaultLanguage: LanguageId
  timestamps: boolean
  windowBounds?: { x?: number; y?: number; width: number; height: number }
}

export interface Checksum {
  algorithm: 'sha256' | 'sha1'
  value: string
}

export interface ArtifactDefinition {
  id: string
  version: string
  label: string
  description: string
  url: string
  allowedHosts: string[]
  archiveType: 'zip' | 'none'
  downloadSize: number
  installedSize: number
  checksum: Checksum
  expectedFiles: string[]
  executableFiles: string[]
  source: string
}

export interface ModelDefinition {
  id: ModelId
  name: string
  description: string
  url: string
  allowedHosts: string[]
  fileName: string
  downloadSize: number
  memoryBytes: number
  speed: string
  quality: string
  checksum: Checksum
  recommended?: boolean
}

export interface InstalledArtifact {
  id: string
  version: string
  path: string
  size: number
  checksum: Checksum
  verifiedAt: string
}

export interface InstalledComponents {
  schemaVersion: 1
  artifacts: Record<string, InstalledArtifact>
  models: Partial<Record<ModelId, InstalledArtifact>>
}

export interface SystemInfo {
  platform: NodeJS.Platform
  architecture: string
  supportedPlatform: SupportedPlatform | null
  osName: string
  cpuModel: string
  logicalCpuCount: number
  totalMemoryBytes: number
  freeDiskBytes: number
  acceleration: string
  deviceLabel: string
}

export type DownloadStage = 'downloading' | 'verifying' | 'extracting' | 'validating' | 'complete'

export interface DownloadProgress {
  artifactId: string
  stage: DownloadStage
  downloadedBytes: number
  totalBytes: number
  percent: number
  bytesPerSecond: number
}

export interface SetupStatus {
  setupComplete: boolean
  supported: boolean
  runtimeReady: boolean
  installedModelIds: ModelId[]
  activeModel: ModelId | null
  runtimeVersion: string
  mediaVersion: string
}

export type ModelState = 'NOT_INSTALLED' | 'DOWNLOADING' | 'VERIFYING' | 'READY' | 'ACTIVE' | 'ERROR'

export interface ModelView extends ModelDefinition {
  state: ModelState
  warning?: string
}

export interface MediaMetadata {
  path: string
  fileName: string
  sizeBytes: number
  durationMs: number
  kind: 'audio' | 'video'
  audioCodec: string
  formatName: string
}

export interface TranscriptSegment {
  startMs: number
  endMs: number
  text: string
}

export interface TranscriptResult {
  language?: string
  durationMs: number
  segments: TranscriptSegment[]
}

export type JobStage = 'PREPARING' | 'EXTRACTING_AUDIO' | 'TRANSCRIBING' | 'FINALIZING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export interface TranscriptionRequest {
  mediaPath: string
  modelId: ModelId
  language: LanguageId
  timestamps: boolean
}

export interface TranscriptionProgress {
  jobId: string
  stage: JobStage
  percent?: number
  processedMs?: number
  durationMs: number
  elapsedMs: number
  detail?: string
}

export interface TranscriptionCompleted {
  jobId: string
  media: MediaMetadata
  modelId: ModelId
  result: TranscriptResult
}

export interface FriendlyError {
  code: string
  message: string
  details?: string
  action?: 'retry' | 'repair' | 'choose-file' | 'settings'
}

export interface StorageInfo {
  runtimeDirectory: string
  modelsDirectory: string
  tempDirectory: string
  modelsBytes: number
}

export interface RuntimeInfo {
  ready: boolean
  ffmpegVersion: string
  whisperVersion: string
}

export interface ExportRequest {
  format: 'txt' | 'srt' | 'vtt'
  defaultName: string
  content: string
}
