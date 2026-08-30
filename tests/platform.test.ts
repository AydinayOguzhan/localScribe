import { describe, expect, it } from 'vitest'
import { recommendModel } from '../src/main/manifests/modelManifest'
import { resolvePlatform, threadCount } from '../src/main/utils/platform'

describe('platform and resource defaults', () => {
  it('resolves supported targets and rejects unsupported architectures', () => {
    expect(resolvePlatform('darwin', 'arm64')).toBe('darwin-arm64')
    expect(resolvePlatform('win32', 'x64')).toBe('win32-x64')
    expect(resolvePlatform('linux', 'x64')).toBeNull()
    expect(resolvePlatform('win32', 'arm64')).toBeNull()
  })
  it('caps CPU thread profiles', () => {
    expect(threadCount(32, 'balanced')).toBe(12)
    expect(threadCount(32, 'quiet')).toBe(6)
    expect(threadCount(32, 'performance')).toBe(16)
    expect(threadCount(1, 'balanced')).toBe(1)
  })
  it('recommends models from actual system memory', () => {
    expect(recommendModel(4 * 1024 ** 3)).toBe('base')
    expect(recommendModel(16 * 1024 ** 3)).toBe('small')
    expect(recommendModel(32 * 1024 ** 3)).toBe('medium')
  })
})
