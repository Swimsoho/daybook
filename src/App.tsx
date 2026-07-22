import React, { useMemo, useState } from 'react'
import { Toaster, toast } from 'sonner'
import {
  Archive, CalendarDays, Eye, FolderKanban, History, Inbox as InboxIcon,
  LayoutDashboard, ListChecks, Menu, Mic, Send, Settings as SettingsIcon, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminUser, fmtDateLong, today } from '@/lib/model'
import { StoreProvider, useStore } from '@/lib/store'
import { emptyState, seedState } from '@/lib/seed'
import { AuthGate, Cloud, CloudProvider, PortalHandle } from '@/lib/cloud'
import { useSpeech } from '@/hooks/useSpeech'
import { ProjectFilterBar } from '@/components/ProjectFilter'
import Dashboard from '@/pages/Dashboard'
import TasksPage from '@/pages/TasksPage'
import PeoplePage from '@/pages/PeoplePage'
import ProjectsPage from '@/pages/ProjectsPage'
import CollectionsPage from '@/pages/CollectionsPage'
import InboxPage from '@/pages/InboxPage'
import ReportsPage from '@/pages/ReportsPage'
import SettingsPage from '@/pages/SettingsPage'
import HistoryPage from '@/pages/HistoryPage'
import AdminPage from '@/pages/AdminPage'

type Page = 'today' | 'overall' | 'inbox' | 'tasks' | 'people' | 'projects' | 'collections' | 'reports' | 'history' | 'settings' | 'admin'

interface Impersonation {
  user: AdminUser
  mode: 'sample' | 'real'
  switchMode: (m: 'sample' | 'real') => void
  exit: () => void
}

const TITLES: Record<Page, [string, string]> = {
  today: ['Today', 'Just this day — everything else stays one click away'],
  overall: ['Overall', 'The whole system at a glance, for weekly planning'],
  inbox: ['Inbox', 'Capture first, organize later — AI pre-files, you confirm'],
  tasks: ['Tasks', 'The atomic unit — priority and status decide what you see'],
  people: ['People', 'The relationship engine — never let a promise or a person go cold'],
  projects: ['Areas & Projects', 'Meaningful outcomes with a finish line'],
  collections: ['Notes & Collections', 'The things you track rather than do — shaped entirely by you'],
  reports: ['Reports', 'Every screen is reportable; exceptions surface what’s slipping'],
  history: ['Audit Trail', 'Append-only memory — archive, never delete'],
  settings: ['Settings', 'The control room — sensible defaults, everything overridable'],
  admin: ['Admin', 'Invite and manage users, and view any portal — fully audited'],
}

type NavItem = { id: Page; label: string; icon: React.ReactNode; badge?: number }

