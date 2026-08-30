import { cpus, hostname, totalmem } from 'node:os'
import { statfs } from 'node:fs/promises'
import type { SystemInfo } from '../../shared/types'
import { resolvePlatform } from '../utils/platform'
import type { PathService } from './PathService'

export class SystemInfoService {
  constructor(private readonly paths: PathService) {}

  async getInfo(): Promise<SystemInfo> {
    const cpuList = cpus()
    let freeDiskBytes = 0
    try {
      const disk = await statfs(this.paths.root)
      freeDiskBytes = disk.bavail * disk.bsize
    } catch { /* disk space remains unknown */ }
    const supportedPlatform = resolvePlatform(process.platform, process.arch)
    const appleSilicon = supportedPlatform === 'darwin-arm64'
    return {
      platform: process.platform,
      architecture: process.arch,
      supportedPlatform,
      osName: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : process.platform,
      cpuModel: cpuList[0]?.model.trim() || 'Unknown CPU',
      logicalCpuCount: cpuList.length,
      totalMemoryBytes: totalmem(),
      freeDiskBytes,
      acceleration: appleSilicon ? 'Apple Metal available in Auto mode' : 'CPU runtime',
      deviceLabel: process.platform === 'darwin' ? (appleSilicon ? 'Apple Silicon Mac' : 'Intel Mac') : `${hostname() || 'Windows'} PC`
    }
  }
}
