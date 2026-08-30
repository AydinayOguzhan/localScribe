import type { LocalScribeApi } from '../../shared/ipc'

declare global {
  interface Window { localScribe: LocalScribeApi }
}

export {}
