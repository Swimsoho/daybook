import type { AppState, Milestone, Task } from './model'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PROJECT PHASES
 * ─────────────────────────────────────────────────────────────────────────────
 * The maths behind the project tracker, kept out of the components so the phone
 * and the desktop count the same way and the counting is testable on its own.
 *
 * One rule runs through all of it: a phase never *contains* tasks, it is only
 * pointed at. Delete a phase and its tasks survive with no phase — they don't
 * vanish with it. That asymmetry is on purpose; the alternative loses work when
 * someone tidies up their plan.
 */

/** The special group for tasks filed to a project but not to any phase. */
export const NO_PHASE = '__none__'

export function projectMilestones(state: AppState, projectId: string): Milestone[] {
  return (state.milestones ?? [])
    .filter(m => m.projectId === projectId)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
}

/** Top-level tasks on a project. Subtasks belong to their parent, not the board. */
export function projectTasks(state: AppState, projectId: string): Task[] {
  return state.tasks.filter(t => t.projectId === projectId && !t.parentId)
}

export const isFinished = (t: Task) => t.status === 'done' || t.status === 'dropped'

export interface Progress {
  done: number
  total: number
  /** 0–100, and 0 rather than NaN when a phase is empty */
  pct: number
}

export function progress(tasks: Task[]): Progress {
  const total = tasks.length
  const done = tasks.filter(isFinished).length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

/**
 * Tasks grouped into their phases, in phase order, with the unphased ones last.
 *
 * Every phase appears even when empty — an empty phase is information ("Platform
 * hasn't started"), and hiding it would make a plan look shorter than it is.
 */
/** `milestone: null` is the unphased group — always last, only shown when it has work. */
export interface PhaseGroup {
  milestone: Milestone | null
  tasks: Task[]
}

export function groupByPhase(state: AppState, projectId: string, tasks?: Task[]): PhaseGroup[] {
  const all = tasks ?? projectTasks(state, projectId)
  const phases = projectMilestones(state, projectId)
  const groups: PhaseGroup[] = phases.map(m => ({
    milestone: m,
    tasks: all.filter(t => t.milestoneId === m.id),
  }))
  // A task pointing at a phase that has since been deleted is treated as unphased
  // rather than silently dropped off the board.
  const known = new Set(phases.map(m => m.id))
  const loose = all.filter(t => !t.milestoneId || !known.has(t.milestoneId))
  if (loose.length || !phases.length) groups.push({ milestone: null, tasks: loose })
  return groups
}

/** The blockers of `task` that haven't finished yet. Empty means it's clear to start. */
export function openBlockers(state: AppState, task: Task): Task[] {
  if (!task.blockedBy?.length) return []
  return task.blockedBy
    .map(id => state.tasks.find(t => t.id === id))
    .filter((t): t is Task => !!t && !isFinished(t))
}

export function isBlocked(state: AppState, task: Task): boolean {
  return openBlockers(state, task).length > 0
}

/**
 * Which tasks can legally be named as blockers of `task`.
 *
 * Same project, not itself, and — the part that matters — nothing that already
 * depends on `task`, directly or through a chain. Without that walk you can
 * build A→B→C→A, and every consumer of `openBlockers` then reports three tasks
 * permanently blocked with no way to see why.
 */
export function eligibleBlockers(state: AppState, task: Task): Task[] {
  if (!task.projectId) return []
  const downstream = new Set<string>([task.id])
  let grew = true
  while (grew) {
    grew = false
    for (const t of state.tasks) {
      if (downstream.has(t.id)) continue
      if (t.blockedBy?.some(id => downstream.has(id))) {
        downstream.add(t.id)
        grew = true
      }
    }
  }
  return state.tasks.filter(t => t.projectId === task.projectId && !downstream.has(t.id))
}

export interface ProjectStats {
  total: number
  done: number
  inProgress: number
  /** no owner set — the "who has actually picked this up?" number */
  unassigned: number
  /** top-priority work still open, which is the number that decides the week */
  topOpen: number
  blocked: number
}

export function projectStats(state: AppState, tasks: Task[]): ProjectStats {
  const open = tasks.filter(t => !isFinished(t))
  return {
    total: tasks.length,
    done: tasks.filter(t => t.status === 'done').length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    unassigned: open.filter(t => !t.personId).length,
    topOpen: open.filter(t => t.priority === 'P0' || t.priority === 'P1').length,
    blocked: open.filter(t => isBlocked(state, t)).length,
  }
}

/**
 * A short reference for a task inside its project — "F1", "P3" — built from the
 * phase initial and the task's position in it. The tracker this mirrors uses
 * these as the handle for dependencies, and they read far better than a uuid.
 *
 * They're derived, never stored, so they renumber when work is reordered. That's
 * the right trade: a stored code would drift from its own phase the first time
 * something moved.
 */
export function phaseRefs(state: AppState, projectId: string): Map<string, string> {
  const refs = new Map<string, string>()
  for (const { milestone, tasks } of groupByPhase(state, projectId)) {
    const letter = (milestone?.name.trim()[0] ?? 'X').toUpperCase()
    tasks.forEach((t, i) => refs.set(t.id, `${letter}${i + 1}`))
  }
  return refs
}
