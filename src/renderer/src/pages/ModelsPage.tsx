import { useEffect, useState } from 'react'
import type { DownloadProgress, ModelId, ModelView } from '../../../shared/types'
import { ErrorBanner } from '../components/ErrorBanner'
import { ModelCard } from '../components/ModelCard'
import { errorMessage } from '../utils'

export function ModelsPage(): React.JSX.Element {
  const [models, setModels] = useState<ModelView[]>([])
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({})
  const [error, setError] = useState<string | null>(null)
  const refresh = (): void => { void window.localScribe.models.list().then(setModels) }
  useEffect(() => { refresh(); return window.localScribe.setup.onProgress((next) => setProgress((current) => ({ ...current, [next.artifactId]: next }))) }, [])

  const action = async (operation: () => Promise<ModelView[]>): Promise<void> => {
    setError(null)
    try { setModels(await operation()) } catch (cause) { setError(errorMessage(cause)); refresh() }
  }
  const download = (id: ModelId): void => { setModels((current) => current.map((model) => model.id === id ? { ...model, state: 'DOWNLOADING' } : model)); void action(() => window.localScribe.models.download(id)) }
  const repair = (id: ModelId): void => { setModels((current) => current.map((model) => model.id === id ? { ...model, state: 'VERIFYING' } : model)); void action(() => window.localScribe.models.repair(id)) }

  return <div className="scrollbar h-screen overflow-y-auto p-8 lg:p-10">
    <header className="mx-auto max-w-5xl"><h1 className="text-2xl font-bold tracking-tight">Transcription models</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">Models stay on this computer. Only the active model is used, and it is loaded by the isolated transcription process—not Electron.</p></header>
    <div className="mx-auto mt-7 max-w-5xl">{error && <div className="mb-5"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <div className="grid grid-cols-2 gap-4">{models.map((model) => <ModelCard key={model.id} model={model} progress={progress[`model-${model.id}`]} onDownload={download} onSelect={(id) => void action(() => window.localScribe.models.select(id))} onDelete={(id) => void action(() => window.localScribe.models.delete(id))} onRepair={repair} onCancel={(id) => { void window.localScribe.models.cancel(id).then(refresh) }} />)}</div>
    </div>
  </div>
}
