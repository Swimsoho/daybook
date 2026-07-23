import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpDown, Check, Download, FileUp, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  Priority, PRIORITY_LABELS, STATUS_LABELS, Task, TaskStatus, TYPE_LABELS, daysSince, fmtDate, today,
} from '@/lib/model'
import { useStore } from '@/lib/store'
import { ClearFiltersButton, DueChip, EmptyNote, PriorityChip } from '@/components/bits'
import { QuickAdd, TaskDetail, TaskDialog, TaskRow } from '@/components/tasks'
import { ColumnDropdown, SPREADSHEET_ACCEPT, downloadXlsxTemplateWithDropdowns, parseSpreadsheetFile } from '@/lib/xlsxTemplate'

type View = 'today' | 'week' | 'area' | 'waiting' | 'someday' | 'done' | 'all' | 'list'

const VIEWS: { id: View; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'area', label: 'By Area' },
  { id: 'waiting', label: 'Waiting On' },
  { id: 'someday', label: 'Someday' },
  { id: 'done', label: 'Accomplished' },
  { id: 'all', label: 'Everything' },
  { id: 'list', label: 'List' },
]

export default function TasksPage({ projectFilter, onClearProject }: { projectFilter?: string | null; onClearProject?: () => void }) {
  const { state, updateTask, completeTask, dropTask } = useStore()
  const [view, setView] = useState<View>('today')
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [prioFilter, setPrioFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [actFilter, setActFilter] = useState('all')
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [adding, setAdding] = useState(false)
  const [addDefaults, setAddDefaults] = useState<Partial<Task> | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [expandAll, setExpandAll] = useState(false)
  const [dragCat, setDragCat] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const scheme = state.settings.priorityScheme
  const filtersActive = !!search || areaFilter !== 'all' || prioFilter !== 'all' || catFilter !== 'all' || actFilter !== 'all' || !!projectFilter
  const clearAll = () => { setSearch(''); setAreaFilter('all'); setPrioFilter('all'); setCatFilter('all'); setActFilter('all'); onClearProject?.() }

  // Selection is view-scoped — switching tabs starts fresh so a bulk action never silently
  // lands on tasks you can no longer see.
  useEffect(() => { setSelected(new Set()) }, [view])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => {
    let ts = state.tasks.filter(t => !t.parentId) // parents view; children shown expanded
    const sub = state.tasks.filter(t => t.parentId)
    const matches = (t: Task) =>
      (areaFilter === 'all' || t.areaId === areaFilter) &&
      (prioFilter === 'all' || t.priority === prioFilter) &&
      (catFilter === 'all' || t.categoryIds.includes(catFilter)) &&
      (actFilter === 'all' || (t.actionIds ?? []).includes(actFilter)) &&
      (!projectFilter || (projectFilter === '__none__' ? !t.projectId : t.projectId === projectFilter)) &&
      (!search || t.title.toLowerCase().includes(search.toLowerCase()))

    // include parents whose subtasks match
    ts = ts.filter(t => matches(t) || sub.some(k => k.parentId === t.id && matches(k)))

    switch (view) {
      case 'today':
        // to-call tasks surface today by default (a call with no due date shouldn't go quiet),
        // but a call you've deliberately scheduled for later still respects that due date
        return ts.filter(t => t.status !== 'done' && t.status !== 'dropped' && (t.priority === 'P0' || (t.type === 'call' && !t.due) || (t.due && daysSince(t.due) >= 0)))
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
      case 'list':
        return ts.filter(t => t.status !== 'done' && t.status !== 'dropped')
    }
  }, [state.tasks, view, search, areaFilter, prioFilter, catFilter, actFilter, projectFilter])

  const sorted = [...filtered].sort((a, b) => a.priority.localeCompare(b.priority) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))

  function exportCsv() {
    // Selecting tasks first scopes the export to just those — otherwise it's the whole current view.
    const source = selected.size > 0 ? sorted.filter(t => selected.has(t.id)) : sorted
    const rows = [['Title', 'Type', 'Area', 'Project', 'Category', 'Action', 'Priority', 'Status', 'Due', 'Created']]
    for (const t of source) {
      rows.push([
        t.title, t.type,
        state.areas.find(a => a.id === t.areaId)?.name ?? '',
        state.projects.find(p => p.id === t.projectId)?.name ?? '',
        state.categories.find(c => t.categoryIds.includes(c.id))?.name ?? '',
        state.actions.find(a => (t.actionIds ?? []).includes(a.id))?.name ?? '',
        PRIORITY_LABELS[scheme][t.priority], STATUS_LABELS[t.status], t.due ?? '', t.created,
      ])
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `tasks-${view}-${today()}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success(selected.size > 0 ? `Exported ${source.length} selected task${source.length === 1 ? '' : 's'}` : 'Exported to CSV (Excel-ready)')
  }

  const groupedByArea = view === 'area'
    ? state.areas.filter(a => a.active).map(a => ({ area: a, tasks: sorted.filter(t => t.areaId === a.id) }))
    : null

  const doneStats = view === 'done' ? {
    today: sorted.filter(t => t.completedAt === today()).length,
    week: sorted.filter(t => t.completedAt && daysSince(t.completedAt) <= 7).length,
  } : null

  // The full set of task ids on screen right now, regardless of which layout renders them —
  // used by the "select all visible" checkbox so it works the same in every view.
  const allVisibleIds = groupedByArea ? groupedByArea.flatMap(g => g.tasks.map(t => t.id)) : sorted.map(t => t.id)
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id))

  function toggleSelectAllVisible() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) allVisibleIds.forEach(id => next.delete(id))
      else allVisibleIds.forEach(id => next.add(id))
      return next
    })
  }

  function bulkApply(patch: Partial<Task>, label: string) {
    const ids = Array.from(selected)
    ids.forEach(id => updateTask(id, patch, label))
    toast.success(`${label} — ${ids.length} task${ids.length === 1 ? '' : 's'}`)
    setSelected(new Set())
  }
  function bulkDone() {
    const ids = Array.from(selected)
    ids.forEach(id => completeTask(id))
    toast.success(`Marked done — ${ids.length} task${ids.length === 1 ? '' : 's'}`)
    setSelected(new Set())
  }
  function bulkDrop() {
    const ids = Array.from(selected)
    ids.forEach(id => dropTask(id, 'Bulk dropped from Tasks list'))
    toast(`Dropped — ${ids.length} task${ids.length === 1 ? '' : 's'}`)
    setSelected(new Set())
  }

  return (
    <div className="grid grid-cols-1 gap-4">
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
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={() => setExpandAll(v => !v)}>{expandAll ? 'Collapse all' : 'Expand all'}</Button>
          <Button variant="outline" size="sm" className="h-8" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1.5" />Export</Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setImportOpen(true)}><FileUp className="h-3.5 w-3.5 mr-1.5" />Import</Button>
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
        <Select value={actFilter} onValueChange={setActFilter}>
          <SelectTrigger className="h-8 w-36 bg-card text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {state.actions.filter(a => a.active).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
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

      {/* Bulk selection + actions */}
      {allVisibleIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))] cursor-pointer"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
            />
            {selected.size > 0 ? <span className="font-medium text-foreground">{selected.size} selected</span> : `Select all (${allVisibleIds.length})`}
          </label>
          {selected.size > 0 && (
            <>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => setSelected(new Set())}>Clear</Button>
              <span className="h-4 w-px bg-border" />
              <Button variant="outline" size="sm" className="h-7 px-2 text-[12px]" onClick={bulkDone}><Check className="h-3.5 w-3.5 mr-1" />Mark done</Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-[hsl(8_60%_41%)]" onClick={bulkDrop}>Drop</Button>
              <span className="h-4 w-px bg-border" />
              <span className="text-[11px] text-muted-foreground">Priority</span>
              {(['P0', 'P1', 'P2', 'P3'] as Priority[]).map(p => (
                <button
                  key={p}
                  onClick={() => bulkApply({ priority: p }, `bulk priority → ${PRIORITY_LABELS[scheme][p]}`)}
                  className="px-2 py-1 text-[11px] border border-border rounded-sm bg-card hover:bg-accent"
                >
                  {PRIORITY_LABELS[scheme][p]}
                </button>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-[12px]">Status ▾</Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  {(['next', 'in-progress', 'waiting'] as TaskStatus[]).map(st => (
                    <DropdownMenuItem key={st} onClick={() => bulkApply({ status: st, waitingSince: st === 'waiting' ? today() : undefined }, `bulk status → ${STATUS_LABELS[st]}`)}>
                      {STATUS_LABELS[st]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-[12px]">Move to area ▾</Button></DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  {state.areas.filter(a => a.active).map(a => (
                    <DropdownMenuItem key={a.id} onClick={() => bulkApply({ areaId: a.id, projectId: undefined }, `bulk moved to ${a.name}`)}>
                      <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: a.color }} />{a.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-[12px]">Move to project ▾</Button></DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuItem onClick={() => bulkApply({ projectId: undefined }, 'bulk removed from project')}>
                    <span className="text-muted-foreground">No project</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {state.projects.filter(p => p.status === 'active' || p.status === 'on-hold').map(p => (
                    <DropdownMenuItem key={p.id} onClick={() => bulkApply({ projectId: p.id, areaId: p.areaId }, `bulk moved to project ${p.name}`)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-[12px]">Category ▾</Button></DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuItem onClick={() => bulkApply({ categoryIds: [] }, 'bulk category cleared')}>
                    <span className="text-muted-foreground">No category</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {state.categories.filter(c => c.active).map(c => (
                    <DropdownMenuItem key={c.id} onClick={() => bulkApply({ categoryIds: [c.id] }, `bulk re-categorized as ${c.name}`)}>
                      {c.color && <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: c.color }} />}
                      {c.level > 0 ? '› ' : ''}{c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-[12px]">Action ▾</Button></DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuItem onClick={() => bulkApply({ actionIds: [] }, 'bulk action cleared')}>
                    <span className="text-muted-foreground">No action</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {state.actions.filter(a => a.active).map(a => (
                    <DropdownMenuItem key={a.id} onClick={() => bulkApply({ actionIds: [a.id] }, `bulk action → ${a.name}`)}>
                      {a.color && <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: a.color }} />}
                      {a.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      )}

      {/* Accomplished header */}
      {doneStats && (
        <div className="flex gap-6 border border-border bg-card px-4 py-2.5 text-[13px]">
          <span><b className="font-display text-lg tabular">{doneStats.today}</b> <span className="text-muted-foreground">finished today</span></span>
          <span><b className="font-display text-lg tabular">{doneStats.week}</b> <span className="text-muted-foreground">this week</span></span>
          <span className="text-muted-foreground italic self-center ml-auto">Done is archived, never deleted — the day moved.</span>
        </div>
      )}

      {/* List */}
      {view === 'list' ? (
        <TaskListTable tasks={sorted} selected={selected} onToggleSelect={toggleSelect} onOpen={setOpenTask} />
      ) : groupedByArea ? (
        <div className="grid grid-cols-1 gap-4">
          {groupedByArea.map(({ area, tasks }) => (
            <section
              key={area.id}
              className="border border-border bg-card shadow-sm rounded-lg transition-shadow [&.dragover]:ring-2 [&.dragover]:ring-[hsl(17_63%_47%)]"
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
                <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => { setAddDefaults({ areaId: area.id }); setAdding(true) }}>
                  <Plus className="h-3 w-3 mr-1" />Task
                </Button>
              </div>
              <QuickAdd areaId={area.id} />
              {tasks.length === 0 && <EmptyNote>Nothing open here — type above or drag a task in.</EmptyNote>}
              {tasks.map(t => (
                <TaskRow key={t.id} task={t} showArea={false} onOpen={setOpenTask} expandAll={expandAll} selected={selected.has(t.id)} onToggleSelect={toggleSelect} />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <section className="border border-border bg-card shadow-sm rounded-lg">
          {sorted.length === 0 && <EmptyNote>Nothing in this view{view === 'someday' ? ' — the backlog rests until the weekly review' : ''}.</EmptyNote>}
          {sorted.map(t => (
            <div key={t.id}>
              <TaskRow task={t} onOpen={setOpenTask} expandAll={expandAll} selected={selected.has(t.id)} onToggleSelect={toggleSelect} />
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
      <TaskDialog open={!!editTask || adding} onClose={() => { setEditTask(null); setAdding(false); setAddDefaults(null) }} task={editTask} defaults={addDefaults ?? undefined} />
      <ImportTasksDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

// ================== "List" view — every task as a sortable, checkable table ==================

type SortKey = 'title' | 'type' | 'area' | 'project' | 'category' | 'action' | 'priority' | 'status' | 'due'

const SORT_LABELS: Record<SortKey, string> = {
  title: 'Title', type: 'Type', area: 'Area', project: 'Project', category: 'Category', action: 'Action', priority: 'Priority', status: 'Status', due: 'Due',
}

export function TaskListTable({ tasks, selected, onToggleSelect, onOpen }: {
  tasks: Task[]
  selected?: Set<string>
  onToggleSelect?: (id: string) => void
  onOpen: (t: Task) => void
}) {
  const { state, updateTask } = useStore()
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function valueFor(t: Task, key: SortKey): string {
    switch (key) {
      case 'title': return t.title.toLowerCase()
      case 'type': return t.type
      case 'area': return (state.areas.find(a => a.id === t.areaId)?.name ?? '').toLowerCase()
      case 'project': return (state.projects.find(p => p.id === t.projectId)?.name ?? '').toLowerCase()
      case 'category': return (state.categories.find(c => t.categoryIds.includes(c.id))?.name ?? '').toLowerCase()
      case 'action': return (state.actions.find(a => (t.actionIds ?? []).includes(a.id))?.name ?? '').toLowerCase()
      case 'priority': return t.priority
      case 'status': return t.status
      case 'due': return t.due ?? '9999-99-99'
    }
  }

  const rows = useMemo(() => {
    const arr = [...tasks].sort((a, b) => valueFor(a, sortKey).localeCompare(valueFor(b, sortKey)))
    return sortDir === 'asc' ? arr : arr.reverse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, sortKey, sortDir, state.areas, state.projects, state.categories, state.actions])

  function headerClick(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  if (rows.length === 0) return <EmptyNote>Nothing matches the current filters.</EmptyNote>

  return (
    <section className="border border-border bg-card shadow-sm rounded-lg overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse min-w-[820px]">
        <thead className="border-b border-border bg-accent/30">
          <tr>
            {onToggleSelect && <th className="px-2.5 py-2 w-8" />}
            {(['title', 'type', 'area', 'project', 'category', 'action', 'priority', 'status', 'due'] as SortKey[]).map(k => (
              <th
                key={k}
                onClick={() => headerClick(k)}
                className="px-2.5 py-2 text-left text-[10.5px] uppercase tracking-wide text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground whitespace-nowrap"
              >
                <span className="inline-flex items-center gap-1">
                  {SORT_LABELS[k]}
                  {sortKey === k && <ArrowUpDown className="h-2.5 w-2.5" />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(t => {
            const area = state.areas.find(a => a.id === t.areaId)
            const project = state.projects.find(p => p.id === t.projectId)
            const category = state.categories.find(c => t.categoryIds.includes(c.id))
            const action = state.actions.find(a => (t.actionIds ?? []).includes(a.id))
            return (
              <tr key={t.id} className={cn('border-b border-border/60 last:border-0 hover:bg-accent/40 transition-colors', selected?.has(t.id) && 'bg-[hsl(17_63%_47%_/_0.06)]')}>
                {onToggleSelect && (
                  <td className="px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[hsl(var(--primary))] cursor-pointer"
                      checked={!!selected?.has(t.id)}
                      onChange={() => onToggleSelect(t.id)}
                    />
                  </td>
                )}
                <td className="px-2.5 py-1.5 max-w-[260px]">
                  <button onClick={() => onOpen(t)} className="truncate text-left hover:underline block w-full">{t.title}</button>
                </td>
                <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">{TYPE_LABELS[t.type]}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  {area ? (
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: area.color }} />{area.name}</span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[160px]">{project?.name ?? '—'}</td>
                <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[130px]">{category?.name ?? '—'}</td>
                <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[110px]">{action?.name ?? '—'}</td>
                <td className="px-2.5 py-1.5"><PriorityChip p={t.priority} /></td>
                <td className="px-2.5 py-1.5">
                  <select
                    value={t.status}
                    onChange={e => {
                      const v = e.target.value as TaskStatus
                      updateTask(t.id, { status: v, waitingSince: v === 'waiting' ? today() : t.waitingSince }, `status → ${STATUS_LABELS[v]}`)
                    }}
                    className="h-6 text-[11px] border border-border rounded-sm bg-background px-1 text-muted-foreground hover:border-input hover:text-foreground cursor-pointer outline-none"
                  >
                    {(['inbox', 'next', 'in-progress', 'waiting'] as TaskStatus[]).filter(s => s !== 'inbox' || t.status === 'inbox').map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap"><DueChip due={t.due} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

// ================== Bulk import: template + preview + commit ==================

const TEMPLATE_COLUMNS = [
  'Title', 'Type', 'Area', 'Project', 'Priority', 'Status', 'Due date', 'Follow-up date',
  'Category', 'Action', 'Person', 'Vendor', 'Call about', 'Waiting on', 'Notes',
] as const

// Column indexes into TEMPLATE_COLUMNS that get a real in-cell dropdown, built from whatever's
// actually set up right now — areas, categories, people, vendors, projects — plus the fixed
// Type/Priority/Status enums. Anyone editing the sheet sees exactly the valid choices instead of
// having to remember them from an instructions row.
function taskTemplateDropdowns(state: ReturnType<typeof useStore>['state']): ColumnDropdown[] {
  const scheme = state.settings.priorityScheme
  return [
    { col: 1, values: ['todo', 'call', 'followup'] }, // Type
    { col: 2, values: state.areas.filter(a => a.active).map(a => a.name) }, // Area
    { col: 3, values: state.projects.filter(p => p.status === 'active' || p.status === 'on-hold').map(p => p.name) }, // Project
    { col: 4, values: (['P0', 'P1', 'P2', 'P3'] as Priority[]).map(p => PRIORITY_LABELS[scheme][p]) }, // Priority
    { col: 5, values: ['inbox', 'next', 'in-progress', 'waiting'] }, // Status (the literal values the importer accepts)
    { col: 8, values: state.categories.filter(c => c.active).map(c => c.name) }, // Category
    { col: 9, values: state.actions.filter(a => a.active).map(a => a.name) }, // Action
    { col: 10, values: state.people.map(p => p.name) }, // Person
    { col: 11, values: state.vendors.map(v => v.name) }, // Vendor
  ].filter(d => d.values.length > 0)
}

async function downloadTemplate(state: ReturnType<typeof useStore>['state']) {
  const areaNames = state.areas.filter(a => a.active).map(a => a.name).join(' | ')
  const rows = [
    [...TEMPLATE_COLUMNS],
    ['Book the hall', 'todo', state.areas[0]?.name ?? 'Family / Home', '', 'P1', 'next', '2026-08-01', '', 'Events', '', '', '', '', '', 'Any notes you like'],
    ['Call the plumber re boiler quote', 'call', state.areas[0]?.name ?? 'Family / Home', '', 'P2', 'next', '', '', '', 'Call', 'Mick Doyle', 'Mick Doyle Plumbing', 'Quote for new boiler', '', ''],
    ['Chase the caterer', 'followup', '', '', 'P1', 'waiting', '', '2026-08-05', '', 'Follow-up', '', '', '', 'Caterer', 'They owe us final menu'],
    ['— DELETE THIS ROW — allowed values → Type: todo | call | followup · Priority: P0 P1 P2 P3 (or High/Medium/Low/1-4) · Status: next | in-progress | waiting · Dates: YYYY-MM-DD · Areas: ' + areaNames, '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ]
  await downloadXlsxTemplateWithDropdowns('daybook-tasks-template.xlsx', 'Tasks', rows, taskTemplateDropdowns(state))
  toast.success('Template downloaded — Area/Project/Priority/Status/Category/Action/Person/Vendor are real dropdowns, built from what you have set up')
}

interface ParsedRow {
  task: Partial<Task> & { title: string }
  warnings: string[]
}

function ImportTasksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, addTask } = useStore()
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null)
  const [fileName, setFileName] = useState('')

  const byName = <T extends { name: string }>(list: T[], name: string): T | undefined =>
    name ? list.find(x => x.name.trim().toLowerCase() === name.trim().toLowerCase()) : undefined

  function handleFile(f: File) {
    setFileName(f.name)
    parseSpreadsheetFile(f).then(rows => {
      if (rows.length < 2) { toast.error('No data rows found — is this the filled template?'); return }
      const header = rows[0].map(h => h.trim().toLowerCase())
      const col = (name: string) => header.indexOf(name.toLowerCase())
      const iTitle = col('title')
      if (iTitle === -1) { toast.error('Missing "Title" column — start from the downloaded template'); return }
      const get = (r: string[], name: string) => { const i = col(name); return i === -1 ? '' : (r[i] ?? '').trim() }

      const out: ParsedRow[] = []
      for (const r of rows.slice(1)) {
        const title = (r[iTitle] ?? '').trim()
        if (!title || title.startsWith('— DELETE THIS ROW')) continue
        const warnings: string[] = []
        const typeRaw = get(r, 'type').toLowerCase()
        const type = (['todo', 'call', 'followup', 'follow-up'].includes(typeRaw) ? typeRaw.replace('follow-up', 'followup') : 'todo') as Task['type']
        if (typeRaw && type !== typeRaw && typeRaw !== 'follow-up') warnings.push(`type “${typeRaw}” → to-do`)
        const prRaw = get(r, 'priority').toLowerCase()
        const prMap: Record<string, Priority> = { 'p0': 'P0', 'p1': 'P1', 'p2': 'P2', 'p3': 'P3', 'urgent': 'P0', 'high': 'P1', 'medium': 'P2', 'low': 'P3', '1': 'P0', '2': 'P1', '3': 'P2', '4': 'P3' }
        const priority = prMap[prRaw] ?? 'P2'
        if (prRaw && !prMap[prRaw]) warnings.push(`priority “${prRaw}” → P2`)
        const stRaw = get(r, 'status').toLowerCase()
        const stMap: Record<string, Task['status']> = { 'next': 'next', 'in-progress': 'in-progress', 'in progress': 'in-progress', 'waiting': 'waiting', 'waiting on': 'waiting', 'inbox': 'inbox' }
        const status = stMap[stRaw] ?? 'next'
        if (stRaw && !stMap[stRaw]) warnings.push(`status “${stRaw}” → next`)
        const area = byName(state.areas.filter(a => a.active), get(r, 'area'))
        if (get(r, 'area') && !area) warnings.push(`area “${get(r, 'area')}” not found — left loose`)
        const project = byName(state.projects, get(r, 'project'))
        if (get(r, 'project') && !project) warnings.push(`project “${get(r, 'project')}” not found`)
        const category = byName(state.categories.filter(c => c.active), get(r, 'category'))
        if (get(r, 'category') && !category) warnings.push(`category “${get(r, 'category')}” not found`)
        const action = byName(state.actions.filter(a => a.active), get(r, 'action'))
        if (get(r, 'action') && !action) warnings.push(`action “${get(r, 'action')}” not found`)
        const person = byName(state.people, get(r, 'person'))
        if (get(r, 'person') && !person) warnings.push(`person “${get(r, 'person')}” not found`)
        const vendor = byName(state.vendors, get(r, 'vendor'))
        if (get(r, 'vendor') && !vendor) warnings.push(`vendor “${get(r, 'vendor')}” not found`)
        const dateOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
        const due = get(r, 'due date')
        if (due && !dateOk(due)) warnings.push(`due “${due}” not YYYY-MM-DD — skipped`)
        const fu = get(r, 'follow-up date')
        if (fu && !dateOk(fu)) warnings.push(`follow-up “${fu}” not YYYY-MM-DD — skipped`)

        out.push({
          warnings,
          task: {
            title, type, priority, status,
            areaId: project ? project.areaId : area?.id,
            projectId: project?.id,
            categoryIds: category ? [category.id] : [],
            actionIds: action ? [action.id] : undefined,
            personId: person?.id, vendorId: vendor?.id,
            due: dateOk(due) ? due : undefined,
            followUp: dateOk(fu) ? fu : undefined,
            callAbout: get(r, 'call about') || undefined,
            waitingOn: get(r, 'waiting on') || undefined,
            notes: get(r, 'notes') || undefined,
            source: 'manual',
          },
        })
      }
      if (!out.length) { toast.error('No importable rows found'); return }
      setParsed(out)
    }).catch(() => toast.error('Couldn’t read that file — make sure it’s the .xlsx or .csv you exported/filled in'))
  }

  function commit() {
    if (!parsed) return
    for (const p of parsed) addTask(p.task)
    toast.success(`Imported ${parsed.length} tasks — each one is in the audit trail`)
    setParsed(null); setFileName(''); onClose()
  }

  const warnCount = parsed?.filter(p => p.warnings.length).length ?? 0

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setParsed(null); setFileName(''); onClose() } }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Bulk import tasks</DialogTitle>
        </DialogHeader>
        {!parsed ? (
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">1</span>
              <div>
                Download the template — Area, Project, Priority, Status, Category, Action, Person and Vendor are real dropdowns built from what you've already set up, so you're picking from a list rather than retyping names.
                <div><Button size="sm" variant="outline" className="h-7 mt-1.5" onClick={() => downloadTemplate(state)}><Download className="h-3 w-3 mr-1.5" />Download template (.xlsx)</Button></div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">2</span>
              <span>Fill it in Excel or Google Sheets — one task per row, only <b>Title</b> is required. Save it as .xlsx or .csv, either works.</span>
            </div>
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">3</span>
              <div className="flex-1">
                Upload it — you'll get a preview before anything is created. Anything that doesn't match an existing area/project/category/person/vendor is flagged in the preview and imported anyway with that bit left blank — nothing ever fails the whole row.
                <label className="mt-1.5 border border-dashed border-input rounded-sm p-5 text-center text-[13px] text-muted-foreground cursor-pointer hover:bg-accent/50 block">
                  {fileName || 'Click to choose your filled .xlsx or .csv'}
                  <input type="file" accept={SPREADSHEET_ACCEPT} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            <p className="text-[13px]">
              <b>{parsed.length}</b> tasks ready from <span className="text-muted-foreground">{fileName}</span>
              {warnCount > 0 && <span className="text-[hsl(28_60%_32%)]"> · {warnCount} with notes (imported anyway, minus the flagged bits)</span>}
            </p>
            <div className="border border-border max-h-[320px] overflow-y-auto">
              {parsed.map((p, i) => (
                <div key={i} className="px-3 py-1.5 border-b border-border/60 last:border-0 text-[12.5px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{p.task.title}</span>
                    <span className="text-muted-foreground text-[11px] shrink-0">
                      {state.areas.find(a => a.id === p.task.areaId)?.name ?? 'no area'} · {p.task.priority} · {p.task.type}{p.task.due ? ` · due ${p.task.due}` : ''}
                    </span>
                  </div>
                  {p.warnings.length > 0 && <div className="text-[11px] text-[hsl(28_60%_32%)]">{p.warnings.join(' · ')}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setParsed(null); setFileName(''); onClose() }}>Cancel</Button>
          {parsed && <Button variant="outline" onClick={() => { setParsed(null); setFileName('') }}>Choose a different file</Button>}
          {parsed && <Button onClick={commit}>Import {parsed.length} tasks</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

