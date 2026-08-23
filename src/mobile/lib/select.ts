import type { AppState, Area, Person, Project, Task, TaskStatus } from '@/lib/model';
import { daysSince, personOverdueBy, relDue, resolveTiers, tierColorOf, tierLabel } from '@/lib/model';

/**
 * Selectors — the only place the screens reach into `AppState`.
 *
 * Everything here reads the platform's real fields. There is no translation
 * layer and no mobile-side model: `done` is `status === 'done'`, areas come from
 * `state.areas`, tiers come from `resolveTiers(settings)`. If the web app
 * changes what a field means, these break loudly instead of quietly showing
 * something plausible.
 */

/** the platform treats both 'done' and 'dropped' as closed */
export function isDone(task: Task): boolean {
  return task.status === 'done';
}

export function isClosed(task: Task): boolean {
  return task.status === 'done' || task.status === 'dropped';
}

export function openTasks(state: AppState): Task[] {
  return state.tasks.filter((t) => !isClosed(t));
}

export function isOverdue(task: Task): boolean {
  return !isClosed(task) && relDue(task.due).tone === 'overdue';
}

export function isDueToday(task: Task): boolean {
  return !isClosed(task) && relDue(task.due).tone === 'today';
}

/**
 * Today's cut, matching the web app (feature manual §3): anything P0, or a
 * to-call task with no due date (so a call never goes stale for want of a
 * date), or anything due today or overdue.
 */
export function todaysTasks(state: AppState): Task[] {
  return openTasks(state)
    .filter(
      (t) =>
        t.priority === 'P0' ||
        (t.type === 'call' && !t.due) ||
        isDueToday(t) ||
        isOverdue(t),
    )
    .sort(byPriorityThenDue);
}

export function byPriorityThenDue(a: Task, b: Task): number {
  const p = a.priority.localeCompare(b.priority);
  if (p) return p;
  if (a.due && b.due) return a.due.localeCompare(b.due);
  return a.due ? -1 : b.due ? 1 : 0;
}

export function areaOf(state: AppState, areaId?: string): Area | undefined {
  return areaId ? state.areas.find((a) => a.id === areaId) : undefined;
}

export function activeAreas(state: AppState): Area[] {
  return state.areas.filter((a) => a.active).sort((a, b) => a.sort - b.sort);
}

export function projectOf(state: AppState, projectId?: string): Project | undefined {
  return projectId ? state.projects.find((p) => p.id === projectId) : undefined;
}

/** days a project has gone without activity — drives the stall badge */
export function staleDays(project: Project): number {
  return daysSince(project.lastActivity);
}

export function isStalled(project: Project, stallDays: number): boolean {
  return project.status === 'active' && staleDays(project) >= stallDays;
}

/* ── people ──────────────────────────────────────────────────────────────── */

export function tierName(state: AppState, tier: string): string {
  return tierLabel(state.settings, tier);
}

export function tierColor(state: AppState, tier: string): string {
  return tierColorOf(state.settings, tier);
}

export function tiersOf(state: AppState) {
  return resolveTiers(state.settings);
}

/** days since you last spoke — the platform stores a date, not a counter */
export function daysSinceContact(person: Person): number | null {
  return person.lastContact ? daysSince(person.lastContact) : null;
}

/** how far past their cadence a contact has drifted; 0 or less is in cadence */
export function overdueBy(state: AppState, person: Person): number {
  return personOverdueBy(person, state.settings);
}

export function callList(state: AppState): Person[] {
  return state.people
    .filter((p) => p.flaggedForCall || overdueBy(state, p) > 0)
    .sort((a, b) => overdueBy(state, b) - overdueBy(state, a));
}

/* ── inbox ───────────────────────────────────────────────────────────────── */

export function pendingCaptures(state: AppState) {
  return state.captures.filter((c) => c.status === 'pending');
}

/* ── labels ──────────────────────────────────────────────────────────────── */

export const STATUS_TONE: Record<TaskStatus, string> = {
  inbox: 'hsl(var(--muted-foreground))',
  next: 'hsl(var(--muted-foreground))',
  'in-progress': 'hsl(215 55% 45%)',
  waiting: 'hsl(35 60% 38%)',
  done: 'hsl(152 30% 36%)',
  dropped: 'hsl(220 9% 55%)',
};

/**
 * The due label shown on a row. A task blocked on someone shows that instead of
 * a date — a blocked task's due date isn't the useful information.
 */
export function dueLabel(task: Task): { label: string; tone: string; strong: boolean } {
  if (task.status === 'waiting' && task.waitingOn) {
    const since = task.waitingSince ? ` · ${daysSince(task.waitingSince)}d` : '';
    return { label: `waiting on ${task.waitingOn}${since}`, tone: 'hsl(35 60% 38%)', strong: false };
  }
  const { label, tone } = relDue(task.due);
  const colors: Record<string, string> = {
    overdue: 'hsl(8 60% 41%)',
    today: 'hsl(28 60% 32%)',
    soon: 'rgba(0,0,0,0.6)',
    later: 'hsl(75 8% 40%)',
    none: 'hsl(75 8% 55%)',
  };
  return { label, tone: colors[tone], strong: tone === 'overdue' || tone === 'today' };
}
