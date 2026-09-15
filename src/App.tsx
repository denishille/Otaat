import { useEffect, useState } from 'react'
import { useStore, update, applyTheme, signIn, signOut, pushAll } from './lib/store'
import { cloudEnabled } from './lib/supabase'
import { levelFor, titleFor } from './lib/xp'
import { Today } from './views/Today'
import { FutureMe } from './views/FutureMe'
import { Board } from './views/Board'
import { Sheet } from './components/Sheet'
import { Toasts, toast } from './components/Toasts'
import { Moon, Sun } from './components/Icons'
import { daysBetween, today } from './lib/dates'

type Tab = 'today' | 'future' | 'board'

const TABS: { id: Tab; label: string; short: string }[] = [
  { id: 'today', label: 'Everything Checker', short: 'Checker' },
  { id: 'future', label: 'Future Me Problems', short: 'Future Me' },
  { id: 'board', label: 'Mind my Business', short: 'Board' },
]

const routeOf = (): Tab => {
  const h = window.location.hash.replace('#/', '')
  return TABS.some((t) => t.id === h) ? (h as Tab) : 'today'
}

export default function App() {
  const { state, status, userId } = useStore()
  const [tab, setTab] = useState<Tab>(routeOf)
  const [account, setAccount] = useState(false)

  useEffect(() => {
    const onHash = () => setTab(routeOf())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (t: Tab) => {
    window.location.hash = `#/${t}`
    setTab(t)
  }

  const { level, into, span } = levelFor(state.meta.xp)
  const due = state.reminders.filter((r) => !r.done && daysBetween(today(), r.due) <= r.lead).length

  const toggleTheme = () => {
    const next = state.meta.theme === 'dark' ? 'light' : 'dark'
    update((d) => { d.meta.theme = next })
    applyTheme(next)
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand" onClick={() => go('today')} role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && go('today')}>
          <span className="brand-dot" />
          <span className="brand-name">OTAAT</span>
        </div>

        <nav className="nav">
          {TABS.map((t) => (
            <button key={t.id} className="nav-item" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)} title={t.label}>
              <span className="nav-long">{t.label}</span>
              <span className="nav-short">{t.short}</span>
              {t.id === 'future' && due > 0 && (
                <span className="chip chip--warn" style={{ marginLeft: 7, padding: '1px 7px', fontSize: 11 }}>{due}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <div className="xp" title={`${state.meta.xp} XP — ${titleFor(level)}`}>
            <span className="xp-level">LVL {level}</span>
            <div className="xp-track"><div className="xp-fill" style={{ width: `${(into / span) * 100}%` }} /></div>
          </div>
          <button className="iconbtn" onClick={toggleTheme} aria-label="Hell / dunkel">
            {state.meta.theme === 'dark' ? <Sun /> : <Moon />}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => setAccount(true)}>
            {!cloudEnabled ? 'Lokal' : userId ? (status === 'error' ? 'Sync-Fehler' : status === 'syncing' ? 'Sync…' : 'Synced') : 'Anmelden'}
          </button>
        </div>
      </header>

      <main className={tab === 'board' ? 'main main--wide' : 'main'}>
        {tab === 'today' && <Today />}
        {tab === 'future' && <FutureMe />}
        {tab === 'board' && <Board />}
      </main>

      {account && <Account onClose={() => setAccount(false)} />}
      <Toasts />
    </div>
  )
}

/* ---------------------------------------------------------------- */

function Account({ onClose }: { onClose: () => void }) {
  const { state, status, userId, lastError } = useStore()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const { level } = levelFor(state.meta.xp)

  const send = async () => {
    setBusy(true)
    try {
      await signIn(email.trim())
      setSent(true)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen')
    }
    setBusy(false)
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `otaat-${today()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <Sheet title="Konto & Daten" onClose={onClose}
      footer={<button className="btn btn--primary" onClick={onClose}>Schließen</button>}>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Stat k="Level" v={String(level)} />
        <Stat k="XP" v={String(state.meta.xp)} />
        <Stat k="Tage erfasst" v={String(Object.keys(state.days).length)} />
        <Stat k="Einträge" v={String(state.reminders.length + state.nodes.length)} />
      </div>

      <hr className="divider" />

      {!cloudEnabled ? (
        <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14 }}>
          Läuft im lokalen Modus — alles liegt nur in diesem Browser. Für Sync über Geräte hinweg
          <code style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}> VITE_SUPABASE_URL </code> und
          <code style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}> VITE_SUPABASE_ANON_KEY </code>
          setzen.
        </p>
      ) : userId ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>
            Angemeldet. Status: <b style={{ color: status === 'error' ? 'var(--signal)' : 'var(--ink)' }}>{status}</b>
            {lastError && <div style={{ fontSize: 12.5, color: 'var(--signal)', marginTop: 4 }}>{lastError}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => void pushAll()}>Jetzt synchronisieren</button>
            <button className="btn btn--quiet btn--sm" onClick={() => void signOut()}>Abmelden</button>
          </div>
        </div>
      ) : sent ? (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>
          Link ist unterwegs an <b>{email}</b>. Öffne ihn auf diesem Gerät.
        </p>
      ) : (
        <div className="field">
          <label htmlFor="ac-mail">Anmelden per Magic Link</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="ac-mail" className="input" type="email" placeholder="du@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && void send()} />
            <button className="btn btn--primary" disabled={!email.includes('@') || busy} onClick={() => void send()}>Link</button>
          </div>
        </div>
      )}

      <hr className="divider" />

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--ghost btn--sm" onClick={exportJson}>Alles als JSON sichern</button>
      </div>
    </Sheet>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="daysum-k">{k}</div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: 28, lineHeight: 1.1 }}>{v}</div>
    </div>
  )
}
