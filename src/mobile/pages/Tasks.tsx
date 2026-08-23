import { isOverdue, isDueToday, isClosed } from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import type { TaskFilter } from '@/mobile/lib/types';
import type { Task } from '@/lib/model';
import { Chip, EmptyState } from '@/mobile/components/bits';
import { TaskRow } from '@/mobile/components/TaskRow';

/**
 * "Open" rather than "All", plus an explicit Done view.
 *
 * An earlier version filtered every closed task out of the only unfiltered
 * list, which meant completing something made it unreachable — you couldn't see
 * it, and you couldn't reopen it. Naming the default honestly and giving Done
 * its own chip fixes both.
 */
const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'p0', label: 'P0' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'done', label: 'Done' },
];

const MATCHERS: Record<TaskFilter, (t: Task) => boolean> = {
  open: (t) => !isClosed(t),
  today: isDueToday,
  overdue: isOverdue,
  p0: (t) => t.priority === 'P0' && !isClosed(t),
  // 'waiting' is a real status in the platform model, not a free-text field
  waiting: (t) => t.status === 'waiting',
  done: (t) => t.status === 'done',
};

export function Tasks({
  filter,
  onFilterChange,
  onOpenTask,
  onNewTask,
  onToggleTask,
}: {
  filter: TaskFilter;
  onFilterChange: (filter: TaskFilter) => void;
  onOpenTask: (id: string) => void;
  onNewTask: () => void;
  onToggleTask: (id: string) => void;
}) {
  const { state } = useStore();
  const visible = state.tasks.filter(MATCHERS[filter]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="no-scrollbar -mx-4 flex flex-1 gap-2 overflow-x-auto px-4">
          {FILTERS.map((f) => (
            <Chip key={f.id} active={f.id === filter} onClick={() => onFilterChange(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          onClick={onNewTask}
          className="shrink-0 rounded-[14px] border-none bg-primary px-3 py-[7px] text-[12px] font-semibold text-primary-foreground active:opacity-80"
        >
          + New
        </button>
      </div>

      {visible.length ? (
        visible.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={onToggleTask} onOpen={onOpenTask} />
        ))
      ) : (
        <EmptyState>Nothing here.</EmptyState>
      )}
    </div>
  );
}
