import { Pencil } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { daysSinceContact, overdueBy, tierColor, tierName, tiersOf } from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import { today, type Person } from '@/lib/model';
import { BottomSheet, SheetTitle } from '@/mobile/components/BottomSheet';
import {
  Avatar,
  CallButton,
  Field,
  OutlineButton,
  PrimaryButton,
  Segmented,
  TierBadge,
  inputClass,
  textareaClass,
} from '@/mobile/components/bits';

type Draft = { phone: string; tier: string; notes: string };

export function PersonDetailSheet({
  person,
  onClose,
  onSave,
}: {
  person: Person | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Person>) => void;
}) {
  const { state, logInteraction } = useStore();
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [draft, setDraft] = useState<Draft>({ phone: '', tier: '', notes: '' });

  useEffect(() => {
    if (person) {
      setEditing(false);
      setDraft({ phone: person.phone ?? '', tier: person.tier, notes: person.notes ?? '' });
    }
  }, [person]);

  if (!person) return null;

  const since = daysSinceContact(person);
  const drift = overdueBy(state, person);

  const save = () => {
    onSave(person.id, {
      phone: draft.phone.trim() || undefined,
      tier: draft.tier,
      notes: draft.notes,
    });
    setEditing(false);
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      height={editing ? '76%' : '66%'}
      title={
        <div className="flex items-start justify-between gap-3">
          <SheetTitle>{editing ? 'Edit contact' : 'Contact'}</SheetTitle>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit contact"
              className="shrink-0 rounded-[7px] border border-border p-[7px] text-muted-foreground active:opacity-70"
            >
              <Pencil size={14} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      }
    >
      {editing ? (
        <>
          <Field label="Phone">
            <input
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              placeholder="+44…"
              inputMode="tel"
              className={inputClass}
            />
          </Field>

          <Field label="Tier">
            <Segmented
              value={draft.tier}
              onChange={(tier) => setDraft((d) => ({ ...d, tier }))}
              options={tiersOf(state).map((t) => ({ value: t.id, label: t.name, color: t.color }))}
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              className={textareaClass}
            />
          </Field>

          <div className="mt-1 flex gap-[10px]">
            <OutlineButton onClick={() => setEditing(false)}>Cancel</OutlineButton>
            <PrimaryButton onClick={save}>Save</PrimaryButton>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={person.name} color={tierColor(state, person.tier)} size={44} />
            <div className="min-w-0">
              <div className="font-display text-[19px] font-semibold leading-tight">
                {person.name}
                {person.vip ? <span className="ml-1 text-[13px]">★</span> : null}
              </div>
              <div className="mt-[3px] text-[11.5px] text-muted-foreground">
                {person.how}
                {since !== null ? ` · last spoke ${since}d ago` : ' · no contact logged'}
              </div>
            </div>
            <span className="ml-auto">
              <TierBadge
                label={tierName(state, person.tier)}
                color={tierColor(state, person.tier)}
                size="md"
              />
            </span>
          </div>

          {drift > 0 ? (
            <p className="m-0 mb-3 text-[12px] font-semibold" style={{ color: 'hsl(8 60% 41%)' }}>
              {drift}d past your cadence for this tier.
            </p>
          ) : null}

          <div className="mb-4 rounded-[10px] border border-border p-3">
            <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Phone</div>
            <div className={`mt-1 text-[13.5px] ${person.phone ? 'font-semibold' : 'italic opacity-55'}`}>
              {person.phone ?? 'No phone on file'}
            </div>
            {person.email ? (
              <>
                <div className="mt-2 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                  Email
                </div>
                <div className="mt-1 text-[13px]">{person.email}</div>
              </>
            ) : null}
          </div>

          {person.topics ? (
            <p className="m-0 mb-2 text-[12.5px] leading-[1.5]">
              <span className="text-muted-foreground">Topics: </span>
              {person.topics}
            </p>
          ) : null}

          {person.notes ? (
            <p className="m-0 mb-5 whitespace-pre-wrap text-[12.5px] leading-[1.5]" style={{ color: 'hsl(75 8% 30%)' }}>
              {person.notes}
            </p>
          ) : null}

          {person.phone ? <CallButton phone={person.phone} label={`Call ${person.name}`} full /> : null}

          {logging ? (
            <LogCall
              person={person}
              onCancel={() => setLogging(false)}
              onSave={(closeTaskIds) => {
                logInteraction(
                  {
                    date: today(),
                    personId: person.id,
                    channel: 'call',
                    purpose: 'Call',
                    outcome: 'Spoke — logged from mobile',
                    sentiment: 'positive',
                  },
                  { closeTaskIds },
                );
                const n = closeTaskIds.length;
                toast.success(n ? `Logged — ${n} ${n === 1 ? 'task' : 'tasks'} closed` : 'Logged');
                setLogging(false);
                onClose();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setLogging(true)}
              className="mt-2 w-full rounded-lg border border-border py-[11px] text-[13px] font-semibold active:opacity-70"
            >
              Log a call
            </button>
          )}
        </>
      )}
    </BottomSheet>
  );
}

/**
 * Logging a call from the phone.
 *
 * The point of this is the tick-list: a call used to update the contact but leave the task
 * that asked for the call sitting open, so the thing you'd just done still looked outstanding.
 * Everything open for that person is pre-ticked; untick whatever the call didn't cover.
 */
function LogCall({
  person,
  onCancel,
  onSave,
}: {
  person: Person;
  onCancel: () => void;
  onSave: (closeTaskIds: string[]) => void;
}) {
  const { state } = useStore();
  const open = useMemo(
    () =>
      state.tasks.filter(
        (t) =>
          t.personId === person.id &&
          (t.type === 'call' || t.type === 'followup') &&
          t.status !== 'done' &&
          t.status !== 'dropped',
      ),
    [state.tasks, person.id],
  );
  const [closeIds, setCloseIds] = useState<string[]>(() => open.map((t) => t.id));

  return (
    <div className="mt-3 rounded-[10px] border border-border p-3">
      {open.length ? (
        <>
          <div className="mb-2 text-[12px] font-semibold">
            Close {open.length === 1 ? 'this task' : 'these tasks'}?
          </div>
          <div className="grid gap-[6px]">
            {open.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-start gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  className="mt-[3px] h-[15px] w-[15px] accent-[hsl(var(--primary))]"
                  checked={closeIds.includes(t.id)}
                  onChange={(e) =>
                    setCloseIds((ids) =>
                      e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id),
                    )
                  }
                />
                <span className="min-w-0">{t.title}</span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <p className="m-0 mb-2 text-[12px] text-muted-foreground">
          No open call tasks for {person.name} — this just records the touch.
        </p>
      )}

      <div className="mt-3 flex gap-[10px]">
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
        <PrimaryButton onClick={() => onSave(closeIds)}>Log it</PrimaryButton>
      </div>
    </div>
  );
}
