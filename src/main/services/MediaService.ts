import { basename } from 'node:path'
import { stat } from 'node:fs/promises'
import type { MediaMetadata } from '../../shared/types'
import type { FfprobeAdapter } from '../adapters/FfprobeAdapter'

export class MediaService {
  constructor(private readonly probe: FfprobeAdapter) {}

  async inspect(path: string): Promise<MediaMetadata> {
    if (typeof path !== 'string' || path.length === 0 || path.length > 32_768) throw new Error('The selected file path is invalid.')
    const file = await stat(path)
    if (!file.isFile()) throw new Error('The selected item is not a file.')
    return this.probe.inspect(path, file.size, basename(path))
  }
}
