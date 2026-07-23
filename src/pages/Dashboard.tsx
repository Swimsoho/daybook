import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, Cake, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, FolderKanban, GripVertical, Heart, Inbox, LayoutGrid, ListChecks, Maximize2, MessageCircle, Minimize2, Phone, RotateCcw, Sparkles, Users } from 'lucide-react'
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
// Pretty labels for the morning-brief channel chip (settings stores lowercase keys).
const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', telegram: 'Telegram', slack: 'Slack', sms: 'SMS', email: 'Email',
}
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

// ================= Widget drag-to-reorder / resize framework =================
//
// Shared by both the Today dashboard and the Overall/Portfolio page. Widgets can be dragged
// (by their grip handle) to reorder within or across the two columns, toggled between their
// normal column width and a full-width "wide" row, and — the "true drag-resize" version of
// what used to be just the wide toggle — resized taller/shorter by dragging their bottom-right
// corner, the browser's native resize handle. All of it persists to settings so it survives
// reload/devices, but only ever changes when the person explicitly drags something or hits
// "Rearrange widgets" — the default layout renders pixel-for-pixel the same as before this
// feature existed.
type Layout<T extends string> = { wide: T[]; left: T[]; right: T[] }

// Repairs a saved layout against the current widget set: preserves the person's chosen
// order/placement, drops any stray id from a since-removed widget, and appends any widget
// that shipped after the layout was saved (into its shipped default slot) instead of it
// silently vanishing.
function normalizeLayout<T extends string>(
  saved: { wide: string[]; left: string[]; right: string[] } | undefined,
  allIds: readonly T[],
  defaultLayout: Layout<T>,
): Layout<T> {
  if (!saved) return defaultLayout
  const isId = (id: string): id is T => (allIds as readonly string[]).includes(id as T)
  const seen = new Set<string>()
  const clean = (ids: string[]) => ids.filter(isId).filter(id => (seen.has(id) ? false : (seen.add(id), true)))
  const wide = clean(saved.wide ?? [])
  const left = clean(saved.left ?? [])
  const right = clean(saved.right ?? [])
  for (const id of allIds) {
    if (!seen.has(id)) {
      if (defaultLayout.left.includes(id)) left.push(id)
      else if (defaultLayout.right.includes(id)) right.push(id)
      else wide.push(id)
    }
  }
  return { wide, left, right }
}

const ALL_WIDGET_IDS = ['brief', 'today', 'attention', 'calls', 'inbox', 'dates', 'areas'] as const
type WidgetId = typeof ALL_WIDGET_IDS[number]
const DEFAULT_DASHBOARD_LAYOUT: Layout<WidgetId> = {
  wide: [], left: ['brief', 'today', 'attention'], right: ['calls', 'inbox', 'dates', 'areas'],
}
const WIDGET_TITLE: Record<WidgetId, string> = {
  brief: 'Morning brief', today: 'Today', attention: 'Attention needed',
  calls: 'Today’s call list', inbox: 'Inbox', dates: 'Upcoming dates', areas: 'By area',
}
const normalizeDashboardLayout = (saved: { wide: string[]; left: string[]; right: string[] } | undefined) =>
  normalizeLayout(saved, ALL_WIDGET_IDS, DEFAULT_DASHBOARD_LAYOUT)

const OVERALL_WIDGET_IDS = ['portfolio', 'overdue', 'relationship'] as const
type OverallWidgetId = typeof OVERALL_WIDGET_IDS[number]
const DEFAULT_OVERALL_LAYOUT: Layout<OverallWidgetId> = {
  wide: [], left: ['portfolio'], right: ['overdue', 'relationship'],
}
const OVERALL_WIDGET_TITLE: Record<OverallWidgetId, string> = {
  portfolio: 'Portfolio', overdue: 'Overdue — worst first', relationship: 'Relationship health',
}
const normalizeOverallLayout = (saved: { wide: string[]; left: string[]; right: string[] } | undefined) =>
  normalizeLayout(saved, OVERALL_WIDGET_IDS, DEFAULT_OVERALL_LAYOUT)

