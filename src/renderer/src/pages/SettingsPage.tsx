import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, FolderOpen, HardDrive, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { languages } from '../../../shared/languages'
import type { AppSettings, ModelId, ModelView, RuntimeInfo, StorageInfo } from '../../../shared/types'
import { ErrorBanner } from '../components/ErrorBanner'
import { errorMessage, formatBytes } from '../utils'

export function SettingsPage(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [models, setModels] = useState<ModelView[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [repairing, setRepairing] = useState(false)

  const refresh = (): void => { void Promise.all([window.localScribe.settings.get(), window.localScribe.storage.info(), window.localScribe.runtime.info(), window.localScribe.models.list()]).then(([a, b, c, d]) => { setSettings(a); setStorage(b); setRuntime(c); setModels(d) }) }
  useEffect(refresh, [])
  useEffect(() => { if (!message) return; const id = window.setTimeout(() => setMessage(null), 2500); return () => window.clearTimeout(id) }, [message])
  const update = async (patch: Partial<AppSettings>): Promise<void> => { try { setSettings(await window.localScribe.settings.update(patch)); setMessage('Settings saved') } catch (cause) { setError(errorMessage(cause)) } }
  const repair = async (): Promise<void> => { setRepairing(true); setError(null); try { await window.localScribe.runtime.repair(); setMessage('Runtime verified'); refresh() } catch (cause) { setError(errorMessage(cause)) } finally { setRepairing(false) } }
  const clean = async (): Promise<void> => { try { await window.localScribe.storage.cleanTemp(); setMessage('Temporary files cleaned'); refresh() } catch (cause) { setError(errorMessage(cause)) } }
  if (!settings) return <div className="p-10 text-sm text-[var(--muted)]">Loading settings…</div>

  return <div className="scrollbar h-screen overflow-y-auto p-8 lg:p-10"><div className="mx-auto max-w-4xl">
    <header><h1 className="text-2xl font-bold tracking-tight">Settings</h1><p className="mt-1 text-sm text-[var(--muted)]">Tune LocalScribe for this computer.</p></header>
    {error && <div className="mt-6"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
    {message && <div className="mt-6 flex items-center gap-2 rounded-xl border border-[#28513d] bg-[#14251e] px-4 py-3 text-sm text-[#9ee4c2]"><CheckCircle2 size={17} />{message}</div>}

    <SettingSection title="Performance" description="Balanced keeps your computer responsive during long transcriptions.">
      <Field label="Performance profile"><select className="field" value={settings.performanceProfile} onChange={(event) => void update({ performanceProfile: event.target.value as AppSettings['performanceProfile'] })}><option value="quiet">Quiet — background use</option><option value="balanced">Balanced — recommended</option><option value="performance">Performance — faster, higher load</option></select></Field>
      <Field label="Hardware acceleration"><select className="field" value={settings.hardwareAcceleration} onChange={(event) => void update({ hardwareAcceleration: event.target.value as AppSettings['hardwareAcceleration'] })}><option value="auto">Auto</option><option value="cpu">CPU Only</option></select></Field>
    </SettingSection>

    <SettingSection title="Default transcription" description="Applied when you select a new file.">
      <Field label="Default model"><select className="field" value={settings.activeModel ?? ''} onChange={(event) => void window.localScribe.models.select(event.target.value as ModelId).then(refresh)}>{models.filter((model) => ['READY', 'ACTIVE'].includes(model.state)).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></Field>
      <Field label="Default language"><select className="field" value={settings.defaultLanguage} onChange={(event) => void update({ defaultLanguage: event.target.value as AppSettings['defaultLanguage'] })}>{languages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Include timestamps in TXT"><button role="switch" aria-checked={settings.timestamps} className="field flex items-center justify-between" onClick={() => void update({ timestamps: !settings.timestamps })}><span>{settings.timestamps ? 'Enabled' : 'Disabled'}</span><span className={`h-5 w-9 rounded-full p-0.5 ${settings.timestamps ? 'bg-[var(--accent)]' : 'bg-[#333b47]'}`}><span className={`block size-4 rounded-full bg-white transition-transform ${settings.timestamps ? 'translate-x-4' : ''}`} /></span></button></Field>
    </SettingSection>

    <SettingSection title="Storage" description={storage ? `Installed models use ${formatBytes(storage.modelsBytes)}.` : 'Calculating storage use…'}>
      {storage && <div className="col-span-2 space-y-3">
        <PathRow icon={<HardDrive />} label="Runtime" value={storage.runtimeDirectory} onOpen={() => void window.localScribe.storage.open('runtime')} />
        <PathRow icon={<FolderOpen />} label="Models" value={storage.modelsDirectory} onOpen={() => void window.localScribe.storage.open('models')} />
        <PathRow icon={<Trash2 />} label="Temporary files" value={storage.tempDirectory} onOpen={() => void window.localScribe.storage.open('temp')} />
        <button className="button-secondary mt-2" onClick={() => void clean()}><Trash2 size={16} /> Clean temporary files</button>
      </div>}
    </SettingSection>

    <SettingSection title="Runtime" description="Full verification reads each downloaded archive only when requested.">
      <div className="col-span-2 flex items-center justify-between rounded-xl bg-[var(--elevated)] p-4"><div className="flex items-center gap-3"><ShieldCheck className={runtime?.ready ? 'text-[var(--success)]' : 'text-[var(--danger)]'} /><div><div className="font-semibold">{runtime?.ready ? 'Ready' : 'Repair needed'}</div><div className="mt-1 text-xs text-[var(--muted)]">FFmpeg {runtime?.ffmpegVersion} · Whisper {runtime?.whisperVersion}</div></div></div><button className="button-secondary" disabled={repairing} onClick={() => void repair()}><RotateCcw size={16} />{repairing ? 'Verifying…' : 'Verify / Repair'}</button></div>
    </SettingSection>

    <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[#0f1318] p-5 text-sm leading-6 text-[var(--muted)]"><ShieldCheck className="mt-0.5 shrink-0 text-[var(--success)]" size={20} /><div><strong className="block text-[var(--text)]">Private by design</strong>LocalScribe does not upload your media or transcript. Transcription runs locally using whisper.cpp, and normal transcription makes no network requests.</div></div>
  </div></div>
}

function SettingSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }): React.JSX.Element { return <section className="mt-8 border-t border-[var(--border)] pt-7"><div className="grid grid-cols-[220px_1fr] gap-8"><div><h2 className="font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p></div><div className="grid grid-cols-2 gap-4">{children}</div></div></section> }
function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element { return <label className="text-sm font-semibold"><span className="mb-2 block">{label}</span>{children}</label> }
function PathRow({ icon, label, value, onOpen }: { icon: React.ReactNode; label: string; value: string; onOpen(): void }): React.JSX.Element { return <div className="flex items-center gap-3 rounded-xl bg-[var(--elevated)] p-3"><span className="text-[#a79dff] [&>svg]:size-[18px]">{icon}</span><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{label}</div><div className="truncate text-xs text-[var(--muted)]" title={value}>{value}</div></div><button className="button-ghost !min-h-8 !px-2" onClick={onOpen} aria-label={`Open ${label} folder`}><ExternalLink size={15} /></button></div> }
