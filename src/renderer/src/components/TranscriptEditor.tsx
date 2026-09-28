import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Clipboard, Clock3, FileText, Plus, Save } from 'lucide-react'
import { formatShortClock, toSrt, toTxt, toVtt } from '../../../shared/transcriptFormat'
import type { HistoryRecord, TranscriptSegment } from '../../../shared/types'
import { ErrorBanner } from './ErrorBanner'
import { Toast } from './Toast'
import { formatDuration } from '../utils'

export function TranscriptEditor({
  record,
  persistEdits = true,
  onNewFiles
}: {
  record: HistoryRecord
  persistEdits?: boolean
  onNewFiles?: () => void
}): React.JSX.Element {
  const [segments, setSegments] = useState<TranscriptSegment[]>(record.result.segments)
  const [timestamps, setTimestamps] = useState(record.timestamps)
  const [toast, setToast] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const latest = useRef<TranscriptSegment[]>(record.result.segments)
  const dirty = useRef(false)

  useEffect(() => {
    setSegments(record.result.segments)
    setTimestamps(record.timestamps)
    latest.current = record.result.segments
    dirty.current = false
    setSaveError(null)
  }, [record.id, record.result.segments, record.timestamps])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (persistEdits && dirty.current) void window.localScribe.history.updateSegments(record.id, latest.current)
  }, [persistEdits, record.id])

  const editedResult = useMemo(() => ({ ...record.result, segments }), [record.result, segments])

  const changeSegment = (index: number, text: string): void => {
    const next = segments.map((segment, segmentIndex) => segmentIndex === index ? { ...segment, text } : segment)
    setSegments(next)
    latest.current = next
    if (!persistEdits) return
    dirty.current = true
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void window.localScribe.history.updateSegments(record.id, latest.current)
        .then(() => { dirty.current = false; setSaveError(null) })
        .catch((error: unknown) => setSaveError(error instanceof Error ? error.message : String(error)))
    }, 600)
  }

  const exportFile = async (format: 'txt' | 'srt' | 'vtt'): Promise<void> => {
    const content = format === 'txt' ? toTxt(editedResult, timestamps) : format === 'srt' ? toSrt(editedResult) : toVtt(editedResult)
    const stem = record.fileName.replace(/.[^.]+$/, '')
    const saved = await window.localScribe.export.save({ format, defaultName: `${stem}.${format}`, content })
    if (saved) setToast(`${format.toUpperCase()} saved`)
  }

  const copy = async (): Promise<void> => {
    await window.localScribe.clipboard.copy(toTxt(editedResult, timestamps))
    setToast('Copied to clipboard')
  }

  return <div className="space-y-5">
    {saveError && <ErrorBanner message="Changes could not be saved to History." details={saveError} onDismiss={() => setSaveError(null)} />}
    <section className="panel rounded-2xl p-5">
      <div className="flex items-center gap-4">
        <div className="grid size-12 place-items-center rounded-full bg-[#183427] text-[var(--success)]"><CheckCircle2 size={25} /></div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[var(--success)]">Completed</div>
          <h2 className="truncate text-lg font-bold">{record.fileName}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{record.detectedLanguage?.toUpperCase() ?? 'Auto detected'} · {formatDuration(record.durationMs)} · {record.modelId}</p>
        </div>
        {onNewFiles && <button className="button-primary shrink-0" onClick={onNewFiles}><Plus size={17} /> New files</button>}
      </div>
    </section>
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
    <section className="panel rounded-2xl p-3">
      <div className="max-h-[480px] overflow-y-auto scrollbar">
        {segments.map((segment, index) => <div key={`${segment.startMs}-${index}`} className={`flex border-b border-[var(--border)] px-4 py-3 last:border-0 ${timestamps ? 'gap-4' : ''}`}>
          {timestamps && <span className="mt-2 w-20 shrink-0 font-mono text-xs text-[#9488f8]">{formatShortClock(segment.startMs)}</span>}
          <textarea
            aria-label={`Transcript segment ${index + 1}`}
            className="min-h-10 flex-1 resize-none bg-transparent py-1 text-[15px] leading-6 text-[var(--text)] outline-none"
            value={segment.text}
            rows={Math.max(1, Math.ceil(segment.text.length / 85))}
            onChange={(event) => changeSegment(index, event.target.value)}
          />
        </div>)}
      </div>
    </section>
    {toast && <Toast message={toast} onClose={() => setToast(null)} />}
  </div>
}
