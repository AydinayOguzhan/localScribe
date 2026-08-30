import type { PerformanceProfile, SupportedPlatform } from '../../shared/types'

export function resolvePlatform(platform: NodeJS.Platform, arch: string): SupportedPlatform | null {
  if (platform === 'win32' && arch === 'x64') return 'win32-x64'
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64'
  return null
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function threadCount(logicalCpus: number, profile: PerformanceProfile): number {
  const ratio = profile === 'quiet' ? 0.3 : profile === 'performance' ? 0.85 : 0.55
  const maximum = profile === 'quiet' ? 6 : profile === 'balanced' ? 12 : 16
  return clamp(Math.round(logicalCpus * ratio), 1, maximum)
}
