import React, { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, Check, ChevronDown, ChevronRight, Clock, Copy, ExternalLink, Loader2, MoreHorizontal, Paperclip, Phone, Send, Timer, Trash2, User } from 'lucide-react'
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
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Priority, PRIORITY_DESC, PRIORITY_LABELS, STATUS_LABELS, Task, TaskStatus, TaskType, TYPE_LABELS, fmtDate, today, addDays, daysSince,
} from '@/lib/model'
import {
  actionUsage, areaUsage, categoriesForArea, categoryUsage, projectUsage, rollup, subtasksOf, useStore, vendorUsage, withPopularFirst,
} from '@/lib/store'
import { useCloud } from '@/lib/cloud'
import { attachmentsAvailable, deleteAttachmentFile, fmtBytes, getAttachmentUrl, uploadAttachment } from '@/lib/attachments'
import { AreaDot, DueChip, PriorityChip } from './bits'

// ---------- Quick add — one line, Enter, done. Usable on any screen ----------

export function QuickAdd({ areaId: fixedAreaId, due, projectId: fixedProjectId, placeholder }: { areaId?: string; due?: string; projectId?: string; placeholder?: string }) {
  const { state, addTask } = useStore()
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Area/project pick right inline — only shown for whichever level isn't already fixed by the caller,
  // so a task never has to be filed "blind" and re-sorted later.
  const [pickedAreaId, setPickedAreaId] = useState('')
  const [pickedProjectId, setPickedProjectId] = useState('')
  const [pickedCategoryId, setPickedCategoryId] = useState('')
  const [pickedActionId, setPickedActionId] = useState('')
  const areaId = fixedAreaId ?? (pickedAreaId || undefined)
  const area = state.areas.find(a => a.id === areaId)
  const projectsInArea = areaId ? state.projects.filter(p => p.areaId === areaId && (p.status === 'active' || p.status === 'on-hold')) : []
  const projectId = fixedProjectId ?? (pickedProjectId || undefined)
  const areaOptionsBase = withPopularFirst(state.areas.filter(a => a.active), a => areaUsage(state, a.id), a => a.name)
  const projectOptionsBase = withPopularFirst(projectsInArea, p => projectUsage(state, p.id), p => p.name)
  const categoryOptionsBase = withPopularFirst(
    categoriesForArea(state.categories, areaId, pickedCategoryId), c => categoryUsage(state, c.id), c => c.name,
  )
  const actionOptionsBase = withPopularFirst(state.actions.filter(a => a.active), a => actionUsage(state, a.id), a => a.name)

  function add() {
    // Never a silent no-op: an empty box focuses the field and says so, rather than "doing nothing".
    if (!text.trim()) { toast('Type a task first, then Add'); inputRef.current?.focus(); return }
    addTask({
      title: text.trim(), areaId, projectId, due, priority: due === today() ? 'P1' : 'P2', status: 'next', type: 'todo', source: 'manual',
      categoryIds: pickedCategoryId ? [pickedCategoryId] : [],
      actionIds: pickedActionId ? [pickedActionId] : undefined,
    })
    const project = state.projects.find(p => p.id === projectId)
    toast.success(project ? `Added to ${project.name}` : area ? `Added to ${area.name}` : due === today() ? 'Added to today' : 'Task added')
    setText('')
    if (!fixedAreaId) setPickedAreaId('')
    if (!fixedProjectId) setPickedProjectId('')
    setPickedCategoryId('')
    setPickedActionId('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-1.5 border-b border-dashed border-border/70 bg-background/40 focus-within:bg-background">
      <span className="text-muted-foreground text-[15px] leading-none shrink-0">+</span>
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && add()}
        placeholder={placeholder ?? (area ? `Quick add to ${area.name} — type and press Enter` : 'Quick add a task — type and press Enter')}
        className="flex-1 min-w-[140px] h-8 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
      />
      {!fixedAreaId && (
        <SearchableSelect
          value={pickedAreaId || '__none__'}
          onValueChange={v => { setPickedAreaId(v === '__none__' ? '' : v); setPickedProjectId('') }}
          options={[{ value: '__none__', label: 'No area' }, ...areaOptionsBase.ordered.map(a => ({ value: a.id, label: a.name }))]}
          popularCount={areaOptionsBase.popularCount > 0 ? areaOptionsBase.popularCount + 1 : 0}
          placeholder="Area" searchPlaceholder="Search areas…"
          className="h-7 w-[112px] text-[11.5px] bg-card shrink-0"
        />
      )}
      {!fixedProjectId && areaId && projectsInArea.length > 0 && (
        <SearchableSelect
          value={pickedProjectId || '__none__'}
          onValueChange={v => setPickedProjectId(v === '__none__' ? '' : v)}
          options={[{ value: '__none__', label: 'No project' }, ...projectOptionsBase.ordered.map(p => ({ value: p.id, label: p.name }))]}
          popularCount={projectOptionsBase.popularCount > 0 ? projectOptionsBase.popularCount + 1 : 0}
          placeholder="Project" searchPlaceholder="Search projects…"
          className="h-7 w-[128px] text-[11.5px] bg-card shrink-0"
        />
      )}
      <SearchableSelect
        value={pickedCategoryId || '__none__'}
        onValueChange={v => setPickedCategoryId(v === '__none__' ? '' : v)}
        options={[{ value: '__none__', label: 'No category' }, ...categoryOptionsBase.ordered.map(c => ({ value: c.id, label: `${c.level > 0 ? '› ' : ''}${c.name}` }))]}
        popularCount={categoryOptionsBase.popularCount > 0 ? categoryOptionsBase.popularCount + 1 : 0}
        placeholder="Category" searchPlaceholder="Search categories…"
        className="h-7 w-[112px] text-[11.5px] bg-card shrink-0"
      />
      <SearchableSelect
        value={pickedActionId || '__none__'}
        onValueChange={v => setPickedActionId(v === '__none__' ? '' : v)}
        options={[{ value: '__none__', label: 'No action' }, ...actionOptionsBase.ordered.map(a => ({ value: a.id, label: a.name }))]}
        popularCount={actionOptionsBase.popularCount > 0 ? actionOptionsBase.popularCount + 1 : 0}
        placeholder="Action" searchPlaceholder="Search actions…"
        className="h-7 w-[104px] text-[11.5px] bg-card shrink-0"
      />
      <button onClick={add} className="h-7 px-2.5 text-[11.5px] border border-input rounded-sm bg-card hover:bg-accent shrink-0">Add</button>
    </div>
  )
}

// ---------- Task row with quick actions ----------

