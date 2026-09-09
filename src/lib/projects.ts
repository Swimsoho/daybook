// ---------- Project management: stats, health, and shared meta ----------
//
// The data layer behind the real Projects workspace. Everything here is a pure function of
// AppState so the portfolio, the project header, the overview, the boards and the timeline all
// read the *same* numbers — there is no second source of truth for "how far along is this".

import { AppState, Milestone, Person, Project, ProjectMember, Task, daysSince, uid } from '@/lib/model'
import { projectMilestones, openBlockers } from '@/lib/milestones'

export type Health = 'on-track' | 'at-risk' | 'off-track' | 'on-hold' | 'done'

// ---- Two-tier model: real projects vs. lightweight labels ----
export const isLabel = (p: Project) => p.kind === 'label'
export const isRealProject = (p: Project) => p.kind !== 'label'
/** Real projects only — what the Projects page and the PM workspace show. */
export function realProjects(s: AppState): Project[] { return s.projects.filter(isRealProject) }
/** Labels only — task-grouping tags that never appear on the Projects page. */
export function labelProjects(s: AppState): Project[] { return s.projects.filter(isLabel) }
/** The ids of real projects, for the "is this task hidden from the to-do list?" decision. */
export function realProjectIdSet(s: AppState): Set<string> {
  return new Set(s.projects.filter(isRealProject).map(p => p.id))
}
/** How many tasks carry a given label/project. */
export function projectTaskCount(s: AppState, projectId: string): number {
  return s.tasks.filter(t => t.projectId === projectId).length
}

export interface ProjectStats {
  total: number        // every task filed to the project (incl. done/dropped)
  done: number
  open: number         // not done/dropped/inbox
  inProgress: number
  waiting: number
  next: number         // status 'next'
  blocked: number      // open tasks with at least one unfinished blocker
  overdue: number      // open tasks past their due date
  dueSoon: number      // open tasks due within 7 days (today..+7), not overdue
  unassigned: number   // open tasks with no owner
  pct: number          // 0..100, done / total
  phases: number
  phasesDone: number
  nextMilestone?: Milestone   // earliest open phase (by sort)
  soonestDue?: Task           // nearest-due open task
  lastActivity: string        // most recent of project.lastActivity and any task activity
}

export function projectTasks(s: AppState, projectId: string): Task[] {
  return s.tasks.filter(t => t.projectId === projectId && !t.parentId)
}
/** including subtasks — used for accurate progress counts */
export function projectTasksAll(s: AppState, projectId: string): Task[] {
  return s.tasks.filter(t => t.projectId === projectId)
}

const isClosed = (t: Task) => t.status === 'done' || t.status === 'dropped'
const isOpen = (t: Task) => t.status !== 'done' && t.status !== 'dropped' && t.status !== 'inbox'

export function projectStats(s: AppState, projectId: string): ProjectStats {
  const all = projectTasksAll(s, projectId)
  const open = all.filter(isOpen)
  const done = all.filter(t => t.status === 'done').length
  const overdue = open.filter(t => !!t.due && daysSince(t.due) > 0).length
  const dueSoon = open.filter(t => !!t.due && daysSince(t.due) <= 0 && daysSince(t.due) >= -7).length
  const blocked = open.filter(t => openBlockers(s, t).length > 0).length
  const phasesArr = projectMilestones(s, projectId)
  const soonestDue = [...open].filter(t => t.due).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))[0]
  const nextMilestone = phasesArr.find(m => m.status !== 'done')
  return {
    total: all.length,
    done,
    open: open.length,
    inProgress: open.filter(t => t.status === 'in-progress').length,
    waiting: open.filter(t => t.status === 'waiting').length,
    next: open.filter(t => t.status === 'next').length,
    blocked,
    overdue,
    dueSoon,
    unassigned: open.filter(t => !t.assigneeMemberId).length,
    pct: all.length ? Math.round((done / all.length) * 100) : 0,
    phases: phasesArr.length,
    phasesDone: phasesArr.filter(m => m.status === 'done').length,
    nextMilestone,
    soonestDue,
    lastActivity: all.reduce((acc, t) => (t.completedAt && t.completedAt > acc ? t.completedAt : acc),
      s.projects.find(p => p.id === projectId)?.lastActivity ?? ''),
  }
}

