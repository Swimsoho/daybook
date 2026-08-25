import { Pencil } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useCloud } from '@/lib/cloud'
import { useStore } from '@/lib/store'
import {
  STATUS_LABELS,
  TYPE_LABELS,
  fmtDate,
  type Priority,
  type Task,
  type TaskStatus,
  type TaskType,
} from '@/lib/model'
import { openBlockers, projectMilestones } from '@/lib/milestones'
import { PRIORITY_SOLID } from '@/mobile/lib/colors'
import { areaOf, dueLabel, isDone } from '@/mobile/lib/select'
import { BottomSheet, SheetTitle } from '@/mobile/components/BottomSheet'
import {
  AreaTag,
  DueLabel,
  Field,
  OutlineButton,
  PriorityChip,
  PrimaryButton,
  Segmented,
  inputClass,
  textareaClass,
} from '@/mobile/components/bits'

/**
 * Task detail — the same fields the desktop dialog offers.
 *
 * This used to edit title, priority, due date and notes only, which meant a task captured on
 * the phone could never be filed properly: no area, no project, no category, no status beyond
 * done/not-done. Anything more than a rename had to wait for a laptop. Everything here writes
 * through the same store as the desktop, so it's the same edit either way.
 */

type Draft = {
  title: string
  status: TaskStatus
  type: TaskType
  priority: Priority
  areaId: string
  projectId: string
  milestoneId: string
  categoryId: string
  actionId: string
  personId: string
  due: string
  followUp: string
  waitingOn: string
  notes: string
}

