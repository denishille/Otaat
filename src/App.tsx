import { useEffect, useRef, useState } from 'react'
import { useStore, update, applyTheme, resolvedTheme, signIn, signInWithPassword, setPassword, signOut, pushAll, setUsername, type SyncStatus } from './lib/store'
import { cloudEnabled } from './lib/supabase'
import { Today } from './views/Today'
import { FutureMe } from './views/FutureMe'
import { Board } from './views/Board'
import { Sheet } from './components/Sheet'
import { Toasts, toast } from './components/Toasts'
import { Mark, Moon, Sun } from './components/Icons'
import { daysBetween, shortDate, today } from './lib/dates'
import { confirmedDays } from './lib/scoring'
import { ouraConnected, ouraConnectUrl, ouraDisconnect } from './lib/oura'

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

  /* Die Kopfleiste ist auf dem Handy zwei Zeilen hoch, auf dem Desktop eine.
     Das Board haengt sich an ihre Unterkante. Gemessen statt aus 100dvh
     gerechnet: auf dem Handy weicht dvh je nach Browserleiste ab, und das
     Board stand dann bis zu 30 px unter dem Bildschirmrand. */
  const topbarRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = topbarRef.current
    if (!el) return
    const apply = () =>
      document.documentElement.style.setProperty('--topbar-b', `${Math.round(el.getBoundingClientRect().bottom)}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    window.addEventListener('resize', apply)
    return () => { ro.disconnect(); window.removeEventListener('resize', apply) }
  }, [])

  useEffect(() => {
    const onHash = () => setTab(routeOf())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (t: Tab) => {
    window.location.hash = `#/${t}`
    setTab(t)
  }

  const due = state.reminders.filter((r) => !r.done && daysBetween(today(), r.due) <= r.lead).length

  const shown = resolvedTheme(state.meta.theme)
  const toggleTheme = () => {
    const next = shown === 'dark' ? 'light' : 'dark'
    update((d) => { d.meta.theme = next })
    applyTheme(next)
  }

  return (
    <div className="shell">
      <header className="topbar" ref={topbarRef}>
        <div className="brand" onClick={() => go('today')} role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && go('today')} title="One Thing At A Time">
          <Mark className="brand-mark" />
          <span className="wordmark">
            <i>O</i>ne <i>T</i>hing <i>A</i>t <i>A</i> <i>T</i>ime
          </span>
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
          <button className="iconbtn" onClick={toggleTheme} aria-label="Hell / dunkel">
            {shown === 'dark' ? <Sun /> : <Moon />}
          </button>
          {/* Der Stand des Abgleichs steht im Blatt. Hier oben nur ein Punkt,
              wenn etwas klemmt — sonst waere die Leiste eine Statusanzeige. */}
          <button className="btn btn--ghost btn--sm" onClick={() => setAccount(true)}>
            {cloudEnabled && !userId ? 'Anmelden' : 'Konto'}
            {status === 'error' && <i className="dot-warn" aria-label="Abgleich klemmt" />}
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

/** Der Stand des Abgleichs, auf Deutsch. */
const STATUS: Record<SyncStatus, string> = {
  local: 'nur auf diesem Gerät',
  'signed-out': 'nicht angemeldet',
  syncing: 'synchronisiert …',
  synced: 'synchronisiert',
  error: 'Fehler',
}

