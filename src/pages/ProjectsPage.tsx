import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { PRIORITY_LABELS, Priority, Task, daysSince, fmtDate } from '@/lib/model'
import { ImportProjectRow, openTasks, stalledProjects, useStore } from '@/lib/store'
import { EmptyNote, PriorityChip } from '@/components/bits'
import { ExportMenu } from '@/components/ExportMenu'
import { ViewExport } from '@/lib/exportView'
import { TaskDetail, TaskDialog, TaskRow } from '@/components/tasks'
import { ProjectBoard } from '@/components/ProjectBoard'
import { ColumnDropdown, SPREADSHEET_ACCEPT, downloadXlsxTemplateWithDropdowns, parseSpreadsheetFile } from '@/lib/xlsxTemplate'
import { SearchableSelect } from '@/components/ui/searchable-select'

export default function ProjectsPage() {
  const { state, updateProject, addProject, reassignProject } = useStore()
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  // When a project is archived/removed while it still has tasks, we prompt: move them to another
  // project, or clear the link. `reassignFor` holds the project being removed while the prompt is up.
  const [reassignFor, setReassignFor] = useState<{ id: string; name: string; count: number } | null>(null)
  const [reassignTarget, setReassignTarget] = useState<string>('')
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [addTaskFor, setAddTaskFor] = useState<{ areaId: string; projectId: string; milestoneId?: string } | null>(null)
  const [addingProject, setAddingProject] = useState(false)
  const [importing, setImporting] = useState(false)
  const open = openTasks(state)
  const stalled = stalledProjects(state)

  const openProject = state.projects.find(p => p.id === openProjectId)

  if (openProject) {
    const area = state.areas.find(a => a.id === openProject.areaId)
    return (
      <div className="grid grid-cols-1 gap-4">
        <div>
          <button onClick={() => setOpenProjectId(null)} className="text-[12px] text-muted-foreground hover:text-foreground">← All projects</button>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                {area && <span className="h-2.5 w-2.5 rounded-full" style={{ background: area.color }} />}
                <h1 className="font-display text-2xl font-semibold">{openProject.name}</h1>
                <PriorityChip p={openProject.priority} />
              </div>
              <p className="text-[13.5px] text-muted-foreground mt-1 italic">Goal: {openProject.outcome}</p>
              {openProject.due && <p className="text-[12px] text-muted-foreground mt-0.5 tabular">Due {fmtDate(openProject.due)}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <Select value={openProject.status} onValueChange={v => {
                updateProject(openProject.id, { status: v as never })
                toast(`Project → ${v}`)
                // Archiving a project with tasks still attached? Offer to re-home them.
                if (v === 'archived') {
                  const linked = state.tasks.filter(t => t.projectId === openProject.id).length
                  if (linked > 0) { setReassignTarget(''); setReassignFor({ id: openProject.id, name: openProject.name, count: linked }) }
                }
              }}>
                <SelectTrigger className="h-8 w-32 bg-card text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['active', 'on-hold', 'done', 'archived'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" onClick={() => setAddTaskFor({ areaId: openProject.areaId, projectId: openProject.id })}><Plus className="h-3.5 w-3.5 mr-1" />Task</Button>
            </div>
          </div>
        </div>
        {reassignFor && <ReassignProjectDialog info={reassignFor} state={state} reassignProject={reassignProject} onClose={() => setReassignFor(null)} target={reassignTarget} setTarget={setReassignTarget} />}
        <ProjectBoard
          project={openProject}
          onOpenTask={setOpenTask}
          onAddTask={milestoneId => setAddTaskFor({ areaId: openProject.areaId, projectId: openProject.id, milestoneId })}
        />
        <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onEdit={t => setEditTask(t)} />
        <TaskDialog open={!!editTask || !!addTaskFor} onClose={() => { setEditTask(null); setAddTaskFor(null) }} task={editTask} defaults={addTaskFor ?? undefined} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">Areas hold projects; projects hold tasks. WIP guardrail: keep ~{state.settings.projectWipLimit} active projects per area (edit in Settings).</p>
        <div className="flex items-center gap-2 shrink-0">
          <ExportMenu getData={(): ViewExport => {
            const scheme = state.settings.priorityScheme
            const rows: (string | number)[][] = []
            for (const a of state.areas.filter(ar => ar.active)) {
              for (const p of state.projects.filter(pr => pr.areaId === a.id && pr.status !== 'archived')) {
                const total = state.tasks.filter(t => t.projectId === p.id).length
                const doneN = state.tasks.filter(t => t.projectId === p.id && (t.status === 'done' || t.status === 'dropped')).length
                rows.push([p.name, a.name, p.status, PRIORITY_LABELS[scheme][p.priority], p.due ? fmtDate(p.due) : '', total - doneN, doneN, total, p.lastActivity ? fmtDate(p.lastActivity) : ''])
              }
            }
            return {
              title: 'Projects',
              headers: ['Project', 'Area', 'Status', 'Priority', 'Due', 'Open', 'Done', 'Total', 'Last activity'],
              rows, filenameBase: 'daybook-projects',
            }
          }} />
          <Button size="sm" variant="outline" className="h-8" onClick={downloadProjectsTemplate}><Download className="h-3.5 w-3.5 mr-1.5" />Excel template</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setImporting(true)}><Upload className="h-3.5 w-3.5 mr-1.5" />Import</Button>
          <Button size="sm" className="h-8" onClick={() => setAddingProject(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />New project</Button>
        </div>
      </div>
      {state.areas.filter(a => a.active).map((a, i) => {
        const projs = state.projects.filter(p => p.areaId === a.id && p.status !== 'archived')
        // tasks filed straight under the area, no project attached — the empty-state copy below
        // promises these "live directly under the area" but nothing ever rendered them
        const looseAreaTasks = open.filter(t => t.areaId === a.id && !t.projectId)
        const activeCount = projs.filter(p => p.status === 'active').length
        const overWip = activeCount > state.settings.projectWipLimit
        return (
          <section key={a.id} className="border border-border bg-card shadow-sm rounded-lg rise-in" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full" style={{ background: a.color }} />
              <div>
                <span className="font-display text-[15.5px] font-semibold">{a.name}</span>
                <span className="text-[11.5px] text-muted-foreground ml-2">{a.description}</span>
              </div>
              {overWip && (
                <span className="text-[10.5px] text-[hsl(8_60%_41%)] uppercase tracking-wide font-semibold">
                  {activeCount}/{state.settings.projectWipLimit} — over WIP limit
                </span>
              )}
              <span className="text-[11px] text-muted-foreground tabular ml-auto">review {a.reviewDay}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
              {projs.map(p => {
                const pt = open.filter(t => t.projectId === p.id)
                const done = state.tasks.filter(t => t.projectId === p.id && t.status === 'done').length
                const total = state.tasks.filter(t => t.projectId === p.id).length
                const isStalled = stalled.includes(p)
                // Phases are opt-in, so the count only appears on projects that have
                // them — an unphased project shouldn't grow a "0 phases" label.
                const phases = state.milestones.filter(m => m.projectId === p.id)
                return (
                  <button key={p.id} onClick={() => setOpenProjectId(p.id)} className="bg-card text-left px-4 py-3 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium truncate">{p.name}</span>
                      <PriorityChip p={p.priority} className="ml-auto shrink-0" />
                    </div>
                    <div className="text-[11.5px] text-muted-foreground truncate mt-0.5">{p.outcome}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-sm overflow-hidden">
                        <div className="h-full bg-[hsl(152_25%_38%)]" style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
                      </div>
                      <span className="text-[10.5px] tabular text-muted-foreground">{done}/{total}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[10.5px] uppercase tracking-wide">
                      {p.status === 'on-hold' && <span className="text-muted-foreground">on hold</span>}
                      {p.status === 'done' && <span className="text-[hsl(152_25%_35%)]">done</span>}
                      {isStalled && <span className="text-[hsl(8_60%_41%)] font-semibold">stalled {daysSince(p.lastActivity)}d</span>}
                      {phases.length > 0 && <span className="text-muted-foreground normal-case tracking-normal tabular">{phases.length} phase{phases.length === 1 ? '' : 's'}</span>}
                      {p.due && p.status === 'active' && <span className="text-muted-foreground normal-case tracking-normal tabular">due {fmtDate(p.due)}</span>}
                      <span className="ml-auto text-muted-foreground tabular normal-case">{pt.length} open</span>
                    </div>
                  </button>
                )
              })}
              {projs.length === 0 && <div className="bg-card px-4 py-3 text-[12.5px] text-muted-foreground italic">No projects — loose tasks live directly under the area.</div>}
            </div>
            {looseAreaTasks.length > 0 && <UnfiledTasks tasks={looseAreaTasks} onOpen={setOpenTask} />}
          </section>
        )
      })}
      <NewProjectDialog open={addingProject} onClose={() => setAddingProject(false)} onAdd={(name, areaId, outcome) => { addProject({ name, areaId, outcome }); toast.success('Project created') }} />
      <ImportProjectsDialog open={importing} onClose={() => setImporting(false)} />
      <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onEdit={t => setEditTask(t)} />
      <TaskDialog open={!!editTask} onClose={() => setEditTask(null)} task={editTask} />
    </div>
  )
}

/**
 * Tasks filed to an area but to no project.
 *
 * These used to render in full under every area, which made the Projects page a
 * second copy of the task list — the same to-dos you'd just scrolled past in
 * Tasks, with none of the project structure that's the point of this page.
 *
 * They can't simply be hidden either: a task with no project is the one most
 * likely to be forgotten, and this is the only screen where its absence from a
 * project is visible. So it's a collapsed count, framed as work to file rather
 * than work to read — the page stays about projects, and the loose ends stay
 * reachable in one click.
 */
function UnfiledTasks({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2 flex items-center gap-2 text-left hover:bg-accent/40 transition-colors"
      >
        <span className="text-[11.5px] text-muted-foreground">
          {tasks.length} task{tasks.length === 1 ? '' : 's'} in this area with no project
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && tasks.map(t => <TaskRow key={t.id} task={t} showArea={false} onOpen={onOpen} />)}
    </div>
  )
}

// Shown when a project is archived while tasks are still attached. Lets you move those tasks to
// another project or clear the link, so nothing is left pointing at a removed project.
function ReassignProjectDialog({ info, state, reassignProject, onClose, target, setTarget }: {
  info: { id: string; name: string; count: number }
  state: ReturnType<typeof useStore>['state']
  reassignProject: (fromId: string, toId: string | null) => number
  onClose: () => void
  target: string
  setTarget: (v: string) => void
}) {
  const dests = state.projects
    .filter(p => p.id !== info.id && (p.status === 'active' || p.status === 'on-hold'))
    .map(p => ({ value: p.id, label: p.name, hint: state.areas.find(a => a.id === p.areaId)?.name, color: state.areas.find(a => a.id === p.areaId)?.color }))
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Re-home the tasks?</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <p className="text-[13px] text-muted-foreground">
            You archived <b className="text-foreground">{info.name}</b>, and <b className="text-foreground">{info.count} task{info.count === 1 ? '' : 's'}</b> {info.count === 1 ? 'is' : 'are'} still attached to it. Move {info.count === 1 ? 'it' : 'them'} to another project, or clear the project link.
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            <Label className="text-[12px] font-semibold text-foreground/80">Move to project</Label>
            <SearchableSelect
              value={target}
              onValueChange={setTarget}
              options={dests}
              placeholder={dests.length ? 'Choose a project…' : 'No other active projects'}
              searchPlaceholder="Search projects…"
            />
          </div>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" onClick={onClose}>Leave on archived project</Button>
          <Button variant="outline" onClick={() => { const n = reassignProject(info.id, null); toast.success(`Cleared project from ${n} task${n === 1 ? '' : 's'}`); onClose() }}>
            Clear project link
          </Button>
          <Button disabled={!target} onClick={() => { const n = reassignProject(info.id, target); const to = state.projects.find(p => p.id === target); toast.success(`Moved ${n} task${n === 1 ? '' : 's'} to ${to?.name ?? 'project'}`); onClose() }}>
            Move {info.count} here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewProjectDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string, areaId: string, outcome: string) => void }) {
  const { state } = useStore()
  const [name, setName] = useState('')
  const [areaId, setAreaId] = useState(state.areas[0]?.id ?? '')
  const [outcome, setOutcome] = useState('')
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-display text-lg">New project</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5"><Label className="text-xs">Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Run the shul dinner" /></div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label className="text-xs">Area</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{state.areas.filter(a => a.active).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-1.5"><Label className="text-xs">Desired outcome — the finish line</Label><Input value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="A full hall, happy guests, budget met" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (!name.trim()) return; onAdd(name, areaId, outcome); setName(''); setOutcome(''); onClose() }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Areas & Projects bulk import (format-agnostic, like Contacts/Collections) ----------

