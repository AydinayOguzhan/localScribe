import { AlertTriangle, Check, Download, LoaderCircle, RotateCcw, Trash2, X } from 'lucide-react'
import type { DownloadProgress, ModelId, ModelView } from '../../../shared/types'
import { formatBytes } from '../utils'
import { ProgressBar } from './ProgressBar'

interface Props {
  model: ModelView
  progress?: DownloadProgress
  selected?: boolean
  disabled?: boolean
  onDownload(id: ModelId): void
  onSelect(id: ModelId): void
  onDelete?(id: ModelId): void
  onRepair?(id: ModelId): void
  onCancel?(id: ModelId): void
}

export function ModelCard({ model, progress, selected, disabled = false, onDownload, onSelect, onDelete, onRepair, onCancel }: Props): React.JSX.Element {
  const downloading = model.state === 'DOWNLOADING' || model.state === 'VERIFYING'
  const ready = model.state === 'READY' || model.state === 'ACTIVE'
  return <article className={`rounded-2xl border p-5 transition-colors ${selected || model.state === 'ACTIVE' ? 'border-[var(--accent)] bg-[#19182a]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{model.name}</h3>
          {model.recommended && <span className="rounded-full bg-[#292349] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#b9afff]">Recommended</span>}
          {model.state === 'ACTIVE' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--success)]"><Check size={13} /> Active</span>}
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">{model.description}</p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-[#c5ccd5]">{formatBytes(model.downloadSize)}</span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">
      <div className="rounded-lg bg-black/15 px-3 py-2"><span className="block text-[10px] uppercase tracking-wide">Speed</span><strong className="mt-0.5 block text-[var(--text)]">{model.speed}</strong></div>
      <div className="rounded-lg bg-black/15 px-3 py-2"><span className="block text-[10px] uppercase tracking-wide">Quality</span><strong className="mt-0.5 block text-[var(--text)]">{model.quality}</strong></div>
    </div>
    {model.warning && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[var(--warning)]"><AlertTriangle className="mt-0.5 shrink-0" size={14} />{model.warning}</p>}
    {downloading && <div className="mt-4" aria-live="polite">
      <div className="mb-2 flex justify-between text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-2">{!progress && <LoaderCircle className="animate-spin text-[#a79dff]" size={14} />}{!progress ? 'Preparing download…' : progress.stage === 'verifying' ? 'Verifying integrity…' : `${formatBytes(progress.downloadedBytes)} / ${formatBytes(progress.totalBytes)}`}</span>
        {progress && <span>{Math.round(progress.percent)}%</span>}
      </div>
      <ProgressBar value={progress?.percent ?? 0} label={`${model.name} download`} />
      {progress && progress.bytesPerSecond > 0 && <div className="mt-1.5 text-right text-[11px] text-[var(--muted)]">{formatBytes(progress.bytesPerSecond)}/s</div>}
    </div>}
    <div className="mt-5 flex flex-wrap gap-2">
      {!ready && !downloading && model.state !== 'ERROR' && <button className="button-primary flex-1" disabled={disabled} onClick={() => onDownload(model.id)}><Download size={16} /> Download</button>}
      {downloading && <button className="button-danger flex-1" onClick={() => onCancel?.(model.id)}><X size={16} /> Cancel</button>}
      {model.state === 'ERROR' && <button className="button-primary flex-1" disabled={disabled} onClick={() => onRepair?.(model.id)}><RotateCcw size={16} /> Retry</button>}
      {ready && model.state !== 'ACTIVE' && <button className="button-primary flex-1" disabled={disabled} onClick={() => onSelect(model.id)}>Use this model</button>}
      {ready && onDelete && <button className="button-ghost !px-3" disabled={disabled} onClick={() => onDelete(model.id)} aria-label={`Delete ${model.name}`}><Trash2 size={16} /></button>}
      {ready && onRepair && <button className="button-ghost !px-3" disabled={disabled} onClick={() => onRepair(model.id)} aria-label={`Verify ${model.name}`}><RotateCcw size={16} /></button>}
    </div>
  </article>
}
