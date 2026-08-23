import { useState } from 'react';
import { Chip, EmptyState } from '@/mobile/components/bits';
import { useStore } from '@/lib/store';

const FILTERS = ['all', 'task', 'person', 'project', 'entry', 'capture'] as const;
type Filter = (typeof FILTERS)[number];

const LABELS: Record<Filter, string> = {
  all: 'All',
  task: 'Tasks',
  person: 'People',
  project: 'Projects',
  entry: 'Collections',
  capture: 'Captures',
};

/**
 * History — a filterable view over the append-only audit trail
 * (`AuditEvent`: ts / user / action / entity / entityId / detail).
 */
export function History() {
  const { state } = useStore();
  const [filter, setFilter] = useState<Filter>('all');

  const rows = [...state.audit]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .filter((e) => filter === 'all' || e.entity === filter);

  return (
    <div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <Chip key={f} active={f === filter} onClick={() => setFilter(f)}>
            {LABELS[f]}
          </Chip>
        ))}
      </div>

      {rows.length === 0 ? <EmptyState>Nothing logged yet.</EmptyState> : null}

      {rows.map((event) => (
        <div
          key={event.id}
          className="py-[10px]"
          style={{ borderBottom: '1px solid hsl(var(--border))' }}
        >
          <div className="text-[12.5px] leading-[1.45]">{event.detail || event.action}</div>
          <div className="mt-[3px] flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
            <span className="font-semibold">{event.user}</span>
            <span>·</span>
            <span>{relative(event.ts)}</span>
            <span>·</span>
            <span className="uppercase tracking-[0.05em]">{event.action}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function relative(ts: string): string {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60_000);
  if (Number.isNaN(mins)) return ts;
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
