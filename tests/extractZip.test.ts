import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { archiveEntryKind, resolveArchiveEntry } from '../src/main/utils/extractZip'

describe('secure ZIP extraction policy', () => {
  it('keeps normal entries inside the installation directory', () => {
    expect(resolveArchiveEntry('/tmp/runtime', 'Release/whisper-cli.exe')).toBe(resolve('/tmp/runtime', 'Release/whisper-cli.exe'))
  })

  it.each([
    '../outside',
    'Release/../../outside',
    '/absolute/path',
    'C:/absolute/path',
    'Release\\outside',
    'bad\0name'
  ])('rejects unsafe entry path %s', (entry) => {
    expect(() => resolveArchiveEntry('/tmp/runtime', entry)).toThrow(/Archive/)
  })

  it('rejects Unix symbolic links and special files', () => {
    expect(archiveEntryKind({ versionMadeBy: 3 << 8, externalFileAttributes: 0o120777 << 16, fileName: 'link' })).toBe('symlink')
    expect(archiveEntryKind({ versionMadeBy: 3 << 8, externalFileAttributes: 0o020600 << 16, fileName: 'device' })).toBe('special')
    expect(archiveEntryKind({ versionMadeBy: 3 << 8, externalFileAttributes: 0o100755 << 16, fileName: 'binary' })).toBe('file')
  })
})
