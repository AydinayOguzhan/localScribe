import { getRuntimeArtifacts, runtimeManifest } from '../src/main/manifests/runtimeManifest'
import { modelList } from '../src/main/manifests/modelManifest'
import { validateDownloadUrl } from '../src/main/services/DownloadManager'

async function check(url: string, hosts: string[], expectedSize: number, redirects = 0): Promise<string> {
  if (redirects > 8) throw new Error(`${url}: too many redirects`)
  validateDownloadUrl(url, hosts)
  const response = await fetch(url, { method: 'HEAD', redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (!location) throw new Error(`${url}: redirect has no location`)
    const next = new URL(location, url).toString()
    validateDownloadUrl(next, hosts)
    return check(next, hosts, expectedSize, redirects + 1)
  }
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) !== expectedSize) {
    throw new Error(`${url}: expected ${expectedSize} bytes, received ${contentLength}`)
  }
  return `${response.status} ${contentLength ?? 'unknown size'}`
}

async function main(): Promise<void> {
  for (const platform of Object.keys(runtimeManifest) as Array<keyof typeof runtimeManifest>) {
    for (const artifact of getRuntimeArtifacts(platform)) {
      const result = await check(artifact.url, artifact.allowedHosts, artifact.downloadSize)
      process.stdout.write(`${platform} ${artifact.id}: ${result}\n`)
    }
  }
  for (const model of modelList) {
    const result = await check(model.url, model.allowedHosts, model.downloadSize)
    process.stdout.write(`model ${model.id}: ${result}\n`)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
