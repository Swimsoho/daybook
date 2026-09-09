import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, CheckCircle2, Circle, Users, Pencil, ArrowRight, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Task, Person, Priority, fmtDate, daysSince } from '@/lib/model'
import { useStore } from '@/lib/store'
import {
  projectStats, projectHealth, HEALTH_META, projectTeam, projectOwner,
} from '@/lib/projects'
import { projectMilestones } from '@/lib/milestones'
import { PriorityChip, DueChip } from '@/components/bits'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PROJECT OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * The at-a-glance tab for a single project — the view a project manager opens to
 * answer "where does this stand" in one screen: the headline numbers, a health
 * read with a plain-English reason, how each phase is tracking, what's overdue,
 * what's coming up, who's on it, and a notes area they can edit in place.
 *
 * It is purely a *view*: every number comes from projectStats / projectHealth so
 * the overview can never disagree with the board or the portfolio. It reads state
 * for lookups and mutates only through the callbacks the parent hands it.
 */

// Accent palette, matched to the rest of the app.
const ORANGE = 'hsl(17 63% 47%)'
const GREEN = 'hsl(152 25% 38%)'
const AMBER = 'hsl(38 78% 48%)'
const DANGER = 'hsl(8 60% 41%)'
const MUTED = 'hsl(220 9% 46%)'

const PRIO_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
const isOpen = (t: Task) => t.status !== 'done' && t.status !== 'dropped' && t.status !== 'inbox'
const isFinished = (t: Task) => t.status === 'done' || t.status === 'dropped'

