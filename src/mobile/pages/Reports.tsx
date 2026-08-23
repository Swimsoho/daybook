import { useState } from 'react';
import { Chip, EmptyState, SectionTitle } from '@/mobile/components/bits';
import { daysUntil } from '@/mobile/lib/collections';
import { activeAreas, isOverdue, isStalled, openTasks, overdueBy, tiersOf } from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import type { Priority } from '@/lib/model';

/**
 * Reports (feature manual §11) — two tabs.
 * Exception surfaces what needs attention right now; Standard is the charted
 * roll-up. Both are computed live from the store rather than pre-baked.
 */
export function Reports() {
  const [tab, setTab] = useState<'exception' | 'standard'>('exception');

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Chip active={tab === 'exception'} onClick={() => setTab('exception')}>
          Exception
        </Chip>
        <Chip active={tab === 'standard'} onClick={() => setTab('standard')}>
          Standard
        </Chip>
      </div>
      {tab === 'exception' ? <ExceptionReport /> : <StandardReport />}
    </div>
  );
}

function ExceptionReport() {
  const { state } = useStore();
  const { people, projects, trackers, entries, settings } = state;
  const open = openTasks(state);

  const overdue = open.filter(isOverdue);
  const waiting = open.filter((t) => t.status === 'waiting');
  const noDate = open.filter((t) => !t.due && t.status !== 'waiting');
  const stalled = projects.filter((p) => isStalled(p, settings.stallDays));
  const pastCadence = people.filter((p) => overdueBy(state, p) > 0);

  // renewals from a Subscriptions tracker, if one exists
  const subs = trackers.find((t) => /subscription/i.test(t.name));
  const dateCol = subs?.columns.find((c) => c.type === 'date');
  const renewals = subs && dateCol
    ? entries
        .filter((e) => e.trackerId === subs.id)
        .map((e) => ({
          title: String(e.values[subs.columns.find((c) => c.isTitle)?.key ?? ''] ?? 'Untitled'),
          days: daysUntil(String(e.values[dateCol.key] ?? ''), false),
        }))
        .filter((r) => r.days !== null && r.days >= 0 && r.days <= 30)
        .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
    : [];

  const cards = [
    { title: 'Overdue tasks', rows: overdue.map((t) => t.title), tone: 'danger' as const },
    {
      title: 'Contacts past cadence',
      rows: pastCadence.map((p) => `${p.name} — ${overdueBy(state, p)}d past cadence`),
    },
    { title: 'Waiting on someone', rows: waiting.map((t) => `${t.title} — ${t.waitingOn ?? 'unspecified'}`) },
    { title: 'Stalled projects', rows: stalled.map((p) => p.name), tone: 'danger' as const },
    { title: 'No due date', rows: noDate.map((t) => t.title) },
    { title: 'Renewals within 30 days', rows: renewals.map((r) => `${r.title} — in ${r.days}d`) },
  ].filter((c) => c.rows.length > 0);

  if (cards.length === 0) return <EmptyState>Nothing needs attention. Rare.</EmptyState>;

  return (
    <div>
      {cards.map((card) => (
        <div key={card.title} className="mb-3 rounded-[10px] border border-border bg-card p-3">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-[12.5px] font-semibold">{card.title}</span>
            <span
              className="tabular ml-auto rounded-[4px] px-[6px] py-[1px] text-[10.5px] font-bold"
              style={
                card.tone === 'danger'
                  ? { background: 'hsl(8 60% 41%)', color: 'hsl(45 50% 96%)' }
                  : { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }
              }
            >
              {card.rows.length}
            </span>
          </div>
          {card.rows.map((row, i) => (
            <div key={i} className="py-[3px] text-[12px] leading-[1.4]">
              {row}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function StandardReport() {
  const { state } = useStore();
  const { people, trackers, entries, settings } = state;
  const open = openTasks(state);

  const byArea = activeAreas(state).map((a) => ({
    label: a.name,
    value: open.filter((t) => t.areaId === a.id).length,
    color: a.color,
  }));

  const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3'];
  const byPriority = priorities.map((p) => ({
    label: p,
    value: open.filter((t) => t.priority === p).length,
    color: 'hsl(var(--primary))',
  }));

  const byTier = tiersOf(state).map((t) => ({
    label: t.name,
    value: people.filter((p) => p.tier === t.id).length,
    color: t.color,
  }));

  // running total of active subscription cost
  const subs = trackers.find((t) => /subscription/i.test(t.name));
  const costCol = subs?.columns.find((c) => c.type === 'currency');
  const statusCol = subs?.columns.find((c) => c.type === 'status');
  const monthly =
    subs && costCol
      ? entries
          .filter((e) => e.trackerId === subs.id)
          .filter((e) => !statusCol || String(e.values[statusCol.key]) !== 'Cancelled')
          .reduce((sum, e) => sum + (Number(e.values[costCol.key]) || 0), 0)
      : 0;

  return (
    <div>
      <Bars title="Open tasks by area" data={byArea} />
      <Bars title="Open tasks by priority" data={byPriority} />
      <Bars title="Contacts by tier" data={byTier} />

      <div className="mb-4">
        <SectionTitle className="mb-[10px]">Calls this week</SectionTitle>
        <p className="m-0 text-[12.5px] text-muted-foreground">
          0 of {settings.callGoal} logged. Call logging isn't wired up in this
          build — the Call buttons dial, but nothing records the interaction yet.
        </p>
      </div>

      {subs ? (
        <div className="rounded-[10px] border border-border bg-card p-3">
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
            Active subscriptions
          </div>
          <div className="tabular mt-1 font-display text-[24px] font-semibold">
            {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(monthly)}
            <span className="ml-1 text-[13px] font-normal text-muted-foreground">/month</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
              monthly * 12,
            )}{' '}
            a year
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Bars({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="mb-5">
      <SectionTitle className="mb-[10px]">{title}</SectionTitle>
      {data.map((d) => (
        <div key={d.label} className="mb-2 flex items-center gap-2">
          <span className="w-[86px] shrink-0 truncate text-[11.5px] capitalize">{d.label}</span>
          <div className="h-[16px] flex-1 overflow-hidden rounded-[4px]" style={{ background: 'hsl(var(--muted))' }}>
            <div
              className="h-full rounded-[4px]"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color, minWidth: d.value ? 3 : 0 }}
            />
          </div>
          <span className="tabular w-[22px] shrink-0 text-right text-[11.5px] font-semibold">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
}
