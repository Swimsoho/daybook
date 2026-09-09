import { useMemo, useState } from 'react'
import { LayoutGrid, Table as TableIcon, Search, Tag, ArrowUpRight, Trash2, Pencil, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Project, PriorityScheme, PRIORITY_LABELS, fmtDate, daysSince } from '@/lib/model'
import { useStore, openTasks } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { projectStats, projectHealth, projectOwnerMember, HEALTH_META, HEALTH_ORDER, type Health } from '@/lib/projects'
import { PriorityChip } from '@/components/bits'

type GroupBy = 'area' | 'status' | 'health' | 'none'
type SortBy = 'health' | 'due' | 'progress' | 'priority' | 'name' | 'recent'
type ViewMode = 'cards' | 'table'

const SORT_LABELS: Record<SortBy, string> = {
  health: 'Health', due: 'Due date', progress: 'Progress', priority: 'Priority', name: 'Name', recent: 'Recent activity',
}
const PRIO_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

/**
 * The projects portfolio — the real "all projects" landing. Health, progress, owners and due dates
 * for every project, grouped and sortable, with a KPI band across the top. The Areas you set up in
 * Settings are the default grouping; each project opens into its own workspace.
 */
export function Portfolio({ onOpenProject, right }: {
  onOpenProject: (id: string) => void
  /** New / Import / Export buttons, supplied by the page so this component stays presentational. */
  right?: React.ReactNode
}) {
  const { state } = useStore()
  const scheme = state.settings.priorityScheme
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [healthFilter, setHealthFilter] = useState<'all' | Health>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('area')
  const [sortBy, setSortBy] = useState<SortBy>('health')
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [manageLabels, setManageLabels] = useState(false)
  const labelCount = state.projects.filter(p => p.kind === 'label').length

  // Everything the rest of the page reads, computed once. Labels never appear here — they're
  // task-grouping tags, managed from the Labels dialog, not real projects.
  const rows = useMemo(() => {
    return state.projects.filter(p => p.kind !== 'label').map(p => {
      const stats = projectStats(state, p.id)
      const health = projectHealth(state, p, stats)
      const owner = projectOwnerMember(p)
      const area = state.areas.find(a => a.id === p.areaId)
      return { p, stats, health, owner, area }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.projects, state.tasks, state.milestones, state.people, state.areas, state.settings.stallDays])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(({ p, health, area }) => {
      if (statusFilter === 'all' ? p.status === 'archived' : p.status !== statusFilter) return false
      if (areaFilter !== 'all' && p.areaId !== areaFilter) return false
      if (healthFilter !== 'all' && health !== healthFilter) return false
      if (q && !(p.name.toLowerCase().includes(q) || p.outcome.toLowerCase().includes(q) || (area?.name.toLowerCase().includes(q)))) return false
      return true
    })
  }, [rows, search, statusFilter, areaFilter, healthFilter])

  const sortVal = (r: typeof rows[number]): [number | string, number | string] => {
    switch (sortBy) {
      case 'health': return [HEALTH_ORDER[r.health], r.p.due ?? '9999']
      case 'due': return [r.p.due ?? '9999-99', r.p.name.toLowerCase()]
      case 'progress': return [100 - r.stats.pct, r.p.name.toLowerCase()] // least done first
      case 'priority': return [PRIO_ORDER[r.p.priority] ?? 9, r.p.due ?? '9999']
      case 'name': return [r.p.name.toLowerCase(), '']
      case 'recent': return [r.stats.lastActivity ? -new Date(r.stats.lastActivity).getTime() : 0, r.p.name.toLowerCase()]
    }
  }
  const cmp = (a: typeof rows[number], b: typeof rows[number]) => {
    const [a1, a2] = sortVal(a), [b1, b2] = sortVal(b)
    if (a1 < b1) return -1; if (a1 > b1) return 1
    return a2 < b2 ? -1 : a2 > b2 ? 1 : 0
  }

  // Grouping
  const groups = useMemo(() => {
    const out: { key: string; label: string; color?: string; rows: typeof filtered }[] = []
    if (groupBy === 'none') {
      out.push({ key: 'all', label: `All projects`, rows: [...filtered].sort(cmp) })
    } else if (groupBy === 'area') {
      for (const a of state.areas.filter(ar => ar.active)) {
        const rs = filtered.filter(r => r.p.areaId === a.id)
        if (rs.length) out.push({ key: a.id, label: a.name, color: a.color, rows: [...rs].sort(cmp) })
      }
      // any project whose area is inactive/missing
      const grouped = new Set(state.areas.filter(a => a.active).map(a => a.id))
      const orphan = filtered.filter(r => !grouped.has(r.p.areaId))
      if (orphan.length) out.push({ key: '__other', label: 'Other', rows: [...orphan].sort(cmp) })
    } else if (groupBy === 'status') {
      for (const s of ['active', 'on-hold', 'done', 'archived'] as const) {
        const rs = filtered.filter(r => r.p.status === s)
        if (rs.length) out.push({ key: s, label: s === 'on-hold' ? 'On hold' : s[0].toUpperCase() + s.slice(1), rows: [...rs].sort(cmp) })
      }
    } else {
      for (const h of ['off-track', 'at-risk', 'on-track', 'on-hold', 'done'] as Health[]) {
        const rs = filtered.filter(r => r.health === h)
        if (rs.length) out.push({ key: h, label: HEALTH_META[h].label, color: HEALTH_META[h].dot, rows: [...rs].sort(cmp) })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, groupBy, sortBy, state.areas])

  // KPIs — over the non-archived, non-done working set
  const active = rows.filter(r => r.p.status === 'active')
  const kpis = {
    active: active.length,
    offTrack: rows.filter(r => r.health === 'off-track').length,
    atRisk: rows.filter(r => r.health === 'at-risk').length,
    overdueTasks: openTasks(state).filter(t => t.projectId && !!t.due && daysSince(t.due) > 0).length,
    dueSoon: rows.filter(r => r.p.status !== 'done' && r.p.status !== 'archived' && !!r.p.due && daysSince(r.p.due) >= -14 && daysSince(r.p.due) <= 0).length,
  }

  const filtersOn = !!search || areaFilter !== 'all' || statusFilter !== 'all' || healthFilter !== 'all'

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* KPI band */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <Kpi label="Active projects" value={kpis.active} />
        <Kpi label="Off track" value={kpis.offTrack} tone={kpis.offTrack ? 'bad' : undefined} onClick={() => { setHealthFilter('off-track'); setStatusFilter('all') }} />
        <Kpi label="At risk" value={kpis.atRisk} tone={kpis.atRisk ? 'warn' : undefined} onClick={() => setHealthFilter('at-risk')} />
        <Kpi label="Overdue tasks" value={kpis.overdueTasks} tone={kpis.overdueTasks ? 'bad' : undefined} />
        <Kpi label="Due ≤ 2 weeks" value={kpis.dueSoon} tone={kpis.dueSoon ? 'warn' : undefined} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…" className="h-8 w-48 rounded-md border border-border bg-card pl-7 pr-2 text-[12.5px] outline-none focus:border-primary" />
        </div>
        <Native value={areaFilter} onChange={setAreaFilter}>
          <option value="all">All areas</option>
          {state.areas.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Native>
        <Native value={statusFilter} onChange={setStatusFilter}>
          <option value="all">Active + open</option>
          <option value="active">Active</option>
          <option value="on-hold">On hold</option>
          <option value="done">Done</option>
          <option value="archived">Archived</option>
        </Native>
        <Native value={healthFilter} onChange={v => setHealthFilter(v as 'all' | Health)}>
          <option value="all">All health</option>
          <option value="off-track">Off track</option>
          <option value="at-risk">At risk</option>
          <option value="on-track">On track</option>
        </Native>
        <span className="mx-0.5 h-5 w-px bg-border hidden sm:block" />
        <Native value={groupBy} onChange={v => setGroupBy(v as GroupBy)} label="Group">
          <option value="area">Group: Area</option>
          <option value="status">Group: Status</option>
          <option value="health">Group: Health</option>
          <option value="none">No grouping</option>
        </Native>
        <Native value={sortBy} onChange={v => setSortBy(v as SortBy)}>
          {(Object.keys(SORT_LABELS) as SortBy[]).map(k => <option key={k} value={k}>Sort: {SORT_LABELS[k]}</option>)}
        </Native>
        <div className="flex border border-border rounded-md overflow-hidden">
          <button onClick={() => setViewMode('cards')} title="Card view" className={cn('h-8 px-2 grid place-items-center', viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent')}><LayoutGrid className="h-3.5 w-3.5" /></button>
          <button onClick={() => setViewMode('table')} title="Table view" className={cn('h-8 px-2 grid place-items-center border-l border-border', viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent')}><TableIcon className="h-3.5 w-3.5" /></button>
        </div>
        <button onClick={() => setManageLabels(true)} title="Manage labels — the task-grouping tags" className="inline-flex items-center gap-1.5 h-8 rounded-md border border-border bg-card px-2.5 text-[12px] text-muted-foreground hover:text-foreground">
          <Tag className="h-3.5 w-3.5" />Labels{labelCount ? ` · ${labelCount}` : ''}
        </button>
        {filtersOn && <button onClick={() => { setSearch(''); setAreaFilter('all'); setStatusFilter('all'); setHealthFilter('all') }} className="text-[12px] text-[hsl(17_63%_47%)] hover:underline">Clear</button>}
        <span className="text-[11.5px] text-muted-foreground tabular">{filtered.length} project{filtered.length === 1 ? '' : 's'}</span>
        {/* flex-wrap + sm:ml-auto so the action buttons wrap onto their own line on a phone instead of
            running off the right edge (the last one — "New project" — was being clipped). */}
        {right && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{right}</div>}
      </div>

      <LabelsManager open={manageLabels} onClose={() => setManageLabels(false)} onPromote={id => { setManageLabels(false); onOpenProject(id) }} />

      {groups.length === 0 && (
        <div className="border border-border bg-card rounded-lg px-4 py-10 text-center text-[13px] text-muted-foreground">
          No projects match. {filtersOn ? 'Try clearing the filters.' : 'Create your first project to get started.'}
        </div>
      )}

      {groups.map(g => (
        <section key={g.key} className="grid gap-2">
          {groupBy !== 'none' && (
            <div className="flex items-center gap-2 px-0.5">
              {g.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />}
              <h3 className="font-display text-[14px] font-semibold">{g.label}</h3>
              <span className="text-[11px] text-muted-foreground tabular">{g.rows.length}</span>
            </div>
          )}
          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {g.rows.map(r => <ProjectCard key={r.p.id} row={r} scheme={scheme} onOpen={() => onOpenProject(r.p.id)} />)}
            </div>
          ) : (
            <PortfolioTable rows={g.rows} scheme={scheme} onOpen={onOpenProject} showArea={groupBy !== 'area'} />
          )}
        </section>
      ))}
    </div>
  )
}

function Kpi({ label, value, tone, onClick }: { label: string; value: number; tone?: 'bad' | 'warn'; onClick?: () => void }) {
  const color = tone === 'bad' ? 'hsl(8 60% 41%)' : tone === 'warn' ? 'hsl(30 60% 34%)' : undefined
  return (
    <button onClick={onClick} disabled={!onClick} className={cn('text-left border border-border bg-card rounded-lg px-3 py-2.5 shadow-sm', onClick && 'hover:border-input transition-colors')}>
      <div className="font-display text-[22px] font-semibold tabular leading-none" style={color ? { color } : undefined}>{value}</div>
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground mt-1">{label}</div>
    </button>
  )
}

function Native({ value, onChange, children, label }: { value: string; onChange: (v: string) => void; children: React.ReactNode; label?: string }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={label}
      className="h-8 rounded-md border border-border bg-card px-2 text-[12px] text-foreground cursor-pointer outline-none max-w-[170px]"
    >
      {children}
    </select>
  )
}

function ProjectCard({ row, scheme, onOpen }: { row: { p: Project; stats: ReturnType<typeof projectStats>; health: Health; owner?: { name: string }; area?: { name: string; color: string } }; scheme: PriorityScheme; onOpen: () => void }) {
  const { p, stats, health, owner } = row
  const hm = HEALTH_META[health]
  return (
    <button onClick={onOpen} className="text-left border border-border bg-card rounded-lg p-3.5 shadow-sm hover:-translate-y-0.5 hover:shadow transition-all grid gap-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-snug truncate">{p.name}</div>
          <div className="text-[11.5px] text-muted-foreground truncate mt-0.5">{p.outcome || '—'}</div>
        </div>
        <PriorityChip p={p.priority} className="shrink-0" />
      </div>
      {/* progress */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-sm overflow-hidden">
          <div className="h-full rounded-sm" style={{ width: `${stats.pct}%`, background: 'hsl(152 25% 40%)' }} />
        </div>
        <span className="text-[10.5px] tabular text-muted-foreground w-12 text-right">{stats.done}/{stats.total}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap text-[10.5px]">
        <span className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-semibold" style={{ background: hm.bg, borderColor: hm.border, color: hm.text }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: hm.dot }} />{hm.label}
        </span>
        {stats.overdue > 0 && <span className="rounded-sm bg-[hsl(8_60%_96%)] border border-[hsl(8_50%_82%)] text-[hsl(8_55%_38%)] px-1.5 py-0.5 font-semibold tabular">{stats.overdue} overdue</span>}
        {stats.blocked > 0 && <span className="rounded-sm bg-[hsl(38_78%_95%)] border border-[hsl(38_60%_78%)] text-[hsl(30_55%_34%)] px-1.5 py-0.5 font-semibold tabular">{stats.blocked} blocked</span>}
        <span className="ml-auto flex items-center gap-2 text-muted-foreground tabular">
          {p.due && <span title="Target date">{fmtDate(p.due)}</span>}
          <span>{stats.open} open</span>
        </span>
      </div>
      {(owner || stats.nextMilestone) && (
        <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground border-t border-border/60 pt-1.5">
          {owner && <span className="inline-flex items-center gap-1"><Avatar name={owner.name} />{owner.name.split(' ')[0]}</span>}
          {stats.nextMilestone && <span className="truncate ml-auto">Next: {stats.nextMilestone.name}</span>}
        </div>
      )}
    </button>
  )
}

function PortfolioTable({ rows, scheme, onOpen, showArea }: { rows: { p: Project; stats: ReturnType<typeof projectStats>; health: Health; owner?: { name: string }; area?: { name: string; color: string } }[]; scheme: PriorityScheme; onOpen: (id: string) => void; showArea: boolean }) {
  return (
    <div className="border border-border bg-card rounded-lg overflow-x-auto shadow-sm">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Project</th>
            {showArea && <th className="px-3 py-2 font-semibold">Area</th>}
            <th className="px-3 py-2 font-semibold">Owner</th>
            <th className="px-3 py-2 font-semibold">Priority</th>
            <th className="px-3 py-2 font-semibold w-40">Progress</th>
            <th className="px-3 py-2 font-semibold">Health</th>
            <th className="px-3 py-2 font-semibold tabular">Due</th>
            <th className="px-3 py-2 font-semibold tabular text-right">Open</th>
            <th className="px-3 py-2 font-semibold tabular text-right">Overdue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, stats, health, owner, area }) => {
            const hm = HEALTH_META[health]
            return (
              <tr key={p.id} onClick={() => onOpen(p.id)} className="border-b border-border/60 last:border-0 hover:bg-accent/50 cursor-pointer">
                <td className="px-3 py-2 font-medium max-w-[220px]"><div className="truncate">{p.name}</div><div className="text-[10.5px] text-muted-foreground truncate">{p.outcome}</div></td>
                {showArea && <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{area && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: area.color }} />{area.name}</span>}</td>}
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{owner ? <span className="inline-flex items-center gap-1"><Avatar name={owner.name} />{owner.name.split(' ')[0]}</span> : '—'}</td>
                <td className="px-3 py-2">{PRIORITY_LABELS[scheme][p.priority]}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-sm overflow-hidden min-w-[60px]"><div className="h-full" style={{ width: `${stats.pct}%`, background: 'hsl(152 25% 40%)' }} /></div>
                    <span className="tabular text-muted-foreground w-8 text-right">{stats.pct}%</span>
                  </div>
                </td>
                <td className="px-3 py-2"><span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: hm.bg, color: hm.text, border: `1px solid ${hm.border}` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: hm.dot }} />{hm.label}</span></td>
                <td className="px-3 py-2 tabular text-muted-foreground whitespace-nowrap">{p.due ? fmtDate(p.due) : '—'}</td>
                <td className="px-3 py-2 tabular text-right">{stats.open}</td>
                <td className={cn('px-3 py-2 tabular text-right', stats.overdue > 0 && 'text-[hsl(8_60%_41%)] font-semibold')}>{stats.overdue || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
  return <span className="inline-grid place-items-center h-4 w-4 rounded-full bg-[hsl(152_20%_30%)] text-[8px] font-semibold text-[hsl(45_50%_96%)]">{initials}</span>
}

/**
 * Manage labels — the lightweight task-grouping tags. Each can be renamed, **promoted to a real
 * project** (it then appears on the Projects page), **merged** into another label or project (its
 * tasks move, the empty label is removed), or **deleted** (its tasks are un-tagged). This is where a
 * one-time migration's guesses get corrected.
 */
function LabelsManager({ open, onClose, onPromote }: { open: boolean; onClose: () => void; onPromote: (id: string) => void }) {
  const { state, updateProject, reassignProject, removeProject } = useStore()
  const labels = [...state.projects.filter(p => p.kind === 'label')].sort((a, b) => a.name.localeCompare(b.name))
  const realProjects = state.projects.filter(p => p.kind !== 'label' && p.status !== 'archived')
  const count = (id: string) => state.tasks.filter(t => t.projectId === id).length
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startRename = (p: Project) => { setEditingId(p.id); setDraft(p.name) }
  const saveRename = (p: Project) => { const n = draft.trim(); if (n && n !== p.name) { updateProject(p.id, { name: n }); toast.success('Label renamed') } setEditingId(null) }
  const promote = (p: Project) => { updateProject(p.id, { kind: 'project' }); toast.success(`“${p.name}” is now a project`); onPromote(p.id) }
  const merge = (p: Project, targetId: string) => {
    if (!targetId) return
    const n = reassignProject(p.id, targetId)
    removeProject(p.id)
    const to = state.projects.find(x => x.id === targetId)
    toast.success(`Merged “${p.name}” into ${to?.name ?? 'target'}${n ? ` (${n} task${n === 1 ? '' : 's'})` : ''}`)
  }
  const del = (p: Project) => {
    const c = count(p.id)
    if (c > 0 && !confirm(`Delete label “${p.name}”? Its ${c} task${c === 1 ? '' : 's'} will keep existing, just un-tagged.`)) return
    removeProject(p.id)
    toast.success(`Deleted label “${p.name}”`)
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2"><Tag className="h-5 w-5" />Labels</DialogTitle>
          <p className="text-[12.5px] text-muted-foreground">Labels group tasks without being full projects — their tasks stay on your to-do list. Promote one to a real project, merge duplicates, or delete the ones you don't need.</p>
        </DialogHeader>
        {labels.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">No labels yet. Type a new name in a task's “Project or label” box to make one.</div>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border/60">
            {labels.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                {editingId === p.id ? (
                  <>
                    <Input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveRename(p)} autoFocus className="h-7 flex-1 text-[12.5px]" />
                    <Button size="sm" className="h-7" onClick={() => saveRename(p)}><Check className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-[13px] font-medium truncate">{p.name}</span>
                    <span className="text-[11px] text-muted-foreground tabular shrink-0">{count(p.id)} task{count(p.id) === 1 ? '' : 's'}</span>
                    <button onClick={() => startRename(p)} title="Rename" className="grid place-items-center h-7 w-7 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => promote(p)} title="Promote to a real project" className="inline-flex items-center gap-1 h-7 rounded-sm border border-border px-2 text-[11.5px] text-muted-foreground hover:text-foreground hover:border-input"><ArrowUpRight className="h-3.5 w-3.5" />Make project</button>
                    <select defaultValue="" onChange={e => { merge(p, e.target.value); e.currentTarget.value = '' }} title="Merge into…" className="h-7 rounded-sm border border-border bg-card px-1.5 text-[11.5px] text-muted-foreground cursor-pointer outline-none max-w-[130px]">
                      <option value="">Merge into…</option>
                      <optgroup label="Labels">{labels.filter(l => l.id !== p.id).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                      <optgroup label="Projects">{realProjects.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
                    </select>
                    <button onClick={() => del(p)} title="Delete label" className="grid place-items-center h-7 w-7 rounded-sm text-[hsl(8_60%_45%)] hover:bg-[hsl(8_60%_96%)]"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