export function TaskDetailSheet({
  task,
  onClose,
  onToggle,
  onSnooze,
  onSave,
}: {
  task: Task | null
  onClose: () => void
  onToggle: (id: string) => void
  onSnooze: (id: string) => void
  onSave: (id: string, patch: Partial<Task>) => void
}) {
  const { state } = useStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (!task) return
    setEditing(false)
    setDraft({
      title: task.title,
      status: task.status,
      type: task.type,
      priority: task.priority,
      areaId: task.areaId ?? '',
      projectId: task.projectId ?? '',
      milestoneId: task.milestoneId ?? '',
      categoryId: task.categoryIds?.[0] ?? '',
      actionId: task.actionIds?.[0] ?? '',
      personId: task.personId ?? '',
      due: task.due ?? '',
      followUp: task.followUp ?? '',
      waitingOn: task.waitingOn ?? '',
      notes: task.notes ?? '',
    })
  }, [task])

  if (!task || !draft) return null
  const done = isDone(task)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft(d => (d ? { ...d, [key]: value } : d))

  const areas = state.areas.filter(a => a.active)
  const projects = state.projects.filter(
    p => p.status !== 'archived' && (!draft.areaId || p.areaId === draft.areaId),
  )
  const categories = state.categories.filter(
    c => c.active && (!c.areaIds?.length || !draft.areaId || c.areaIds.includes(draft.areaId)),
  )
  const actions = state.actions.filter(a => a.active)
  const phases = draft.projectId ? projectMilestones(state, draft.projectId) : []

  const save = () => {
    onSave(task.id, {
      title: draft.title.trim() || task.title,
      status: draft.status,
      type: draft.type,
      priority: draft.priority,
      areaId: draft.areaId || undefined,
      projectId: draft.projectId || undefined,
      milestoneId: draft.milestoneId || undefined,
      categoryIds: draft.categoryId ? [draft.categoryId] : [],
      actionIds: draft.actionId ? [draft.actionId] : undefined,
      personId: draft.personId || undefined,
      due: draft.due || undefined,
      followUp: draft.followUp || undefined,
      waitingOn: draft.status === 'waiting' ? draft.waitingOn || undefined : undefined,
      notes: draft.notes,
      // completing via the status picker should behave like ticking it off
      completedAt: draft.status === 'done' ? task.completedAt ?? new Date().toISOString().slice(0, 10) : undefined,
    })
    setEditing(false)
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      height={editing ? '92%' : '78%'}
      title={
        <div className="flex items-start justify-between gap-3">
          <SheetTitle>{editing ? 'Edit task' : 'Task'}</SheetTitle>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit task"
              className="shrink-0 rounded-[7px] border border-border p-[7px] text-muted-foreground active:opacity-70"
            >
              <Pencil size={14} strokeWidth={2} />
            </button>
          ) : null}
        </div>
      }
    >
      {editing ? (
        <>
          <Field label="Title">
            <input value={draft.title} onChange={e => set('title', e.target.value)} className={inputClass} />
          </Field>

          <Field label="Status">
            <select
              value={draft.status}
              onChange={e => set('status', e.target.value as TaskStatus)}
              className={inputClass}
            >
              {(Object.keys(STATUS_LABELS) as TaskStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>

          {draft.status === 'waiting' ? (
            <Field label="Waiting on">
              <input
                value={draft.waitingOn}
                onChange={e => set('waitingOn', e.target.value)}
                placeholder="Who owes you?"
                className={inputClass}
              />
            </Field>
          ) : null}

          <Field label="Type">
            <select
              value={draft.type}
              onChange={e => set('type', e.target.value as TaskType)}
              className={inputClass}
            >
              {(Object.keys(TYPE_LABELS) as TaskType[]).map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <Segmented<Priority>
              value={draft.priority}
              onChange={priority => set('priority', priority)}
              options={(['P0', 'P1', 'P2', 'P3'] as Priority[]).map(p => ({
                value: p,
                label: p,
                color: PRIORITY_SOLID[p],
              }))}
            />
          </Field>

          <Field label="Area">
            <select
              value={draft.areaId}
              onChange={e => {
                set('areaId', e.target.value)
                set('projectId', '') // a project from another area would be nonsense
              }}
              className={inputClass}
            >
              <option value="">—</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          {projects.length ? (
            <Field label="Project">
              <select
                value={draft.projectId}
                onChange={e => {
                  set('projectId', e.target.value)
                  set('milestoneId', '') // phases belong to one project
                }}
                className={inputClass}
              >
                <option value="">—</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          ) : null}

          {/* Only projects that actually have phases offer the picker — most don't,
              and an empty dropdown is just a dead row on a small screen. */}
          {phases.length ? (
            <Field label="Phase">
              <select value={draft.milestoneId} onChange={e => set('milestoneId', e.target.value)} className={inputClass}>
                <option value="">No phase</option>
                {phases.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          ) : null}

          {categories.length ? (
            <Field label="Category">
              <select value={draft.categoryId} onChange={e => set('categoryId', e.target.value)} className={inputClass}>
                <option value="">—</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          ) : null}

          {actions.length ? (
            <Field label="Action">
              <select value={draft.actionId} onChange={e => set('actionId', e.target.value)} className={inputClass}>
                <option value="">—</option>
                {actions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          ) : null}

          <Field label="Person">
            <select value={draft.personId} onChange={e => set('personId', e.target.value)} className={inputClass}>
              <option value="">—</option>
              {state.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          <Field label="Due date">
            <input type="date" value={draft.due} onChange={e => set('due', e.target.value)} className={inputClass} />
          </Field>

          <Field label="Follow up">
            <input type="date" value={draft.followUp} onChange={e => set('followUp', e.target.value)} className={inputClass} />
          </Field>

          <Field label="Notes">
            <textarea value={draft.notes} onChange={e => set('notes', e.target.value)} className={textareaClass} />
          </Field>

          <div className="mt-1 flex gap-[10px]">
            <OutlineButton onClick={() => setEditing(false)}>Cancel</OutlineButton>
            <PrimaryButton onClick={save}>Save</PrimaryButton>
          </div>
        </>
      ) : (
        <>
          <h3
            className="m-0 mb-[10px] font-display text-[19px] font-semibold leading-[1.25]"
            style={done ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}
          >
            {task.title}
          </h3>

          <div className="mb-4 flex flex-wrap items-center gap-x-[10px] gap-y-2">
            <PriorityChip priority={task.priority} />
            <AreaTag area={areaOf(state, task.areaId)} />
            <DueLabel due={dueLabel(task)} />
          </div>

          <TaskFacts task={task} />

          {task.notes ? (
            <p className="m-0 mb-5 whitespace-pre-wrap text-[12.5px] leading-[1.5]" style={{ color: 'hsl(75 8% 30%)' }}>
              {task.notes}
            </p>
          ) : (
            <p className="m-0 mb-5 text-[12.5px] italic opacity-50">No notes.</p>
          )}

          <TaskShare task={task} onSave={onSave} />

          <div className="mt-4 flex gap-[10px]">
            <PrimaryButton
              onClick={() => {
                onToggle(task.id)
                onClose()
              }}
            >
              {done ? 'Reopen' : 'Mark done'}
            </PrimaryButton>
            <OutlineButton
              onClick={() => {
                onSnooze(task.id)
                onClose()
              }}
            >
              Snooze
            </OutlineButton>
          </div>
        </>
      )}
    </BottomSheet>
  )
}

/** everything filed against the task, so the read view answers "where does this sit?" */
function TaskFacts({ task }: { task: Task }) {
  const { state } = useStore()
  const project = state.projects.find(p => p.id === task.projectId)
  const phase = state.milestones.find(m => m.id === task.milestoneId)
  // Only blockers that are still open. A finished blocker isn't holding anything up,
  // so listing it would report a constraint that no longer exists.
  const blockers = openBlockers(state, task)
  const person = state.people.find(p => p.id === task.personId)
  const category = state.categories.find(c => c.id === task.categoryIds?.[0])
  const action = state.actions.find(a => a.id === task.actionIds?.[0])

  const rows: [string, string][] = [
    ['Status', STATUS_LABELS[task.status]],
    ['Type', TYPE_LABELS[task.type]],
    ...(project ? ([['Project', project.name]] as [string, string][]) : []),
    ...(phase ? ([['Phase', phase.name]] as [string, string][]) : []),
    ...(blockers.length ? ([['Blocked by', blockers.map(b => b.title).join(', ')]] as [string, string][]) : []),
    ...(category ? ([['Category', category.name]] as [string, string][]) : []),
    ...(action ? ([['Action', action.name]] as [string, string][]) : []),
    ...(person ? ([['Person', person.name]] as [string, string][]) : []),
    ...(task.waitingOn ? ([['Waiting on', task.waitingOn]] as [string, string][]) : []),
    ...(task.followUp ? ([['Follow up', fmtDate(task.followUp)]] as [string, string][]) : []),
  ]

  return (
    <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-[6px] text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="m-0">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Share a task by link, recording who you gave it to.
 *
 * The name matters: a share used to be anonymous, so the task read "shared, pending" with no
 * record of who owed you the answer — which makes chasing it impossible.
 */
function TaskShare({
  task,
  onSave,
}: {
  task: Task
  onSave: (id: string, patch: Partial<Task>) => void
}) {
  const cloud = useCloud()
  const { state } = useStore()
  const [creating, setCreating] = useState(false)
  const [recipient, setRecipient] = useState(
    () => task.shared?.sharedWith ?? state.people.find(p => p.id === task.personId)?.name ?? '',
  )

  const shared = task.shared
  const url = useMemo(
    () => (shared ? `${window.location.origin}/share/${shared.token}` : null),
    [shared],
  )

  if (task.status === 'done' || task.status === 'dropped') return null
  if (!cloud) {
    return (
      <p className="m-0 text-[11.5px] italic text-muted-foreground">
        Sign in to a real account to share a task by link.
      </p>
    )
  }

  const create = async () => {
    const name = recipient.trim()
    if (!name) {
      toast.error('Who are you sharing this with?')
      return
    }
    setCreating(true)
    const { token, error } = await cloud.shareTask({
      id: task.id,
      title: task.title,
      notes: task.notes,
      due: task.due,
    })
    setCreating(false)
    if (error || !token) {
      toast.error(error ?? 'Could not create a share link')
      return
    }
    const match = state.people.find(p => p.name.toLowerCase() === name.toLowerCase())
    onSave(task.id, {
      shared: {
        token,
        status: 'pending',
        createdAt: new Date().toISOString(),
        sharedWith: name,
        sharedPersonId: match?.id,
      },
      personId: task.personId ?? match?.id,
    })
    toast.success(`Link created for ${name}`)
  }

  return (
    <div className="rounded-[10px] border border-border p-3">
      <div className="mb-2 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
        Share this task
      </div>

      {!shared ? (
        <>
          <p className="m-0 mb-2 text-[11.5px] leading-[1.5] text-muted-foreground">
            A link you can text or WhatsApp to anyone — no account needed on their end. When
            they mark it done, it comes back here as done.
          </p>
          <input
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            placeholder="Who are you sharing it with?"
            list="daybook-share-people-mobile"
            className={inputClass}
          />
          <datalist id="daybook-share-people-mobile">
            {state.people.map(p => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          <button
            type="button"
            disabled={creating}
            onClick={create}
            className="w-full rounded-lg bg-primary py-[10px] text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create share link'}
          </button>
        </>
      ) : shared.status === 'done' ? (
        <p className="m-0 text-[12px]" style={{ color: 'hsl(152 35% 30%)' }}>
          {shared.sharedWith ? `${shared.sharedWith} marked it done` : 'Marked done via the link'}
          {shared.respondedAt ? ` on ${fmtDate(shared.respondedAt.slice(0, 10))}` : ''}.
        </p>
      ) : (
        <>
          <p className="m-0 mb-2 text-[11.5px] text-muted-foreground">
            {shared.sharedWith
              ? `Sent to ${shared.sharedWith} — waiting on them.`
              : 'Sent — waiting for them to mark it done.'}
          </p>
          <button
            type="button"
            onClick={async () => {
              if (!url) return
              // the native share sheet is the point of doing this on a phone
              if (navigator.share) {
                await navigator.share({ title: task.title, url }).catch(() => {})
              } else {
                await navigator.clipboard.writeText(url)
                toast.success('Link copied')
              }
            }}
            className="w-full rounded-lg border border-border py-[10px] text-[12.5px] font-semibold active:opacity-70"
          >
            Send the link
          </button>
        </>
      )}
    </div>
  )
}
