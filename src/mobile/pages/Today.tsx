import { daysUntil } from '@/mobile/lib/collections';
import { DANGER } from '@/mobile/lib/colors';
import {
  callList,
  daysSinceContact,
  isDone,
  isOverdue,
  isDueToday,
  openTasks,
  overdueBy,
  tierColor,
  todaysTasks,
} from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import { Avatar, CallButton, EmptyState, SectionTitle } from '@/mobile/components/bits';
import { TaskRow } from '@/mobile/components/TaskRow';
import type { AppState, Person } from '@/lib/model';

/** the daily driver — what's due, who to call, upcoming dates, morning brief */
export function Today({
  onOpenTask,
  onToggleTask,
}: {
  onOpenTask: (id: string) => void;
  onToggleTask: (id: string) => void;
}) {
  const { state } = useStore();
  const { settings } = state;

  const now = todaysTasks(state);
  const open = openTasks(state);
  const dueTodayCount = open.filter(isDueToday).length;
  const overdueCount = open.filter(isOverdue).length;
  const doneToday = state.tasks.filter(
    (t) => isDone(t) && t.completedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10),
  ).length;

  const toCall = callList(state).slice(0, settings.callGoal + 1);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Kpi label="Due today" value={dueTodayCount} accent="hsl(var(--primary))" />
        <Kpi label="Overdue" value={overdueCount} accent={DANGER.kpi} valueColor={DANGER.kpi} />
        <Kpi
          label="Capacity"
          value={`${doneToday}/${settings.dailyCapacity}`}
          accent="hsl(var(--primary))"
        />
      </div>

      <SectionTitle className="mb-[10px]">Now</SectionTitle>
      {now.length ? (
        now.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={onToggleTask} onOpen={onOpenTask} />
        ))
      ) : (
        <EmptyState>
          {state.tasks.length === 0
            ? 'No tasks yet. Tap + to capture your first one.'
            : 'Nothing due. Enjoy it.'}
        </EmptyState>
      )}

      {toCall.length ? (
        <div className="mt-[22px]">
          <SectionTitle className="mb-[10px]">People to call</SectionTitle>
          {toCall.map((person) => (
            <CallRow key={person.id} person={person} state={state} />
          ))}
        </div>
      ) : null}

      <UpcomingDates state={state} />

      {settings.features?.morningBrief !== false ? (
        <div className="mt-[22px] rounded-[10px] bg-muted p-[14px]">
          <SectionTitle size={15} className="mb-2">
            Morning brief
          </SectionTitle>
          <p className="m-0 text-[12.5px] leading-[1.5]" style={{ color: 'hsl(75 8% 30%)' }}>
            {brief(state, now, overdueCount, toCall.length)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  valueColor,
}: {
  label: string;
  value: number | string;
  accent: string;
  valueColor?: string;
}) {
  return (
    <div
      className="flex-1 rounded-[10px] border border-border px-3 py-[10px]"
      style={{ background: `color-mix(in srgb, ${accent} 8%, hsl(var(--card)))` }}
    >
      <div className="text-[10px] uppercase tracking-[0.08em] opacity-70">{label}</div>
      <div
        className="tabular mt-1 font-display text-[24px] font-semibold"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function CallRow({ person, state }: { person: Person; state: AppState }) {
  const since = daysSinceContact(person);
  const drift = overdueBy(state, person);
  return (
    <div className="flex items-center gap-[10px] py-2">
      <Avatar name={person.name} color={tierColor(state, person.tier)} size={30} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold">{person.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {since === null ? 'no contact logged' : `${since}d since contact`}
          {drift > 0 ? ` · ${drift}d overdue` : ''}
        </div>
      </div>
      {person.phone ? <CallButton phone={person.phone} /> : null}
    </div>
  );
}

/**
 * Upcoming dates — the "Dates to Remember" tracker, next 30 days, nearest
 * first. Recurring dates roll forward via the platform's own `nextOccurrence`,
 * so a 1958 birth year still surfaces as this year's birthday.
 */
function UpcomingDates({ state }: { state: AppState }) {
  const tracker = state.trackers.find((t) => /dates to remember/i.test(t.name));
  if (!tracker) return null;

  const nameCol = tracker.columns.find((c) => c.isTitle);
  const dateCol = tracker.columns.find((c) => c.type === 'date');
  const repeatCol = tracker.columns.find((c) => c.type === 'checkbox');
  const typeCol = tracker.columns.find((c) => c.type === 'select');
  if (!nameCol || !dateCol) return null;

  const upcoming = state.entries
    .filter((e) => e.trackerId === tracker.id)
    .map((e) => ({
      name: String(e.values[nameCol.key] ?? 'Untitled'),
      kind: typeCol ? String(e.values[typeCol.key] ?? '') : '',
      days: daysUntil(
        String(e.values[dateCol.key] ?? ''),
        repeatCol ? Boolean(e.values[repeatCol.key]) : false,
      ),
    }))
    .filter((d): d is { name: string; kind: string; days: number } =>
      d.days !== null && d.days >= 0 && d.days <= 30,
    )
    .sort((a, b) => a.days - b.days);

  if (upcoming.length === 0) return null;

  const icon = (kind: string) => (/birth/i.test(kind) ? '🎂' : /anniv/i.test(kind) ? '💍' : '📌');
  const label = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`);

  return (
    <div className="mt-[22px]">
      <SectionTitle className="mb-[10px]">Upcoming dates</SectionTitle>
      {upcoming.map((d) => (
        <div key={`${d.name}-${d.days}`} className="flex items-center gap-[10px] py-[7px]">
          <span aria-hidden className="text-[15px]">
            {icon(d.kind)}
          </span>
          <span className="flex-1 truncate text-[13px] font-semibold">{d.name}</span>
          <span
            className="shrink-0 text-[11px]"
            style={
              d.days <= 1
                ? { color: 'hsl(28 60% 32%)', fontWeight: 600 }
                : { color: 'hsl(var(--muted-foreground))' }
            }
          >
            {label(d.days)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** built from the actual list, so it stays true as things get done */
function brief(
  state: AppState,
  now: ReturnType<typeof todaysTasks>,
  overdueCount: number,
  callCount: number,
): string {
  if (!now.length && !callCount) return 'Nothing due and nobody waiting on a call. Clear day.';

  const parts: string[] = [];
  const top = now.slice(0, 3).map((t) => lowerFirst(t.title));
  if (top.length) {
    parts.push(
      `Top of your day: ${top.slice(0, -1).join(', ')}${top.length > 1 ? ', and ' : ''}${
        top[top.length - 1]
      }.`,
    );
  }
  if (overdueCount) parts.push(`${overdueCount} item${overdueCount === 1 ? '' : 's'} overdue.`);
  if (callCount) {
    parts.push(`${callCount} ${callCount === 1 ? 'person is' : 'people are'} worth a call.`);
  }

  // the nudge: whichever is more pressing, a stalled project or a drifting contact
  const stalled = state.projects.find(
    (p) =>
      p.status === 'active' &&
      (Date.now() - new Date(p.lastActivity + 'T12:00:00').getTime()) / 86_400_000 >=
        state.settings.stallDays,
  );
  if (stalled) parts.push(`“${stalled.name}” has gone quiet — worth restarting or parking?`);

  return parts.join(' ');
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
