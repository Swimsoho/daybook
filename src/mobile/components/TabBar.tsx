import { Inbox, LayoutDashboard, ListChecks, MoreHorizontal, Users } from 'lucide-react';
import type { TabId } from '@/mobile/lib/types';

/**
 * Bottom tab bar — the desktop sidebar's dark surface rotated from a left rail
 * to a bottom bar, using the same themeable nav-* tokens.
 * Icons match the web app's lucide set icon-for-icon.
 */
const TABS: { id: TabId; label: string; Icon: typeof Inbox }[] = [
  { id: 'today', label: 'Today', Icon: LayoutDashboard },
  { id: 'inbox', label: 'Inbox', Icon: Inbox },
  { id: 'tasks', label: 'Tasks', Icon: ListChecks },
  { id: 'people', label: 'People', Icon: Users },
  { id: 'more', label: 'More', Icon: MoreHorizontal },
];

export function TabBar({
  active,
  onChange,
  pendingCaptures,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
  pendingCaptures: number;
}) {
  return (
    <nav
      className="flex shrink-0 px-[6px] pt-2 safe-bottom"
      style={{
        background: 'linear-gradient(178deg, hsl(var(--nav-from)), hsl(var(--nav-to)))',
        borderTop: '1px solid hsl(var(--nav-border))',
      }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={isActive ? 'page' : undefined}
            className="relative mx-[3px] flex flex-1 flex-col items-center gap-[3px] rounded-[10px] border-none pb-1 pt-2 transition-opacity"
            style={{
              background: isActive ? 'hsl(var(--nav-text) / 0.14)' : 'transparent',
              color: 'hsl(var(--nav-text))',
              opacity: isActive ? 1 : 0.55,
            }}
          >
            <span className="relative">
              <Icon size={19} strokeWidth={1.9} />
              {id === 'inbox' && pendingCaptures > 0 ? (
                <span
                  className="absolute -right-[3px] -top-[2px] block h-[7px] w-[7px] rounded-full"
                  style={{ background: 'hsl(8 62% 52%)' }}
                  aria-label={`${pendingCaptures} pending captures`}
                />
              ) : null}
            </span>
            <span className="text-[10px] font-semibold tracking-[0.01em]">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