async function downloadProjectsTemplate() {
  const rows = [
    ['Project', 'Area', 'Status', 'Priority', 'Outcome / Goal', 'Owner / For', 'Type', 'Built with', 'Notes'],
    ['Underwriting engine', 'AI Projects', 'active', 'P1', 'Automated cash-advance underwriting', 'Rubiks', 'Cash Advance', 'Claude', 'REUnderwriting branch'],
    ['Family tree', 'Personal', 'active', 'P3', 'Interactive family tree site', 'Personal', 'Website', 'Replit', ''],
    ['Chayeinu ERP', 'Client Work', 'done', 'P2', 'Delivered ERP for the client', 'Mendy Smetana', 'Client Project', 'Replit', 'Complete'],
    ['- DELETE THIS ROW - Only "Project" is required. Area groups projects (new areas are created automatically). Status = active | on-hold | done | archived. Priority = P0 | P1 | P2 | P3. Owner/Type/Built with/Notes are folded into the project’s notes.', '', '', '', '', '', '', '', ''],
  ]
  const dropdowns: ColumnDropdown[] = [
    { col: 2, values: ['active', 'on-hold', 'done', 'archived'] },
    { col: 3, values: ['P0', 'P1', 'P2', 'P3'] },
  ]
  await downloadXlsxTemplateWithDropdowns('daybook-projects-template.xlsx', 'Projects', rows, dropdowns)
  toast.success('Excel template downloaded — fill one project per row; new Areas are created for you')
}

