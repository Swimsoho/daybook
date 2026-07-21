import React, { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { PriorityScheme, Tier, TIER_LABELS } from '@/lib/model'
import { useStore } from '@/lib/store'
import { Cloud } from '@/lib/cloud'

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

export default function SettingsPage({ cloud }: { cloud?: Cloud }) {
  const { state, updateSettings, updateFeatures, updateArea, addArea, addCategory, updateCategory } = useStore()
  const s = state.settings
  const [newArea, setNewArea] = useState('')
  const [newCat, setNewCat] = useState('')
  const [newCatParent, setNewCatParent] = useState('none')
  const [phone, setPhoneInput] = useState(cloud?.profile.phone ?? '')

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
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <div className="grid gap-4">
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
                    <Button
                      variant="outline" size="sm" className="h-8 text-[11px] px-2 shrink-0"
                      onClick={() => { updateCategory(c.id, { active: !c.active }); toast(c.active ? `${c.name} archived — history preserved` : `${c.name} restored`) }}
                    >
                      {c.active ? 'Archive' : 'Restore'}
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
  )
}
