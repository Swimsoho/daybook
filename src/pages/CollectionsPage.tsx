import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpDown, Calendar, CalendarPlus, CheckSquare, ChevronDown, ChevronUp, Download, Loader2, Plus, Search, Sparkles, Trash2, Tv, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Entry, Tracker, TrackerColumn, today } from '@/lib/model'
import { useStore } from '@/lib/store'
import { useIsMobile } from '@/mobile/lib/useIsMobile'
import { useCloud, type EntrySuggestion } from '@/lib/cloud'
import { ExportMenu } from '@/components/ExportMenu'
import { ViewExport } from '@/lib/exportView'
import { EmptyNote, Stars } from '@/components/bits'
import { ColumnDropdown, SPREADSHEET_ACCEPT, downloadXlsxTemplateWithDropdowns, parseSpreadsheetFile } from '@/lib/xlsxTemplate'

// Sentinel sort key for "When added" — sorts by the entry's own `created` stamp (+ insertion
// order) rather than any tracker column, so it can't collide with a real column key.
const CREATED_KEY = '__created'

// A "watch list" tracker (Movies, TV Shows, Watchlist…) — the ones the live "where to watch"
// lookup applies to. Detected by the tracker's own name so it works for any list the user made.
function isWatchTracker(t: Tracker): boolean {
  return /movie|film|tv|show|series|watch|cinema/i.test(t.name)
}
// The column a looked-up US streaming string should be written into: a text column named like
// Platform / Streaming / Where to watch / Provider. Falls back to none (result just displays).
function streamingColumn(t: Tracker): TrackerColumn | undefined {
  return t.columns.find(c => (c.type === 'text' || c.type === 'longtext') && /platform|stream|where|watch|provider/i.test(c.name))
}
// The Year / Release-date column — used both to sharpen the TMDB match and as the target the
// lookup writes the release date into.
function yearColumn(t: Tracker): TrackerColumn | undefined {
  return t.columns.find(c => /\byear\b|releas/i.test(c.name))
}
// Tracker date cells show the YEAR (unlike task due-dates, which fmtDate keeps compact as "21 Jul")
// — a movie release, a subscription renewal, a birthday spans many years and the year is the point.
// A non-date value (e.g. a plain year typed into a text/number column) passes straight through.
function fmtTrackerDate(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const dt = new Date(v + 'T12:00:00')
  return isNaN(dt.getTime()) ? v : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Format TMDB's release info for whatever type the release column is: a full YYYY-MM-DD for a
// date column, the numeric year for a number column, the year string otherwise.
function releaseValueFor(col: TrackerColumn, matched: { year?: string; releaseDate?: string }): Entry['values'][string] | undefined {
  if (col.type === 'date') {
    const d = matched.releaseDate ?? ''
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined
  }
  const y = matched.year ?? ''
  if (!y) return undefined
  return col.type === 'number' ? Number(y) : y
}

// A dependency can be a Status/single-choice column (compared as plain strings) or, as of the
// checkbox-gating support, a Checkbox column — those store real booleans in `values`, not the
// 'yes'/'no' strings `showWhen.equals` holds, so they need converting before the comparison.
function showWhenMet(trk: Tracker, values: Entry['values'], showWhen: NonNullable<TrackerColumn['showWhen']>): boolean {
  const depCol = trk.columns.find(c => c.key === showWhen.columnKey)
  const raw = values[showWhen.columnKey]
  if (depCol?.type === 'checkbox') return (raw ? 'yes' : 'no') === showWhen.equals
  return raw === showWhen.equals
}

function visibleColumns(trk: Tracker, values: Entry['values']): TrackerColumn[] {
  return trk.columns.filter(c => !c.showWhen || showWhenMet(trk, values, c.showWhen))
}

function titleOf(trk: Tracker, e: Entry): string {
  const col = trk.columns.find(c => c.isTitle) ?? trk.columns[0]
  return String(e.values[col.key] ?? '—')
}

// Notes and Ideas each get their own top-level tab rather than being lumped in with the
// structured Collections (Movies, Books, Subscriptions, ...) — each is a different kind of
// thing (a free-form catch-all / an idea holding-pen vs. a purpose-built watch-list), and
// sitting in the same flat row of pills made them easy to miss or mistake for just another
// tracker. Matched by name rather than a hardcoded id so it still works if either seeded
// collection is ever recreated. Anything that isn't Notes or Ideas is a plain "collection."
type TopTab = 'collections' | 'notes' | 'ideas' | 'dates'
function collectionGroup(state: { collections: { id: string; name: string }[] }, collectionId: string | undefined): TopTab {
  const name = state.collections.find(c => c.id === collectionId)?.name.trim().toLowerCase()
  if (name === 'notes') return 'notes'
  if (name === 'ideas') return 'ideas'
  // 'personal' kept as an alias so any older account that seeded the dates tracker under a
  // "Personal" collection still lands its dates in this tab rather than under Collections.
  if (name === 'dates' || name === 'personal') return 'dates'
  return 'collections'
}

export default function CollectionsPage() {
  const { state, updateEntry } = useStore()
  const cloud = useCloud()
  const isMobile = useIsMobile().isMobile
  const [bulkLookup, setBulkLookup] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  /**
   * Multi-select. Off by default: checkboxes on every row all the time make a reading view
   * feel like a form. Turning Select on reveals them and the action bar.
   */
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const toggleSelected = (id: string) =>
    setSelected(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
  const clearSelection = () => { setSelected([]); setSelectMode(false) }
  const trackers = state.trackers.filter(t => t.active)
  const grp = (t: Tracker) => collectionGroup(state, t.collectionId)
  const trackersByTab: Record<TopTab, Tracker[]> = {
    collections: trackers.filter(t => grp(t) === 'collections'),
    notes: trackers.filter(t => grp(t) === 'notes'),
    ideas: trackers.filter(t => grp(t) === 'ideas'),
    dates: trackers.filter(t => grp(t) === 'dates'),
  }
  const hasNotesTab = trackersByTab.notes.length > 0
  const hasIdeasTab = trackersByTab.ideas.length > 0
  const hasDatesTab = trackersByTab.dates.length > 0
  // Show the tab bar only when there's actually more than one group to split between.
  const showTabBar = hasNotesTab || hasIdeasTab || hasDatesTab

  const firstTab: TopTab = trackersByTab.collections.length ? 'collections' : hasNotesTab ? 'notes' : hasIdeasTab ? 'ideas' : 'dates'
  const [topTab, setTopTab] = useState<TopTab>(firstTab)
  const groupTrackers = trackersByTab[topTab]
  const groupCollections = state.collections.filter(c => c.active && collectionGroup(state, c.id) === topTab)

  const [trackerId, setTrackerId] = useState(groupTrackers[0]?.id ?? '')
  const tracker = groupTrackers.find(t => t.id === trackerId) ?? groupTrackers[0]
  const [view, setView] = useState<'table' | 'board' | 'gallery' | null>(null)
  const [adding, setAdding] = useState(false)
  const [editEntry, setEditEntry] = useState<Entry | null>(null)
  const [importing, setImporting] = useState(false)
  // Search / sort / per-column filters — apply to every tracker's table, board and gallery.
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  // Free-text per-column filters typed into the boxes under each table header — e.g. "2026" under
  // Release date, "netflix" under Platform. Matched against the same rendered cell text as search.
  const [colText, setColText] = useState<Record<string, string>>({})
  // Reset them when you switch to a different tracker, so a filter from one list never silently
  // hides rows in the next.
  useEffect(() => { setSearch(''); setSort(null); setColFilters({}); setColText({}) }, [trackerId])

  function switchTopTab(next: TopTab) {
    setTopTab(next)
    const nextGroup = trackersByTab[next]
    if (!nextGroup.some(t => t.id === trackerId)) setTrackerId(nextGroup[0]?.id ?? '')
    setView(null)
  }
  const TAB_LABEL: Record<TopTab, string> = { collections: 'Collections', notes: 'Notes', ideas: 'Ideas', dates: 'Dates' }

  // On a phone the wide table and the multi-column board don't read well; the stacked "table"
  // (rendered as cards below) is the most legible default. Honour an explicit choice either way.
  const activeView = view ?? (isMobile ? 'table' : (tracker?.defaultView ?? 'table'))
  const entries = useMemo(() => state.entries.filter(e => e.trackerId === tracker?.id), [state.entries, tracker])
  const statusCol = tracker?.columns.find(c => c.type === 'status')
  // The board groups entries into one column per Status option, so it can only draw itself when the
  // list has a Status-type column AND that column actually has options typed in. Without both, the
  // board would render blank — so we show a plain-language explanation instead (see the Board block).
  const boardReady = !!statusCol && (statusCol.options?.length ?? 0) > 0

  // Columns that can drive a header filter dropdown (single-choice ones).
  const filterCols = useMemo(() => (tracker?.columns ?? []).filter(c => c.type === 'select' || c.type === 'status'), [tracker])
  // Text of a cell for searching; a comparable value for sorting (numbers stay numeric).
  const cellText = (col: TrackerColumn, v: unknown): string => {
    if (v === undefined || v === null || v === '') return ''
    if (col.type === 'date') return fmtTrackerDate(String(v))
    if (col.type === 'checkbox') return v ? 'yes' : 'no'
    return String(v)
  }
  const NUMERIC = ['number', 'currency', 'rating']
  const sortVal = (col: TrackerColumn | undefined, v: unknown): number | string => {
    if (v === undefined || v === null || v === '') return col && NUMERIC.includes(col.type) ? -Infinity : ''
    if (col && NUMERIC.includes(col.type)) return Number(v)
    if (col?.type === 'checkbox') return v ? 1 : 0
    if (col?.type === 'date') return String(v) // ISO sorts lexically
    return String(v).toLowerCase()
  }

  const displayEntries = useMemo(() => {
    if (!tracker) return [] as Entry[]
    let list = entries
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(e => tracker.columns.some(c => cellText(c, e.values[c.key]).toLowerCase().includes(q)))
    for (const [k, val] of Object.entries(colFilters)) {
      if (!val) continue
      list = list.filter(e => String(e.values[k] ?? '') === val)
    }
    for (const [k, val] of Object.entries(colText)) {
      const needle = val.trim().toLowerCase()
      if (!needle) continue
      const col = tracker.columns.find(c => c.key === k)
      if (!col) continue
      list = list.filter(e => cellText(col, e.values[k]).toLowerCase().includes(needle))
    }
    if (sort) {
      if (sort.key === CREATED_KEY) {
        // "When added" — by the entry's created date, with its position in the tracker's own
        // entry list (insertion order) as the tiebreaker, since `created` is day-granular and
        // several entries can share a date. asc = oldest first, desc = newest first.
        const order = new Map(entries.map((e, i) => [e.id, i]))
        list = [...list].sort((a, b) => {
          const cmp = String(a.created).localeCompare(String(b.created)) || ((order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
          return sort.dir === 'asc' ? cmp : -cmp
        })
      } else {
        const col = tracker.columns.find(c => c.key === sort.key)
        list = [...list].sort((a, b) => {
          const av = sortVal(col, a.values[sort.key]), bv = sortVal(col, b.values[sort.key])
          const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
          return sort.dir === 'asc' ? cmp : -cmp
        })
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker, entries, search, sort, colFilters, colText])

  const filtersActive = !!search || !!sort || Object.values(colFilters).some(Boolean) || Object.values(colText).some(v => v.trim())
  const clearControls = () => { setSearch(''); setSort(null); setColFilters({}); setColText({}) }
  const toggleSort = (key: string) => setSort(s => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  // Bulk "where to watch" — fill the streaming column (and the release-date column, if the list
  // has one) for every entry that's missing it, on a watch-list tracker. Sequential + gentle so it
  // doesn't hammer TMDB; a running toast shows progress. Only blank cells are filled, so re-running
  // just tops up new ones — it never overwrites anything you've entered.
  async function bulkStreamingLookup() {
    if (!tracker) return
    const col = streamingColumn(tracker)
    const titleCol = tracker.columns.find(c => c.isTitle) ?? tracker.columns[0]
    const relCol = yearColumn(tracker)
    if (!col) { toast.error('Add a “Platform” / “Where to watch” text column to this list first (Settings → Notes & Collections).'); return }
    if (!cloud) { toast('Live lookup needs a signed-in account (it calls the TMDB backend).'); return }
    const needs = (e: Entry) => !String(e.values[col.key] ?? '').trim() || (relCol && !String(e.values[relCol.key] ?? '').trim())
    const todo = entries.filter(e => String(e.values[titleCol.key] ?? '').trim() && needs(e))
    if (!todo.length) { toast('Everything already has its platform' + (relCol ? ' and release date' : '') + '.'); return }
    setBulkLookup(true)
    let done = 0, filled = 0
    const tId = toast.loading(`Looking up 0/${todo.length}…`)
    try {
      for (const e of todo) {
        const title = String(e.values[titleCol.key] ?? '').trim()
        const yr = relCol ? String(e.values[relCol.key] ?? '') : ''
        const r = await cloud.lookupMovie(title, yr)
        done++
        if (r.error) { toast.error(r.error, { id: tId }); break }
        if (r.ok) {
          const patch: Entry['values'] = {}
          if (r.summary && !String(e.values[col.key] ?? '').trim()) patch[col.key] = r.summary
          if (relCol && r.matched && !String(e.values[relCol.key] ?? '').trim()) {
            const rv = releaseValueFor(relCol, r.matched)
            if (rv !== undefined && rv !== '') patch[relCol.key] = rv
          }
          if (Object.keys(patch).length) { updateEntry(e.id, patch); filled++ }
        }
        toast.loading(`Looking up ${done}/${todo.length}… (${filled} filled)`, { id: tId })
      }
      toast.success(`Done — filled ${filled} of ${todo.length}${relCol ? ' (platform + release date)' : ''}.`, { id: tId })
    } finally { setBulkLookup(false) }
  }

  if (!tracker) return <EmptyNote>Collections are switched off in Settings.</EmptyNote>

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Top-level split: Collections vs. Notes vs. Ideas, so the free-form catch-all and the
          idea holding-pen never blend in with the structured watch-lists/trackers */}
      {showTabBar && (
        <div className="flex items-center gap-1.5 -mb-1">
          {(['collections', 'notes', 'ideas', 'dates'] as const)
            .filter(t => t === 'collections' || trackersByTab[t].length > 0)
            .map(t => (
              <button
                key={t}
                onClick={() => switchTopTab(t)}
                className={cn(
                  'px-3 py-1.5 text-[12.5px] border rounded-sm transition-colors',
                  topTab === t ? 'bg-primary text-primary-foreground border-primary' : 'border-transparent hover:border-border hover:bg-accent',
                )}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
        </div>
      )}

      {/* Collection / tracker picker — each collection is its own clearly-labelled group so you
          can tell at a glance where one ends and the next begins. The label carries the
          collection's own colour as a solid chip; its trackers sit in a card beside it. */}
      <div className={cn('items-stretch', isMobile ? 'flex gap-2 overflow-x-auto pb-1 [&>*]:shrink-0' : 'flex flex-wrap gap-2.5')}>
        {groupCollections.map(col => {
          const trks = groupTrackers.filter(t => t.collectionId === col.id)
          if (!trks.length) return null
          return (
            <div key={col.id} className="inline-flex items-stretch rounded-md border border-border bg-card shadow-sm overflow-hidden">
              <span
                className="flex items-center px-3 text-[11px] font-bold uppercase tracking-[0.07em] text-white shrink-0"
                style={{ background: col.color }}
              >
                {col.name}
              </span>
              <div className="flex items-center gap-1 px-1.5 py-1">
                {trks.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTrackerId(t.id); setView(null) }}
                    className={cn(
                      'px-3 py-1 text-[13px] rounded-sm border transition-colors',
                      tracker.id === t.id
                        ? 'bg-primary text-primary-foreground border-primary font-semibold shadow-sm'
                        : 'border-transparent text-foreground/80 hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* View switch + row of actions. On desktop they share a line (actions pushed right); on a
          phone they stack, and the actions become a single horizontally-scrolling strip instead of
          wrapping into several cramped rows. */}
      <div className={cn('-mt-1', isMobile ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2')}>
        <div className={cn('flex border border-border rounded-md overflow-hidden shadow-sm', isMobile && 'self-start')}>
          {(['table', 'board', 'gallery'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-3.5 py-1 text-[12px] capitalize border-l first:border-l-0 border-border transition-colors',
                activeView === v ? 'bg-primary text-primary-foreground font-medium' : 'bg-card hover:bg-accent',
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className={cn('items-center gap-1.5', isMobile ? 'flex overflow-x-auto pb-1 [&>*]:shrink-0' : 'ml-auto flex flex-wrap')}>
          <ExportMenu className="h-7" getData={(): ViewExport => ({
            title: tracker.name,
            subtitle: [topTab !== 'collections' ? TAB_LABEL[topTab] : '', filtersActive ? 'filtered view' : ''].filter(Boolean).join(' · ') || undefined,
            headers: tracker.columns.map(c => c.name),
            rows: displayEntries.map(e => tracker.columns.map(c => cellText(c, e.values[c.key]))),
            filenameBase: `daybook-${tracker.name.toLowerCase().replace(/\s+/g, '-')}`,
          })} />
          <Button size="sm" variant="outline" className="h-7" onClick={() => downloadTrackerTemplate(tracker)}><Download className="h-3.5 w-3.5 mr-1" />Excel template</Button>
          {tracker.columns.some(c => c.type === 'date') && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => downloadTrackerIcs(tracker, entries)}>
              <CalendarPlus className="h-3.5 w-3.5 mr-1" />Add to Calendar
            </Button>
          )}
          {isWatchTracker(tracker) && (
            <Button size="sm" variant="outline" className="h-7" onClick={bulkStreamingLookup} disabled={bulkLookup} title="Fill 'where to watch' (US) for entries that don't have it yet">
              {bulkLookup ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Tv className="h-3.5 w-3.5 mr-1" />}Where to watch (US)
            </Button>
          )}
          {/* Suggestions work for any collection: watch-lists use TMDB, everything else (books,
              subscriptions, custom trackers) uses the LLM path. Shown on the Collections tab and on
              any watch-list; hidden on the free-form Notes/Ideas tabs where picks make no sense. */}
          {(topTab === 'collections' || isWatchTracker(tracker)) && (
            <Button size="sm" variant="outline" className="h-7 border-[hsl(40_65%_55%)] text-[hsl(40_65%_35%)]" onClick={() => setSuggesting(true)} title="Personalised recommendations based on this list and what's already on it">
              <Sparkles className="h-3.5 w-3.5 mr-1" />Suggest
            </Button>
          )}
          <Button
            size="sm"
            variant={selectMode ? 'default' : 'outline'}
            className="h-7"
            onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" />{selectMode ? 'Done' : 'Select'}
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setImporting(true)}><Upload className="h-3.5 w-3.5 mr-1" />Import</Button>
          <Button size="sm" className="h-7" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5 mr-1" />Entry</Button>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground -mt-1">
        {tracker.description} · columns are yours to define in Settings
        {tracker.columns.some(c => c.showWhen) && <> · <span className="italic">{tracker.columns.filter(c => c.showWhen).map(c => `“${c.name}” appears when ${tracker.columns.find(x => x.key === c.showWhen!.columnKey)?.name} = ${c.showWhen!.equals}`).join('; ')}</span></>}
      </p>

      {/* Search · filters · sort — works across table, board and gallery */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${tracker.name.toLowerCase()}…`}
              className="h-8 w-52 bg-card pl-7 text-[12.5px]"
            />
          </div>
          {filterCols.map(c => (
            <select
              key={c.key}
              value={colFilters[c.key] ?? ''}
              onChange={e => setColFilters(f => ({ ...f, [c.key]: e.target.value }))}
              className={cn(
                'h-8 rounded-md border bg-card px-2 text-[12px] cursor-pointer outline-none max-w-[160px]',
                colFilters[c.key] ? 'border-[hsl(17_63%_47%)] text-foreground' : 'border-border text-muted-foreground',
              )}
            >
              <option value="">All {c.name}</option>
              {c.options?.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          {/* Explicit sort — available in every view (in Table you can also click a header). Leads
              with "When added" (which no column header can give you), then every column both ways. */}
          <select
            value={sort ? `${sort.key}:${sort.dir}` : ''}
            onChange={e => {
              if (!e.target.value) { setSort(null); return }
              const idx = e.target.value.lastIndexOf(':')
              const key = e.target.value.slice(0, idx)
              const dir = e.target.value.slice(idx + 1)
              setSort({ key, dir: dir as 'asc' | 'desc' })
            }}
            className={cn(
              'h-8 rounded-md border bg-card px-2 text-[12px] cursor-pointer outline-none max-w-[190px]',
              sort ? 'border-[hsl(17_63%_47%)] text-foreground' : 'border-border text-muted-foreground',
            )}
          >
            <option value="">Sort…</option>
            <option value={`${CREATED_KEY}:desc`}>When added (newest first)</option>
            <option value={`${CREATED_KEY}:asc`}>When added (oldest first)</option>
            {tracker.columns.map(c => (
              <React.Fragment key={c.key}>
                <option value={`${c.key}:asc`}>{c.name} ↑</option>
                <option value={`${c.key}:desc`}>{c.name} ↓</option>
              </React.Fragment>
            ))}
          </select>
          <span className="text-[11.5px] text-muted-foreground tabular">{displayEntries.length}{displayEntries.length !== entries.length && ` of ${entries.length}`}</span>
          {filtersActive && (
            <button onClick={clearControls} className="text-[12px] text-[hsl(17_63%_47%)] hover:underline">Clear</button>
          )}
        </div>
      )}

      {/* TABLE */}
      {/* On a phone the wide table becomes a stacked list of cards — each entry reads top-to-bottom
          (title, then its filled-in fields as label/value lines, with the status control inline),
          so nothing is cut off the side of the screen. */}
      {activeView === 'table' && isMobile && (
        <MobileEntryCards
          tracker={tracker}
          entries={displayEntries}
          statusCol={statusCol}
          selectMode={selectMode}
          selected={selected}
          onToggleSelect={toggleSelected}
          onOpen={setEditEntry}
        />
      )}
      {entries.length === 0 && isMobile && activeView === 'table' && <EmptyNote>Nothing here yet.</EmptyNote>}
      {entries.length > 0 && displayEntries.length === 0 && isMobile && activeView === 'table' && <EmptyNote>No entries match your search or filters.</EmptyNote>}

      {activeView === 'table' && !isMobile && (
        <section className="border border-border bg-card shadow-sm rounded-lg overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                {selectMode && <th className="w-[28px]" />}
                {tracker.columns.map(c => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    title="Click to sort"
                    className="px-3 pt-2 pb-1.5 font-semibold whitespace-nowrap cursor-pointer select-none hover:text-foreground group"
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.name}{c.showWhen && ' *'}
                      {sort?.key === c.key
                        ? (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3 text-[hsl(17_63%_47%)]" /> : <ChevronDown className="h-3 w-3 text-[hsl(17_63%_47%)]" />)
                        : <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-70" />}
                    </span>
                  </th>
                ))}
              </tr>
              {/* Per-column filter boxes — type to narrow by that column (e.g. 2026 under Release date) */}
              <tr className="border-b border-border bg-muted/30">
                {tracker.columns.map(c => (
                  <th key={c.key} className="px-2 pb-1.5 pt-0.5 font-normal">
                    <input
                      value={colText[c.key] ?? ''}
                      onChange={e => setColText(f => ({ ...f, [c.key]: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                      placeholder="Filter…"
                      className={cn(
                        'h-6 w-full min-w-[70px] rounded-sm border bg-card px-1.5 text-[11px] font-normal normal-case tracking-normal outline-none placeholder:text-muted-foreground/60 focus:border-[hsl(17_63%_47%)]',
                        colText[c.key]?.trim() ? 'border-[hsl(17_63%_47%)] text-foreground' : 'border-border',
                      )}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayEntries.map(e => {
                const vis = visibleColumns(tracker, e.values)
                return (
                  <tr
                    key={e.id}
                    className={cn(
                      'border-b border-border/60 last:border-0 hover:bg-accent/50 cursor-pointer',
                      selected.includes(e.id) && 'bg-accent',
                    )}
                    onClick={() => (selectMode ? toggleSelected(e.id) : setEditEntry(e))}
                  >
                    {selectMode && (
                      <td className="pl-3 pr-0 py-2 w-[28px]">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                          checked={selected.includes(e.id)}
                          onChange={() => toggleSelected(e.id)}
                          onClick={ev => ev.stopPropagation()}
                        />
                      </td>
                    )}
                    {tracker.columns.map(c => {
                      const hidden = !vis.includes(c)
                      const v = e.values[c.key]
                      const flaggable = (c.type === 'status' || c.type === 'select') && (c.options?.length ?? 0) > 0
                      return (
                        <td key={c.key} className={cn('px-3 py-2', c.isTitle && 'font-medium')}>
                          {hidden ? <span className="text-border">·</span> : flaggable ? <InlineFlag entryId={e.id} col={c} value={v} /> : <CellValue col={c} value={v} />}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {entries.length === 0 && <EmptyNote>Nothing here yet.</EmptyNote>}
          {entries.length > 0 && displayEntries.length === 0 && <EmptyNote>No entries match your search or filters.</EmptyNote>}
          {tracker.columns.some(c => c.showWhen) && <p className="px-3 py-1.5 text-[10.5px] text-muted-foreground">* conditional column — appears once its status rule is met</p>}
        </section>
      )}

      {selectMode && (
        <BulkBar
          tracker={tracker}
          selected={selected}
          allIds={displayEntries.map(e => e.id)}
          onSelectAll={ids => setSelected(ids)}
          onClear={clearSelection}
        />
      )}

      {/* BOARD — needs a Status column with options; otherwise explain rather than render blank */}
      {activeView === 'board' && !boardReady && (
        <section className="border border-border bg-card shadow-sm rounded-lg">
          <EmptyNote>
            The <b>Board</b> view groups entries into columns by a <b>Status</b> field — this list {statusCol ? <>has a “{statusCol.name}” status column but <b>no options</b> filled in yet</> : <>doesn’t have a <b>Status</b> column yet</>}.
            {' '}Open <b>Settings → Notes &amp; Collections → {tracker.name}</b>, {statusCol ? <>add options to “{statusCol.name}”</> : <>add a <b>Status</b> column</>} — for a watch-list, use <i>Want to watch, Watching, Watched</i> (comma-separated). Then the Board shows a column for each, and you can drag titles between them. Until then, use the <b>Table</b> or <b>Gallery</b> view.
          </EmptyNote>
        </section>
      )}
      {activeView === 'board' && boardReady && statusCol && (
        <div className="grid grid-cols-1 gap-3" style={{ gridTemplateColumns: isMobile ? '1fr' : `repeat(${statusCol.options?.length ?? 3}, minmax(0,1fr))` }}>
          {statusCol.options?.map(stage => (
            <div
              key={stage}
              className="border border-border bg-card shadow-sm rounded-lg transition-shadow [&.dragover]:ring-2 [&.dragover]:ring-[hsl(17_63%_47%)]"
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
                <span className="tabular">{displayEntries.filter(e => e.values[statusCol.key] === stage).length}</span>
              </div>
              <div className="p-2 grid grid-cols-1 gap-2 min-h-[80px] content-start">
                {displayEntries.filter(e => e.values[statusCol.key] === stage).map(e => (
                  <button
                    key={e.id}
                    draggable
                    onDragStart={ev => { ev.dataTransfer.setData('text/entry-id', e.id); ev.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => setEditEntry(e)}
                    className="border border-border bg-background px-3 py-2 text-left hover:border-input transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <div className="text-[13px] font-medium">{titleOf(tracker, e)}</div>
                    {/* Secondary fields — for a watch list this is Starring and Release date,
                        which is what makes a card recognisable at a glance rather than a
                        bare title. Long text is excluded; it never fits on a card. */}
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {tracker.columns
                        .filter(c => !c.isTitle && c.type !== 'status' && c.type !== 'longtext' && visibleColumns(tracker, e.values).includes(c))
                        .filter(c => {
                          const v = e.values[c.key]
                          return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)
                        })
                        .slice(0, 3)
                        .map(c => (
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
          {displayEntries.map(e => {
            const rating = e.values['rating'] as number | undefined
            const stage = statusCol ? String(e.values[statusCol.key] ?? '') : ''
            const flaggable = !!statusCol && (statusCol.options?.length ?? 0) > 0
            return (
              <div key={e.id} className="border border-border bg-card shadow-sm rounded-lg text-left hover:-translate-y-0.5 transition-transform overflow-hidden">
                <button onClick={() => (selectMode ? toggleSelected(e.id) : setEditEntry(e))} className="block w-full text-left">
                  <div className="aspect-[3/2] flex items-center justify-center font-display-soft text-3xl text-[hsl(45_50%_96%)]" style={{ background: `linear-gradient(150deg, hsl(152 22% 26%), hsl(152 18% 18%))` }}>
                    {titleOf(tracker, e).slice(0, 1)}
                  </div>
                  <div className="px-3 pt-2">
                    <div className="text-[13px] font-medium truncate">{titleOf(tracker, e)}</div>
                    {/* the same secondary fields the board shows — a poster tile with only a
                        first initial and a status isn't enough to pick a film from */}
                    <div className="text-[11px] text-muted-foreground mt-0.5 grid gap-0.5">
                      {tracker.columns
                        .filter(c => !c.isTitle && c.type !== 'status' && c.type !== 'longtext' && c.type !== 'rating' && visibleColumns(tracker, e.values).includes(c))
                        .filter(c => {
                          const v = e.values[c.key]
                          return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)
                        })
                        .slice(0, 2)
                        .map(c => (
                          <span key={c.key} className="truncate"><CellValue col={c} value={e.values[c.key]} small /></span>
                        ))}
                    </div>
                  </div>
                </button>
                <div className="px-3 pb-2 pt-1 flex items-center justify-between gap-2">
                  {flaggable
                    ? <InlineFlag entryId={e.id} col={statusCol!} value={e.values[statusCol!.key]} />
                    : <span className="text-[11px] text-muted-foreground truncate">{stage}</span>}
                  {typeof rating === 'number' && <Stars n={rating} />}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <EntryDialog tracker={tracker} open={adding || !!editEntry} entry={editEntry} onClose={() => { setAdding(false); setEditEntry(null) }} />
      <ImportEntriesDialog tracker={tracker} open={importing} onClose={() => setImporting(false)} />
      <SuggestionsDialog tracker={tracker} entries={entries} open={suggesting} onClose={() => setSuggesting(false)} />
    </div>
  )
}

// Personalised "what to add next" recommendations for a collection, based on the list and what's
// already on it. Watch-lists (Movies/TV) get real titles from TMDB; every other list (books,
// subscriptions, restaurants, custom trackers) gets real items from the LLM path — both via the
// suggest-entries Edge Function. Each suggestion can be Added to the list or Ignored (for good).
function SuggestionsDialog({ tracker, entries, open, onClose }: { tracker: Tracker; entries: Entry[]; open: boolean; onClose: () => void }) {
  const { state, addEntry, updateSettings } = useStore()
  const cloud = useCloud()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<EntrySuggestion[]>([])
  const dismissed = state.settings.dismissedSuggestions ?? []
  const isWatch = isWatchTracker(tracker)
  const titleCol = tracker.columns.find(c => c.isTitle) ?? tracker.columns[0]
  const yearCol = yearColumn(tracker)
  const statusCol = tracker.columns.find(c => c.type === 'status')
  const nrm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const dkey = (title: string) => `${tracker.id}::${nrm(title)}`

  useEffect(() => {
    if (!open) return
    setSuggestions([]); setError(null)
    if (!cloud) { setError('Recommendations need your real (signed-in) account — the demo has no cloud connection.'); return }
    let cancelled = false
    setLoading(true)
    const owned = new Set(entries.map(e => nrm(titleOf(tracker, e))))
    const titles = entries
      .map(e => ({
        title: titleOf(tracker, e),
        year: yearCol ? String(e.values[yearCol.key] ?? '').slice(0, 4) : undefined,
        rating: typeof e.values['rating'] === 'number' ? (e.values['rating'] as number) : undefined,
      }))
      .filter(t => t.title)
    cloud.suggestEntries({
      titles,
      count: 12,
      kind: isWatch ? 'watch' : 'generic',
      context: { name: tracker.name, description: tracker.description },
    }).then(r => {
      if (cancelled) return
      setLoading(false)
      if (r.error) {
        const setup = isWatch
          ? 'Recommendations aren’t set up yet — deploy the suggest-entries Edge Function (uses your existing TMDB key). See claude/daybook-movie-streaming-setup.md.'
          : 'Recommendations for this list need the suggest-entries Edge Function with an Anthropic API key. See claude/daybook-movie-streaming-setup.md (step 6b).'
        setError(r.error.includes('not configured') || r.error.includes('Function not found') ? setup : r.error)
        return
      }
      const list = (r.suggestions ?? []).filter(s => !owned.has(nrm(s.title)) && !dismissed.includes(dkey(s.title)))
      setSuggestions(list)
      if (!list.length) setError(isWatch
        ? 'No fresh picks right now — add a few more titles (especially ones you’ve rated) and try again.'
        : 'No fresh picks right now — add a few items so it can read your taste, or try again.')
    }).catch(e => { if (!cancelled) { setLoading(false); setError(String(e?.message ?? e)) } })
    return () => { cancelled = true }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = (s: EntrySuggestion) => {
    const values: Entry['values'] = { [titleCol.key]: s.title }
    if (yearCol && s.year) values[yearCol.key] = s.year
    if (statusCol) values[statusCol.key] = statusCol.options?.[0] ?? ''
    addEntry(tracker.id, values)
    setSuggestions(list => list.filter(x => x.title !== s.title))
    toast.success(`Added “${s.title}” to ${tracker.name}`)
  }
  const ignore = (s: EntrySuggestion) => {
    updateSettings({ dismissedSuggestions: [...dismissed, dkey(s.title)] })
    setSuggestions(list => list.filter(x => x.title !== s.title))
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[580px] max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2"><Sparkles className="h-5 w-5 text-[hsl(40_65%_45%)]" />Suggestions for {tracker.name}</DialogTitle>
          <p className="text-[12.5px] text-muted-foreground">Personalised picks based on what’s already on your list. Add the ones you like — ignore the rest and they won’t come back.</p>
        </DialogHeader>
        {loading && <div className="py-10 text-center text-[13px] text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Finding recommendations from your list…</div>}
        {error && !loading && <div className="py-4 text-[13px] text-muted-foreground leading-relaxed">{error}</div>}
        {!loading && suggestions.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            {suggestions.map(s => (
              <div key={s.title} className="flex items-start gap-3 border border-border rounded-lg p-3 bg-card">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{s.title}{s.year && <span className="text-muted-foreground font-normal"> · {s.year}</span>}</div>
                  {s.why && <div className="text-[11px] text-[hsl(17_63%_47%)] font-medium mt-0.5">{s.why}</div>}
                  {s.overview && <p className="text-[12px] text-muted-foreground mt-1 line-clamp-3">{s.overview}</p>}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button size="sm" className="h-7 px-3 text-[12px]" onClick={() => add(s)}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-3 text-[12px] text-muted-foreground" onClick={() => ignore(s)}>Ignore</Button>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground text-center pt-1">Real {isWatch ? 'titles from TMDB' : 'picks'}, tuned to your list. Ignored picks are remembered.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Inline "flag" control — a compact status/select dropdown rendered right on a row or card, so you
// can look an item up and set its status (e.g. a movie → "Watched") in one click without opening
// the full editor. Stops click-through so it doesn't also open the entry dialog.
function InlineFlag({ entryId, col, value }: { entryId: string; col: TrackerColumn; value: Entry['values'][string] }) {
  const { updateEntry } = useStore()
  const cur = value === undefined || value === null ? '' : String(value)
  return (
    <select
      value={cur}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onChange={e => {
        e.stopPropagation()
        const val = e.target.value
        updateEntry(entryId, { [col.key]: val })
        toast.success(val ? `${col.name} → ${val}` : `${col.name} cleared`)
      }}
      className={cn(
        'max-w-[160px] h-7 rounded-md border px-2 text-[11.5px] cursor-pointer outline-none transition-colors',
        cur ? 'border-[hsl(17_63%_47%)] bg-[hsl(17_63%_47%_/_0.08)] text-foreground font-medium' : 'border-dashed border-border bg-card text-muted-foreground hover:border-input',
      )}
    >
      <option value="">— set {col.name.toLowerCase()} —</option>
      {col.options?.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function CellValue({ col, value, small }: { col: TrackerColumn; value: Entry['values'][string]; small?: boolean }) {
  if (value === undefined || value === '' || value === null) return <span className="text-muted-foreground">—</span>
  switch (col.type) {
    case 'rating': return <Stars n={Number(value)} />
    case 'currency': return <span className="tabular">£{Number(value).toFixed(2)}</span>
    case 'date': return <span className="tabular">{fmtTrackerDate(String(value))}</span>
    case 'checkbox': return <span>{value ? '✓' : '—'}</span>
    case 'status':
    case 'select':
      return <span className={cn('inline-block border border-border rounded-sm px-1.5 py-px bg-background', small ? 'text-[10.5px]' : 'text-[11.5px]')}>{String(value)}</span>
    default: return <span className={cn(small && 'text-[11px]')}>{String(value)}</span>
  }
}

// The phone rendering of the "table" view: one card per entry, reading top-to-bottom. Title first,
// then every filled-in field as a "Label: value" line, a rating as stars, and the status as an
// inline dropdown you can change in place — so a watch-list is legible on a narrow screen without
// horizontal scrolling. Tapping a card opens the full editor (or toggles it when selecting).
function MobileEntryCards({ tracker, entries, statusCol, selectMode, selected, onToggleSelect, onOpen }: {
  tracker: Tracker
  entries: Entry[]
  statusCol: TrackerColumn | undefined
  selectMode: boolean
  selected: string[]
  onToggleSelect: (id: string) => void
  onOpen: (e: Entry) => void
}) {
  const flaggable = !!statusCol && (statusCol.options?.length ?? 0) > 0
  return (
    <div className="grid grid-cols-1 gap-2">
      {entries.map(e => {
        const vis = visibleColumns(tracker, e.values)
        const rating = typeof e.values['rating'] === 'number' ? (e.values['rating'] as number) : undefined
        const fields = vis
          .filter(c => !c.isTitle && !(flaggable && statusCol && c.key === statusCol.key) && c.type !== 'rating')
          .filter(c => {
            const v = e.values[c.key]
            return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)
          })
        return (
          <div key={e.id} className={cn('border border-border rounded-lg bg-card shadow-sm p-3', selected.includes(e.id) && 'ring-2 ring-[hsl(17_63%_47%)]')}>
            <div className="flex items-start gap-2.5">
              {selectMode && (
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                  checked={selected.includes(e.id)}
                  onChange={() => onToggleSelect(e.id)}
                  onClick={ev => ev.stopPropagation()}
                />
              )}
              <button type="button" onClick={() => (selectMode ? onToggleSelect(e.id) : onOpen(e))} className="min-w-0 flex-1 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[15px] font-semibold leading-snug break-words">{titleOf(tracker, e)}</div>
                  {typeof rating === 'number' && <span className="shrink-0"><Stars n={rating} /></span>}
                </div>
                {fields.length > 0 && (
                  <div className="mt-1.5 grid gap-1">
                    {fields.map(c => (
                      <div key={c.key} className="flex gap-1.5 text-[12.5px] leading-snug">
                        <span className="shrink-0 text-muted-foreground">{c.name}:</span>
                        <span className="min-w-0 break-words"><CellValue col={c} value={e.values[c.key]} small /></span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            </div>
            {flaggable && statusCol && (
              <div className="mt-2.5 border-t border-border/60 pt-2.5">
                <InlineFlag entryId={e.id} col={statusCol} value={e.values[statusCol.key]} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Live "where to watch (US)" lookup — hits the movie-lookup Edge Function (TMDB) and shows the
// film's current US streaming/rent/buy, with one click to save it into the tracker's streaming
// column. Shown only on watch-list trackers (Movies, TV Shows…).
function StreamingLookup({ tracker, title, year, onFill }: {
  tracker: Tracker
  title: string
  year: string
  onFill: (col: TrackerColumn, value: Entry['values'][string]) => void
}) {
  const cloud = useCloud()
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<import('@/lib/cloud').MovieLookupResult | null>(null)
  const col = streamingColumn(tracker)
  const relCol = yearColumn(tracker)

  async function run() {
    if (!title.trim()) { toast.error('Enter the title first'); return }
    if (!cloud) { toast('Live streaming lookup needs a signed-in account (it calls the TMDB backend).'); return }
    setLoading(true); setRes(null)
    try {
      const r = await cloud.lookupMovie(title.trim(), year)
      setRes(r)
      if (r.error) { toast.error(r.error); return }
      if (r.notFound) { toast(`No TMDB match for “${title}”.`); return }
      if (r.ok) {
        const saved: string[] = []
        if (col && r.summary) { onFill(col, r.summary); saved.push(col.name) }
        if (relCol && r.matched) {
          const rv = releaseValueFor(relCol, r.matched)
          if (rv !== undefined && rv !== '') { onFill(relCol, rv); saved.push(relCol.name) }
        }
        if (saved.length) toast.success(`Saved to “${saved.join('” & “')}”`)
      }
    } finally { setLoading(false) }
  }

  const Chip = ({ items, label }: { items?: string[]; label: string }) =>
    items && items.length ? (
      <div className="flex flex-wrap items-center gap-1 text-[11.5px]">
        <span className="text-muted-foreground">{label}</span>
        {items.map(p => <span key={p} className="border border-border rounded-sm bg-background px-1.5 py-px">{p}</span>)}
      </div>
    ) : null

  return (
    <div className="rounded-md border border-dashed border-border p-2.5 grid gap-2">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Tv className="h-3.5 w-3.5 mr-1" />}
          Where to watch (US)
        </Button>
        <span className="text-[11px] text-muted-foreground">Live from TMDB{col ? ` → saves to “${col.name}”` : ''}</span>
      </div>
      {res?.ok && res.matched && (
        <div className="grid gap-1.5 text-[12px]">
          <div className="font-medium">{res.matched.title}{res.matched.year && <span className="text-muted-foreground font-normal"> ({res.matched.year})</span>}</div>
          <Chip items={res.providers?.stream} label="Stream:" />
          <Chip items={res.providers?.ads} label="Free (ads):" />
          <Chip items={res.providers?.rent} label="Rent:" />
          <Chip items={res.providers?.buy} label="Buy:" />
          {!res.providers?.stream?.length && !res.providers?.ads?.length && !res.providers?.rent?.length && !res.providers?.buy?.length && (
            <span className="text-muted-foreground italic">Not available in the US right now.</span>
          )}
          {res.link && <a href={res.link} target="_blank" rel="noreferrer" className="text-[hsl(17_63%_47%)] hover:underline w-fit">Open on TMDB / JustWatch →</a>}
          {res.summary && !col && <p className="text-[11px] text-muted-foreground">Tip: add a “Platform” or “Where to watch” text column to this list (Settings → Notes &amp; Collections) and this will save into it automatically.</p>}
        </div>
      )}
    </div>
  )
}

// A grouped "move this entry to another list" picker: every active tracker except the current one,
// grouped under its collection's name. Purely presentational — it reports the chosen target and the
// caller performs the move (so it can also close a dialog / clear a selection and show a toast).
function MoveToControl({ currentTrackerId, label = 'Move to another list', className, onMove }: {
  currentTrackerId: string
  label?: string
  className?: string
  onMove: (targetTrackerId: string, targetName: string) => void
}) {
  const { state } = useStore()
  const groups = state.collections
    .filter(c => c.active)
    .map(col => ({ col, trks: state.trackers.filter(t => t.active && t.collectionId === col.id && t.id !== currentTrackerId) }))
    .filter(g => g.trks.length)
  if (!groups.length) return null
  return (
    <select
      value=""
      onChange={e => {
        const id = e.target.value
        if (!id) return
        onMove(id, state.trackers.find(t => t.id === id)?.name ?? 'the list')
        e.target.value = ''
      }}
      className={cn('h-8 rounded-md border border-border bg-card px-2 text-[12px] text-muted-foreground cursor-pointer outline-none max-w-[220px]', className)}
    >
      <option value="">{label}…</option>
      {groups.map(g => (
        <optgroup key={g.col.id} label={g.col.name}>
          {g.trks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

function EntryDialog({ tracker, open, entry, onClose }: { tracker: Tracker; open: boolean; entry: Entry | null; onClose: () => void }) {
  const { addEntry, updateEntry, moveEntries } = useStore()
  const [form, setForm] = useState<Entry['values']>({})
  const base: Entry['values'] = { ...(entry?.values ?? {}), ...form }
  // default status for new entries
  const statusCol = tracker.columns.find(c => c.type === 'status')
  if (!entry && statusCol && base[statusCol.key] === undefined) base[statusCol.key] = statusCol.options?.[0] ?? ''
  // "Date watched" (and any date column named like it) defaults to today — i.e. the day you add the
  // entry — for a new entry. Fully editable below; blank it out if you're only adding to a watchlist.
  const watchedCol = tracker.columns.find(c => c.type === 'date' && (c.key === 'watched_on' || /watch(ed)?\s*(on|date)|date\s*watch|seen\s*(on|date)/i.test(c.name)))
  if (!entry && watchedCol && base[watchedCol.key] === undefined) base[watchedCol.key] = today()
  const vis = visibleColumns(tracker, base)
  const set = (k: string, v: Entry['values'][string]) => setForm(f => ({ ...f, [k]: v }))
  const titleCol = tracker.columns.find(c => c.isTitle) ?? tracker.columns[0]
  const yrCol = yearColumn(tracker)

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
        <div className="grid grid-cols-1 gap-3">
          {vis.map(col => (
            <div key={col.key} className="grid grid-cols-1 gap-1.5">
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
          {isWatchTracker(tracker) && (
            <StreamingLookup
              tracker={tracker}
              title={String(base[titleCol.key] ?? '')}
              year={yrCol ? String(base[yrCol.key] ?? '') : ''}
              onFill={(col, value) => set(col.key, value)}
            />
          )}
          {/* Filed in the wrong list? Move this entry to another tracker/collection — e.g. a film
              added to Movies by mistake → TV Series. Only when editing an existing entry. */}
          {entry && (
            <div className="grid gap-1.5 border-t border-border pt-3">
              <Label className="text-xs">Wrong list? Move this entry</Label>
              <MoveToControl
                currentTrackerId={tracker.id}
                className="w-full max-w-full"
                onMove={(targetId, targetName) => {
                  moveEntries([entry.id], targetId)
                  toast.success(`Moved “${titleOf(tracker, entry)}” to ${targetName}`)
                  setForm({}); onClose()
                }}
              />
              <p className="text-[11px] text-muted-foreground">Its details come along; the title is kept.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{entry ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Date entry -------------------------------------------------------------------------------
// Dates are stored canonically as ISO `YYYY-MM-DD` (so they sort and format consistently), but
// people think in `m/d/yyyy`. These convert between the two.
function isoToUS(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : ''
}
function toIsoDate(y: number, mo: number, da: number): string | null {
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null
  const dt = new Date(y, mo - 1, da)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== da) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
}
// Parse what a person typed. Accepts m/d/yyyy (and - or . separators), 2-digit years, and also a
// pasted ISO yyyy-mm-dd. Returns ISO, or '' for an empty box, or null when it can't be understood.
function parseTypedDate(s: string): string | null | '' {
  const t = s.trim()
  if (!t) return ''
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t)
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t)
  if (m) {
    const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return toIsoDate(yr, Number(m[1]), Number(m[2]))
  }
  return null
}

/**
 * A robust date field: type the date freely as m/d/yyyy (or m-d-yyyy), or tap the calendar to pick
 * it. The typed box and the native picker stay in sync; the value is stored as ISO YYYY-MM-DD.
 * An unparseable entry snaps back to the last good value on blur rather than silently saving junk.
 */
function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
  const [text, setText] = useState(() => isoToUS(iso))
  // keep the box in step when the value changes from elsewhere (e.g. a default, or a reset)
  useEffect(() => { setText(isoToUS(iso)) }, [iso])
  const commit = () => {
    const parsed = parseTypedDate(text)
    if (parsed === null) { setText(isoToUS(iso)); return } // couldn't read it — restore last good
    onChange(parsed) // '' clears, otherwise ISO
    setText(parsed ? isoToUS(parsed) : '')
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={text}
        inputMode="numeric"
        placeholder="m/d/yyyy"
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        className="flex-1"
      />
      {/* The native date input sits invisibly over the button, so a tap/click opens the OS calendar
          on every platform without relying on showPicker(). */}
      <div className="relative h-9 w-9 shrink-0">
        <span className="pointer-events-none grid h-9 w-9 place-items-center rounded-md border border-input bg-card text-muted-foreground">
          <Calendar className="h-4 w-4" />
        </span>
        <input
          type="date"
          aria-label="Pick a date"
          value={iso}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
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
      return <DateField value={String(value ?? '')} onChange={v => onChange(v)} />
    case 'checkbox':
      return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
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

/**
 * Multi-select action bar.
 *
 * Offers exactly what the tracker itself defines: its status options, a rating if it has a
 * rating column, and any other single-choice field. Nothing is hardcoded to Movies — a
 * Subscriptions or Learning tracker gets its own fields for free.
 *
 * Delete asks first and names the count, because a bulk delete is the one action here with
 * no undo.
 */
function BulkBar({
  tracker,
  selected,
  allIds,
  onSelectAll,
  onClear,
}: {
  tracker: Tracker
  selected: string[]
  allIds: string[]
  onSelectAll: (ids: string[]) => void
  onClear: () => void
}) {
  const { patchEntries, deleteEntries, moveEntries } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const statusCol = tracker.columns.find(c => c.type === 'status')
  const ratingCol = tracker.columns.find(c => c.type === 'rating')
  const choiceCols = tracker.columns.filter(c => c.type === 'select' && c.options?.length)
  const n = selected.length

  const apply = (patch: Record<string, string | number>, label: string) => {
    patchEntries(selected, patch)
    toast.success(`${n} ${n === 1 ? 'entry' : 'entries'} → ${label}`)
  }

  return (
    <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      <span className="text-[12.5px] font-semibold">
        {n} selected
      </span>
      <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => onSelectAll(allIds)}>
        Select all {allIds.length}
      </Button>

      {n > 0 && (
        <>
          <span className="mx-1 h-4 w-px bg-border" />

          {statusCol?.options?.map(opt => (
            <Button
              key={opt}
              size="sm"
              variant="outline"
              className="h-7 text-[12px]"
              onClick={() => apply({ [statusCol.key]: opt }, opt)}
            >
              {opt}
            </Button>
          ))}

          {ratingCol && (
            <span className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Rate</span>
              {[1, 2, 3, 4, 5].map(r => (
                <button
                  key={r}
                  type="button"
                  className="text-[15px] leading-none text-[hsl(40_80%_45%)] hover:scale-110 transition-transform"
                  title={`${r} star${r === 1 ? '' : 's'}`}
                  onClick={() => apply({ [ratingCol.key]: r }, `${r}★`)}
                >
                  ★
                </button>
              ))}
            </span>
          )}

          {choiceCols.map(c => (
            <select
              key={c.key}
              className="h-7 rounded-sm border border-border bg-card px-2 text-[12px]"
              value=""
              onChange={ev => {
                if (!ev.target.value) return
                apply({ [c.key]: ev.target.value }, `${c.name}: ${ev.target.value}`)
                ev.target.value = ''
              }}
            >
              <option value="">{c.name}…</option>
              {c.options?.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ))}

          <MoveToControl
            currentTrackerId={tracker.id}
            label="Move to"
            className="h-7"
            onMove={(targetId, targetName) => {
              moveEntries(selected, targetId)
              toast.success(`Moved ${n} ${n === 1 ? 'entry' : 'entries'} to ${targetName}`)
              onClear()
            }}
          />

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[12px] text-[hsl(8_60%_40%)] border-[hsl(8_40%_60%)]"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
          </Button>
        </>
      )}

      <Button size="sm" variant="ghost" className="h-7 text-[12px] ml-auto" onClick={onClear}>
        Cancel
      </Button>

      <Dialog open={confirmDelete} onOpenChange={o => !o && setConfirmDelete(false)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Delete {n} {n === 1 ? 'entry' : 'entries'}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-[12.5px] leading-relaxed">
            This removes {n} {n === 1 ? 'entry' : 'entries'} from <b>{tracker.name}</b>. It can&rsquo;t
            be undone — the deletion is recorded in History, but the entries themselves are gone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              className="bg-[hsl(8_60%_41%)] hover:bg-[hsl(8_60%_36%)] text-[hsl(45_50%_96%)]"
              onClick={() => {
                deleteEntries(selected)
                toast.success(`Deleted ${n} ${n === 1 ? 'entry' : 'entries'}`)
                setConfirmDelete(false)
                onClear()
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- Collections bulk import: per-tracker template + preview ----------

async function downloadTrackerTemplate(tracker: Tracker) {
  const titleCol = tracker.columns.find(c => c.isTitle) ?? tracker.columns[0]
  const header = tracker.columns.map(c => c.name)
  const exampleRow = tracker.columns.map(c => {
    switch (c.type) {
      case 'rating': return '4'
      case 'currency': return '9.99'
      case 'number': return '1'
      case 'date': return today()
      case 'checkbox': return 'yes'
      case 'select':
      case 'status': return c.options?.[0] ?? ''
      case 'multiselect': return c.options?.slice(0, 2).join('; ') ?? ''
      default: return c.isTitle ? `Example ${tracker.name.replace(/s$/, '')}` : ''
    }
  })
  const notes: string[] = [`Only "${titleCol.name}" is required.`]
  tracker.columns.forEach(c => {
    if (c.type === 'select' || c.type === 'status') notes.push(`${c.name} = ${(c.options ?? []).join(' | ')}`)
    if (c.type === 'multiselect') notes.push(`${c.name} = any of ${(c.options ?? []).join(' | ')}, separate multiple with ;`)
    if (c.type === 'checkbox') notes.push(`${c.name} = yes/no`)
    if (c.type === 'date') notes.push(`${c.name} = date as YYYY-MM-DD`)
    if (c.type === 'rating') notes.push(`${c.name} = number 1-5`)
  })
  const instructionsRow = header.map((_h, i) => i === 0 ? `- DELETE THIS ROW - allowed values: ${notes.join(' ')}` : '')
  const rows = [header, exampleRow, instructionsRow]
  // Every option-bearing column becomes a real in-cell dropdown built live from that field's own
  // current options — so a field you just edited in Settings shows its new options here the next
  // time you download. Single-choice/Status use their list; checkbox is yes/no; rating is 1–5;
  // and multi-select now gets a dropdown too (pick one from the cell, or still type several
  // ";"-separated — the instructions row spells that out).
  const dropdowns: ColumnDropdown[] = tracker.columns.map((c, i) => {
    if (c.type === 'select' || c.type === 'status' || c.type === 'multiselect') return { col: i, values: c.options ?? [] }
    if (c.type === 'checkbox') return { col: i, values: ['yes', 'no'] }
    if (c.type === 'rating') return { col: i, values: ['1', '2', '3', '4', '5'] }
    return { col: i, values: [] }
  })
  await downloadXlsxTemplateWithDropdowns(`daybook-${tracker.name.toLowerCase().replace(/\s+/g, '-')}-template.xlsx`, tracker.name, rows, dropdowns)
  toast.success('Excel template downloaded - matches this tracker’s current columns, with dropdowns built live from each field’s options')
}

// ---------- Export any date-bearing tracker as a standard .ics calendar file ----------
// This is the realistic version of "sync with calendar" without needing Google/Outlook OAuth:
// a real iCalendar file any calendar app can import (or subscribe to, if hosted) — recurring
// entries (birthdays, anniversaries) carry a yearly RRULE so they repeat every year from here on.

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function downloadTrackerIcs(tracker: Tracker, entries: Entry[]) {
  const dateCol = tracker.columns.find(c => c.type === 'date')
  if (!dateCol) { toast.error('This tracker has no date field to export'); return }
  const titleCol = tracker.columns.find(c => c.isTitle) ?? tracker.columns[0]
  const recurCol = tracker.columns.find(c => c.type === 'checkbox' && /recur|repeat/i.test(c.name + ' ' + c.key))
  const notesCol = tracker.columns.find(c => c.type === 'longtext')
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daybook//Collections Export//EN', 'CALSCALE:GREGORIAN']
  let count = 0
  for (const e of entries) {
    const raw = e.values[dateCol.key]
    if (!raw) continue
    const dateStr = String(raw).replace(/-/g, '')
    if (!/^\d{8}$/.test(dateStr)) continue
    const title = String(e.values[titleCol.key] ?? tracker.name)
    const recurring = recurCol ? !!e.values[recurCol.key] : false
    lines.push('BEGIN:VEVENT', `UID:${e.id}@daybook.app`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${dateStr}`, `SUMMARY:${icsEscape(title)}`)
    if (notesCol && e.values[notesCol.key]) lines.push(`DESCRIPTION:${icsEscape(String(e.values[notesCol.key]))}`)
    if (recurring) lines.push('RRULE:FREQ=YEARLY')
    lines.push('END:VEVENT')
    count++
  }
  lines.push('END:VCALENDAR')
  if (count === 0) { toast.error('No entries with a date to export yet'); return }
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `daybook-${tracker.name.toLowerCase().replace(/\s+/g, '-')}.ics`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`Exported ${count} date${count === 1 ? '' : 's'} — import the file into Google/Outlook/Apple Calendar`)
}

interface ParsedEntry {
  values: Entry['values']
  warnings: string[]
  duplicateOf?: string
}

function ImportEntriesDialog({ tracker, open, onClose }: { tracker: Tracker; open: boolean; onClose: () => void }) {
  const { state, addEntry } = useStore()
  const [parsed, setParsed] = useState<ParsedEntry[] | null>(null)
  const [fileName, setFileName] = useState('')
  const titleCol = tracker.columns.find(c => c.isTitle) ?? tracker.columns[0]

  function handleFile(f: File) {
    setFileName(f.name)
    parseSpreadsheetFile(f).then(rows => {
      if (rows.length < 2) { toast.error('No data rows found - start from the template'); return }
      const header = rows[0].map(h => h.trim().toLowerCase())
      const colIndex = (name: string) => {
        const target = name.trim().toLowerCase()
        const exact = header.findIndex(h => h === target)
        return exact !== -1 ? exact : header.findIndex(h => h.startsWith(target))
      }
      const titleIdx = colIndex(titleCol.name)
      if (titleIdx === -1) { toast.error(`Missing "${titleCol.name}" column - use the downloaded template`); return }

      const out: ParsedEntry[] = []
      for (const r of rows.slice(1)) {
        const titleVal = (r[titleIdx] ?? '').trim()
        if (!titleVal || titleVal.startsWith('- DELETE THIS ROW')) continue
        const warnings: string[] = []
        const values: Entry['values'] = {}
        for (const c of tracker.columns) {
          const idx = colIndex(c.name)
          const raw = idx === -1 ? '' : (r[idx] ?? '').trim()
          if (!raw) continue
          switch (c.type) {
            case 'number':
            case 'currency': {
              const n = Number(raw)
              if (Number.isNaN(n)) { warnings.push(`"${c.name}" value "${raw}" isn’t a number - skipped`); break }
              values[c.key] = n
              break
            }
            case 'rating': {
              const n = Number(raw)
              if (Number.isNaN(n)) { warnings.push(`"${c.name}" rating "${raw}" isn’t a number - skipped`); break }
              values[c.key] = Math.max(0, Math.min(5, Math.round(n)))
              break
            }
            case 'checkbox':
              values[c.key] = ['yes', 'y', 'true', '1'].includes(raw.toLowerCase())
              break
            case 'date': {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) { warnings.push(`"${c.name}" date "${raw}" should be YYYY-MM-DD - skipped`); break }
              values[c.key] = raw
              break
            }
            case 'select':
            case 'status': {
              if (c.options && !c.options.includes(raw)) {
                warnings.push(`"${c.name}" value "${raw}" isn’t one of: ${c.options.join(', ')} - left blank`)
                break
              }
              values[c.key] = raw
              break
            }
            case 'multiselect': {
              const parts = raw.split(/[;,]/).map(p => p.trim()).filter(Boolean)
              const bad = c.options ? parts.filter(p => !c.options!.includes(p)) : []
              if (bad.length) warnings.push(`"${c.name}" value(s) ${bad.join(', ')} not in the list - kept anyway`)
              values[c.key] = parts
              break
            }
            default:
              values[c.key] = raw
          }
        }
        const dup = state.entries.find(e => e.trackerId === tracker.id && String(e.values[titleCol.key] ?? '').trim().toLowerCase() === titleVal.toLowerCase())
        out.push({ values, warnings, duplicateOf: dup ? titleVal : undefined })
      }
      if (!out.length) { toast.error('No importable rows found'); return }
      setParsed(out)
    }).catch(() => toast.error('Couldn’t read that file - make sure it’s the .xlsx or .csv you exported/filled in'))
  }

  function commit() {
    if (!parsed) return
    for (const p of parsed) addEntry(tracker.id, p.values)
    toast.success(`Imported ${parsed.length} into ${tracker.name}`)
    setParsed(null); setFileName(''); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setParsed(null); setFileName(''); onClose() } }}>
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-lg">Import into {tracker.name}</DialogTitle></DialogHeader>
        {!parsed ? (
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">1</span>
              <div>
                Download the Excel template - built from this tracker’s own columns, with an example row and the allowed values for each.
                <div><Button size="sm" variant="outline" className="h-7 mt-1.5" onClick={() => downloadTrackerTemplate(tracker)}>Download template (.xlsx)</Button></div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">2</span>
              <span>Fill it in - one entry per row, only <b>{titleCol.name}</b> required - and save it (.xlsx or .csv both work).</span>
            </div>
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">3</span>
              <div className="flex-1">
                Upload for a preview before anything is added to {tracker.name}.
                <label className="mt-1.5 border border-dashed border-input rounded-sm p-5 text-center text-[13px] text-muted-foreground cursor-pointer hover:bg-accent/50 block">
                  {fileName || 'Click to choose your filled .xlsx or .csv'}
                  <input type="file" accept={SPREADSHEET_ACCEPT} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            <p className="text-[13px]">
              <b>{parsed.length}</b> {tracker.name.toLowerCase()} entries from <span className="text-muted-foreground">{fileName}</span>
              {parsed.some(p => p.duplicateOf) && <span> - <b>{parsed.filter(p => p.duplicateOf).length}</b> share a name with an existing entry (added as new, not merged)</span>}
            </p>
            <div className="border border-border max-h-[320px] overflow-y-auto">
              {parsed.map((p, i) => (
                <div key={i} className="px-3 py-1.5 border-b border-border/60 last:border-0 text-[12.5px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{String(p.values[titleCol.key] ?? '') || '(untitled)'}</span>
                    {p.duplicateOf && <span className="ml-auto text-[10.5px] uppercase tracking-wide text-[hsl(28_60%_32%)] font-semibold shrink-0">possible duplicate</span>}
                  </div>
                  {p.warnings.length > 0 && <div className="text-[11px] text-[hsl(28_60%_32%)]">{p.warnings.join(' - ')}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setParsed(null); setFileName(''); onClose() }}>Cancel</Button>
          {parsed && <Button variant="outline" onClick={() => { setParsed(null); setFileName('') }}>Different file</Button>}
          {parsed && <Button onClick={commit}>Import {parsed.length} {parsed.length === 1 ? 'entry' : 'entries'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
