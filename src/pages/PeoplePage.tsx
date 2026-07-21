import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Phone, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Person, Tier, TIER_LABELS, daysSince, fmtDate, personCadence, personOverdueBy } from '@/lib/model'
import { buildCallList, useStore } from '@/lib/store'
import { ClearFiltersButton, EmptyNote, SectionTitle, TierBadge } from '@/components/bits'
import { LogCallDialog, PersonDetail, SentimentDot } from '@/components/people'

export default function PeoplePage() {
  const { state, addPerson } = useStore()
  const [tierFilter, setTierFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'overdue' | 'name' | 'recent'>('overdue')
  const [viewPerson, setViewPerson] = useState<Person | null>(null)
  const [logPerson, setLogPerson] = useState<Person | null>(null)
  const [adding, setAdding] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const calls = buildCallList(state).slice(0, state.settings.callGoal)

  const people = useMemo(() => {
    let ps = state.people.filter(p =>
      (tierFilter === 'all' || p.tier === tierFilter) &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.topics.toLowerCase().includes(search.toLowerCase())),
    )
    if (sortBy === 'overdue') ps = [...ps].sort((a, b) => personOverdueBy(b, state.settings) - personOverdueBy(a, state.settings))
    if (sortBy === 'name') ps = [...ps].sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'recent') ps = [...ps].sort((a, b) => daysSince(a.lastContact) - daysSince(b.lastContact))
    return ps
  }, [state.people, state.settings, tierFilter, search, sortBy])

  return (
    <div className="grid gap-4">
      {/* Call list strip */}
      <section className="border border-border bg-card shadow-sm rise-in">
        <div className="px-4 pt-3 pb-2 flex items-baseline gap-3">
          <SectionTitle className="mb-0">Today’s suggested calls</SectionTitle>
          <span className="text-[11px] text-muted-foreground">overdue cadence · follow-ups due · flags · one reconnect</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-px bg-border">
          {calls.map(c => (
            <div key={c.person.id} className="bg-card px-4 py-2.5">
              <button onClick={() => setViewPerson(c.person)} className="text-[13.5px] font-medium hover:text-[hsl(17_63%_47%)]">{c.person.name}</button>
              <div className="text-[11.5px] text-muted-foreground line-clamp-2">{c.reason}</div>
              <Button size="sm" className="h-6 px-2 mt-1.5 text-[11px]" onClick={() => setLogPerson(c.person)}><Phone className="h-3 w-3 mr-1" />Log outcome</Button>
            </div>
          ))}
        </div>
      </section>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Search people or topics…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-56 bg-card" />
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="h-8 w-36 bg-card text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {(Object.keys(TIER_LABELS) as Tier[]).map(t => <SelectItem key={t} value={t}>{TIER_LABELS[t]} — every {state.settings.tierCadence[t]}d</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as never)}>
          <SelectTrigger className="h-8 w-44 bg-card text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="overdue">Rank: most overdue</SelectItem>
            <SelectItem value="recent">Rank: recently touched</SelectItem>
            <SelectItem value="name">Rank: name</SelectItem>
          </SelectContent>
        </Select>
        <ClearFiltersButton active={!!search || tierFilter !== 'all' || sortBy !== 'overdue'} onClear={() => { setSearch(''); setTierFilter('all'); setSortBy('overdue') }} />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={() => setImportOpen(true)}><Upload className="h-3.5 w-3.5 mr-1.5" />Import CSV</Button>
          <Button size="sm" className="h-8" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Add person</Button>
        </div>
      </div>

      {/* Table */}
      <section className="border border-border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-2 py-2 font-semibold">Tier</th>
              <th className="px-2 py-2 font-semibold">Last contact</th>
              <th className="px-2 py-2 font-semibold">Cadence</th>
              <th className="px-2 py-2 font-semibold">Status</th>
              <th className="px-2 py-2 font-semibold">Last sentiment</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {people.map(p => {
              const over = personOverdueBy(p, state.settings)
              const lastInt = state.interactions.find(i => i.personId === p.id)
              return (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-accent/50 group">
                  <td className="px-4 py-2">
                    <button onClick={() => setViewPerson(p)} className="font-medium hover:text-[hsl(17_63%_47%)] text-left">
                      {p.name}{p.vip && <span className="text-[9.5px] align-top text-[hsl(40_65%_38%)] font-bold ml-1">VIP</span>}
                      {p.flaggedForCall && <span className="text-[9.5px] align-top text-[hsl(17_63%_47%)] ml-1">⚑</span>}
                    </button>
                    <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">{p.how}</div>
                  </td>
                  <td className="px-2 py-2"><TierBadge tier={p.tier} /></td>
                  <td className="px-2 py-2 tabular">{p.lastContact ? `${fmtDate(p.lastContact)} · ${daysSince(p.lastContact)}d` : 'never'}</td>
                  <td className="px-2 py-2 tabular text-muted-foreground">every {personCadence(p, state.settings)}d{p.cadenceDays ? ' (custom)' : ''}</td>
                  <td className="px-2 py-2">
                    {over > 0
                      ? <span className="text-[hsl(8_60%_41%)] font-semibold tabular">{over}d overdue</span>
                      : <span className="text-[hsl(152_25%_35%)]">current</span>}
                  </td>
                  <td className="px-2 py-2">{lastInt ? <span className="inline-flex items-center gap-1.5"><SentimentDot s={lastInt.sentiment} /><span className="text-muted-foreground text-[12px] capitalize">{lastInt.sentiment.replace('-', ' ')}</span></span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-2 py-2 text-right">
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] opacity-0 group-hover:opacity-100" onClick={() => setLogPerson(p)}>Log</Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {people.length === 0 && <EmptyNote>No one matches.</EmptyNote>}
      </section>

      <PersonDetail person={viewPerson} onClose={() => setViewPerson(null)} onLog={p => setLogPerson(p)} />
      <LogCallDialog person={logPerson} open={!!logPerson} onClose={() => setLogPerson(null)} />
      <AddPersonDialog open={adding} onClose={() => setAdding(false)} onAdd={p => { addPerson(p); toast.success(`${p.name} added`) }} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

function AddPersonDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (p: Partial<Person> & { name: string }) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [tier, setTier] = useState<Tier>('network')
  const [how, setHow] = useState('')
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-display text-lg">Add a person</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label className="text-xs">Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label className="text-xs">Phone / WhatsApp</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Tier</Label>
              <Select value={tier} onValueChange={v => setTier(v as Tier)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(TIER_LABELS) as Tier[]).map(t => <SelectItem key={t} value={t}>{TIER_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label className="text-xs">How you know them</Label><Input value={how} onChange={e => setHow(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (!name.trim()) return; onAdd({ name, phone, tier, how }); setName(''); setPhone(''); onClose() }}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps = [
    ['1', 'Upload a CSV or spreadsheet of names'],
    ['2', 'Map columns to fields — name, phone/WhatsApp, email, tier, notes — with a preview before committing'],
    ['3', 'Unmapped columns are kept as notes so nothing is lost'],
    ['4', 'Duplicates are detected and merged; Gmail / Outlook contacts can also be pulled in from Settings › Integrations'],
  ]
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="font-display text-lg">Import contacts</DialogTitle></DialogHeader>
        <div className="grid gap-2.5">
          {steps.map(([n, s]) => (
            <div key={n} className="flex gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">{n}</span><span>{s}</span>
            </div>
          ))}
          <div className={cn('border border-dashed border-input rounded-sm p-6 text-center text-[13px] text-muted-foreground cursor-pointer hover:bg-accent/50')}
            onClick={() => toast('Import flow is wired for the build phase — this demo seeds 12 contacts instead')}>
            Drop a .csv here or click to browse
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
