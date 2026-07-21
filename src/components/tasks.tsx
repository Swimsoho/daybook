import React, { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, ChevronRight, Clock, Loader2, MoreHorizontal, Paperclip, Phone, Trash2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Priority, PRIORITY_DESC, PRIORITY_LABELS, STATUS_LABELS, Task, TaskStatus, TaskType, TYPE_LABELS, fmtDate, today, addDays, daysSince,
} from '@/lib/model'
import { categoriesForArea, rollup, subtasksOf, useStore } from '@/lib/store'
import { useCloud } from '@/lib/cloud'
import { attachmentsAvailable, deleteAttachmentFile, fmtBytes, getAttachmentUrl, uploadAttachment } from '@/lib/attachments'
import { AreaDot, DueChip, PriorityChip } from './bits'

// ---------- Quick add — one line, Enter, done. Usable on any screen ----------

export function QuickAdd({ areaId: fixedAreaId, due, projectId: fixedProjectId, placeholder }: { areaId?: string; due?: string; projectId?: string; placeholder?: string }) {
  const { state, addTask } = useStore()
  const [text, setText] = useState('')
  // Area/project pick right inline — only shown for whichever level isn't already fixed by the caller,
  // so a task never has to be filed "blind" and re-sorted later.
  const [pickedAreaId, setPickedAreaId] = useState('')
  const [pickedProjectId, setPickedProjectId] = useState('')
  const [pickedCategoryId, setPickedCategoryId] = useState('')
  const areaId = fixedAreaId ?? (pickedAreaId || undefined)
  const area = state.areas.find(a => a.id === areaId)
  const projectsInArea = areaId ? state.projects.filter(p => p.areaId === areaId && (p.status === 'active' || p.status === 'on-hold')) : []
  const projectId = fixedProjectId ?? (pickedProjectId || undefined)

  function add() {
    if (!text.trim()) return
    addTask({
      title: text.trim(), areaId, projectId, due, priority: due === today() ? 'P1' : 'P2', status: 'next', type: 'todo', source: 'manual',
      categoryIds: pickedCategoryId ? [pickedCategoryId] : [],
    })
    const project = state.projects.find(p => p.id === projectId)
    toast.success(project ? `Added to ${project.name}` : area ? `Added to ${area.name}` : due === today() ? 'Added to today' : 'Task added')
    setText('')
    if (!fixedAreaId) setPickedAreaId('')
    if (!fixedProjectId) setPickedProjectId('')
    setPickedCategoryId('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-1.5 border-b border-dashed border-border/70 bg-background/40 focus-within:bg-background">
      <span className="text-muted-foreground text-[15px] leading-none shrink-0">+</span>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && add()}
        placeholder={placeholder ?? (area ? `Quick add to ${area.name} — type and press Enter` : 'Quick add a task — type and press Enter')}
        className="flex-1 min-w-[140px] h-8 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
      />
      {!fixedAreaId && (
        <Select value={pickedAreaId || '__none__'} onValueChange={v => { setPickedAreaId(v === '__none__' ? '' : v); setPickedProjectId('') }}>
          <SelectTrigger className="h-7 w-[112px] text-[11.5px] bg-card shrink-0"><SelectValue placeholder="Area" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No area</SelectItem>
            {state.areas.filter(a => a.active).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {!fixedProjectId && areaId && projectsInArea.length > 0 && (
        <Select value={pickedProjectId || '__none__'} onValueChange={v => setPickedProjectId(v === '__none__' ? '' : v)}>
          <SelectTrigger className="h-7 w-[128px] text-[11.5px] bg-card shrink-0"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No project</SelectItem>
            {projectsInArea.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Select value={pickedCategoryId || '__none__'} onValueChange={v => setPickedCategoryId(v === '__none__' ? '' : v)}>
        <SelectTrigger className="h-7 w-[112px] text-[11.5px] bg-card shrink-0"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No category</SelectItem>
          {categoriesForArea(state.categories, areaId, pickedCategoryId).map(c => <SelectItem key={c.id} value={c.id}>{c.level > 0 ? '› ' : ''}{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <button onClick={add} className="h-7 px-2.5 text-[11.5px] border border-input rounded-sm bg-card hover:bg-accent shrink-0">Add</button>
    </div>
  )
}

// ---------- Task row with quick actions ----------

export function TaskRow({ task, showArea = true, depth = 0, onOpen, expandAll }: {
  task: Task
  showArea?: boolean
  depth?: number
  onOpen: (t: Task) => void
  expandAll?: boolean
}) {
  const { state, completeTask, snoozeTask, calledFollowUp, updateTask, dropTask } = useStore()
  const [localExp, setLocalExp] = useState<boolean | null>(null)
  React.useEffect(() => { setLocalExp(null) }, [expandAll])
  const expanded = localExp ?? expandAll ?? false
  const setExpanded = (fn: (v: boolean) => boolean) => setLocalExp(fn(expanded))
  const kids = subtasksOf(state, task.id)
  const roll = kids.length ? rollup(state, task.id) : null
  const person = state.people.find(p => p.id === task.personId)
  const project = state.projects.find(p => p.id === task.projectId)
  const qa = state.settings.quickActions
  const done = task.status === 'done'

  return (
    <>
      <div
        draggable={!done}
        onDragStart={e => {
          e.dataTransfer.setData('text/task-id', task.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        className={cn(
          'group flex items-center gap-2.5 border-b border-border/70 px-2 py-2 hover:bg-accent/50 transition-colors',
          depth > 0 && 'bg-background/40',
          !done && 'cursor-grab active:cursor-grabbing',
        )}
        style={{ paddingLeft: 8 + depth * 26 }}
      >
        {/* complete / reopen */}
        <button
          aria-label={done ? 'reopen' : 'complete'}
          title={done ? 'Click to reopen' : 'Complete (undo available)'}
          onClick={() => {
            if (done) {
              updateTask(task.id, { status: 'next', completedAt: undefined, droppedReason: undefined }, 'reopened')
              toast.success('Reopened — back on the list')
            } else {
              const prev = task.status
              completeTask(task.id)
              toast.success('Done — archived, never deleted', {
                action: { label: 'Undo', onClick: () => updateTask(task.id, { status: prev, completedAt: undefined }, 'undo complete') },
                duration: 6000,
              })
            }
          }}
          className={cn(
            'h-[17px] w-[17px] shrink-0 rounded-full border flex items-center justify-center transition-all',
            done ? 'bg-primary border-primary text-primary-foreground hover:opacity-70' : 'border-[hsl(96_10%_13%_/_0.4)] hover:border-primary hover:scale-110',
          )}
        >
          {done && <Check className="h-3 w-3" />}
        </button>

        {/* expander for subtasks */}
        {roll ? (
          <button onClick={() => setExpanded(e => !e)} className="shrink-0 text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : depth === 0 ? <span className="w-3.5 shrink-0" /> : null}

        {/* title + meta */}
        <button onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 min-w-0">
            {task.type === 'call' && <Phone className="h-3 w-3 shrink-0 text-[hsl(215_45%_42%)]" />}
            {task.type === 'followup' && <Clock className="h-3 w-3 shrink-0 text-[hsl(17_63%_47%)]" />}
            <span className={cn('truncate text-[13.5px]', done && 'line-through text-muted-foreground')}>{task.title}</span>
            {roll && (
              <span className="shrink-0 text-[10.5px] tabular text-muted-foreground border border-border rounded-sm px-1 py-px">
                {roll.done}/{roll.total}{roll.overdue > 0 && <span className="text-[hsl(8_60%_41%)]"> · {roll.overdue} late</span>}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {showArea && <AreaDot areaId={task.areaId} withName />}
            {project && <span className="text-[11px] text-muted-foreground truncate">› {project.name}</span>}
            {person && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{person.name}</span>}
            {task.status === 'waiting' && task.waitingOn && (
              <span className="text-[11px] text-[hsl(28_60%_32%)]">waiting on {task.waitingOn} · {daysSince(task.waitingSince)}d</span>
            )}
          </div>
        </button>

        <DueChip due={task.due} />
        <PriorityChip p={task.priority} />

        {/* one-click inline status */}
        {!done && (
          <select
            value={task.status}
            onClick={e => e.stopPropagation()}
            onChange={e => {
              const v = e.target.value as TaskStatus
              if (v === 'done') { completeTask(task.id); toast.success('Done — archived') }
              else updateTask(task.id, { status: v, waitingSince: v === 'waiting' ? today() : task.waitingSince }, `status → ${STATUS_LABELS[v]}`)
            }}
            className="hidden sm:block h-6 max-w-[96px] shrink-0 text-[10.5px] border border-border rounded-sm bg-background px-1 text-muted-foreground hover:border-input hover:text-foreground cursor-pointer outline-none"
          >
            {(['inbox', 'next', 'in-progress', 'waiting', 'done'] as TaskStatus[])
              .filter(s => s !== 'inbox' || task.status === 'inbox')
              .map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        )}

        {/* quick actions */}
        {!done && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-30 group-hover:opacity-100 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Quick actions</DropdownMenuLabel>
              {qa.done && <DropdownMenuItem onClick={() => { completeTask(task.id); toast.success('Done — archived') }}>Done / complete</DropdownMenuItem>}
              {qa.called && (task.type === 'call' || task.personId) && (
                <DropdownMenuItem onClick={() => { calledFollowUp(task.id); toast.success(`Call logged — follow-up created for ${fmtDate(addDays(today(), state.settings.followUpDays))}`) }}>
                  Called — needs follow-up
                </DropdownMenuItem>
              )}
              {qa.snooze && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Snooze / defer</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {[1, 2, 7].map(d => (
                      <DropdownMenuItem key={d} onClick={() => { snoozeTask(task.id, d); toast(`Snoozed to ${fmtDate(addDays(today(), d))}`) }}>
                        {d === 1 ? 'Tomorrow' : d === 2 ? 'In 2 days' : 'Next week'}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {qa.reassign && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Reassign area</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {state.areas.filter(a => a.active).map(a => (
                      <DropdownMenuItem key={a.id} onClick={() => { updateTask(task.id, { areaId: a.id, projectId: undefined }, `moved to ${a.name}`); toast(`Moved to ${a.name}`) }}>
                        <span className="h-2 w-2 rounded-full mr-2" style={{ background: a.color }} />{a.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {qa.reassign && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Reassign project</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                    <DropdownMenuItem onClick={() => { updateTask(task.id, { projectId: undefined }, 'removed from project'); toast('No longer tied to a project') }}>
                      <span className="text-muted-foreground">No project</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {state.projects.filter(p => p.status === 'active' || p.status === 'on-hold').map(p => {
                      const pa = state.areas.find(a => a.id === p.areaId)
                      return (
                        <DropdownMenuItem key={p.id} onClick={() => { updateTask(task.id, { projectId: p.id, areaId: p.areaId }, `moved to project ${p.name}`); toast(`Moved to ${p.name}`) }}>
                          <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: pa?.color }} />
                          <span className="truncate">{p.name}</span>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {qa.reassign && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Reassign category</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                    <DropdownMenuItem onClick={() => { updateTask(task.id, { categoryIds: [] }, 'category cleared'); toast('Category cleared') }}>
                      <span className="text-muted-foreground">No category</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {categoriesForArea(state.categories, task.areaId, task.categoryIds[0]).map(c => (
                      <DropdownMenuItem key={c.id} onClick={() => { updateTask(task.id, { categoryIds: [c.id] }, `re-categorized as ${c.name}`); toast.success(`Re-categorized as ${c.name}`) }}>
                        {c.color && <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: c.color }} />}
                        <span className="truncate">{c.level > 0 ? '› ' : ''}{c.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Set status</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {(['next', 'in-progress', 'waiting'] as const).map(st => (
                    <DropdownMenuItem key={st} onClick={() => updateTask(task.id, { status: st, waitingSince: st === 'waiting' ? today() : undefined }, `status → ${STATUS_LABELS[st]}`)}>
                      {STATUS_LABELS[st]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem className="text-[hsl(8_60%_41%)]" onClick={() => { dropTask(task.id, 'Dropped from quick actions'); toast('Dropped — archived with reason') }}>
                Drop (archive with reason)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {expanded && kids.map(k => <TaskRow key={k.id} task={k} showArea={false} depth={depth + 1} onOpen={onOpen} />)}
    </>
  )
}

// ---------- Add / edit task dialog (type-dependent fields) ----------

export function TaskDialog({ open, onClose, task, defaults }: {
  open: boolean
  onClose: () => void
  task?: Task | null
  defaults?: Partial<Task>
}) {
  const { state, addTask, updateTask } = useStore()
  const editing = !!task
  const [form, setForm] = useState<Partial<Task>>({})
  const f = { type: 'todo' as TaskType, priority: 'P2' as Priority, ...(task ?? defaults ?? {}), ...form }
  const set = (patch: Partial<Task>) => setForm(x => ({ ...x, ...patch }))
  const scheme = state.settings.priorityScheme

  const projects = state.projects.filter(p => p.status === 'active' && (!f.areaId || p.areaId === f.areaId))
  const mainCats = categoriesForArea(state.categories, f.areaId, f.categoryIds?.[0])

  function save() {
    if (!f.title?.trim()) { toast.error('A title is all that’s required'); return }
    if (editing && task) {
      updateTask(task.id, form, 'edited in detail form')
      toast.success('Saved')
    } else {
      addTask(f as Task)
      toast.success(`Added to ${state.areas.find(a => a.id === f.areaId)?.name ?? 'Inbox'}`)
    }
    setForm({})
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setForm({}); onClose() } }}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{editing ? 'Edit task' : 'Detailed entry'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3.5">
          {/* type selector drives visible fields */}
          <div className="flex gap-1.5">
            {(Object.keys(TYPE_LABELS) as TaskType[]).map(tt => (
              <button
                key={tt}
                onClick={() => set({ type: tt })}
                className={cn(
                  'px-3 py-1.5 text-xs border rounded-sm transition-colors',
                  f.type === tt ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent',
                )}
              >
                {TYPE_LABELS[tt]}
              </button>
            ))}
            <span className="text-[10.5px] text-muted-foreground self-center ml-1">fields follow the type</span>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={f.title ?? ''} onChange={e => set({ title: e.target.value })} placeholder={f.type === 'call' ? 'Call…' : 'Book the hall…'} />
          </div>

          {(f.type === 'call' || f.type === 'followup') && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Contact {f.type === 'call' && <span className="text-muted-foreground">(one-tap dial shortcut shown on the task)</span>}</Label>
              <Select value={f.personId ?? ''} onValueChange={v => set({ personId: v })}>
                <SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger>
                <SelectContent>
                  {state.people.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {f.type === 'call' && (
            <div className="grid gap-1.5">
              <Label className="text-xs">What this call is about</Label>
              <Input value={f.callAbout ?? ''} onChange={e => set({ callAbout: e.target.value })} placeholder="Final headcount and dietary list" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Area</Label>
              <Select value={f.areaId ?? ''} onValueChange={v => set({ areaId: v, projectId: undefined })}>
                <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
                <SelectContent>
                  {state.areas.filter(a => a.active).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Project <span className="text-muted-foreground">(optional)</span></Label>
              <Select value={f.projectId ?? 'none'} onValueChange={v => set({ projectId: v === 'none' ? undefined : v })}>
                <SelectTrigger><SelectValue placeholder="None — loose one-off" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — loose one-off</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={f.priority} onValueChange={v => set({ priority: v as Priority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['P0', 'P1', 'P2', 'P3'] as Priority[]).map(p => (
                    <SelectItem key={p} value={p}>{PRIORITY_LABELS[scheme][p]} — {PRIORITY_DESC[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">{f.type === 'followup' ? `Due (default +${state.settings.followUpDays}d)` : 'Due date'}</Label>
              <Input type="date" value={f.due ?? (f.type === 'followup' ? addDays(today(), state.settings.followUpDays) : '')} onChange={e => set({ due: e.target.value || undefined })} />
            </div>
          </div>

          {f.type === 'todo' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={f.categoryIds?.[0] ?? 'none'} onValueChange={v => set({ categoryIds: v === 'none' ? [] : [v] })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {mainCats.map(c => <SelectItem key={c.id} value={c.id}>{c.level > 0 ? '› ' : ''}{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Vendor <span className="text-muted-foreground">(optional)</span></Label>
                <Select value={f.vendorId ?? 'none'} onValueChange={v => set({ vendorId: v === 'none' ? undefined : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {state.vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={f.notes ?? ''} onChange={e => set({ notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{editing ? 'Save changes' : 'Add task'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- File attachments on a task ----------

function TaskAttachments({ task }: { task: Task }) {
  const cloud = useCloud()
  const { addAttachment, removeAttachment } = useStore()
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const attachments = task.attachments ?? []

  async function handleFiles(files: FileList) {
    if (!cloud) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const { attachment, error } = await uploadAttachment(cloud.profile.id, cloud.saveKey, task.id, file)
      if (error) toast.error(error)
      else if (attachment) { addAttachment(task.id, attachment); toast.success(`${file.name} attached`) }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function openAttachment(path: string, name: string) {
    const url = await getAttachmentUrl(path)
    if (!url) { toast.error('Couldn’t open that file — try again in a moment'); return }
    window.open(url, '_blank', 'noopener')
    void name
  }

  async function remove(id: string, path: string, name: string) {
    const err = await deleteAttachmentFile(path)
    if (err) { toast.error(err); return }
    removeAttachment(task.id, id)
    toast(`${name} removed`)
  }

  return (
    <div className="text-[13px]">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
        <Paperclip className="h-3 w-3" />Attachments{attachments.length > 0 && ` (${attachments.length})`}
      </div>
      {attachments.length > 0 && (
        <div className="grid gap-1 mb-1.5">
          {attachments.map(a => (
            <div key={a.id} className="flex items-center gap-2 border border-border bg-accent/30 rounded-sm px-2 py-1.5">
              <button className="min-w-0 flex-1 text-left truncate hover:underline" title="Open" onClick={() => openAttachment(a.path, a.name)}>
                {a.name}
              </button>
              <span className="text-[11px] text-muted-foreground shrink-0">{fmtBytes(a.size)}</span>
              <button className="shrink-0 text-muted-foreground hover:text-[hsl(8_60%_41%)]" title="Remove" onClick={() => remove(a.id, a.path, a.name)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {attachmentsAvailable() && cloud ? (
        <>
          <button
            className="inline-flex items-center gap-1.5 text-[12px] border border-dashed border-input rounded-sm px-2 py-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            {uploading ? 'Uploading…' : 'Attach a file'}
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
          <p className="text-[10.5px] text-muted-foreground mt-1">Up to 25MB per file. Only you (and a super-admin, for support) can see them.</p>
        </>
      ) : (
        attachments.length === 0 && <p className="text-[12px] text-muted-foreground italic">Sign in to a real account to attach files.</p>
      )}
    </div>
  )
}

// ---------- Task detail sheet (with per-item history) ----------

export function TaskDetail({ task, onClose, onEdit }: { task: Task | null; onClose: () => void; onEdit: (t: Task) => void }) {
  const { state, completeTask, calledFollowUp, snoozeTask, updateTask, dropTask } = useStore()
  const history = useMemo(() => state.audit.filter(a => a.entityId === task?.id), [state.audit, task])
  if (!task) return null
  const area = state.areas.find(a => a.id === task.areaId)
  const project = state.projects.find(p => p.id === task.projectId)
  const person = state.people.find(p => p.id === task.personId)
  const vendor = state.vendors.find(v => v.id === task.vendorId)
  const kids = subtasksOf(state, task.id)
  const scheme = state.settings.priorityScheme
  const done = task.status === 'done' || task.status === 'dropped'

  return (
    <Dialog open={!!task} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wide">
            {TYPE_LABELS[task.type]} · {STATUS_LABELS[task.status]}
          </div>
          <DialogTitle className="font-display text-xl leading-snug">{task.title}</DialogTitle>
        </DialogHeader>

        {/* One-tap action bar — no digging through menus */}
        {!done && (
          <div className="grid gap-2 border border-border bg-accent/40 rounded-sm p-2.5">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" className="h-7 px-2.5 text-[12px]" onClick={() => {
                const prev = task.status
                completeTask(task.id)
                toast.success('Done — archived', { action: { label: 'Undo', onClick: () => updateTask(task.id, { status: prev, completedAt: undefined }, 'undo complete') }, duration: 6000 })
                onClose()
              }}>
                <Check className="h-3.5 w-3.5 mr-1" />Done
              </Button>
              {(task.type === 'call' || task.personId) && (
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-[12px]" onClick={() => { calledFollowUp(task.id); toast.success(`Call logged — follow-up due ${fmtDate(addDays(today(), state.settings.followUpDays))}`); onClose() }}>
                  <Phone className="h-3 w-3 mr-1" />Called — follow-up
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-[12px]" onClick={() => { snoozeTask(task.id, 1); toast(`Snoozed to tomorrow`) }}>
                <Clock className="h-3 w-3 mr-1" />Tomorrow
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-[12px]" onClick={() => { snoozeTask(task.id, 7); toast(`Snoozed a week`) }}>
                <Clock className="h-3 w-3 mr-1" />Next week
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[12px] text-[hsl(8_60%_41%)]" onClick={() => { dropTask(task.id, 'Dropped from task detail'); toast('Dropped — archived with reason'); onClose() }}>
                Drop
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-0.5">Priority</span>
              {(['P0', 'P1', 'P2', 'P3'] as Priority[]).map(p => (
                <button
                  key={p}
                  onClick={() => updateTask(task.id, { priority: p }, `priority → ${PRIORITY_LABELS[scheme][p]}`)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] border rounded-sm transition-colors',
                    task.priority === p ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-accent',
                  )}
                >
                  {PRIORITY_LABELS[scheme][p]}
                </button>
              ))}
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-2 mr-0.5">Status</span>
              {(['next', 'in-progress', 'waiting'] as TaskStatus[]).map(st => (
                <button
                  key={st}
                  onClick={() => updateTask(task.id, { status: st, waitingSince: st === 'waiting' ? today() : task.waitingSince }, `status → ${STATUS_LABELS[st]}`)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] border rounded-sm transition-colors',
                    task.status === st ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-accent',
                  )}
                >
                  {STATUS_LABELS[st]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-0.5">Move to</span>
              <Select value={task.areaId ?? '__none__'} onValueChange={v => {
                const a = state.areas.find(x => x.id === v)
                updateTask(task.id, { areaId: v === '__none__' ? undefined : v, projectId: undefined }, a ? `moved to ${a.name}` : 'area cleared')
                toast(a ? `Moved to ${a.name}` : 'Area cleared')
              }}>
                <SelectTrigger className="h-7 w-[130px] text-[11.5px] bg-card"><SelectValue placeholder="Area" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No area</SelectItem>
                  {state.areas.filter(a => a.active).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {task.areaId && (
                <Select value={task.projectId ?? '__none__'} onValueChange={v => {
                  const p = state.projects.find(x => x.id === v)
                  updateTask(task.id, { projectId: v === '__none__' ? undefined : v, areaId: p ? p.areaId : task.areaId }, p ? `moved to project ${p.name}` : 'project cleared')
                  toast(p ? `Moved to ${p.name}` : 'No longer tied to a project')
                }}>
                  <SelectTrigger className="h-7 w-[150px] text-[11.5px] bg-card"><SelectValue placeholder="Project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No project</SelectItem>
                    {state.projects.filter(p => p.areaId === task.areaId && (p.status === 'active' || p.status === 'on-hold')).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={task.categoryIds[0] ?? '__none__'} onValueChange={v => {
                const c = state.categories.find(x => x.id === v)
                updateTask(task.id, { categoryIds: v === '__none__' ? [] : [v] }, c ? `re-categorized as ${c.name}` : 'category cleared')
                toast(c ? `Re-categorized as ${c.name}` : 'Category cleared')
              }}>
                <SelectTrigger className="h-7 w-[130px] text-[11.5px] bg-card"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No category</SelectItem>
                  {categoriesForArea(state.categories, task.areaId, task.categoryIds[0]).map(c => <SelectItem key={c.id} value={c.id}>{c.level > 0 ? '› ' : ''}{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <div className="grid gap-2 text-sm">
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
            <span><PriorityChip p={task.priority} /></span>
            {area && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: area.color }} />{area.name}</span>}
            {project && <span className="text-muted-foreground">› {project.name}</span>}
            {task.due && <span>Due <b>{fmtDate(task.due)}</b></span>}
          </div>
          {person && (
            <div className="border border-border bg-accent/40 px-3 py-2 text-[13px]">
              <b>{person.name}</b>{person.phone && <span className="text-muted-foreground"> · {person.phone}</span>}
              {task.callAbout && <div className="text-muted-foreground mt-0.5">About: {task.callAbout}</div>}
            </div>
          )}
          {vendor && <div className="text-[13px] text-muted-foreground">Vendor: <b className="text-foreground">{vendor.name}</b></div>}
          {task.waitingOn && <div className="text-[13px] text-[hsl(28_60%_32%)]">Waiting on {task.waitingOn} since {fmtDate(task.waitingSince)} — auto-nudge active</div>}
          {task.notes && <p className="text-[13px] text-foreground/80 border-l-2 border-border pl-3">{task.notes}</p>}
          {task.droppedReason && <p className="text-[13px] text-muted-foreground italic">Dropped: {task.droppedReason}</p>}
          <TaskAttachments task={task} />
          {kids.length > 0 && (
            <div className="text-[13px]">
              <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1">Subtasks</div>
              {kids.map(k => (
                <div key={k.id} className="flex items-center gap-2 py-0.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', k.status === 'done' ? 'bg-primary' : 'bg-border')} />
                  <span className={cn(k.status === 'done' && 'line-through text-muted-foreground')}>{k.title}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-1">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1.5">History (audit trail)</div>
            <div className="border-t border-border">
              <div className="flex gap-2 py-1.5 border-b border-border/60 text-[12px]">
                <span className="text-muted-foreground tabular shrink-0 w-[74px]">{fmtDate(task.created)}</span>
                <span><b>Craig</b> created · source: {task.source}</span>
              </div>
              {history.map(h => (
                <div key={h.id} className="flex gap-2 py-1.5 border-b border-border/60 text-[12px]">
                  <span className="text-muted-foreground tabular shrink-0 w-[74px]">{h.ts.slice(5, 10)}</span>
                  <span><b>{h.user}</b> {h.action} — {h.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); onEdit(task) }}>Edit</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
