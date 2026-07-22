import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStore } from '@/lib/store'
import { ClearFiltersButton, EmptyNote } from '@/components/bits'

export default function HistoryPage() {
  const { state } = useStore()
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState('all')
  const events = state.audit.filter(a =>
    (entity === 'all' || a.entity === entity) &&
    (!search || a.detail.toLowerCase().includes(search.toLowerCase()) || a.action.includes(search.toLowerCase())),
  )
  const entities = Array.from(new Set(state.audit.map(a => a.entity)))

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search the trail…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-56 bg-card" />
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="h-8 w-36 bg-card text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All records</SelectItem>
            {entities.map(e => <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <ClearFiltersButton active={!!search || entity !== 'all'} onClear={() => { setSearch(''); setEntity('all') }} />
        <p className="text-[11.5px] text-muted-foreground ml-auto">Every create, edit, status change, call and archive — timestamped, per user. Nothing is ever silently lost.</p>
      </div>
      <section className="border border-border bg-card shadow-sm">
        {events.length === 0 && <EmptyNote>No matching events.</EmptyNote>}
        {events.map(a => (
          <div key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 border-b border-border/60 last:border-0 text-[13px]">
            <span className="text-muted-foreground tabular text-[11.5px] w-[100px] sm:w-[118px] shrink-0">{a.ts.replace('T', ' · ')}</span>
            <span className="w-[70px] sm:w-[80px] shrink-0 font-medium text-[12px] truncate">{a.user}</span>
            <span className="w-[78px] sm:w-[92px] shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground truncate">{a.action}</span>
            <span className="text-[11px] uppercase tracking-wide w-[56px] sm:w-[64px] shrink-0 text-[hsl(152_25%_35%)]">{a.entity}</span>
            <span className="min-w-0 basis-full sm:basis-0 sm:flex-1 truncate">{a.detail}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