// Debounced so a live drag-resize (which can fire dozens of times a second) doesn't hammer
// settings/cloud-save on every intermediate pixel — only the settled size gets persisted.
function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay: number): (...args: A) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  return (...args: A) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => fnRef.current(...args), delay)
  }
}

function WidgetShell({
  title, wide, customize, dragging, height, autoGrow, onDragStart, onDragOver, onDrop, onToggleWide, onResize, children,
}: {
  title: string
  wide: boolean
  customize: boolean
  dragging: boolean
  height?: number
  autoGrow?: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onToggleWide: () => void
  onResize?: (h: number) => void
  children: React.ReactNode
}) {
  const resizeRef = useRef<HTMLDivElement>(null)
  const debouncedResize = useDebouncedCallback((h: number) => onResize?.(h), 400)

  useEffect(() => {
    if (!customize || !onResize) return
    const el = resizeRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const h = Math.round(entries[0].contentRect.height)
      if (h > 0) debouncedResize(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customize])

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(customize && 'ring-1 ring-border/70 rounded-sm p-1', dragging && 'opacity-40')}
    >
      {customize && (
        <div className="flex items-center gap-1.5 mb-1 px-1 text-[10.5px] text-muted-foreground">
          <span
            draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
            className="cursor-grab active:cursor-grabbing shrink-0"
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          <span className="uppercase tracking-wide truncate">{title}</span>
          <button onClick={onToggleWide} className="ml-auto flex items-center gap-1 border border-border rounded-sm px-1.5 py-0.5 hover:bg-accent shrink-0 bg-card">
            {wide ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            {wide ? 'Normal' : 'Full width'}
          </button>
        </div>
      )}
      <div
        ref={resizeRef}
        // In normal viewing an auto-grow widget expands to fit ALL its content — no inner scrollbar,
        // the page scrolls instead. A previously-set height is honoured only as a minimum, so
        // resizing still makes a widget taller but content is never clipped. While arranging
        // (customize), we keep the fixed height + resize handle so the drag-to-resize UX works.
        style={
          autoGrow && !customize
            ? { minHeight: height ? `${height}px` : undefined }
            : { height: height ? `${height}px` : undefined, minHeight: customize ? 96 : undefined }
        }
        className={cn(autoGrow && !customize ? 'overflow-visible' : 'overflow-auto', customize && 'resize-y')}
        title={customize ? 'Drag the bottom-right corner to resize' : undefined}
      >
        {children}
      </div>
    </div>
  )
}

function DropZone({ active, onDragOver, onDrop }: { active: boolean; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void }) {
  if (!active) return null
  return (
    <div onDragOver={onDragOver} onDrop={onDrop} className="min-h-[32px] border border-dashed border-border rounded-sm flex items-center justify-center text-[10.5px] text-muted-foreground">
      drop here
    </div>
  )
}

// ================= TODAY =================