/**
 * A project's health, computed the way a PM would eyeball it:
 *  - done / on-hold reflect the explicit status.
 *  - off-track: it has overdue tasks, or it's past its own due date with work left.
 *  - at-risk: it's stalled, has blocked work, or its due date is close (≤14d) and it's <60% done.
 *  - on-track otherwise.
 */
export function projectHealth(s: AppState, p: Project, stats?: ProjectStats): Health {
  if (p.status === 'done') return 'done'
  if (p.status === 'on-hold') return 'on-hold'
  const st = stats ?? projectStats(s, p.id)
  const pastDue = !!p.due && daysSince(p.due) > 0
  if (st.overdue > 0 || (pastDue && st.open > 0)) return 'off-track'
  const stallLimit = s.settings.stallDays ?? 14
  const stalled = daysSince(p.lastActivity) >= stallLimit
  const dueClose = !!p.due && daysSince(p.due) >= -14 && st.open > 0
  if (stalled || st.blocked > 0 || (dueClose && st.pct < 60)) return 'at-risk'
  return 'on-track'
}

export const HEALTH_META: Record<Health, { label: string; dot: string; text: string; bg: string; border: string }> = {
  'on-track': { label: 'On track', dot: 'hsl(152 40% 42%)', text: 'hsl(152 35% 30%)', bg: 'hsl(152 40% 42% / 0.10)', border: 'hsl(152 30% 62%)' },
  'at-risk':  { label: 'At risk',  dot: 'hsl(38 78% 48%)',  text: 'hsl(30 60% 32%)',  bg: 'hsl(38 78% 50% / 0.12)',  border: 'hsl(38 70% 60%)' },
  'off-track':{ label: 'Off track',dot: 'hsl(8 65% 48%)',   text: 'hsl(8 60% 38%)',   bg: 'hsl(8 65% 50% / 0.10)',   border: 'hsl(8 55% 65%)' },
  'on-hold':  { label: 'On hold',  dot: 'hsl(220 9% 55%)',  text: 'hsl(220 9% 40%)',  bg: 'hsl(220 9% 55% / 0.10)',  border: 'hsl(220 9% 70%)' },
  'done':     { label: 'Done',     dot: 'hsl(152 25% 40%)', text: 'hsl(152 25% 32%)', bg: 'hsl(152 25% 40% / 0.10)', border: 'hsl(152 20% 60%)' },
}

export const HEALTH_ORDER: Record<Health, number> = { 'off-track': 0, 'at-risk': 1, 'on-track': 2, 'on-hold': 3, 'done': 4 }

// ---- Project-scoped team (v118) ----
// A project's team is its own list of members (project.members), set up under the project itself —
// see the ProjectMember type. These helpers are the single source every project surface reads, so
// the Overview team panel, the board's assignee picker, the header owner and the portfolio all
// agree on who is on a project without ever touching the global People/contacts list.

/** The project's own team roster — the users set up under the project. */
export function projectMembers(s: AppState, projectId: string): ProjectMember[] {
  return s.projects.find(p => p.id === projectId)?.members ?? []
}
export function projectMembersOf(project: Project): ProjectMember[] {
  return project.members ?? []
}
/** Look up one member by id within a project. */
export function projectMember(project: Project | undefined, memberId?: string): ProjectMember | undefined {
  if (!project || !memberId) return undefined
  return (project.members ?? []).find(m => m.id === memberId)
}
/** The accountable member for a project (its owner), resolved from ownerMemberId. */
export function projectOwnerMember(project: Project | undefined): ProjectMember | undefined {
  return projectMember(project, project?.ownerMemberId)
}
/** The member a task is assigned to, within its project. */
export function taskAssignee(project: Project | undefined, task: Task): ProjectMember | undefined {
  return projectMember(project, task.assigneeMemberId)
}

