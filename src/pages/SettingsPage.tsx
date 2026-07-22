import React, { useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { ColumnType, PriorityScheme, Tier, TIER_LABELS, Tracker, TrackerColumn } from '@/lib/model'
import { actionUsage, categoryUsage, useStore } from '@/lib/store'
import { Cloud } from '@/lib/cloud'
import { THEMES } from '@/lib/themes'

const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  text: 'Text', longtext: 'Long text', number: 'Number', currency: 'Currency (£)', date: 'Date',
  select: 'Single choice', multiselect: 'Multiple choice', checkbox: 'Checkbox (yes/no)',
  rating: 'Rating (1–5)', url: 'Link (URL)', status: 'Status (also drives the board view)',
}
const OPTIONS_TYPES: ColumnType[] = ['select', 'multiselect', 'status']

function slugKey(name: string, existing: string[]): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
  let key = base, i = 2
  while (existing.includes(key)) { key = `${base}_${i}`; i++ }
  return key
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-card shadow-sm">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>
        {sub && <p className="text-[11.5px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <div className="px-4 py-3.5 grid gap-3">{children}</div>
    </section>
  )
}

function TrackerSetupRow({ tracker, expanded, onToggle, onUpdate }: {
  tracker: Tracker
  expanded: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<Tracker>) => void
}) {
  const columns = tracker.columns
  const setColumns = (next: TrackerColumn[]) => onUpdate({ columns: next })
  const updateColumn = (key: string, patch: Partial<TrackerColumn>) => setColumns(columns.map(c => c.key === key ? { ...c, ...patch } : c))

  function addColumn() {
    const name = `Field ${columns.length + 1}`
    setColumns([...columns, { key: slugKey(name, columns.map(c => c.key)), name, type: 'text' }])
  }
  function removeColumn(key: string) {
    if (columns.length <= 1) { toast.error('A tracker needs at least one field'); return }
    const wasTitle = columns.find(c => c.key === key)?.isTitle
    let next = columns.filter(c => c.key !== key)
    if (wasTitle && next.length) next = next.map((c, i) => i === 0 ? { ...c, isTitle: true } : c)
    setColumns(next)
  }
  const setTitle = (key: string) => setColumns(columns.map(c => ({ ...c, isTitle: c.key === key })))

  // A single-choice, status, or checkbox column is a valid conditional-visibility target as
  // soon as it exists — it doesn't need its options filled in first. Requiring that up front
  // was the bug: a freshly-added Status field with no options typed in yet couldn't be picked
  // as a dependency at all, so "Only show when" looked entirely missing on any new tracker
  // (built-in ones like Movies only ever look "complete" because their Status field already
  // has options saved). The value picker below falls back to free text when the target
  // doesn't have options yet, so setting this up never has to happen in a fixed order.
  // Multi-select is deliberately excluded — a multi-value field doesn't have a single "equals"
  // to compare against, so it can't gate another field the way a single choice/status/checkbox
  // can (a task can be tagged several platforms at once; there's no one value to match on).
  const optionColumns = columns.filter(c => c.type === 'select' || c.type === 'status' || c.type === 'checkbox')

  return (
    <div className={cn('border border-border rounded-sm bg-background', !tracker.active && 'opacity-60')}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <Input value={tracker.name} onChange={e => onUpdate({ name: e.target.value })} className="h-7 flex-1 text-[12.5px]" />
        <Select value={tracker.defaultView} onValueChange={v => onUpdate({ defaultView: v as Tracker['defaultView'] })}>
          <SelectTrigger className="h-7 w-[92px] text-[11px] shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="table">Table</SelectItem>
            <SelectItem value="board">Board</SelectItem>
            <SelectItem value="gallery">Gallery</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline" size="sm" className="h-7 text-[11px] px-2 shrink-0"
          onClick={() => { onUpdate({ active: !tracker.active }); toast(tracker.active ? `${tracker.name} archived` : `${tracker.name} restored`) }}
        >
          {tracker.active ? 'Archive' : 'Restore'}
        </Button>
        <button onClick={onToggle} className="text-[11px] text-muted-foreground shrink-0 underline underline-offset-2 hover:text-foreground">
          {columns.length} field{columns.length === 1 ? '' : 's'}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border p-2 grid gap-2">
          {columns.map(c => (
            <div key={c.key} className="grid gap-1.5 border border-border/70 rounded-sm p-2 bg-accent/20">
              <div className="flex items-center gap-1.5">
                <Input value={c.name} onChange={e => updateColumn(c.key, { name: e.target.value })} className="h-7 flex-1 text-[12px]" />
                <Select
                  value={c.type}
                  onValueChange={v => updateColumn(c.key, {
                    type: v as ColumnType,
                    options: OPTIONS_TYPES.includes(v as ColumnType) ? (c.options ?? []) : undefined,
                  })}
                >
                  <SelectTrigger className="h-7 w-[168px] text-[11px] shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(COLUMN_TYPE_LABELS) as ColumnType[]).map(t => <SelectItem key={t} value={t}>{COLUMN_TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button title="Remove field" className="text-muted-foreground hover:text-[hsl(8_60%_41%)] shrink-0" onClick={() => removeColumn(c.key)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {OPTIONS_TYPES.includes(c.type) && (
                <Input
                  placeholder="Options, comma-separated (e.g. To watch, Watching, Watched)"
                  value={(c.options ?? []).join(', ')}
                  onChange={e => updateColumn(c.key, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })}
                  className="h-7 text-[11.5px]"
                />
              )}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name={`title-${tracker.id}`} checked={!!c.isTitle} onChange={() => setTitle(c.key)} className="accent-[hsl(152_22%_23%)]" />
                  Title field
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!c.required} onChange={e => updateColumn(c.key, { required: e.target.checked })} className="accent-[hsl(152_22%_23%)]" />
                  Required
                </label>
              </div>
              {optionColumns.some(oc => oc.key !== c.key) ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-muted-foreground">Only show when</span>
                  <Select
                    value={c.showWhen?.columnKey ?? 'none'}
                    onValueChange={v => {
                      if (v === 'none') { updateColumn(c.key, { showWhen: undefined }); return }
                      const depCol = columns.find(oc => oc.key === v)
                      const defaultEquals = depCol?.type === 'checkbox' ? 'yes' : (depCol?.options?.[0] ?? '')
                      updateColumn(c.key, { showWhen: { columnKey: v, equals: defaultEquals } })
                    }}
                  >
                    <SelectTrigger className="h-6 w-[110px] text-[10.5px]"><SelectValue placeholder="none" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— none —</SelectItem>
                      {optionColumns.filter(oc => oc.key !== c.key).map(oc => <SelectItem key={oc.key} value={oc.key}>{oc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {c.showWhen && (() => {
                    const depCol = columns.find(oc => oc.key === c.showWhen!.columnKey)
                    const depOptions = depCol?.type === 'checkbox' ? ['yes', 'no'] : (depCol?.options ?? [])
                    return (
                      <>
                        <span className="text-muted-foreground">=</span>
                        {depOptions.length > 0 ? (
                          <Select value={c.showWhen.equals || undefined} onValueChange={v => updateColumn(c.key, { showWhen: { columnKey: c.showWhen!.columnKey, equals: v } })}>
                            <SelectTrigger className="h-6 w-[100px] text-[10.5px]"><SelectValue placeholder="value" /></SelectTrigger>
                            <SelectContent>
                              {depOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            placeholder="value (add options above, or type one here)"
                            value={c.showWhen.equals}
                            onChange={e => updateColumn(c.key, { showWhen: { columnKey: c.showWhen!.columnKey, equals: e.target.value } })}
                            className="h-6 w-[210px] text-[10.5px]"
                          />
                        )}
                      </>
                    )
                  })()}
                </div>
              ) : (
                <p className="text-[10.5px] text-muted-foreground italic">Add a Status, single-choice, or checkbox field to make other fields conditional on it — same as Movies' Rating only showing once Status reaches “Watched.” (Multiple choice fields can't be a dependency — there's no single value to match on.)</p>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" className="h-7 text-[11px] self-start" onClick={addColumn}>
            <Plus className="h-3.5 w-3.5 mr-1" />Field
          </Button>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage({ cloud }: { cloud?: Cloud }) {
  const {
    state, updateSettings, updateFeatures, updateArea, addArea, addCategory, updateCategory, deleteCategory,
    addAction, updateAction, deleteAction,
    addCollection, updateCollection, addTracker, updateTracker,
  } = useStore()
  const s = state.settings
  const [newArea, setNewArea] = useState('')
  const [newCat, setNewCat] = useState('')
  const [newCatParent, setNewCatParent] = useState('none')
  const [newAction, setNewAction] = useState('')
  const [phone, setPhoneInput] = useState(cloud?.profile.phone ?? '')
  const [newCollection, setNewCollection] = useState('')
  const [newTracker, setNewTracker] = useState<Record<string, string>>({}) // per-collection draft name
  const [expandedTracker, setExpandedTracker] = useState<string | null>(null)

  // Everything on this page autosaves as you type (same store as every other page) — this
  // bar is purely a visible confirmation so it's never in doubt, plus a Save button for
  // anyone who wants to explicitly confirm rather than trust the autosave.
  const [savedAt, setSavedAt] = useState<Date>(() => new Date())
  const [saving, setSaving] = useState(false)
  const firstRender = React.useRef(true)
  React.useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    setSaving(true)
    const t = setTimeout(() => { setSaving(false); setSavedAt(new Date()) }, 350)
    return () => clearTimeout(t)
  }, [state])

  // group categories under their top-level parent so sub/secondary levels sit right below it
  const rootIndex = (c: typeof state.categories[number]): number => {
    let cur = c
    while (cur.parentId) {
      const parent = state.categories.find(p => p.id === cur.parentId)
      if (!parent) break
      cur = parent
    }
    return state.categories.indexOf(cur)
  }
  const sortedCategories = state.categories
    .map((c, i) => ({ c, i }))
    .sort((x, y) => {
      const rx = rootIndex(x.c), ry = rootIndex(y.c)
      if (rx !== ry) return rx - ry
      if (x.c.level !== y.c.level) return x.c.level - y.c.level
      return x.i - y.i
    })
    .map(x => x.c)

  const features: { key: keyof typeof s.features; label: string; sub: string }[] = [
    { key: 'whatsapp', label: 'WhatsApp', sub: 'Capture + brief + nudges (Business API / Twilio)' },
    { key: 'emailForward', label: 'Email forwarding', sub: 'Forward or BCC to the capture address' },
    { key: 'gmail', label: 'Gmail', sub: 'Pull contacts, link threads — read-only by default' },
    { key: 'outlook', label: 'Outlook / Office 365', sub: 'Personal and 365 mailboxes' },
    { key: 'calendar', label: 'Calendar', sub: 'Capacity check accounts for meetings' },
    { key: 'sms', label: 'SMS', sub: 'Capture and receive the brief by text' },
    { key: 'slack', label: 'Share to Slack', sub: 'Push tasks to a channel; replies flow back' },
    { key: 'teams', label: 'Share to Teams', sub: 'Hand items to a colleague or chat' },
    { key: 'voiceNotes', label: 'Voice-note transcription', sub: 'Voice messages become text captures' },
    { key: 'collections', label: 'Notes & Collections', sub: 'Custom trackers module — off hides it everywhere' },
    { key: 'morningBrief', label: 'Morning brief', sub: 'The daily push — 30-second read' },
  ]

  return (
    <div className="grid gap-4">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border border-border bg-card shadow-sm px-4 py-2 rounded-sm">
        <span className="text-[12px] text-muted-foreground">
          {saving ? 'Saving…' : `Everything on this page autosaves as you type — last saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        </span>
        <Button
          size="sm" className="h-7 text-[11.5px] shrink-0"
          onClick={() => {
            setSaving(true)
            setTimeout(() => { setSaving(false); setSavedAt(new Date()); toast.success('All changes saved') }, 300)
          }}
        >
          <Check className="h-3.5 w-3.5 mr-1" />Save
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
      <div className="grid gap-4">
        <Section title="Appearance" sub="Pick a color palette for the whole app — takes effect immediately, everywhere.">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {THEMES.map(t => {
              const active = s.theme === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => updateSettings({ theme: t.id })}
                  className={cn(
                    'text-left border rounded-sm px-2.5 py-2 transition-colors',
                    active ? 'border-[hsl(152_22%_23%)] ring-1 ring-[hsl(152_22%_23%)]' : 'border-border hover:bg-accent',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex -space-x-1 shrink-0">
                      {t.swatch.map((c, i) => (
                        <span key={i} className="h-4 w-4 rounded-full border border-black/10" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="text-[12.5px] font-medium flex-1">{t.name}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-[hsl(152_22%_23%)]" />}
                  </div>
                  <p className="text-[10.5px] text-muted-foreground leading-snug">{t.blurb}</p>
                </button>
              )
            })}
          </div>
        </Section>
        <Section title="Focus areas" sub="Add, rename, colour, retire — archiving preserves all history. Keep to 3–6.">
          {state.areas.map(a => (
            <div key={a.id} className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: a.color }} />
              <Input
                value={a.name}
                onChange={e => updateArea(a.id, { name: e.target.value })}
                className="h-8 flex-1"
              />
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                <Switch checked={a.inBrief} onCheckedChange={v => updateArea(a.id, { inBrief: v })} className="scale-75" />brief
              </label>
              <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => { updateArea(a.id, { active: !a.active }); toast(a.active ? `${a.name} archived — history preserved` : `${a.name} restored`) }}>
                {a.active ? 'Archive' : 'Restore'}
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input placeholder="New area…" value={newArea} onChange={e => setNewArea(e.target.value)} className="h-8" />
            <Button size="sm" className="h-8" onClick={() => { if (newArea.trim()) { addArea(newArea); setNewArea(''); toast.success('Area added') } }}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </Section>

        <Section title="Priority scheme" sub="Choose the model that matches how you think about urgency.">
          <div className="flex gap-1.5">
            {([['p', 'P0–P3'], ['hml', 'High / Med / Low'], ['num', '1–5 scale']] as [PriorityScheme, string][]).map(([v, l]) => (
              <button key={v} onClick={() => { updateSettings({ priorityScheme: v }); toast(`Priorities now shown as ${l} everywhere`) }}
                className={cn('px-3 py-1.5 text-[12.5px] border rounded-sm', s.priorityScheme === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent')}>
                {l}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={s.eisenhower} onCheckedChange={v => updateSettings({ eisenhower: v })} />
            Urgent / important (Eisenhower) matrix grouping
          </label>
        </Section>

        <Section title="Categories — main / sub / secondary" sub="Rename, retire, or bring back — archiving preserves all history. Cross-cutting labels used on tasks, contacts and vendors; every one is reportable. Tag a category to specific focus areas and it only shows up there — leave it untagged to keep it everywhere.">
          <div className="grid gap-2">
            {sortedCategories.map(c => {
              const tagged = c.areaIds ?? []
              const usage = categoryUsage(state, c.id)
              return (
                <div key={c.id} className={cn('grid gap-1', c.parentId && 'pl-5')}>
                  <div className="flex items-center gap-2">
                    {c.parentId && <span className="text-muted-foreground text-[11px] shrink-0">›</span>}
                    {c.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c.color }} />}
                    <Input
                      value={c.name}
                      onChange={e => updateCategory(c.id, { name: e.target.value })}
                      className={cn('h-8 flex-1 text-[12.5px]', !c.active && 'opacity-50')}
                    />
                    {usage > 0 && (
                      <span className="text-[10.5px] text-muted-foreground whitespace-nowrap shrink-0" title="In use — archive keeps it out of new work while preserving history">
                        in use ×{usage}
                      </span>
                    )}
                    <Button
                      variant="outline" size="sm" className="h-8 text-[11px] px-2 shrink-0"
                      onClick={() => { updateCategory(c.id, { active: !c.active }); toast(c.active ? `${c.name} archived — history preserved` : `${c.name} restored`) }}
                    >
                      {c.active ? 'Archive' : 'Restore'}
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-8 text-[11px] px-2 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => {
                        const msg = usage > 0
                          ? `"${c.name}" is still in use ×${usage} (tasks, captures, or subcategories). Deleting it now will leave those pointing at a category that no longer exists — you'll need to manually re-tag them afterward. Delete anyway?`
                          : `Permanently delete "${c.name}"? It's never been used, so there's no history to lose — but this can't be undone.`
                        if (!window.confirm(msg)) return
                        deleteCategory(c.id, usage > 0)
                        toast.success(usage > 0 ? `${c.name} deleted — ${usage} task${usage === 1 ? '' : 's'} left untagged` : `${c.name} deleted`)
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pl-1">
                    <span className="text-[10.5px] text-muted-foreground mr-0.5">
                      {tagged.length === 0 ? 'Shows under every area —' : 'Shows under:'}
                    </span>
                    {state.areas.filter(a => a.active).map(a => {
                      const on = tagged.includes(a.id)
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            const next = on ? tagged.filter(id => id !== a.id) : [...tagged, a.id]
                            updateCategory(c.id, { areaIds: next })
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors',
                            on ? 'border-transparent text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent',
                          )}
                          style={on ? { background: a.color } : undefined}
                        >
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: on ? 'hsl(0 0% 100% / 0.85)' : a.color }} />
                          {a.name}
                        </button>
                      )
                    })}
                    {tagged.length > 0 && (
                      <button
                        type="button"
                        onClick={() => updateCategory(c.id, { areaIds: [] })}
                        className="text-[10.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        clear (show everywhere)
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Input placeholder="New category…" value={newCat} onChange={e => setNewCat(e.target.value)} className="h-8" />
            <Select value={newCatParent} onValueChange={setNewCatParent}>
              <SelectTrigger className="h-8 w-36 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Main level</SelectItem>
                {state.categories.filter(c => c.level === 0 && c.active).map(c => <SelectItem key={c.id} value={c.id}>under {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8" onClick={() => {
              if (!newCat.trim()) return
              addCategory({ name: newCat, parentId: newCatParent === 'none' ? undefined : newCatParent, level: newCatParent === 'none' ? 0 : 1 })
              setNewCat(''); toast.success('Category added — now in every dropdown and report')
            }}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </Section>

        <Section title="Actions" sub="What kind of action a task is — Call, Meeting, Decide, Email… A flat, separate list from Category (the sub-topic under a focus area) and from the task's Type field, which it supplements rather than replaces.">
          <div className="grid gap-2">
            {state.actions.map(a => {
              const usage = actionUsage(state, a.id)
              return (
                <div key={a.id} className="flex items-center gap-2">
                  {a.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: a.color }} />}
                  <Input
                    value={a.name}
                    onChange={e => updateAction(a.id, { name: e.target.value })}
                    className={cn('h-8 flex-1 text-[12.5px]', !a.active && 'opacity-50')}
                  />
                  {usage > 0 && (
                    <span className="text-[10.5px] text-muted-foreground whitespace-nowrap shrink-0" title="In use — archive keeps it out of new work while preserving history">
                      in use ×{usage}
                    </span>
                  )}
                  <Button
                    variant="outline" size="sm" className="h-8 text-[11px] px-2 shrink-0"
                    onClick={() => { updateAction(a.id, { active: !a.active }); toast(a.active ? `${a.name} archived — history preserved` : `${a.name} restored`) }}
                  >
                    {a.active ? 'Archive' : 'Restore'}
                  </Button>
                  <Button
                    variant="outline" size="sm" className="h-8 text-[11px] px-2 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      const msg = usage > 0
                        ? `"${a.name}" is still in use ×${usage} (tasks or captures). Deleting it now will leave those pointing at an action that no longer exists — you'll need to manually re-tag them afterward. Delete anyway?`
                        : `Permanently delete "${a.name}"? It's never been used, so there's no history to lose — but this can't be undone.`
                      if (!window.confirm(msg)) return
                      deleteAction(a.id, usage > 0)
                      toast.success(usage > 0 ? `${a.name} deleted — ${usage} task${usage === 1 ? '' : 's'} left untagged` : `${a.name} deleted`)
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Input placeholder="New action…" value={newAction} onChange={e => setNewAction(e.target.value)} className="h-8" />
            <Button size="sm" className="h-8" onClick={() => {
              if (!newAction.trim()) return
              addAction({ name: newAction })
              setNewAction(''); toast.success('Action added — now available on tasks')
            }}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </Section>

        <Section title="Contacts & cadence" sub="Targets, not rules — override per person on their detail page.">
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(TIER_LABELS) as Tier[]).map(t => (
              <div key={t} className="grid gap-1">
                <Label className="text-xs">{TIER_LABELS[t]} — every N days</Label>
                <Input type="number" value={s.tierCadence[t]} className="h-8"
                  onChange={e => updateSettings({ tierCadence: { ...s.tierCadence, [t]: Number(e.target.value) || 1 } })} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Daily call goal</Label>
              <Input type="number" value={s.callGoal} className="h-8" onChange={e => updateSettings({ callGoal: Number(e.target.value) || 1 })} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Default follow-up interval (days)</Label>
              <Input type="number" value={s.followUpDays} className="h-8" onChange={e => updateSettings({ followUpDays: Number(e.target.value) || 1 })} />
            </div>
          </div>
        </Section>
      </div>

      <div className="grid gap-4">
        <Section title="Turn features on and off" sub="The switchboard — off hides its fields and menus everywhere.">
          {features.map(f => (
            <label key={f.key} className="flex items-center gap-3 cursor-pointer">
              <Switch checked={s.features[f.key]} onCheckedChange={v => { updateFeatures({ [f.key]: v }); toast(`${f.label} ${v ? 'on' : 'off — hidden everywhere'}`) }} />
              <span className="text-[13px]">{f.label}<span className="block text-[11px] text-muted-foreground">{f.sub}</span></span>
            </label>
          ))}
        </Section>

        {s.features.collections && (
          <Section title="Notes & Collections — set up your own trackers" sub="Build whatever custom lists you want — movies, subscriptions, vendors to compare — with your own fields on each. Every field you add here shows up automatically in that tracker's table/board/gallery views and its Excel import/export template.">
            <div className="grid gap-3">
              {state.collections.map(col => (
                <div key={col.id} className="border border-border rounded-sm">
                  <div className="flex items-center gap-2 px-2.5 py-2 bg-accent/30">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: col.color }} />
                    <Input
                      value={col.name}
                      onChange={e => updateCollection(col.id, { name: e.target.value })}
                      className={cn('h-7 flex-1 text-[12.5px] bg-background', !col.active && 'opacity-50')}
                    />
                    <Button
                      variant="outline" size="sm" className="h-7 text-[11px] px-2 shrink-0"
                      onClick={() => { updateCollection(col.id, { active: !col.active }); toast(col.active ? `${col.name} archived — history preserved` : `${col.name} restored`) }}
                    >
                      {col.active ? 'Archive' : 'Restore'}
                    </Button>
                  </div>
                  <div className="grid gap-1.5 p-2">
                    {state.trackers.filter(t => t.collectionId === col.id).map(trk => (
                      <TrackerSetupRow
                        key={trk.id}
                        tracker={trk}
                        expanded={expandedTracker === trk.id}
                        onToggle={() => setExpandedTracker(x => x === trk.id ? null : trk.id)}
                        onUpdate={patch => updateTracker(trk.id, patch)}
                      />
                    ))}
                    <div className="flex gap-2 mt-0.5">
                      <Input
                        placeholder="New tracker…"
                        value={newTracker[col.id] ?? ''}
                        onChange={e => setNewTracker(m => ({ ...m, [col.id]: e.target.value }))}
                        className="h-8 text-[12.5px]"
                      />
                      <Button
                        size="sm" className="h-8 shrink-0"
                        onClick={() => {
                          const name = (newTracker[col.id] ?? '').trim()
                          if (!name) return
                          const trk = addTracker({ name, collectionId: col.id })
                          setNewTracker(m => ({ ...m, [col.id]: '' }))
                          setExpandedTracker(trk.id)
                          toast.success(`${name} added — set up its fields below`)
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />Tracker
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="New collection…" value={newCollection} onChange={e => setNewCollection(e.target.value)} className="h-8" />
              <Button
                size="sm" className="h-8"
                onClick={() => {
                  if (!newCollection.trim()) return
                  addCollection({ name: newCollection.trim() })
                  setNewCollection('')
                  toast.success('Collection added — add a tracker inside it next')
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />Collection
              </Button>
            </div>
          </Section>
        )}

        <Section title="Text-in capture number" sub="Register your own phone number — a text or WhatsApp message sent from it is matched to your account and filed straight into your Inbox.">
          {cloud ? (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="+15551234567 (E.164 format)"
                  value={phone}
                  onChange={e => setPhoneInput(e.target.value)}
                  onBlur={async () => {
                    if (phone.trim() === (cloud.profile.phone ?? '')) return
                    const err = await cloud.setPhone(phone)
                    if (err) toast.error(err)
                    else toast.success(phone.trim() ? 'Number saved — texts from it will land in your Inbox' : 'Number removed')
                  }}
                  className="h-8 flex-1"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Include the country code (e.g. +1 for US/Canada). Each person on the account registers their own number here — a message only files into the account whose number sent it.
              </p>
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground italic">Sign in to a real account to register a number.</p>
          )}
        </Section>

        <Section title="Daily capacity & rebalancing" sub="When a day overflows, the lowest-priority non-time-critical items move to the next open day — and you’re told exactly what shifted.">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Tasks per day before overflow</Label>
              <Input type="number" value={s.dailyCapacity} className="h-8" onChange={e => updateSettings({ dailyCapacity: Number(e.target.value) || 1 })} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Project stall threshold (days)</Label>
              <Input type="number" value={s.stallDays} className="h-8" onChange={e => updateSettings({ stallDays: Number(e.target.value) || 1 })} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Active projects per area (WIP guardrail)</Label>
              <Input type="number" value={s.projectWipLimit} className="h-8" onChange={e => updateSettings({ projectWipLimit: Number(e.target.value) || 1 })} />
            </div>
          </div>
        </Section>

        <Section title="Morning brief & nudges">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Channel</Label>
              <Select value={s.briefChannel} onValueChange={v => updateSettings({ briefChannel: v as never })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Send time</Label>
              <Input type="time" value={s.briefTime} className="h-8" onChange={e => updateSettings({ briefTime: e.target.value })} />
            </div>
          </div>
        </Section>

        <Section title="Quick actions" sub="Pick the one-tap buttons on task and contact rows.">
          {([['done', 'Done / Complete'], ['called', 'Called — needs follow-up'], ['snooze', 'Snooze / defer'], ['reassign', 'Reassign area']] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-3 cursor-pointer">
              <Switch checked={s.quickActions[k]} onCheckedChange={v => updateSettings({ quickActions: { ...s.quickActions, [k]: v } })} />
              <span className="text-[13px]">{l}</span>
            </label>
          ))}
        </Section>

        <Section title="Multi-user & accounts" sub="Later phase — the data model won’t block it.">
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            Sign-up, log-in and password reset · roles (owner / member / view-only) · per-user settings and isolation ·
            a super-admin login that can impersonate for support, with every such action clearly marked in the audit trail.
            Prove the single-user system first; add this layer when you decide to commercialize.
          </p>
        </Section>
      </div>
      </div>
    </div>
  )
}