type PMapField = 'name' | 'area' | 'owner' | 'type' | 'tool' | 'system' | 'status' | 'priority' | 'outcome' | 'notes'
type PMapping = Record<PMapField, number>

const P_FIELDS: { key: PMapField; label: string }[] = [
  { key: 'name', label: 'Project name *' },
  { key: 'area', label: 'Area / group' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'outcome', label: 'Outcome / goal' },
  { key: 'owner', label: 'Owner / for' },
  { key: 'type', label: 'Type' },
  { key: 'tool', label: 'Built with' },
  { key: 'system', label: 'System' },
  { key: 'notes', label: 'Notes' },
]

function autoDetectProjects(header: string[]): PMapping {
  const hs = header.map(h => (h ?? '').toString().trim().toLowerCase())
  const used = new Set<number>()
  const pick = (patterns: string[]) => {
    for (let i = 0; i < hs.length; i++) { if (used.has(i)) continue; if (patterns.some(p => hs[i].includes(p))) { used.add(i); return i } }
    return -1
  }
  const m = {} as PMapping
  m.name = pick(['project', 'report', 'title', 'name'])
  m.area = pick(['area', 'group'])
  m.status = pick(['status', 'active', 'stage', 'progress'])
  m.priority = pick(['priority', 'prio'])
  m.outcome = pick(['outcome', 'goal', 'objective'])
  // "For" must match exactly — otherwise "Platform" (which contains "for") would be grabbed here.
  m.owner = (() => { for (let i = 0; i < hs.length; i++) { if (used.has(i)) continue; const h = hs[i]; if (h === 'for' || h.includes('client') || h.includes('owner') || h.includes('requested')) { used.add(i); return i } } return -1 })()
  m.type = pick(['type', 'category'])
  m.tool = pick(['platform build', 'built with', 'build with', 'platform', 'tool'])
  m.system = pick(['system'])
  m.notes = pick(['notes', 'note', 'description'])
  return m
}

