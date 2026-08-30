import { AudioLines } from 'lucide-react'

export function Brand({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return <div className="flex items-center gap-3">
    <div className={`${compact ? 'size-9' : 'size-11'} grid place-items-center rounded-xl bg-[var(--accent)] text-white shadow-lg shadow-violet-950/25`}>
      <AudioLines size={compact ? 20 : 24} strokeWidth={2.2} />
    </div>
    <div>
      <div className={`${compact ? 'text-[17px]' : 'text-xl'} font-bold tracking-[-.02em]`}>LocalScribe</div>
      {!compact && <div className="mt-0.5 text-xs text-[var(--muted)]">Keep every word private.</div>}
    </div>
  </div>
}
