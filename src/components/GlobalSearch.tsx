import { useMemo, useRef, useState } from 'react'
import { Search, X, CheckSquare, Users, FolderKanban, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Task, STATUS_LABELS } from '@/lib/model'
import { useStore } from '@/lib/store'
import { TaskDetail, TaskDialog } from '@/components/tasks'

/**
 * A single search box that lives in the header on every page. It searches across the things you'd
 * actually hunt for — tasks, people, projects and labels — and shows grouped results in a dropdown.
 * A task opens its detail right here (no matter which page you're on); a person, project or label
 * jumps to the page that lists it. Deliberately self-contained so it can sit in the app shell
 * without every page having to wire search in.
 */
export function GlobalSearch({ onNavigate, onOpenTask, className }: {
  onNavigate: (page: string) => void
  // When provided (mobile), a task result is handed back to open in the native sheet instead of the
  // desktop detail dialog this component renders itself.
  onOpenTask?: (taskId: string) => void
  className?: string
}) {
  const { state } = useStore()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const ql = q.trim().toLowerCase()
  const results = useMemo(() => {
    if (!ql) return null
    const has = (s?: string) => (s ?? '').toLowerCase().includes(ql)
    const tasks = state.tasks
      .filter(t => t.status !== 'dropped' && (has(t.title) || has(t.notes) || has(t.callAbout)))
      .slice(0, 6)
    const people = state.people
      .filter(p => has(p.name) || (p.phone ?? '').includes(q) || has(p.email))
      .slice(0, 5)
    const realProjects = state.projects.filter(p => p.kind !== 'label' && has(p.name)).slice(0, 5)
    const labels = state.projects.filter(p => p.kind === 'label' && has(p.name)).slice(0, 4)
    const total = tasks.length + people.length + realProjects.length + labels.length
    return { tasks, people, realProjects, labels, total }
  }, [ql, q, state])

  const close = () => { setOpen(false) }
  const pickTask = (t: Task) => {
    if (onOpenTask) onOpenTask(t.id)
    else setOpenTask(t)
    setQ(''); setOpen(false)
  }
  const go = (page: string) => { onNavigate(page); setQ(''); setOpen(false) }

  const areaName = (id?: string) => state.areas.find(a => a.id === id)?.name

  return (
    <div
      ref={boxRef}
      className={className ?? 'relative flex-1 md:flex-none md:w-52 lg:w-64'}
      onBlur={e => { if (!boxRef.current?.contains(e.relatedTarget as Node)) close() }}
    >
      <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => { if (q) setOpen(true) }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setQ(''); setOpen(false); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Enter' && results?.tasks[0]) pickTask(results.tasks[0])
        }}
        placeholder="Search tasks, people, projects…"
        aria-label="Search"
        className="w-full h-9 border border-input bg-card pl-8 pr-8 text-[12.5px] rounded-sm outline-none focus:border-primary placeholder:text-muted-foreground/70"
      />
      {q && (
        <button onMouseDown={e => e.preventDefault()} onClick={() => { setQ(''); setOpen(false) }} className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center text-muted-foreground hover:text-foreground" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && results && (
        <div className="absolute left-0 right-0 md:right-auto md:min-w-[340px] top-[calc(100%+6px)] z-40 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover shadow-lg py-1.5 text-left">
          {results.total === 0 && (
            <p className="px-3 py-4 text-[12.5px] text-muted-foreground text-center">No matches for “{q.trim()}”.</p>
          )}

          {results.tasks.length > 0 && (
            <Group icon={<CheckSquare className="h-3 w-3" />} label="Tasks">
              {results.tasks.map(t => {
                const done = t.status === 'done'
                return (
                  <Row key={t.id} onClick={() => pickTask(t)}>
                    <span className={cn('flex-1 min-w-0 truncate', done && 'line-through text-muted-foreground')}>{t.title}</span>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">{areaName(t.areaId) ?? STATUS_LABELS[t.status]}</span>
                  </Row>
                )
              })}
            </Group>
          )}

          {results.people.length > 0 && (
            <Group icon={<Users className="h-3 w-3" />} label="People">
              {results.people.map(p => (
                <Row key={p.id} onClick={() => go('people')}>
                  <span className="flex-1 min-w-0 truncate">{p.name}</span>
                  {p.phone && <span className="shrink-0 text-[10.5px] text-muted-foreground tabular">{p.phone}</span>}
                </Row>
              ))}
            </Group>
          )}

          {results.realProjects.length > 0 && (
            <Group icon={<FolderKanban className="h-3 w-3" />} label="Projects">
              {results.realProjects.map(p => (
                <Row key={p.id} onClick={() => go('projects')}>
                  <span className="flex-1 min-w-0 truncate">{p.name}</span>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground">{areaName(p.areaId)}</span>
                </Row>
              ))}
            </Group>
          )}

          {results.labels.length > 0 && (
            <Group icon={<Tag className="h-3 w-3" />} label="Labels">
              {results.labels.map(p => (
                <Row key={p.id} onClick={() => go('tasks')}>
                  <span className="flex-1 min-w-0 truncate">{p.name}</span>
                </Row>
              ))}
            </Group>
          )}
        </div>
      )}

      {/* Task detail / edit open in place so search works from any page. */}
      <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onEdit={t => setEditTask(t)} />
      <TaskDialog open={!!editTask} onClose={() => setEditTask(null)} task={editTask} />
    </div>
  )
}

function Group({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <span className="shrink-0">{icon}</span>{label}
      </div>
      {children}
    </div>
  )
}

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      // onMouseDown fires before the input's blur, so the click isn't lost to the dropdown closing.
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-accent transition-colors"
    >
      {children}
    </button>
  )
}
