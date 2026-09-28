import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  CheckCircle2,
  FileAudio2,
  FileVideo2,
  FolderOpen,
  ListRestart,
  LockKeyhole,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { languages } from '../../../shared/languages'
import type {
  AppSettings,
  HistoryRecord,
  LanguageId,
  MediaMetadata,
  ModelId,
  ModelView,
  QueueItem,
  QueueSnapshot
} from '../../../shared/types'
import { MAX_QUEUE_ITEMS } from '../../../shared/types'
import { ErrorBanner } from '../components/ErrorBanner'
import { ProgressBar } from '../components/ProgressBar'
import { TranscriptEditor } from '../components/TranscriptEditor'
import { errorMessage, formatBytes, formatDuration } from '../utils'

interface DraftItem {
  id: string
  media: MediaMetadata
  modelId: ModelId
  language: LanguageId
  timestamps: boolean
}

interface SelectedTranscript {
  record: HistoryRecord
  persistEdits: boolean
}

const emptyQueue: QueueSnapshot = { items: [], activeItemId: null, availableSlots: MAX_QUEUE_ITEMS }
const liveStatuses = new Set<QueueItem['status']>(['QUEUED', 'PREPARING', 'EXTRACTING_AUDIO', 'TRANSCRIBING', 'FINALIZING'])

