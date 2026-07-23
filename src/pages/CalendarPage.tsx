import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Cake, Heart, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Task, fmtDate, today } from '@/lib/model'
import { isOverdue, openTasks, useStore } from '@/lib/store'
import { TaskDetail, TaskDialog, QuickAdd } from '@/components/tasks'
import { EmptyNote, PriorityChip } from '@/components/bits'

// The in-app calendar (Phase 1). Shows your own Daybook data — open tasks on their due date and
// every "Dates to Remember" entry (birthdays/anniversaries repeat each year) — in a month grid or
// an agenda list, and lets you drop a new task straight onto a day. External calendar sync
// (Google / Microsoft 365 / Yahoo / iCloud) is a separate, later phase.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const mmdd = (iso: string) => iso.slice(5) // "MM-DD"

interface DateItem { id: string; name: string; type: string; recurring: boolean }

const DATE_ICON: Record<string, React.ReactNode> = {
  Birthday: <Cake className="h-3 w-3 text-[hsl(330_50%_52%)]" />,
  Anniversary: <Heart className="h-3 w-3 text-[hsl(0_60%_52%)]" />,
  Other: <CalendarClock className="h-3 w-3 text-muted-foreground" />,
}

export default function CalendarPage() {
  const { state } = useStore()
  const now = new Date()
  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() }) // month being viewed
  const [selected, setSelected] = useState<string>(today())
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)

  const areaColor = (areaId?: string) => state.areas.find(a => a.id === areaId)?.color ?? 'hsl(215 15% 60%)'

  // Open tasks that have a due date, indexed by that date.
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of openTasks(state)) {
      if (!t.due) continue
      const arr = map.get(t.due) ?? []
      arr.push(t)
      map.set(t.due, arr)
    }
    return map
  }, [state])

  // Dates-to-Remember entries. Non-recurring are keyed by full date; recurring by MM-DD so they
  // show in whatever year you're looking at.
  const datesTracker = state.trackers.find(t => t.id === 'trk_dates' && t.active)
  const { datesByFull, datesByMonthDay } = useMemo(() => {
    const byFull = new Map<string, DateItem[]>()
    const byMD = new Map<string, DateItem[]>()
    if (datesTracker) {
      for (const e of state.entries) {
        if (e.trackerId !== datesTracker.id) continue
        const date = String(e.values.date ?? '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
        const item: DateItem = {
          id: e.id, name: String(e.values.name ?? 'Untitled'),
          type: String(e.values.type ?? 'Other'), recurring: !!e.values.recurring,
        }
        if (item.recurring) {
          const k = mmdd(date); const arr = byMD.get(k) ?? []; arr.push(item); byMD.set(k, arr)
        } else {
          const arr = byFull.get(date) ?? []; arr.push(item); byFull.set(date, arr)
        }
      }
    }
    return { datesByFull: byFull, datesByMonthDay: byMD }
  }, [state.entries, datesTracker])

  const datesOn = (iso: string): DateItem[] => [...(datesByFull.get(iso) ?? []), ...(datesByMonthDay.get(mmdd(iso)) ?? [])]
  const tasksOn = (iso: string): Task[] => tasksByDate.get(iso) ?? []

  // ---- Month grid: 6 weeks starting on the Sunday on/before the 1st ----
  const gridCells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1)
    const start = new Date(cursor.y, cursor.m, 1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [cursor])
  // Drop a trailing all-next-month week if unused, so short months don't show an empty 6th row.
  const weeks = useMemo(() => {
    const rows: Date[][] = []
    for (let i = 0; i < gridCells.length; i += 7) rows.push(gridCells.slice(i, i + 7))
    while (rows.length > 4 && rows[rows.length - 1].every(d => d.getMonth() !== cursor.m)) rows.pop()
    return rows
  }, [gridCells, cursor.m])

  const goMonth = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }
  const goToday = () => { setCursor({ y: now.getFullYear(), m: now.getMonth() }); setSelected(today()) }

  const todayIso = today()
  const selItems = { tasks: tasksOn(selected), dates: datesOn(selected) }

  // ---- Agenda: next 60 days, only days that have something ----
  const agenda = useMemo(() => {
    const out: { iso: string; tasks: Task[]; dates: DateItem[] }[] = []
    const base = new Date()
    for (let i = 0; i < 60; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
      const iso = ymd(d)
      const tasks = tasksOn(iso), dates = datesOn(iso)
      if (tasks.length || dates.length) out.push({ iso, tasks, dates })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksByDate, datesByFull, datesByMonthDay])

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => goMonth(-1)} className="h-8 w-8 grid place-items-center border border-border rounded-sm hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => goMonth(1)} className="h-8 w-8 grid place-items-center border border-border rounded-sm hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={goToday} className="h-8 px-2.5 text-[12px] border border-border rounded-sm hover:bg-accent">Today</button>
        </div>
        <h2 className="font-display text-[18px] font-semibold tracking-tight ml-1">{MONTHS[cursor.m]} {cursor.y}</h2>
        <div className="ml-auto flex border border-border rounded-sm overflow-hidden text-[12px]">
          <button onClick={() => setView('month')} className={cn('px-2.5 py-1', view === 'month' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>Month</button>
          <button onClick={() => setView('agenda')} className={cn('px-2.5 py-1 border-l border-border', view === 'agenda' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent')}>Agenda</button>
        </div>
      </div>

      {view === 'month' ? (
        <>
          <section className="border border-border bg-card shadow-sm rounded-lg overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-muted/40">
              {WEEKDAYS.map(w => <div key={w} className="px-2 py-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground font-semibold text-center">{w}</div>)}
            </div>
            <div>
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 border-b border-border/60 last:border-0">
                  {week.map(d => {
                    const iso = ymd(d)
                    const inMonth = d.getMonth() === cursor.m
                    const isToday = iso === todayIso
                    const isSel = iso === selected
                    const dts = datesOn(iso)
                    const tks = tasksOn(iso)
                    const items = [
                      ...dts.map(x => ({ kind: 'date' as const, x })),
                      ...tks.map(x => ({ kind: 'task' as const, x })),
                    ]
                    return (
                      <button
                        key={iso}
                        onClick={() => setSelected(iso)}
                        className={cn(
                          'min-h-[92px] border-r border-border/60 last:border-r-0 p-1 text-left align-top flex flex-col gap-0.5 transition-colors',
                          !inMonth && 'bg-muted/20 text-muted-foreground',
                          isSel && 'ring-2 ring-inset ring-primary/60',
                          'hover:bg-accent/40',
                        )}
                      >
                        <span className={cn(
                          'text-[11.5px] tabular self-start px-1 rounded-full',
                          isToday && 'bg-primary text-primary-foreground font-semibold',
                        )}>{d.getDate()}</span>
                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          {items.slice(0, 3).map((it, i) => it.kind === 'date' ? (
                            <span key={'d' + it.x.id + i} className="flex items-center gap-1 text-[10.5px] truncate">
                              {DATE_ICON[it.x.type] ?? DATE_ICON.Other}<span className="truncate">{it.x.name}</span>
                            </span>
                          ) : (
                            <span key={'t' + it.x.id + i} className="flex items-center gap-1 text-[10.5px] truncate" title={it.x.title}>
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: areaColor(it.x.areaId) }} />
                              <span className={cn('truncate', isOverdue(it.x) && 'text-[hsl(8_60%_45%)]')}>{it.x.title}</span>
                            </span>
                          ))}
                          {items.length > 3 && <span className="text-[10px] text-muted-foreground pl-0.5">+{items.length - 3} more</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>

          {/* Selected-day panel */}
          <section className="border border-border bg-card shadow-sm rounded-lg">
            <div className="px-4 py-2.5 border-b border-border flex items-baseline justify-between">
              <h3 className="font-display text-[15px] font-semibold">{fmtDate(selected)}{selected === todayIso && <span className="text-[11px] text-muted-foreground font-normal"> · today</span>}</h3>
              <span className="text-[11px] text-muted-foreground">{selItems.tasks.length + selItems.dates.length} item{selItems.tasks.length + selItems.dates.length === 1 ? '' : 's'}</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-1 gap-2">
              {selItems.dates.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-[13px]">
                  {DATE_ICON[d.type] ?? DATE_ICON.Other}<span>{d.name}</span>
                  <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{d.type}{d.recurring ? ' · yearly' : ''}</span>
                </div>
              ))}
              {selItems.tasks.map(t => (
                <button key={t.id} onClick={() => setOpenTask(t)} className="flex items-center gap-2 text-[13px] text-left hover:text-[hsl(17_63%_47%)]">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: areaColor(t.areaId) }} />
                  <span className={cn('flex-1 truncate', isOverdue(t) && 'text-[hsl(8_60%_45%)]')}>{t.title}</span>
                  <PriorityChip p={t.priority} />
                </button>
              ))}
              {selItems.tasks.length === 0 && selItems.dates.length === 0 && (
                <p className="text-[12.5px] text-muted-foreground italic">Nothing on this day yet.</p>
              )}
              {/* Add a task straight onto this day */}
              <div className="border-t border-border/60 pt-2 mt-1">
                <QuickAdd due={selected} placeholder={`Add a task for ${fmtDate(selected)} — type and press Enter`} />
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="border border-border bg-card shadow-sm rounded-lg">
          <div className="px-4 py-2.5 border-b border-border">
            <h3 className="font-display text-[15px] font-semibold">Next 60 days</h3>
          </div>
          {agenda.length === 0 && <EmptyNote>Nothing scheduled in the next 60 days.</EmptyNote>}
          {agenda.map(day => (
            <div key={day.iso} className="px-4 py-2 border-b border-border/60 last:border-0 grid grid-cols-1 gap-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{fmtDate(day.iso)}{day.iso === todayIso && ' · today'}</div>
              {day.dates.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-[13px] pl-1">
                  {DATE_ICON[d.type] ?? DATE_ICON.Other}<span>{d.name}</span>
                  <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{d.type}</span>
                </div>
              ))}
              {day.tasks.map(t => (
                <button key={t.id} onClick={() => setOpenTask(t)} className="flex items-center gap-2 text-[13px] pl-1 text-left hover:text-[hsl(17_63%_47%)]">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: areaColor(t.areaId) }} />
                  <span className={cn('flex-1 truncate', isOverdue(t) && 'text-[hsl(8_60%_45%)]')}>{t.title}</span>
                  <PriorityChip p={t.priority} />
                </button>
              ))}
            </div>
          ))}
        </section>
      )}

      <p className="text-[11px] text-muted-foreground">
        Showing your Daybook tasks (by due date) and Dates to Remember. Connecting Google / Microsoft 365 / Yahoo / iCloud for two-way sync is coming as a later phase.
      </p>

      <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onEdit={t => setEditTask(t)} />
      <TaskDialog open={!!editTask} onClose={() => setEditTask(null)} task={editTask} />
    </div>
  )
}
