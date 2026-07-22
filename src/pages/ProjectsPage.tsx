import React, { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Task, daysSince, fmtDate } from '@/lib/model'
import { openTasks, stalledProjects, useStore } from '@/lib/store'
import { EmptyNote, PriorityChip } from '@/components/bits'
import { TaskDetail, TaskDialog, TaskRow } from '@/components/tasks'

export default function ProjectsPage() {
  const { state, updateProject, addProject } = useStore()
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [addTaskFor, setAddTaskFor] = useState<{ areaId: string; projectId: string } | null>(null)
  const [addingProject, setAddingProject] = useState(false)
  const open = openTasks(state)
  const stalled = stalledProjects(state)

  const openProject = state.projects.find(p => p.id === openProjectId)

  if (openProject) {
    const tasks = state.tasks.filter(t => t.projectId === openProject.id && !t.parentId)
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
              <Select value={openProject.status} onValueChange={v => { updateProject(openProject.id, { status: v as never }); toast(`Project → ${v}`) }}>
                <SelectTrigger className="h-8 w-32 bg-card text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['active', 'on-hold', 'done', 'archived'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" onClick={() => setAddTaskFor({ areaId: openProject.areaId, projectId: openProject.id })}><Plus className="h-3.5 w-3.5 mr-1" />Task</Button>
            </div>
          </div>
        </div>
        <section className="border border-border bg-card shadow-sm">
          {tasks.length === 0 && <EmptyNote>No tasks yet — add the first next action.</EmptyNote>}
          {tasks.map(t => <TaskRow key={t.id} task={t} showArea={false} onOpen={setOpenTask} />)}
        </section>
        <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onEdit={t => setEditTask(t)} />
        <TaskDialog open={!!editTask || !!addTaskFor} onClose={() => { setEditTask(null); setAddTaskFor(null) }} task={editTask} defaults={addTaskFor ?? undefined} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">Areas hold projects; projects hold tasks. WIP guardrail: keep ~{state.settings.projectWipLimit} active projects per area (edit in Settings).</p>
        <Button size="sm" className="h-8" onClick={() => setAddingProject(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />New project</Button>
      </div>
      {state.areas.filter(a => a.active).map((a, i) => {
        const projs = state.projects.filter(p => p.areaId === a.id && p.status !== 'archived')
        // tasks filed straight under the area, no project attached — the empty-state copy below
        // promises these "live directly under the area" but nothing ever rendered them
        const looseAreaTasks = open.filter(t => t.areaId === a.id && !t.projectId)
        const activeCount = projs.filter(p => p.status === 'active').length
        const overWip = activeCount > state.settings.projectWipLimit
        return (
          <section key={a.id} className="border border-border bg-card shadow-sm rise-in" style={{ animationDelay: `${i * 60}ms` }}>
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
                      {p.due && p.status === 'active' && <span className="text-muted-foreground normal-case tracking-normal tabular">due {fmtDate(p.due)}</span>}
                      <span className="ml-auto text-muted-foreground tabular normal-case">{pt.length} open</span>
                    </div>
                  </button>
                )
              })}
              {projs.length === 0 && <div className="bg-card px-4 py-3 text-[12.5px] text-muted-foreground italic">No projects — loose tasks live directly under the area.</div>}
            </div>
            {looseAreaTasks.length > 0 && (
              <div className="border-t border-border">
                {looseAreaTasks.map(t => <TaskRow key={t.id} task={t} showArea={false} onOpen={setOpenTask} />)}
              </div>
            )}
          </section>
        )
      })}
      <NewProjectDialog open={addingProject} onClose={() => setAddingProject(false)} onAdd={(name, areaId, outcome) => { addProject({ name, areaId, outcome }); toast.success('Project created') }} />
      <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onEdit={t => setEditTask(t)} />
      <TaskDialog open={!!editTask} onClose={() => setEditTask(null)} task={editTask} />
    </div>
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
