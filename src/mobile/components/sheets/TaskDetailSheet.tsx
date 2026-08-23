import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PRIORITY_SOLID } from '@/mobile/lib/colors';
import { areaOf, dueLabel, isDone } from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import { STATUS_LABELS, TYPE_LABELS, type Priority, type Task } from '@/lib/model';
import { BottomSheet, SheetTitle } from '@/mobile/components/BottomSheet';
import {
  AreaTag,
  DueLabel,
  Field,
  OutlineButton,
  PriorityChip,
  PrimaryButton,
  Segmented,
  inputClass,
  textareaClass,
} from '@/mobile/components/bits';

type Draft = { title: string; priority: Priority; due: string; notes: string };

export function TaskDetailSheet({
  task,
  onClose,
  onToggle,
  onSnooze,
  onSave,
}: {
  task: Task | null;
  onClose: () => void;
  onToggle: (id: string) => void;
  onSnooze: (id: string) => void;
  onSave: (id: string, patch: Partial<Task>) => void;
}) {
  const { state } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({ title: '', priority: 'P1', due: '', notes: '' });

  useEffect(() => {
    if (task) {
      setEditing(false);
      setDraft({
        title: task.title,
        priority: task.priority,
        due: task.due ?? '',
        notes: task.notes ?? '',
      });
    }
  }, [task]);

  if (!task) return null;
  const done = isDone(task);

  const save = () => {
    onSave(task.id, {
      title: draft.title.trim() || task.title,
      priority: draft.priority,
      due: draft.due || undefined,
      notes: draft.notes,
    });
    setEditing(false);
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      height={editing ? '80%' : '72%'}
      title={
        <div className="flex items-start justify-between gap-3">
          <SheetTitle>{editing ? 'Edit task' : 'Task'}</SheetTitle>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit task"
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
          <Field label="Title">
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Priority">
            <Segmented<Priority>
              value={draft.priority}
              onChange={(priority) => setDraft((d) => ({ ...d, priority }))}
              options={(['P0', 'P1', 'P2', 'P3'] as Priority[]).map((p) => ({
                value: p,
                label: p,
                color: PRIORITY_SOLID[p],
              }))}
            />
          </Field>

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
            <OutlineButton onClick={() => setEditing(false)}>Cancel</OutlineButton>
            <PrimaryButton onClick={save}>Save</PrimaryButton>
          </div>
        </>
      ) : (
        <>
          <h3
            className="m-0 mb-[10px] font-display text-[19px] font-semibold leading-[1.25]"
            style={done ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}
          >
            {task.title}
          </h3>

          <div className="mb-4 flex flex-wrap items-center gap-x-[10px] gap-y-2">
            <PriorityChip priority={task.priority} />
            <AreaTag area={areaOf(state, task.areaId)} />
            <DueLabel due={dueLabel(task)} />
          </div>

          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-[6px] text-[12px]">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="m-0 font-semibold">{STATUS_LABELS[task.status]}</dd>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="m-0">{TYPE_LABELS[task.type]}</dd>
            {task.waitingOn ? (
              <>
                <dt className="text-muted-foreground">Waiting on</dt>
                <dd className="m-0">{task.waitingOn}</dd>
              </>
            ) : null}
          </dl>

          {task.notes ? (
            <p className="m-0 mb-5 whitespace-pre-wrap text-[12.5px] leading-[1.5]" style={{ color: 'hsl(75 8% 30%)' }}>
              {task.notes}
            </p>
          ) : (
            <p className="m-0 mb-5 text-[12.5px] italic opacity-50">No notes.</p>
          )}

          {(
            <div className="flex gap-[10px]">
              <PrimaryButton
                onClick={() => {
                  onToggle(task.id);
                  onClose();
                }}
              >
                {done ? 'Reopen' : 'Mark done'}
              </PrimaryButton>
              <OutlineButton
                onClick={() => {
                  onSnooze(task.id);
                  onClose();
                }}
              >
                Snooze
              </OutlineButton>
            </div>
          )}
        </>
      )}
    </BottomSheet>
  );
}
