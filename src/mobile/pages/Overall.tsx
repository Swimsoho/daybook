import { SectionTitle } from '@/mobile/components/bits';
import { DANGER } from '@/mobile/lib/colors';
import {
  activeAreas,
  isClosed,
  isDone,
  isOverdue,
  isStalled,
  openTasks,
  overdueBy,
  tiersOf,
} from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import { daysSince } from '@/lib/model';

/** Overall — the portfolio view: six KPIs, area roll-up, relationship health */
export function Overall({ onOpenProjects }: { onOpenProjects: () => void }) {
  const { state } = useStore();
  const { settings } = state;

  const open = openTasks(state);
  const overdue = open.filter(isOverdue);
  const activeProjects = state.projects.filter((p) => p.status === 'active');
  const stalled = activeProjects.filter((p) => isStalled(p, settings.stallDays));

  // "this week" = the last 7 days, by completion date
  const doneThisWeek = state.tasks.filter(
    (t) => isDone(t) && t.completedAt && daysSince(t.completedAt.slice(0, 10)) <= 7,
  ).length;
  const callsThisWeek = state.interactions.filter(
    (i) => i.channel === 'call' && daysSince(i.date) <= 7,
  ).length;

  // dormant-tier contacts are deliberately excluded — they're dormant by choice
  const tiers = tiersOf(state);
  const dormantId = tiers.find((t) => /dormant/i.test(t.name))?.id;
  const contactsOverdue = state.people.filter(
    (p) => p.tier !== dormantId && overdueBy(state, p) > 0,
  ).length;

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <Kpi label="Open tasks" value={open.length} />
        <Kpi label="Overdue" value={overdue.length} tone={overdue.length ? DANGER.kpi : undefined} />
        <Kpi
          label="Projects"
          value={activeProjects.length}
          note={stalled.length ? `${stalled.length} stalled` : undefined}
          onClick={onOpenProjects}
        />
        <Kpi label="Calls this week" value={`${callsThisWeek}/${settings.callGoal}`} />
        <Kpi
          label="Contacts overdue"
          value={contactsOverdue}
          tone={contactsOverdue ? DANGER.kpi : undefined}
        />
        <Kpi label="Done this week" value={doneThisWeek} />
      </div>

      <SectionTitle className="mb-[10px]">Portfolio</SectionTitle>
      {activeAreas(state).map((area) => {
        const areaProjects = state.projects.filter(
          (p) => p.areaId === area.id && p.status !== 'archived',
        );
        const areaOpen = state.tasks.filter((t) => t.areaId === area.id && !isClosed(t));
        return (
          <button
            key={area.id}
            type="button"
            onClick={onOpenProjects}
            className="flex w-full items-center gap-[10px] py-[10px] text-left active:opacity-70"
            style={{ borderBottom: '1px solid hsl(var(--border))' }}
          >
            <span
              className="h-[8px] w-[8px] shrink-0 rounded-full"
              style={{ background: area.color }}
            />
            <span className="flex-1 truncate text-[13.5px] font-semibold">{area.name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {areaProjects.length} {areaProjects.length === 1 ? 'project' : 'projects'} ·{' '}
              {areaOpen.length} open
            </span>
          </button>
        );
      })}

      <div className="mt-6">
        <SectionTitle className="mb-[10px]">Relationship health</SectionTitle>
        {tiers.map((tier) => {
          const inTier = state.people.filter((p) => p.tier === tier.id);
          const withinCadence = inTier.filter((p) => overdueBy(state, p) <= 0).length;
          const pct = inTier.length ? Math.round((withinCadence / inTier.length) * 100) : 0;
          return (
            <div key={tier.id} className="mb-[10px]">
              <div className="mb-[4px] flex items-baseline justify-between">
                <span className="text-[12px] font-semibold">{tier.name}</span>
                <span className="tabular text-[11px] text-muted-foreground">
                  {withinCadence}/{inTier.length} in cadence
                </span>
              </div>
              <div
                className="h-[6px] overflow-hidden rounded-full"
                style={{ background: 'hsl(var(--muted))' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: tier.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  note?: string;
  tone?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className="rounded-[10px] border border-border bg-card px-3 py-[10px] text-left"
    >
      <div className="text-[10px] uppercase tracking-[0.08em] opacity-70">{label}</div>
      <div
        className="tabular mt-1 font-display text-[22px] font-semibold"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
      {note ? (
        <div className="text-[10.5px] font-semibold" style={{ color: DANGER.kpi }}>
          {note}
        </div>
      ) : null}
    </Tag>
  );
}
