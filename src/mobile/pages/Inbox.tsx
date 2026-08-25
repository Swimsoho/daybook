import { useState } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { EmptyState } from '@/mobile/components/bits'
import { fmtDate, type Capture } from '@/lib/model'

/**
 * Inbox — confirm or dismiss the AI router's filing proposals.
 *
 * Accept used to take the router's guess wholesale, which meant a wrong guess had to be
 * corrected afterwards by finding the task and editing it. You can now correct the filing
 * *before* it lands — title, area, category, action, due date, or file it into a tracker
 * instead — which is the same set of overrides the desktop Inbox offers, and the same
 * `acceptCapture(id, overrides)` call underneath.
 */
export function Inbox() {
  const { state } = useStore()
  const captures = state.captures.filter(c => c.status === 'pending')

  return (
    <div>
      <p className="m-0 mb-3 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
        {captures.length} pending capture{captures.length === 1 ? '' : 's'}
      </p>

      {captures.length === 0 ? <EmptyState>Inbox is clear.</EmptyState> : null}

      {captures.map(capture => (
        <CaptureCard key={capture.id} capture={capture} />
      ))}
    </div>
  )
}

function CaptureCard({ capture }: { capture: Capture }) {
  const { state, acceptCapture, dismissCapture } = useStore()
  const p = capture.proposal

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(p.title ?? capture.text)
  const [areaId, setAreaId] = useState(p.areaId ?? '')
  const [projectId, setProjectId] = useState(p.projectId ?? '')
  const [categoryId, setCategoryId] = useState(p.categoryIds?.[0] ?? '')
  const [actionId, setActionId] = useState(p.actionIds?.[0] ?? '')
  const [due, setDue] = useState(p.due ?? '')
  const [trackerId, setTrackerId] = useState<string | undefined>(p.trackerId)

  const areas = state.areas.filter(a => a.active)
  const projects = state.projects.filter(
    pr => pr.status !== 'archived' && (!areaId || pr.areaId === areaId),
  )
  // Categories can be scoped to areas; an untagged category shows everywhere, which is how
  // the desktop behaves too.
  const categories = state.categories.filter(
    c => c.active && (!c.areaIds?.length || !areaId || c.areaIds.includes(areaId)),
  )
  const actions = state.actions.filter(a => a.active)
  const area = state.areas.find(a => a.id === areaId)
  const project = state.projects.find(pr => pr.id === projectId)

  const route = [p.kind, area?.name, project?.name, p.priority].filter(Boolean).join(' · ')

  const file = () => {
    acceptCapture(capture.id, {
      title: title.trim() || undefined,
      areaId: areaId || undefined,
      projectId: projectId || undefined,
      categoryIds: categoryId ? [categoryId] : [],
      actionIds: actionId ? [actionId] : undefined,
      due: due || '',
      trackerId,
    })
    toast.success('Filed')
  }

  return (
    <div className="mb-[10px] rounded-[10px] border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          {capture.source}
        </span>
        <span className="text-[10.5px] text-muted-foreground">
          {fmtDate(capture.created.slice(0, 10))}
        </span>
      </div>

      <p className="my-[6px] text-[13.5px] italic leading-[1.4]">“{capture.text}”</p>

      <p className="m-0 text-[11.5px]" style={{ color: 'hsl(152 22% 30%)' }}>
        → {route}
      </p>
      {p.explanation ? (
        <p className="m-0 mt-1 text-[11px] leading-[1.45] text-muted-foreground">{p.explanation}</p>
      ) : null}

      {open ? (
        <div className="mt-3 grid gap-2 border-t border-border pt-3">
          <Field label="Title">
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
          </Field>

          <Field label="Area">
            <select
              value={areaId}
              onChange={e => {
                setAreaId(e.target.value)
                setProjectId('') // a project from another area would be nonsense
              }}
              className={inputCls}
            >
              <option value="">—</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>

          {projects.length > 0 && (
            <Field label="Project">
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {projects.map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
            </Field>
          )}

          {categories.length > 0 && (
            <Field label="Category">
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}

          {actions.length > 0 && (
            <Field label="Action">
              <select value={actionId} onChange={e => setActionId(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {actions.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Due">
            <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} />
          </Field>

          <Field label="File as">
            {/* '' forces a plain task even if the router proposed a tracker entry, and any
                tracker id forces it into that tracker — the manual override for whenever the
                keyword router doesn't recognise where something was meant to go. */}
            <select
              value={trackerId ?? ''}
              onChange={e => setTrackerId(e.target.value || '')}
              className={inputCls}
            >
              <option value="">Task</option>
              {state.trackers.filter(t => t.active).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      <div className="mt-[10px] flex gap-2">
        <button
          type="button"
          onClick={file}
          className="flex-1 rounded-[7px] border-none bg-primary py-2 text-[12px] font-semibold text-primary-foreground active:opacity-80"
        >
          {open ? 'File it' : 'Accept'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="rounded-[7px] border border-border bg-transparent px-3 py-2 text-[12px] font-semibold active:opacity-70"
        >
          {open ? 'Hide' : 'Options'}
        </button>
        <button
          type="button"
          onClick={() => {
            dismissCapture(capture.id)
            toast('Archived — never deleted')
          }}
          className="rounded-[7px] border border-border bg-transparent px-3 py-2 text-[12px] font-semibold active:opacity-70"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

const inputCls =
  'w-full box-border rounded-[7px] border border-border bg-card px-[10px] py-[8px] text-[13px] outline-none focus:border-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}
