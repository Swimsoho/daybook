import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, CalendarRange, GanttChartSquare, Kanban, LayoutList, Pencil, Plus, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Project, Task, TaskStatus, PRIORITY_LABELS, STATUS_LABELS, fmtDate } from '@/lib/model'
import { useStore } from '@/lib/store'
import { projectStats, projectHealth, HEALTH_META } from '@/lib/projects'
import { ProjectBoard } from '@/components/ProjectBoard'
import { TaskRow } from '@/components/tasks'
import { StatusBoard } from '@/components/pm/StatusBoard'
import { ProjectTimeline } from '@/components/pm/ProjectTimeline'
import { ProjectOverview } from '@/components/pm/ProjectOverview'

type Tab = 'overview' | 'board' | 'phases' | 'timeline' | 'list'
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
  { id: 'board', label: 'Board', icon: <Kanban className="h-3.5 w-3.5" /> },
  { id: 'phases', label: 'Phases', icon: <LayoutList className="h-3.5 w-3.5" /> },
  { id: 'timeline', label: 'Timeline', icon: <GanttChartSquare className="h-3.5 w-3.5" /> },
  { id: 'list', label: 'List', icon: <CalendarRange className="h-3.5 w-3.5" /> },
]

/**
 * The single-project workspace. A rich header (status / owner / dates / health / progress) over a
 * set of views: Overview, a status Kanban, the phase board, a timeline, and a flat list. Every
 * mutation goes through the store; task open/add is delegated up so the page owns the dialogs.
 */
export function ProjectDetail({ projectId, onBack, onOpenTask, onAddTask, onArchivedWithTasks }: {
  projectId: string
  onBack: () => void
  onOpenTask: (t: Task) => void
  onAddTask: (opts: { milestoneId?: string; status?: TaskStatus }) => void
  onArchivedWithTasks: (info: { id: string; name: string; count: number }) => void
}) {
  const { state, updateProject, updateTask, completeTask } = useStore()
  const project = state.projects.find(p => p.id === projectId)
  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)

  const stats = useMemo(() => project ? projectStats(state, project.id) : null, [state, project])
  if (!project || !stats) return null
  const area = state.areas.find(a => a.id === project.areaId)
  const health = projectHealth(state, project, stats)
  const hm = HEALTH_META[health]
  const scheme = state.settings.priorityScheme

  const setStatus = (v: Project['status']) => {
    updateProject(project.id, { status: v })
    toast(`Project → ${v}`)
    if (v === 'archived') {
      const linked = state.tasks.filter(t => t.projectId === project.id).length
      if (linked > 0) onArchivedWithTasks({ id: project.id, name: project.name, count: linked })
    }
  }
  const moveStatus = (taskId: string, status: TaskStatus) => {
    if (status === 'done') completeTask(taskId)
    else updateTask(taskId, { status, completedAt: undefined })
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* ---- Header ---- */}
      <div>
        <button onClick={onBack} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />All projects
        </button>

        <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              {area && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: area.color }} />}
              <h1 className="font-display text-2xl font-semibold leading-tight">{project.name}</h1>
              <span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: hm.bg, color: hm.text, border: `1px solid ${hm.border}` }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: hm.dot }} />{hm.label}
              </span>
              <button onClick={() => setEditing(true)} title="Edit project details" className="ml-1 grid place-items-center h-6 w-6 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
            </div>
            {project.outcome && <p className="text-[13.5px] text-muted-foreground mt-1 italic">Goal: {project.outcome}</p>}
            {/* progress + counts */}
            <div className="mt-2.5 flex items-center gap-3 max-w-lg">
              <div className="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
                <div className="h-full rounded-sm transition-all" style={{ width: `${stats.pct}%`, background: 'hsl(152 25% 40%)' }} />
              </div>
              <span className="text-[12px] tabular text-muted-foreground shrink-0">{stats.done}/{stats.total} · {stats.pct}%</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground tabular">
              <span>{stats.open} open</span>
              {stats.inProgress > 0 && <span>{stats.inProgress} in progress</span>}
              {stats.overdue > 0 && <span className="text-[hsl(8_60%_41%)] font-semibold">{stats.overdue} overdue</span>}
              {stats.blocked > 0 && <span className="text-[hsl(30_60%_34%)] font-semibold">{stats.blocked} blocked</span>}
              {stats.phases > 0 && <span>{stats.phasesDone}/{stats.phases} phases</span>}
            </div>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            <Field label="Status">
              <Select value={project.status} onValueChange={v => setStatus(v as Project['status'])}>
                <SelectTrigger className="h-8 w-full bg-card text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>{(['active', 'on-hold', 'done', 'archived'] as const).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={project.priority} onValueChange={v => updateProject(project.id, { priority: v as Project['priority'] })}>
                <SelectTrigger className="h-8 w-full bg-card text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>{(['P0', 'P1', 'P2', 'P3'] as const).map(p => <SelectItem key={p} value={p}>{PRIORITY_LABELS[scheme][p]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Owner">
              <Select value={project.ownerPersonId ?? 'none'} onValueChange={v => updateProject(project.id, { ownerPersonId: v === 'none' ? undefined : v })}>
                <SelectTrigger className="h-8 w-full bg-card text-[12px]"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No owner</SelectItem>
                  {state.people.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Target date">
              <Input type="date" value={project.due ?? ''} onChange={e => updateProject(project.id, { due: e.target.value || undefined })} className="h-8 w-full bg-card text-[12px]" />
            </Field>
          </div>
        </div>
      </div>

      {/* ---- Tabs + add ---- */}
      <div className="flex items-center gap-2 border-b border-border -mb-1 flex-wrap">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] border-b-2 -mb-px transition-colors whitespace-nowrap',
                tab === t.id ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        <Button size="sm" className="h-8 ml-auto shrink-0 mb-1" onClick={() => onAddTask({})}><Plus className="h-3.5 w-3.5 mr-1" />Task</Button>
      </div>

      {/* ---- Body ---- */}
      {tab === 'overview' && (
        <ProjectOverview
          projectId={project.id}
          onOpenTask={onOpenTask}
          onSaveNotes={notes => updateProject(project.id, { notes })}
          onGotoBoard={() => setTab('phases')}
        />
      )}
      {tab === 'board' && (
        <StatusBoard projectId={project.id} onOpen={onOpenTask} onMove={moveStatus} onAddTask={status => onAddTask({ status })} />
      )}
      {tab === 'phases' && (
        <ProjectBoard project={project} onOpenTask={onOpenTask} onAddTask={milestoneId => onAddTask({ milestoneId })} />
      )}
      {tab === 'timeline' && (
        <div className="border border-border bg-card rounded-lg p-3 shadow-sm overflow-hidden">
          <ProjectTimeline projectId={project.id} onOpenTask={onOpenTask} />
        </div>
      )}
      {tab === 'list' && <ProjectTaskList projectId={project.id} onOpenTask={onOpenTask} />}

      <ProjectSettingsDialog project={project} open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

