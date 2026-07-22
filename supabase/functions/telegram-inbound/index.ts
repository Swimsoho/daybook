// Receives inbound Telegram Bot updates and files them as a pending Capture on whichever
// account has registered the sender's chat ID (Settings > Telegram & Slack). Deployed as a
// public Supabase Edge Function (verify_jwt: false) — Telegram can't send a Supabase JWT.
//
// Setup (Craig does this once, outside of Daybook):
//   1. Message @BotFather on Telegram, /newbot, get a bot token.
//   2. Add it as the TELEGRAM_BOT_TOKEN secret: Supabase dashboard > Edge Functions > Manage secrets.
//   3. Also set a TELEGRAM_WEBHOOK_SECRET (any random string you make up) as a secret — this
//      guards the webhook, since Telegram doesn't sign requests the way Twilio does.
//   4. Point Telegram at this function by calling, once:
//      https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<project-ref>.supabase.co/functions/v1/telegram-inbound&secret_token=<TELEGRAM_WEBHOOK_SECRET>
//
// First message from an unregistered chat gets a reply with its chat ID, to paste into
// Settings > Telegram & Slack > Telegram chat ID.
//
// Routing: every message runs through the same keyword-based "simulated AI router" the
// in-app quick-capture box uses (see routeCaptureServer below), so it isn't always filed as
// a plain to-do — e.g. "add Dune Part Two to my movies list" lands as an entry on your Movies
// tracker, "call David re school urgent" becomes a to-call, "idea: build a sukkah shed" a P3
// idea. Whatever it can't confidently classify still lands as a to-do, pending in the Inbox.

import { createClient } from 'npm:@supabase/supabase-js@2'

async function sendTelegram(token: string, chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {}) // best-effort — a failed reply shouldn't fail the whole webhook
}

