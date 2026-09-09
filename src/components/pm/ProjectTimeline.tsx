import { useMemo } from 'react'
import { Check, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Task, Milestone, fmtDate, daysSince } from '@/lib/model'
import { useStore } from '@/lib/store'
import { projectMilestones } from '@/lib/milestones'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PROJECT TIMELINE  ·  the project's "Timeline" tab
 * ─────────────────────────────────────────────────────────────────────────────
 * A lightweight Gantt for ONE project. The board answers "what's left"; this
 * answers "when". It lays the project's phases down as rows and drops each dated
 * task onto a horizontal date scale, with a subtle band per phase and a single
 * TODAY line running through the whole thing.
 *
 * It only reads — the one thing it does is call onOpenTask when a marker is
 * clicked. Everything it draws is a view over the same task/phase data the rest
 * of the app already holds; nothing here is owned by the timeline, so a project
 * with no dates simply shows the empty state and loses nothing.
 *
 * Positions are percentages of the visible window, so the chart is fully fluid;
 * the whole thing sits in an overflow-x-auto frame with a comfortable min-width
 * so it stays legible on a phone rather than crushing to nothing.
 */

const DAY = 86400000
const GUTTER = 'w-40 shrink-0' // ~160px left label column

// The palette, straight from the app's tokens. Phases are marked in the primary
// orange; tasks take their colour from how close (or overdue) their due date is.
const COLOR = {
  orange: 'hsl(17 63% 47%)',
  green: 'hsl(152 25% 38%)',
  amber: 'hsl(38 78% 48%)',
  danger: 'hsl(8 60% 41%)',
  done: 'hsl(220 9% 60%)',
}

// Parse an ISO 'YYYY-MM-DD' at local noon, matching the rest of the model's date
// maths — noon keeps a day from slipping either side of a timezone boundary.
const parseISO = (d: string): number => new Date(d + 'T12:00:00').getTime()

function todayTs(): number {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0).getTime()
}

// Monday-anchored start of the week containing `ts` (noon), for a clean weekly axis.
function startOfWeek(ts: number): number {
  const d = new Date(ts)
  const back = (d.getDay() + 6) % 7 // 0 = Monday
  d.setDate(d.getDate() - back)
  d.setHours(12, 0, 0, 0)
  return d.getTime()
}
function startOfMonth(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0).getTime()
}

interface Tick { ts: number; label: string; pct: number }

interface DatedTask { task: Task; pct: number; lane: number }
interface Row {
  key: string
  name: string
  detail?: string
  done: number
  total: number
  dated: DatedTask[]
  undated: Task[]
  band: { left: number; width: number } | null
  diamondPct: number | null
  phaseDue?: string
  lanes: number
}

interface Model {
  ok: boolean
  mode: 'week' | 'month'
  from: number
  to: number
  ticks: Tick[]
  todayPct: number
  showToday: boolean
  rows: Row[]
}

// Colour + finished flag for a dated task, by proximity of its due date.
function taskTone(t: Task): { color: string; done: boolean } {
  const done = t.status === 'done' || t.status === 'dropped'
  if (done) return { color: COLOR.done, done: true }
  const ds = daysSince(t.due) // >0 = past due, negative = still to come
  if (ds > 0) return { color: COLOR.danger, done: false } // overdue
  if (ds >= -7) return { color: COLOR.amber, done: false } // due within 7 days (incl. today)
  return { color: COLOR.green, done: false }
}

