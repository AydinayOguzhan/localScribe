import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { calculateChecksum, verifyChecksum } from '../src/main/utils/checksum'
import { PathService } from '../src/main/services/PathService'
import { SettingsService } from '../src/main/services/SettingsService'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

describe('checksums and settings', () => {
  it('streams explicit SHA-256 validation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'localscribe-test-')); directories.push(directory)
    const file = join(directory, 'data.bin'); await writeFile(file, 'LocalScribe')
    const value = await calculateChecksum(file, 'sha256')
    expect(value).toBe('be2809f713d53148d87f060f4f369b1c17c18b0b7753885054fb497beb45a102')
    expect(await verifyChecksum(file, { algorithm: 'sha256', value })).toBe(true)
  })
  it('persists settings atomically and loads defaults', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'localscribe-test-')); directories.push(directory)
    const paths = new PathService(directory)
    const settings = new SettingsService(paths)
    expect((await settings.load()).performanceProfile).toBe('balanced')
    await settings.update({ performanceProfile: 'quiet', defaultLanguage: 'tr' })
    const stored = JSON.parse(await readFile(paths.settingsFile, 'utf8')) as { performanceProfile: string }
    expect(stored.performanceProfile).toBe('quiet')
    const reloaded = new SettingsService(paths)
    expect((await reloaded.load()).defaultLanguage).toBe('tr')
  })
})
