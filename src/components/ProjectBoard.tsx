import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Lock, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  PRIORITY_LABELS, Priority, Project, STATUS_LABELS, Task, TaskStatus, fmtDate, relDue,
} from '@/lib/model'
import { useStore } from '@/lib/store'
import {
  NO_PHASE, openBlockers, phaseRefs, progress, projectStats, projectTasks, groupByPhase,
} from '@/lib/milestones'
import { ImportPlanDialog } from '@/components/ImportPlanDialog'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROJECT BOARD
 * ─────────────────────────────────────────────────────────────────────────────
 * A project used to open as a flat list of its tasks. That works for "book the
 * hall, send the invitations" and falls apart the moment a project has a shape:
 * forty rows in one column, no way to see that the first block is finished and
 * the third hasn't begun, and no way to say "this can't start until that does".
 *
 * So the board groups by phase, counts each phase separately, and lets a task
 * name the work it's waiting on. Everything here is a view over data the task
 * model already holds — no task is owned by a phase, so removing the grouping
 * removes nothing but the grouping.
 *
 * The filter row is deliberately narrow (phase, owner, status, priority, hide
 * done). It answers the questions you actually ask standing in front of a plan:
 * what's mine, what's late, what's left.
 */

type OwnerFilter = string // person id, '' = all, '__none__' = unassigned

