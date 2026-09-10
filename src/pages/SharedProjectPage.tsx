import { useEffect, useState } from 'react'
import { Loader2, FileText, CheckCircle2, Circle, FolderOpen, Users } from 'lucide-react'
import { fmtDate, fmtDateLong, daysSince } from '@/lib/model'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

interface Phase { id: string; name: string; detail?: string | null; due?: string | null; status: string }
interface STask { id: string; title: string; status: string; priority: string; due?: string | null; milestoneId?: string | null; assigneeName?: string | null }
interface SDoc { name: string; size: number; type: string; url?: string | null }
interface Snapshot {
  project: { name: string; outcome: string; status: string; priority: string; due?: string | null; start?: string | null; notes: string; ownerMemberId?: string | null }
  areaName?: string | null
  members: { id: string; name: string; role?: string | null }[]
  phases: Phase[]
  tasks: STask[]
  documents: SDoc[]
  updatedAt?: string | null
}

const PRIORITY_WORD: Record<string, string> = { P0: 'Urgent', P1: 'High', P2: 'Medium', P3: 'Low' }
const STATUS_WORD: Record<string, string> = { inbox: 'Inbox', next: 'Next', 'in-progress': 'In progress', waiting: 'Waiting on', done: 'Done', dropped: 'Dropped' }
const isClosed = (s: string) => s === 'done' || s === 'dropped'

async function callShared(body: Record<string, unknown>): Promise<{ data?: Snapshot; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { error: 'not_configured' }
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/shared-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
    })
    const json = await resp.json()
    if (!resp.ok) return { error: json?.error ?? 'request_failed' }
    return { data: json as Snapshot }
  } catch { return { error: 'network_error' } }
}

