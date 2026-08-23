import {
  ChevronRight,
  ClipboardList,
  FolderKanban,
  History as HistoryIcon,
  LayoutDashboard,
  Settings as SettingsIcon,
  Table2,
} from 'lucide-react';
import { SectionTitle } from '@/mobile/components/bits';
import { useStore } from '@/lib/store';
import type { SubPage } from '@/mobile/lib/types';

/**
 * More — the hub for everything that isn't part of the daily loop.
 *
 * The desktop shell has eleven sidebar sections. A phone tab bar holds five
 * before it starts feeling cramped, so the daily loop (Today / Inbox / Tasks /
 * People) stays on the bar and the remaining six live one tap under here.
 * Nothing from the platform is dropped — it's re-shaped for the smaller frame.
 */
const ITEMS: {
  id: SubPage;
  label: string;
  description: string;
  Icon: typeof Table2;
}[] = [
  {
    id: 'overall',
    label: 'Overall',
    description: 'Portfolio KPIs, area roll-up, relationship health',
    Icon: LayoutDashboard,
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Grouped by area, with stall and WIP warnings',
    Icon: FolderKanban,
  },
  {
    id: 'collections',
    label: 'Collections',
    description: 'Trackers for anything that isn’t a task',
    Icon: Table2,
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'What needs attention, and the numbers behind it',
    Icon: ClipboardList,
  },
  {
    id: 'history',
    label: 'History',
    description: 'The append-only audit trail',
    Icon: HistoryIcon,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Appearance, capacity, account',
    Icon: SettingsIcon,
  },
];

export function More({ onOpen }: { onOpen: (page: SubPage) => void }) {
  const { state } = useStore();
  const { trackers, entries, captures } = state;
  const pending = captures.filter((c) => c.status === 'pending');

  const counts: Partial<Record<SubPage, string>> = {
    collections: `${trackers.length} trackers · ${entries.length} entries`,
  };

  return (
    <div>
      <div className="mb-5 rounded-[10px] border border-border bg-card p-[14px]">
        <div className="font-display text-[17px] font-semibold">Your workspace</div>
        <div className="mt-[2px] text-[11.5px] text-muted-foreground">
          {state.tasks.length} tasks · {state.people.length} people · {entries.length} entries
        </div>

        {pending.length ? (
          <div className="mt-2 text-[11.5px]" style={{ color: 'hsl(152 22% 30%)' }}>
            {pending.length} capture{pending.length === 1 ? '' : 's'} waiting in your Inbox
          </div>
        ) : null}
      </div>

      <SectionTitle className="mb-[10px]">Sections</SectionTitle>

      {ITEMS.map(({ id, label, description, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(id)}
          className="flex w-full items-center gap-3 py-[13px] text-left active:opacity-70"
          style={{ borderBottom: '1px solid hsl(var(--border))' }}
        >
          <span
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]"
            style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--primary))' }}
          >
            <Icon size={17} strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">{label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {counts[id] ?? description}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 opacity-40" />
        </button>
      ))}
    </div>
  );
}
