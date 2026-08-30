import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat, truncate, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { get } from 'node:https'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ArtifactDefinition, DownloadProgress } from '../../shared/types'
import { verifyChecksum } from '../utils/checksum'

type ProgressListener = (progress: DownloadProgress) => void

export function validateDownloadUrl(urlText: string, allowedHosts: readonly string[]): URL {
  const url = new URL(urlText)
  if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname)) throw new Error('Download host is not trusted')
  return url
}

export class DownloadManager {
  private readonly controllers = new Map<string, AbortController>()

  isDownloading(artifactId: string): boolean { return this.controllers.has(artifactId) }
  cancel(artifactId: string): void { this.controllers.get(artifactId)?.abort() }

  async download(artifact: ArtifactDefinition, partPath: string, finalPath: string, onProgress: ProgressListener): Promise<void> {
    if (this.controllers.has(artifact.id)) throw new Error(`${artifact.label} is already downloading`)
    const controller = new AbortController()
    this.controllers.set(artifact.id, controller)
    try {
      await mkdir(dirname(partPath), { recursive: true })
      let lastError: Error | undefined
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await this.transfer(artifact, partPath, onProgress, controller.signal)
          onProgress({ artifactId: artifact.id, stage: 'verifying', downloadedBytes: artifact.downloadSize, totalBytes: artifact.downloadSize, percent: 100, bytesPerSecond: 0 })
          if (!(await verifyChecksum(partPath, artifact.checksum))) {
            await unlink(partPath)
            throw new Error(`Integrity verification failed for ${artifact.label}`)
          }
          await mkdir(dirname(finalPath), { recursive: true })
          try { await unlink(finalPath) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
          await rename(partPath, finalPath)
          return
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (controller.signal.aborted || attempt === 2 || !this.isTransient(lastError)) throw lastError
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
        }
      }
      throw lastError ?? new Error('Download failed')
    } finally {
      this.controllers.delete(artifact.id)
    }
  }

  private async transfer(artifact: ArtifactDefinition, partPath: string, onProgress: ProgressListener, signal: AbortSignal): Promise<void> {
    let existing = 0
    try { existing = (await stat(partPath)).size } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (existing > artifact.downloadSize) {
      await truncate(partPath, 0)
      existing = 0
    }
    if (existing === artifact.downloadSize) {
      onProgress({ artifactId: artifact.id, stage: 'downloading', downloadedBytes: existing, totalBytes: existing, percent: 100, bytesPerSecond: 0 })
      return
    }
    const startedAt = Date.now()
    let lastUpdate = 0
    await this.request(artifact.url, artifact, existing, partPath, signal, (downloaded, total) => {
      const now = Date.now()
      if (now - lastUpdate < 250 && downloaded !== total) return
      lastUpdate = now
      const elapsedSeconds = Math.max(0.001, (now - startedAt) / 1000)
      onProgress({
        artifactId: artifact.id,
        stage: 'downloading',
        downloadedBytes: downloaded,
        totalBytes: total,
        percent: total > 0 ? Math.min(100, downloaded / total * 100) : 0,
        bytesPerSecond: Math.max(0, downloaded - existing) / elapsedSeconds
      })
    })
  }

  private async request(
    urlText: string,
    artifact: ArtifactDefinition,
    existing: number,
    partPath: string,
    signal: AbortSignal,
    progress: (downloaded: number, total: number) => void,
    redirects = 0
  ): Promise<void> {
    const url = validateDownloadUrl(urlText, artifact.allowedHosts)
    if (redirects > 8) throw new Error('Too many download redirects')

    await new Promise<void>((resolve, reject) => {
      const request = get(url, { headers: existing > 0 ? { Range: `bytes=${existing}-` } : {}, signal }, (response) => {
        const status = response.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.resume()
          const location = response.headers.location
          if (!location) return reject(new Error('Download redirect has no location'))
          this.request(new URL(location, url).toString(), artifact, existing, partPath, signal, progress, redirects + 1).then(resolve, reject)
          return
        }
        if (status !== 200 && status !== 206) {
          response.resume()
          reject(Object.assign(new Error(`Download failed with HTTP ${status}`), { statusCode: status }))
          return
        }
        const resumed = status === 206 && existing > 0
        const base = resumed ? existing : 0
        const contentLength = Number(response.headers['content-length'] ?? 0)
        const expectedRemaining = artifact.downloadSize - base
        if (contentLength > 0 && (!Number.isSafeInteger(contentLength) || contentLength !== expectedRemaining)) {
          response.resume()
          reject(new Error(`Download size does not match the pinned manifest for ${artifact.label}`))
          return
        }
        if (resumed) {
          const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers['content-range'] ?? '')
          if (!match || Number(match[1]) !== existing || Number(match[3]) !== artifact.downloadSize) {
            response.resume()
            reject(new Error(`Download range does not match the pinned manifest for ${artifact.label}`))
            return
          }
        }
        const output = createWriteStream(partPath, { flags: resumed ? 'a' : 'w', mode: 0o600 })
        let downloaded = base
        const guard = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            downloaded += chunk.length
            if (downloaded > artifact.downloadSize) {
              callback(new Error(`Download exceeded the pinned size for ${artifact.label}`))
              return
            }
            progress(downloaded, artifact.downloadSize)
            callback(null, chunk)
          }
        })
        void pipeline(response, guard, output).then(() => {
          if (downloaded !== artifact.downloadSize) {
            reject(new Error(`Download ended before the pinned size for ${artifact.label}`))
            return
          }
          progress(downloaded, artifact.downloadSize)
          resolve()
        }, reject)
      })
      request.on('error', reject)
    })
  }

  private isTransient(error: Error): boolean {
    const status = (error as Error & { statusCode?: number }).statusCode
    return status === undefined || status === 408 || status === 429 || status >= 500
  }
}
