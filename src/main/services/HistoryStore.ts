import { randomUUID } from 'node:crypto'
import { chmod, mkdir } from 'node:fs/promises'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import type {
  HistoryRecord,
  HistorySummary,
  LanguageId,
  MediaMetadata,
  ModelId,
  TranscriptResult,
  TranscriptSegment
} from '../../shared/types'
import type { Logger } from './Logger'
import type { PathService } from './PathService'

interface TranscriptRow {
  id: string
  file_name: string
  media_kind: MediaMetadata['kind']
  size_bytes: number
  duration_ms: number
  audio_codec: string
  format_name: string
  model_id: ModelId
  requested_language: LanguageId
  detected_language: string | null
  timestamps: number
  created_at: string
  updated_at: string
}

interface SegmentRow {
  start_ms: number
  end_ms: number
  text: string
}

export interface HistoryInsert {
  media: MediaMetadata
  modelId: ModelId
  requestedLanguage: LanguageId
  timestamps: boolean
  result: TranscriptResult
}

export class HistoryStore {
  private database: DatabaseSync | null = null
  private failure: string | null = null

  constructor(private readonly paths: PathService, private readonly logger: Logger) {}

  async load(): Promise<void> {
    let opened: DatabaseSync | null = null
    try {
      await mkdir(this.paths.config, { recursive: true, mode: 0o700 })
      await chmod(this.paths.config, 0o700)
      opened = new DatabaseSync(this.paths.historyFile, {
        allowExtension: false,
        enableForeignKeyConstraints: true,
        timeout: 2_000
      })
      const database = opened
      const version = database.prepare('PRAGMA user_version').get() as unknown as { user_version: number }
      if (version.user_version > 1) throw new Error(`History database schema ${version.user_version} is newer than this LocalScribe version supports.`)
      database.exec(`
        PRAGMA journal_mode = DELETE;
        PRAGMA foreign_keys = ON;
        PRAGMA secure_delete = ON;
        CREATE TABLE IF NOT EXISTS transcripts (
          id TEXT PRIMARY KEY,
          file_name TEXT NOT NULL,
          media_kind TEXT NOT NULL CHECK (media_kind IN ('audio', 'video')),
          size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
          duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
          audio_codec TEXT NOT NULL,
          format_name TEXT NOT NULL,
          model_id TEXT NOT NULL,
          requested_language TEXT NOT NULL,
          detected_language TEXT,
          timestamps INTEGER NOT NULL CHECK (timestamps IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS transcript_segments (
          transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
          segment_index INTEGER NOT NULL CHECK (segment_index >= 0),
          start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
          end_ms INTEGER NOT NULL CHECK (end_ms >= start_ms),
          text TEXT NOT NULL,
          PRIMARY KEY (transcript_id, segment_index)
        ) STRICT;
        PRAGMA user_version = 1;
      `)
      await chmod(this.paths.historyFile, 0o600)
      this.database = database
      opened = null
      this.failure = null
    } catch (error) {
      opened?.close()
      this.failure = error instanceof Error ? error.message : String(error)
      this.logger.error('history database unavailable', { message: this.failure })
    }
  }

  isAvailable(): boolean { return this.database !== null }

  list(): HistorySummary[] {
    const rows = this.db().prepare(`
      SELECT id, file_name, media_kind, duration_ms, model_id, requested_language,
             detected_language, timestamps, created_at, updated_at
      FROM transcripts ORDER BY created_at DESC, rowid DESC LIMIT 10
    `).all() as unknown as TranscriptRow[]
    return rows.map((row) => this.toSummary(row))
  }

  get(id: string): HistoryRecord | null {
    const row = this.db().prepare('SELECT * FROM transcripts WHERE id = ?').get(id) as unknown as TranscriptRow | undefined
    if (!row) return null
    const segments = this.db().prepare(`
      SELECT start_ms, end_ms, text FROM transcript_segments
      WHERE transcript_id = ? ORDER BY segment_index ASC
    `).all(id) as unknown as SegmentRow[]
    return this.toRecord(row, segments)
  }

