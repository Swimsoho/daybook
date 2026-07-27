import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, Phone, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Person, daysSince, fmtDate, personCadence, personOverdueBy, resolveTiers, tierColorOf, tierLabel } from '@/lib/model'
import { buildCallList, useStore } from '@/lib/store'
import { ClearFiltersButton, EmptyNote, SectionTitle, TierBadge } from '@/components/bits'
import { ExportMenu } from '@/components/ExportMenu'
import { ViewExport } from '@/lib/exportView'
import { LogCallDialog, PersonDetail, SentimentDot } from '@/components/people'
import { SPREADSHEET_ACCEPT, downloadXlsxTemplateWithDropdowns, parseSpreadsheetFile } from '@/lib/xlsxTemplate'

type PeopleSortKey = 'name' | 'tier' | 'lastContact' | 'cadence' | 'status' | 'sentiment'
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
    const tierOrder = new Map(resolveTiers(state.settings).map((t, i) => [t.id, i]))
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
        case 'tier': return tierOrder.get(p.tier) ?? 99
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
            {resolveTiers(state.settings).map(t => <SelectItem key={t.id} value={t.id}>{t.name} — every {t.cadenceDays}d</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">Click a column header to sort</span>
        <ClearFiltersButton active={!!search || tierFilter !== 'all'} onClear={() => { setSearch(''); setTierFilter('all') }} />
        <div className="ml-auto flex flex-wrap gap-2">
          <ExportMenu getData={(): ViewExport => ({
            title: 'People',
            subtitle: [tierFilter !== 'all' ? tierLabel(state.settings, tierFilter) : '', search ? 'filtered view' : ''].filter(Boolean).join(' · ') || undefined,
            headers: ['Name', 'Phone', 'Email', 'Tier', 'Cadence (days)', 'Last contact', 'Status', 'Last sentiment', 'How you know them', 'Topics', 'Notes'],
            rows: people.map(p => [
              p.name, p.phone ?? '', p.email ?? '', tierLabel(state.settings, p.tier),
              personCadence(p, state.settings),
              p.lastContact ? fmtDate(p.lastContact) : '',
              personOverdueBy(p, state.settings) > 0 ? `${personOverdueBy(p, state.settings)}d overdue` : 'current',
              state.interactions.find(i => i.personId === p.id)?.sentiment ?? '',
              p.how ?? '', p.topics ?? '', p.notes ?? '',
            ]),
            filenameBase: 'daybook-contacts',
          })} />
          <Button variant="outline" size="sm" className="h-8" onClick={() => downloadContactsTemplate(resolveTiers(state.settings).map(t => t.name))}><Download className="h-3.5 w-3.5 mr-1.5" />Excel template</Button>
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
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-accent/50 group" style={{ boxShadow: `inset 3px 0 0 ${tierColorOf(state.settings, p.tier)}` }}>
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
  const tiers = resolveTiers(state.settings)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [tier, setTier] = useState<string>(() => tiers.find(t => t.id === 'network')?.id ?? tiers[0]?.id ?? 'network')
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
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{tiers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
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

async function downloadContactsTemplate(tierNames: string[]) {
  // First name + Last name are separate columns for easy filling; on import they're joined into the
  // single contact Name. (A legacy single "Name" column is still accepted by the importer.)
  const t0 = tierNames[Math.min(1, tierNames.length - 1)] ?? 'Active'
  const t1 = tierNames[0] ?? 'Inner'
  const rows = [
    ['First name', 'Last name', 'Phone / WhatsApp', 'Email', 'Tier', 'Cadence days', 'How you know them', 'Topics', 'VIP', 'Birthday', 'Notes'],
    ['David', 'Feldman', '+44 7700 900010', 'david@feldman.co', t0, '', 'Old colleague', 'Consulting, governors', 'yes', '1975-04-12', 'Owes me an intro'],
    ['Mum', '', '+44 7700 900001', '', t1, '3', 'Family', 'Family, weekend plans', '', '1958-08-02', 'Call every few days'],
    ['Ella', 'Rosen', '', 'ella.rosen@gmail.com', tierNames[tierNames.length - 1] ?? 'Dormant', '', 'Former client', 'Marketing', '', '', ''],
    [`- DELETE THIS ROW - First + Last name are joined into the contact name (at least one required). Tier = ${tierNames.join(' | ')}. Cadence days = number (blank = tier default). VIP = yes/no. Birthday = date YYYY-MM-DD (also lands in Upcoming dates).`, '', '', '', '', '', '', '', '', '', ''],
  ]
  await downloadXlsxTemplateWithDropdowns('daybook-contacts-template.xlsx', 'Contacts', rows, [
    { col: 4, values: tierNames }, // Tier
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

// Parse a vCard (.vcf) export — the format iPhone/iCloud, Outlook and Google Contacts all offer —
// into the same row shape the CSV importer already understands (First name / Last name / Phone /
// Email / Notes). So Apple/phone contacts import natively without converting to CSV first.
function parseVCards(text: string): string[][] {
  const header = ['First name', 'Last name', 'Phone / WhatsApp', 'Email', 'Notes']
  const rows: string[][] = [header]
  const unesc = (v: string) => v.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
  // Unfold RFC-6350 folded lines (a continuation line starts with a space or tab).
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
  for (const card of unfolded.split(/BEGIN:VCARD/i).slice(1)) {
    const body = card.split(/END:VCARD/i)[0]
    let first = '', last = '', fn = '', tel = '', email = '', note = ''
    for (const line of body.split('\n')) {
      const idx = line.indexOf(':')
      if (idx === -1) continue
      const key = line.slice(0, idx).split(';')[0].toUpperCase()
      const val = unesc(line.slice(idx + 1))
      if (key === 'N') { const parts = val.split(';'); last = parts[0] || ''; first = parts[1] || '' }
      else if (key === 'FN' && !fn) fn = val
      else if (key === 'TEL' && !tel) tel = val
      else if (key === 'EMAIL' && !email) email = val
      else if (key === 'NOTE' && !note) note = val
    }
    if (!first && !last && fn) { const sp = fn.split(/\s+/); first = sp.shift() || ''; last = sp.join(' ') }
    if (!([first, last].filter(Boolean).join(' ') || fn).trim()) continue
    rows.push([first, last, tel, email, note])
  }
  return rows
}

interface ParsedPerson {
  person: Partial<Person> & { name: string }
  mergeWith?: Person
  warnings: string[]
}

// ---- Format-agnostic column detection ----------------------------------------------------------
// Real address-book exports never match a fixed template — Gmail calls email "E-mail 1 - Value",
// Outlook calls it "E-mail Address", phones are "Phone 1 - Value" / "Mobile Phone" / "Business
// Phone", and so on. Rather than make the user reshape their spreadsheet, we detect each Daybook
// field from the file's own headers by pattern, tolerating every common provider's naming. Email
// and phone are multi-column (providers spread them across Phone 1/2, Mobile, Home…) — at row time
// we take the first non-empty. Anything we can't auto-detect, the user maps by hand in a few
// clicks (see the mapper UI). `exclude` skips Google's paired "… - Type"/"… - Label" columns so we
// grab the value, not the word "Mobile".
type MapField = 'first' | 'last' | 'full' | 'email' | 'phone' | 'company' | 'notes' | 'birthday' | 'tier' | 'cadence' | 'vip' | 'how' | 'topics'
type ColumnMapping = Record<MapField, number[]>

const FIELD_DEFS: { key: MapField; label: string; patterns: string[]; exclude?: string[]; multi?: boolean }[] = [
  { key: 'first', label: 'First name', patterns: ['first name', 'given name', 'first', 'given'] },
  { key: 'last', label: 'Last name', patterns: ['last name', 'family name', 'surname', 'last', 'family'] },
  { key: 'full', label: 'Full name (if not split)', patterns: ['display name', 'full name', 'name'] },
  { key: 'email', label: 'Email', patterns: ['e-mail', 'email', 'mail'], exclude: ['type', 'label', 'protocol', 'display'], multi: true },
  { key: 'phone', label: 'Phone / WhatsApp', patterns: ['phone', 'mobile', 'cell', 'tel', 'whatsapp'], exclude: ['type', 'label'], multi: true },
  { key: 'company', label: 'Company / Org', patterns: ['organization', 'organisation', 'company'], exclude: ['title', 'type', 'department'] },
  { key: 'notes', label: 'Notes', patterns: ['notes', 'note'] },
  { key: 'birthday', label: 'Birthday', patterns: ['birthday', 'birth', 'bday'] },
  { key: 'tier', label: 'Tier', patterns: ['tier'] },
  { key: 'cadence', label: 'Cadence days', patterns: ['cadence'] },
  { key: 'vip', label: 'VIP', patterns: ['vip'] },
  { key: 'how', label: 'How you know them', patterns: ['how you', 'how'] },
  { key: 'topics', label: 'Topics', patterns: ['topics', 'topic'] },
]

const EMPTY_MAPPING = (): ColumnMapping =>
  ({ first: [], last: [], full: [], email: [], phone: [], company: [], notes: [], birthday: [], tier: [], cadence: [], vip: [], how: [], topics: [] })

function autoDetectMapping(header: string[]): ColumnMapping {
  const hs = header.map(h => h.trim().toLowerCase())
  const mapping = EMPTY_MAPPING()
  const used = new Set<number>()
  const matches = (h: string, def: typeof FIELD_DEFS[number]) =>
    def.patterns.some(p => h.includes(p)) && !(def.exclude ?? []).some(x => h.includes(x))
  for (const def of FIELD_DEFS) {
    if (def.multi) {
      const idxs = hs.map((h, i) => (matches(h, def) && !used.has(i) ? i : -1)).filter(i => i !== -1)
      idxs.forEach(i => used.add(i))
      mapping[def.key] = idxs
    } else {
      const i = hs.findIndex((h, i) => matches(h, def) && !used.has(i))
      if (i !== -1) { used.add(i); mapping[def.key] = [i] }
    }
  }
  return mapping
}

// Turn raw rows + a column mapping into preview-ready people, with the same merge/dedupe and
// warnings the importer has always used. Reused by both the auto path and the manual mapper.
function buildParsed(rows: string[][], mapping: ColumnMapping, state: ReturnType<typeof useStore>['state']): ParsedPerson[] {
  const tiers = resolveTiers(state.settings)
  const tierMap = new Map(tiers.flatMap(t => [[t.id.toLowerCase(), t.id], [t.name.toLowerCase(), t.id]] as [string, string][]))
  const defaultTier = tiers.find(t => t.id === 'network')?.id ?? tiers[0]?.id ?? 'network'
  const one = (r: string[], idxs: number[]) => (idxs.length ? (r[idxs[0]] ?? '').trim() : '')
  const firstNonEmpty = (r: string[], idxs: number[]) => { for (const i of idxs) { const v = (r[i] ?? '').trim(); if (v) return v } return '' }

  const out: ParsedPerson[] = []
  for (const r of rows.slice(1)) {
    const first = one(r, mapping.first)
    const last = one(r, mapping.last)
    const full = one(r, mapping.full)
    const name = ([first, last].filter(Boolean).join(' ').trim()) || full
    if (!name) continue
    if (first.startsWith('- DELETE THIS ROW') || full.startsWith('- DELETE THIS ROW')) continue
    const warnings: string[] = []
    const email = firstNonEmpty(r, mapping.email)
    const phone = firstNonEmpty(r, mapping.phone)
    const company = one(r, mapping.company)
    let notes = one(r, mapping.notes)
    if (company) notes = notes ? (notes.toLowerCase().includes(company.toLowerCase()) ? notes : `${notes} · ${company}`) : company
    const tierRaw = one(r, mapping.tier).toLowerCase()
    const tier = tierMap.get(tierRaw) ?? defaultTier
    if (tierRaw && !tierMap.has(tierRaw)) warnings.push(`tier "${tierRaw}" -> ${tiers.find(t => t.id === defaultTier)?.name}`)
    const cadRaw = one(r, mapping.cadence)
    const cadence = cadRaw ? parseInt(cadRaw, 10) : undefined
    if (cadRaw && (!cadence || cadence < 1)) warnings.push(`cadence "${cadRaw}" ignored`)
    const birthdayRaw = one(r, mapping.birthday)
    const birthday = normalizeBirthday(birthdayRaw)
    if (birthdayRaw && !birthday) warnings.push(`birthday "${birthdayRaw}" ignored (use YYYY-MM-DD)`)
    const existing = state.people.find(p =>
      (email && p.email && p.email.toLowerCase() === email.toLowerCase()) ||
      p.name.trim().toLowerCase() === name.toLowerCase(),
    )
    out.push({
      warnings,
      mergeWith: existing,
      person: {
        name, phone: phone || undefined, email: email || undefined, tier,
        cadenceDays: cadence && cadence > 0 ? cadence : undefined,
        how: one(r, mapping.how), topics: one(r, mapping.topics),
        vip: ['yes', 'y', 'true', '1'].includes(one(r, mapping.vip).toLowerCase()),
        birthday,
        notes: notes || undefined,
      },
    })
  }
  return out
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, addPerson, updatePerson, setBirthday } = useStore()
  const [parsed, setParsed] = useState<ParsedPerson[] | null>(null)
  const [fileName, setFileName] = useState('')
  // Raw rows + detected/edited column mapping kept around so the user can open the column-mapper
  // to correct a mis-detected column without re-picking the file.
  const [rawRows, setRawRows] = useState<string[][] | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [mapMode, setMapMode] = useState(false)

  function resetImport() {
    setParsed(null); setFileName(''); setRawRows(null); setMapping(null); setMapMode(false)
  }

  function handleFile(f: File) {
    setFileName(f.name)
    // .vcf (vCard) exports are read as text and converted to rows; everything else goes through the
    // spreadsheet parser. Both then run the identical detect → build → preview pipeline below.
    const loader = /\.vcf$/i.test(f.name) || f.type.includes('vcard') ? f.text().then(parseVCards) : parseSpreadsheetFile(f)
    loader.then(rows => {
      if (rows.length < 2) { toast.error('No data rows found — start from the template'); return }
      const header = rows[0].map(h => (h ?? '').trim())
      const m = autoDetectMapping(header)
      setRawRows(rows)
      setMapping(m)
      const nameDetected = m.first.length > 0 || m.full.length > 0
      if (nameDetected) {
        const out = buildParsed(rows, m, state)
        if (out.length) { setParsed(out); setMapMode(false); return }
      }
      // Couldn't confidently find a name column (or matched columns produced no rows) — drop the
      // user into the mapper so any format at all can be imported with a few clicks.
      setParsed(null)
      setMapMode(true)
      toast('Couldn’t fully auto-detect the columns — match them below (takes a few clicks).')
    }).catch(() => toast.error('Couldn’t read that file — try a .vcf, .csv or .xlsx export'))
  }

  // Apply the current (possibly hand-edited) mapping to the loaded rows and show the preview.
  function applyMapping() {
    if (!rawRows || !mapping) return
    if (mapping.first.length === 0 && mapping.full.length === 0) {
      toast.error('Pick which column holds the name (First name, or Full name) to continue.')
      return
    }
    const out = buildParsed(rawRows, mapping, state)
    if (!out.length) { toast.error('That mapping produced no contacts — check the name column.'); return }
    setParsed(out); setMapMode(false)
    toast.success(`Matched ${out.length} contacts`)
  }

  // Set a single field's column from the mapper dropdown (-1 clears it).
  function setMapCol(field: MapField, idx: number) {
    setMapping(m => (m ? { ...m, [field]: idx === -1 ? [] : [idx] } : m))
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
    resetImport(); onClose()
  }

  const header = rawRows?.[0]?.map(h => (h ?? '').trim()) ?? []
  // Preview a few sample values for a column so the user can tell which is which when mapping.
  const sampleFor = (idx: number) => {
    if (!rawRows) return ''
    for (const r of rawRows.slice(1, 6)) { const v = (r[idx] ?? '').trim(); if (v) return v }
    return ''
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { resetImport(); onClose() } }}>
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-lg">Import contacts</DialogTitle></DialogHeader>
        {mapMode && rawRows ? (
          /* ---- Column mapper: match the file's columns to Daybook fields ---- */
          <div className="grid grid-cols-1 gap-2.5">
            <p className="text-[13px]">
              Match your file's columns to Daybook. We've guessed from <span className="text-muted-foreground">{fileName}</span> — just fix any that are off. <b>Name is the only must-have</b> (First name, or a single Full name column).
            </p>
            <div className="border border-border rounded-sm divide-y divide-border/60 max-h-[360px] overflow-y-auto">
              {FIELD_DEFS.map(def => {
                const cur = mapping?.[def.key]?.[0] ?? -1
                const autoMulti = (mapping?.[def.key]?.length ?? 0) > 1
                return (
                  <div key={def.key} className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px]">
                    <span className="w-32 shrink-0 text-muted-foreground">{def.label}</span>
                    <select
                      value={cur}
                      onChange={e => setMapCol(def.key, Number(e.target.value))}
                      className="h-7 flex-1 min-w-0 border border-border rounded-sm bg-background px-1.5 text-[12px] cursor-pointer outline-none"
                    >
                      <option value={-1}>— none —</option>
                      {header.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                    <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground" title={cur !== -1 ? sampleFor(cur) : ''}>
                      {autoMulti ? `+${(mapping?.[def.key]?.length ?? 1) - 1} more auto` : cur !== -1 ? sampleFor(cur) : ''}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">Email and phone can span several columns (Gmail's "Phone 1 / 2", Outlook's "Mobile / Business") — we keep the first non-empty automatically; pick one here only to override.</p>
          </div>
        ) : !parsed ? (
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">1</span>
              <div>
                <b>Bring in contacts you already have.</b> Export them from Gmail, iCloud/iPhone, Outlook — or anywhere — and drop the file in below. <b>Any column layout works</b>: Daybook reads the file's own headers and matches them for you (and asks you to confirm anything it's unsure about). No reformatting.
                <ul className="mt-1 text-[12px] text-muted-foreground list-disc pl-4 space-y-0.5">
                  <li><b>Gmail:</b> Google Contacts → Export → <i>Google CSV</i> or vCard.</li>
                  <li><b>iPhone / iCloud:</b> iCloud.com → Contacts → select all → Export vCard (<code>.vcf</code>).</li>
                  <li><b>Outlook:</b> People → Manage → Export contacts → CSV (or vCard from the desktop app).</li>
                </ul>
                <div><Button size="sm" variant="outline" className="h-7 mt-1.5" onClick={() => downloadContactsTemplate(resolveTiers(state.settings).map(t => t.name))}>Or download the Excel template (.xlsx)</Button></div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-[13px]">
              <span className="font-display font-semibold text-muted-foreground">2</span>
              <div className="flex-1">
                Drop your file in — <b>.vcf, .csv or .xlsx</b> all work. You'll get a preview first, and <b>duplicates (same email or name) are merged into the existing contact, never doubled</b> — so importing again later just updates and adds, it never recreates.
                <label className={cn('mt-1.5 border border-dashed border-input rounded-sm p-5 text-center text-[13px] text-muted-foreground cursor-pointer hover:bg-accent/50 block')}>
                  {fileName || 'Click to choose a .vcf, .csv or .xlsx file'}
                  <input type="file" accept={`${SPREADSHEET_ACCEPT},.vcf,text/vcard,text/x-vcard`} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
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
            <button onClick={() => setMapMode(true)} className="text-[12px] text-[hsl(17_63%_47%)] hover:underline text-left w-fit">
              Columns look wrong? Adjust the mapping →
            </button>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { resetImport(); onClose() }}>Cancel</Button>
          {mapMode && rawRows && <Button variant="outline" onClick={() => { resetImport() }}>Different file</Button>}
          {mapMode && rawRows && <Button onClick={applyMapping}>Match columns</Button>}
          {!mapMode && parsed && <Button variant="outline" onClick={() => resetImport()}>Different file</Button>}
          {!mapMode && parsed && <Button onClick={commit}>Import {parsed.length} contacts</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