export function HomePage({ active }: { active: boolean }): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [models, setModels] = useState<ModelView[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [queue, setQueue] = useState<QueueSnapshot>(emptyQueue)
  const [selected, setSelected] = useState<SelectedTranscript | null>(null)
  const [error, setError] = useState<{ message: string; details?: string } | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void Promise.all([
      window.localScribe.models.list(),
      window.localScribe.settings.get(),
      window.localScribe.queue.get()
    ]).then(([modelList, nextSettings, snapshot]) => {
      setModels(modelList)
      setSettings(nextSettings)
      setQueue(snapshot)
    }).catch((cause: unknown) => setError({ message: errorMessage(cause) }))
    return window.localScribe.queue.onChanged(setQueue)
  }, [])

  useEffect(() => {
    if (!active) return
    void window.localScribe.models.list().then(setModels)
    void window.localScribe.queue.get().then(setQueue)
  }, [active])

  const availableSlots = Math.max(0, queue.availableSlots - drafts.length)
  const installedModels = models.filter((model) => ['READY', 'ACTIVE'].includes(model.state))
  const hasLiveItems = queue.items.some((item) => liveStatuses.has(item.status))

  const inspectPaths = async (paths: string[]): Promise<void> => {
    if (!settings || paths.length === 0) return
    const unique = paths.filter((path, index) => paths.indexOf(path) === index && !drafts.some((draft) => draft.media.path === path))
    const accepted = unique.slice(0, availableSlots)
    if (accepted.length < unique.length) setError({ message: `You can add ${availableSlots} more file${availableSlots === 1 ? '' : 's'} to the queue.` })
    if (accepted.length === 0) return
    setInspecting(true)
    const next: DraftItem[] = []
    const failures: string[] = []
    for (const path of accepted) {
      try {
        const media = await window.localScribe.media.inspect(path)
        next.push({
          id: crypto.randomUUID(),
          media,
          modelId: settings.activeModel ?? 'small',
          language: settings.defaultLanguage,
          timestamps: settings.timestamps
        })
      } catch (cause) { failures.push(errorMessage(cause)) }
    }
    setDrafts((current) => [...current, ...next])
    if (failures.length > 0) setError({ message: `${failures.length} file${failures.length === 1 ? '' : 's'} could not be added.`, details: failures.join('\n') })
    else if (accepted.length === unique.length) setError(null)
    setInspecting(false)
  }

  const browse = async (): Promise<void> => {
    try { await inspectPaths(await window.localScribe.file.chooseMany()) }
    catch (cause) { setError({ message: errorMessage(cause) }) }
  }

  const drop = (event: React.DragEvent): void => {
    event.preventDefault()
    setDragging(false)
    const paths = Array.from(event.dataTransfer.files, (file) => window.localScribe.file.path(file)).filter(Boolean)
    void inspectPaths(paths)
  }

  const updateDraft = (id: string, patch: Partial<Pick<DraftItem, 'modelId' | 'language' | 'timestamps'>>): void => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft))
  }

  const enqueue = async (): Promise<void> => {
    if (drafts.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await window.localScribe.queue.add(drafts.map((draft) => ({
        mediaPath: draft.media.path,
        modelId: draft.modelId,
        language: draft.language,
        timestamps: draft.timestamps
      })))
      setDrafts([])
    } catch (cause) { setError({ message: errorMessage(cause) }) }
    finally { setSubmitting(false) }
  }

  const openResult = async (item: QueueItem): Promise<void> => {
    try {
      if (item.historyId) {
        const record = await window.localScribe.history.get(item.historyId)
        if (record) { setSelected({ record, persistEdits: true }); setError(null); return }
      }
      const value = await window.localScribe.queue.getResult(item.id)
      if (!value) throw new Error('This transcript result is no longer available.')
      setSelected({
        persistEdits: false,
        record: {
          id: item.id,
          fileName: value.media.fileName,
          mediaKind: value.media.kind,
          sizeBytes: value.media.sizeBytes,
          durationMs: value.media.durationMs,
          audioCodec: value.media.audioCodec,
          formatName: value.media.formatName,
          modelId: value.settings.modelId,
          requestedLanguage: value.settings.language,
          detectedLanguage: value.result.language,
          timestamps: value.settings.timestamps,
          createdAt: item.createdAt,
          updatedAt: item.createdAt,
          result: value.result
        }
      })
      setError(null)
    } catch (cause) { setError({ message: errorMessage(cause) }) }
  }

  return <div className="scrollbar h-screen overflow-y-auto p-8 lg:p-10">
    <header className="mx-auto flex max-w-6xl items-start justify-between">
      <div><h1 className="text-2xl font-bold tracking-tight">{selected ? 'Transcript' : 'New transcription'}</h1><p className="mt-1 text-sm text-[var(--muted)]">Processed entirely on this device, one file at a time.</p></div>
      <button className="button-primary" disabled={availableSlots === 0 || inspecting} onClick={() => { setSelected(null); void browse() }}><Plus size={17} /> Add files</button>
    </header>
    <div className="mx-auto mt-8 max-w-6xl">
      {error && <div className="mb-5"><ErrorBanner message={error.message} details={error.details} onDismiss={() => setError(null)} /></div>}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          {selected ? <TranscriptEditor key={selected.record.id} record={selected.record} persistEdits={selected.persistEdits} onNewFiles={() => setSelected(null)} /> : <>
            {drafts.length === 0 ? <UploadPanel
              dragging={dragging}
              inspecting={inspecting}
              disabled={availableSlots === 0}
              onBrowse={() => void browse()}
              onDragChange={setDragging}
              onDrop={drop}
            /> : <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div><h2 className="text-lg font-bold">Files ready to queue</h2><p className="mt-1 text-sm text-[var(--muted)]">Choose settings for each file. They will run in this order.</p></div>
                <button className="button-secondary" disabled={availableSlots === 0 || inspecting} onClick={() => void browse()}><Plus size={16} /> Add more</button>
              </div>
              {drafts.map((draft, index) => <DraftCard
                key={draft.id}
                draft={draft}
                index={index}
                models={installedModels}
                onChange={(patch) => updateDraft(draft.id, patch)}
                onRemove={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}
              />)}
              <div className="panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
                <span className="text-sm text-[var(--muted)]">{drafts.length} file{drafts.length === 1 ? '' : 's'} · {availableSlots} queue slots remaining</span>
                <button className="button-primary !min-h-12 !px-7" disabled={submitting || installedModels.length === 0} onClick={() => void enqueue()}><Sparkles size={18} /> {submitting ? 'Adding…' : 'Transcribe all'}</button>
              </div>
            </section>}
          </>}
        </div>
        <QueuePanel
          snapshot={queue}
          onOpen={(item) => void openResult(item)}
          onCancel={(id) => void window.localScribe.queue.cancel(id)}
          onRetry={(id) => void window.localScribe.queue.retry(id)}
          onStop={() => void window.localScribe.queue.cancelAll()}
          hasLiveItems={hasLiveItems}
        />
      </div>
    </div>
  </div>
}

