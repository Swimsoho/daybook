import React, { useMemo, useState } from 'react'
import { Toaster, toast } from 'sonner'
import {
  Archive, CalendarDays, Eye, FolderKanban, History, Inbox as InboxIcon,
  LayoutDashboard, ListChecks, Mic, Send, Settings as SettingsIcon, ShieldCheck, Sparkles, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminUser, fmtDateLong, today } from '@/lib/model'
import { StoreProvider, useStore } from '@/lib/store'
import { emptyState, seedState } from '@/lib/seed'
import { AuthGate, Cloud, PortalHandle } from '@/lib/cloud'
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

function Shell({ impersonation, onImpersonate, cloud }: { impersonation?: Impersonation; onImpersonate?: (u: AdminUser, m: 'sample' | 'real') => void; cloud?: Cloud | null }) {
  const { state, capture } = useStore()
  const [page, setPage] = useState<Page>('today')
  const [quick, setQuick] = useState('')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
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

  const nav: { id: Page; label: string; icon: React.ReactNode; badge?: number }[] = useMemo(() => [
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
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-2 bg-[hsl(40_65%_42%)] text-[hsl(45_50%_97%)] text-[12.5px]">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">
            <b>Super-admin view:</b> {impersonation.user.name}’s portal — exactly as they see it. This session is written to the audit trail.
          </span>
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
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
      {/* Sidebar */}
      <aside className="w-[200px] shrink-0 flex flex-col border-r border-[hsl(152_18%_16%)] text-[hsl(45_40%_90%)]" style={{ background: 'linear-gradient(178deg, hsl(152 20% 17%), hsl(152 24% 12%))' }}>
        <div className="px-4 pt-5 pb-4">
          <div className="font-display-soft text-[22px] leading-none tracking-tight">Daybook</div>
          <div className="text-[9.5px] uppercase tracking-[0.22em] opacity-50 mt-1.5">Run your life from it</div>
        </div>
        <nav className="flex-1 px-2 grid gap-0.5 content-start">
          {nav.map(n => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] rounded-sm transition-colors text-left',
                page === n.id
                  ? 'bg-[hsl(45_50%_96%_/_0.13)] text-[hsl(45_50%_97%)]'
                  : 'opacity-70 hover:opacity-100 hover:bg-[hsl(45_50%_96%_/_0.06)]',
              )}
            >
              {n.icon}
              <span className="flex-1">{n.label}</span>
              {!!n.badge && <span className="text-[10px] tabular bg-[hsl(17_63%_47%)] text-white rounded-full px-1.5 py-px">{n.badge}</span>}
            </button>
          ))}
        </nav>
        {cloud && !impersonation && (
          <div className="px-3 py-3 border-t border-[hsl(45_50%_96%_/_0.1)] grid gap-2">
            <div className="text-[10.5px] opacity-70 truncate">{cloud.profile.email}</div>
            <div className="flex border border-[hsl(45_50%_96%_/_0.3)] rounded-sm overflow-hidden text-[11px]">
              {(['real', 'sample'] as const).map(m => (
                <button key={m} onClick={() => cloud.setMode(m)}
                  className={cn('flex-1 px-2 py-1 capitalize', cloud.mode === m ? 'bg-[hsl(45_50%_96%_/_0.9)] text-[hsl(152_22%_18%)] font-semibold' : 'opacity-70 hover:opacity-100')}>
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
        <div className="px-4 py-4 text-[10px] leading-relaxed opacity-45 border-t border-[hsl(45_50%_96%_/_0.1)]">
          {impersonation ? <>{impersonation.user.name} · {impersonation.mode} account<br />viewed by super-admin</> : cloud ? <>{cloud.profile.name || cloud.profile.email}{cloud.profile.isSuperAdmin && ' · super-admin'}<br />{cloud.mode === 'sample' ? 'Sample world — explore freely' : 'AI proposes, you dispose.'}</> : <>Craig · super-admin<br />AI proposes, you dispose.</>}<br />
          Archive, never delete.
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-border bg-[hsl(42_44%_94%_/_0.92)] backdrop-blur px-6 py-3 flex items-center gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-[21px] font-semibold tracking-tight truncate">{title}</h1>
              {(page === 'today' || page === 'overall') && (
                <div className="flex border border-border rounded-sm overflow-hidden text-[11.5px]">
                  <button onClick={() => setPage('today')} className={cn('px-2 py-0.5', page === 'today' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>Today</button>
                  <button onClick={() => setPage('overall')} className={cn('px-2 py-0.5', page === 'overall' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>Overall</button>
                </div>
              )}
            </div>
            <p className="text-[11.5px] text-muted-foreground truncate">{subtitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-3 min-w-0">
            <span className="hidden md:block text-[11.5px] text-muted-foreground tabular whitespace-nowrap">{fmtDateLong(today())}</span>
            <div className="relative w-56 lg:w-72">
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
          <div className="border-b border-border bg-[hsl(42_40%_92%)] px-6 py-2">
            <ProjectFilterBar value={projectFilter} onChange={setProjectFilter} />
          </div>
        )}

        <main className="flex-1 px-6 py-5 max-w-[1240px] w-full mx-auto">
          {page === 'today' && <Dashboard mode="today" goTo={p => setPage(p as Page)} projectFilter={projectFilter} />}
          {page === 'overall' && <Dashboard mode="overall" goTo={p => setPage(p as Page)} projectFilter={projectFilter} />}
          {page === 'inbox' && <InboxPage />}
          {page === 'tasks' && <TasksPage projectFilter={projectFilter} onClearProject={() => setProjectFilter(null)} />}
          {page === 'people' && <PeoplePage />}
          {page === 'projects' && <ProjectsPage />}
          {page === 'collections' && collectionsOn && <CollectionsPage />}
          {page === 'reports' && <ReportsPage />}
          {page === 'history' && <HistoryPage />}
          {page === 'settings' && <SettingsPage />}
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
      <StoreProvider key={imp.user.id + imp.mode} initial={initial} onChange={imp.handle?.save}>
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
        <StoreProvider
          key={cloud ? cloud.saveKey : 'demo'}
          initial={cloud ? () => cloud.state : undefined}
          onChange={cloud ? cloud.save : undefined}
        >
          <Root cloud={cloud} />
        </StoreProvider>
      )}
    </AuthGate>
  )
}
