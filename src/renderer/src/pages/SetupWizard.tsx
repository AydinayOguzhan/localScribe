import { useEffect, useMemo, useState } from 'react'
import { AudioWaveform, Check, CheckCircle2, ChevronRight, Cpu, Database, Download, HardDrive, MemoryStick, ShieldCheck, Sparkles } from 'lucide-react'
import type { DownloadProgress, ModelId, ModelView, SetupStatus, SystemInfo } from '../../../shared/types'
import { Brand } from '../components/Brand'
import { ErrorBanner } from '../components/ErrorBanner'
import { ModelCard } from '../components/ModelCard'
import { ProgressBar } from '../components/ProgressBar'
import { errorMessage, formatBytes } from '../utils'

export function SetupWizard({ initialStatus, onComplete }: { initialStatus: SetupStatus; onComplete(): void }): React.JSX.Element {
  const hasExistingModel = initialStatus.activeModel !== null && initialStatus.installedModelIds.includes(initialStatus.activeModel)
  const [page, setPage] = useState(initialStatus.runtimeReady ? 3 : hasExistingModel ? 2 : 0)
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [models, setModels] = useState<ModelView[]>([])
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ModelId>(initialStatus.activeModel ?? 'small')

  useEffect(() => {
    void Promise.all([window.localScribe.system.getInfo(), window.localScribe.models.list()]).then(([info, list]) => {
      setSystem(info); setModels(list)
      if (!initialStatus.activeModel) setSelected(info.totalMemoryBytes < 6 * 1024 ** 3 ? 'base' : info.totalMemoryBytes >= 24 * 1024 ** 3 ? 'medium' : 'small')
    })
    return window.localScribe.setup.onProgress((value) => setProgress((current) => ({ ...current, [value.artifactId]: value })))
  }, [initialStatus.activeModel])

  const overall = useMemo(() => {
    const values = Object.values(progress).filter((item) => !item.artifactId.startsWith('model-'))
    const expected = system?.platform === 'win32' ? 3 : 4
    return values.length ? values.reduce((sum, item) => sum + item.percent, 0) / expected : initialStatus.runtimeReady ? 100 : 0
  }, [progress, initialStatus.runtimeReady, system?.platform])

  const installRuntime = async (): Promise<void> => {
    setBusy(true); setError(null)
    try {
      const status = await window.localScribe.setup.installRuntime()
      if (status.activeModel && status.installedModelIds.includes(status.activeModel)) { setSelected(status.activeModel); setPage(4) }
      else setPage(3)
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }
  const downloadModel = async (id: ModelId): Promise<void> => {
    setBusy(true); setError(null); setSelected(id)
    setProgress((current) => {
      const next = { ...current }
      delete next[`model-${id}`]
      return next
    })
    setModels((current) => current.map((model) => model.id === id ? { ...model, state: 'DOWNLOADING' } : model))
    try {
      setModels(await window.localScribe.models.download(id)); setPage(4)
    } catch (cause) {
      if (!/abort/i.test(errorMessage(cause))) setError(errorMessage(cause))
      setModels(await window.localScribe.models.list())
    } finally { setBusy(false) }
  }
  const cancelModel = async (id: ModelId): Promise<void> => {
    await window.localScribe.models.cancel(id)
    setProgress((current) => {
      const next = { ...current }
      delete next[`model-${id}`]
      return next
    })
    setModels(await window.localScribe.models.list())
    setBusy(false)
  }
  const finish = async (): Promise<void> => {
    setBusy(true); setError(null)
    try { await window.localScribe.setup.complete(selected); onComplete() } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false) }
  }

  const steps = ['Welcome', 'System', 'Components', 'Model', 'Ready']
  return <main className="flex h-screen overflow-hidden bg-[var(--bg)]">
    <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[#0e1116] p-8">
      <Brand />
      <ol className="mt-14 space-y-5">{steps.map((step, index) => <li key={step} className={`flex items-center gap-3 text-sm ${index === page ? 'font-semibold text-white' : index < page ? 'text-[var(--success)]' : 'text-[#687381]'}`}>
        <span className={`grid size-7 place-items-center rounded-full border ${index === page ? 'border-[var(--accent)] bg-[#272244] text-white' : index < page ? 'border-[#2d7052] bg-[#183427]' : 'border-[#303641]'}`}>
          {index < page ? <Check size={14} /> : index + 1}
        </span>{step}</li>)}</ol>
      <div className="mt-auto flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"><ShieldCheck className="mt-0.5 shrink-0 text-[var(--success)]" size={16} />Runtime files are verified and stored only on this computer.</div>
    </aside>

    <section className="scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto px-10">
      <div className="mx-auto w-full max-w-3xl py-10">
        {error && <div className="mb-5"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
        {page === 0 && <div className="max-w-2xl">
          <div className="mb-8 grid size-16 place-items-center rounded-2xl bg-[#24203e] text-[#a79dff]"><Sparkles size={30} /></div>
          <h1 className="text-4xl font-bold tracking-tight">Private transcription,<br />beautifully simple.</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--muted)]">LocalScribe transcribes audio and video entirely on your computer. Your media never leaves your device.</p>
          <p className="mt-7 font-semibold text-[#c7c0ff]">Drop it. Transcribe it. Keep it local.</p>
          <button className="button-primary mt-10 !min-h-12 !px-6" onClick={() => setPage(1)}>Continue <ChevronRight size={18} /></button>
        </div>}

        {page === 1 && <div>
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[#a79dff]">System check</p>
          <h1 className="mt-3 text-3xl font-bold">This computer</h1>
          <p className="mt-2 text-[var(--muted)]">We use this information only to recommend efficient local settings.</p>
          {system ? <div className="panel mt-8 rounded-2xl p-6">
            <div className="flex items-center gap-4 border-b border-[var(--border)] pb-5"><div className="grid size-12 place-items-center rounded-xl bg-[#222839]"><Cpu className="text-[#a79dff]" /></div><div><div className="text-lg font-bold">{system.deviceLabel}</div><div className="text-sm text-[var(--muted)]">{system.osName} · {system.architecture}</div></div></div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Info icon={<Cpu />} label="Processor" value={system.cpuModel} />
              <Info icon={<MemoryStick />} label="Memory" value={formatBytes(system.totalMemoryBytes)} />
              <Info icon={<HardDrive />} label="Available storage" value={formatBytes(system.freeDiskBytes)} />
              <Info icon={<Sparkles />} label="Acceleration" value={system.acceleration} />
            </div>
            {!system.supportedPlatform && <div className="mt-5"><ErrorBanner message={`LocalScribe does not yet support ${system.platform} ${system.architecture}.`} /></div>}
          </div> : <div className="mt-8 text-[var(--muted)]">Checking your system…</div>}
          <button className="button-primary mt-8" disabled={!system?.supportedPlatform} onClick={() => setPage(2)}>Continue <ChevronRight size={18} /></button>
        </div>}

        {page === 2 && <div>
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[#a79dff]">Local runtime</p><h1 className="mt-3 text-3xl font-bold">Install required components</h1>
          <p className="mt-2 text-[var(--muted)]">Downloaded once, verified, and kept outside the app installer.</p>
          <div className="mt-7 space-y-3">
            <ComponentRow icon={<Download />} name="FFmpeg" note="Converts video and audio into transcription-ready sound" ready={initialStatus.runtimeReady || overall === 100} progress={Object.values(progress).find((p) => p.artifactId.includes('ffmpeg') || p.artifactId.includes('media'))} />
            <ComponentRow icon={<Database />} name="ffprobe" note="Reads media metadata without opening the whole file" ready={initialStatus.runtimeReady || overall === 100} progress={Object.values(progress).find((p) => p.artifactId.includes('ffprobe') || p.artifactId.includes('media'))} />
            <ComponentRow icon={<Cpu />} name="Whisper Runtime" note="Runs speech recognition locally in an isolated process" ready={initialStatus.runtimeReady || overall === 100} progress={Object.values(progress).find((p) => p.artifactId.includes('whisper'))} />
            <ComponentRow icon={<AudioWaveform />} name="Voice detection" note="Finds spoken sections and ignores silence locally" ready={initialStatus.runtimeReady || overall === 100} progress={Object.values(progress).find((p) => p.artifactId.includes('vad-'))} />
          </div>
          {busy && <div className="mt-6"><div className="mb-2 flex justify-between text-sm text-[var(--muted)]"><span>Overall setup progress</span><span>{Math.round(overall)}%</span></div><ProgressBar value={overall} label="Overall setup" /></div>}
          <button className="button-primary mt-8" disabled={busy} onClick={() => void installRuntime()}>{busy ? 'Installing…' : initialStatus.runtimeReady ? 'Continue' : 'Download components'} <ChevronRight size={18} /></button>
        </div>}

        {page === 3 && <div>
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[#a79dff]">Transcription model</p><h1 className="mt-3 text-3xl font-bold">Choose your starting model</h1>
          <p className="mt-2 text-[var(--muted)]">Small is the best balance for most computers. You can add or switch models later.</p>
          <div className="mt-7 grid grid-cols-1 gap-4 min-[1024px]:grid-cols-2">{models.map((model) => <ModelCard key={model.id} model={model} selected={selected === model.id} disabled={busy && selected !== model.id} progress={progress[`model-${model.id}`]} onDownload={(id) => void downloadModel(id)} onSelect={(id) => { setSelected(id); setPage(4) }} onCancel={(id) => void cancelModel(id)} onRepair={(id) => void downloadModel(id)} />)}</div>
        </div>}

        {page === 4 && <div className="text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full border border-[#2f7656] bg-[#173326] text-[var(--success)]"><CheckCircle2 size={38} /></div>
          <h1 className="mt-7 text-4xl font-bold">LocalScribe is ready.</h1><p className="mt-3 text-lg text-[var(--muted)]">Everything needed for private, offline transcription is installed.</p>
          <div className="panel mx-auto mt-8 max-w-md rounded-2xl p-5 text-left text-sm">
            <ReadyRow text="FFmpeg installed" /><ReadyRow text="Whisper runtime installed" /><ReadyRow text="Voice detection installed" /><ReadyRow text={`${models.find((m) => m.id === selected)?.name ?? selected} model installed`} />
          </div>
          <button className="button-primary mt-8 !min-h-12 !px-7" disabled={busy} onClick={() => void finish()}>{busy ? 'Opening…' : 'Start LocalScribe'} <ChevronRight size={18} /></button>
        </div>}
      </div>
    </section>
  </main>
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }): React.JSX.Element {
  return <div className="rounded-xl bg-[var(--elevated)] p-4"><div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted)]"><span className="[&>svg]:size-4">{icon}</span>{label}</div><div className="mt-2 truncate text-sm font-semibold" title={value}>{value}</div></div>
}
function ReadyRow({ text }: { text: string }): React.JSX.Element { return <div className="flex items-center gap-3 py-2"><Check className="text-[var(--success)]" size={18} />{text}</div> }
function ComponentRow({ icon, name, note, ready, progress }: { icon: React.ReactNode; name: string; note: string; ready: boolean; progress?: DownloadProgress }): React.JSX.Element {
  return <div className="panel rounded-2xl p-5"><div className="flex items-center gap-4"><div className="grid size-11 place-items-center rounded-xl bg-[var(--elevated)] text-[#a79dff] [&>svg]:size-5">{icon}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><strong>{name}</strong><span className={`text-sm ${ready ? 'text-[var(--success)]' : 'text-[var(--muted)]'}`}>{ready ? 'Ready ✓' : progress ? `${Math.round(progress.percent)}%` : 'Required'}</span></div><p className="mt-1 text-sm text-[var(--muted)]">{note}</p>{progress && !ready && <div className="mt-3"><ProgressBar value={progress.percent} label={`${name} installation`} /></div>}</div></div></div>
}
