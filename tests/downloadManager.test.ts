import { describe, expect, it } from 'vitest'
import { DownloadManager, validateDownloadUrl } from '../src/main/services/DownloadManager'

describe('DownloadManager safety', () => {
  it('allows only HTTPS manifest hosts, including redirect validation', () => {
    expect(validateDownloadUrl('https://github.com/a.zip', ['github.com']).hostname).toBe('github.com')
    expect(() => validateDownloadUrl('http://github.com/a.zip', ['github.com'])).toThrow(/trusted/)
    expect(() => validateDownloadUrl('https://evil.example/a.zip', ['github.com'])).toThrow(/trusted/)
  })
  it('allows cancellation requests to be idempotent', () => {
    const manager = new DownloadManager()
    expect(manager.isDownloading('not-running')).toBe(false)
    expect(() => { manager.cancel('not-running'); manager.cancel('not-running') }).not.toThrow()
  })
})
