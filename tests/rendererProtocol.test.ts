import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCTION_CSP, resolveRendererAsset } from '../src/main/utils/rendererProtocol'

describe('production renderer protocol', () => {
  it('does not allow production network or WebSocket connections', () => {
    expect(PRODUCTION_CSP).toContain("connect-src 'self'")
    expect(PRODUCTION_CSP).not.toMatch(/https?:|wss?:/)
  })

  it('serves only assets below the renderer root', () => {
    expect(resolveRendererAsset('/app/renderer', 'localscribe://app/index.html')).toBe(resolve('/app/renderer/index.html'))
    expect(resolveRendererAsset('/app/renderer', 'localscribe://app/assets/index.js')).toBe(resolve('/app/renderer/assets/index.js'))
  })

  it.each([
    'https://app/index.html',
    'localscribe://other/index.html',
    'localscribe://app/%2e%2e/main/index.js',
    'localscribe://app/assets%5cindex.js',
    'localscribe://app/%00index.html'
  ])('rejects untrusted renderer URL %s', (url) => {
    expect(() => resolveRendererAsset('/app/renderer', url)).toThrow(/Renderer/)
  })
})
