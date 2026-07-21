import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Entry, Tracker, TrackerColumn, fmtDate } from '@/lib/model'
import { useStore } from '@/lib/store'
import { EmptyNote, Stars } from '@/components/bits'

function visibleColumns(trk: Tracker, values: Entry['values']): TrackerColumn[] {
  return trk.columns.filter(c => !c.showWhen || values[c.showWhen.columnKey] === c.showWhen.equals)
}

function titleOf(trk: Tracker, e: Entry): string {
  const col = trk.columns.find(c => c.isTitle) ?? trk.columns[0]
  return String(e.values[col.key] ?? '—')
}

export default function CollectionsPage() {
  const { state, updateEntry } = useStore()
  const trackers = state.trackers.filter(t => t.active)
  const [trackerId, setTrackerId] = useState(trackers[0]?.id ?? '')
  const tracker = trackers.find(t => t.id === trackerId) ?? trackers[0]
  const [view, setView] = useState<'table' | 'board' | 'gallery' | null>(null)
  const [adding, setAdding] = useState(false)
  const [editEntry, setEditEntry] = useState<Entry | null>(null)

  const activeView = view ?? tracker?.defaultView ?? 'table'
  const entries = useMemo(() => state.entries.filter(e => e.trackerId === tracker?.id), [state.entries, tracker])
  const statusCol = tracker?.columns.find(c => c.type === 'status')

  if (!tracker) return <EmptyNote>Collections are switched off in Settings.</EmptyNote>

  return (
    <div className="grid gap-4">
      {/* Collection / tracker picker */}
      <div className="flex flex-wrap items-center gap-1.5">
        {state.collections.filter(c => c.active).map(col => (
          <React.Fragment key={col.id}>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground ml-2 first:ml-0 inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />{col.name}
            </span>
            {trackers.filter(t => t.collectionId === col.id).map(t => (
              <button
                key={t.id}
                onClick={() => { setTrackerId(t.id); setView(null) }}
                className={cn(
                  'px-2.5 py-1 text-[12.5px] border rounded-sm',
                  tracker.id === t.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-accent',
                )}
              >
                {t.name}
              </button>
            ))}
          </React.Fragment>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {(['table', 'board', 'gallery'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={cn('px-2 py-1 text-[11.5px] border rounded-sm capitalize', activeView === v ? 'bg-secondary border-input' : 'border-transparent hover:border-border')}>{v}</button>
          ))}
          <Button size="sm" className="h-7 ml-1" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5 mr-1" />Entry</Button>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground -mt-1">
        {tracker.description} · columns are yours to define in Settings
        {tracker.columns.some(c => c.showWhen) && <> · <span className="italic">{tracker.columns.filter(c => c.showWhen).map(c => `“${c.name}” appears when ${tracker.columns.find(x => x.key === c.showWhen!.columnKey)?.name} = ${c.showWhen!.equals}`).join('; ')}</span></>}
      </p>

      {/* TABLE */}
      {activeView === 'table' && (
        <section className="border border-border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                {tracker.columns.map(c => <th key={c.key} className="px-3 py-2 font-semibold whitespace-nowrap">{c.name}{c.showWhen && ' *'}</th>)}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const vis = visibleColumns(tracker, e.values)
                return (
                  <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-accent/50 cursor-pointer" onClick={() => setEditEntry(e)}>
                    {tracker.columns.map(c => {
                      const hidden = !vis.includes(c)
                      const v = e.values[c.key]
                      return (
                        <td key={c.key} className={cn('px-3 py-2', c.isTitle && 'font-medium')}>
                          {hidden ? <span className="text-border">·</span> : <CellValue col={c} value={v} />}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {entries.length === 0 && <EmptyNote>Nothing here yet.</EmptyNote>}
          {tracker.columns.some(c => c.showWhen) && <p className="px-3 py-1.5 text-[10.5px] text-muted-foreground">* conditional column — appears once its status rule is met</p>}
        </section>
      )}

      {/* BOARD */}
      {activeView === 'board' && statusCol && (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${statusCol.options?.length ?? 3}, minmax(0,1fr))` }}>
          {statusCol.options?.map(stage => (
            <div
              key={stage}
              className="border border-border bg-card shadow-sm transition-shadow [&.dragover]:ring-2 [&.dragover]:ring-[hsl(17_63%_47%)]"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover') }}
              onDragLeave={e => e.currentTarget.classList.remove('dragover')}
              onDrop={ev => {
                ev.preventDefault(); ev.currentTarget.classList.remove('dragover')
                const id = ev.dataTransfer.getData('text/entry-id')
                if (!id) return
                updateEntry(id, { [statusCol.key]: stage })
                const nowConditional = tracker.columns.find(c => c.showWhen?.equals === stage)
                if (nowConditional) toast(`Moved to ${stage} — “${nowConditional.name}” now appears; open the entry to fill it`)
                else toast(`Moved to ${stage}`)
              }}
            >
              <div className="px-3 py-2 border-b border-border text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold flex justify-between">
                {stage}
                <span className="tabular">{entries.filter(e => e.values[statusCol.key] === stage).length}</span>
              </div>
              <div className="p-2 grid gap-2 min-h-[80px] content-start">
                {entries.filter(e => e.values[statusCol.key] === stage).map(e => (
                  <button
                    key={e.id}
                    draggable
                    onDragStart={ev => { ev.dataTransfer.setData('text/entry-id', e.id); ev.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => setEditEntry(e)}
                    className="border border-border bg-background px-3 py-2 text-left hover:border-input transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <div className="text-[13px] font-medium">{titleOf(tracker, e)}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      {tracker.columns.filter(c => !c.isTitle && c.type !== 'status' && visibleColumns(tracker, e.values).includes(c)).slice(0, 2).map(c => (
                        <span key={c.key}><CellValue col={c} value={e.values[c.key]} small /></span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* GALLERY */}
      {activeView === 'gallery' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {entries.map(e => {
            const rating = e.values['rating'] as number | undefined
            const stage = statusCol ? String(e.values[statusCol.key] ?? '') : ''
            return (
              <button key={e.id} onClick={() => setEditEntry(e)} className="border border-border bg-card shadow-sm text-left hover:-translate-y-0.5 transition-transform">
                <div className="aspect-[3/2] flex items-center justify-center font-display-soft text-3xl text-[hsl(45_50%_96%)]" style={{ background: `linear-gradient(150deg, hsl(152 22% 26%), hsl(152 18% 18%))` }}>
                  {titleOf(tracker, e).slice(0, 1)}
                </div>
                <div className="px-3 py-2">
                  <div className="text-[13px] font-medium truncate">{titleOf(tracker, e)}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between mt-0.5">
                    <span>{stage}</span>
                    {typeof rating === 'number' && <Stars n={rating} />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <EntryDialog tracker={tracker} open={adding || !!editEntry} entry={editEntry} onClose={() => { setAdding(false); setEditEntry(null) }} />
    </div>
  )
}

function CellValue({ col, value, small }: { col: TrackerColumn; value: Entry['values'][string]; small?: boolean }) {
  if (value === undefined || value === '' || value === null) return <span className="text-muted-foreground">—</span>
  switch (col.type) {
    case 'rating': return <Stars n={Number(value)} />
    case 'currency': return <span className="tabular">£{Number(value).toFixed(2)}</span>
    case 'date': return <span className="tabular">{fmtDate(String(value))}</span>
    case 'checkbox': return <span>{value ? '✓' : '—'}</span>
    case 'status':
    case 'select':
      return <span className={cn('inline-block border border-border rounded-sm px-1.5 py-px bg-background', small ? 'text-[10.5px]' : 'text-[11.5px]')}>{String(value)}</span>
    default: return <span className={cn(small && 'text-[11px]')}>{String(value)}</span>
  }
}

function EntryDialog({ tracker, open, entry, onClose }: { tracker: Tracker; open: boolean; entry: Entry | null; onClose: () => void }) {
  const { addEntry, updateEntry } = useStore()
  const [form, setForm] = useState<Entry['values']>({})
  const base: Entry['values'] = { ...(entry?.values ?? {}), ...form }
  // default status for new entries
  const statusCol = tracker.columns.find(c => c.type === 'status')
  if (!entry && statusCol && base[statusCol.key] === undefined) base[statusCol.key] = statusCol.options?.[0] ?? ''
  const vis = visibleColumns(tracker, base)
  const set = (k: string, v: Entry['values'][string]) => setForm(f => ({ ...f, [k]: v }))

  function save() {
    const titleCol = tracker.columns.find(c => c.isTitle) ?? tracker.columns[0]
    if (!base[titleCol.key]) { toast.error(`${titleCol.name} is required`); return }
    if (entry) { updateEntry(entry.id, base); toast.success('Saved') }
    else { addEntry(tracker.id, base); toast.success(`Added to ${tracker.name}`) }
    setForm({}); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setForm({}); onClose() } }}>
      <DialogContent className="sm:max-w-[440px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{entry ? `Edit — ${tracker.name}` : `New ${tracker.name.replace(/s$/, '').toLowerCase()}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {vis.map(col => (
            <div key={col.key} className="grid gap-1.5">
              <Label className="text-xs">
                {col.name}{col.required && ' *'}
                {col.showWhen && <span className="text-muted-foreground"> — appears because {tracker.columns.find(c => c.key === col.showWhen!.columnKey)?.name} = {col.showWhen.equals}</span>}
              </Label>
              <ColumnInput col={col} value={base[col.key]} onChange={v => set(col.key, v)} />
            </div>
          ))}
          {tracker.columns.filter(c => !vis.includes(c)).map(c => (
            <p key={c.key} className="text-[11px] text-muted-foreground italic">“{c.name}” will appear when {tracker.columns.find(x => x.key === c.showWhen!.columnKey)?.name} reaches {c.showWhen!.equals}.</p>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{entry ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ColumnInput({ col, value, onChange }: { col: TrackerColumn; value: Entry['values'][string]; onChange: (v: Entry['values'][string]) => void }) {
  switch (col.type) {
    case 'longtext':
      return <Textarea rows={2} value={String(value ?? '')} onChange={e => onChange(e.target.value)} />
    case 'number':
    case 'currency':
      return <Input type="number" step="0.01" value={value === undefined ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
    case 'date':
      return <Input type="date" value={String(value ?? '')} onChange={e => onChange(e.target.value)} />
    case 'checkbox':
      return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-[hsl(152_22%_23%)]" />
    case 'rating':
      return <Stars n={Number(value ?? 0)} onChange={onChange} />
    case 'select':
    case 'status':
      return (
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>{col.options?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      )
    default:
      return <Input value={String(value ?? '')} onChange={e => onChange(e.target.value)} />
  }
}
