import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, Cake, CalendarClock, ChevronDown, ChevronRight, Heart, Inbox, MessageCircle, Phone, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  Person, Task, daysBetween, daysSince, fmtDate, fmtDateLong, nextOccurrence, personOverdueBy, today,
} from '@/lib/model'
import {
  buildCallList, callsMadeOn, isOverdue, openTasks, stalledProjects, useStore,
} from '@/lib/store'
import { EmptyNote, KpiTile, SectionTitle, TierBadge } from '@/components/bits'
import { QuickAdd, TaskDetail, TaskDialog, TaskRow } from '@/components/tasks'
import { LogCallDialog, PersonDetail } from '@/components/people'
import { TaskListTable } from '@/pages/TasksPage'

export default function Dashboard({ mode, goTo, projectFilter, viewerName }: { mode: 'today' | 'overall'; goTo: (page: string) => void; projectFilter?: string | null; viewerName?: string }) {
  return mode === 'today' ? <TodayDash goTo={goTo} projectFilter={projectFilter} viewerName={viewerName} /> : <OverallDash goTo={goTo} projectFilter={projectFilter} />
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function matchesProject(t: Task, projectFilter?: string | null): boolean {
  if (!projectFilter) return true
  return projectFilter === '__none__' ? !t.projectId : t.projectId === projectFilter
}

// "Dates to Remember" (Collections > Personal) — trk_dates is a seeded id, same pattern
// ReportsPage already relies on for trk_subs.
const DATE_TRACKER_ID = 'trk_dates'
const DATE_TYPE_ICON: Record<string, React.ReactNode> = {
  Birthday: <Cake className="h-3.5 w-3.5 text-[hsl(340_45%_50%)]" />,
  Anniversary: <Heart className="h-3.5 w-3.5 text-[hsl(0_55%_50%)]" />,
  Other: <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />,
}
function dateLabel(daysUntil: number, occ: string): string {
  if (daysUntil === 0) return 'today'
  if (daysUntil === 1) return 'tomorrow'
  if (daysUntil <= 7) return `in ${daysUntil}d`
  return fmtDate(occ)
}

// ================= TODAY =================

function TodayDash({ goTo, projectFilter, viewerName }: { goTo: (p: string) => void; projectFilter?: string | null; viewerName?: string }) {
  const { state } = useStore()
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [logPerson, setLogPerson] = useState<Person | null>(null)
  const [viewPerson, setViewPerson] = useState<Person | null>(null)
  const [briefOpen, setBriefOpen] = useState(true)

  const open = openTasks(state).filter(t => matchesProject(t, projectFilter))
  // to-call tasks surface today by default (a call with no due date shouldn't go quiet),
  // but a call you've deliberately scheduled for later still respects that due date
  const todays = open
    .filter(t => t.priority === 'P0' || (t.type === 'call' && !t.due) || (t.due && daysSince(t.due) >= 0))
    .sort((a, b) => a.priority.localeCompare(b.priority) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const attention = open.filter(t =>
    (isOverdue(t) && !todays.slice(0, 8).includes(t)) ||
    (t.status === 'waiting' && daysSince(t.waitingSince) >= 5),
  )
  const calls = buildCallList(state).slice(0, state.settings.callGoal + 1)
  const made = callsMadeOn(state, today())
  const pendingCaptures = state.captures.filter(c => c.status === 'pending')
  const capacity = state.settings.dailyCapacity
  const overCapacity = todays.length > capacity

  const top3 = todays.slice(0, 3)
  const datesTracker = state.trackers.find(t => t.id === DATE_TRACKER_ID && t.active)
  // upcoming birthdays/anniversaries/other dates in the next 30 days, nearest first — recurring
  // ones are re-projected onto this (or next) year, one-off ones use the date as stored
  const upcomingDates = useMemo(() => {
    if (!datesTracker) return []
    return state.entries
      .filter(e => e.trackerId === datesTracker.id && e.values.date)
      .map(e => {
        const occ = nextOccurrence(String(e.values.date), !!e.values.recurring)
        return { id: e.id, name: String(e.values.name ?? 'Untitled'), type: String(e.values.type ?? 'Other'), occ, daysUntil: daysBetween(today(), occ) }
      })
      .filter(x => x.daysUntil >= 0 && x.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil)
  }, [state.entries, datesTracker])
  const nudge = useMemo(() => {
    const dorm = state.people.filter(p => p.tier === 'dormant').sort((a, b) => daysSince(b.lastContact) - daysSince(a.lastContact))[0]
    const stalled = stalledProjects(state)[0]
    if (stalled) return `Project “${stalled.name}” has had no activity for ${daysSince(stalled.lastActivity)} days — worth restarting or parking?`
    if (dorm) return `${dorm.name} has drifted ${daysSince(dorm.lastContact)} days — a two-minute WhatsApp would keep it warm.`
    return 'Nothing slipping today. Enjoy the margin.'
  }, [state])

  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <div className="grid gap-5 content-start">
        {/* Morning brief */}
        {state.settings.features.morningBrief && (
          <section className="rise-in border border-border bg-card shadow-sm">
            <button onClick={() => setBriefOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-border bg-[hsl(152_22%_23%)] text-[hsl(45_50%_96%)]">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="text-[11px] uppercase tracking-[0.14em] font-semibold">Morning brief · {state.settings.briefTime} · {state.settings.briefChannel}</span>
              <span className="ml-auto">{briefOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
            </button>
            {briefOpen && (
              <div className="px-4 py-3.5 text-[13.5px] leading-relaxed">
                <p className="font-display-soft text-[15px] mb-2">{greeting()}{viewerName ? `, ${viewerName}` : ''}. A 30-second read:</p>
                <div className="grid gap-2.5">
                  <div>
                    <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Top three today</span>
                    {top3.length === 0 && <p className="text-muted-foreground italic">Nothing pressing — a rare quiet morning.</p>}
                    {top3.map((t, i) => (
                      <button key={t.id} onClick={() => setOpenTask(t)} className="flex items-baseline gap-2 hover:text-[hsl(17_63%_47%)] text-left w-full">
                        <span className="font-display font-semibold tabular text-muted-foreground">{i + 1}.</span>
                        <span className="truncate">{t.title}</span>
                      </button>
                    ))}
                  </div>
                  <div>
                    <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Today’s calls ({state.settings.callGoal})</span>
                    {calls.slice(0, state.settings.callGoal).map(c => (
                      <button key={c.person.id} onClick={() => setViewPerson(c.person)} className="block text-left w-full hover:text-[hsl(17_63%_47%)]">
                        <span className="font-medium">{c.person.name}</span>
                        <span className="text-muted-foreground"> — {c.reason}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-start gap-2 border-t border-dashed border-border pt-2">
                    <Sparkles className="h-3.5 w-3.5 mt-0.5 text-[hsl(40_65%_42%)] shrink-0" />
                    <span className="text-foreground/80 italic">{nudge}</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Today's tasks */}
        <section className="rise-in border border-border bg-card shadow-sm" style={{ animationDelay: '60ms' }}>
          <div className="px-4 pt-3.5 pb-1 flex items-baseline justify-between">
            <SectionTitle className="mb-0">Today</SectionTitle>
            <span className="text-[11px] text-muted-foreground tabular">
              {todays.length} of {capacity} capacity
              {overCapacity && <span className="text-[hsl(8_60%_41%)] font-semibold"> · over</span>}
            </span>
          </div>
          {overCapacity && (
            <div className="mx-4 mb-2 flex items-center justify-between gap-2 border border-[hsl(35_50%_70%)] bg-[hsl(35_70%_92%)] px-3 py-1.5 text-[12.5px]">
              <span>The day is over capacity. Rebalance will defer the lowest-priority, non-time-critical items.</span>
              <Button size="sm" variant="outline" className="h-6 text-[11px] shrink-0" onClick={() => toast('Auto-rebalance proposed: 2 P2 items → tomorrow. You confirm before anything moves.')}>Rebalance</Button>
            </div>
          )}
          <QuickAdd due={today()} placeholder="Quick add for today — type and press Enter" />
          <div>
            {todays.length === 0 && <EmptyNote>Nothing due today. The backlog stays out of your face.</EmptyNote>}
            {todays.map(t => <TaskRow key={t.id} task={t} onOpen={setOpenTask} />)}
          </div>
        </section>

        {/* Attention needed */}
        <section className="rise-in border border-border bg-card shadow-sm" style={{ animationDelay: '120ms' }}>
          <div className="px-4 pt-3.5 pb-1">
            <SectionTitle className="mb-0">Attention needed</SectionTitle>
          </div>
          {attention.length === 0 && <EmptyNote>Nothing slipping. That’s the goal.</EmptyNote>}
          {attention.map(t => <TaskRow key={t.id} task={t} onOpen={setOpenTask} />)}
        </section>
      </div>

      {/* Right column */}
      <div className="grid gap-5 content-start">
        {/* Call list */}
        <section className="rise-in border border-border bg-card shadow-sm" style={{ animationDelay: '90ms' }}>
          <div className="px-4 pt-3.5 pb-2 flex items-baseline justify-between">
            <SectionTitle className="mb-0">Today’s call list</SectionTitle>
            <span className="text-[11px] tabular text-muted-foreground">{made}/{state.settings.callGoal} made</span>
          </div>
          <div className="px-2 pb-2">
            {calls.map(c => (
              <div key={c.person.id} className="group flex items-center gap-2.5 px-2 py-2 border-b border-border/60 last:border-0 hover:bg-accent/50">
                <button onClick={() => setViewPerson(c.person)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-medium truncate">{c.person.name}</span>
                    <TierBadge tier={c.person.tier} />
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate">{c.reason}</div>
                </button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] shrink-0 opacity-40 group-hover:opacity-100" onClick={() => toast(`Snoozed ${c.person.name} to tomorrow’s list`)}>Snooze</Button>
                <Button size="sm" className="h-7 px-2.5 text-[11px] shrink-0" onClick={() => setLogPerson(c.person)}>
                  <Phone className="h-3 w-3 mr-1" />Log
                </Button>
              </div>
            ))}
            {calls.length === 0 && <EmptyNote>No calls suggested — everyone’s within cadence.</EmptyNote>}
          </div>
        </section>

        {/* Inbox */}
        <section className="rise-in border border-border bg-card shadow-sm" style={{ animationDelay: '150ms' }}>
          <button onClick={() => goTo('inbox')} className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-accent/50 text-left">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-[13.5px] font-medium">Inbox — {pendingCaptures.length} to confirm</div>
              <div className="text-[11.5px] text-muted-foreground">AI pre-filed them; triage is a two-minute glance</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </section>

        {/* Upcoming dates — birthdays, anniversaries, anything filed in Collections > Personal > Dates to Remember */}
        {datesTracker && (
          <section className="rise-in border border-border bg-card shadow-sm" style={{ animationDelay: '165ms' }}>
            <div className="px-4 pt-3.5 pb-1 flex items-baseline justify-between">
              <SectionTitle className="mb-0">Upcoming dates</SectionTitle>
              <button onClick={() => goTo('collections')} className="text-[11px] text-muted-foreground hover:text-foreground">manage →</button>
            </div>
            <div className="pb-2">
              {upcomingDates.length === 0 && <EmptyNote>Nothing in the next 30 days — add birthdays and anniversaries under Collections.</EmptyNote>}
              {upcomingDates.map(d => (
                <div key={d.id} className="flex items-center gap-2.5 px-4 py-1.5 border-b border-border/60 last:border-0">
                  {DATE_TYPE_ICON[d.type] ?? DATE_TYPE_ICON.Other}
                  <span className="text-[13px] flex-1 truncate">{d.name}</span>
                  <span className="text-[11.5px] text-muted-foreground tabular shrink-0">{dateLabel(d.daysUntil, d.occ)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Areas collapsed */}
        <section className="rise-in border border-border bg-card shadow-sm" style={{ animationDelay: '180ms' }}>
          <div className="px-4 pt-3.5 pb-1">
            <SectionTitle className="mb-1">By area</SectionTitle>
          </div>
          <div className="pb-2">
            {state.areas.filter(a => a.active).map(a => {
              const areaTasks = open.filter(t => t.areaId === a.id)
              const projs = state.projects.filter(p => p.areaId === a.id && p.status === 'active')
              return (
                <button key={a.id} onClick={() => goTo('projects')} className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-accent/50 text-left border-b border-border/60 last:border-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                  <span className="text-[13.5px] flex-1 truncate">{a.name}</span>
                  <span className="text-[11.5px] text-muted-foreground tabular">{projs.length} projects · {areaTasks.length} open</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onEdit={t => setEditTask(t)} />
      <TaskDialog open={!!editTask} onClose={() => setEditTask(null)} task={editTask} />
      <LogCallDialog person={logPerson} open={!!logPerson} onClose={() => setLogPerson(null)} />
      <PersonDetail person={viewPerson} onClose={() => setViewPerson(null)} onLog={p => setLogPerson(p)} />
    </div>
  )
}

// ================= OVERALL =================

type Drill =
  | { kind: 'tasks'; title: string; tasks: Task[] }
  | { kind: 'people'; title: string; people: Person[] }
  | { kind: 'projects'; title: string }
  | { kind: 'calls'; title: string }

function OverallDash({ goTo, projectFilter }: { goTo: (p: string) => void; projectFilter?: string | null }) {
  const { state, completeTask, updateTask } = useStore()
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [drill, setDrill] = useState<Drill | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)
  const [portfolioView, setPortfolioView] = useState<'area' | 'list'>('area')
  const [viewPerson, setViewPerson] = useState<Person | null>(null)
  const [logPerson, setLogPerson] = useState<Person | null>(null)
  const open = openTasks(state).filter(t => matchesProject(t, projectFilter))
  const overdue = open.filter(isOverdue).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
  const stalled = stalledProjects(state)
  const activeProjects = state.projects.filter(p => p.status === 'active')
  const doneThisWeek = state.tasks.filter(t => t.status === 'done' && t.completedAt && daysSince(t.completedAt) <= 7 && matchesProject(t, projectFilter))
  const callsThisWeek = state.interactions.filter(i => daysSince(i.date) <= 7 && (i.channel === 'call' || i.channel === 'whatsapp')).length
  const overdueContacts = state.people.filter(p => p.tier !== 'dormant' && personOverdueBy(p, state.settings) > 0)

  const isExpanded = (id: string) => allExpanded ? !expandedProjects.has(id) : expandedProjects.has(id)
  const toggleProject = (id: string) => setExpandedProjects(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const toggleAll = () => { setAllExpanded(v => !v); setExpandedProjects(new Set()) }

  return (
    <div className="grid gap-5">
      {/* KPI strip — every tile clicks through to its underlying data */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiTile label="Open tasks" value={open.length} sub={`across ${state.areas.filter(a => a.active).length} areas`}
          onClick={() => setDrill({ kind: 'tasks', title: `Open tasks (${open.length})`, tasks: open })} />
        <KpiTile label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} sub="worst first"
          onClick={() => setDrill({ kind: 'tasks', title: `Overdue tasks (${overdue.length})`, tasks: overdue })} />
        <KpiTile label="Projects" value={activeProjects.length} sub={`${stalled.length} stalled`} tone={stalled.length ? undefined : 'good'}
          onClick={() => setDrill({ kind: 'projects', title: `Projects — active vs stalled` })} />
        <KpiTile label="Calls this week" value={`${callsThisWeek}/${state.settings.callGoal * 7}`} sub="vs weekly goal"
          onClick={() => setDrill({ kind: 'calls', title: `Calls & touches this week (${callsThisWeek})` })} />
        <KpiTile label="Contacts overdue" value={overdueContacts.length} tone={overdueContacts.length ? 'bad' : 'good'} sub="past their cadence"
          onClick={() => setDrill({ kind: 'people', title: `Contacts past cadence (${overdueContacts.length})`, people: overdueContacts })} />
        <KpiTile label="Done this week" value={doneThisWeek.length} tone="good" sub="archived, not deleted"
          onClick={() => setDrill({ kind: 'tasks', title: `Finished this week (${doneThisWeek.length})`, tasks: doneThisWeek })} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* Areas / portfolio */}
        <section className="border border-border bg-card shadow-sm rise-in">
          <div className="px-4 pt-3.5 pb-1">
            <SectionTitle
              className="mb-1"
              right={
                <span className="flex items-center gap-3">
                  <span className="flex border border-border rounded-sm overflow-hidden">
                    <button
                      onClick={() => setPortfolioView('area')}
                      className={cn('text-[11.5px] px-2 py-0.5', portfolioView === 'area' ? 'bg-[hsl(152_22%_23%)] text-white' : 'hover:bg-accent')}
                    >
                      By Area
                    </button>
                    <button
                      onClick={() => setPortfolioView('list')}
                      className={cn('text-[11.5px] px-2 py-0.5 border-l border-border', portfolioView === 'list' ? 'bg-[hsl(152_22%_23%)] text-white' : 'hover:bg-accent')}
                    >
                      List
                    </button>
                  </span>
                  {portfolioView === 'area' && (
                    <button onClick={toggleAll} className="text-[11.5px] border border-border rounded-sm px-2 py-0.5 hover:bg-accent">{allExpanded ? 'Collapse all' : 'Expand all'}</button>
                  )}
                  <button onClick={() => goTo('projects')} className="text-[11.5px] text-muted-foreground hover:text-foreground">all projects →</button>
                </span>
              }
            >
              Portfolio
            </SectionTitle>
            <p className="text-[10.5px] text-muted-foreground -mt-1 mb-1">
              {portfolioView === 'area'
                ? 'expand a project to tick tasks off inline · drop a task on a project to move it · click status to change it'
                : `every open task (${open.length}) in one sortable table · click a header to sort · click a title to open it`}
            </p>
          </div>
          {portfolioView === 'list' ? (
            <div className="px-4 pb-4">
              <TaskListTable tasks={open} onOpen={setOpenTask} />
            </div>
          ) : (
          <div className="pb-2">
            {state.areas.filter(a => a.active).map(a => {
              const projs = state.projects.filter(p => p.areaId === a.id && p.status !== 'archived' && p.status !== 'done')
              const areaOpen = open.filter(t => t.areaId === a.id)
              // tasks filed straight under the area with no project — these were never rendered
              // anywhere below, even though they're counted in the "X open" total above
              const looseAreaTasks = areaOpen.filter(t => !t.projectId)
              return (
                <div key={a.id} className="border-b border-border/60 last:border-0 px-4 py-2.5">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                    <span className="font-display text-[14.5px] font-semibold">{a.name}</span>
                    <span className="text-[11px] text-muted-foreground tabular ml-auto">{areaOpen.length} open · review {a.reviewDay}</span>
                  </div>
                  <div className="grid gap-0.5 pl-3">
                    {projs.map(p => {
                      const pt = open.filter(t => t.projectId === p.id)
                      const isStalled = stalled.includes(p)
                      const exp = isExpanded(p.id)
                      return (
                        <div
                          key={p.id}
                          className="rounded-sm transition-shadow [&.dragover]:ring-2 [&.dragover]:ring-[hsl(17_63%_47%)]"
                          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover') }}
                          onDragLeave={e => e.currentTarget.classList.remove('dragover')}
                          onDrop={e => {
                            e.preventDefault(); e.currentTarget.classList.remove('dragover')
                            const id = e.dataTransfer.getData('text/task-id')
                            if (!id) return
                            updateTask(id, { projectId: p.id, areaId: p.areaId }, `dragged onto project ${p.name}`)
                            toast.success(`Re-filed under ${p.name}`)
                          }}
                        >
                          <button onClick={() => toggleProject(p.id)} className="w-full flex items-center gap-2 text-[12.5px] py-1 hover:bg-accent/50 rounded-sm px-1 text-left">
                            {exp ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', p.status === 'on-hold' ? 'bg-border' : isStalled ? 'bg-[hsl(8_60%_45%)]' : 'bg-[hsl(152_35%_40%)]')} />
                            <span className="truncate">{p.name}</span>
                            {isStalled && <span className="text-[10.5px] text-[hsl(8_60%_41%)] uppercase tracking-wide font-semibold">stalled {daysSince(p.lastActivity)}d</span>}
                            {p.status === 'on-hold' && <span className="text-[10.5px] text-muted-foreground uppercase tracking-wide">on hold</span>}
                            <span className="text-[11px] text-muted-foreground tabular ml-auto shrink-0">{pt.length} open</span>
                          </button>
                          {exp && (
                            <div className="ml-4 border-l border-border/70 mb-1.5">
                              {pt.length === 0 && <p className="text-[11.5px] text-muted-foreground italic px-3 py-1">Nothing open.</p>}
                              {pt.map(t => <TaskRow key={t.id} task={t} showArea={false} onOpen={setOpenTask} />)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {projs.length === 0 && <span className="text-[12px] text-muted-foreground italic">no live projects</span>}
                    {looseAreaTasks.length > 0 && (
                      <div className="grid gap-0.5 mt-1">
                        {looseAreaTasks.map(t => <TaskRow key={t.id} task={t} showArea={false} onOpen={setOpenTask} />)}
                      </div>
                    )}
                    <QuickAdd areaId={a.id} />
                  </div>
                </div>
              )
            })}
          </div>
          )}
        </section>

        <div className="grid gap-5 content-start">
          {/* Overdue panel */}
          <section className="border border-border bg-card shadow-sm rise-in" style={{ animationDelay: '80ms' }}>
            <div className="px-4 pt-3.5 pb-1">
              <SectionTitle className="mb-0">Overdue — worst first</SectionTitle>
            </div>
            {overdue.length === 0 && <EmptyNote>Nothing overdue. Rare and delightful.</EmptyNote>}
            {overdue.slice(0, 7).map(t => <TaskRow key={t.id} task={t} onOpen={setOpenTask} />)}
          </section>

          {/* Relationship health */}
          <section className="border border-border bg-card shadow-sm rise-in" style={{ animationDelay: '140ms' }}>
            <div className="px-4 pt-3.5 pb-2">
              <SectionTitle className="mb-0" right={<button onClick={() => goTo('people')} className="text-[11.5px] text-muted-foreground hover:text-foreground">all people →</button>}>Relationship health</SectionTitle>
            </div>
            <div className="px-4 pb-3 grid gap-1.5">
              {(['inner', 'active', 'network', 'dormant'] as const).map(tier => {
                const members = state.people.filter(p => p.tier === tier)
                const od = members.filter(p => personOverdueBy(p, state.settings) > 0)
                const pct = members.length ? Math.round(((members.length - od.length) / members.length) * 100) : 100
                return (
                  <div key={tier} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="w-16 capitalize">{tier}</span>
                    <div className="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
                      <div className="h-full bg-[hsl(152_25%_38%)]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular text-muted-foreground w-24 text-right">{od.length ? `${od.length} overdue` : 'all current'}</span>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>

      <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onEdit={t => setEditTask(t)} />
      <TaskDialog open={!!editTask} onClose={() => setEditTask(null)} task={editTask} />
      <PersonDetail person={viewPerson} onClose={() => setViewPerson(null)} onLog={p => setLogPerson(p)} />
      <LogCallDialog person={logPerson} open={!!logPerson} onClose={() => setLogPerson(null)} />

      {/* KPI drill-down — the underlying data, one click away */}
      <Dialog open={!!drill} onOpenChange={o => !o && setDrill(null)}>
        <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{drill?.title}</DialogTitle>
          </DialogHeader>
          {drill?.kind === 'tasks' && (
            <div className="-mx-2">
              {drill.tasks.length === 0 && <EmptyNote>Nothing here.</EmptyNote>}
              {drill.tasks.map(t => <TaskRow key={t.id} task={t} onOpen={x => { setDrill(null); setOpenTask(x) }} />)}
            </div>
          )}
          {drill?.kind === 'people' && (
            <div>
              {drill.people.length === 0 && <EmptyNote>Everyone is current.</EmptyNote>}
              {drill.people.map(p => (
                <button key={p.id} onClick={() => { setDrill(null); setViewPerson(p) }} className="w-full flex items-center gap-2.5 px-2 py-2 border-b border-border/60 last:border-0 hover:bg-accent/50 text-left">
                  <span className="text-[13.5px] font-medium flex-1 truncate">{p.name}</span>
                  <TierBadge tier={p.tier} />
                  <span className="text-[12px] text-[hsl(8_60%_41%)] tabular font-semibold shrink-0">{personOverdueBy(p, state.settings)}d over</span>
                </button>
              ))}
            </div>
          )}
          {drill?.kind === 'projects' && (
            <div>
              {state.projects.filter(p => p.status === 'active' || p.status === 'on-hold').map(p => {
                const isStalled = stalled.includes(p)
                const pt = open.filter(t => t.projectId === p.id)
                return (
                  <button key={p.id} onClick={() => { setDrill(null); goTo('projects') }} className="w-full flex items-center gap-2.5 px-2 py-2 border-b border-border/60 last:border-0 hover:bg-accent/50 text-left">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', p.status === 'on-hold' ? 'bg-border' : isStalled ? 'bg-[hsl(8_60%_45%)]' : 'bg-[hsl(152_35%_40%)]')} />
                    <span className="text-[13px] flex-1 truncate">{p.name}</span>
                    {isStalled && <span className="text-[10.5px] text-[hsl(8_60%_41%)] uppercase font-semibold">stalled {daysSince(p.lastActivity)}d</span>}
                    {p.status === 'on-hold' && <span className="text-[10.5px] text-muted-foreground uppercase">on hold</span>}
                    <span className="text-[11px] text-muted-foreground tabular shrink-0">{pt.length} open</span>
                  </button>
                )
              })}
            </div>
          )}
          {drill?.kind === 'calls' && (
            <div>
              {state.interactions.filter(i => daysSince(i.date) <= 7).map(i => {
                const p = state.people.find(x => x.id === i.personId)
                return (
                  <button key={i.id} onClick={() => { if (p) { setDrill(null); setViewPerson(p) } }} className="w-full flex items-center gap-2.5 px-2 py-2 border-b border-border/60 last:border-0 hover:bg-accent/50 text-left">
                    <span className="text-[11.5px] text-muted-foreground tabular w-14 shrink-0">{i.date.slice(5)}</span>
                    <span className="text-[13px] font-medium shrink-0">{p?.name}</span>
                    <span className="text-[12px] text-muted-foreground truncate flex-1">{i.purpose} — {i.outcome}</span>
                    <span className="text-[10.5px] uppercase text-muted-foreground shrink-0">{i.channel}</span>
                  </button>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
