import { useState } from 'react'
import { Plus, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Task, TaskStatus, PRIORITY_LABELS, STATUS_LABELS, relDue } from '@/lib/model'
import { useStore } from '@/lib/store'
import { openBlockers } from '@/lib/milestones'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATUS BOARD — the "Board" tab of a project
 * ─────────────────────────────────────────────────────────────────────────────
 * A Kanban of one project's PARENT tasks, bucketed by status, with native
 * drag-and-drop between columns. It is purely presentational: it reads state for
 * lookups (people, phases, priority scheme) but never mutates. Every change goes
 * out through the callbacks — the parent decides whether a drop into Done means
 * `completeTask` or a plain `updateTask`.
 *
 * The four columns collapse the six real statuses into the ones you plan around:
 * inbox rides along in Next (an un-triaged task is still "the next thing to
 * pick up"), and Dropped is simply not shown — a board is for live work.
 */

// The columns, in order. Each is one status bucket a card can be dragged into.
const COLUMNS: TaskStatus[] = ['next', 'in-progress', 'waiting', 'done']

// Which column a task's status renders in. `inbox` is folded into `next`;
// `dropped` returns null so it never appears on the board.
function columnOf(status: TaskStatus): TaskStatus | null {
  if (status === 'inbox') return 'next'
  if (status === 'dropped') return null
  return status
}

const MIME = 'text/task-id'

export function StatusBoard({ projectId, onOpen, onMove, onAddTask }: {
  projectId: string
  onOpen: (task: Task) => void
  onMove: (taskId: string, status: TaskStatus) => void // parent persists (done => completeTask, else updateTask)
  onAddTask: (status?: TaskStatus) => void
}) {
  const { state } = useStore()

  // The board's tasks are the project's parent tasks — subtasks live under their
  // parent, not on the board.
  const tasks = state.tasks.filter(t => t.projectId === projectId && !t.parentId)

  // Bucket once, then sort each column: P0 first, then by due date ascending,
  // undated last.
  const byColumn: Record<TaskStatus, Task[]> = {
    inbox: [], next: [], 'in-progress': [], waiting: [], done: [], dropped: [],
  }
  for (const t of tasks) {
    const col = columnOf(t.status)
    if (col) byColumn[col].push(t)
  }
  for (const col of COLUMNS) byColumn[col].sort(sortCards)

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
      {COLUMNS.map(status => (
        <Column
          key={status}
          status={status}
          tasks={byColumn[status]}
          onOpen={onOpen}
          onMove={onMove}
          onAddTask={onAddTask}
        />
      ))}
    </div>
  )
}

// P0 always leads; after that the nearest due date wins, and anything undated
// sinks to the bottom of its column.
function sortCards(a: Task, b: Task): number {
  const ap = a.priority === 'P0' ? 0 : 1
  const bp = b.priority === 'P0' ? 0 : 1
  if (ap !== bp) return ap - bp
  const ad = a.due ?? '￿'
  const bd = b.due ?? '￿'
  if (ad !== bd) return ad < bd ? -1 : 1
  return 0
}

function Column({ status, tasks, onOpen, onMove, onAddTask }: {
  status: TaskStatus
  tasks: Task[]
  onOpen: (task: Task) => void
  onMove: (taskId: string, status: TaskStatus) => void
  onAddTask: (status?: TaskStatus) => void
}) {
  const [over, setOver] = useState(false)

  const drop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const id = e.dataTransfer.getData(MIME)
    if (id) onMove(id, status)
  }

  return (
    <section
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true) }}
      onDragLeave={e => {
        // Only clear when the pointer truly leaves the column, not when it
        // crosses onto a child card.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false)
      }}
      onDrop={drop}
      className={cn(
        'flex flex-col w-[240px] min-w-[240px] shrink-0 rounded-lg border border-border bg-card shadow-sm transition-colors',
        over && 'ring-2 ring-[hsl(17_63%_47%)]/60 bg-[hsl(17_63%_47%)]/[0.04]',
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <h3 className="font-display text-[12px] font-semibold uppercase tracking-[0.06em]">{STATUS_LABELS[status]}</h3>
        <span className="grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-muted text-[10.5px] font-semibold tabular text-muted-foreground">
          {tasks.length}
        </span>
        <button
          type="button"
          aria-label={`Add a task to ${STATUS_LABELS[status]}`}
          title={`Add a task to ${STATUS_LABELS[status]}`}
          onClick={() => onAddTask(status)}
          className="ml-auto p-1 -mr-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 min-h-[80px] max-h-[70vh] overflow-y-auto p-2 flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="grid place-items-center flex-1 py-6 text-[11.5px] italic text-muted-foreground/60 select-none">
            Nothing here
          </p>
        ) : (
          tasks.map(t => <Card key={t.id} task={t} onOpen={onOpen} />)
        )}
      </div>
    </section>
  )
}