// --- Legacy People-based lookups, retained only where a Person record is still wanted elsewhere ---
export function projectOwner(s: AppState, p: Project): Person | undefined {
  return p.ownerPersonId ? s.people.find(x => x.id === p.ownerPersonId) : undefined
}

/**
 * One-time migration (v118). Project teams used to be drawn from the global People/contacts list
 * (project.ownerPersonId + memberPersonIds, plus whoever a task's personId pointed at). That put the
 * whole personal address book into the assignee picker. This seeds each real project's own `members`
 * roster from those legacy references — copying just the name/email into standalone project users —
 * maps the owner to `ownerMemberId`, and rewrites each task's `personId` assignment to the new
 * project-scoped `assigneeMemberId`, so nothing that was assigned looks lost. Labels are skipped
 * (they only group tasks). Idempotent: a project that already has `members` is never re-touched.
 */
export function migrateProjectMembers(
  projects: Project[], tasks: Task[], people: Person[],
): { projects: Project[]; tasks: Task[] } {
  const peopleById = new Map(people.map(p => [p.id, p]))
  const taskAssign = new Map<string, string>() // taskId -> new assigneeMemberId
  const newProjects = (projects ?? []).map(proj => {
    if (isLabel(proj)) return proj
    if (proj.members && proj.members.length) return proj // already migrated / set up
    const personIds: string[] = []
    const push = (id?: string) => { if (id && !personIds.includes(id)) personIds.push(id) }
    push(proj.ownerPersonId)
    for (const id of proj.memberPersonIds ?? []) push(id)
    for (const t of tasks) if (t.projectId === proj.id) push(t.personId)
    const personToMember = new Map<string, string>()
    const members: ProjectMember[] = []
    for (const pid of personIds) {
      const person = peopleById.get(pid)
      if (!person) continue
      const mid = uid('pm')
      personToMember.set(pid, mid)
      members.push({ id: mid, name: person.name, email: person.email })
    }
    for (const t of tasks) {
      if (t.projectId === proj.id && t.personId && !t.assigneeMemberId) {
        const mid = personToMember.get(t.personId)
        if (mid) taskAssign.set(t.id, mid)
      }
    }
    const ownerMemberId = proj.ownerPersonId ? personToMember.get(proj.ownerPersonId) : undefined
    return { ...proj, members, ownerMemberId }
  })
  const newTasks = taskAssign.size
    ? (tasks ?? []).map(t => taskAssign.has(t.id) ? { ...t, assigneeMemberId: taskAssign.get(t.id) } : t)
    : tasks
  return { projects: newProjects, tasks: newTasks }
}

/** The project's effective start (explicit, else earliest task/milestone/created date). */
export function projectStart(s: AppState, p: Project): string | undefined {
  if (p.start) return p.start
  const dates: string[] = []
  for (const t of projectTasksAll(s, p.id)) { if (t.created) dates.push(t.created); if (t.due) dates.push(t.due) }
  for (const m of projectMilestones(s, p.id)) if (m.due) dates.push(m.due)
  dates.sort()
  return dates[0]
}

/** The project's effective end (explicit due, else latest task/milestone date). */
export function projectEnd(s: AppState, p: Project): string | undefined {
  const dates: string[] = []
  if (p.due) dates.push(p.due)
  for (const t of projectTasksAll(s, p.id)) if (t.due) dates.push(t.due)
  for (const m of projectMilestones(s, p.id)) if (m.due) dates.push(m.due)
  dates.sort()
  return dates[dates.length - 1]
}

export { isOpen as isOpenTask, isClosed as isClosedTask }
