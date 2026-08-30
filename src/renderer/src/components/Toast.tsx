import { CheckCircle2, X } from 'lucide-react'

export function Toast({ message, onClose }: { message: string; onClose(): void }): React.JSX.Element {
  return <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-[#284a3b] bg-[#14251e] px-4 py-3 text-sm text-[#9ee4c2] shadow-2xl">
    <CheckCircle2 size={17} /><span>{message}</span>
    <button className="ml-2 rounded p-1 hover:bg-white/5" onClick={onClose} aria-label="Close notification"><X size={15} /></button>
  </div>
}
