import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryStore } from '../src/main/services/HistoryStore'
import { Logger } from '../src/main/services/Logger'
import { PathService } from '../src/main/services/PathService'
import type { HistoryInsert } from '../src/main/services/HistoryStore'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

function transcript(index: number): HistoryInsert {
  return {
    media: {
      path: `/private/media/recording-${index}.wav`,
      fileName: `recording-${index}.wav`,
      sizeBytes: 1_024 + index,
      durationMs: 5_000,
      kind: 'audio',
      audioCodec: 'PCM',
      formatName: 'WAV'
    },
    modelId: 'small',
    requestedLanguage: 'tr',
    timestamps: index % 2 === 0,
    result: { language: 'tr', durationMs: 5_000, segments: [{ startMs: 0, endMs: 5_000, text: `Merhaba ${index}` }] }
  }
}

describe('HistoryStore', () => {
  it('persists transcript segments and never stores the source path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'localscribe-history-')); directories.push(directory)
    const paths = new PathService(directory)
    const store = new HistoryStore(paths, new Logger(paths))
    await store.load()
    const saved = store.insert(transcript(1))
    expect(saved.result.segments[0]?.text).toBe('Merhaba 1')
    expect(JSON.stringify(saved)).not.toContain('/private/media')
    store.close()

    const reopened = new HistoryStore(paths, new Logger(paths))
    await reopened.load()
    expect(reopened.list()).toHaveLength(1)
    expect(reopened.get(saved.id)?.fileName).toBe('recording-1.wav')
    reopened.close()
  })

  it('updates edits and retains only the latest ten transcripts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'localscribe-history-')); directories.push(directory)
    const paths = new PathService(directory)
    const store = new HistoryStore(paths, new Logger(paths))
    await store.load()
    const records = Array.from({ length: 11 }, (_, index) => store.insert(transcript(index)))
    expect(store.list()).toHaveLength(10)
    expect(store.get(records[0]!.id)).toBeNull()

    const latest = records.at(-1)!
    const updated = store.updateSegments(latest.id, [{ startMs: 0, endMs: 5_000, text: 'Düzenlendi' }])
    expect(updated?.result.segments[0]?.text).toBe('Düzenlendi')
    store.delete(latest.id)
    expect(store.get(latest.id)).toBeNull()
    store.clear()
    expect(store.list()).toEqual([])
    store.close()
  })
})
