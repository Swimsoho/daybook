import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, Phone, Plus, Upload } from 'lucide-react'
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
import { SPREADSHEET_ACCEPT, downloadXlsxTemplateWithDropdowns, parseSpreadsheetFile } from '@/lib/xlsxTemplate'

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
    <div className="grid grid-cols-1 gap-4">
      {/* Call list strip */}
      <section className="border border-border bg-card shadow-sm rounded-lg rise-in">
        <div className="px-4 pt-3 pb-2 flex items-baseline gap-3">
          <SectionTitle className="mb-0">Today’s suggested calls</SectionTitle>
          <span className="text-[11px] text-muted-foreground">overdue cadence · follow-ups due · flags · one reconnect</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border">
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
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={downloadContactsTemplate}><Download className="h-3.5 w-3.5 mr-1.5" />Excel template</Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setImportOpen(true)}><Upload className="h-3.5 w-3.5 mr-1.5" />Import contacts</Button>
          <Button size="sm" className="h-8" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />Add person</Button>
        </div>
      </div>

      {/* Table */}
      <section className="border border-border bg-card shadow-sm rounded-lg overflow-x-auto">
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
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5"><Label className="text-xs">Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="grid grid-cols-1 gap-1.5"><Label className="text-xs">Phone / WhatsApp</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid grid-cols-1 gap-1.5">
              <Label className="text-xs">Tier</Label>
              <Select value={tier} onValueChange={v => setTier(v as Tier)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(TIER_LABELS) as Tier[]).map(t => <SelectItem key={t} value={t}>{TIER_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-1.5"><Label className="text-xs">How you know them</Label><Input value={how} onChange={e => setHow(e.target.value)} /></div>
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

// ---------- Contacts bulk import: template + preview + merge ----------

async function downloadContactsTemplate() {
  const rows = [
    ['Name', 'Phone / WhatsApp', 'Email', 'Tier', 'Cadence days', 'How you know them', 'Topics', 'VIP', 'Birthday', 'Notes'],
    ['David Feldman', '+44 7700 900010', 'david@feldman.co', 'active', '', 'Old colleague', 'Consulting, governors', 'yes', '1975-04-12', 'Owes me an intro'],
    ['Mum', '+44 7700 900001', '', 'inner', '3', 'Family', 'Family, weekend plans', '', '1958-08-02', 'Call every few days'],
    ['Ella Rosen', '', 'ella.rosen@gmail.com', 'dormant', '', 'Former client', 'Marketing', '', '', ''],
    ['- DELETE THIS ROW - allowed values: Tier = inner | active | network | dormant. Cadence days = number (blank = tier default). VIP = yes/no. Birthday = date YYYY-MM-DD (also lands in Upcoming dates). Only Name is required.', '', '', '', '', '', '', '', '', ''],
  ]
  await downloadXlsxTemplateWithDropdowns('daybook-contacts-template.xlsx', 'Contacts', rows, [
    { col: 3, values: ['inner', 'active', 'network', 'dormant'] }, // Tier
    { col: 7, values: ['yes', 'no'] }, // VIP
  ])
  toast.success('Excel template downloaded — includes Birthday, with Tier and VIP as dropdowns')
}

// Accepts YYYY-MM-DD (also tolerates common date-cell formats Excel might hand back). Returns a
// clean ISO date string or undefined if it doesn't look like a real date.
function normalizeBirthday(raw: string): string | undefined {
  const s = raw.trim()
  if (!s) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (isNaN(d.getTime())) return undefined
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return iso
}

interface ParsedPerson {
  person: Partial<Person> & { name: string }
  mergeWith?: Person
  warnings: string[]
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, addPerson, updatePerson, setBirthday } = useStore()
  const [parsed, setParsed] = useState<ParsedPerson[] | null>(null)
  const [fileName, setFileName] = useState('')

  function handleFile(f: File) {
    setFileName(f.name)
    parseSpreadsheetFile(f).then(rows => {
      if (rows.length < 2) { toast.error('No data rows found - start from the template'); return }
      const header = rows[0].map(h => h.trim().toLowerCase())
      const col = (n: string) => header.findIndex(h => h.startsWith(n))
      const iName = col('name')
      if (iName === -1) { toast.error('Missing "Name" column - use the downloaded template'); return }
      const get = (r: string[], n: string) => { const i = col(n); return i === -1 ? '' : (r[i] ?? '').trim() }

      const out: ParsedPerson[] = []
      for (const r of rows.slice(1)) {
        const name = (r[iName] ?? '').trim()
        if (!name || name.startsWith('- DELETE THIS ROW')) continue
        const warnings: string[] = []
        const tierRaw = get(r, 'tier').toLowerCase()
        const tier = (['inner', 'active', 'network', 'dormant'].includes(tierRaw) ? tierRaw : 'network') as Tier
        if (tierRaw && tier !== tierRaw) warnings.push(`tier "${tierRaw}" -> network`)
        const cadRaw = get(r, 'cadence')
        const cadence = cadRaw ? parseInt(cadRaw, 10) : undefined
        if (cadRaw && (!cadence || cadence < 1)) warnings.push(`cadence "${cadRaw}" ignored`)
        const email = get(r, 'email')
        const phone = get(r, 'phone')
        const existing = state.people.find(p =>
          (email && p.email && p.email.toLowerCase() === email.toLowerCase()) ||
          p.name.trim().toLowerCase() === name.toLowerCase(),
        )
        const birthdayRaw = get(r, 'birthday')
        const birthday = normalizeBirthday(birthdayRaw)
        if (birthdayRaw && !birthday) warnings.push(`birthday "${birthdayRaw}" ignored (use YYYY-MM-DD)`)
        out.push({
          warnings,
          mergeWith: existing,
          person: {
            name, phone: phone || undefined, email: email || undefined, tier,
            cadenceDays: cadence && cadence > 0 ? cadence : undefined,
            how: get(r, 'how'), topics: get(r, 'topics'),
            vip: ['yes', 'y', 'true', '1'].includes(get(r, 'vip').toLowerCase()),
            birthday,
            notes: get(r, 'notes') || undefined,
          },
        })
      }
      if (!out.length) { toast.error('No importable rows found'); return }
      setParsed(out)
    }).catch(() => toast.error('Couldn’t read that file - make sure it’s the .xlsx or .csv you exported/filled in'))
  }

  function commit() {
    if (!parsed) return
    let added = 0, merged = 0
    for (const p of parsed) {
      const id = p.mergeWith
        ? (updatePerson(p.mergeWith.id, { ...p.person, name: p.mergeWith.name }, 'merged from import'), p.mergeWith.id)
        : addPerson(p.person).id
      // Mirror an imported birthday into Dates to Remember too, exactly like setting it on the
      // contact card — so imported birthdays show up in Upcoming dates, not just on the record.
      if (p.person.birthday) setBirthday(id, p.person.birthday)
      if (p.mergeWith) merged++; else added++
    }
    toast.success(`Imported: ${added} new, ${merged} merged into existing contacts`)
    setParsed(null); setFileName(''); onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setParsed(null); setFileName(''); onClose() } }}>
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-lg">Import contacts</DialogTitle></DialogHeader>
        {!parsed ? (
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">1</span>
              <div>
                Download the Excel template - all fields, example rows, allowed values.
                <div><Button size="sm" variant="outline" className="h-7 mt-1.5" onClick={downloadContactsTemplate}>Download template (.xlsx)</Button></div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">2</span>
              <span>Fill it in - one person per row, only <b>Name</b> required - and save it (.xlsx or .csv both work).</span>
            </div>
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">3</span>
              <div className="flex-1">
                Upload for a preview. Duplicates (same email or name) are detected and merged, never doubled.
                <label className={cn('mt-1.5 border border-dashed border-input rounded-sm p-5 text-center text-[13px] text-muted-foreground cursor-pointer hover:bg-accent/50 block')}>
                  {fileName || 'Click to choose your filled .xlsx or .csv'}
                  <input type="file" accept={SPREADSHEET_ACCEPT} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            <p className="text-[13px]">
              <b>{parsed.length}</b> contacts from <span className="text-muted-foreground">{fileName}</span>
              {parsed.some(p => p.mergeWith) && <span> - <b>{parsed.filter(p => p.mergeWith).length}</b> will merge into existing records</span>}
            </p>
            <div className="border border-border max-h-[320px] overflow-y-auto">
              {parsed.map((p, i) => (
                <div key={i} className="px-3 py-1.5 border-b border-border/60 last:border-0 text-[12.5px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{p.person.name}</span>
                    <TierBadge tier={p.person.tier ?? 'network'} />
                    <span className="text-[11px] text-muted-foreground truncate">{p.person.phone ?? p.person.email ?? ''}</span>
                    {p.mergeWith && <span className="ml-auto text-[10.5px] uppercase tracking-wide text-[hsl(28_60%_32%)] font-semibold shrink-0">merge</span>}
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
          {parsed && <Button onClick={commit}>Import {parsed.length} contacts</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
