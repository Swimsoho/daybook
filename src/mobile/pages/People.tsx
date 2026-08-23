import { daysSinceContact, overdueBy, tierColor, tierName } from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import { Avatar, CallButton, EmptyState, TierBadge } from '@/mobile/components/bits';

/** relationship list — tap a row for detail, tap Call to dial without opening it */
export function People({ onOpenPerson }: { onOpenPerson: (id: string) => void }) {
  const { state } = useStore();

  if (state.people.length === 0) return <EmptyState>No contacts yet.</EmptyState>;

  return (
    <div>
      {state.people.map((person) => {
        const since = daysSinceContact(person);
        const drift = overdueBy(state, person);
        return (
          <div
            key={person.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenPerson(person.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenPerson(person.id);
              }
            }}
            className="flex cursor-pointer items-center gap-[10px] py-[10px] active:opacity-70"
            style={{ borderBottom: '1px solid hsl(var(--border))' }}
          >
            <Avatar name={person.name} color={tierColor(state, person.tier)} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[6px]">
                <span className="truncate text-[13.5px] font-semibold">{person.name}</span>
                {person.vip ? <span className="shrink-0 text-[11px]">★</span> : null}
                {person.flaggedForCall ? (
                  <span
                    className="block h-[6px] w-[6px] shrink-0 rounded-full"
                    style={{ background: 'hsl(8 62% 52%)' }}
                    aria-label="Flagged for a call"
                  />
                ) : null}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {person.how}
                {since !== null ? ` · ${since}d ago` : ' · never'}
                {drift > 0 ? ` · ${drift}d overdue` : ''}
              </div>
            </div>

            <TierBadge label={tierName(state, person.tier)} color={tierColor(state, person.tier)} />
            {person.phone ? <CallButton phone={person.phone} /> : null}
          </div>
        );
      })}
    </div>
  );
}
