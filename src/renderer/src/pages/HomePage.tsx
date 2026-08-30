import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clipboard, Clock3, FileAudio2, FileText, FileVideo2, FolderOpen, LockKeyhole, RotateCcw, Save, Sparkles, Upload } from 'lucide-react'
import { languages } from '../../../shared/languages'
import { formatShortClock, toSrt, toTxt, toVtt } from '../../../shared/transcriptFormat'
import type { AppSettings, MediaMetadata, ModelId, ModelView, TranscriptSegment, TranscriptionCompleted, TranscriptionProgress } from '../../../shared/types'
import { ErrorBanner } from '../components/ErrorBanner'
import { ProgressBar } from '../components/ProgressBar'
import { Toast } from '../components/Toast'
import { errorMessage, formatBytes, formatDuration } from '../utils'

type View = 'empty' | 'selected' | 'processing' | 'result'

export function HomePage({ active }: { active: boolean }): React.JSX.Element {
  const [view, setView] = useState<View>('empty')
  const [dragging, setDragging] = useState(false)
  const [media, setMedia] = useState<MediaMetadata | null>(null)
  const [models, setModels] = useState<ModelView[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [modelId, setModelId] = useState<ModelId>('small')
  const [language, setLanguage] = useState<AppSettings['defaultLanguage']>('auto')
  const [timestamps, setTimestamps] = useState(true)
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null)
  const [completed, setCompleted] = useState<TranscriptionCompleted | null>(null)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [error, setError] = useState<{ message: string; details?: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState(false)

  useEffect(() => {
    void Promise.all([window.localScribe.models.list(), window.localScribe.settings.get()]).then(([modelList, nextSettings]) => {
      setModels(modelList); setSettings(nextSettings); setModelId(nextSettings.activeModel ?? 'small'); setLanguage(nextSettings.defaultLanguage); setTimestamps(nextSettings.timestamps)
    })
    const removeProgress = window.localScribe.transcription.onProgress((next) => { setProgress(next); if (next.stage !== 'FAILED' && next.stage !== 'CANCELLED') setView(next.stage === 'COMPLETED' ? 'result' : 'processing') })
    const removeCompleted = window.localScribe.transcription.onCompleted((next) => { setCompleted(next); setSegments(next.result.segments); setView('result') })
    const removeError = window.localScribe.transcription.onError((next) => { setError(next); setView('selected') })
    return () => { removeProgress(); removeCompleted(); removeError() }
  }, [])

  useEffect(() => {
    if (!active || view === 'processing') return
    void window.localScribe.models.list().then((list) => {
      setModels(list)
      const activeModel = list.find((model) => model.state === 'ACTIVE')
      if (activeModel) setModelId(activeModel.id)
    })
  }, [active, view])

  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 2200); return () => window.clearTimeout(id) }, [toast])

  const inspect = async (path: string): Promise<void> => {
    if (!path) return
    setInspecting(true); setError(null)
    try { setMedia(await window.localScribe.media.inspect(path)); setView('selected') } catch (cause) { setError({ message: errorMessage(cause) }); setView('empty') } finally { setInspecting(false) }
  }
  const browse = async (): Promise<void> => { const path = await window.localScribe.file.choose(); if (path) await inspect(path) }
  const drop = (event: React.DragEvent): void => {
    event.preventDefault(); setDragging(false)
    const file = event.dataTransfer.files.item(0)
    if (file) void inspect(window.localScribe.file.path(file))
  }
  const transcribe = async (): Promise<void> => {
    if (!media) return
    setError(null); setView('processing'); setProgress(null)
    try { await window.localScribe.transcription.start({ mediaPath: media.path, modelId, language, timestamps }) }
    catch (cause) { setError({ message: errorMessage(cause) }); setView('selected') }
  }
  const cancel = async (): Promise<void> => { await window.localScribe.transcription.cancel(); setProgress(null); setView(media ? 'selected' : 'empty') }
  const reset = (): void => { setMedia(null); setCompleted(null); setSegments([]); setProgress(null); setError(null); setView('empty') }

  const editedResult = useMemo(() => completed ? { ...completed.result, segments } : null, [completed, segments])
  const exportFile = async (format: 'txt' | 'srt' | 'vtt'): Promise<void> => {
    if (!editedResult || !media) return
    const content = format === 'txt' ? toTxt(editedResult, timestamps) : format === 'srt' ? toSrt(editedResult) : toVtt(editedResult)
    const stem = media.fileName.replace(/\.[^.]+$/, '')
    const saved = await window.localScribe.export.save({ format, defaultName: `${stem}.${format}`, content })
    if (saved) setToast(`${format.toUpperCase()} saved`)
  }
  const copy = async (): Promise<void> => { if (editedResult) { await window.localScribe.clipboard.copy(toTxt(editedResult, timestamps)); setToast('Copied to clipboard') } }

  return <div className="scrollbar h-screen overflow-y-auto p-8 lg:p-10">
    <header className="mx-auto flex max-w-4xl items-start justify-between"><div><h1 className="text-2xl font-bold tracking-tight">{view === 'result' ? 'Transcript' : 'New transcription'}</h1><p className="mt-1 text-sm text-[var(--muted)]">Processed entirely on this device.</p></div>{view !== 'empty' && view !== 'processing' && <button className="button-ghost" onClick={reset}><RotateCcw size={16} /> Start over</button>}</header>
    <div className="mx-auto mt-8 max-w-4xl">
      {error && <div className="mb-5"><ErrorBanner message={error.message} details={error.details} onDismiss={() => setError(null)} /></div>}
      {view === 'empty' && <div
        className={`grid min-h-[480px] place-items-center rounded-3xl border-2 border-dashed px-8 text-center transition-colors ${dragging ? 'border-[var(--accent)] bg-[#171527]' : 'border-[#303744] bg-[var(--surface)]'}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <div><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--elevated)] text-[#a79dff]"><Upload size={29} /></div>
          <h2 className="mt-6 text-2xl font-bold">{inspecting ? 'Inspecting media…' : 'Drop audio or video here'}</h2><p className="mt-2 text-[var(--muted)]">or choose a file from your computer</p>
          <button className="button-primary mt-7 !min-h-12" disabled={inspecting} onClick={() => void browse()}><FolderOpen size={18} /> Browse files</button>
          <p className="mt-6 text-xs text-[#687381]">MP4, MKV, MOV, WEBM, MP3, WAV, M4A, FLAC, OGG, OPUS and more</p>
          <div className="mt-8 inline-flex items-center gap-2 text-xs text-[var(--muted)]"><LockKeyhole size={14} className="text-[var(--success)]" /> Your media is never uploaded.</div>
        </div>
      </div>}

      {view === 'selected' && media && <div className="space-y-5">
        <MediaCard media={media} />
        <section className="panel rounded-2xl p-6"><h2 className="text-sm font-bold uppercase tracking-[.14em] text-[var(--muted)]">Transcription settings</h2>
          <div className="mt-5 grid grid-cols-3 gap-4">
            <label className="text-sm font-semibold">Model<select className="field mt-2" value={modelId} onChange={(event) => setModelId(event.target.value as ModelId)}>{models.filter((model) => ['READY', 'ACTIVE'].includes(model.state)).map((model) => <option key={model.id} value={model.id}>{model.name}{model.recommended ? ' — Recommended' : ''}</option>)}</select></label>
            <label className="text-sm font-semibold">Language<select className="field mt-2" value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-semibold">Timestamps<button type="button" role="switch" aria-checked={timestamps} className="field mt-2 flex items-center justify-between" onClick={() => setTimestamps(!timestamps)}><span>{timestamps ? 'Enabled' : 'Disabled'}</span><span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${timestamps ? 'bg-[var(--accent)]' : 'bg-[#333b47]'}`}><span className={`block size-4 rounded-full bg-white transition-transform ${timestamps ? 'translate-x-4' : ''}`} /></span></button></label>
          </div>
          <div className="mt-7 flex gap-3"><button className="button-primary !min-h-12 !px-7" disabled={!settings} onClick={() => void transcribe()}><Sparkles size={18} /> Transcribe</button><button className="button-secondary !min-h-12" onClick={() => void browse()}>Choose another file</button></div>
        </section>
      </div>}

      {view === 'processing' && media && <section className="panel rounded-3xl p-8">
        <div className="flex items-center gap-4"><div className="grid size-14 place-items-center rounded-2xl bg-[#222839] text-[#a79dff]">{media.kind === 'video' ? <FileVideo2 /> : <FileAudio2 />}</div><div className="min-w-0"><h2 className="truncate text-xl font-bold">{media.fileName}</h2><p className="mt-1 text-sm text-[var(--muted)]">{modelId} · {languages.find((item) => item.id === language)?.name}</p></div></div>
        <div className="mt-12 text-center"><div className="text-sm font-bold uppercase tracking-[.16em] text-[#a79dff]">{stageLabel(progress?.stage ?? 'PREPARING')}</div><div className="mt-3 text-6xl font-bold tracking-tight">{Math.round(progress?.percent ?? 0)}<span className="text-3xl text-[var(--muted)]">%</span></div></div>
        <div className="mx-auto mt-8 max-w-2xl"><ProgressBar value={progress?.percent ?? 0} label="Transcription progress" /><div className="mt-3 flex justify-between text-sm text-[var(--muted)]"><span>{formatDuration(progress?.processedMs ?? 0)} / {formatDuration(media.durationMs)}</span><span>Elapsed {formatDuration(progress?.elapsedMs ?? 0)}</span></div></div>
        <div className="mt-10 text-center"><button className="button-danger" onClick={() => void cancel()}>Cancel transcription</button></div>
      </section>}

      {view === 'result' && completed && editedResult && <div className="space-y-5">
        <section className="panel rounded-2xl p-5"><div className="flex items-center gap-4"><div className="grid size-12 place-items-center rounded-full bg-[#183427] text-[var(--success)]"><CheckCircle2 size={25} /></div><div className="min-w-0 flex-1"><div className="font-bold text-[var(--success)]">Completed</div><h2 className="truncate text-lg font-bold">{completed.media.fileName}</h2><p className="mt-1 text-xs text-[var(--muted)]">{completed.result.language?.toUpperCase() ?? 'Auto detected'} · {formatDuration(completed.media.durationMs)} · {completed.modelId}</p></div></div></section>
        <div className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-2xl border border-[var(--border)] bg-[#12161cf2] p-3 backdrop-blur">
          <button className="button-secondary" onClick={() => void copy()}><Clipboard size={16} /> Copy</button>
          <button className="button-secondary" onClick={() => void exportFile('txt')}><FileText size={16} /> Save TXT</button>
          <button className="button-secondary" onClick={() => void exportFile('srt')}><Save size={16} /> Save SRT</button>
          <button className="button-secondary" onClick={() => void exportFile('vtt')}><Save size={16} /> Save VTT</button>
          <button
            type="button"
            role="switch"
            aria-checked={timestamps}
            className={`button-secondary ml-auto ${timestamps ? '!border-[#51479a] !bg-[#24203e] text-[#c7c0ff]' : ''}`}
            title="Applies to the transcript view, Copy, and TXT export. SRT and VTT always contain timestamps."
            onClick={() => setTimestamps(!timestamps)}
          ><Clock3 size={16} /> Timestamps {timestamps ? 'on' : 'off'}</button>
        </div>
        <section className="panel rounded-2xl p-3"><div className="max-h-[480px] overflow-y-auto scrollbar">{segments.map((segment, index) => <div key={`${segment.startMs}-${index}`} className={`flex border-b border-[var(--border)] px-4 py-3 last:border-0 ${timestamps ? 'gap-4' : ''}`}>{timestamps && <span className="mt-2 w-20 shrink-0 font-mono text-xs text-[#9488f8]">{formatShortClock(segment.startMs)}</span>}<textarea aria-label={`Transcript segment ${index + 1}`} className="min-h-10 flex-1 resize-none bg-transparent py-1 text-[15px] leading-6 text-[var(--text)] outline-none" value={segment.text} rows={Math.max(1, Math.ceil(segment.text.length / 85))} onChange={(event) => setSegments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} /></div>)}</div></section>
      </div>}
    </div>
    {toast && <Toast message={toast} onClose={() => setToast(null)} />}
  </div>
}

function MediaCard({ media }: { media: MediaMetadata }): React.JSX.Element {
  return <section className="panel flex items-center gap-5 rounded-2xl p-6"><div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[#222839] text-[#a79dff]">{media.kind === 'video' ? <FileVideo2 size={28} /> : <FileAudio2 size={28} />}</div><div className="min-w-0 flex-1"><h2 className="truncate text-xl font-bold" title={media.fileName}>{media.fileName}</h2><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--muted)]"><span>{formatDuration(media.durationMs)}</span><span>{formatBytes(media.sizeBytes)}</span><span>{media.audioCodec} Audio</span><span>{media.kind === 'video' ? 'Video' : media.formatName}</span></div></div></section>
}
function stageLabel(stage: TranscriptionProgress['stage']): string { return ({ PREPARING: 'Preparing', EXTRACTING_AUDIO: 'Extracting audio', TRANSCRIBING: 'Transcribing', FINALIZING: 'Finalizing', COMPLETED: 'Completed', FAILED: 'Failed', CANCELLED: 'Cancelled' })[stage] }