// The sidebar's contents — shared between the desktop resizable pane and the mobile slide-in drawer,
// so nav items, the real/sample switch, and the footer identity never drift apart between the two.
function SidebarContent({
  nav, page, onNavigate, compact, cloud, impersonation, onClose,
}: {
  nav: NavItem[]
  page: Page
  onNavigate: (p: Page) => void
  compact: boolean
  cloud?: Cloud | null
  impersonation?: Impersonation
  onClose?: () => void
}) {
  return (
    <>
      <div className="px-4 pt-5 pb-4 flex items-center justify-between">
        <div>
          <div className="font-display-soft text-[22px] leading-none tracking-tight">{compact ? 'Db' : 'Daybook'}</div>
          {!compact && <div className="text-[9.5px] uppercase tracking-[0.22em] opacity-50 mt-1.5">Run your life from it</div>}
        </div>
        {onClose && (
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-sm opacity-70 hover:opacity-100 hover:bg-[hsl(var(--nav-text)_/_0.1)]">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 px-2 grid grid-cols-1 gap-0.5 content-start overflow-y-auto">
        {nav.map(n => (
          <button
            key={n.id}
            onClick={() => onNavigate(n.id)}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 md:py-[7px] text-[13.5px] md:text-[13px] rounded-sm transition-colors text-left',
              page === n.id
                ? 'bg-[hsl(var(--nav-text)_/_0.13)] text-[hsl(var(--nav-text))]'
                : 'opacity-70 hover:opacity-100 hover:bg-[hsl(var(--nav-text)_/_0.06)]',
            )}
            title={n.label}
          >
            {n.icon}
            {!compact && <span className="flex-1">{n.label}</span>}
            {!!n.badge && <span className="text-[10px] tabular bg-[hsl(17_63%_47%)] text-white rounded-full px-1.5 py-px">{n.badge}</span>}
          </button>
        ))}
      </nav>
      {cloud && !impersonation && (
        <div className="px-3 py-3 border-t border-[hsl(var(--nav-text)_/_0.1)] grid grid-cols-1 gap-2">
          <div className="text-[10.5px] opacity-70 truncate">{cloud.profile.email}</div>
          <div className="flex border border-[hsl(var(--nav-text)_/_0.3)] rounded-sm overflow-hidden text-[11px]">
            {(['real', 'sample'] as const).map(m => (
              <button key={m} onClick={() => cloud.setMode(m)}
                className={cn('flex-1 px-2 py-1.5 md:py-1 capitalize', cloud.mode === m ? 'bg-[hsl(var(--nav-text)_/_0.9)] text-[hsl(var(--primary))] font-semibold' : 'opacity-70 hover:opacity-100')}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 text-[10.5px]">
            <button className="opacity-60 hover:opacity-100 underline-offset-2 hover:underline"
              onClick={async () => {
                const pw = window.prompt('New password (min 6 characters):')
                if (!pw) return
                const err = await cloud.setPassword(pw)
                if (err) toast.error(err); else toast.success('Password updated')
              }}>
              Set password
            </button>
            <button className="opacity-60 hover:opacity-100 underline-offset-2 hover:underline ml-auto" onClick={cloud.signOut}>Sign out</button>
          </div>
        </div>
      )}
      <div className="px-4 py-4 text-[10px] leading-relaxed opacity-45 border-t border-[hsl(var(--nav-text)_/_0.1)]">
        {impersonation ? <>{impersonation.user.name} · {impersonation.mode} account<br />viewed by super-admin</> : cloud ? <>{cloud.profile.name || cloud.profile.email}{cloud.profile.isSuperAdmin && ' · super-admin'}<br />{cloud.mode === 'sample' ? 'Sample world — explore freely' : 'AI proposes, you dispose.'}</> : <>Craig · super-admin<br />AI proposes, you dispose.</>}<br />
        Archive, never delete.
      </div>
    </>
  )
}

function Shell({ impersonation, onImpersonate, cloud }: { impersonation?: Impersonation; onImpersonate?: (u: AdminUser, m: 'sample' | 'real') => void; cloud?: Cloud | null }) {
  const { state, capture } = useStore()
  const [page, setPage] = useState<Page>('today')
  const [quick, setQuick] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [navW, setNavW] = useState(200)
  const [navOpen, setNavOpen] = useState(false)
  const compactNav = navW < 168
  const viewerFirstName = (impersonation ? impersonation.user.name : cloud ? (cloud.profile.name || cloud.profile.email) : 'Craig').split(' ')[0]

  // Settings → Appearance picks a palette; applying it is just this one attribute, which the
  // [data-theme] CSS blocks in index.css key off. Runs on every render of the theme value so
  // switching accounts (impersonation) or loading a saved theme from Supabase both take effect
  // immediately, not just on the first mount.
  React.useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme
  }, [state.settings.theme])

  function startNavResize(e: React.PointerEvent) {
    e.preventDefault()
    const move = (ev: PointerEvent) => setNavW(Math.min(340, Math.max(120, ev.clientX)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const speech = useSpeech(text => {
    const cap = capture(text, 'voice')
    toast.success('Voice note captured & transcribed', { description: cap.proposal.explanation })
  })
  function micTap() {
    if (speech.listening) { speech.stop(); return }
    if (!speech.supported || !speech.start()) {
      toast('Voice capture needs mic access', {
        description: 'Speech-to-text isn’t available in this window — in the built app, WhatsApp voice notes are transcribed automatically. Try the demo in the Inbox instead.',
      })
    }
  }
  const pendingCount = state.captures.filter(c => c.status === 'pending').length
  const collectionsOn = state.settings.features.collections

  const nav: NavItem[] = useMemo(() => [
    { id: 'today', label: 'Today', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'overall', label: 'Overall', icon: <CalendarDays className="h-4 w-4" /> },
    { id: 'inbox', label: 'Inbox', icon: <InboxIcon className="h-4 w-4" />, badge: pendingCount },
    { id: 'tasks', label: 'Tasks', icon: <ListChecks className="h-4 w-4" /> },
    { id: 'people', label: 'People', icon: <Users className="h-4 w-4" /> },
    { id: 'projects', label: 'Projects', icon: <FolderKanban className="h-4 w-4" /> },
    ...(collectionsOn ? [{ id: 'collections' as Page, label: 'Collections', icon: <Archive className="h-4 w-4" /> }] : []),
    { id: 'reports', label: 'Reports', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'history', label: 'History', icon: <History className="h-4 w-4" /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> },
    ...(!impersonation && (!cloud || cloud.profile.isSuperAdmin) ? [{ id: 'admin' as Page, label: 'Admin', icon: <ShieldCheck className="h-4 w-4" /> }] : []),
  ], [pendingCount, collectionsOn, impersonation, cloud])

  function quickCapture() {
    if (!quick.trim()) return
    const cap = capture(quick, 'manual')
    toast.success('Captured', { description: cap.proposal.explanation })
    setQuick('')
  }

  const [title, subtitle] = TITLES[page]

  return (
    <div className="min-h-screen flex flex-col">
      {/* Impersonation banner — powerful but never invisible */}
      {impersonation && (
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 sm:gap-3 px-4 py-2 bg-[hsl(40_65%_42%)] text-[hsl(45_50%_97%)] text-[12.5px]">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">
            <b>Super-admin view:</b> {impersonation.user.name}’s portal<span className="hidden sm:inline"> — exactly as they see it. This session is written to the audit trail.</span>
          </span>
          <span className="sm:ml-auto flex items-center gap-1.5 shrink-0">
            <span className="flex border border-[hsl(45_50%_97%_/_0.5)] rounded-sm overflow-hidden">
              {impersonation.user.hasSample && (
                <button onClick={() => impersonation.switchMode('sample')} className={cn('px-2 py-0.5 text-[11.5px]', impersonation.mode === 'sample' ? 'bg-[hsl(45_50%_97%)] text-[hsl(40_65%_30%)] font-semibold' : 'hover:bg-[hsl(45_50%_97%_/_0.15)]')}>Sample</button>
              )}
              {impersonation.user.hasReal && (
                <button onClick={() => impersonation.switchMode('real')} className={cn('px-2 py-0.5 text-[11.5px]', impersonation.mode === 'real' ? 'bg-[hsl(45_50%_97%)] text-[hsl(40_65%_30%)] font-semibold' : 'hover:bg-[hsl(45_50%_97%_/_0.15)]')}>Real</button>
              )}
            </span>
            <button onClick={impersonation.exit} className="border border-[hsl(45_50%_97%_/_0.6)] rounded-sm px-2.5 py-0.5 text-[11.5px] font-semibold hover:bg-[hsl(45_50%_97%_/_0.15)]">Exit — back to admin</button>
          </span>
        </div>
      )}
      <div className="flex-1 flex min-h-0">
      {/* Mobile slide-in drawer + backdrop — hidden entirely at md and above */}
      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setNavOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] max-w-[80vw] flex flex-col border-r border-[hsl(var(--nav-border))] text-[hsl(var(--nav-text))]" style={{ background: 'linear-gradient(178deg, hsl(var(--nav-from)), hsl(var(--nav-to)))' }}>
            <SidebarContent
              nav={nav} page={page} compact={false} cloud={cloud} impersonation={impersonation}
              onNavigate={id => { setPage(id); setNavOpen(false) }}
              onClose={() => setNavOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Desktop resizable sidebar — hidden below md, where the drawer above takes over */}
      <aside className="hidden md:flex relative shrink-0 flex-col border-r border-[hsl(var(--nav-border))] text-[hsl(var(--nav-text))]" style={{ width: navW, background: 'linear-gradient(178deg, hsl(var(--nav-from)), hsl(var(--nav-to)))' }}>
        <SidebarContent nav={nav} page={page} compact={compactNav} cloud={cloud} impersonation={impersonation} onNavigate={setPage} />
        {/* drag to resize the navigation pane */}
        <div
          onPointerDown={startNavResize}
          title="Drag to resize"
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[hsl(var(--nav-text)_/_0.2)] active:bg-[hsl(17_63%_47%_/_0.6)] transition-colors"
        />
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-border bg-[hsl(var(--background)_/_0.92)] backdrop-blur px-4 md:px-6 py-3 flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setNavOpen(true)}
              className="md:hidden h-9 w-9 shrink-0 grid place-items-center border border-input rounded-sm bg-card"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h1 className="font-display text-[19px] md:text-[21px] font-semibold tracking-tight truncate">{title}</h1>
                {(page === 'today' || page === 'overall') && (
                  <div className="flex border border-border rounded-sm overflow-hidden text-[11.5px] shrink-0">
                    <button onClick={() => setPage('today')} className={cn('px-2 py-0.5', page === 'today' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>Today</button>
                    <button onClick={() => setPage('overall')} className={cn('px-2 py-0.5', page === 'overall' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>Overall</button>
                  </div>
                )}
              </div>
              <p className="hidden sm:block text-[11.5px] text-muted-foreground truncate">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 min-w-0 md:ml-auto">
            <span className="hidden md:block text-[11.5px] text-muted-foreground tabular whitespace-nowrap">{fmtDateLong(today())}</span>
            <div className="relative flex-1 md:flex-none md:w-56 lg:w-72">
              <input
                value={quick}
                onChange={e => setQuick(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && quickCapture()}
                placeholder="Quick capture — “call David re school urgent”"
                className="w-full h-9 border border-input bg-card pl-3 pr-9 text-[12.5px] rounded-sm outline-none focus:border-primary placeholder:text-muted-foreground/70"
              />
              <button onClick={quickCapture} className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center text-muted-foreground hover:text-foreground">
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={micTap}
              title="Speak a task — recorded, transcribed and routed"
              className={cn(
                'h-9 w-9 shrink-0 grid place-items-center border rounded-sm transition-all',
                speech.listening
                  ? 'bg-[hsl(8_60%_41%)] border-[hsl(8_60%_41%)] text-white animate-pulse'
                  : 'bg-card border-input text-muted-foreground hover:text-foreground hover:border-primary',
              )}
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
        </header>

        {(page === 'today' || page === 'overall' || page === 'tasks' || page === 'projects') && (
          <div className="border-b border-border bg-muted px-4 md:px-6 py-2">
            <ProjectFilterBar value={projectFilter} onChange={setProjectFilter} />
          </div>
        )}

        <main className="flex-1 px-4 md:px-6 py-4 md:py-5 max-w-[1240px] w-full mx-auto overflow-x-hidden">
          {page === 'today' && <Dashboard mode="today" goTo={p => setPage(p as Page)} projectFilter={projectFilter} viewerName={viewerFirstName} />}
          {page === 'overall' && <Dashboard mode="overall" goTo={p => setPage(p as Page)} projectFilter={projectFilter} />}
          {page === 'inbox' && <InboxPage />}
          {page === 'tasks' && <TasksPage projectFilter={projectFilter} onClearProject={() => setProjectFilter(null)} />}
          {page === 'people' && <PeoplePage />}
          {page === 'projects' && <ProjectsPage />}
          {page === 'collections' && collectionsOn && <CollectionsPage />}
          {page === 'reports' && <ReportsPage />}
          {page === 'history' && <HistoryPage />}
          {page === 'settings' && <SettingsPage cloud={cloud ?? undefined} />}
          {page === 'admin' && !impersonation && <AdminPage onViewPortal={(u, m) => onImpersonate?.(u, m)} cloud={cloud ?? undefined} />}
        </main>
      </div>
      </div>
      <Toaster position="bottom-right" toastOptions={{ style: { background: 'hsl(45 50% 97%)', border: '1px solid hsl(42 22% 78%)', color: 'hsl(96 10% 13%)', fontSize: '13px' } }} />
    </div>
  )
}

function Root({ cloud }: { cloud: Cloud | null }) {
  const { logSuperAdmin } = useStore()
  const [imp, setImp] = useState<{ user: AdminUser; mode: 'sample' | 'real'; handle: PortalHandle | null } | null>(null)

  async function startImp(u: AdminUser, m: 'sample' | 'real') {
    logSuperAdmin('impersonation started', `viewing ${u.name}’s ${m} account — no password seen, session marked in trail`)
    if (cloud) {
      const handle = await cloud.admin.openPortal(u.id, m)
      if (!handle) return
      setImp({ user: u, mode: m, handle })
    } else {
      setImp({ user: u, mode: m, handle: null })
    }
  }

  if (imp) {
    const initial = imp.handle
      ? () => imp.handle!.initial
      : imp.mode === 'sample' ? seedState : () => emptyState(imp.user.name)
    return (
      <StoreProvider key={imp.user.id + imp.mode} initial={initial} onChange={imp.handle?.save} userName={imp.user.name}>
        <Shell
          cloud={cloud}
          impersonation={{
            user: imp.user,
            mode: imp.mode,
            switchMode: m => {
              if (m === imp.mode) return
              logSuperAdmin('impersonation', `switched to ${imp.user.name}’s ${m} account`)
              startImp(imp.user, m)
            },
            exit: () => {
              logSuperAdmin('impersonation ended', `left ${imp.user.name}’s portal`)
              setImp(null)
            },
          }}
        />
      </StoreProvider>
    )
  }
  return <Shell cloud={cloud} onImpersonate={startImp} />
}

export default function App() {
  return (
    <AuthGate>
      {cloud => (
        <CloudProvider cloud={cloud}>
          <StoreProvider
            key={cloud ? cloud.saveKey : 'demo'}
            initial={cloud ? () => cloud.state : undefined}
            onChange={cloud ? cloud.save : undefined}
            userName={cloud ? (cloud.profile.name || cloud.profile.email) : undefined}
          >
            <Root cloud={cloud} />
          </StoreProvider>
        </CloudProvider>
      )}
    </AuthGate>
  )
}