function Card({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  const { state } = useStore()
  const scheme = state.settings.priorityScheme

  // The card shows the project-scoped assignee (a project member), not the personal contact.
  const project = task.projectId ? state.projects.find(p => p.id === task.projectId) : undefined
  const assignee = task.assigneeMemberId ? project?.members?.find(m => m.id === task.assigneeMemberId) : undefined
  const phase = task.milestoneId ? state.milestones.find(m => m.id === task.milestoneId) : undefined
  const blocked = openBlockers(state, task).length > 0
  const done = task.status === 'done'
  const due = relDue(task.due)

  return (
    <article
      draggable
      onDragStart={e => {
        e.dataTransfer.setData(MIME, task.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onOpen(task)}
      className="group cursor-pointer rounded-md border border-border bg-card px-2.5 py-2 shadow-sm hover:bg-accent/40 active:cursor-grabbing transition-colors"
    >
      <p className={cn('text-[12.5px] font-medium leading-snug', done && 'line-through opacity-55')}>
        {task.title}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <PriorityChip label={PRIORITY_LABELS[scheme][task.priority]} priority={task.priority} />

        {task.due && (
          <span
            className={cn(
              'text-[10.5px] tabular',
              due.tone === 'overdue' && 'font-semibold text-[hsl(8_60%_41%)]',
              due.tone === 'today' && 'font-semibold text-foreground',
              due.tone !== 'overdue' && due.tone !== 'today' && 'text-muted-foreground',
            )}
          >
            {due.label}
          </span>
        )}

        {phase && (
          <span className="text-[10.5px] text-muted-foreground truncate max-w-[9rem]">{phase.name}</span>
        )}

        {blocked && (
          <span className="inline-flex items-center gap-0.5 rounded-sm border border-[hsl(8_50%_75%)] bg-[hsl(8_60%_96%)] px-1 py-px text-[10px] font-semibold text-[hsl(8_55%_35%)]">
            <Lock className="h-2.5 w-2.5" />
            blocked
          </span>
        )}

        {assignee && (
          <span
            title={assignee.name}
            className="ml-auto grid place-items-center h-[18px] w-[18px] rounded-full bg-muted text-[9.5px] font-semibold uppercase text-muted-foreground shrink-0"
          >
            {initials(assignee.name)}
          </span>
        )}
      </div>
    </article>
  )
}

function PriorityChip({ label, priority }: { label: string; priority: Task['priority'] }) {
  // P0 danger, P1 amber, P2 green-ish, P3 muted.
  const style: Record<Task['priority'], string> = {
    P0: 'bg-[hsl(8_60%_41%)] text-white',
    P1: 'bg-[hsl(35_70%_88%)] text-[hsl(28_60%_28%)]',
    P2: 'bg-[hsl(160_25%_88%)] text-[hsl(160_25%_24%)]',
    P3: 'bg-muted text-muted-foreground',
  }
  return (
    <span className={cn('rounded-full px-1.5 py-px text-[9.5px] font-semibold leading-none tabular', style[priority])}>
      {label}
    </span>
  )
}

// First letters of the first two words — "Malka Stein" → "MS", "Craig" → "C".
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase()
}