function UploadPanel({
  dragging,
  inspecting,
  disabled,
  onBrowse,
  onDragChange,
  onDrop
}: {
  dragging: boolean
  inspecting: boolean
  disabled: boolean
  onBrowse: () => void
  onDragChange: (value: boolean) => void
  onDrop: (event: React.DragEvent) => void
}): React.JSX.Element {
  return <div
    className={`grid min-h-[480px] place-items-center rounded-3xl border-2 border-dashed px-8 text-center transition-colors ${dragging ? 'border-[var(--accent)] bg-[#171527]' : 'border-[#303744] bg-[var(--surface)]'}`}
    onDragEnter={(event) => { event.preventDefault(); onDragChange(true) }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={() => onDragChange(false)}
    onDrop={onDrop}
  >
    <div>
      <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--elevated)] text-[#a79dff]"><Upload size={29} /></div>
      <h2 className="mt-6 text-2xl font-bold">{inspecting ? 'Inspecting media…' : disabled ? 'Queue is full' : 'Drop up to 10 files here'}</h2>
      <p className="mt-2 text-[var(--muted)]">{disabled ? 'Wait for a file to finish or cancel a queued item.' : 'Audio and video files are processed sequentially.'}</p>
      <button className="button-primary mt-7 !min-h-12" disabled={disabled || inspecting} onClick={onBrowse}><FolderOpen size={18} /> Browse files</button>
      <p className="mt-6 text-xs text-[#687381]">MP4, MKV, MOV, WEBM, MP3, WAV, M4A, FLAC, OGG, OPUS and more</p>
      <div className="mt-8 inline-flex items-center gap-2 text-xs text-[var(--muted)]"><LockKeyhole size={14} className="text-[var(--success)]" /> Your media is never uploaded.</div>
    </div>
  </div>
}

function DraftCard({
  draft,
  index,
  models,
  onChange,
  onRemove
}: {
  draft: DraftItem
  index: number
  models: ModelView[]
  onChange: (patch: Partial<Pick<DraftItem, 'modelId' | 'language' | 'timestamps'>>) => void
  onRemove: () => void
}): React.JSX.Element {
  return <section className="panel rounded-2xl p-5">
    <div className="flex items-start gap-4">
      <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#222839] text-[#a79dff]">{draft.media.kind === 'video' ? <FileVideo2 /> : <FileAudio2 />}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold uppercase tracking-[.14em] text-[#687381]">File {index + 1}</div>
        <h3 className="mt-1 truncate font-bold" title={draft.media.fileName}>{draft.media.fileName}</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">{formatDuration(draft.media.durationMs)} · {formatBytes(draft.media.sizeBytes)}</p>
      </div>
      <button className="button-ghost !px-2" title="Remove file" onClick={onRemove}><X size={17} /></button>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="text-xs font-semibold">Model<select className="field mt-1.5" value={draft.modelId} onChange={(event) => onChange({ modelId: event.target.value as ModelId })}>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
      <label className="text-xs font-semibold">Language<select className="field mt-1.5" value={draft.language} onChange={(event) => onChange({ language: event.target.value as LanguageId })}>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs font-semibold">Timestamps<button type="button" role="switch" aria-checked={draft.timestamps} className="field mt-1.5 flex items-center justify-between" onClick={() => onChange({ timestamps: !draft.timestamps })}><span>{draft.timestamps ? 'Enabled' : 'Disabled'}</span><span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${draft.timestamps ? 'bg-[var(--accent)]' : 'bg-[#333b47]'}`}><span className={`block size-4 rounded-full bg-white transition-transform ${draft.timestamps ? 'translate-x-4' : ''}`} /></span></button></label>
    </div>
  </section>
}

