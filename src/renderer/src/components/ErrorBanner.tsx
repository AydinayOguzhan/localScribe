import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

export function ErrorBanner({ message, details, onDismiss }: { message: string; details?: string; onDismiss?(): void }): React.JSX.Element {
  const [shown, setShown] = useState(false)
  return <div role="alert" className="rounded-xl border border-[#56323a] bg-[#28191e] p-4 text-sm text-[#ffb7be]">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 shrink-0" size={18} />
      <div className="min-w-0 flex-1"><div className="font-semibold">{message}</div>
        {details && <button className="mt-2 inline-flex items-center gap-1 text-xs text-[#d99aa1]" onClick={() => setShown(!shown)}>
          {shown ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Show details
        </button>}
        {shown && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 text-xs">{details}</pre>}
      </div>
      {onDismiss && <button className="button-ghost !min-h-7 !px-2 text-xs" onClick={onDismiss}>Dismiss</button>}
    </div>
  </div>
}