function mapProjStatus(raw: string): ImportProjectRow['status'] {
  const s = raw.trim().toLowerCase()
  if (!s) return undefined
  if (/complete|done|finished|shipped|live/.test(s)) return 'done'
  if (/hold|pause|later|someday/.test(s)) return 'on-hold'
  if (/archiv|cancel|dropp|dead/.test(s)) return 'archived'
  return 'active'
}
function mapProjPriority(raw: string): Priority | undefined {
  const s = raw.trim().toLowerCase()
  if (!s) return undefined
  if (/p0|urgent|critical/.test(s)) return 'P0'
  if (/p1|high/.test(s)) return 'P1'
  if (/p3|low/.test(s)) return 'P3'
  if (/p2|med|normal/.test(s)) return 'P2'
  return undefined
}

function buildProjectRows(rows: string[][], m: PMapping, strategy: 'single' | 'column', singleArea: string, areaCol: number): ImportProjectRow[] {
  const one = (r: string[], idx: number) => (idx >= 0 ? (r[idx] ?? '').toString().trim() : '')
  const out: ImportProjectRow[] = []
  for (const r of rows.slice(1)) {
    const name = one(r, m.name)
    if (!name || /^-\s*delete this row/i.test(name)) continue
    const owner = one(r, m.owner), type = one(r, m.type), tool = one(r, m.tool), system = one(r, m.system)
    const rawNotes = one(r, m.notes)
    const meta = [owner && `For ${owner}`, type && `Type: ${type}`, tool && `Built with ${tool}`, system && `System: ${system}`].filter(Boolean).join(' · ')
    const notes = [rawNotes, meta].filter(Boolean).join(rawNotes && meta ? ' — ' : '') || undefined
    const areaName = (strategy === 'column' ? (one(r, areaCol) || singleArea) : singleArea).trim() || 'Imported'
    out.push({
      name,
      areaName,
      status: mapProjStatus(one(r, m.status)),
      priority: mapProjPriority(one(r, m.priority)),
      outcome: one(r, m.outcome) || undefined,
      notes,
    })
  }
  return out
}

function ImportProjectsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, importProjects } = useStore()
  const [fileName, setFileName] = useState('')
  const [rawRows, setRawRows] = useState<string[][] | null>(null)
  const [mapping, setMapping] = useState<PMapping | null>(null)
  const [strategy, setStrategy] = useState<'single' | 'column'>('single')
  const [singleArea, setSingleArea] = useState('AI Projects')
  const [areaCol, setAreaCol] = useState(-1)

  function reset() { setFileName(''); setRawRows(null); setMapping(null); setStrategy('single'); setSingleArea('AI Projects'); setAreaCol(-1) }

  function handleFile(f: File) {
    setFileName(f.name)
    parseSpreadsheetFile(f).then(rows => {
      if (rows.length < 2) { toast.error('No data rows found — start from the template'); return }
      const header = rows[0].map(h => (h ?? '').toString().trim())
      const m = autoDetectProjects(header)
      if (m.name === -1) m.name = 0 // fall back to the first column as the project name
      setRawRows(rows); setMapping(m)
      setAreaCol(m.area !== -1 ? m.area : (m.owner !== -1 ? m.owner : (m.type !== -1 ? m.type : 0)))
      setStrategy('single')
    }).catch(() => toast.error('Couldn’t read that file — try a .xlsx or .csv export'))
  }

  const header = rawRows?.[0]?.map(h => (h ?? '').toString().trim()) ?? []
  const setMapCol = (field: PMapField, idx: number) => setMapping(m => (m ? { ...m, [field]: idx } : m))

  const preview = useMemo(() => {
    if (!rawRows || !mapping) return null
    const built = buildProjectRows(rawRows, mapping, strategy, singleArea, areaCol)
    const existingAreas = new Set(state.areas.map(a => a.name.trim().toLowerCase()))
    const newAreas = [...new Set(built.map(b => b.areaName).filter(a => !existingAreas.has(a.trim().toLowerCase())))]
    const existingKey = new Set(state.projects.map(p => `${state.areas.find(a => a.id === p.areaId)?.name.trim().toLowerCase()}||${p.name.trim().toLowerCase()}`))
    const merges = built.filter(b => existingKey.has(`${b.areaName.trim().toLowerCase()}||${b.name.trim().toLowerCase()}`)).length
    return { built, newAreas, merges }
  }, [rawRows, mapping, strategy, singleArea, areaCol, state.areas, state.projects])

  function commit() {
    if (!preview) return
    if (!preview.built.length) { toast.error('No projects to import — check the Project-name column'); return }
    const res = importProjects(preview.built)
    const bits = [`${res.projectsAdded} added`]
    if (res.projectsMerged) bits.push(`${res.projectsMerged} merged`)
    if (res.areasCreated) bits.push(`${res.areasCreated} new area${res.areasCreated === 1 ? '' : 's'}`)
    toast.success(`Imported ${bits.join(' · ')}`)
    reset(); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-lg">Import projects</DialogTitle></DialogHeader>
        {!rawRows ? (
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">1</span>
              <div>
                <b>Bring in a list of projects.</b> Any spreadsheet works — Daybook reads your own column headers and matches them. Each project is filed under an <b>Area</b>; new areas are created automatically. Extra columns (owner, type, the tool it was built with, notes) are folded into the project’s notes so nothing is lost.
                <div><Button size="sm" variant="outline" className="h-7 mt-1.5" onClick={downloadProjectsTemplate}>Download the Excel template (.xlsx)</Button></div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">2</span>
              <div className="flex-1">
                Drop your <b>.xlsx or .csv</b> in — you’ll see a preview first, and a project that already exists in the same area is <b>merged, not duplicated</b>.
                <label className="mt-1.5 border border-dashed border-input rounded-sm p-5 text-center text-[13px] text-muted-foreground cursor-pointer hover:bg-accent/50 block">
                  {fileName || 'Click to choose your .xlsx or .csv'}
                  <input type="file" accept={SPREADSHEET_ACCEPT} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {/* Area strategy */}
            <div className="border border-border rounded-sm p-2.5 grid gap-2 text-[12.5px]">
              <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Which area should these go under?</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={strategy === 'single'} onChange={() => setStrategy('single')} className="accent-[hsl(var(--primary))]" />
                <span>All under one area:</span>
                <Input value={singleArea} onChange={e => setSingleArea(e.target.value)} className="h-7 w-44 text-[12.5px]" placeholder="e.g. AI Projects" />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={strategy === 'column'} onChange={() => setStrategy('column')} className="accent-[hsl(var(--primary))]" />
                <span>One area per value in column:</span>
                <select value={areaCol} onChange={e => setAreaCol(Number(e.target.value))} disabled={strategy !== 'column'} className="h-7 border border-border rounded-sm bg-background px-1.5 text-[12px] disabled:opacity-50 outline-none">
                  {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
              <p className="text-[11px] text-muted-foreground">A blank value in that column falls back to “{singleArea || 'Imported'}”.</p>
            </div>

            {/* Column mapping */}
            <div className="border border-border rounded-sm divide-y divide-border/60">
              {P_FIELDS.map(f => (
                <div key={f.key} className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px]">
                  <span className="w-28 shrink-0 text-muted-foreground">{f.label}</span>
                  <select
                    value={mapping?.[f.key] ?? -1}
                    onChange={e => setMapCol(f.key, Number(e.target.value))}
                    className="h-7 flex-1 min-w-0 border border-border rounded-sm bg-background px-1.5 text-[12px] cursor-pointer outline-none"
                  >
                    <option value={-1}>— none —</option>
                    {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview */}
            {preview && (
              <div className="grid gap-1.5">
                <p className="text-[13px]">
                  <b>{preview.built.length}</b> projects from <span className="text-muted-foreground">{fileName}</span>
                  {preview.merges > 0 && <span> · <b>{preview.merges}</b> already exist (will merge)</span>}
                  {preview.newAreas.length > 0 && <span> · creates <b>{preview.newAreas.length}</b> new area{preview.newAreas.length === 1 ? '' : 's'}: {preview.newAreas.slice(0, 6).join(', ')}{preview.newAreas.length > 6 ? '…' : ''}</span>}
                </p>
                <div className="border border-border max-h-[260px] overflow-y-auto">
                  {preview.built.slice(0, 60).map((b, i) => (
                    <div key={i} className="px-3 py-1.5 border-b border-border/60 last:border-0 text-[12.5px] flex items-center gap-2">
                      <span className="font-medium truncate">{b.name}</span>
                      <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground shrink-0 ml-auto">{b.areaName}{b.status && b.status !== 'active' ? ` · ${b.status}` : ''}</span>
                    </div>
                  ))}
                  {preview.built.length > 60 && <div className="px-3 py-1.5 text-[11.5px] text-muted-foreground">+{preview.built.length - 60} more…</div>}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose() }}>Cancel</Button>
          {rawRows && <Button variant="outline" onClick={reset}>Different file</Button>}
          {rawRows && <Button onClick={commit} disabled={!preview?.built.length}>Import {preview?.built.length ?? 0} project{preview?.built.length === 1 ? '' : 's'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
