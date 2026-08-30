import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { openPromise, type Entry } from 'yauzl'

const UNIX_HOST = 3
const UNIX_FILE_TYPE_MASK = 0o170000
const UNIX_DIRECTORY = 0o040000
const UNIX_REGULAR_FILE = 0o100000
const UNIX_SYMBOLIC_LINK = 0o120000

export interface ZipExtractionLimits {
  maxEntries: number
  maxUncompressedBytes: number
}

export function resolveArchiveEntry(destination: string, entryName: string): string {
  if (!entryName || entryName.includes('\0') || entryName.includes('\\')) throw new Error('Archive contains an unsafe file name')
  if (entryName.startsWith('/') || entryName.startsWith('//') || /^[A-Za-z]:\//.test(entryName)) {
    throw new Error('Archive contains an absolute file path')
  }
  const root = resolve(destination)
  const target = resolve(root, ...entryName.split('/'))
  const within = relative(root, target)
  if (!within || isAbsolute(within) || within === '..' || within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error('Archive entry escapes the installation directory')
  }
  return target
}

export function archiveEntryKind(entry: Pick<Entry, 'versionMadeBy' | 'externalFileAttributes' | 'fileName'>): 'file' | 'directory' | 'symlink' | 'special' {
  const host = entry.versionMadeBy >>> 8
  if (host === UNIX_HOST) {
    const mode = (entry.externalFileAttributes >>> 16) & 0xffff
    const type = mode & UNIX_FILE_TYPE_MASK
    if (type === UNIX_SYMBOLIC_LINK) return 'symlink'
    if (type === UNIX_DIRECTORY) return 'directory'
    if (type !== 0 && type !== UNIX_REGULAR_FILE) return 'special'
  }
  return entry.fileName.endsWith('/') ? 'directory' : 'file'
}

export async function extractExpectedZipFiles(
  archivePath: string,
  destination: string,
  expectedFiles: readonly string[],
  limits: ZipExtractionLimits
): Promise<void> {
  if (limits.maxEntries < 1 || limits.maxUncompressedBytes < 1) throw new Error('Archive extraction limits are invalid')
  const expected = new Map(expectedFiles.map((name) => [name, resolveArchiveEntry(destination, name)]))
  if (expected.size !== expectedFiles.length) throw new Error('Runtime manifest contains duplicate file paths')

  await mkdir(destination, { recursive: true })
  const archive = await openPromise(archivePath, { strictFileNames: true, validateEntrySizes: true })
  const extracted = new Set<string>()
  let entries = 0
  let uncompressedBytes = 0
  try {
    for await (const entry of archive.eachEntry()) {
      entries += 1
      if (entries > limits.maxEntries) throw new Error('Archive contains too many entries')
      if (entry.isEncrypted()) throw new Error('Encrypted runtime archives are not supported')

      const kind = archiveEntryKind(entry)
      if (kind === 'symlink' || kind === 'special') throw new Error('Archive contains an unsupported link or special file')
      if (kind === 'directory') continue

      const target = expected.get(entry.fileName)
      if (!target) continue
      if (extracted.has(entry.fileName)) throw new Error(`Archive contains a duplicate entry: ${entry.fileName}`)

      uncompressedBytes += entry.uncompressedSize
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || uncompressedBytes > limits.maxUncompressedBytes) {
        throw new Error('Archive expands beyond the allowed size')
      }

      await mkdir(dirname(target), { recursive: true })
      const input = await archive.openReadStreamPromise(entry)
      await pipeline(input, createWriteStream(target, { flags: 'wx', mode: 0o600 }))
      extracted.add(entry.fileName)
    }
  } finally {
    if (archive.isOpen) archive.close()
  }

  const missing = expectedFiles.filter((name) => !extracted.has(name))
  if (missing.length > 0) throw new Error(`Archive is missing required files: ${missing.join(', ')}`)
}
