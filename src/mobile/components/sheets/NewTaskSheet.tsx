import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PRIORITY_SOLID } from '@/mobile/lib/colors';
import { activeAreas } from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import { today, type Priority, type Task } from '@/lib/model';
import { BottomSheet, SheetTitle } from '@/mobile/components/BottomSheet';
import { Field, OutlineButton, PrimaryButton, Segmented, inputClass, textareaClass } from '@/mobile/components/bits';

type Draft = { title: string; priority: Priority; areaId: string; due: string; notes: string };

export function NewTaskSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (input: Partial<Task> & { title: string }) => void;
}) {
  const { state } = useStore();
  const areas = activeAreas(state);

  const empty = (): Draft => ({
    title: '',
    priority: 'P1',
    areaId: areas[0]?.id ?? '',
    due: today(),
    notes: '',
  });

  const [draft, setDraft] = useState<Draft>(empty);

  useEffect(() => {
    if (open) setDraft(empty());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = () => {
    if (!draft.title.trim()) {
      toast.error('A title is needed');
      return;
    }
    onAdd({
      title: draft.title.trim(),
      areaId: draft.areaId || undefined,
      priority: draft.priority,
      due: draft.due || undefined,
      notes: draft.notes,
      status: 'next',
      type: 'todo',
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} height="80%" title={<SheetTitle>New task</SheetTitle>}>
      <Field label="Title">
        <input
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="What needs doing?"
          className={inputClass}
        />
      </Field>

      <Field label="Priority">
        <Segmented<Priority>
          value={draft.priority}
          onChange={(priority) => setDraft((d) => ({ ...d, priority }))}
          options={(['P0', 'P1', 'P2'] as Priority[]).map((p) => ({
            value: p,
            label: p,
            color: PRIORITY_SOLID[p],
          }))}
        />
      </Field>

      {areas.length ? (
        <Field label="Area">
          {/* the real, user-editable area list — not a hardcoded three */}
          <select
            value={draft.areaId}
            onChange={(e) => setDraft((d) => ({ ...d, areaId: e.target.value }))}
            className={inputClass}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="Due date">
        <input
          type="date"
          value={draft.due}
          onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))}
          className={inputClass}
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
        <OutlineButton onClick={onClose}>Cancel</OutlineButton>
        <PrimaryButton onClick={submit}>Add task</PrimaryButton>
      </div>
    </BottomSheet>
  );
}