function QueuePanel({
  snapshot,
  onOpen,
  onCancel,
  onRetry,
  onStop,
  hasLiveItems
}: {
  snapshot: QueueSnapshot
  onOpen: (item: QueueItem) => void
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onStop: () => void
  hasLiveItems: boolean
}): React.JSX.Element {
  const ordered = useMemo(() => [...snapshot.items].reverse(), [snapshot.items])
  return <aside className="panel overflow-hidden rounded-2xl lg:sticky lg:top-8">
    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-4">
      <div><h2 className="font-bold">Transcription queue</h2><p className="mt-1 text-xs text-[var(--muted)]">{snapshot.availableSlots} of {MAX_QUEUE_ITEMS} slots available</p></div>
      {hasLiveItems && <button className="button-danger !min-h-9 !px-2.5" title="Stop queue" onClick={onStop}><Ban size={15} /></button>}
    </div>
    <div className="scrollbar max-h-[660px] overflow-y-auto">
      {ordered.length === 0 ? <div className="px-5 py-12 text-center"><ListRestart className="mx-auto text-[#687381]" size={28} /><p className="mt-3 text-sm text-[var(--muted)]">Your queue is empty.</p></div> : ordered.map((item) => {
        const active = snapshot.activeItemId === item.id
        const completed = item.status === 'COMPLETED'
        return <div key={item.id} className={`border-b border-[var(--border)] p-4 last:border-0 ${active ? 'bg-[#171527]' : ''}`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${completed ? 'bg-[#183427] text-[var(--success)]' : 'bg-[#222839] text-[#a79dff]'}`}>{completed ? <CheckCircle2 size={17} /> : item.media.kind === 'video' ? <FileVideo2 size={17} /> : <FileAudio2 size={17} />}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold" title={item.media.fileName}>{item.media.fileName}</div><div className="mt-1 text-xs text-[var(--muted)]">{item.progress?.detail ?? statusLabel(item.status)} · {item.settings.modelId}</div></div>
          </div>
          {active && <div className="mt-3"><ProgressBar value={item.progress?.percent ?? 0} label={`${item.media.fileName} progress`} /><div className="mt-1 text-right text-xs text-[var(--muted)]">{Math.round(item.progress?.percent ?? 0)}%</div></div>}
          {item.error && <p className="mt-2 text-xs leading-5 text-[var(--danger)]">{item.error.message}</p>}
          {item.historyWarning && <p className="mt-2 text-xs leading-5 text-[var(--warning)]">{item.historyWarning}</p>}
          <div className="mt-3 flex gap-2">
            {completed && <button className="button-secondary !min-h-9 flex-1 !px-3" onClick={() => onOpen(item)}>View result</button>}
            {['FAILED', 'CANCELLED'].includes(item.status) && <button className="button-secondary !min-h-9 flex-1 !px-3" onClick={() => onRetry(item.id)}><RotateCcw size={14} /> Retry</button>}
            {liveStatuses.has(item.status) && <button className="button-ghost !min-h-9 !px-3" onClick={() => onCancel(item.id)}><Trash2 size={14} /> Cancel</button>}
          </div>
        </div>
      })}
    </div>
  </aside>
}

function statusLabel(status: QueueItem['status']): string {
  return ({
    QUEUED: 'Waiting',
    PREPARING: 'Preparing',
    EXTRACTING_AUDIO: 'Extracting audio',
    TRANSCRIBING: 'Transcribing',
    FINALIZING: 'Finalizing',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled'
  })[status]
}