export function TaskRow({ task, showArea = true, depth = 0, onOpen, expandAll, selected, onToggleSelect, note }: {
  task: Task
  showArea?: boolean
  depth?: number
  onOpen: (t: Task) => void
  expandAll?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
  // Optional "why is this here" chip — used by the Attention list to say, on the row itself,
  // exactly why the task is flagged (e.g. "overdue 3d" or "waiting 7d").
  note?: { text: string; tone: 'overdue' | 'waiting' }
}) {
  const { state, completeTask, snoozeTask, calledFollowUp, updateTask, dropTask, deleteTask, reinsertTasks } = useStore()
  const [localExp, setLocalExp] = useState<boolean | null>(null)
  // null = the "pick a date" dialog is closed; a date string = open, pre-filled with that value.
  const [pickDate, setPickDate] = useState<string | null>(null)
  // null = the "pick a time" dialog is closed; a 'HH:MM' string (or '') = open.
  const [pickTime, setPickTime] = useState<string | null>(null)
  // null = the "set estimate" dialog is closed; a number-as-string = open.
  const [pickEst, setPickEst] = useState<string | null>(null)
  // the contact-assign dialog (reuses ContactPicker's search + quick-add + dedupe).
  const [contactOpen, setContactOpen] = useState(false)
  React.useEffect(() => { setLocalExp(null) }, [expandAll])
  const expanded = localExp ?? expandAll ?? false
  const setExpanded = (fn: (v: boolean) => boolean) => setLocalExp(fn(expanded))
  const kids = subtasksOf(state, task.id)
  const roll = kids.length ? rollup(state, task.id) : null
  const person = state.people.find(p => p.id === task.personId)
  const project = state.projects.find(p => p.id === task.projectId)
  const category = state.categories.find(c => task.categoryIds.includes(c.id))
  const qa = state.settings.quickActions
  const done = task.status === 'done' || task.status === 'dropped'

  // Permanent delete — removes the task (and its subtasks) from the list entirely, with a short
  // Undo window so an accidental delete is recoverable. This is what actually clears items out of
  // Accomplished, unlike Drop/Done which only archive them.
  function doDelete() {
    const removed = deleteTask(task.id)
    toast('Deleted permanently', {
      description: task.title,
      action: { label: 'Undo', onClick: () => reinsertTasks(removed) },
      duration: 6000,
    })
  }

  // Set a quick estimate (minutes). Clearing passes undefined.
  function applyEst(n: number | undefined) {
    updateTask(task.id, { estMinutes: n }, n ? `est → ${n}m` : 'estimate cleared')
    toast(n ? `Est. ${n} min` : 'Estimate cleared')
  }

  // Set a start time so the task lands on the Calendar Day timeline. A time only shows on the
  // calendar if the task also has a due date, so if there isn't one we set it to today — that's
  // the "if a date, add time, so it goes on the calendar" behaviour. Clearing passes undefined.
  function applyTime(t: string | undefined) {
    if (!t) { updateTask(task.id, { startTime: undefined }, 'start time cleared'); toast('Start time cleared'); return }
    if (task.due) {
      updateTask(task.id, { startTime: t }, `start time → ${t}`)
      toast.success(`Time set to ${t} — now on the calendar`)
    } else {
      updateTask(task.id, { startTime: t, due: today() }, `start time → ${t} (due today)`)
      toast.success(`Time ${t} · due today — added to the calendar`)
    }
  }

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
        {/* bulk-select checkbox */}
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            onChange={() => onToggleSelect(task.id)}
            className="h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))] cursor-pointer"
          />
        )}

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
            {task.shared?.status === 'pending' && <Send className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Shared — awaiting response" />}
            {roll && (
              <span className="shrink-0 text-[10.5px] tabular text-muted-foreground border border-border rounded-sm px-1 py-px">
                {roll.done}/{roll.total}{roll.overdue > 0 && <span className="text-[hsl(8_60%_41%)]"> · {roll.overdue} late</span>}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {showArea && <AreaDot areaId={task.areaId} withName />}
            {category && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: category.color || 'hsl(215 20% 65%)' }} />
                {category.name}
              </span>
            )}
            {project && <span className="text-[11px] text-muted-foreground truncate">› {project.name}</span>}
            {person && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{person.name}</span>}
            {task.status === 'waiting' && task.waitingOn && (
              <span className="text-[11px] text-[hsl(28_60%_32%)]">waiting on {task.waitingOn} · {daysSince(task.waitingSince ?? task.created)}d</span>
            )}
          </div>
        </button>

        {note && (
          <span
            className={cn(
              'shrink-0 rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap',
              note.tone === 'overdue'
                ? 'bg-[hsl(8_60%_41%_/_0.12)] text-[hsl(8_60%_38%)] border border-[hsl(8_50%_60%)]'
                : 'bg-[hsl(35_70%_88%)] text-[hsl(28_60%_28%)] border border-[hsl(35_50%_70%)]',
            )}
          >
            {note.text}
          </span>
        )}
        <DueChip due={task.due} />
        <PriorityChip p={task.priority} />

        {/* one-tap quick actions — reschedule / delete without opening the menu */}
        {!done && (
          <div className="hidden sm:inline-flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button title="Move to Today" onClick={e => { e.stopPropagation(); updateTask(task.id, { due: today() }, 'due → Today'); toast.success('Moved to Today') }} className="h-6 px-1.5 text-[10.5px] rounded-sm border border-border bg-background hover:bg-accent text-muted-foreground hover:text-foreground">Today</button>
            <button title="Move to Tomorrow" onClick={e => { e.stopPropagation(); updateTask(task.id, { due: addDays(today(), 1) }, 'due → Tomorrow'); toast.success('Moved to Tomorrow') }} className="h-6 px-1.5 text-[10.5px] rounded-sm border border-border bg-background hover:bg-accent text-muted-foreground hover:text-foreground">Tmrw</button>
            <button title="Delete permanently (undo available)" onClick={e => { e.stopPropagation(); doDelete() }} className="h-6 w-6 grid place-items-center rounded-sm border border-border bg-background hover:bg-[hsl(8_60%_41%_/_0.1)] text-muted-foreground hover:text-[hsl(8_60%_41%)]"><Trash2 className="h-3 w-3" /></button>
          </div>
        )}

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
                  <DropdownMenuSubTrigger>Schedule / set due</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {[0, 1, 2, 7].map(d => (
                      <DropdownMenuItem key={d} onClick={() => { snoozeTask(task.id, d); toast(d === 0 ? 'Due today — now on Today' : `Due ${fmtDate(addDays(today(), d))}`) }}>
                        {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === 2 ? 'In 2 days' : 'Next week'}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onClick={() => setPickDate(task.due ?? today())}>
                      <CalendarDays className="h-3.5 w-3.5 mr-2" />Pick a date…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { updateTask(task.id, { due: undefined }, 'due date cleared'); toast('Due date cleared') }}>
                      <span className="text-muted-foreground">Clear due date</span>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {/* Add a start time → puts the task on the Calendar Day timeline (needs a due date,
                  which we set to today if missing). */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><Clock className="h-3.5 w-3.5 mr-2" />Set time (calendar)</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map(t => (
                    <DropdownMenuItem key={t} onClick={() => applyTime(t)}>
                      {t}{task.startTime === t && <Check className="h-3.5 w-3.5 ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPickTime(task.startTime ?? '09:00')}>
                    <Clock className="h-3.5 w-3.5 mr-2" />Pick a time…
                  </DropdownMenuItem>
                  {task.startTime && (
                    <DropdownMenuItem onClick={() => applyTime(undefined)}>
                      <span className="text-muted-foreground">Clear time</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Estimated time (minutes) — drives the calendar block height too. */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><Timer className="h-3.5 w-3.5 mr-2" />Est. time</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {[15, 30, 45, 60, 90, 120].map(n => (
                    <DropdownMenuItem key={n} onClick={() => applyEst(n)}>
                      {n < 60 ? `${n} min` : n === 60 ? '1 hr' : `${n / 60} hr`}{task.estMinutes === n && <Check className="h-3.5 w-3.5 ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPickEst(String(task.estMinutes ?? 30))}>
                    <Timer className="h-3.5 w-3.5 mr-2" />Custom…
                  </DropdownMenuItem>
                  {task.estMinutes != null && (
                    <DropdownMenuItem onClick={() => applyEst(undefined)}>
                      <span className="text-muted-foreground">Clear estimate</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Link a contact (person). Opens a small dialog so it can search + quick-add + dedupe. */}
              <DropdownMenuItem onSelect={e => { e.preventDefault(); setContactOpen(true) }}>
                <User className="h-3.5 w-3.5 mr-2" />{person ? `Contact: ${person.name}` : 'Add contact'}
              </DropdownMenuItem>

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
              {qa.reassign && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Reassign action</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                    <DropdownMenuItem onClick={() => { updateTask(task.id, { actionIds: [] }, 'action cleared'); toast('Action cleared') }}>
                      <span className="text-muted-foreground">No action</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {state.actions.filter(a => a.active).map(a => (
                      <DropdownMenuItem key={a.id} onClick={() => { updateTask(task.id, { actionIds: [a.id] }, `action → ${a.name}`); toast.success(`Action set to ${a.name}`) }}>
                        {a.color && <span className="h-2 w-2 rounded-full mr-2 shrink-0" style={{ background: a.color }} />}
                        <span className="truncate">{a.name}</span>
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
              <DropdownMenuItem className="text-[hsl(8_60%_41%)]" onClick={doDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-2" />Delete permanently
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Archived rows (done / dropped) hide the quick-actions menu, so they get a direct
            trash button — this is how you clear items out of Accomplished for good. */}
        {done && (
          <button
            aria-label="Delete permanently"
            title="Delete permanently"
            onClick={doDelete}
            className="h-7 w-7 grid place-items-center shrink-0 rounded-sm text-muted-foreground opacity-30 group-hover:opacity-100 hover:text-[hsl(8_60%_41%)] hover:bg-[hsl(8_60%_41%_/_0.08)] transition-all"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {expanded && kids.map(k => <TaskRow key={k.id} task={k} showArea={false} depth={depth + 1} onOpen={onOpen} />)}

      {/* "Pick a date" calendar picker — opened from the Schedule / set due menu. A dialog rather
          than an in-menu field, because a native date input's calendar pop-up would dismiss the
          menu. The native date input gives the OS/browser calendar picker. */}
      {pickDate !== null && (
        <Dialog open onOpenChange={o => { if (!o) setPickDate(null) }}>
          <DialogContent className="sm:max-w-[340px]">
            <DialogHeader>
              <DialogTitle className="font-display text-base">Set due date</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-2">
              <Label className="text-xs">Due date</Label>
              <Input type="date" value={pickDate} autoFocus onChange={e => setPickDate(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Due today or earlier shows on <b>Today</b>; anything within the next 7 days shows on <b>This Week</b>.</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPickDate(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  updateTask(task.id, { due: pickDate || undefined }, pickDate ? `due set to ${pickDate}` : 'due date cleared')
                  toast.success(pickDate ? `Due ${fmtDate(pickDate)}` : 'Due date cleared')
                  setPickDate(null)
                }}
              >
                Set date
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* "Pick a time" — arbitrary start time. Setting one puts the task on the Calendar Day view
          (adding a due date of today if it has none). */}
      {pickTime !== null && (
        <Dialog open onOpenChange={o => { if (!o) setPickTime(null) }}>
          <DialogContent className="sm:max-w-[340px]">
            <DialogHeader>
              <DialogTitle className="font-display text-base">Set start time</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-2">
              <Label className="text-xs">Start time</Label>
              <Input type="time" value={pickTime} autoFocus onChange={e => setPickTime(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">A task with a time shows as a block on the <b>Calendar → Day</b> view. {task.due ? null : <>It has no due date, so it will be scheduled for <b>today</b>.</>}</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPickTime(null)}>Cancel</Button>
              <Button onClick={() => { applyTime(pickTime || undefined); setPickTime(null) }}>Set time</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* "Custom estimate" — arbitrary minutes. Also drives the calendar block height. */}
      {pickEst !== null && (
        <Dialog open onOpenChange={o => { if (!o) setPickEst(null) }}>
          <DialogContent className="sm:max-w-[340px]">
            <DialogHeader>
              <DialogTitle className="font-display text-base">Estimated time</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-2">
              <Label className="text-xs">Minutes</Label>
              <Input type="number" min={0} step={5} value={pickEst} autoFocus onChange={e => setPickEst(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPickEst(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  const n = Math.max(0, Math.round(Number(pickEst)))
                  applyEst(pickEst.trim() === '' || Number.isNaN(n) || n === 0 ? undefined : n)
                  setPickEst(null)
                }}
              >
                Set estimate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* "Add contact" — assign / quick-add a person, reusing ContactPicker's search + dedupe. */}
      {contactOpen && (
        <Dialog open onOpenChange={o => { if (!o) setContactOpen(false) }}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="font-display text-base">Contact / assign person</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-2">
              <Label className="text-xs">Contact</Label>
              <ContactPicker value={task.personId} onChange={id => updateTask(task.id, { personId: id }, id ? 'contact linked' : 'contact removed')} />
              <p className="text-[11px] text-muted-foreground">Search existing contacts or type a new name to add one — it's saved under Contacts (People).</p>
            </div>
            <DialogFooter>
              <Button onClick={() => setContactOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// ---------- Add / edit task dialog (type-dependent fields) ----------

// A contact picker that (a) searches existing People, (b) links one to the task, and (c) lets you
// QUICK-ADD a brand-new contact by typing a name — which is saved into People (marked "Added from a
// task" so it's easy to tell apart from imported contacts) and linked in one step. Before creating,
// it checks for an existing same-name contact and links that instead, so you never get a duplicate.
function ContactPicker({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  const { state, addPerson } = useStore()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const selected = state.people.find(p => p.id === value)
  const ql = q.trim().toLowerCase()
  const matches = (ql
    ? state.people.filter(p => p.name.toLowerCase().includes(ql) || (p.phone ?? '').includes(ql) || (p.email ?? '').toLowerCase().includes(ql))
    : state.people
  ).slice(0, 8)
  const exact = state.people.find(p => p.name.trim().toLowerCase() === ql)
  const canCreate = ql.length >= 2 && !exact

  const choose = (id?: string) => { onChange(id); setOpen(false); setQ('') }
  function createContact() {
    const name = q.trim()
    if (!name) return
    // Duplicate guard: same-name contact already exists → link it instead of making a second one.
    const dupe = state.people.find(p => p.name.trim().toLowerCase() === name.toLowerCase())
    if (dupe) { choose(dupe.id); toast(`Linked existing contact “${dupe.name}”`); return }
    const p = addPerson({ name, how: 'Added from a task' })
    choose(p.id)
    toast.success(`Added “${p.name}” to Contacts (People)`)
  }

  return (
    <div className="relative">
      {selected && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-9 w-full flex items-center justify-between border border-input rounded-sm bg-card px-3 text-[13px] text-left hover:border-primary"
        >
          <span className="inline-flex items-center gap-1.5 truncate"><User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />{selected.name}</span>
          <span onClick={e => { e.stopPropagation(); choose(undefined) }} className="text-[11px] text-muted-foreground hover:text-foreground shrink-0">clear</span>
        </button>
      ) : (
        <Input
          autoFocus={open}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search a contact, or type a new name…"
          className="h-9"
        />
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-card shadow-lg text-[13px]">
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-accent text-muted-foreground" onMouseDown={e => { e.preventDefault(); choose(undefined) }}>No contact</button>
          {matches.map(p => (
            <button key={p.id} type="button" className="w-full text-left px-3 py-1.5 hover:bg-accent" onMouseDown={e => { e.preventDefault(); choose(p.id) }}>
              {p.name}{p.phone && <span className="text-muted-foreground text-[11px]"> · {p.phone}</span>}
            </button>
          ))}
          {matches.length === 0 && !canCreate && <div className="px-3 py-1.5 text-muted-foreground italic">Type a name to add a new contact</div>}
          {canCreate && (
            <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-accent text-[hsl(17_63%_47%)] border-t border-border" onMouseDown={e => { e.preventDefault(); createContact() }}>
              + Add “{q.trim()}” as a new contact
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function TaskDialog({ open, onClose, task, defaults }: {
  open: boolean
  onClose: () => void
  task?: Task | null
  defaults?: Partial<Task>
}) {
  const { state, addTask, updateTask, addProject } = useStore()
  const editing = !!task
  const [form, setForm] = useState<Partial<Task>>({})
  const f = { type: 'todo' as TaskType, priority: 'P2' as Priority, ...(task ?? defaults ?? {}), ...form }
  const set = (patch: Partial<Task>) => setForm(x => ({ ...x, ...patch }))
  const scheme = state.settings.priorityScheme

  const projects = state.projects.filter(p => p.status === 'active' && (!f.areaId || p.areaId === f.areaId))
  const mainCats = categoriesForArea(state.categories, f.areaId, f.categoryIds?.[0])
  const activeActions = state.actions.filter(a => a.active || a.id === f.actionIds?.[0])
  const areaOptionsBase = withPopularFirst(state.areas.filter(a => a.active), a => areaUsage(state, a.id), a => a.name)
  const projectOptionsBase = withPopularFirst(projects, p => projectUsage(state, p.id), p => p.name)
  const categoryOptionsBase = withPopularFirst(mainCats, c => categoryUsage(state, c.id), c => c.name)
  const vendorOptionsBase = withPopularFirst(state.vendors, v => vendorUsage(state, v.id), v => v.name)
  const actionOptionsBase = withPopularFirst(activeActions, a => actionUsage(state, a.id), a => a.name)

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

  // Inline project creation — type a new name in the Project picker and it's saved under the
  // chosen Area (and immediately selected). A project must belong to an Area, so we require one.
  const createProject = (name: string) => {
    if (!f.areaId) { toast.error('Pick an Area first, then add the project'); return }
    const proj = addProject({ name, areaId: f.areaId })
    set({ projectId: proj.id })
    toast.success(`Project “${proj.name}” created`)
  }

  const areaColor = (id?: string) => state.areas.find(a => a.id === id)?.color
  const selectedArea = state.areas.find(a => a.id === f.areaId)

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setForm({}); onClose() } }}>
      <DialogContent className="sm:max-w-[720px] max-h-[92vh] overflow-y-auto p-0 gap-0">
        {/* Coloured header band — sets the tone and hosts the type segmented-control */}
        <div className="bg-gradient-to-br from-[hsl(var(--primary)/0.12)] to-[hsl(var(--primary)/0.03)] border-b border-border px-6 pt-5 pb-4">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="font-display text-2xl tracking-tight">{editing ? 'Edit task' : 'New task'}</DialogTitle>
            <p className="text-[12.5px] text-muted-foreground">Fill in as much or as little as you like — only a title is required.</p>
          </DialogHeader>
          <div className="mt-3.5 inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
            {(Object.keys(TYPE_LABELS) as TaskType[]).map(tt => (
              <button
                key={tt}
                onClick={() => set({ type: tt })}
                className={cn(
                  'px-4 py-1.5 text-[12.5px] font-medium rounded-md transition-all',
                  f.type === tt ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                {TYPE_LABELS[tt]}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 gap-5">
          {/* ---- Section: What & who ---- */}
          <section className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-1.5">
              <Label className="text-[12px] font-semibold text-foreground/80">Title</Label>
              <Input value={f.title ?? ''} onChange={e => set({ title: e.target.value })} placeholder={f.type === 'call' ? 'Call Malka about the headcount…' : 'Book the hall…'} className="h-10 text-[14px]" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label className="text-[12px] font-semibold text-foreground/80">Contact person <span className="font-normal text-muted-foreground">— optional, type a new name to add them</span></Label>
              <ContactPicker value={f.personId} onChange={id => set({ personId: id })} />
            </div>
            {f.type === 'call' && (
              <div className="grid grid-cols-1 gap-1.5">
                <Label className="text-[12px] font-semibold text-foreground/80">What this call is about</Label>
                <Input value={f.callAbout ?? ''} onChange={e => set({ callAbout: e.target.value })} placeholder="Final headcount and dietary list" />
              </div>
            )}
          </section>

          {/* ---- Section: Where it lives ---- */}
          <section className="rounded-lg border border-border bg-muted/30 p-4 grid grid-cols-1 gap-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Where it lives</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid grid-cols-1 gap-1.5">
                <Label className="text-[12px] font-semibold text-foreground/80">Area</Label>
                <SearchableSelect
                  value={f.areaId ?? ''}
                  onValueChange={v => set({ areaId: v || undefined, projectId: undefined })}
                  options={[{ value: '', label: 'No area' }, ...areaOptionsBase.ordered.map(a => ({ value: a.id, label: a.name, color: a.color }))]}
                  popularCount={areaOptionsBase.popularCount > 0 ? areaOptionsBase.popularCount + 1 : 0}
                  placeholder="Choose an area" searchPlaceholder="Search areas…"
                />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <Label className="text-[12px] font-semibold text-foreground/80">Project <span className="font-normal text-muted-foreground">— optional</span></Label>
                <SearchableSelect
                  value={f.projectId ?? 'none'}
                  onValueChange={v => set({ projectId: v === 'none' ? undefined : v })}
                  options={[{ value: 'none', label: 'None — loose one-off' }, ...projectOptionsBase.ordered.map(p => ({ value: p.id, label: p.name, color: areaColor(p.areaId) }))]}
                  popularCount={projectOptionsBase.popularCount}
                  placeholder="None — loose one-off" searchPlaceholder="Search or type to add…"
                  onCreate={createProject}
                  createLabel={q => `Add project “${q}”${selectedArea ? ` in ${selectedArea.name}` : ''}`}
                />
              </div>
            </div>
          </section>

          {/* ---- Section: When ---- */}
          <section className="grid grid-cols-1 gap-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">When &amp; how big</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="grid grid-cols-1 gap-1.5">
                <Label className="text-[12px] font-semibold text-foreground/80">Priority</Label>
                <Select value={f.priority} onValueChange={v => set({ priority: v as Priority })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['P0', 'P1', 'P2', 'P3'] as Priority[]).map(p => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABELS[scheme][p]} — {PRIORITY_DESC[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <Label className="text-[12px] font-semibold text-foreground/80">{f.type === 'followup' ? `Due (+${state.settings.followUpDays}d)` : 'Due date'}</Label>
                <Input type="date" value={f.due ?? (f.type === 'followup' ? addDays(today(), state.settings.followUpDays) : '')} onChange={e => set({ due: e.target.value || undefined })} className="h-9" />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <Label className="text-[12px] font-semibold text-foreground/80">Time <span className="font-normal text-muted-foreground">(day)</span></Label>
                <Input type="time" value={f.startTime ?? ''} onChange={e => set({ startTime: e.target.value || undefined })} className="h-9" />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <Label className="text-[12px] font-semibold text-foreground/80">Est. <span className="font-normal text-muted-foreground">(min)</span></Label>
                <Input
                  type="number" min={0} step={5} inputMode="numeric"
                  value={f.estMinutes ?? ''}
                  onChange={e => set({ estMinutes: e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value))) })}
                  placeholder="30" className="h-9"
                />
              </div>
            </div>
          </section>

          {/* ---- Section: Classify ---- */}
          <section className="grid grid-cols-1 gap-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Classify</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {f.type === 'todo' && (
                <div className="grid grid-cols-1 gap-1.5">
                  <Label className="text-[12px] font-semibold text-foreground/80">Category</Label>
                  <SearchableSelect
                    value={f.categoryIds?.[0] ?? 'none'}
                    onValueChange={v => set({ categoryIds: v === 'none' ? [] : [v] })}
                    options={[{ value: 'none', label: 'None' }, ...categoryOptionsBase.ordered.map(c => ({ value: c.id, label: `${c.level > 0 ? '› ' : ''}${c.name}`, color: c.color }))]}
                    popularCount={categoryOptionsBase.popularCount > 0 ? categoryOptionsBase.popularCount + 1 : 0}
                    placeholder="None" searchPlaceholder="Search categories…"
                  />
                </div>
              )}
              {f.type === 'todo' && (
                <div className="grid grid-cols-1 gap-1.5">
                  <Label className="text-[12px] font-semibold text-foreground/80">Vendor <span className="font-normal text-muted-foreground">— optional</span></Label>
                  <SearchableSelect
                    value={f.vendorId ?? 'none'}
                    onValueChange={v => set({ vendorId: v === 'none' ? undefined : v })}
                    options={[{ value: 'none', label: 'None' }, ...vendorOptionsBase.ordered.map(v => ({ value: v.id, label: v.name }))]}
                    popularCount={vendorOptionsBase.popularCount > 0 ? vendorOptionsBase.popularCount + 1 : 0}
                    placeholder="None" searchPlaceholder="Search vendors…"
                  />
                </div>
              )}
              <div className="grid grid-cols-1 gap-1.5">
                <Label className="text-[12px] font-semibold text-foreground/80">Action <span className="font-normal text-muted-foreground">— optional</span></Label>
                <SearchableSelect
                  value={f.actionIds?.[0] ?? 'none'}
                  onValueChange={v => set({ actionIds: v === 'none' ? [] : [v] })}
                  options={[{ value: 'none', label: 'None' }, ...actionOptionsBase.ordered.map(a => ({ value: a.id, label: a.name, color: a.color }))]}
                  popularCount={actionOptionsBase.popularCount > 0 ? actionOptionsBase.popularCount + 1 : 0}
                  placeholder="None" searchPlaceholder="Search actions…"
                />
              </div>
            </div>
          </section>

          {/* ---- Section: Notes ---- */}
          <section className="grid grid-cols-1 gap-1.5">
            <Label className="text-[12px] font-semibold text-foreground/80">Notes</Label>
            <Textarea rows={2} value={f.notes ?? ''} onChange={e => set({ notes: e.target.value })} placeholder="Anything worth remembering…" />
          </section>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} className="px-5">{editing ? 'Save changes' : 'Add task'}</Button>
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
        <div className="grid grid-cols-1 gap-1 mb-1.5">
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

// ---------- Delegate a task: a public, no-login link — "share it, get it back" ----------

function TaskShare({ task }: { task: Task }) {
  const cloud = useCloud()
  const { state, updateTask } = useStore()
  const [creating, setCreating] = useState(false)
  // Prefilled from the contact the task is already against, if there is one.
  const [recipient, setRecipient] = useState(
    () => task.shared?.sharedWith ?? state.people.find(p => p.id === task.personId)?.name ?? '',
  )

  // A share is only useful while the task isn't done yet; once it's confirmed via the link (or
  // finished any other way), there's nothing left to share.
  if (task.status === 'done' || task.status === 'dropped') return null
  if (!cloud) return <p className="text-[12px] text-muted-foreground italic">Sign in to a real account to share a task by link.</p>

  const shared = task.shared
  const shareUrl = shared ? `${window.location.origin}/share/${shared.token}` : null

  async function createLink() {
    if (!cloud) return
    const name = recipient.trim()
    if (!name) { toast.error('Who are you sharing this with?'); return }
    setCreating(true)
    const { token, error } = await cloud.shareTask({ id: task.id, title: task.title, notes: task.notes, due: task.due })
    setCreating(false)
    if (error || !token) { toast.error(error ?? 'Could not create a share link'); return }
    // Match the name against People so the share links to a real contact where one exists —
    // that's what lets their card show what's outstanding with them.
    const match = state.people.find(p => p.name.toLowerCase() === name.toLowerCase())
    updateTask(
      task.id,
      {
        shared: {
          token,
          status: 'pending',
          createdAt: new Date().toISOString(),
          sharedWith: name,
          sharedPersonId: match?.id,
        },
        // link the task to the contact too, so it shows on their card
        personId: task.personId ?? match?.id,
      },
      `shared with ${name}`,
    )
    toast.success(`Link created for ${name} — copy it across`)
  }

  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    toast.success('Link copied')
  }

  return (
    <div className="text-[13px] border border-border bg-accent/30 rounded-sm p-2.5">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
        <Send className="h-3 w-3" />Share this task
      </div>
      {!shared ? (
        <>
          <p className="text-[12px] text-muted-foreground mb-1.5">
            Get a link you can text, email, or WhatsApp to anyone — no Daybook account needed on their end. They see just this task, with a "Mark as done" button; when they click it, it comes back here as done automatically.
          </p>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Input
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="Who are you sharing it with?"
              list="daybook-share-people"
              className="h-7 text-[12px]"
            />
            <datalist id="daybook-share-people">
              {state.people.map(p => <option key={p.id} value={p.name} />)}
            </datalist>
          </div>
          <Button size="sm" className="h-7 px-2.5 text-[12px]" disabled={creating} onClick={createLink}>
            {creating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            {creating ? 'Creating…' : 'Create share link'}
          </Button>
        </>
      ) : shared.status === 'done' ? (
        <p className="text-[12.5px] text-[hsl(152_35%_30%)]">
          <Check className="h-3.5 w-3.5 inline mr-1" />
          {shared.sharedWith ? `${shared.sharedWith} marked it done` : 'Confirmed done via shared link'}
          {shared.respondedAt ? ` on ${fmtDate(shared.respondedAt.slice(0, 10))}` : ''}.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5">
          <p className="text-[12px] text-muted-foreground">
            {shared.sharedWith
              ? `Sent to ${shared.sharedWith} — waiting for them to mark it done.`
              : 'Sent — waiting for them to mark it done.'}
          </p>
          <div className="flex items-center gap-1.5">
            <code className="flex-1 min-w-0 truncate border border-border bg-card rounded-sm px-2 py-1 text-[11.5px]">{shareUrl}</code>
            <Button size="sm" variant="outline" className="h-7 px-2 shrink-0" onClick={copyLink} title="Copy link"><Copy className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="outline" className="h-7 px-2 shrink-0" onClick={() => shareUrl && window.open(shareUrl, '_blank', 'noopener')} title="Open in new tab"><ExternalLink className="h-3.5 w-3.5" /></Button>
          </div>
          <button className="text-[11px] text-muted-foreground hover:text-foreground text-left" disabled={creating} onClick={createLink}>
            Create a new link instead
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Task detail sheet (with per-item history) ----------

export function TaskDetail({ task: taskProp, onClose, onEdit }: { task: Task | null; onClose: () => void; onEdit: (t: Task) => void }) {
  const { state, completeTask, calledFollowUp, snoozeTask, updateTask, dropTask, noteTask, addProject } = useStore()
  // Always read the LIVE task from the store — the `task` passed in is a snapshot from when the
  // panel opened, so without this, changes made here (Type, Priority, Status, Move-to) wouldn't
  // visibly update the buttons/labels until the panel was closed and reopened.
  const task = taskProp ? (state.tasks.find(t => t.id === taskProp.id) ?? taskProp) : null
  const history = useMemo(() => state.audit.filter(a => a.entityId === task?.id), [state.audit, task])
  const [note, setNote] = useState('')
  // "Log & follow up" panel — capture what you just did, then roll THIS task forward into a
  // waiting follow-up (new due date), keeping it one task with the whole story in its timeline.
  const [logOpen, setLogOpen] = useState(false)
  const [logNote, setLogNote] = useState('')
  const [logWait, setLogWait] = useState('')
  const [logDate, setLogDate] = useState('')
  if (!task) return null
  const addNote = () => {
    const t = note.trim()
    if (!t) return
    noteTask(task.id, t)
    setNote('')
    toast.success('Note added to history')
  }
  const openLog = () => {
    setLogNote(''); setLogWait(task.waitingOn ?? '')
    setLogDate(addDays(today(), state.settings.followUpDays))
    setLogOpen(true)
  }
  const doLogFollowUp = () => {
    const n = logNote.trim()
    const w = logWait.trim()
    const d = logDate || addDays(today(), state.settings.followUpDays)
    // 1) record what you did as a timeline note (only if you typed something)
    if (n) noteTask(task.id, `Did: ${n}${w ? ` — now waiting on ${w}` : ''}`)
    // 2) roll the same task forward: it becomes a waiting follow-up with a fresh due date
    updateTask(task.id, {
      type: 'followup',
      status: 'waiting',
      waitingOn: w || task.waitingOn,
      waitingSince: today(),
      due: d,
    }, `Follow-up set for ${fmtDate(d)}${w ? ` · waiting on ${w}` : ''}`)
    toast.success(`Logged — follow-up ${fmtDate(d)}${w ? `, waiting on ${w}` : ''}`)
    setLogOpen(false); setLogNote(''); setLogWait('')
  }
  const area = state.areas.find(a => a.id === task.areaId)
  const project = state.projects.find(p => p.id === task.projectId)
  const person = state.people.find(p => p.id === task.personId)
  const vendor = state.vendors.find(v => v.id === task.vendorId)
  const kids = subtasksOf(state, task.id)
  const scheme = state.settings.priorityScheme
  const done = task.status === 'done' || task.status === 'dropped'

  return (
    <Dialog open={!!task} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wide">
            {TYPE_LABELS[task.type]} · {STATUS_LABELS[task.status]}
          </div>
          <DialogTitle className="font-display text-xl leading-snug">{task.title}</DialogTitle>
        </DialogHeader>

        {/* One-tap action bar — no digging through menus */}
        {!done && (
          <div className="grid grid-cols-1 gap-2 border border-border bg-accent/40 rounded-sm p-2.5">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" className="h-7 px-2.5 text-[12px]" onClick={() => {
                const prev = task.status
                completeTask(task.id)
                toast.success('Done — archived', { action: { label: 'Undo', onClick: () => updateTask(task.id, { status: prev, completedAt: undefined }, 'undo complete') }, duration: 6000 })
                onClose()
              }}>
                <Check className="h-3.5 w-3.5 mr-1" />Done
              </Button>
              {/* Did the work but can't close it yet (waiting on a reply)? Log what you did and
                  roll this same task forward into a waiting follow-up — one task, full history. */}
              <Button size="sm" variant={logOpen ? 'default' : 'outline'} className="h-7 px-2.5 text-[12px]" onClick={() => logOpen ? setLogOpen(false) : openLog()}>
                <Send className="h-3 w-3 mr-1" />Log &amp; follow up
              </Button>
              {(task.type === 'call' || task.personId) && (
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-[12px]" onClick={() => { calledFollowUp(task.id); toast.success(`Call logged — follow-up due ${fmtDate(addDays(today(), state.settings.followUpDays))}`); onClose() }}>
                  <Phone className="h-3 w-3 mr-1" />Called — new follow-up task
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
            {/* Type switcher — call vs to-do vs follow-up, changeable in one tap. This is what
                decides whether a task lands on the call list, so it lives here in plain sight
                rather than only in the deeper Edit form. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-0.5">Type</span>
              {(Object.keys(TYPE_LABELS) as TaskType[]).map(tt => (
                <button
                  key={tt}
                  onClick={() => updateTask(task.id, { type: tt }, `type → ${TYPE_LABELS[tt]}`)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] border rounded-sm transition-colors',
                    task.type === tt ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-accent',
                  )}
                >
                  {TYPE_LABELS[tt]}
                </button>
              ))}
            </div>
            {/* Due date — the date this task is set for, shown and editable the moment you open the
                task. Change it inline or clear it; empty means no date (it won't sit on Today). */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-0.5">Due</span>
              <input
                type="date"
                value={task.due ?? ''}
                onChange={e => updateTask(task.id, { due: e.target.value || undefined }, e.target.value ? `due → ${e.target.value}` : 'due date cleared')}
                className="h-7 px-1.5 text-[11.5px] border border-border rounded-sm bg-card text-foreground outline-none cursor-pointer"
              />
              {task.due
                ? <button onClick={() => updateTask(task.id, { due: undefined }, 'due date cleared')} className="text-[11px] text-muted-foreground hover:text-foreground">clear</button>
                : <span className="text-[11px] text-muted-foreground italic">no date set</span>}
              {/* Start time — with a due date, this places the task on the Calendar Day timeline */}
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-3 mr-0.5">At</span>
              <input
                type="time"
                value={task.startTime ?? ''}
                onChange={e => updateTask(task.id, { startTime: e.target.value || undefined }, e.target.value ? `time → ${e.target.value}` : 'time cleared')}
                className="h-7 px-1.5 text-[11.5px] border border-border rounded-sm bg-card text-foreground outline-none cursor-pointer"
              />
              {/* Est. time (minutes) — editable right here on the view, not just the Edit form */}
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-3 mr-0.5">Est <span className="normal-case">(min)</span></span>
              <input
                type="number" min={0} step={5} inputMode="numeric"
                value={task.estMinutes ?? ''}
                onChange={e => updateTask(task.id, { estMinutes: e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value))) }, e.target.value ? `est → ${e.target.value} min` : 'est time cleared')}
                placeholder="—"
                className="h-7 w-16 px-1.5 text-[11.5px] border border-border rounded-sm bg-card text-foreground outline-none"
              />
            </div>
            {/* Contact person — link a person (or type a new name to add them to People on the spot) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-0.5">Contact</span>
              <div className="w-[260px]">
                <ContactPicker value={task.personId} onChange={id => updateTask(task.id, { personId: id }, id ? 'contact linked' : 'contact cleared')} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-0.5">Move to</span>
              {(() => {
                const b = withPopularFirst(state.areas.filter(a => a.active), a => areaUsage(state, a.id), a => a.name)
                return (
                  <SearchableSelect
                    value={task.areaId ?? '__none__'}
                    onValueChange={v => {
                      const a = state.areas.find(x => x.id === v)
                      updateTask(task.id, { areaId: v === '__none__' ? undefined : v, projectId: undefined }, a ? `moved to ${a.name}` : 'area cleared')
                      toast(a ? `Moved to ${a.name}` : 'Area cleared')
                    }}
                    options={[{ value: '__none__', label: 'No area' }, ...b.ordered.map(a => ({ value: a.id, label: a.name }))]}
                    popularCount={b.popularCount > 0 ? b.popularCount + 1 : 0}
                    placeholder="Area" searchPlaceholder="Search areas…"
                    className="h-7 w-[130px] text-[11.5px] bg-card"
                  />
                )
              })()}
              {task.areaId && (() => {
                const projectsHere = state.projects.filter(p => p.areaId === task.areaId && (p.status === 'active' || p.status === 'on-hold'))
                const b = withPopularFirst(projectsHere, p => projectUsage(state, p.id), p => p.name)
                return (
                  <SearchableSelect
                    value={task.projectId ?? '__none__'}
                    onValueChange={v => {
                      const p = state.projects.find(x => x.id === v)
                      updateTask(task.id, { projectId: v === '__none__' ? undefined : v, areaId: p ? p.areaId : task.areaId }, p ? `moved to project ${p.name}` : 'project cleared')
                      toast(p ? `Moved to ${p.name}` : 'No longer tied to a project')
                    }}
                    options={[{ value: '__none__', label: 'No project' }, ...b.ordered.map(p => ({ value: p.id, label: p.name }))]}
                    popularCount={b.popularCount > 0 ? b.popularCount + 1 : 0}
                    placeholder="Project" searchPlaceholder="Search or type to add…"
                    onCreate={name => { const proj = addProject({ name, areaId: task.areaId! }); updateTask(task.id, { projectId: proj.id }, `moved to project ${proj.name}`); toast.success(`Project “${proj.name}” created`) }}
                    createLabel={q => `Add project “${q}”`}
                    className="h-7 w-[150px] text-[11.5px] bg-card"
                  />
                )
              })()}
              {(() => {
                const catsHere = categoriesForArea(state.categories, task.areaId, task.categoryIds[0])
                const b = withPopularFirst(catsHere, c => categoryUsage(state, c.id), c => c.name)
                return (
                  <SearchableSelect
                    value={task.categoryIds[0] ?? '__none__'}
                    onValueChange={v => {
                      const c = state.categories.find(x => x.id === v)
                      updateTask(task.id, { categoryIds: v === '__none__' ? [] : [v] }, c ? `re-categorized as ${c.name}` : 'category cleared')
                      toast(c ? `Re-categorized as ${c.name}` : 'Category cleared')
                    }}
                    options={[{ value: '__none__', label: 'No category' }, ...b.ordered.map(c => ({ value: c.id, label: `${c.level > 0 ? '› ' : ''}${c.name}` }))]}
                    popularCount={b.popularCount > 0 ? b.popularCount + 1 : 0}
                    placeholder="Category" searchPlaceholder="Search categories…"
                    className="h-7 w-[130px] text-[11.5px] bg-card"
                  />
                )
              })()}
              {(() => {
                const actionsHere = state.actions.filter(a => a.active || a.id === task.actionIds?.[0])
                const b = withPopularFirst(actionsHere, a => actionUsage(state, a.id), a => a.name)
                return (
                  <SearchableSelect
                    value={task.actionIds?.[0] ?? '__none__'}
                    onValueChange={v => {
                      const a = state.actions.find(x => x.id === v)
                      updateTask(task.id, { actionIds: v === '__none__' ? [] : [v] }, a ? `action → ${a.name}` : 'action cleared')
                      toast(a ? `Action set to ${a.name}` : 'Action cleared')
                    }}
                    options={[{ value: '__none__', label: 'No action' }, ...b.ordered.map(a => ({ value: a.id, label: a.name }))]}
                    popularCount={b.popularCount > 0 ? b.popularCount + 1 : 0}
                    placeholder="Action" searchPlaceholder="Search actions…"
                    className="h-7 w-[120px] text-[11.5px] bg-card"
                  />
                )
              })()}
            </div>
          </div>
        )}

        {/* Log & follow up panel — capture the action, set the next follow-up, keep it one task. */}
        {!done && logOpen && (
          <div className="border border-[hsl(17_63%_47%_/_0.5)] bg-[hsl(35_70%_96%)] rounded-sm p-3 grid grid-cols-1 gap-2.5">
            <div className="text-[11px] uppercase tracking-wide text-[hsl(28_60%_32%)] font-semibold">Log what you did · set a follow-up</div>
            <Textarea
              rows={2}
              autoFocus
              value={logNote}
              onChange={e => setLogNote(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doLogFollowUp() } }}
              placeholder="What did you do? e.g. “Emailed him the quote — waiting on his reply”"
              className="text-[12.5px] min-h-0 resize-y bg-card"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Follow up on</span>
              <input
                type="date"
                value={logDate}
                onChange={e => setLogDate(e.target.value)}
                className="h-7 px-1.5 text-[11.5px] border border-border rounded-sm bg-card text-foreground outline-none cursor-pointer"
              />
              <div className="flex items-center gap-1">
                {[2, 7, 14].map(dd => (
                  <button
                    key={dd}
                    type="button"
                    onClick={() => setLogDate(addDays(today(), dd))}
                    className="h-6 px-1.5 text-[10.5px] rounded-sm border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground"
                  >
                    {dd === 2 ? 'In 2 days' : dd === 7 ? 'Next week' : 'In 2 weeks'}
                  </button>
                ))}
              </div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-1">Waiting on</span>
              <Input
                value={logWait}
                onChange={e => setLogWait(e.target.value)}
                placeholder="who / what (optional)"
                className="h-7 w-[160px] text-[11.5px] bg-card"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-7 px-3 text-[12px]" onClick={doLogFollowUp}>
                <Send className="h-3.5 w-3.5 mr-1" />Log &amp; set follow-up
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[12px]" onClick={() => setLogOpen(false)}>Cancel</Button>
              <span className="text-[11px] text-muted-foreground">This task becomes a <b>waiting follow-up</b> — the note is saved to its history below.</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 text-sm">
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
            <span><PriorityChip p={task.priority} /></span>
            {area && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: area.color }} />{area.name}</span>}
            {project && <span className="text-muted-foreground">› {project.name}</span>}
            {task.due && <span>Due <b>{fmtDate(task.due)}</b>{task.startTime && <> at <b>{task.startTime}</b></>}</span>}
            {task.estMinutes ? <span>Est <b>{task.estMinutes} min</b></span> : null}
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
          <TaskShare task={task} />
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
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1.5">Notes &amp; history</div>
            {/* Add a note — a running log of what transpired (e.g. "He emailed asking for a call").
                Saved straight into the timeline below so the story of the task stays in one place. */}
            {!done && (
              <div className="flex items-start gap-1.5 mb-2">
                <Textarea
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addNote() } }}
                  placeholder="Add a note / update — what happened, what was said…"
                  className="text-[12.5px] min-h-0 resize-y"
                />
                <Button size="sm" className="h-8 px-2.5 text-[12px] shrink-0" onClick={addNote} disabled={!note.trim()}>
                  <Send className="h-3.5 w-3.5 mr-1" />Add
                </Button>
              </div>
            )}
            <div className="border-t border-border">
              {history.map(h => (
                h.action === 'noted' ? (
                  <div key={h.id} className="flex gap-2 py-1.5 border-b border-border/60 text-[12.5px] bg-accent/40 -mx-1 px-1 rounded-sm">
                    <span className="text-muted-foreground tabular shrink-0 w-[74px]">{h.ts.slice(5, 10)}</span>
                    <span className="whitespace-pre-wrap"><b>{h.user}</b> <span className="text-[hsl(17_63%_47%)] font-medium">noted:</span> {h.detail}</span>
                  </div>
                ) : (
                  <div key={h.id} className="flex gap-2 py-1.5 border-b border-border/60 text-[12px]">
                    <span className="text-muted-foreground tabular shrink-0 w-[74px]">{h.ts.slice(5, 10)}</span>
                    <span><b>{h.user}</b> {h.action} — {h.detail}</span>
                  </div>
                )
              ))}
              <div className="flex gap-2 py-1.5 text-[12px]">
                <span className="text-muted-foreground tabular shrink-0 w-[74px]">{fmtDate(task.created)}</span>
                <span><b>Craig</b> created · source: {task.source}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="items-center">
          <span className="mr-auto text-[11px] text-muted-foreground hidden sm:inline">Changes here save automatically</span>
          <Button variant="outline" onClick={() => { onClose(); onEdit(task) }}>Edit</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={() => { toast.success('Saved'); onClose() }}>Save &amp; Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
