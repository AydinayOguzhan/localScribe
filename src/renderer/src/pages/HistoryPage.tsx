import { useCallback, useEffect, useState } from 'react'
import { Clock3, FileAudio2, FileVideo2, History, Trash2 } from 'lucide-react'
import type { HistoryRecord, HistorySummary } from '../../../shared/types'
import { ErrorBanner } from '../components/ErrorBanner'
import { TranscriptEditor } from '../components/TranscriptEditor'
import { errorMessage, formatDuration } from '../utils'

export function HistoryPage({ active }: { active: boolean }): React.JSX.Element {
  const [items, setItems] = useState<HistorySummary[]>([])
  const [selected, setSelected] = useState<HistoryRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadList = useCallback(async (): Promise<void> => {
    try {
      const next = await window.localScribe.history.list()
      setItems(next)
      setError(null)
      setSelected((current) => current && !next.some((item) => item.id === current.id) ? null : current)
    } catch (cause) { setError(errorMessage(cause)) }
  }, [])

  useEffect(() => {
    void loadList()
    return window.localScribe.history.onChanged(() => void loadList())
  }, [loadList])

  useEffect(() => { if (active) void loadList() }, [active, loadList])

  const open = async (id: string): Promise<void> => {
    try { setSelected(await window.localScribe.history.get(id)); setError(null) }
    catch (cause) { setError(errorMessage(cause)) }
  }

  const remove = async (id: string): Promise<void> => {
    if (!window.confirm('Delete this transcript from History?')) return
    try {
      await window.localScribe.history.delete(id)
      if (selected?.id === id) setSelected(null)
    } catch (cause) { setError(errorMessage(cause)) }
  }

  const clear = async (): Promise<void> => {
    if (!window.confirm('Delete all transcript history? This cannot be undone.')) return
    try { await window.localScribe.history.clear(); setSelected(null) }
    catch (cause) { setError(errorMessage(cause)) }
  }

  return <div className="scrollbar h-screen overflow-y-auto p-8 lg:p-10">
    <header className="mx-auto flex max-w-6xl items-start justify-between">
      <div><h1 className="text-2xl font-bold tracking-tight">History</h1><p className="mt-1 text-sm text-[var(--muted)]">Your latest 10 transcripts, stored only on this device.</p></div>
      {items.length > 0 && <button className="button-danger" onClick={() => void clear()}><Trash2 size={16} /> Clear history</button>}
    </header>
    <div className="mx-auto mt-8 max-w-6xl">
      {error && <div className="mb-5"><ErrorBanner message="History is unavailable." details={error} onDismiss={() => setError(null)} /></div>}
      <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="panel overflow-hidden rounded-2xl">
          {items.length === 0 ? <div className="px-6 py-14 text-center">
            <History className="mx-auto text-[#687381]" size={30} />
            <h2 className="mt-4 font-bold">No transcripts yet</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Completed transcriptions will appear here automatically.</p>
          </div> : items.map((item) => <div key={item.id} className={`group flex border-b border-[var(--border)] last:border-0 ${selected?.id === item.id ? 'bg-[#211e36]' : ''}`}>
            <button className="min-w-0 flex-1 px-4 py-4 text-left" onClick={() => void open(item.id)}>
              <div className="flex items-center gap-2">
                {item.mediaKind === 'video' ? <FileVideo2 className="shrink-0 text-[#a79dff]" size={17} /> : <FileAudio2 className="shrink-0 text-[#a79dff]" size={17} />}
                <span className="truncate text-sm font-bold">{item.fileName}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                <Clock3 size={13} /> {formatDuration(item.durationMs)} · {item.modelId}
              </div>
              <div className="mt-1 text-xs text-[#687381]">{new Date(item.createdAt).toLocaleString()}</div>
            </button>
            <button className="px-3 text-[#687381] opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100" title="Delete transcript" onClick={() => void remove(item.id)}><Trash2 size={16} /></button>
          </div>)}
        </section>
        <div className="min-w-0">
          {selected ? <TranscriptEditor record={selected} /> : <section className="panel grid min-h-72 place-items-center rounded-2xl px-6 text-center text-sm text-[var(--muted)]">Select a transcript to view, edit, copy, or export it.</section>}
        </div>
      </div>
    </div>
  </div>
}
