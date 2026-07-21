import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, FileUp, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Priority, PRIORITY_LABELS, STATUS_LABELS, Task, daysSince, fmtDate, today,
} from '@/lib/model'
import { useStore } from '@/lib/store'
import { ClearFiltersButton, EmptyNote } from '@/components/bits'
import { QuickAdd, TaskDetail, TaskDialog, TaskRow } from '@/components/tasks'

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
  const [addDefaults, setAddDefaults] = useState<Partial<Task> | null>(null)
  const [importOpen, setImportOpen] = useState(false)
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
                <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => { setAddDefaults({ areaId: area.id }); setAdding(true) }}>
                  <Plus className="h-3 w-3 mr-1" />Task
                </Button>
              </div>
              <QuickAdd areaId={area.id} />
              {tasks.length === 0 && <EmptyNote>Nothing open here — type above or drag a task in.</EmptyNote>}
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
      <TaskDialog open={!!editTask || adding} onClose={() => { setEditTask(null); setAdding(false); setAddDefaults(null) }} task={editTask} defaults={addDefaults ?? undefined} />
      <ImportTasksDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

// ================== Bulk import: template + preview + commit ==================

const TEMPLATE_COLUMNS = [
  'Title', 'Type', 'Area', 'Project', 'Priority', 'Status', 'Due date', 'Follow-up date',
  'Category', 'Person', 'Vendor', 'Call about', 'Waiting on', 'Notes',
] as const

function downloadTemplate(state: ReturnType<typeof useStore>['state']) {
  const areaNames = state.areas.filter(a => a.active).map(a => a.name).join(' | ')
  const rows = [
    [...TEMPLATE_COLUMNS],
    ['Book the hall', 'todo', state.areas[0]?.name ?? 'Family / Home', '', 'P1', 'next', '2026-08-01', '', 'Events', '', '', '', '', 'Any notes you like'],
    ['Call the plumber re boiler quote', 'call', state.areas[0]?.name ?? 'Family / Home', '', 'P2', 'next', '', '', '', 'Mick Doyle', 'Mick Doyle Plumbing', 'Quote for new boiler', '', ''],
    ['Chase the caterer', 'followup', '', '', 'P1', 'waiting', '', '2026-08-05', 'Follow-up', '', '', '', 'Caterer', 'They owe us final menu'],
    ['— DELETE THIS ROW — allowed values → Type: todo | call | followup · Priority: P0 P1 P2 P3 (or High/Medium/Low/1-4) · Status: next | in-progress | waiting · Dates: YYYY-MM-DD · Areas: ' + areaNames, '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ]
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'daybook-tasks-template.csv'; a.click()
  URL.revokeObjectURL(url)
  toast.success('Template downloaded — fill it in Excel or Sheets, save as CSV, then import')
}

// small CSV parser that handles quoted fields, commas and newlines
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', inQ = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some(c => c.trim() !== '')) rows.push(row)
      row = []
    } else cur += ch
  }
  row.push(cur)
  if (row.some(c => c.trim() !== '')) rows.push(row)
  return rows
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
    f.text().then(text => {
      const rows = parseCsv(text)
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
        const stMap: Record<string, Task['status']> = { 'next': 'next', 'in-progress': 'in-progress', 'in progress': 'in-progress', 'waiting': 'waiting', 'inbox': 'inbox' }
        const status = stMap[stRaw] ?? 'next'
        if (stRaw && !stMap[stRaw]) warnings.push(`status “${stRaw}” → next`)
        const area = byName(state.areas.filter(a => a.active), get(r, 'area'))
        if (get(r, 'area') && !area) warnings.push(`area “${get(r, 'area')}” not found — left loose`)
        const project = byName(state.projects, get(r, 'project'))
        if (get(r, 'project') && !project) warnings.push(`project “${get(r, 'project')}” not found`)
        const category = byName(state.categories.filter(c => c.active), get(r, 'category'))
        if (get(r, 'category') && !category) warnings.push(`category “${get(r, 'category')}” not found`)
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
    })
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
          <div className="grid gap-3">
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">1</span>
              <div>
                Download the template — it has every field, example rows, and the allowed values.
                <div><Button size="sm" variant="outline" className="h-7 mt-1.5" onClick={() => downloadTemplate(state)}><Download className="h-3 w-3 mr-1.5" />Download template (.csv)</Button></div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">2</span>
              <span>Fill it in Excel or Google Sheets — one task per row, only <b>Title</b> is required. Save/export as CSV.</span>
            </div>
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">3</span>
              <div className="flex-1">
                Upload it — you'll get a preview before anything is created.
                <label className="mt-1.5 border border-dashed border-input rounded-sm p-5 text-center text-[13px] text-muted-foreground cursor-pointer hover:bg-accent/50 block">
                  {fileName || 'Click to choose your filled CSV'}
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-2.5">
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

