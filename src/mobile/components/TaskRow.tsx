import { Check } from 'lucide-react';
import { AreaTag, DueLabel, PriorityChip } from '@/mobile/components/bits';
import { areaOf, dueLabel, isDone } from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import type { Task } from '@/lib/model';

/**
 * The task row used by Today and Tasks.
 *
 * The checkbox is its own tap target (stopPropagation) — toggling must not also
 * open the detail sheet. In read-only mode it renders as a static indicator
 * rather than a button, so there's no control that looks tappable but isn't.
 */
export function TaskRow({
  task,
  onToggle,
  onOpen,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { state } = useStore();
  const done = isDone(task);
  const due = dueLabel(task);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(task.id);
        }
      }}
      className="flex cursor-pointer items-start gap-[10px] py-[10px] active:opacity-70"
      style={{ borderBottom: '1px solid hsl(var(--border))' }}
    >
      {/* its own tap target — toggling must not also open the detail sheet */}
      <button
        type="button"
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={done}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task.id);
        }}
        className="mt-[1px] flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full p-0"
        style={{
          border: `2px solid ${done ? 'hsl(var(--primary))' : 'hsl(42 22% 75%)'}`,
          background: done ? 'hsl(var(--primary))' : 'transparent',
        }}
      >
        {done ? (
          <Check size={11} strokeWidth={3.5} style={{ color: 'hsl(var(--primary-foreground))' }} />
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className="text-[13.5px] font-semibold"
          style={done ? { textDecoration: 'line-through', opacity: 0.5 } : undefined}
        >
          {task.title}
        </div>
        <div className="mt-[5px] flex flex-wrap items-center gap-x-2 gap-y-1">
          <PriorityChip priority={task.priority} />
          <AreaTag area={areaOf(state, task.areaId)} />
          <DueLabel due={due} />
        </div>
      </div>
    </div>
  );
}
