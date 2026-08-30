export function ProgressBar({ value, label }: { value: number; label: string }): React.JSX.Element {
  const safe = Math.max(0, Math.min(100, value))
  return <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safe)}>
    <div className="progress-fill" style={{ width: `${safe}%` }} />
  </div>
}