function Account({ onClose }: { onClose: () => void }) {
  const { state, status, userId, email: userEmail, username, lastError } = useStore()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const enter = async () => {
    if (!email.includes('@') || !pw) return
    setBusy(true)
    try {
      await signInWithPassword(email, pw)
      setPw('')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen')
    }
    setBusy(false)
  }

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
        <Stat k="Tage gecheckt" v={String(confirmedDays(state))} />
        <Stat k="Future Plans" v={String(state.reminders.length)} />
        <Stat k="Ideen" v={String(state.nodes.length)} />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>
            Angemeldet. Status: <b style={{ color: status === 'error' ? 'var(--signal)' : 'var(--ink)' }}>{STATUS[status]}</b>
            {lastError && <div style={{ fontSize: 12.5, color: 'var(--signal)', marginTop: 4 }}>{lastError}</div>}
          </div>

          <div className="acc-rows">
            <div className="acc-row">
              <span className="acc-k">Mail</span>
              <span className="acc-v mono">{userEmail}</span>
            </div>
            <div className="acc-row">
              <span className="acc-k">Name</span>
              <NameField current={username} />
            </div>
            <div className="acc-row">
              <span className="acc-k">Passwort</span>
              <PasswordField />
            </div>
            <div className="acc-row">
              <span className="acc-k">Oura</span>
              <OuraField />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => void pushAll()}>Jetzt synchronisieren</button>
            <button className="btn btn--quiet btn--sm" onClick={() => void signOut()}>Abmelden</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label htmlFor="ac-mail">Mail</label>
            <input id="ac-mail" className="input" type="email" placeholder="du@example.com"
              autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ac-pw">Passwort</label>
            <input id="ac-pw" className="input" type="password" autoComplete="current-password"
              value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void enter()} />
          </div>
          <button className="btn btn--primary" disabled={!email.includes('@') || pw.length < 1 || busy}
            onClick={() => void enter()}>Anmelden</button>

          {/* Der Link ist der Ausweg, nicht der Hauptweg: er oeffnet in Safari,
              und Supabase laesst nur zwei Mails pro Stunde durch. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Passwort weg?</span>
            <button className="btn btn--quiet btn--sm" disabled={!email.includes('@') || busy}
              onClick={() => void send()}>Link per Mail schicken</button>
          </div>
          {sent && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
              Link ist unterwegs an <b>{email}</b>. Er öffnet in Safari — dort dann ein Passwort
              setzen, damit du dich hier in der App anmelden kannst.
            </p>
          )}
        </div>
      )}

      <hr className="divider" />

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--ghost btn--sm" onClick={exportJson}>Alles als JSON sichern</button>
      </div>
    </Sheet>
  )
}

/**
 * Der Name, unter dem andere einen finden. Steht auch ohne Teilen schon da —
 * gebraucht wird er, sobald ein Board zu zweit laufen soll.
 */
function NameField({ current }: { current: string | null }) {
  const [draft, setDraft] = useState(current ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setDraft(current ?? '') }, [current])

  const save = async () => {
    if (draft.trim() === (current ?? '')) return
    setBusy(true)
    try {
      await setUsername(draft)
      toast('Name gespeichert')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ging nicht')
      setDraft(current ?? '')
    }
    setBusy(false)
  }

  return (
    <span className="acc-name">
      <input
        className="input" value={draft} placeholder="noch keiner" disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </span>
  )
}

/**
 * Den Ring verbinden oder loesen.
 *
 * Der Knopf oeffnet Oura in einem neuen Tab. Zurueck kommt der Nutzer nicht
 * hierher, sondern auf eine Seite der Edge Function — das Token darf den
 * Browser nie sehen, also kann der Rueckweg auch nicht durch die App laufen.
 * Beim naechsten Blick ins Konto steht hier das Datum.
 */
function OuraField() {
  const [seit, setSeit] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => { void ouraConnected().then(setSeit) }, [])

  async function verbinden() {
    setLaeuft(true)
    setFehler(null)
    const { url, error } = await ouraConnectUrl()
    setLaeuft(false)
    if (error || !url) { setFehler(error ?? 'Keine Adresse bekommen.'); return }
    // `noopener` gehoert dazu: die fremde Seite hat auf `window.opener`
    // nichts zu suchen.
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function loesen() {
    setLaeuft(true)
    const err = await ouraDisconnect()
    setLaeuft(false)
    if (err) { setFehler(err); return }
    setSeit(null)
    toast('Oura gelöst')
  }

  if (seit) {
    return (
      <span className="acc-v" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13 }}>verbunden seit {shortDate(seit.slice(0, 10))}</span>
        <button className="btn btn--quiet btn--sm" disabled={laeuft} onClick={() => void loesen()}>Lösen</button>
        {fehler && <span style={{ fontSize: 12, color: 'var(--signal)' }}>{fehler}</span>}
      </span>
    )
  }

  return (
    <span className="acc-v" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button className="btn btn--ghost btn--sm" disabled={laeuft} onClick={() => void verbinden()}>
        {laeuft ? 'Moment …' : 'Verbinden'}
      </button>
      {fehler && <span style={{ fontSize: 12, color: 'var(--signal)' }}>{fehler}</span>}
    </span>
  )
}

/** Passwort setzen oder aendern, direkt im Konto-Blatt. */
function PasswordField() {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await setPassword(draft)
      setDraft('')
      toast('Passwort geändert')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ging nicht')
    }
    setBusy(false)
  }

  return (
    <span className="acc-name" style={{ display: 'flex', gap: 8 }}>
      <input
        className="input" type="password" autoComplete="new-password"
        value={draft} placeholder="neues Passwort" disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void save()}
      />
      <button className="btn btn--ghost btn--sm" disabled={draft.length < 8 || busy}
        onClick={() => void save()}>Setzen</button>
    </span>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="daysum-k">{k}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1.1 }}>{v}</div>
    </div>
  )
}
