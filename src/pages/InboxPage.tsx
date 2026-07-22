import React, { useState } from 'react'
import { toast } from 'sonner'
import { Check, Mail, MessageCircle, MessageSquare, Mic, PenLine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Source, fmtDate } from '@/lib/model'
import { categoriesForArea, useStore } from '@/lib/store'
import { useSpeech } from '@/hooks/useSpeech'
import { EmptyNote, PriorityChip, SectionTitle } from '@/components/bits'

const SOURCE_ICON: Record<Source, React.ReactNode> = {
  whatsapp: <MessageCircle className="h-3.5 w-3.5 text-[hsl(152_35%_35%)]" />,
  sms: <MessageSquare className="h-3.5 w-3.5 text-[hsl(260_40%_50%)]" />,
  email: <Mail className="h-3.5 w-3.5 text-[hsl(215_45%_42%)]" />,
  voice: <Mic className="h-3.5 w-3.5 text-[hsl(17_63%_47%)]" />,
  manual: <PenLine className="h-3.5 w-3.5 text-muted-foreground" />,
}

export default function InboxPage() {
  const { state, acceptCapture, dismissCapture, capture } = useStore()
  const pending = state.captures.filter(c => c.status === 'pending')
  const processed = state.captures.filter(c => c.status !== 'pending').slice(0, 6)
  const [reassign, setReassign] = useState<Record<string, string>>({})
  const [reassignCategory, setReassignCategory] = useState<Record<string, string>>({})
  const [reassignAction, setReassignAction] = useState<Record<string, string>>({})

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="grid grid-cols-1 gap-4 content-start">
        <section className="border border-border bg-card shadow-sm rise-in">
          <div className="px-4 pt-3.5 pb-1 flex items-baseline justify-between">
            <SectionTitle className="mb-0">One inbox, cleared lightly</SectionTitle>
            <span className="text-[11px] text-muted-foreground">{pending.length} to confirm</span>
          </div>
          {pending.length === 0 && <EmptyNote>Inbox zero. Triage is a two-minute glance, not a chore.</EmptyNote>}
          {pending.map(c => {
            const p = c.proposal
            const effectiveAreaId = reassign[c.id] ?? p.areaId
            const area = state.areas.find(a => a.id === effectiveAreaId)
            const project = state.projects.find(pr => pr.id === p.projectId)
            const person = state.people.find(x => x.id === p.personId)
            const tracker = state.trackers.find(t => t.id === p.trackerId)
            const categoryId = reassignCategory[c.id] ?? p.categoryIds?.[0]
            const category = state.categories.find(cat => cat.id === categoryId)
            const actionId = reassignAction[c.id] ?? p.actionIds?.[0]
            const action = state.actions.find(act => act.id === actionId)
            return (
              <div key={c.id} className="border-b border-border/70 last:border-0 px-4 py-3">
                <div className="flex flex-wrap items-start gap-2.5">
                  <span className="mt-0.5">{SOURCE_ICON[c.source]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px]">“{c.text}”</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                      <span className="text-muted-foreground">AI filed as</span>
                      <span className="border border-border rounded-sm bg-background px-1.5 py-px capitalize">{p.kind === 'entry' ? `${tracker?.name} entry` : p.taskType === 'call' ? 'to-call' : p.kind}</span>
                      {area && (
                        <span className="border border-border rounded-sm bg-background px-1.5 py-px inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: area.color }} />
                          {area.name}{project && ` › ${project.name}`}
                        </span>
                      )}
                      {person && <span className="border border-border rounded-sm bg-background px-1.5 py-px">→ {person.name}</span>}
                      {category && (
                        <span className="border border-border rounded-sm bg-background px-1.5 py-px">
                          {category.level > 0 ? `${state.categories.find(x => x.id === category.parentId)?.name ?? '—'} › ` : ''}{category.name}
                        </span>
                      )}
                      {action && (
                        <span className="border border-border rounded-sm bg-background px-1.5 py-px">{action.name}</span>
                      )}
                      <PriorityChip p={p.priority} />
                      {p.due && <span className="text-muted-foreground tabular">due {fmtDate(p.due)}</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground italic">{p.explanation}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto sm:shrink-0 pl-[26px] sm:pl-0">
                    <Select value={reassign[c.id] ?? p.areaId ?? ''} onValueChange={v => setReassign(r => ({ ...r, [c.id]: v }))}>
                      <SelectTrigger className="h-7 w-[100px] sm:w-[110px] text-[11px] bg-background"><SelectValue placeholder="area" /></SelectTrigger>
                      <SelectContent>
                        {state.areas.filter(a => a.active).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={reassignCategory[c.id] ?? p.categoryIds?.[0] ?? ''} onValueChange={v => setReassignCategory(r => ({ ...r, [c.id]: v }))}>
                      <SelectTrigger className="h-7 w-[110px] sm:w-[130px] text-[11px] bg-background"><SelectValue placeholder="category" /></SelectTrigger>
                      <SelectContent>
                        {categoriesForArea(state.categories, effectiveAreaId, categoryId).map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.level > 0 ? '› ' : ''}{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={reassignAction[c.id] ?? p.actionIds?.[0] ?? ''} onValueChange={v => setReassignAction(r => ({ ...r, [c.id]: v }))}>
                      <SelectTrigger className="h-7 w-[100px] sm:w-[116px] text-[11px] bg-background"><SelectValue placeholder="action" /></SelectTrigger>
                      <SelectContent>
                        {state.actions.filter(act => act.active || act.id === actionId).map(act => (
                          <SelectItem key={act.id} value={act.id}>{act.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-7 px-2" onClick={() => {
                      acceptCapture(c.id, {
                        areaId: reassign[c.id] ?? p.areaId,
                        categoryIds: (reassignCategory[c.id] ?? p.categoryIds?.[0]) ? [reassignCategory[c.id] ?? p.categoryIds![0]] : [],
                        actionIds: (reassignAction[c.id] ?? p.actionIds?.[0]) ? [reassignAction[c.id] ?? p.actionIds![0]] : undefined,
                      })
                      toast.success('Filed — corrections teach the router over time')
                    }}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { dismissCapture(c.id); toast('Archived — never deleted') }}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        {processed.length > 0 && (
          <section className="border border-border bg-card/60 shadow-sm">
            <div className="px-4 pt-3 pb-1"><SectionTitle className="mb-0">Recently processed</SectionTitle></div>
            {processed.map(c => (
              <div key={c.id} className="px-4 py-1.5 border-b border-border/50 last:border-0 flex items-center gap-2 text-[12.5px] text-muted-foreground">
                {SOURCE_ICON[c.source]}
                <span className="truncate flex-1">“{c.text}”</span>
                <span className="text-[10.5px] uppercase tracking-wide">{c.status}</span>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* WhatsApp simulator */}
      <WhatsAppPanel onSend={(text, source) => {
        const cap = capture(text, source)
        toast.success(`Captured — proposed: ${cap.proposal.explanation}`)
      }} />
    </div>
  )
}

function WhatsAppPanel({ onSend }: { onSend: (text: string, source: Source) => void }) {
  const [text, setText] = useState('')
  const [sent, setSent] = useState<string[]>([])
  const speech = useSpeech(t => {
    onSend(t, 'voice')
    setSent(s => [...s, `🎙 ${t}`])
  })
  const send = (src: Source) => {
    if (!text.trim()) return
    onSend(text, src)
    setSent(s => [...s, text])
    setText('')
  }
  function micTap() {
    if (speech.listening) { speech.stop(); return }
    if (!speech.supported || !speech.start()) {
      // graceful fallback: simulate a transcribed voice note
      const demo = 'voice note: remind me to book the car MOT this week'
      onSend(demo, 'voice')
      setSent(s => [...s, `🎙 (mic unavailable here — simulated) ${demo}`])
      toast('Mic not available in this window — sent a simulated voice note instead')
    }
  }
  return (
    <section className="border border-border bg-card shadow-sm rise-in h-fit" style={{ animationDelay: '80ms' }}>
      <div className="px-4 py-2.5 bg-[hsl(152_22%_23%)] text-[hsl(45_50%_96%)] flex items-center gap-2">
        <MessageCircle className="h-4 w-4" />
        <div>
          <div className="text-[12.5px] font-semibold leading-tight">WhatsApp capture</div>
          <div className="text-[10px] opacity-70 leading-tight">placeholder — Business API connects in a later phase</div>
        </div>
      </div>
      <div className="p-3 grid grid-cols-1 gap-2 bg-[hsl(42_30%_90%)] min-h-[180px] content-start">
        <div className="justify-self-start max-w-[85%] bg-card border border-border rounded-md rounded-tl-none px-3 py-2 text-[12.5px]">
          Send anything on your mind — no forms, no menus. Try:<br />
          <span className="text-muted-foreground italic">“call David re school urgent”<br />“idea: build a sukkah shed”<br />“add Dune Part Two to my movies list”<br />“t: renew the car insurance this week”</span>
        </div>
        {sent.map((m, i) => (
          <div key={i} className="justify-self-end max-w-[85%] bg-[hsl(100_30%_88%)] border border-[hsl(100_20%_75%)] rounded-md rounded-tr-none px-3 py-2 text-[12.5px]">
            {m}
          </div>
        ))}
        {sent.length > 0 && (
          <div className="justify-self-start max-w-[85%] bg-card border border-border rounded-md rounded-tl-none px-3 py-2 text-[12px] text-muted-foreground">
            Filed ✓ — check the inbox on the left. Reply 1 to change area (in the real bot).
          </div>
        )}
      </div>
      <div className="p-2.5 flex gap-1.5 border-t border-border">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send('whatsapp')}
          placeholder="Type a message…"
          className="flex-1 h-9 rounded-full border border-input bg-background px-3.5 text-[13px] outline-none focus:border-primary"
        />
        <Button size="sm" className="h-9 rounded-full px-3" onClick={() => send('whatsapp')}>Send</Button>
        <Button
          size="sm"
          variant={speech.listening ? 'default' : 'outline'}
          className={`h-9 rounded-full px-3 ${speech.listening ? 'bg-[hsl(8_60%_41%)] hover:bg-[hsl(8_60%_36%)] animate-pulse' : ''}`}
          title="Record a voice note — transcribed and routed like any capture"
          onClick={micTap}
        >
          <Mic className="h-4 w-4" />
        </Button>
      </div>
      <p className="px-3 pb-2.5 text-[10.5px] text-muted-foreground">
        Also feeds this inbox: forwarded email (capture@…), the dashboard quick-add, and SMS. Prefixes t: c: i: ? are optional shorthand.
      </p>
    </section>
  )
}