function TodayDash({ goTo, projectFilter, viewerName }: { goTo: (p: string) => void; projectFilter?: string | null; viewerName?: string }) {
  const { state, updateSettings, completeTask } = useStore()
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [logPerson, setLogPerson] = useState<Person | null>(null)
  const [viewPerson, setViewPerson] = useState<Person | null>(null)
  const [briefOpen, setBriefOpen] = useState(true)
  const [customize, setCustomize] = useState(false)
  const [dragId, setDragId] = useState<WidgetId | null>(null)

  const open = openTasks(state).filter(t => matchesProject(t, projectFilter))
  // A task counts as a "call" if its Type is Call OR it carries a Call action. Calls have their own
  // home (Today's call list), so they're kept OUT of the Today task list and the capacity count —
  // no double-listing, no inflating the daily number.
  const callActionIds = new Set(state.actions.filter(a => a.name.trim().toLowerCase() === 'call').map(a => a.id))
  const isCall = (t: Task) => t.type === 'call' || (t.actionIds ?? []).some(id => callActionIds.has(id))
  // What lands on the Today TASK list (calls excluded):
  //   • anything due today or already overdue, OR
  //   • an UNDATED high-priority task (Urgent/High) — the "do it soon" work with no date of its own.
  // An explicit FUTURE due date wins: a High task scheduled for tomorrow waits until tomorrow.
  const todays = open
    .filter(t => !isCall(t) && ((t.due && daysSince(t.due) >= 0) || (!t.due && (t.priority === 'P0' || t.priority === 'P1'))))
    .sort((a, b) => a.priority.localeCompare(b.priority) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const overdue = open.filter(t => !isCall(t) && isOverdue(t))
  // "Attention needed" = things that are genuinely slipping, each tagged with the reason it's here:
  //   • OVERDUE — past its due date (and not already sitting in today's list), or
  //   • WAITING — you've been waiting on someone 5+ days AND it isn't parked on a comfortable
  //     future date. A low-priority item due next week that you're waiting on is NOT nagged about;
  //     its future due date is keeping it quiet until it's closer.
  const attention = open
    .map(t => {
      if (isCall(t)) return null
      if (isOverdue(t) && !todays.slice(0, 8).includes(t)) {
        return { task: t, note: { text: `overdue ${daysSince(t.due)}d`, tone: 'overdue' as const } }
      }
      // Fall back to the created date when no wait-start was ever recorded, so we never show the
      // "no date" sentinel (9999) — an older imported waiting task still gets a sensible number.
      const waitDays = daysSince(t.waitingSince ?? t.created)
      if (t.status === 'waiting' && waitDays >= 5 && (!t.due || daysSince(t.due) >= 0)) {
        return { task: t, note: { text: `waiting ${waitDays}d`, tone: 'waiting' as const } }
      }
      return null
    })
    .filter(Boolean) as { task: Task; note: { text: string; tone: 'overdue' | 'waiting' } }[]
  const calls = buildCallList(state).slice(0, state.settings.callGoal + 1)
  const made = callsMadeOn(state, today())
  // Any call (Type = Call OR Call action) belongs on today's call list — due today/overdue, or
  // undated (an undated call shouldn't go quiet). Shown whether or not a contact is attached. If a
  // call task already names a contact, we drop that person's cadence suggestion so nobody's listed
  // twice. A call with a FUTURE due date waits for its day, same as tasks.
  const callTasks = open
    .filter(t => isCall(t) && (!t.due || daysSince(t.due) >= 0))
    .sort((a, b) => a.priority.localeCompare(b.priority) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const callTaskPersonIds = new Set(callTasks.map(t => t.personId).filter(Boolean) as string[])
  const personCalls = calls.filter(c => !callTaskPersonIds.has(c.person.id))
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

  const layout = useMemo(() => normalizeDashboardLayout(state.settings.dashboardLayout), [state.settings.dashboardLayout])
  const available: Record<WidgetId, boolean> = {
    brief: state.settings.features.morningBrief, today: true, attention: true,
    calls: true, inbox: true, dates: !!datesTracker, areas: true,
  }
  function moveWidget(id: WidgetId, toZone: 'wide' | 'left' | 'right', beforeId?: WidgetId) {
    const strip = (arr: WidgetId[]) => arr.filter(x => x !== id)
    const next: Layout<WidgetId> = { wide: strip(layout.wide), left: strip(layout.left), right: strip(layout.right) }
    const target = next[toZone]
    const idx = beforeId ? target.indexOf(beforeId) : -1
    if (idx === -1) target.push(id); else target.splice(idx, 0, id)
    updateSettings({ dashboardLayout: next })
  }
  function toggleWide(id: WidgetId) {
    if (layout.wide.includes(id)) moveWidget(id, DEFAULT_DASHBOARD_LAYOUT.left.includes(id) ? 'left' : 'right')
    else moveWidget(id, 'wide')
  }
  function resizeWidget(id: WidgetId, h: number) {
    updateSettings({ widgetHeights: { ...state.settings.widgetHeights, [id]: h } })
  }
  function resetLayout() {
    const heights = { ...state.settings.widgetHeights }
    for (const id of ALL_WIDGET_IDS) delete heights[id]
    updateSettings({ dashboardLayout: DEFAULT_DASHBOARD_LAYOUT, widgetHeights: heights })
    toast.success('Dashboard layout reset to default')
  }
  const renderZone = (ids: WidgetId[], zone: 'wide' | 'left' | 'right') => ids.filter(id => available[id]).map(id => (
    <WidgetShell
      key={id}
      title={WIDGET_TITLE[id]}
      wide={zone === 'wide'}
      customize={customize}
      dragging={dragId === id}
      height={state.settings.widgetHeights?.[id]}
      autoGrow
      onDragStart={() => setDragId(id)}
      onDragOver={e => { if (customize && dragId && dragId !== id) e.preventDefault() }}
      onDrop={e => { e.preventDefault(); if (dragId && dragId !== id) moveWidget(dragId, zone, id); setDragId(null) }}
      onToggleWide={() => toggleWide(id)}
      onResize={h => resizeWidget(id, h)}
    >
      {WIDGET_NODE[id]}
    </WidgetShell>
  ))
  const zoneDropProps = (zone: 'wide' | 'left' | 'right') => ({
    active: customize,
    onDragOver: (e: React.DragEvent) => { if (dragId) e.preventDefault() },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragId) moveWidget(dragId, zone); setDragId(null) },
  })

  const WIDGET_NODE: Record<WidgetId, React.ReactNode> = {
    brief: (
          <section className="rise-in border border-border bg-card shadow-sm">
            <button onClick={() => setBriefOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-border bg-primary text-primary-foreground">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="text-[11px] uppercase tracking-[0.14em] font-semibold">Morning brief · {state.settings.briefTime} · {CHANNEL_LABEL[state.settings.briefChannel] ?? state.settings.briefChannel}</span>
              <span className="ml-auto">{briefOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
            </button>
            {briefOpen && (
              <div className="px-4 py-3.5 text-[13.5px] leading-relaxed">
                <p className="font-display-soft text-[15px] mb-2">{greeting()}{viewerName ? `, ${viewerName}` : ''}. A 30-second read:</p>
                <div className="grid grid-cols-1 gap-2.5">
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
    ),
    today: (
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
    ),
    attention: (
        <section className="rise-in border border-border bg-card shadow-sm" style={{ animationDelay: '120ms' }}>
          <div className="px-4 pt-3.5 pb-1">
            <SectionTitle className="mb-0">Attention needed</SectionTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">Overdue, or waiting on someone too long — each row shows why.</p>
          </div>
          {attention.length === 0 && <EmptyNote>Nothing slipping. That’s the goal.</EmptyNote>}
          {attention.map(({ task, note }) => <TaskRow key={task.id} task={task} onOpen={setOpenTask} note={note} />)}
        </section>
    ),
    calls: (
        <section className="rise-in border border-border bg-card shadow-sm" style={{ animationDelay: '90ms' }}>
          <div className="px-4 pt-3.5 pb-2 flex items-baseline justify-between">
            <SectionTitle className="mb-0">Today’s call list</SectionTitle>
            <span className="text-[11px] tabular text-muted-foreground">{made}/{state.settings.callGoal} made</span>
          </div>
          <div className="px-2 pb-2">
            {/* Call-type tasks first — the specific calls you set for today, contact or not. */}
            {callTasks.map(t => {
              const person = t.personId ? state.people.find(p => p.id === t.personId) : undefined
              return (
                <div key={t.id} className="group flex items-center gap-2.5 px-2 py-2 border-b border-border/60 last:border-0 hover:bg-accent/50">
                  <button onClick={() => setOpenTask(t)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 shrink-0 text-[hsl(215_45%_42%)]" />
                      <span className="text-[13.5px] font-medium truncate">{t.title}</span>
                      {person && <TierBadge tier={person.tier} />}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground truncate">
                      {person ? person.name : (t.callAbout || state.areas.find(a => a.id === t.areaId)?.name || 'No contact attached')}
                    </div>
                  </button>
                  {person && (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] shrink-0 opacity-40 group-hover:opacity-100" onClick={() => setLogPerson(person)}>
                      <Phone className="h-3 w-3 mr-1" />Log
                    </Button>
                  )}
                  <Button size="sm" className="h-7 px-2.5 text-[11px] shrink-0" onClick={() => { completeTask(t.id); toast.success('Call done — checked off') }}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Done
                  </Button>
                </div>
              )
            })}
            {/* Then people worth calling from relationship cadence / flags. */}
            {personCalls.map(c => (
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
            {callTasks.length === 0 && personCalls.length === 0 && <EmptyNote>No calls today — nothing typed as a call, and everyone’s within cadence.</EmptyNote>}
          </div>
        </section>
    ),
    inbox: (
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
    ),
    dates: datesTracker ? (
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
    ) : null,
    areas: (
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
    ),
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex items-center justify-end gap-2">
        {customize && (
          <button onClick={resetLayout} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RotateCcw className="h-3 w-3" /> Reset layout
          </button>
        )}
        <button
          onClick={() => setCustomize(v => !v)}
          className={cn(
            'text-[11px] flex items-center gap-1.5 border border-border rounded-sm px-2 py-1 hover:bg-accent',
            customize && 'bg-primary text-primary-foreground border-primary hover:bg-primary/90',
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          {customize ? 'Done arranging' : 'Rearrange widgets'}
        </button>
      </div>
      {customize && (
        <p className="text-[11px] text-muted-foreground -mt-1">
          Drag a widget by its grip handle to reorder, use “Full width” to stretch it across both columns, or drag its bottom-right corner to resize it taller or shorter.
        </p>
      )}

      {/* At-a-glance summary strip — the four numbers worth knowing before you scroll. Pinned to
          the top so that, with widgets now growing to full height below, the day's key figures are
          always visible without hunting. Each tile jumps to the relevant screen. */}
      {!customize && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile
            label="Today" value={todays.length} sub={`of ${capacity} capacity`}
            icon={<ListChecks className="h-4 w-4" />} accent="hsl(215 55% 50%)"
            tone={overCapacity ? 'bad' : undefined} onClick={() => goTo('tasks')}
          />
          <KpiTile
            label="Overdue" value={overdue.length} sub={overdue.length ? 'needs attention' : 'all clear'}
            icon={<AlertTriangle className="h-4 w-4" />} accent="hsl(8 62% 48%)"
            tone={overdue.length ? 'bad' : 'good'} onClick={() => goTo('tasks')}
          />
          <KpiTile
            label="Calls" value={`${made}/${state.settings.callGoal}`} sub="made today"
            icon={<Phone className="h-4 w-4" />} accent="hsl(28 70% 48%)" onClick={() => goTo('people')}
          />
          <KpiTile
            label="Inbox" value={pendingCaptures.length} sub="to confirm"
            icon={<Inbox className="h-4 w-4" />} accent="hsl(175 45% 40%)" onClick={() => goTo('inbox')}
          />
        </div>
      )}

      {(layout.wide.some(id => available[id]) || customize) && (
        <div className="grid grid-cols-1 gap-5">
          {renderZone(layout.wide, 'wide')}
          <DropZone {...zoneDropProps('wide')} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="grid grid-cols-1 gap-5 content-start">
          {renderZone(layout.left, 'left')}
          <DropZone {...zoneDropProps('left')} />
        </div>

        <div className="grid grid-cols-1 gap-5 content-start">
          {renderZone(layout.right, 'right')}
          <DropZone {...zoneDropProps('right')} />
        </div>
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
  const { state, completeTask, updateTask, updateSettings } = useStore()
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [drill, setDrill] = useState<Drill | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)
  const [portfolioView, setPortfolioView] = useState<'area' | 'list'>('area')
  const [viewPerson, setViewPerson] = useState<Person | null>(null)
  const [logPerson, setLogPerson] = useState<Person | null>(null)
  const [customize, setCustomize] = useState(false)
  const [dragId, setDragId] = useState<OverallWidgetId | null>(null)
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

  const overallLayout = useMemo(() => normalizeOverallLayout(state.settings.overallLayout), [state.settings.overallLayout])
  function moveOverallWidget(id: OverallWidgetId, toZone: 'wide' | 'left' | 'right', beforeId?: OverallWidgetId) {
    const strip = (arr: OverallWidgetId[]) => arr.filter(x => x !== id)
    const next: Layout<OverallWidgetId> = { wide: strip(overallLayout.wide), left: strip(overallLayout.left), right: strip(overallLayout.right) }
    const target = next[toZone]
    const idx = beforeId ? target.indexOf(beforeId) : -1
    if (idx === -1) target.push(id); else target.splice(idx, 0, id)
    updateSettings({ overallLayout: next })
  }
  function toggleOverallWide(id: OverallWidgetId) {
    if (overallLayout.wide.includes(id)) moveOverallWidget(id, DEFAULT_OVERALL_LAYOUT.left.includes(id) ? 'left' : 'right')
    else moveOverallWidget(id, 'wide')
  }
  function resizeOverallWidget(id: OverallWidgetId, h: number) {
    updateSettings({ widgetHeights: { ...state.settings.widgetHeights, [id]: h } })
  }
  function resetOverallLayout() {
    const heights = { ...state.settings.widgetHeights }
    for (const id of OVERALL_WIDGET_IDS) delete heights[id]
    updateSettings({ overallLayout: DEFAULT_OVERALL_LAYOUT, widgetHeights: heights })
    toast.success('Overall layout reset to default')
  }
  const renderOverallZone = (ids: OverallWidgetId[], zone: 'wide' | 'left' | 'right') => ids.map(id => (
    <WidgetShell
      key={id}
      title={OVERALL_WIDGET_TITLE[id]}
      wide={zone === 'wide'}
      customize={customize}
      dragging={dragId === id}
      height={state.settings.widgetHeights?.[id]}
      onDragStart={() => setDragId(id)}
      onDragOver={e => { if (customize && dragId && dragId !== id) e.preventDefault() }}
      onDrop={e => { e.preventDefault(); if (dragId && dragId !== id) moveOverallWidget(dragId, zone, id); setDragId(null) }}
      onToggleWide={() => toggleOverallWide(id)}
      onResize={h => resizeOverallWidget(id, h)}
    >
      {OVERALL_WIDGET_NODE[id]}
    </WidgetShell>
  ))
  const overallZoneDropProps = (zone: 'wide' | 'left' | 'right') => ({
    active: customize,
    onDragOver: (e: React.DragEvent) => { if (dragId) e.preventDefault() },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragId) moveOverallWidget(dragId, zone); setDragId(null) },
  })

  const OVERALL_WIDGET_NODE: Record<OverallWidgetId, React.ReactNode> = {
    portfolio: (
        <section className="border border-border bg-card shadow-sm rounded-lg rise-in">
          <div className="px-4 pt-3.5 pb-1">
            <SectionTitle
              className="mb-1"
              right={
                <span className="flex items-center gap-3">
                  <span className="flex border border-border rounded-sm overflow-hidden">
                    <button
                      onClick={() => setPortfolioView('area')}
                      className={cn('text-[11.5px] px-2 py-0.5', portfolioView === 'area' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
                    >
                      By Area
                    </button>
                    <button
                      onClick={() => setPortfolioView('list')}
                      className={cn('text-[11.5px] px-2 py-0.5 border-l border-border', portfolioView === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
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
                  <div className="grid grid-cols-1 gap-0.5 pl-3">
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
                      <div className="grid grid-cols-1 gap-0.5 mt-1">
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
    ),
    overdue: (
        <section className="border border-border bg-card shadow-sm rounded-lg rise-in" style={{ animationDelay: '80ms' }}>
          <div className="px-4 pt-3.5 pb-1">
            <SectionTitle className="mb-0">Overdue — worst first</SectionTitle>
          </div>
          {overdue.length === 0 && <EmptyNote>Nothing overdue. Rare and delightful.</EmptyNote>}
          {overdue.slice(0, 7).map(t => <TaskRow key={t.id} task={t} onOpen={setOpenTask} />)}
        </section>
    ),
    relationship: (
        <section className="border border-border bg-card shadow-sm rounded-lg rise-in" style={{ animationDelay: '140ms' }}>
          <div className="px-4 pt-3.5 pb-2">
            <SectionTitle className="mb-0" right={<button onClick={() => goTo('people')} className="text-[11.5px] text-muted-foreground hover:text-foreground">all people →</button>}>Relationship health</SectionTitle>
          </div>
          <div className="px-4 pb-3 grid grid-cols-1 gap-1.5">
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
    ),
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      {/* KPI strip — every tile clicks through to its underlying data */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiTile label="Open tasks" value={open.length} sub={`across ${state.areas.filter(a => a.active).length} areas`}
          icon={<ListChecks className="h-4 w-4" />} accent="hsl(210 66% 48%)"
          onClick={() => setDrill({ kind: 'tasks', title: `Open tasks (${open.length})`, tasks: open })} />
        <KpiTile label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} sub="worst first"
          icon={<AlertTriangle className="h-4 w-4" />} accent="hsl(8 66% 50%)"
          onClick={() => setDrill({ kind: 'tasks', title: `Overdue tasks (${overdue.length})`, tasks: overdue })} />
        <KpiTile label="Projects" value={activeProjects.length} sub={`${stalled.length} stalled`} tone={stalled.length ? undefined : 'good'}
          icon={<FolderKanban className="h-4 w-4" />} accent="hsl(265 46% 54%)"
          onClick={() => setDrill({ kind: 'projects', title: `Projects — active vs stalled` })} />
        <KpiTile label="Calls this week" value={`${callsThisWeek}/${state.settings.callGoal * 7}`} sub="vs weekly goal"
          icon={<Phone className="h-4 w-4" />} accent="hsl(150 46% 38%)"
          onClick={() => setDrill({ kind: 'calls', title: `Calls & touches this week (${callsThisWeek})` })} />
        <KpiTile label="Contacts overdue" value={overdueContacts.length} tone={overdueContacts.length ? 'bad' : 'good'} sub="past their cadence"
          icon={<Users className="h-4 w-4" />} accent="hsl(28 76% 50%)"
          onClick={() => setDrill({ kind: 'people', title: `Contacts past cadence (${overdueContacts.length})`, people: overdueContacts })} />
        <KpiTile label="Done this week" value={doneThisWeek.length} tone="good" sub="archived, not deleted"
          icon={<CheckCircle2 className="h-4 w-4" />} accent="hsl(175 56% 36%)"
          onClick={() => setDrill({ kind: 'tasks', title: `Finished this week (${doneThisWeek.length})`, tasks: doneThisWeek })} />
      </div>

      <div className="flex items-center justify-end gap-2 -mb-1">
        {customize && (
          <button onClick={resetOverallLayout} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RotateCcw className="h-3 w-3" /> Reset layout
          </button>
        )}
        <button
          onClick={() => setCustomize(v => !v)}
          className={cn(
            'text-[11px] flex items-center gap-1.5 border border-border rounded-sm px-2 py-1 hover:bg-accent',
            customize && 'bg-primary text-primary-foreground border-primary hover:bg-primary/90',
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          {customize ? 'Done arranging' : 'Rearrange panels'}
        </button>
      </div>
      {customize && (
        <p className="text-[11px] text-muted-foreground -mt-3">
          Drag a panel by its grip handle to reorder, use “Full width” to stretch it across both columns, or drag its bottom-right corner to resize it taller or shorter.
        </p>
      )}

      {(overallLayout.wide.length > 0 || customize) && (
        <div className="grid grid-cols-1 gap-5">
          {renderOverallZone(overallLayout.wide, 'wide')}
          <DropZone {...overallZoneDropProps('wide')} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid grid-cols-1 gap-5 content-start">
          {renderOverallZone(overallLayout.left, 'left')}
          <DropZone {...overallZoneDropProps('left')} />
        </div>

        <div className="grid grid-cols-1 gap-5 content-start">
          {renderOverallZone(overallLayout.right, 'right')}
          <DropZone {...overallZoneDropProps('right')} />
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