export function ProjectOverview({ projectId, onOpenTask, onSaveNotes, onGotoBoard }: {
  projectId: string
  onOpenTask: (task: Task) => void
  onSaveNotes: (notes: string) => void
  onGotoBoard: () => void
}) {
  const { state } = useStore()
  const project = state.projects.find(p => p.id === projectId)

  const [notes, setNotes] = useState(project?.notes ?? '')
  // Re-seed the editor when the project (or its stored notes) changes underneath us.
  useEffect(() => { setNotes(project?.notes ?? '') }, [projectId, project?.notes])

  if (!project) {
    return <p className="text-sm text-muted-foreground italic py-8 text-center">Project not found.</p>
  }

  const stats = projectStats(state, projectId)
  const health = projectHealth(state, project)
  const meta = HEALTH_META[health]
  const owner = projectOwner(state, project)
  const team = projectTeam(state, projectId)
  const phases = projectMilestones(state, projectId)

  // Every open task on the project (incl. subtasks) — the pool the two lists draw from.
  const openTasks = state.tasks.filter(t => t.projectId === projectId && isOpen(t))

  const overdueTasks = openTasks
    .filter(t => !!t.due && daysSince(t.due) > 0)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))

  const upNext = openTasks
    .filter(t => !!t.due && daysSince(t.due) <= 0) // due today or in the future
    .sort((a, b) =>
      (a.due ?? '').localeCompare(b.due ?? '') || PRIO_RANK[a.priority] - PRIO_RANK[b.priority])
    .slice(0, 6)

  const notesDirty = notes !== (project.notes ?? '')
  const saveNotes = () => { if (notesDirty) onSaveNotes(notes) }

  return (
    <div className="flex flex-col gap-5">
      {/* 1 · METRIC TILES ------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <Tile
          label="% complete"
          value={`${stats.pct}%`}
          accent={stats.pct >= 100 ? GREEN : ORANGE}
          bar={stats.pct}
        />
        <Tile label="Open" value={stats.open} accent={ORANGE} />
        <Tile label="Overdue" value={stats.overdue} accent={stats.overdue > 0 ? DANGER : MUTED} danger={stats.overdue > 0} />
        <Tile label="In progress" value={stats.inProgress} accent={ORANGE} />
        <Tile label="Blocked" value={stats.blocked} accent={stats.blocked > 0 ? AMBER : MUTED} amber={stats.blocked > 0} />
        <Tile label="Phases" value={`${stats.phasesDone}/${stats.phases}`} accent={GREEN} />
      </div>

      {/* 2 · HEALTH STRIP ------------------------------------------------- */}
      <div className="flex items-center gap-3 flex-wrap rounded-lg border border-border bg-card shadow-sm px-3.5 py-2.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold"
          style={{ background: meta.bg, borderColor: meta.border, color: meta.text }}
        >
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: meta.dot }} />
          {meta.label}
        </span>
        <span className="text-[13px] text-muted-foreground">{healthReason(state, project, stats, health)}</span>
      </div>

      {/* 3 · PHASES ------------------------------------------------------- */}
      <section className="rounded-lg border border-border bg-card shadow-sm p-4">
        <SectionHead icon={<Layers size={13} />}>Phases</SectionHead>
        {phases.length === 0 ? (
          <p className="text-[13px] text-muted-foreground mt-1">
            No phases yet. Break the project into stages on the{' '}
            <button onClick={onGotoBoard} className="text-primary underline-offset-2 hover:underline font-medium">Phases tab</button>.
          </p>
        ) : (
          <div className="flex flex-col gap-3 mt-1">
            {phases.map(ph => {
              const pt = state.tasks.filter(t => t.milestoneId === ph.id)
              const total = pt.length
              const done = pt.filter(isFinished).length
              const pct = total ? Math.round((done / total) * 100) : 0
              const off = ph.status === 'done'
              return (
                <div key={ph.id} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className={cn('text-[13px] font-medium truncate', off && 'text-muted-foreground')}>{ph.name}</span>
                    <span className="flex items-center gap-2.5 shrink-0 text-[11.5px] tabular text-muted-foreground">
                      {ph.due && <span className={cn(off && 'line-through opacity-70')}>{fmtDate(ph.due)}</span>}
                      <span>{done}/{total}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[hsl(220_14%_92%)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: off ? MUTED : (pct >= 100 ? GREEN : ORANGE) }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 4 · OVERDUE / UP NEXT ------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-lg border border-border bg-card shadow-sm p-4">
          <SectionHead icon={<AlertTriangle size={13} className="text-[hsl(8_60%_41%)]" />}>Overdue</SectionHead>
          {overdueTasks.length === 0 ? (
            <p className="text-[13px] text-muted-foreground mt-1">Nothing overdue.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/70 -mx-1 mt-0.5">
              {overdueTasks.map(t => <TaskRow key={t.id} task={t} onOpenTask={onOpenTask} right={<DueChip due={t.due} />} />)}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card shadow-sm p-4">
          <SectionHead icon={<Clock size={13} className="text-[hsl(17_63%_47%)]" />}>Up next</SectionHead>
          {upNext.length === 0 ? (
            <p className="text-[13px] text-muted-foreground mt-1">
              {stats.open === 0
                ? 'No open tasks.'
                : <>Nothing scheduled. Add due dates on the <button onClick={onGotoBoard} className="text-primary underline-offset-2 hover:underline font-medium">Board</button>.</>}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/70 -mx-1 mt-0.5">
              {upNext.map(t => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onOpenTask={onOpenTask}
                  right={t.due ? <DueChip due={t.due} /> : <PriorityChip p={t.priority} />}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 5 · TEAM --------------------------------------------------------- */}
      <section className="rounded-lg border border-border bg-card shadow-sm p-4">
        <SectionHead icon={<Users size={13} />}>Team</SectionHead>
        {!owner && team.length === 0 ? (
          <p className="text-[13px] text-muted-foreground mt-1">No one assigned yet.</p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {owner && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[hsl(17_63%_47%_/_0.06)] pl-1 pr-2.5 py-1">
                <Avatar person={owner} accent={ORANGE} />
                <span className="text-[12.5px] font-medium leading-none">{owner.name}</span>
                <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground leading-none">owner</span>
              </span>
            )}
            {team.filter(p => p.id !== owner?.id).map(p => <Avatar key={p.id} person={p} />)}
          </div>
        )}
      </section>

      {/* 6 · NOTES -------------------------------------------------------- */}
      <section className="rounded-lg border border-border bg-card shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <SectionHead icon={<Pencil size={13} />} noMargin>Project notes</SectionHead>
          {notesDirty && (
            <Button size="sm" onClick={saveNotes} className="h-7 text-[12px]">Save</Button>
          )}
        </div>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={4}
          placeholder="Context, risks, decisions, links…"
          className="text-[13px] resize-y"
        />
      </section>
    </div>
  )
}

// ─── pieces ────────────────────────────────────────────────────────────────

function Tile({ label, value, accent, bar, danger, amber }: {
  label: string; value: React.ReactNode; accent: string; bar?: number; danger?: boolean; amber?: boolean
}) {
  const numColor = danger ? DANGER : amber ? AMBER : accent
  return (
    <div
      className="relative rounded-lg border border-border bg-card shadow-sm px-3 py-2.5 flex flex-col gap-1 min-w-0 overflow-hidden"
      style={{ background: `color-mix(in srgb, ${accent} 5%, hsl(var(--card)))` }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2.5px]" style={{ background: accent }} />
      <span className="font-display text-[22px] leading-none font-semibold tabular" style={{ color: numColor }}>{value}</span>
      {typeof bar === 'number' && (
        <div className="h-1 w-full rounded-full bg-[hsl(220_14%_92%)] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, bar))}%`, background: accent }} />
        </div>
      )}
      <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground truncate leading-tight">{label}</span>
    </div>
  )
}

function SectionHead({ children, icon, noMargin }: { children: React.ReactNode; icon?: React.ReactNode; noMargin?: boolean }) {
  return (
    <h3 className={cn('flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground/70', !noMargin && 'mb-2')}>
      {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      {children}
    </h3>
  )
}

function TaskRow({ task, onOpenTask, right }: { task: Task; onOpenTask: (t: Task) => void; right?: React.ReactNode }) {
  return (
    <li>
      <button
        onClick={() => onOpenTask(task)}
        className="group w-full flex items-center gap-2 px-1 py-1.5 text-left rounded-sm hover:bg-accent/60 transition-colors"
      >
        <Circle size={7} className="text-border shrink-0 group-hover:text-primary transition-colors" />
        <span className="flex-1 min-w-0 truncate text-[13px]">{task.title}</span>
        <span className="shrink-0">{right}</span>
        <ArrowRight size={13} className="text-transparent group-hover:text-muted-foreground transition-colors shrink-0" />
      </button>
    </li>
  )
}

function Avatar({ person, accent }: { person: Person; accent?: string }) {
  const initials = person.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
  const bg = accent ?? MUTED
  return (
    <span
      title={person.name}
      className="inline-grid place-items-center h-7 w-7 rounded-full text-white text-[11px] font-semibold shrink-0 shadow-sm"
      style={{ background: bg }}
    >
      {initials}
    </span>
  )
}

/** A one-line, plain-English read on *why* the project sits where it does. */
function healthReason(
  state: ReturnType<typeof useStore>['state'],
  project: { lastActivity: string; due?: string },
  stats: ReturnType<typeof projectStats>,
  health: ReturnType<typeof projectHealth>,
): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  if (health === 'done') return 'Completed.'
  if (health === 'on-hold') return 'On hold.'
  if (stats.overdue > 0) return `${plural(stats.overdue, 'task')} overdue.`
  if (project.due && daysSince(project.due) > 0 && stats.open > 0) return 'Past its due date with work left.'
  if (stats.blocked > 0) return `Blocked on ${plural(stats.blocked, 'task')}.`
  const stallDays = state.settings.stallDays ?? 14
  const idle = daysSince(project.lastActivity)
  if (idle >= stallDays) return `Stalled ${idle} days.`
  if (project.due && daysSince(project.due) >= -14 && stats.open > 0 && stats.pct < 60) return 'Due date approaching.'
  return 'On track.'
}