// Standalone, no-login read-only view of a single project — mounted outside the app's providers
// (see main.tsx). Whoever opens the link has no Daybook account; they see only this project.
export default function SharedProjectPage({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error' | 'not_configured'>('loading')
  const [snap, setSnap] = useState<Snapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    callShared({ action: 'view', token }).then(res => {
      if (cancelled) return
      if (res.error === 'not_configured') setState('not_configured')
      else if (res.error === 'not_found') setState('not_found')
      else if (res.error) setState('error')
      else if (res.data) { setSnap(res.data); setState('ready') }
      else setState('error')
    })
    return () => { cancelled = true }
  }, [token])

  if (state === 'loading') return <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered>
  if (state === 'not_configured') return <Centered><Msg title="Not available">This link can’t be opened here.</Msg></Centered>
  if (state === 'not_found') return <Centered><Msg title="Link not found">This project link is invalid or has been turned off.</Msg></Centered>
  if (state === 'error' || !snap) return <Centered><Msg title="Something went wrong">Please try again in a moment.</Msg></Centered>

  const p = snap.project
  const total = snap.tasks.length
  const done = snap.tasks.filter(t => t.status === 'done').length
  const open = snap.tasks.filter(t => !isClosed(t.status)).length
  const overdue = snap.tasks.filter(t => !isClosed(t.status) && t.due && daysSince(t.due) > 0).length
  const pct = total ? Math.round((done / total) * 100) : 0
  const owner = snap.members.find(m => m.id === p.ownerMemberId)
  const others = snap.members.filter(m => m.id !== p.ownerMemberId)
  const noPhase = snap.tasks.filter(t => !t.milestoneId)

  return (
    <div className="min-h-[100dvh] bg-[hsl(40_30%_96%)] text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {/* header */}
          <div className="bg-gradient-to-br from-[hsl(var(--primary)/0.12)] to-[hsl(var(--primary)/0.03)] border-b border-border px-6 py-6">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
              <span className="font-semibold text-primary">Daybook</span><span>· shared project · read-only</span>
            </div>
            <h1 className="font-display text-3xl font-semibold leading-tight">{p.name}</h1>
            {snap.areaName && <p className="text-[13px] text-muted-foreground mt-1">{snap.areaName}</p>}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Chip>{p.status}</Chip>
              <Chip>{PRIORITY_WORD[p.priority] ?? p.priority}</Chip>
              {p.due && <Chip tone="warn">Target {fmtDate(p.due)}</Chip>}
            </div>
            {p.outcome && <p className="text-[13.5px] text-muted-foreground italic mt-3">Goal: {p.outcome}</p>}
            <div className="mt-4 flex items-center gap-3 max-w-md">
              <div className="flex-1 h-2 bg-[hsl(220_14%_90%)] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'hsl(152 25% 40%)' }} />
              </div>
              <span className="text-[12px] tabular text-muted-foreground shrink-0">{done}/{total} · {pct}%</span>
            </div>
          </div>

          <div className="px-6 py-5 flex flex-col gap-6">
            {/* summary */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              <Stat n={open} label="Open" />
              <Stat n={overdue} label="Overdue" tone={overdue ? 'bad' : undefined} />
              <Stat n={done} label="Done" />
              <Stat n={snap.phases.length} label="Phases" />
            </div>

            {/* team */}
            {(owner || others.length > 0) && (
              <Section icon={<Users className="h-3.5 w-3.5" />} title="Team">
                <div className="flex flex-wrap gap-2">
                  {owner && <Person name={owner.name} tag="owner" />}
                  {others.map(m => <Person key={m.id} name={m.name} tag={m.role ?? undefined} />)}
                </div>
              </Section>
            )}

            {/* work by phase */}
            <Section icon={<CheckCircle2 className="h-3.5 w-3.5" />} title={`Work — ${snap.phases.length} phase${snap.phases.length === 1 ? '' : 's'}, ${total} task${total === 1 ? '' : 's'}`}>
              {snap.phases.length === 0 && noPhase.length === 0 && <p className="text-[13px] text-muted-foreground">No tasks yet.</p>}
              {snap.phases.map(ph => {
                const pt = snap.tasks.filter(t => t.milestoneId === ph.id)
                const d = pt.filter(t => isClosed(t.status)).length
                return (
                  <div key={ph.id} className="mb-4">
                    <div className="flex items-baseline justify-between gap-3 border-b-2 border-primary/70 pb-1 mb-1.5">
                      <span className="font-semibold text-[13px] uppercase tracking-wide">{ph.name}</span>
                      <span className="text-[11.5px] text-muted-foreground tabular shrink-0">{d}/{pt.length}{ph.due ? ` · ${fmtDate(ph.due)}` : ''}</span>
                    </div>
                    {ph.detail && <p className="text-[11.5px] text-muted-foreground mb-1">{ph.detail}</p>}
                    <TaskList tasks={pt} />
                  </div>
                )
              })}
              {noPhase.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-baseline justify-between gap-3 border-b-2 border-border pb-1 mb-1.5">
                    <span className="font-semibold text-[13px] uppercase tracking-wide text-muted-foreground">No phase</span>
                    <span className="text-[11.5px] text-muted-foreground tabular">{noPhase.length}</span>
                  </div>
                  <TaskList tasks={noPhase} />
                </div>
              )}
            </Section>

            {/* documents */}
            {snap.documents.length > 0 && (
              <Section icon={<FolderOpen className="h-3.5 w-3.5" />} title={`Documents (${snap.documents.length})`}>
                <div className="rounded-lg border border-border divide-y divide-border/70 overflow-hidden">
                  {snap.documents.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      {d.url
                        ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-primary hover:underline">{d.name}</a>
                        : <span className="flex-1 min-w-0 truncate">{d.name}</span>}
                      <span className="text-[11px] text-muted-foreground shrink-0">{(d.size / 1024).toFixed(0)} KB</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* notes */}
            {p.notes && (
              <Section icon={<FileText className="h-3.5 w-3.5" />} title="Notes">
                <p className="text-[13px] whitespace-pre-wrap border-l-2 border-border pl-3 text-foreground/80">{p.notes}</p>
              </Section>
            )}
          </div>

          <div className="border-t border-border px-6 py-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Shared read-only from Daybook</span>
            {snap.updatedAt && <span>Updated {fmtDateLong(snap.updatedAt.slice(0, 10))}</span>}
          </div>
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-4">This is a live, read-only view — it reflects the project’s current state each time you open it.</p>
      </div>
    </div>
  )
}

function TaskList({ tasks }: { tasks: STask[] }) {
  if (tasks.length === 0) return <p className="text-[12px] text-muted-foreground italic">Nothing here.</p>
  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {tasks.map(t => {
        const closed = isClosed(t.status)
        const late = !closed && t.due && daysSince(t.due) > 0
        return (
          <li key={t.id} className="flex items-center gap-2.5 py-1.5">
            {closed ? <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(152_30%_40%)] shrink-0" /> : <Circle className="h-3.5 w-3.5 text-border shrink-0" />}
            <span className={`flex-1 min-w-0 truncate text-[13px] ${closed ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
            {t.assigneeName && <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">{t.assigneeName}</span>}
            <span className="text-[11px] text-muted-foreground shrink-0">{STATUS_WORD[t.status] ?? t.status}</span>
            {t.due && <span className={`text-[11px] tabular shrink-0 ${late ? 'text-[hsl(8_60%_45%)] font-semibold' : 'text-muted-foreground'}`}>{fmtDate(t.due)}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-foreground/70 mb-2">
        <span className="text-muted-foreground">{icon}</span>{title}
      </h2>
      {children}
    </section>
  )
}
function Stat({ n, label, tone }: { n: number; label: string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className={`font-display text-[22px] font-semibold tabular leading-none ${tone === 'bad' ? 'text-[hsl(8_60%_41%)]' : 'text-foreground'}`}>{n}</div>
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mt-1">{label}</div>
    </div>
  )
}
function Chip({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border ${tone === 'warn' ? 'bg-[hsl(35_70%_88%)] text-[hsl(28_60%_28%)] border-[hsl(35_50%_70%)]' : 'bg-card border-border'}`}>{children}</span>
}
function Person({ name, tag }: { name: string; tag?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card pl-1 pr-2.5 py-1">
      <span className="inline-grid place-items-center h-6 w-6 rounded-full bg-[hsl(220_9%_55%)] text-white text-[10px] font-semibold">{initials}</span>
      <span className="text-[12.5px] font-medium">{name}</span>
      {tag && <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground">{tag}</span>}
    </span>
  )
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] grid place-items-center bg-[hsl(40_30%_96%)] px-6">{children}</div>
}
function Msg({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="text-center max-w-sm">
      <h1 className="font-display text-xl font-semibold">{title}</h1>
      <p className="text-[13px] text-muted-foreground mt-1.5">{children}</p>
    </div>
  )
}
