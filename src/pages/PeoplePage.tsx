import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, Phone, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Person, Tier, TIER_COLOR, TIER_LABELS, daysSince, fmtDate, personCadence, personOverdueBy, tierLabel } from '@/lib/model'
import { buildCallList, useStore } from '@/lib/store'
import { ClearFiltersButton, EmptyNote, SectionTitle, TierBadge } from '@/components/bits'
import { LogCallDialog, PersonDetail, SentimentDot } from '@/components/people'
import { SPREADSHEET_ACCEPT, downloadXlsxTemplateWithDropdowns, parseSpreadsheetFile } from '@/lib/xlsxTemplate'

type PeopleSortKey = 'name' | 'tier' | 'lastContact' | 'cadence' | 'status' | 'sentiment'
const TIER_ORDER: Record<Tier, number> = { inner: 0, active: 1, network: 2, dormant: 3 }
// Warmest → coolest, so a "sentiment" sort groups the good and the strained ends together.
const SENTIMENT_ORDER: Record<string, number> = { positive: 0, 'follow-up': 1, neutral: 2, concerned: 3, negative: 4 }

export default function PeoplePage() {
  const { state, addPerson } = useStore()
  const [tierFilter, setTierFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<PeopleSortKey>('status')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [viewPerson, setViewPerson] = useState<Person | null>(null)
  const [logPerson, setLogPerson] = useState<Person | null>(null)
  const [adding, setAdding] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const calls = buildCallList(state).slice(0, state.settings.callGoal)

  // Clicking a column header sorts by it; clicking the same header again flips the direction.
  // Each column starts in its most useful direction (most-overdue first, recently-touched first, …).
  const DEFAULT_DIR: Record<PeopleSortKey, 'asc' | 'desc'> = {
    name: 'asc', tier: 'asc', lastContact: 'asc', cadence: 'asc', status: 'desc', sentiment: 'asc',
  }
  function headerClick(key: PeopleSortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(DEFAULT_DIR[key]) }
  }

  const people = useMemo(() => {
    const q = search.trim().toLowerCase()
    const lastSentiment = (id: string) => state.interactions.find(i => i.personId === id)?.sentiment ?? ''
    // Search now matches across every contact column, not just name/topics — name, phone, email,
    // tier, how-you-know-them, topics, and notes.
    let ps = state.people.filter(p =>
      (tierFilter === 'all' || p.tier === tierFilter) &&
      (!q || [p.name, p.phone, p.email, tierLabel(state.settings, p.tier), p.how, p.topics, p.notes]
        .some(v => (v ?? '').toLowerCase().includes(q))),
    )
    const val = (p: Person): string | number => {
      switch (sortKey) {
        case 'name': return p.name.toLowerCase()
        case 'tier': return TIER_ORDER[p.tier]
        case 'lastContact': return p.lastContact ? daysSince(p.lastContact) : 1e9 // never-contacted sorts last for "recent"
        case 'cadence': return personCadence(p, state.settings)
        case 'status': return personOverdueBy(p, state.settings)
        case 'sentiment': return SENTIMENT_ORDER[lastSentiment(p.id)] ?? 99
      }
    }
    ps = [...ps].sort((a, b) => {
      const va = val(a), vb = val(b)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return ps
  }, [state.people, state.interactions, state.settings, tierFilter, search, sortKey, sortDir])

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
        <Input placeholder="Search name, phone, email, topics…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-64 bg-card" />
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="h-8 w-36 bg-card text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {(Object.keys(TIER_LABELS) as Tier[]).map(t => <SelectItem key={t} value={t}>{tierLabel(state.settings, t)} — every {state.settings.tierCadence[t]}d</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">Click a column header to sort</span>
        <ClearFiltersButton active={!!search || tierFilter !== 'all'} onClear={() => { setSearch(''); setTierFilter('all') }} />
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
              {([['name', 'Name', 'px-4'], ['tier', 'Tier', 'px-2'], ['lastContact', 'Last contact', 'px-2'], ['cadence', 'Cadence', 'px-2'], ['status', 'Status', 'px-2'], ['sentiment', 'Last sentiment', 'px-2']] as [PeopleSortKey, string, string][]).map(([key, label, pad]) => (
                <th key={key} className={cn(pad, 'py-2 font-semibold')}>
                  <button onClick={() => headerClick(key)} className="inline-flex items-center gap-1 uppercase tracking-[0.1em] hover:text-foreground transition-colors">
                    {label}
                    <span className="text-[9px] w-2">{sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                  </button>
                </th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {people.map(p => {
              const over = personOverdueBy(p, state.settings)
              const lastInt = state.interactions.find(i => i.personId === p.id)
              return (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-accent/50 group" style={{ boxShadow: `inset 3px 0 0 ${TIER_COLOR[p.tier]}` }}>
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
  const { state } = useStore()
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
                <SelectContent>{(Object.keys(TIER_LABELS) as Tier[]).map(t => <SelectItem key={t} value={t}>{tierLabel(state.settings, t)}</SelectItem>)}</SelectContent>
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
  // First name + Last name are separate columns for easy filling; on import they're joined into the
  // single contact Name. (A legacy single "Name" column is still accepted by the importer.)
  const rows = [
    ['First name', 'Last name', 'Phone / WhatsApp', 'Email', 'Tier', 'Cadence days', 'How you know them', 'Topics', 'VIP', 'Birthday', 'Notes'],
    ['David', 'Feldman', '+44 7700 900010', 'david@feldman.co', 'active', '', 'Old colleague', 'Consulting, governors', 'yes', '1975-04-12', 'Owes me an intro'],
    ['Mum', '', '+44 7700 900001', '', 'inner', '3', 'Family', 'Family, weekend plans', '', '1958-08-02', 'Call every few days'],
    ['Ella', 'Rosen', '', 'ella.rosen@gmail.com', 'dormant', '', 'Former client', 'Marketing', '', '', ''],
    ['- DELETE THIS ROW - First + Last name are joined into the contact name (at least one required). Tier = inner | active | network | dormant. Cadence days = number (blank = tier default). VIP = yes/no. Birthday = date YYYY-MM-DD (also lands in Upcoming dates).', '', '', '', '', '', '', '', '', '', ''],
  ]
  await downloadXlsxTemplateWithDropdowns('daybook-contacts-template.xlsx', 'Contacts', rows, [
    { col: 4, values: ['inner', 'active', 'network', 'dormant'] }, // Tier
    { col: 8, values: ['yes', 'no'] }, // VIP
  ])
  toast.success('Excel template downloaded — First/Last name join into the contact name; Tier and VIP are dropdowns')
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
      const iFirst = col('first'), iLast = col('last name'), iName = col('name')
      if (iFirst === -1 && iName === -1) { toast.error('Need a "First name" (and Last name) column, or a "Name" column - use the downloaded template'); return }
      const get = (r: string[], n: string) => { const i = col(n); return i === -1 ? '' : (r[i] ?? '').trim() }
      // Build the contact name: prefer First + Last, fall back to a single Name column.
      const nameOf = (r: string[]) => {
        const joined = [iFirst !== -1 ? (r[iFirst] ?? '').trim() : '', iLast !== -1 ? (r[iLast] ?? '').trim() : ''].filter(Boolean).join(' ').trim()
        return joined || (iName !== -1 ? (r[iName] ?? '').trim() : '')
      }

      const out: ParsedPerson[] = []
      for (const r of rows.slice(1)) {
        const name = nameOf(r)
        const firstCell = ((iFirst !== -1 ? r[iFirst] : r[iName]) ?? '').trim()
        if (!name || firstCell.startsWith('- DELETE THIS ROW')) continue
        const warnings: string[] = []
        const tierRaw = get(r, 'tier').toLowerCase()
        const tier = (['inner', 'active', 'network', 'dormant'].includes(tierRaw) ? tierRaw : 'network') as Tier
        if (tierRaw && tier !== tierRaw) warnings.push(`tier "${tierRaw}" -> network`)
        const cadRaw = get(r, 'cadence')
        const cadence = cadRaw ? parseInt(cadRaw, 10) : undefined
        if (cadRaw && (!cadence || cadence < 1)) warnings.push(`cadence "${cadRaw}" ignored`)
        // Tolerate Google Contacts / phone exports: email is "E-mail 1 - Value", phone is
        // "Phone 1 - Value" (which already startsWith "phone"). So users can export their Gmail or
        // phone contacts to CSV and import them here directly, no reformatting.
        const email = get(r, 'email') || get(r, 'e-mail')
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