// A flat, sortable list of the project's tasks — reuses the full-feature TaskRow so every row keeps
// its actions (status, reassign, the To-Do pin, etc.). Done tasks sink to the bottom.
type ListSort = 'due' | 'priority' | 'status' | 'phase' | 'name'
function ProjectTaskList({ projectId, onOpenTask }: { projectId: string; onOpenTask: (t: Task) => void }) {
  const { state } = useStore()
  const [sort, setSort] = useState<ListSort>('due')
  const tasks = state.tasks.filter(t => t.projectId === projectId && !t.parentId)
  const prioOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
  const statusOrder: Record<string, number> = { 'in-progress': 0, next: 1, waiting: 2, inbox: 3, done: 4, dropped: 5 }
  const milestoneName = (id?: string) => state.milestones.find(m => m.id === id)?.name ?? '~'
  const closed = (t: Task) => t.status === 'done' || t.status === 'dropped'
  const sorted = [...tasks].sort((a, b) => {
    if (closed(a) !== closed(b)) return closed(a) ? 1 : -1
    switch (sort) {
      case 'due': return (a.due ?? '9999').localeCompare(b.due ?? '9999')
      case 'priority': return (prioOrder[a.priority] ?? 9) - (prioOrder[b.priority] ?? 9)
      case 'status': return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
      case 'phase': return milestoneName(a.milestoneId).localeCompare(milestoneName(b.milestoneId))
      case 'name': return a.title.localeCompare(b.title)
    }
  })
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] text-muted-foreground">{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
        <select value={sort} onChange={e => setSort(e.target.value as ListSort)} className="ml-auto h-8 rounded-md border border-border bg-card px-2 text-[12px] text-muted-foreground cursor-pointer outline-none">
          <option value="due">Sort: Due date</option>
          <option value="priority">Sort: Priority</option>
          <option value="status">Sort: Status</option>
          <option value="phase">Sort: Phase</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>
      <div className="border border-border bg-card rounded-lg shadow-sm divide-y divide-border/60 overflow-hidden">
        {sorted.length === 0 && <p className="px-4 py-6 text-[12.5px] text-muted-foreground italic text-center">No tasks yet — add one with the Task button.</p>}
        {sorted.map(t => <TaskRow key={t.id} task={t} showArea={false} onOpen={onOpenTask} />)}
      </div>
    </div>
  )
}

// Name / outcome / area / start date. The header handles status, priority, owner and target date
// inline; this covers the rest without cluttering the top bar.
function ProjectSettingsDialog({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const { state, updateProject } = useStore()
  const [name, setName] = useState(project.name)
  const [outcome, setOutcome] = useState(project.outcome)
  const [areaId, setAreaId] = useState(project.areaId)
  const [start, setStart] = useState(project.start ?? '')
  // reseed when opening a different project
  const key = project.id + (open ? '1' : '0')
  useMemo(() => { if (open) { setName(project.name); setOutcome(project.outcome); setAreaId(project.areaId); setStart(project.start ?? '') } }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    updateProject(project.id, { name: name.trim(), outcome: outcome.trim(), areaId, start: start || undefined })
    toast.success('Project updated')
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="font-display text-lg">Edit project</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid gap-1.5"><Label className="text-xs">Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label className="text-xs">Desired outcome — the finish line</Label><Input value={outcome} onChange={e => setOutcome(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Area</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{state.areas.filter(a => a.active).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label className="text-xs">Start date</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
