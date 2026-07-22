import React, { useState } from 'react'
import { toast } from 'sonner'
import { Mail, MessageCircle, Phone, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Channel, Person, Sentiment, Tier, TIER_LABELS, addDays, daysSince, fmtDate, personCadence, today,
} from '@/lib/model'
import { useStore } from '@/lib/store'
import { TierBadge } from './bits'

const CHANNEL_ICON: Record<Channel, React.ReactNode> = {
  'call': <Phone className="h-3 w-3" />,
  'whatsapp': <MessageCircle className="h-3 w-3" />,
  'email': <Mail className="h-3 w-3" />,
  'in-person': <Users className="h-3 w-3" />,
}

export function SentimentDot({ s }: { s: Sentiment }) {
  const c = { 'positive': 'bg-[hsl(152_35%_40%)]', 'neutral': 'bg-[hsl(40_30%_60%)]', 'needs-attention': 'bg-[hsl(8_60%_45%)]' }[s]
  return <span title={s} className={cn('inline-block h-2 w-2 rounded-full shrink-0', c)} />
}

// ---------- Log an interaction ----------

export function LogCallDialog({ person, open, onClose }: { person: Person | null; open: boolean; onClose: () => void }) {
  const { state, logInteraction } = useStore()
  const [channel, setChannel] = useState<Channel>('call')
  const [purpose, setPurpose] = useState('')
  const [outcome, setOutcome] = useState('')
  const [sentiment, setSentiment] = useState<Sentiment>('positive')
  const [followUp, setFollowUp] = useState(false)
  const [followDate, setFollowDate] = useState(addDays(today(), state.settings.followUpDays))

  if (!person) return null
  const last = state.interactions.filter(i => i.personId === person.id)[0]

  function save() {
    if (!person) return
    logInteraction({
      date: today(), personId: person.id, channel, purpose: purpose || 'Catch-up', outcome, sentiment,
      followUpDate: followUp ? followDate : undefined,
    }, { followUpTitle: followUp ? `Follow up with ${person.name}` : undefined })
    toast.success(followUp ? `Logged — follow-up task created for ${fmtDate(followDate)}` : 'Logged — last-contact date updated')
    setPurpose(''); setOutcome(''); setFollowUp(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Log a touch — {person.name}</DialogTitle>
        </DialogHeader>
        {last && (
          <div className="text-[12.5px] border-l-2 border-[hsl(17_63%_47%)] pl-3 text-muted-foreground italic">
            Last time ({fmtDate(last.date)}): {last.purpose} — {last.outcome}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid grid-cols-1 gap-1.5">
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={v => setChannel(v as Channel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="in-person">In person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label className="text-xs">Sentiment</Label>
              <Select value={sentiment} onValueChange={v => setSentiment(v as Sentiment)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="needs-attention">Needs attention</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label className="text-xs">What was it about?</Label>
            <Input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Catch-up / dinner numbers / the intro…" />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label className="text-xs">Outcome — in your own words</Label>
            <Textarea rows={2} value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="Spoke to David, catching up next month, send him the article" />
          </div>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={followUp} onChange={e => setFollowUp(e.target.checked)} className="accent-[hsl(var(--primary))]" />
            Create a dated follow-up task
          </label>
          {followUp && (
            <Input type="date" value={followDate} onChange={e => setFollowDate(e.target.value)} className="w-44" />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Log it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Person detail: timeline + edit ----------

export function PersonDetail({ person, onClose, onLog }: { person: Person | null; onClose: () => void; onLog: (p: Person) => void }) {
  const { state, updatePerson, logInteraction } = useStore()
  if (!person) return null
  const timeline = state.interactions.filter(i => i.personId === person.id)
  const openTasks = state.tasks.filter(t => t.personId === person.id && t.status !== 'done' && t.status !== 'dropped')
  const cad = personCadence(person, state.settings)
  const since = daysSince(person.lastContact)
  const overdue = since > cad

  return (
    <Dialog open={!!person} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <TierBadge tier={person.tier} />
            {person.vip && <span className="text-[10.5px] uppercase tracking-wide text-[hsl(40_65%_38%)] font-bold">VIP</span>}
          </div>
          <DialogTitle className="font-display text-xl">{person.name}</DialogTitle>
          <p className="text-[12.5px] text-muted-foreground">{person.how}{person.topics && <> · {person.topics}</>}</p>
        </DialogHeader>

        {/* One-tap actions */}
        <div className="flex flex-wrap items-center gap-1.5 border border-border bg-accent/40 rounded-sm p-2.5">
          <Button size="sm" className="h-7 px-2.5 text-[12px]" onClick={() => { onClose(); onLog(person) }}>
            <Phone className="h-3 w-3 mr-1" />Log a touch
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[12px]" onClick={() => {
            logInteraction({ date: today(), personId: person.id, channel: 'call', purpose: 'Quick call', outcome: 'Caught up — nothing to action', sentiment: 'positive' })
            toast.success('Logged — last-contact reset to today')
          }}>
            Called — nothing to log
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[12px]" onClick={() => { updatePerson(person.id, { flaggedForCall: !person.flaggedForCall }, person.flaggedForCall ? 'unflagged' : 'flagged “call this week”'); toast(person.flaggedForCall ? 'Unflagged' : 'On this week’s call list') }}>
            {person.flaggedForCall ? 'Unflag' : '⚑ Call this week'}
          </Button>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-1 mr-0.5">Tier</span>
          {(Object.keys(TIER_LABELS) as Tier[]).map(t => (
            <button
              key={t}
              onClick={() => { updatePerson(person.id, { tier: t }, `tier → ${TIER_LABELS[t]}`); toast(`${person.name} → ${TIER_LABELS[t]} (every ${state.settings.tierCadence[t]}d)`) }}
              className={cn(
                'px-2 py-0.5 text-[11px] border rounded-sm transition-colors',
                person.tier === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-accent',
              )}
            >
              {TIER_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="border border-border bg-card py-2">
            <div className={cn('font-display text-lg font-semibold tabular', overdue && 'text-[hsl(8_60%_41%)]')}>{since === 9999 ? '—' : since}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">days since</div>
          </div>
          <div className="border border-border bg-card py-2">
            <div className="font-display text-lg font-semibold tabular">{cad}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">cadence (d)</div>
          </div>
          <div className="border border-border bg-card py-2">
            <div className="font-display text-lg font-semibold tabular">{timeline.length}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">touches</div>
          </div>
        </div>

        {(person.phone || person.email) && (
          <div className="flex gap-2 text-[12.5px]">
            {person.phone && <Button size="sm" variant="outline" className="h-7" onClick={() => toast('One-tap dial — placeholder for the phone shortcut')}><Phone className="h-3 w-3 mr-1.5" />{person.phone}</Button>}
            {person.email && <Button size="sm" variant="outline" className="h-7" onClick={() => toast('Opens a draft — AI can write it in your voice')}><Mail className="h-3 w-3 mr-1.5" />{person.email}</Button>}
          </div>
        )}

        {person.notes && <p className="text-[13px] border-l-2 border-border pl-3 text-foreground/80">{person.notes}</p>}

        {openTasks.length > 0 && (
          <div>
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1">You owe them</div>
            {openTasks.map(t => (
              <div key={t.id} className="text-[13px] py-0.5 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(17_63%_47%)]" />{t.title}
                {t.due && <span className="text-[11px] text-muted-foreground tabular">due {fmtDate(t.due)}</span>}
              </div>
            ))}
          </div>
        )}

        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1.5">Interaction timeline — newest first, append-only</div>
          <div className="border-t border-border">
            {timeline.length === 0 && <p className="text-[13px] text-muted-foreground italic py-2">No touches logged yet.</p>}
            {timeline.map(i => (
              <details key={i.id} className="border-b border-border/60 py-1.5 group">
                <summary className="flex items-center gap-2 text-[12.5px] cursor-pointer list-none">
                  <span className="text-muted-foreground tabular w-[64px] shrink-0">{fmtDate(i.date)}</span>
                  <span className="text-muted-foreground">{CHANNEL_ICON[i.channel]}</span>
                  <SentimentDot s={i.sentiment} />
                  <span className="truncate">{i.purpose}</span>
                </summary>
                <div className="pl-[84px] text-[12.5px] text-foreground/75 pt-1">
                  {i.outcome || '—'}
                  {i.followUpDate && <div className="text-[11.5px] text-[hsl(17_63%_47%)] mt-0.5">Follow-up set for {fmtDate(i.followUpDate)}</div>}
                </div>
              </details>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="outline" size="sm"
            onClick={() => { updatePerson(person.id, { flaggedForCall: !person.flaggedForCall }, person.flaggedForCall ? 'unflagged' : 'flagged “call this week”'); toast(person.flaggedForCall ? 'Unflagged' : 'Flagged — will appear on the call list') }}
          >
            {person.flaggedForCall ? 'Unflag' : 'Flag: call this week'}
          </Button>
          <Button size="sm" onClick={() => { onClose(); onLog(person) }}>Log a touch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
