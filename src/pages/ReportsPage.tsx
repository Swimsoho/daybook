import React, { useState } from 'react'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { daysSince, fmtDate, personOverdueBy, resolveTiers, today } from '@/lib/model'
import { isOverdue, openTasks, stalledProjects, useStore } from '@/lib/store'
import { SectionTitle } from '@/components/bits'
import { ExportMenu } from '@/components/ExportMenu'
import { ViewExport } from '@/lib/exportView'

export default function ReportsPage() {
  const { state } = useStore()
  const [tab, setTab] = useState<'standard' | 'exception'>('exception')
  const open = openTasks(state)

  function reportExport(): ViewExport {
    if (tab === 'exception') {
      const rows: (string | number)[][] = []
      const add = (section: string, items: [string, string | number][]) => items.forEach(([item, detail]) => rows.push([section, item, detail]))
      add('Tasks overdue', overdueTasks.map(t => [t.title, `${daysSince(t.due!)}d late`]))
      add('Contacts past cadence', overdueContacts.map(p => [p.name, `${personOverdueBy(p, state.settings)}d past target`]))
      add('Waiting-on gone quiet', waitingQuiet.map(t => [t.title, `${t.waitingOn ?? 'someone'} · ${daysSince(t.waitingSince ?? t.created)}d silent`]))
      add('Stalled projects', stalled.map(p => [p.name, `no activity ${daysSince(p.lastActivity)}d`]))
      add('No due date', noDue.map(t => [t.title, t.priority]))
      add('Stuck in progress > 7d', stuck.map(t => [t.title, `${daysSince(t.created)}d old`]))
      return { title: 'Exception report — what needs attention', headers: ['Report', 'Item', 'Detail'], rows, filenameBase: 'daybook-exceptions' }
    }
    const rows: (string | number)[][] = [
      ...byArea.map(x => [`Open tasks · ${x.a.name}`, x.n] as (string | number)[]),
      ...byPriority.map(x => [`Priority · ${x.p}`, x.n] as (string | number)[]),
      ...byTier.map(x => [`Contacts · ${x.name}`, x.n] as (string | number)[]),
    ]
    return { title: 'Standard report', headers: ['Metric', 'Count'], rows, filenameBase: 'daybook-report' }
  }

  // ---- standard data
  const byArea = state.areas.filter(a => a.active).map(a => ({ a, n: open.filter(t => t.areaId === a.id).length }))
  const maxArea = Math.max(1, ...byArea.map(x => x.n))
  const byPriority = (['P0', 'P1', 'P2', 'P3'] as const).map(p => ({ p, n: open.filter(t => t.priority === p).length }))
  const byTier = resolveTiers(state.settings).map(t => ({ id: t.id, name: t.name, color: t.color, n: state.people.filter(p => p.tier === t.id).length }))
  const callDays = [...Array(7)].map((_, i) => {
    const d = daysSince
    void d
    const date = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10)
    return { date, n: state.interactions.filter(x => x.date === date && (x.channel === 'call' || x.channel === 'whatsapp')).length }
  })
  const vendorRows = state.vendors.map(v => ({
    v,
    open: open.filter(t => t.vendorId === v.id).length,
    all: state.tasks.filter(t => t.vendorId === v.id).length,
  }))

  // ---- exception data
  const overdueTasks = open.filter(isOverdue)
  const noDue = open.filter(t => !t.due && t.priority !== 'P3')
  const stuck = open.filter(t => t.status === 'in-progress' && daysSince(t.created) > 7)
  const waitingQuiet = open.filter(t => t.status === 'waiting' && daysSince(t.waitingSince ?? t.created) >= 5)
  const overdueContacts = state.people.filter(p => personOverdueBy(p, state.settings) > 0)
  const stalled = stalledProjects(state)
  const subsTracker = state.trackers.find(t => t.id === 'trk_subs')
  const renewingSoon = state.entries.filter(e => {
    if (e.trackerId !== 'trk_subs') return false
    const r = e.values['renewal']
    return typeof r === 'string' && r >= today() && daysSince(r) >= -14
  })
  const noRenewal = state.entries.filter(e => e.trackerId === 'trk_subs' && e.values['status'] !== 'Cancelled' && !e.values['renewal'])

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-center gap-1">
        {(['exception', 'standard'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-3 py-1.5 text-[12.5px] border rounded-sm capitalize', tab === t ? 'bg-primary text-primary-foreground border-primary' : 'border-transparent hover:border-border hover:bg-accent')}>
            {t === 'exception' ? 'Exception — what needs attention' : 'Standard reports'}
          </button>
        ))}
        <ExportMenu getData={reportExport} className="h-8 ml-auto" />
      </div>

      {tab === 'exception' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ExceptionCard title={`Tasks overdue (${overdueTasks.length})`} tone="bad" rows={overdueTasks.map(t => [t.title, `${daysSince(t.due!)}d late`])} empty="Nothing overdue." />
          <ExceptionCard title={`Contacts past cadence (${overdueContacts.length})`} tone="bad" rows={overdueContacts.map(p => [p.name, `${personOverdueBy(p, state.settings)}d past target`])} empty="Everyone within cadence." />
          <ExceptionCard title={`Waiting-on gone quiet (${waitingQuiet.length})`} rows={waitingQuiet.map(t => [t.title, `${t.waitingOn ?? 'someone'} · ${daysSince(t.waitingSince ?? t.created)}d silent`])} empty="No chases needed." />
          <ExceptionCard title={`Stalled projects (${stalled.length})`} rows={stalled.map(p => [p.name, `no activity ${daysSince(p.lastActivity)}d`])} empty="All projects moving." />
          <ExceptionCard title={`Tasks with no due date (${noDue.length})`} rows={noDue.map(t => [t.title, t.priority])} empty="Everything is dated." />
          <ExceptionCard title={`Stuck in progress > 7d (${stuck.length})`} rows={stuck.map(t => [t.title, `${daysSince(t.created)}d old`])} empty="Nothing languishing." />
          {subsTracker && <ExceptionCard title={`Subscriptions renewing ≤ 14d (${renewingSoon.length})`} rows={renewingSoon.map(e => [String(e.values['service']), `renews ${fmtDate(String(e.values['renewal']))} · £${e.values['cost']}`])} empty="No renewals imminent." />}
          {subsTracker && <ExceptionCard title={`Policies with no renewal date (${noRenewal.length})`} rows={noRenewal.map(e => [String(e.values['service']), 'no date on file'])} empty="All dated." />}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <section className="border border-border bg-card shadow-sm rounded-lg p-4">
            <SectionTitle>Open tasks by area</SectionTitle>
            <div className="grid grid-cols-1 gap-2">
              {byArea.map(({ a, n }) => (
                <div key={a.id} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="w-28 truncate">{a.name}</span>
                  <div className="flex-1 h-4 bg-muted overflow-hidden rounded-sm">
                    <div className="h-full transition-all" style={{ width: `${(n / maxArea) * 100}%`, background: a.color }} />
                  </div>
                  <span className="tabular w-5 text-right">{n}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="border border-border bg-card shadow-sm rounded-lg p-4">
            <SectionTitle>Calls made — last 7 days vs goal ({state.settings.callGoal}/day)</SectionTitle>
            <div className="flex items-end gap-1.5 h-28">
              {callDays.map(({ date, n }) => (
                <div key={date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end h-full">
                    <div className={cn('w-full rounded-sm', n >= state.settings.callGoal ? 'bg-[hsl(152_25%_38%)]' : 'bg-[hsl(40_45%_65%)]')} style={{ height: `${Math.min(100, (n / (state.settings.callGoal * 1.5)) * 100)}%`, minHeight: n ? 6 : 2 }} />
                  </div>
                  <span className="text-[9.5px] text-muted-foreground tabular">{date.slice(8)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-[hsl(8_50%_55%)] -mt-14 mb-14 relative">
              <span className="absolute right-0 -top-4 text-[9.5px] text-[hsl(8_50%_45%)]">goal</span>
            </div>
          </section>
          <section className="border border-border bg-card shadow-sm rounded-lg p-4">
            <SectionTitle>Tasks by priority</SectionTitle>
            <div className="grid grid-cols-1 gap-2">
              {byPriority.map(({ p, n }) => (
                <div key={p} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="w-10">{p}</span>
                  <div className="flex-1 h-4 bg-muted overflow-hidden rounded-sm">
                    <div className="h-full bg-[hsl(152_22%_30%)]" style={{ width: `${(n / Math.max(1, ...byPriority.map(x => x.n))) * 100}%` }} />
                  </div>
                  <span className="tabular w-5 text-right">{n}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="border border-border bg-card shadow-sm rounded-lg p-4">
            <SectionTitle>Contacts by tier</SectionTitle>
            <div className="grid grid-cols-1 gap-2">
              {byTier.map(({ id, name, color, n }) => (
                <div key={id} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="w-24 truncate inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />{name}</span>
                  <div className="flex-1 h-4 bg-muted overflow-hidden rounded-sm">
                    <div className="h-full" style={{ width: `${(n / Math.max(1, ...byTier.map(x => x.n))) * 100}%`, background: color }} />
                  </div>
                  <span className="tabular w-5 text-right">{n}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="border border-border bg-card shadow-sm rounded-lg p-4 sm:col-span-2">
            <SectionTitle>Vendors — open items and history</SectionTitle>
            <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-1.5 font-semibold">Vendor</th><th className="font-semibold">Category</th><th className="font-semibold">Open items</th><th className="font-semibold">Ever used</th><th className="font-semibold">Rating</th>
                </tr>
              </thead>
              <tbody>
                {vendorRows.map(({ v, open: o, all }) => (
                  <tr key={v.id} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5 font-medium">{v.name}</td>
                    <td className="text-muted-foreground">{v.category}</td>
                    <td className="tabular">{o}</td>
                    <td className="tabular">{all}</td>
                    <td>{'★'.repeat(v.rating ?? 0)}<span className="text-border">{'★'.repeat(5 - (v.rating ?? 0))}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
          <section className="border border-border bg-card shadow-sm rounded-lg p-4 sm:col-span-2">
            <SectionTitle>Collections — total monthly cost of active subscriptions</SectionTitle>
            <p className="font-display text-3xl font-semibold tabular">
              £{state.entries.filter(e => e.trackerId === 'trk_subs' && e.values['status'] === 'Active').reduce((sum, e) => sum + Number(e.values['cost'] ?? 0), 0).toFixed(2)}
              <span className="text-sm text-muted-foreground font-normal"> / month — currency columns roll up with no extra setup</span>
            </p>
          </section>

          {/* Every tracker at a glance — so a report exists for Movies, Books, TV Series, Dates,
              Notes, Ideas and anything else the person adds, not just the built-in Subscriptions
              one above. Groups by collection, counts entries, and breaks down by the tracker's
              own status column when it has one. */}
          <section className="border border-border bg-card shadow-sm rounded-lg p-4 sm:col-span-2">
            <SectionTitle>Collections — every tracker at a glance</SectionTitle>
            {state.trackers.filter(t => t.active).length === 0 && (
              <p className="text-[12.5px] text-muted-foreground italic">No trackers yet — add one under Settings → Notes &amp; Collections.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
              {state.trackers.filter(t => t.active).map(t => {
                const es = state.entries.filter(e => e.trackerId === t.id)
                const col = state.collections.find(c => c.id === t.collectionId)
                const statusCol = t.columns.find(c => c.type === 'status')
                const breakdown = statusCol?.options
                  ?.map(opt => ({ opt, n: es.filter(e => e.values[statusCol.key] === opt).length }))
                  .filter(x => x.n > 0)
                return (
                  <div key={t.id} className="py-1.5 border-b border-border/50">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-medium truncate">
                        {col && <span className="text-muted-foreground font-normal">{col.name} · </span>}{t.name}
                      </span>
                      <span className="text-[12px] tabular text-muted-foreground shrink-0">{es.length} {es.length === 1 ? 'entry' : 'entries'}</span>
                    </div>
                    {breakdown && breakdown.length > 0 && (
                      <div className="text-[11.5px] text-muted-foreground mt-0.5">
                        {breakdown.map(b => `${b.opt}: ${b.n}`).join(' · ')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}
      <p className="text-[11.5px] text-muted-foreground">Every report supports free-text search, multi-field filters and saved presets; results click through to the underlying items.</p>
    </div>
  )
}

function ExceptionCard({ title, rows, empty, tone }: { title: string; rows: [string, string][]; empty: string; tone?: 'bad' }) {
  return (
    <section className="border border-border bg-card shadow-sm rounded-lg">
      <div className={cn('px-4 py-2.5 border-b border-border text-[12.5px] font-semibold', tone === 'bad' && rows.length > 0 && 'text-[hsl(8_60%_41%)]')}>{title}</div>
      <div className="px-4 py-2">
        {rows.length === 0 && <p className="text-[12.5px] text-muted-foreground italic py-1">{empty}</p>}
        {rows.slice(0, 6).map(([a, b], i) => (
          <div key={i} className="flex justify-between gap-3 py-1 border-b border-border/50 last:border-0 text-[12.5px]">
            <span className="truncate">{a}</span>
            <span className="text-muted-foreground tabular shrink-0">{b}</span>
          </div>
        ))}
        {rows.length > 6 && <p className="text-[11px] text-muted-foreground pt-1">+ {rows.length - 6} more</p>}
      </div>
    </section>
  )
}
