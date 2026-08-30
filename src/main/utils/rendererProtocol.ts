import { isAbsolute, relative, resolve } from 'node:path'

export const RENDERER_SCHEME = 'localscribe'
export const RENDERER_HOST = 'app'
export const RENDERER_URL = `${RENDERER_SCHEME}://${RENDERER_HOST}/index.html`
export const PRODUCTION_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'"

export function resolveRendererAsset(rendererRoot: string, urlText: string): string {
  const rawPath = urlText.split(/[?#]/, 1)[0] ?? ''
  if (/%2e/i.test(rawPath)) throw new Error('Renderer request contains an encoded dot segment')
  const url = new URL(urlText)
  if (url.protocol !== `${RENDERER_SCHEME}:` || url.host !== RENDERER_HOST) throw new Error('Renderer request has an untrusted origin')
  let pathname: string
  try { pathname = decodeURIComponent(url.pathname) } catch { throw new Error('Renderer request contains invalid encoding') }
  if (pathname.includes('\0') || pathname.includes('\\')) throw new Error('Renderer request contains an unsafe path')
  const root = resolve(rendererRoot)
  const target = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`)
  const within = relative(root, target)
  if (!within || isAbsolute(within) || within === '..' || within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error('Renderer request escapes the application bundle')
  }
  return target
}