export function ProjectBoard({ project, onOpenTask, onAddTask }: {
  project: Project
  onOpenTask: (t: Task) => void
  onAddTask: (milestoneId?: string) => void
}) {
  const { state, updateTask, completeTask, reorderMilestone } = useStore()
  const scheme = state.settings.priorityScheme

  const [phase, setPhase] = useState<string>('')
  const [owner, setOwner] = useState<OwnerFilter>('')
  const [status, setStatus] = useState<string>('')
  const [priority, setPriority] = useState<string>('')
  const [hideDone, setHideDone] = useState(false)
  const [editPhase, setEditPhase] = useState<string | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const all = useMemo(() => projectTasks(state, project.id), [state, project.id])
  const refs = useMemo(() => phaseRefs(state, project.id), [state, project.id])
  const stats = useMemo(() => projectStats(state, all), [state, all])

  const filtered = useMemo(() => all.filter(t => {
    if (phase && (phase === NO_PHASE ? !!t.milestoneId : t.milestoneId !== phase)) return false
    if (owner && (owner === NO_PHASE ? !!t.personId : t.personId !== owner)) return false
    if (status && t.status !== status) return false
    if (priority && t.priority !== priority) return false
    if (hideDone && (t.status === 'done' || t.status === 'dropped')) return false
    return true
  }), [all, phase, owner, status, priority, hideDone])

  const groups = useMemo(
    () => groupByPhase(state, project.id, filtered),
    [state, project.id, filtered],
  )

  // Only people who actually own something here — a dropdown of the whole address
  // book would be unusable, and every name in it but a handful would match nothing.
  const owners = useMemo(() => {
    const ids = new Set(all.map(t => t.personId).filter(Boolean) as string[])
    return state.people.filter(p => ids.has(p.id))
  }, [all, state.people])

  const anyFilter = !!(phase || owner || status || priority || hideDone)
  const phases = state.milestones.filter(m => m.projectId === project.id)

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* ---- The five numbers that decide the week ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-border border border-border rounded-lg overflow-hidden">
        <Stat n={stats.total} label="tasks" />
        <Stat n={stats.done} label="done" />
        <Stat n={stats.inProgress} label="in progress" />
        <Stat n={stats.unassigned} label="unassigned" tone={stats.unassigned ? 'warn' : undefined} />
        <Stat n={stats.blocked} label="blocked" tone={stats.blocked ? 'warn' : undefined} />
        <Stat n={stats.topOpen} label={`${PRIORITY_LABELS[scheme].P1} open`} />
      </div>

      {/* ---- Filters ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter value={phase} onChange={setPhase} placeholder="All phases" options={[
          ...phases.map(m => ({ value: m.id, label: m.name })),
          { value: NO_PHASE, label: 'No phase' },
        ]} />
        <Filter value={owner} onChange={setOwner} placeholder="All owners" options={[
          ...owners.map(p => ({ value: p.id, label: p.name })),
          { value: NO_PHASE, label: 'Unassigned' },
        ]} />
        <Filter value={status} onChange={setStatus} placeholder="All statuses"
          options={(Object.keys(STATUS_LABELS) as TaskStatus[]).map(s => ({ value: s, label: STATUS_LABELS[s] }))} />
        <Filter value={priority} onChange={setPriority} placeholder="All priorities"
          options={(['P0', 'P1', 'P2', 'P3'] as Priority[]).map(p => ({ value: p, label: PRIORITY_LABELS[scheme][p] }))} />
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} className="accent-[hsl(var(--primary))]" />
          hide done
        </label>
        {anyFilter && (
          <button
            onClick={() => { setPhase(''); setOwner(''); setStatus(''); setPriority(''); setHideDone(false) }}
            className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            clear
          </button>
        )}
        <span className="ml-auto text-[12px] text-muted-foreground tabular">
          {filtered.length} of {all.length} shown
        </span>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setImporting(true)}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />Import plan
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setEditPhase('new')}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />Phase
        </Button>
      </div>

      {/* A project with no phases and no tasks is where someone arrives holding a
          plan they built elsewhere. Say so, instead of showing an empty board. */}
      {all.length === 0 && phases.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-[13.5px] font-medium">Nothing in this project yet.</p>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
            Already have this plan in a tracker or a spreadsheet? Paste the table in and it becomes phases and tasks — owners, dates and dependencies included.
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button size="sm" onClick={() => setImporting(true)}><Upload className="h-3.5 w-3.5 mr-1.5" />Import a plan</Button>
            <Button size="sm" variant="outline" onClick={() => setEditPhase('new')}>Add a phase</Button>
          </div>
        </div>
      )}

      {/* ---- Phase by phase ---- */}
      {groups.map(({ milestone, tasks }, gi) => {
        // Progress is always the *unfiltered* phase — a bar that moves because you
        // ticked "hide done" would be telling you something that isn't true.
        const inPhase = milestone ? all.filter(t => t.milestoneId === milestone.id) : tasks
        const p = progress(inPhase)
        return (
          <section key={milestone?.id ?? 'none'} className="border border-border bg-card shadow-sm rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-border flex items-center gap-3 bg-muted/30">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-display text-[13px] font-semibold uppercase tracking-[0.06em]">
                    {milestone ? milestone.name : 'No phase'}
                  </h3>
                  <span className="text-[11.5px] text-muted-foreground tabular shrink-0">
                    {p.done} of {p.total} done
                  </span>
                </div>
                {milestone?.detail && <p className="text-[11.5px] text-muted-foreground mt-0.5">{milestone.detail}</p>}
                {!milestone && <p className="text-[11.5px] text-muted-foreground mt-0.5">Filed to the project, not yet placed in a phase.</p>}
              </div>
              <div className="w-24 sm:w-40 h-1.5 bg-muted rounded-sm overflow-hidden shrink-0">
                <div className="h-full bg-[hsl(152_25%_38%)] transition-all" style={{ width: `${p.pct}%` }} />
              </div>
              {milestone?.due && (
                <span className="text-[11px] text-muted-foreground tabular shrink-0 hidden sm:inline">{fmtDate(milestone.due)}</span>
              )}
              <div className="ml-auto flex items-center gap-0.5 shrink-0">
                {milestone && (
                  <>
                    <IconBtn label="Move up" disabled={gi === 0} onClick={() => reorderMilestone(milestone.id, 'up')}><ChevronUp className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label="Move down" disabled={gi >= phases.length - 1} onClick={() => reorderMilestone(milestone.id, 'down')}><ChevronDown className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label="Rename phase" onClick={() => setEditPhase(milestone.id)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label="Remove phase" onClick={() => setConfirmDelete(milestone.id)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                  </>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-[11.5px]" onClick={() => onAddTask(milestone?.id)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Task
                </Button>
              </div>
            </header>

            {tasks.length === 0 ? (
              <p className="px-4 py-3 text-[12.5px] text-muted-foreground italic">
                {anyFilter ? 'Nothing here matches the filters.' : 'Nothing in this phase yet.'}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {tasks.map(t => (
                  <BoardRow
                    key={t.id}
                    task={t}
                    reference={refs.get(t.id)}
                    refs={refs}
                    onOpen={() => onOpenTask(t)}
                    // `completeTask` is the audited path that stamps completedAt and
                    // handles follow-ups; every other status is a plain edit, and
                    // moving *off* done has to clear the stamp or the task keeps a
                    // completion date it no longer has.
                    onStatus={s => {
                      if (s === 'done') completeTask(t.id)
                      else updateTask(t.id, { status: s, completedAt: undefined })
                      toast(`${t.title} → ${STATUS_LABELS[s]}`)
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}

      <PhaseDialog
        projectId={project.id}
        milestoneId={editPhase === 'new' ? null : editPhase}
        open={editPhase !== null}
        onClose={() => setEditPhase(null)}
      />
      <DeletePhaseDialog id={confirmDelete} onClose={() => setConfirmDelete(null)} />
      <ImportPlanDialog project={project} open={importing} onClose={() => setImporting(false)} />
    </div>
  )
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: 'warn' }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <div className={cn('font-display text-[22px] font-semibold tabular leading-none', tone === 'warn' && n > 0 && 'text-[hsl(8_60%_41%)]')}>{n}</div>
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground mt-1">{label}</div>
    </div>
  )
}

function Filter({ value, onChange, placeholder, options }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}) {
  // Radix Select can't hold '' as a value, so the "all" row uses a sentinel that's
  // translated back to '' on the way out — the filter state stays plain strings.
  return (
    <Select value={value || '__all__'} onValueChange={v => onChange(v === '__all__' ? '' : v)}>
      <SelectTrigger className={cn('h-8 w-auto min-w-[130px] bg-card text-[12.5px]', value && 'border-[hsl(var(--primary))]')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{placeholder}</SelectItem>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function IconBtn({ children, label, onClick, disabled }: {
  children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function BoardRow({ task, reference, refs, onOpen, onStatus }: {
  task: Task
  reference?: string
  refs: Map<string, string>
  onOpen: () => void
  onStatus: (s: TaskStatus) => void
}) {
  const { state } = useStore()
  const owner = state.people.find(p => p.id === task.personId)
  const blockers = openBlockers(state, task)
  const finished = task.status === 'done' || task.status === 'dropped'

  return (
    <div className="px-4 py-2.5 grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_7.5rem_7rem_5rem_6rem] gap-x-3 gap-y-1.5 items-center hover:bg-accent/40 transition-colors">
      <span className="text-[11px] tabular font-semibold text-muted-foreground">{reference}</span>

      <button onClick={onOpen} className="text-left min-w-0">
        <span className={cn('text-[13.5px] font-medium', finished && 'line-through opacity-55')}>{task.title}</span>
        {task.notes && <p className="text-[11.5px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{task.notes}</p>}
        {blockers.length > 0 && (
          <span className="inline-flex items-center gap-1 mt-1 rounded-sm border border-[hsl(8_50%_75%)] bg-[hsl(8_60%_96%)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[hsl(8_55%_35%)]">
            <Lock className="h-2.5 w-2.5" />
            waiting on {blockers.map(b => refs.get(b.id) ?? b.title).join(', ')}
          </span>
        )}
        {task.waitingOn && (
          <span className="ml-1.5 text-[10.5px] text-muted-foreground">· waiting on {task.waitingOn}</span>
        )}
      </button>

      <Select value={task.status} onValueChange={v => onStatus(v as TaskStatus)}>
        <SelectTrigger className="h-7 text-[11.5px] bg-card"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABELS) as TaskStatus[]).map(s => (
            <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className={cn('text-[12px] truncate hidden sm:block', !owner && 'text-muted-foreground italic')}>
        {owner?.name ?? 'unassigned'}
      </span>

      <span className="hidden sm:block"><PriorityDot p={task.priority} /></span>

      <TargetDate due={task.due} finished={finished} />
    </div>
  )
}

/**
 * The target column. A date that has passed is the single most useful thing on the
 * row, so it's coloured — but only while the task is still open. Colouring an
 * overdue date on finished work would flag something that needs no attention.
 */
function TargetDate({ due, finished }: { due?: string; finished: boolean }) {
  if (!due) return <span className="text-[11.5px] tabular text-muted-foreground hidden sm:block">—</span>
  const { label, tone } = relDue(due)
  return (
    <span className={cn(
      'text-[11.5px] tabular hidden sm:block',
      !finished && tone === 'overdue' ? 'text-[hsl(8_60%_41%)] font-semibold'
        : !finished && tone === 'today' ? 'text-foreground font-semibold'
          : 'text-muted-foreground',
      finished && 'opacity-55',
    )}>
      {label}
    </span>
  )
}

function PriorityDot({ p }: { p: Priority }) {
  const { state } = useStore()
  const styles: Record<Priority, string> = {
    P0: 'bg-[hsl(8_60%_41%)] text-[hsl(45_50%_96%)]',
    P1: 'bg-[hsl(35_70%_88%)] text-[hsl(28_60%_28%)]',
    P2: 'bg-[hsl(160_25%_88%)] text-[hsl(160_25%_24%)]',
    P3: 'bg-muted text-muted-foreground',
  }
  return (
    <span className={cn('inline-flex rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tabular', styles[p])}>
      {PRIORITY_LABELS[state.settings.priorityScheme][p]}
    </span>
  )
}

function PhaseDialog({ projectId, milestoneId, open, onClose }: {
  projectId: string
  milestoneId: string | null
  open: boolean
  onClose: () => void
}) {
  const { state, addMilestone, updateMilestone } = useStore()
  const existing = state.milestones.find(m => m.id === milestoneId)
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [due, setDue] = useState('')
  const [seeded, setSeeded] = useState<string | null>(null)

  // Load the phase being edited exactly once per open, so typing isn't overwritten
  // on every re-render of the parent.
  const key = `${open}:${milestoneId ?? 'new'}`
  if (open && seeded !== key) {
    setSeeded(key)
    setName(existing?.name ?? '')
    setDetail(existing?.detail ?? '')
    setDue(existing?.due ?? '')
  }

  const save = () => {
    if (!name.trim()) { toast.error('A phase needs a name'); return }
    if (existing) {
      updateMilestone(existing.id, { name: name.trim(), detail: detail.trim() || undefined, due: due || undefined })
      toast.success('Phase updated')
    } else {
      addMilestone({ projectId, name, detail, due: due || undefined })
      toast.success(`Phase “${name.trim()}” added`)
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setSeeded(null); onClose() } }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="font-display text-lg">{existing ? 'Edit phase' : 'New phase'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Foundation" autoFocus />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label className="text-xs">Subtitle <span className="font-normal text-muted-foreground">— optional</span></Label>
            <Input value={detail} onChange={e => setDetail(e.target.value)} placeholder="Phase 1 · Weeks 1–3" />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label className="text-xs">Target date <span className="font-normal text-muted-foreground">— optional</span></Label>
            <Input type="date" value={due} onChange={e => setDue(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{existing ? 'Save' : 'Add phase'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeletePhaseDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { state, deleteMilestone } = useStore()
  const ms = state.milestones.find(m => m.id === id)
  const count = state.tasks.filter(t => t.milestoneId === id).length
  if (!ms) return null
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-display text-lg">Remove “{ms.name}”?</DialogTitle></DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          {count === 0
            ? 'The phase is empty, so nothing else changes.'
            : <>The {count} task{count === 1 ? '' : 's'} in it {count === 1 ? 'stays' : 'stay'} on the project — {count === 1 ? 'it moves' : 'they move'} to <b className="text-foreground">No phase</b>, where you can re-file {count === 1 ? 'it' : 'them'}. Nothing is deleted.</>}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => {
            const n = deleteMilestone(ms.id)
            toast.success(n ? `Phase removed — ${n} task${n === 1 ? '' : 's'} kept` : 'Phase removed')
            onClose()
          }}>Remove phase</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