export function ProjectTimeline({ projectId, onOpenTask }: {
  projectId: string
  onOpenTask: (task: Task) => void
}) {
  const { state } = useStore()

  const model = useMemo<Model>(() => {
    const project = state.projects.find(p => p.id === projectId)
    const tasks = state.tasks.filter(t => t.projectId === projectId && !t.parentId)
    const phases: Milestone[] = projectMilestones(state, projectId)

    const now = todayTs()

    // Every date that should influence the visible window.
    const stamps: number[] = []
    for (const t of tasks) {
      if (t.due) stamps.push(parseISO(t.due))
      if (t.created) stamps.push(parseISO(t.created))
    }
    for (const ph of phases) if (ph.due) stamps.push(parseISO(ph.due))
    if (project?.due) stamps.push(parseISO(project.due))
    if (project?.start) stamps.push(parseISO(project.start))

    // Whether anything is actually placeable on the axis.
    const hasDate = tasks.some(t => t.due) || phases.some(p => p.due) || !!project?.due

    // Raw window: a week of runway behind, six weeks ahead, stretched to cover
    // everything dated, and never narrower than eight weeks so it reads as a scale.
    let rawFrom = now - 7 * DAY
    let rawTo = now + 45 * DAY
    for (const s of stamps) {
      if (s < rawFrom) rawFrom = s
      if (s > rawTo) rawTo = s
    }
    const MIN_SPAN = 56 * DAY
    if (rawTo - rawFrom < MIN_SPAN) rawTo = rawFrom + MIN_SPAN

    // Week columns for a short horizon, month columns once it gets long (~16 weeks).
    const mode: 'week' | 'month' = (rawTo - rawFrom) / DAY <= 112 ? 'week' : 'month'

    // Snap the ends to clean week / month boundaries.
    const from = mode === 'week' ? startOfWeek(rawFrom) : startOfMonth(rawFrom)
    let to: number
    if (mode === 'week') {
      to = startOfWeek(rawTo)
      while (to <= rawTo) to += 7 * DAY // one clear column past the last date
    } else {
      const d = new Date(startOfMonth(rawTo))
      d.setMonth(d.getMonth() + 1)
      to = d.getTime()
    }

    const total = Math.max(to - from, 1)
    const pctOf = (ts: number) => Math.max(0, Math.min(100, ((ts - from) / total) * 100))

    // Axis ticks.
    const ticks: Tick[] = []
    if (mode === 'week') {
      for (let ts = from; ts < to; ts += 7 * DAY) {
        ticks.push({
          ts,
          pct: pctOf(ts),
          label: new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        })
      }
    } else {
      const cur = new Date(from)
      while (cur.getTime() < to) {
        const ts = cur.getTime()
        ticks.push({
          ts,
          pct: pctOf(ts),
          label: cur.toLocaleDateString('en-GB', { month: 'short' }),
        })
        cur.setMonth(cur.getMonth() + 1)
      }
    }

    const todayPct = pctOf(now)
    const showToday = now >= from && now <= to

    // Greedy lane packing so markers near the same date stack instead of colliding.
    // Widths are unknown (the chart is fluid), so we reserve a percentage gap that
    // reads about right at the min-width and lets wider screens breathe.
    const GAP = mode === 'week' ? 15 : 11
    const known = new Set(phases.map(p => p.id))

    const buildRow = (key: string, name: string, detail: string | undefined, rowTasks: Task[], phaseDue?: string): Row => {
      const done = rowTasks.filter(t => t.status === 'done' || t.status === 'dropped').length
      const withDate = rowTasks.filter(t => !!t.due).sort((a, b) => parseISO(a.due!) - parseISO(b.due!))
      const undated = rowTasks.filter(t => !t.due)

      const laneLast: number[] = []
      const dated: DatedTask[] = withDate.map(task => {
        const pct = pctOf(parseISO(task.due!))
        let lane = laneLast.findIndex(last => pct - last >= GAP)
        if (lane === -1) { lane = laneLast.length; laneLast.push(pct) } else { laneLast[lane] = pct }
        return { task, pct, lane }
      })
      const lanes = Math.max(1, laneLast.length)

      // Phase band: span the dated work, or a small marker centred on the phase's
      // own due date when the phase is dated but its tasks aren't.
      let band: Row['band'] = null
      if (dated.length >= 2) {
        const left = Math.min(...dated.map(d => d.pct))
        const right = Math.max(...dated.map(d => d.pct))
        if (right - left > 0.4) band = { left, width: right - left }
      } else if (dated.length === 0 && phaseDue) {
        const c = pctOf(parseISO(phaseDue))
        band = { left: Math.max(0, c - 1.5), width: 3 }
      }

      const diamondPct = phaseDue ? pctOf(parseISO(phaseDue)) : null
      return { key, name, detail, done, total: rowTasks.length, dated, undated, band, diamondPct, phaseDue, lanes }
    }

    const rows: Row[] = phases.map(ph =>
      buildRow(ph.id, ph.name, ph.detail, tasks.filter(t => t.milestoneId === ph.id), ph.due),
    )
    // Tasks with no phase (or a phase that was since deleted) gather in a final row.
    const loose = tasks.filter(t => !t.milestoneId || !known.has(t.milestoneId))
    if (loose.length) rows.push(buildRow('__none__', 'No phase', undefined, loose))

    return { ok: hasDate, mode, from, to, ticks, todayPct, showToday, rows }
  }, [state, projectId])

  // ---- Empty state: nothing is dated yet ----
  if (!model.ok) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-muted">
          <Flag size={16} className="text-muted-foreground" />
        </div>
        <div className="text-[13.5px] font-medium text-foreground">The timeline fills in with dates</div>
        <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
          Give a few tasks a due date — or set a due date on a phase — and they'll line
          up here on a date scale, with a marker for today and a band across each phase.
        </p>
      </div>
    )
  }

  const { ticks, rows, todayPct, showToday } = model

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* ---- Axis header ---- */}
          <div className="flex border-b border-border">
            <div className={cn(GUTTER, 'px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground')}>
              Phase
            </div>
            <div className="relative h-8 flex-1">
              {ticks.map(t => (
                <div
                  key={t.ts}
                  className="absolute top-0 bottom-0 border-l border-border/60"
                  style={{ left: `${t.pct}%` }}
                >
                  <span className="absolute left-1 top-1 whitespace-nowrap text-[10.5px] text-muted-foreground">
                    {t.label}
                  </span>
                </div>
              ))}
              {showToday && (
                <div className="absolute top-0 bottom-0 z-10" style={{ left: `${todayPct}%` }}>
                  <div className="h-full w-px bg-[hsl(17_63%_47%)]" />
                  <span className="absolute -left-3 top-0.5 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-[hsl(17_63%_47%)]">
                    today
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ---- Rows ---- */}
          {rows.map(row => {
            const trackHeight = Math.max(46, row.lanes * 22 + 10)
            return (
              <div key={row.key} className="flex border-b border-border last:border-b-0">
                {/* label gutter */}
                <div className={cn(GUTTER, 'flex flex-col justify-center gap-1 px-3 py-2')}>
                  <div className="truncate text-[13px] font-medium text-foreground" title={row.name}>
                    {row.name}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      {row.done}/{row.total} done
                    </span>
                    {row.undated.length > 0 && (
                      <span
                        title={`Undated: ${row.undated.slice(0, 6).map(t => t.title).join(', ')}${row.undated.length > 6 ? '…' : ''}`}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        +{row.undated.length} undated
                      </span>
                    )}
                  </div>
                </div>

                {/* track */}
                <div className="relative flex-1" style={{ minHeight: trackHeight }}>
                  {/* gridlines */}
                  {ticks.map(t => (
                    <div
                      key={t.ts}
                      className="absolute top-0 bottom-0 border-l border-border/40"
                      style={{ left: `${t.pct}%` }}
                    />
                  ))}
                  {/* today line */}
                  {showToday && (
                    <div
                      className="absolute top-0 bottom-0 z-10 w-px"
                      style={{ left: `${todayPct}%`, backgroundColor: COLOR.orange }}
                    />
                  )}
                  {/* phase band */}
                  {row.band && (
                    <div
                      className="absolute top-1.5 bottom-1.5 z-0 rounded-md border border-border/60 bg-muted/50"
                      style={{ left: `${row.band.left}%`, width: `${row.band.width}%` }}
                    />
                  )}
                  {/* phase due diamond */}
                  {row.diamondPct !== null && (
                    <div
                      className="absolute top-1.5 z-20 -translate-x-1/2"
                      style={{ left: `${row.diamondPct}%` }}
                      title={`${row.name}${row.phaseDue ? ` · phase due ${fmtDate(row.phaseDue)}` : ''}`}
                    >
                      <span
                        className="block h-2.5 w-2.5 rotate-45 rounded-[2px] border border-white/70"
                        style={{ backgroundColor: COLOR.orange }}
                      />
                    </div>
                  )}
                  {/* task markers */}
                  {row.dated.map(({ task, pct, lane }) => {
                    const tone = taskTone(task)
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onOpenTask(task)}
                        title={`${task.title}${task.due ? ` · due ${fmtDate(task.due)}` : ''}`}
                        className="group absolute z-20 flex items-center gap-1 rounded px-0.5 hover:z-30"
                        style={{ left: `${pct}%`, top: lane * 22 + 6 }}
                      >
                        {tone.done ? (
                          <span
                            className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: tone.color }}
                          >
                            <Check size={8} strokeWidth={3} className="text-white" />
                          </span>
                        ) : (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-card"
                            style={{ backgroundColor: tone.color }}
                          />
                        )}
                        <span
                          className={cn(
                            'max-w-[130px] truncate text-[11px] leading-none',
                            tone.done ? 'text-muted-foreground line-through' : 'text-foreground group-hover:text-foreground',
                          )}
                        >
                          {task.title}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ---- Legend ---- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-3 py-2 text-[10.5px] text-muted-foreground">
        <LegendDot color={COLOR.danger} label="overdue" />
        <LegendDot color={COLOR.amber} label="due within 7d" />
        <LegendDot color={COLOR.green} label="scheduled" />
        <LegendDot color={COLOR.done} label="done" />
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ backgroundColor: COLOR.orange }} />
          phase due
        </span>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