// ---------- Ported "simulated AI router" (mirrors src/lib/store.tsx routeCapture) ----------
// Kept as a self-contained duplicate here — each Edge Function deploys independently, so this
// can't just import the client copy. If you change the classification rules in the app, mirror
// the change here (and in slack-events/index.ts) so a message routes the same way no matter
// which channel it came in on. Same caveat as the in-app version: it's a keyword matcher, not a
// real AI — area/tracker matching works for any of your own areas/trackers by name, but the
// category/action keyword rules below are tuned to the default seed data's category/action IDs
// and won't recognize categories or actions you've renamed or added from scratch.
type RouterState = {
  areas: { id: string; name: string }[]
  projects: { id: string; name: string; areaId: string; status: string }[]
  people: { id: string; name: string }[]
  categories: { id: string; name: string; active?: boolean }[]
  actions: { id: string; name: string; active?: boolean }[]
  trackers: { id: string; name: string }[]
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function todayStr() { return isoDate(new Date()) }
function addDaysStr(n: number) { return isoDate(new Date(Date.now() + n * 86400000)) }

function routeCaptureServer(text: string, state: RouterState) {
  const lower = text.toLowerCase().trim()
  const reasons: string[] = []
  let kind: 'task' | 'call' | 'idea' | 'note' | 'entry' | 'question' = 'task'
  let body = text.trim()
  if (lower.startsWith('t:')) { kind = 'task'; body = body.slice(2).trim(); reasons.push('prefix t: → task') }
  else if (lower.startsWith('c:')) { kind = 'call'; body = body.slice(2).trim(); reasons.push('prefix c: → call log') }
  else if (lower.startsWith('i:') || lower.startsWith('idea:')) { kind = 'idea'; body = body.replace(/^i(dea)?:/i, '').trim(); reasons.push('prefix → idea') }
  else if (lower.startsWith('?')) { kind = 'question'; body = body.slice(1).trim(); reasons.push('“?” → question for the assistant') }

  const person = state.people.find(p => {
    const first = p.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
    return first.length > 2 && lower.includes(first)
  })
  if (person) reasons.push(`“${person.name.split(' ')[0]}” matched contact ${person.name}`)

  const isCall = kind === 'call' || /\b(call|phone|ring)\b/.test(lower)
  if (isCall && kind === 'task') { kind = 'call'; reasons.push('“call” → to-call task') }

  // tracker match ("add X to my movies list") — this is what lets a Telegram/Slack message
  // land in a Collections tracker (e.g. Movies) instead of always becoming a task.
  const tracker = state.trackers.find(t => lower.includes(t.name.toLowerCase().slice(0, 5)))
  if (tracker && /\b(add|to my|list|watch|read)\b/.test(lower)) {
    const m = text.match(/add (.+?) to/i)
    return {
      kind: 'entry' as const, taskType: 'todo', trackerId: tracker.id, priority: 'P3' as const,
      title: m ? m[1] : body,
      explanation: `“${tracker.name.toLowerCase()}” → ${tracker.name} tracker`,
    }
  }

  let areaId: string | undefined
  let projectId: string | undefined
  const areaKeywords: Record<string, string[]> = {
    a_shul: ['shul', 'dinner', 'shiur', 'daven', 'chesed', 'rabbi', 'minyan'],
    a_family: ['school', 'kids', 'home', 'house', 'boiler', 'family', 'mum', 'shop', 'car', 'insurance', 'bill'],
    a_work: ['client', 'invoice', 'work', 'acme', 'proposal', 'meeting', 'vat'],
    a_ideas: ['idea'],
  }
  for (const [aid, kws] of Object.entries(areaKeywords)) {
    const hit = kws.find(k => lower.includes(k))
    if (hit) { areaId = aid; reasons.push(`“${hit}” → ${state.areas.find(a => a.id === aid)?.name}`); break }
  }
  if (kind === 'idea') areaId = 'a_ideas'
  if (!areaId && person) areaId = 'a_work'

  const project = state.projects.find(p => p.status === 'active' && p.name.toLowerCase().split(' ').some(w => w.length > 4 && lower.includes(w.toLowerCase())))
  if (project) { projectId = project.id; areaId = project.areaId; reasons.push(`matched project “${project.name}”`) }

  let categoryIds: string[] | undefined
  const categoryKeywords: { id: string; kws: string[] }[] = [
    { id: 'c_money_ins', kws: ['insurance', 'policy'] },
    { id: 'c_money_bills', kws: ['bill', 'late fee', 'invoice'] },
    { id: 'c_chesed_hosp', kws: ['hospital'] },
    { id: 'c_admin', kws: ['admin', 'paperwork', 'proposal', 'vat', 'form'] },
    { id: 'c_home', kws: ['boiler', 'garden', 'plumber', 'repair', 'maintenance', 'house'] },
    { id: 'c_events', kws: ['dinner', 'party', 'event', 'invitation', 'rsvp', 'seating'] },
    { id: 'c_chesed', kws: ['chesed', 'visit'] },
    { id: 'c_money', kws: ['money', 'payment', 'expense', 'pay '] },
  ]
  for (const { id, kws } of categoryKeywords) {
    const cat = state.categories.find(c => c.id === id && c.active)
    if (!cat) continue
    const hit = kws.find(k => lower.includes(k))
    if (hit) { categoryIds = [cat.id]; reasons.push(`“${hit}” → ${cat.name} category`); break }
  }

  let actionIds: string[] | undefined
  const actionKeywords: { id: string; kws: string[] }[] = [
    { id: 'a_call', kws: ['call', 'phone', 'ring'] },
    { id: 'a_errand', kws: ['errand', 'pick up', 'pickup', 'buy', 'shop', 'shopping', 'drop off'] },
    { id: 'a_followup', kws: ['follow up', 'follow-up', 'circle back', 'chase'] },
    { id: 'a_email', kws: ['email', 'reply to', 'send the'] },
    { id: 'a_meeting', kws: ['meeting', 'meet up', 'sit down'] },
  ]
  for (const { id, kws } of actionKeywords) {
    const act = state.actions.find(a => a.id === id && a.active)
    if (!act) continue
    const hit = kws.find(k => lower.includes(k))
    if (hit) { actionIds = [act.id]; reasons.push(`“${hit}” → ${act.name} action`); break }
  }

  let due: string | undefined
  let priority: 'P0' | 'P1' | 'P2' | 'P3' = 'P2'
  if (/\b(today|urgent|now|asap)\b/.test(lower)) { due = todayStr(); priority = 'P0'; reasons.push('“today/urgent” → P0, due today') }
  else if (/\btomorrow\b/.test(lower)) { due = addDaysStr(1); priority = 'P1'; reasons.push('“tomorrow” → due tomorrow') }
  else if (/\bthis week\b/.test(lower)) { due = addDaysStr(4); priority = 'P1'; reasons.push('“this week” → P1') }
  if (kind === 'idea') priority = 'P3'

  const title = body.charAt(0).toUpperCase() + body.slice(1)
  return {
    kind, taskType: (isCall ? 'call' : 'todo') as string, trackerId: undefined as string | undefined,
    areaId, projectId, personId: person?.id, categoryIds, actionIds, priority, due, title,
    explanation: reasons.length ? reasons.join(' · ') : 'No strong match — left in the inbox for a quick confirm',
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!webhookSecret || !botToken) return new Response('Server not configured', { status: 500 })

    if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret) {
      return new Response('Invalid secret token', { status: 403 })
    }

    const update = await req.json()
    const msg = update?.message
    const chatId: number | undefined = msg?.chat?.id
    const text: string = (msg?.text ?? '').trim()
    if (!chatId) return new Response('ok') // non-message update (edited_message, etc.) — nothing to do

    if (!text) {
      await sendTelegram(botToken, chatId, `Nothing to file — that message had no text. Your chat ID is ${chatId}.`)
      return new Response('ok')
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: prof } = await admin.from('profiles').select('id, name').eq('telegram_chat_id', String(chatId)).maybeSingle()
    if (!prof) {
      await sendTelegram(botToken, chatId, `This chat isn't registered with any Daybook account yet. Your chat ID is ${chatId} — paste it into Settings > Telegram & Slack > Telegram chat ID, then message me again.`)
      return new Response('ok')
    }

    const { data: ws } = await admin.from('workspaces').select('id').eq('owner_id', prof.id).eq('kind', 'real').maybeSingle()
    if (!ws) { await sendTelegram(botToken, chatId, 'No account found to file this into.'); return new Response('ok') }

    const { data: row } = await admin.from('workspace_state').select('data').eq('workspace_id', ws.id).maybeSingle()
    const state = (row?.data ?? {}) as Record<string, unknown>
    const captures = Array.isArray(state.captures) ? state.captures as unknown[] : []

    const routerState: RouterState = {
      areas: Array.isArray(state.areas) ? state.areas as RouterState['areas'] : [],
      projects: Array.isArray(state.projects) ? state.projects as RouterState['projects'] : [],
      people: Array.isArray(state.people) ? state.people as RouterState['people'] : [],
      categories: Array.isArray(state.categories) ? state.categories as RouterState['categories'] : [],
      actions: Array.isArray(state.actions) ? state.actions as RouterState['actions'] : [],
      trackers: Array.isArray(state.trackers) ? state.trackers as RouterState['trackers'] : [],
    }
    const proposal = routeCaptureServer(text, routerState)
    const capture = {
      id: `cap_${crypto.randomUUID()}`,
      text,
      source: 'telegram',
      created: new Date().toISOString().slice(0, 10),
      status: 'pending',
      proposal: { ...proposal, explanation: `${proposal.explanation} — via Telegram` },
    }

    const nextState = { ...state, captures: [capture, ...captures] }
    const { error: updateErr } = await admin
      .from('workspace_state')
      .update({ data: nextState, updated_at: new Date().toISOString() })
      .eq('workspace_id', ws.id)

    let reply = 'Filed — check your Daybook inbox to confirm the area & category.'
    if (updateErr) reply = 'Filing failed on our end — try again shortly.'
    else if (proposal.kind === 'entry') {
      const tracker = routerState.trackers.find(t => t.id === proposal.trackerId)
      reply = `Filed under ${tracker?.name ?? 'your'} tracker — check your Daybook inbox to confirm.`
    }
    await sendTelegram(botToken, chatId, reply)
    return new Response('ok')
  } catch (e) {
    return new Response(`Error: ${String(e)}`, { status: 500 })
  }
})
