import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Priority, PRIORITY_LABELS, STATUS_LABELS, Task, daysSince, fmtDate, today,
} from '@/lib/model'
import { useStore } from '@/lib/store'
import { ClearFiltersButton, EmptyNote } from '@/components/bits'
import { TaskDetail, TaskDialog, TaskRow } from '@/components/tasks'

type View = 'today' | 'week' | 'area' | 'waiting' | 'someday' | 'done' | 'all'

const VIEWS: { id: View; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'area', label: 'By Area' },
  { id: 'waiting', label: 'Waiting On' },
  { id: 'someday', label: 'Someday' },
  { id: 'done', label: 'Accomplished' },
  { id: 'all', label: 'Everything' },
]

export default function TasksPage({ projectFilter, onClearProject }: { projectFilter?: string | null; onClearProject?: () => void }) {
  const { state, updateTask } = useStore()
  const [view, setView] = useState<View>('today')
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [prioFilter, setPrioFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [adding, setAdding] = useState(false)
  const [expandAll, setExpandAll] = useState(false)
  const [dragCat, setDragCat] = useState<string | null>(null)
  const scheme = state.settings.priorityScheme
  const filtersActive = !!search || areaFilter !== 'all' || prioFilter !== 'all' || catFilter !== 'all' || !!projectFilter
  const clearAll = () => { setSearch(''); setAreaFilter('all'); setPrioFilter('all'); setCatFilter('all'); onClearProject?.() }

  const filtered = useMemo(() => {
    let ts = state.tasks.filter(t => !t.parentId) // parents view; children shown expanded
    const sub = state.tasks.filter(t => t.parentId)
    const matches = (t: Task) =>
      (areaFilter === 'all' || t.areaId === areaFilter) &&
      (prioFilter === 'all' || t.priority === prioFilter) &&
      (catFilter === 'all' || t.categoryIds.includes(catFilter)) &&
      (!projectFilter || (projectFilter === '__none__' ? !t.projectId : t.projectId === projectFilter)) &&
      (!search || t.title.toLowerCase().includes(search.toLowerCase()))

    // include parents whose subtasks match
    ts = ts.filter(t => matches(t) || sub.some(k => k.parentId === t.id && matches(k)))

    switch (view) {
      case 'today':
        return ts.filter(t => t.status !== 'done' && t.status !== 'dropped' && (t.priority === 'P0' || (t.due && daysSince(t.due) >= 0)))
      case 'week':
        return ts.filter(t => t.status !== 'done' && t.status !== 'dropped' && (['P0', 'P1'].includes(t.priority) || (t.due && daysSince(t.due) >= -7)))
      case 'waiting':
        return ts.filter(t => t.status === 'waiting')
      case 'someday':
        return ts.filter(t => t.priority === 'P3' && t.status !== 'done' && t.status !== 'dropped')
      case 'done':
        return state.tasks.filter(t => (t.status === 'done' || t.status === 'dropped') && matches(t)).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      case 'area':
      case 'all':
        return ts.filter(t => t.status !== 'done' && t.status !== 'dropped')
    }
  }, [state.tasks, view, search, areaFilter, prioFilter, catFilter, projectFilter])

  const sorted = [...filtered].sort((a, b) => a.priority.localeCompare(b.priority) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))

  function exportCsv() {
    const rows = [['Title', 'Type', 'Area', 'Project', 'Priority', 'Status', 'Due', 'Created']]
    for (const t of sorted) {
      rows.push([
        t.title, t.type,
        state.areas.find(a => a.id === t.areaId)?.name ?? '',
        state.projects.find(p => p.id === t.projectId)?.name ?? '',
        PRIORITY_LABELS[scheme][t.priority], STATUS_LABELS[t.status], t.due ?? '', t.created,
      ])
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `tasks-${view}-${today()}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported to CSV (Excel-ready)')
  }

  const groupedByArea = view === 'area'
    ? state.areas.filter(a => a.active).map(a => ({ area: a, tasks: sorted.filter(t => t.areaId === a.id) }))
    : null

  const doneStats = view === 'done' ? {
    today: sorted.filter(t => t.completedAt === today()).length,
    week: sorted.filter(t => t.completedAt && daysSince(t.completedAt) <= 7).length,
  } : null

  return (
    <div className="grid gap-4">
      {/* View tabs */}
      <div className="flex flex-wrap items-center gap-1">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={cn(
              'px-3 py-1.5 text-[12.5px] border rounded-sm transition-colors',
              view === v.id ? 'bg-primary text-primary-foreground border-primary' : 'border-transparent hover:border-border hover:bg-accent',
            )}
          >
            {v.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={() => setExpandAll(v => !v)}>{expandAll ? 'Collapse all' : 'Expand all'}</Button>
          <Button variant="outline" size="sm" className="h-8" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>
          <Button size="sm" className="h-8" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Add task</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-52 bg-card" />
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="h-8 w-40 bg-card text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {state.areas.filter(a => a.active).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={prioFilter} onValueChange={setPrioFilter}>
          <SelectTrigger className="h-8 w-36 bg-card text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {(['P0', 'P1', 'P2', 'P3'] as Priority[]).map(p => <SelectItem key={p} value={p}>{PRIORITY_LABELS[scheme][p]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="h-8 w-40 bg-card text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {state.categories.filter(c => c.active).map(c => <SelectItem key={c.id} value={c.id}>{c.level > 0 ? '› ' : ''}{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <ClearFiltersButton active={filtersActive} onClear={clearAll} />
      </div>

      {/* Category chips — click to filter, drag a task onto one to re-categorize */}
      <div className="flex items-center gap-1.5 overflow-x-auto -mt-1">
        <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground shrink-0 mr-1">Categories</span>
        {state.categories.filter(c => c.active && c.level === 0).map(c => (
          <button
            key={c.id}
            onClick={() => setCatFilter(catFilter === c.id ? 'all' : c.id)}
            onDragOver={e => { e.preventDefault(); setDragCat(c.id) }}
            onDragLeave={() => setDragCat(null)}
            onDrop={e => {
              e.preventDefault(); setDragCat(null)
              const id = e.dataTransfer.getData('text/task-id')
              if (!id) return
              updateTask(id, { categoryIds: [c.id] }, `dragged onto category ${c.name}`)
              toast.success(`Re-categorized as ${c.name}`)
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] border rounded-full whitespace-nowrap shrink-0 transition-all',
              catFilter === c.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-accent',
              dragCat === c.id && 'ring-2 ring-[hsl(17_63%_47%)] scale-105 border-[hsl(17_63%_47%)]',
            )}
          >
            {c.color && <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />}
            {c.name}
          </button>
        ))}
        <span className="text-[10.5px] text-muted-foreground italic shrink-0 ml-1">drag a task onto a chip to re-categorize</span>
      </div>

      {/* Accomplished header */}
      {doneStats && (
        <div className="flex gap-6 border border-border bg-card px-4 py-2.5 text-[13px]">
          <span><b className="font-display text-lg tabular">{doneStats.today}</b> <span className="text-muted-foreground">finished today</span></span>
          <span><b className="font-display text-lg tabular">{doneStats.week}</b> <span className="text-muted-foreground">this week</span></span>
          <span className="text-muted-foreground italic self-center ml-auto">Done is archived, never deleted — the day moved.</span>
        </div>
      )}

      {/* List */}
      {groupedByArea ? (
        <div className="grid gap-4">
          {groupedByArea.map(({ area, tasks }) => (
            <section
              key={area.id}
              className="border border-border bg-card shadow-sm transition-shadow [&.dragover]:ring-2 [&.dragover]:ring-[hsl(17_63%_47%)]"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover') }}
              onDragLeave={e => e.currentTarget.classList.remove('dragover')}
              onDrop={e => {
                e.preventDefault(); e.currentTarget.classList.remove('dragover')
                const id = e.dataTransfer.getData('text/task-id')
                if (!id) return
                const t = state.tasks.find(x => x.id === id)
                if (t?.areaId === area.id) return
                updateTask(id, { areaId: area.id, projectId: undefined }, `dragged into ${area.name}`)
                toast.success(`Moved to ${area.name}`)
              }}
            >
              <div className="px-4 py-2.5 flex items-center gap-2.5 border-b border-border">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: area.color }} />
                <span className="font-display text-[14.5px] font-semibold">{area.name}</span>
                <span className="text-[10.5px] text-muted-foreground italic">drop a task here to move it</span>
                <span className="text-[11px] text-muted-foreground tabular ml-auto">{tasks.length} open</span>
              </div>
              {tasks.length === 0 && <EmptyNote>Nothing open here — drag a task in.</EmptyNote>}
              {tasks.map(t => <TaskRow key={t.id} task={t} showArea={false} onOpen={setOpenTask} expandAll={expandAll} />)}
            </section>
          ))}
        </div>
      ) : (
        <section className="border border-border bg-card shadow-sm">
          {sorted.length === 0 && <EmptyNote>Nothing in this view{view === 'someday' ? ' — the backlog rests until the weekly review' : ''}.</EmptyNote>}
          {sorted.map(t => (
            <div key={t.id}>
              <TaskRow task={t} onOpen={setOpenTask} expandAll={expandAll} />
              {view === 'done' && t.completedAt && (
                <div className="px-11 -mt-1 pb-1 text-[11px] text-muted-foreground tabular">
                  {t.status === 'dropped' ? `dropped ${fmtDate(t.completedAt)}${t.droppedReason ? ` — ${t.droppedReason}` : ''}` : `completed ${fmtDate(t.completedAt)}`}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {view === 'waiting' && sorted.length > 0 && (
        <p className="text-[12px] text-muted-foreground italic">Waiting-on items auto-nudge you to chase after 5 quiet days.</p>
      )}

      <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onEdit={t => setEditTask(t)} />
      <TaskDialog open={!!editTask || adding} onClose={() => { setEditTask(null); setAdding(false) }} task={editTask} />
    </div>
  )
}