  insert(value: HistoryInsert): HistoryRecord {
    const database = this.db()
    const id = randomUUID()
    const now = new Date().toISOString()
    const insertTranscript = database.prepare(`
      INSERT INTO transcripts (
        id, file_name, media_kind, size_bytes, duration_ms, audio_codec, format_name,
        model_id, requested_language, detected_language, timestamps, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertSegment = database.prepare(`
      INSERT INTO transcript_segments (transcript_id, segment_index, start_ms, end_ms, text)
      VALUES (?, ?, ?, ?, ?)
    `)
    this.transaction(database, () => {
      insertTranscript.run(
        id, value.media.fileName, value.media.kind, value.media.sizeBytes, value.media.durationMs,
        value.media.audioCodec, value.media.formatName, value.modelId, value.requestedLanguage,
        value.result.language ?? null, value.timestamps ? 1 : 0, now, now
      )
      this.insertSegments(insertSegment, id, value.result.segments)
      database.prepare(`
        DELETE FROM transcripts WHERE id NOT IN (
          SELECT id FROM transcripts ORDER BY created_at DESC, rowid DESC LIMIT 10
        )
      `).run()
    })
    const record = this.get(id)
    if (!record) throw new Error('The saved transcript could not be read back.')
    return record
  }

  updateSegments(id: string, segments: TranscriptSegment[]): HistoryRecord | null {
    const database = this.db()
    if (!database.prepare('SELECT 1 FROM transcripts WHERE id = ?').get(id)) return null
    const insertSegment = database.prepare(`
      INSERT INTO transcript_segments (transcript_id, segment_index, start_ms, end_ms, text)
      VALUES (?, ?, ?, ?, ?)
    `)
    this.transaction(database, () => {
      database.prepare('DELETE FROM transcript_segments WHERE transcript_id = ?').run(id)
      this.insertSegments(insertSegment, id, segments)
      database.prepare('UPDATE transcripts SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id)
    })
    return this.get(id)
  }

  delete(id: string): void { this.db().prepare('DELETE FROM transcripts WHERE id = ?').run(id) }
  clear(): void { this.db().exec('DELETE FROM transcripts; VACUUM;') }
  close(): void { this.database?.close(); this.database = null }

  private db(): DatabaseSync {
    if (!this.database) throw new Error(`Transcript history is unavailable.${this.failure ? ` ${this.failure}` : ''}`)
    return this.database
  }

  private insertSegments(statement: StatementSync, id: string, segments: TranscriptSegment[]): void {
    segments.forEach((segment, index) => statement.run(id, index, segment.startMs, segment.endMs, segment.text))
  }

  private transaction(database: DatabaseSync, action: () => void): void {
    database.exec('BEGIN IMMEDIATE')
    try { action(); database.exec('COMMIT') }
    catch (error) { database.exec('ROLLBACK'); throw error }
  }

  private toSummary(row: TranscriptRow): HistorySummary {
    return {
      id: row.id,
      fileName: row.file_name,
      mediaKind: row.media_kind,
      durationMs: row.duration_ms,
      modelId: row.model_id,
      requestedLanguage: row.requested_language,
      detectedLanguage: row.detected_language ?? undefined,
      timestamps: row.timestamps === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private toRecord(row: TranscriptRow, segments: SegmentRow[]): HistoryRecord {
    return {
      ...this.toSummary(row),
      sizeBytes: row.size_bytes,
      audioCodec: row.audio_codec,
      formatName: row.format_name,
      result: {
        language: row.detected_language ?? undefined,
        durationMs: row.duration_ms,
        segments: segments.map((segment) => ({ startMs: segment.start_ms, endMs: segment.end_ms, text: segment.text }))
      }
    }
  }
}
