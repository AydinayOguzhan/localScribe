import { useEffect, useState } from 'react'
import { Box, Home as HomeIcon, Settings as SettingsIcon } from 'lucide-react'
import type { SetupStatus } from '../../shared/types'
import { Brand } from './components/Brand'
import { SetupWizard } from './pages/SetupWizard'
import { HomePage } from './pages/HomePage'
import { ModelsPage } from './pages/ModelsPage'
import { SettingsPage } from './pages/SettingsPage'

type Page = 'home' | 'models' | 'settings'

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [page, setPage] = useState<Page>('home')
  useEffect(() => { void window.localScribe.setup.getStatus().then(setStatus) }, [])
  if (!status) return <main className="grid min-h-screen place-items-center bg-[var(--bg)]"><div className="text-sm text-[var(--muted)]">Starting LocalScribe…</div></main>
  if (!status.setupComplete) return <SetupWizard initialStatus={status} onComplete={() => void window.localScribe.setup.getStatus().then(setStatus)} />

  return <main className="flex min-h-screen bg-[var(--bg)]">
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[#0e1116] p-5">
      <div className="px-2 py-3"><Brand compact /></div>
      <nav className="mt-7 space-y-1" aria-label="Main navigation">
        <NavButton icon={<HomeIcon />} label="Home" active={page === 'home'} onClick={() => setPage('home')} />
        <NavButton icon={<Box />} label="Models" active={page === 'models'} onClick={() => setPage('models')} />
        <NavButton icon={<SettingsIcon />} label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
      </nav>
      <div className="mt-auto px-3 pb-2 text-xs leading-5 text-[#687381]">LocalScribe 0.1.0<br />No cloud. No telemetry.</div>
    </aside>
    <section className="min-w-0 flex-1">
      <div className={page === 'home' ? 'block' : 'hidden'}><HomePage active={page === 'home'} /></div>
      {page === 'models' && <ModelsPage />}
      {page === 'settings' && <SettingsPage />}
    </section>
  </main>
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick(): void }): React.JSX.Element {
  return <button className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors [&>svg]:size-[18px] ${active ? 'bg-[#211e36] text-[#c7c0ff]' : 'text-[var(--muted)] hover:bg-white/[.035] hover:text-white'}`} onClick={onClick}>{icon}{label}</button>
}
