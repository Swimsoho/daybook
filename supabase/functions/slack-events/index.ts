// Receives Slack Events API callbacks (direct messages to the Daybook bot) and files them
// as a pending Capture on whichever account has registered the sender's Slack member ID
// (Settings > Telegram & Slack). Deployed public (verify_jwt: false) — Slack authenticates
// its own requests via a signed-request scheme instead of a Supabase JWT.
//
// Setup (Craig does this once, outside of Daybook):
//   1. Create a Slack app at api.slack.com/apps, in your own workspace.
//   2. Under "OAuth & Permissions", add the `chat:write`, `im:history`, `im:read` bot scopes,
//      install the app to the workspace, and copy the "Bot User OAuth Token" (starts xoxb-).
//   3. Add it as the SLACK_BOT_TOKEN secret, and the app's "Signing Secret" (Basic Information)
//      as SLACK_SIGNING_SECRET — Supabase dashboard > Edge Functions > Manage secrets.
//   4. Under "Event Subscriptions", turn it on, set the Request URL to
//      https://<project-ref>.supabase.co/functions/v1/slack-events (Slack will call it once
//      immediately to verify — this function answers that challenge automatically), and
//      subscribe to the `message.im` bot event so DMs to the bot reach this function.
//
// First DM from an unregistered Slack user gets a reply with their member ID, to paste into
// Settings > Telegram & Slack > Slack member ID.
//
// Routing: every message runs through the same keyword-based "simulated AI router" the
// in-app quick-capture box uses (see routeCaptureServer below), so it isn't always filed as
// a plain to-do — e.g. "add Dune Part Two to my movies list" lands as an entry on your Movies
// tracker, "call David re school urgent" becomes a to-call, "idea: build a sukkah shed" a P3
// idea, "note: check the warranty" lands in the Notes tracker (Collections > Notes). Whatever
// it can't confidently classify still lands as a to-do, pending in the Inbox — and from there,
// the Inbox's "File as" picker always lets you redirect it to any tracker/Collection (or back
// to a task) by hand, regardless of what the router guessed.

import { createClient } from 'npm:@supabase/supabase-js@2'

async function validSlackSignature(signingSecret: string, req: Request, rawBody: string): Promise<boolean> {
  const timestamp = req.headers.get('X-Slack-Request-Timestamp')
  const signature = req.headers.get('X-Slack-Signature')
  if (!timestamp || !signature) return false
  // Reject requests older than 5 minutes — standard replay-attack guard Slack's own docs recommend.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false
  const base = `v0:${timestamp}:${rawBody}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base)))
  const computed = 'v0=' + Array.from(sigBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return computed === signature
}

async function postSlackMessage(token: string, channel: string, text: string) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, text }),
  }).catch(() => {}) // best-effort — a failed reply shouldn't fail the whole webhook
}

// ---------- Ported "simulated AI router" (mirrors src/lib/store.tsx routeCapture) ----------
// Kept as a self-contained duplicate here — each Edge Function deploys independently, so this
// can't just import the client copy. If you change the classification rules in the app, mirror
// the change here (and in telegram-inbound/index.ts) so a message routes the same way no matter
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
  trackers: { id: string; name: string; active?: boolean }[]
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function todayStr() { return isoDate(new Date()) }
function addDaysStr(n: number) { return isoDate(new Date(Date.now() + n * 86400000)) }

// Notes and Ideas trackers shipped after some real accounts were already saved to Supabase — a
// stored blob from before either existed has no matching tracker at all, so "note:"/"idea:"
// would silently do nothing here even though the client-side app knows to backfill them on
// next load. This function is called directly by Slack though (server-to-server, no browser
// involved), so it can't wait for that — it backfills the same two trackers itself, in-memory
// here and merged into what gets written back below, so it self-heals the first time either bot
// receives a message rather than requiring the person to open the app first.
function backfillNotesAndIdeas(collections: Record<string, unknown>[], trackers: Record<string, unknown>[]) {
  const haveTracker = (name: string) => trackers.some(t => String(t.name ?? '').toLowerCase() === name)
  const haveCollection = (name: string) => collections.some(c => String(c.name ?? '').toLowerCase() === name)
  const nextCollections = [...collections]
  const nextTrackers = [...trackers]
  if (!haveCollection('notes')) {
    nextCollections.push({ id: 'col_notes', name: 'Notes', description: 'A catch-all for anything jotted down that isn’t a task, call, or specific list', color: 'hsl(35 45% 42%)', active: true })
  }
  if (!haveTracker('notes')) {
    nextTrackers.push({
      id: 'trk_notes', collectionId: 'col_notes', name: 'Notes', description: 'Quick jottings — one-liners, things worth remembering that aren’t a task', defaultView: 'table', active: true,
      columns: [
        { key: 'text', name: 'Note', type: 'longtext', isTitle: true, required: true },
        { key: 'tag', name: 'Tag', type: 'select', options: ['Idea', 'Reminder', 'Quote', 'Other'] },
      ],
    })
  }
  if (!haveCollection('ideas')) {
    nextCollections.push({ id: 'col_ideas', name: 'Ideas', description: 'Things to explore — not a task yet, don’t want to lose it', color: 'hsl(40 65% 42%)', active: true })
  }
  if (!haveTracker('ideas')) {
    nextTrackers.push({
      id: 'trk_ideas', collectionId: 'col_ideas', name: 'Ideas', description: 'A holding pen for things worth exploring later — separate from your to-do list', defaultView: 'board', active: true,
      columns: [
        { key: 'idea', name: 'Idea', type: 'longtext', isTitle: true, required: true },
        { key: 'status', name: 'Status', type: 'status', options: ['New', 'Exploring', 'Parked', 'Acted on'] },
        { key: 'notes', name: 'Notes', type: 'longtext' },
      ],
    })
  }
  if (!haveCollection('dates')) {
    nextCollections.push({ id: 'col_dates', name: 'Dates', description: 'Dates worth remembering — birthdays, anniversaries, renewals and any other date you don’t want to miss', color: 'hsl(340 45% 45%)', active: true })
  }
  if (!haveTracker('dates to remember')) {
    nextTrackers.push({
      id: 'trk_dates', collectionId: 'col_dates', name: 'Dates to Remember', description: 'Birthdays, anniversaries, and other dates worth a nudge — export to your calendar from Collections', defaultView: 'table', active: true,
      columns: [
        { key: 'name', name: 'Name', type: 'text', isTitle: true, required: true },
        { key: 'date', name: 'Date', type: 'date', required: true },
        { key: 'recurring', name: 'Repeats every year', type: 'checkbox' },
        { key: 'type', name: 'Type', type: 'select', options: ['Birthday', 'Anniversary', 'Other'] },
        { key: 'notes', name: 'Notes', type: 'longtext' },
      ],
    })
  }
  return { collections: nextCollections, trackers: nextTrackers }
}

function routeCaptureServer(text: string, state: RouterState) {
  const lower = text.toLowerCase().trim()
  const reasons: string[] = []
  let kind: 'task' | 'call' | 'idea' | 'note' | 'entry' | 'question' = 'task'
  let body = text.trim()
  if (lower.startsWith('t:')) { kind = 'task'; body = body.slice(2).trim(); reasons.push('prefix t: → task') }
  else if (lower.startsWith('c:')) { kind = 'call'; body = body.slice(2).trim(); reasons.push('prefix c: → call log') }
  else if (lower.startsWith('i:') || lower.startsWith('idea:')) { kind = 'idea'; body = body.replace(/^i(dea)?:/i, '').trim(); reasons.push('prefix → idea') }
  else if (lower.startsWith('n:') || lower.startsWith('note:')) { kind = 'note'; body = body.replace(/^n(ote)?:/i, '').trim(); reasons.push('prefix → note') }
  else if (lower.startsWith('?')) { kind = 'question'; body = body.slice(1).trim(); reasons.push('“?” → question for the assistant') }

  // explicit "n:"/"note:" prefix — files straight into the Notes tracker (Collections > Notes)
  // instead of becoming a task, same as the in-app quick-capture box.
  if (kind === 'note') {
    const notesTracker = state.trackers.find(t => t.active !== false && t.name.toLowerCase() === 'notes')
    if (notesTracker) {
      return {
        kind: 'entry' as const, taskType: 'todo', trackerId: notesTracker.id, priority: 'P3' as const,
        title: body || text.trim(),
        explanation: `“n:”/“note:” → ${notesTracker.name} tracker`,
      }
    }
  }

  // explicit "i:"/"idea:" prefix — files straight into the Ideas tracker (Collections > Ideas)
  // instead of a P3 task under the old "New Ideas" area, same as the in-app quick-capture box.
  if (kind === 'idea') {
    const ideasTracker = state.trackers.find(t => t.active !== false && t.name.toLowerCase() === 'ideas')
    if (ideasTracker) {
      return {
        kind: 'entry' as const, taskType: 'todo', trackerId: ideasTracker.id, priority: 'P3' as const,
        title: body || text.trim(),
        explanation: `“i:”/“idea:” → ${ideasTracker.name} tracker`,
      }
    }
  }

  const person = state.people.find(p => {
    const first = p.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
    return first.length > 2 && lower.includes(first)
  })
  if (person) reasons.push(`“${person.name.split(' ')[0]}” matched contact ${person.name}`)

  const isCall = kind === 'call' || /\b(call|phone|ring)\b/.test(lower)
  if (isCall && kind === 'task') { kind = 'call'; reasons.push('“call” → to-call task') }

  // tracker match ("add X to my movies list") — this is what lets a Telegram/Slack message
  // land in a Collections tracker (e.g. Movies) instead of always becoming a task. Word-based
  // (any 4+ letter word from the tracker's own name) rather than "first 5 characters", so
  // multi-word tracker names (e.g. "TV Shows") match on either word.
  const tracker = state.trackers.find(t => {
    if (t.active === false) return false
    const words = t.name.toLowerCase().split(/\s+/).filter(w => w.length >= 4)
    return words.length ? words.some(w => new RegExp(`\\b${w}\\b`).test(lower)) : lower.includes(t.name.toLowerCase())
  })
  if (tracker && /\b(add|to my|list|watch|read|track)\b/.test(lower)) {
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
    const signingSecret = Deno.env.get('SLACK_SIGNING_SECRET')
    const botToken = Deno.env.get('SLACK_BOT_TOKEN')
    if (!signingSecret || !botToken) return new Response('Server not configured', { status: 500 })

    const rawBody = await req.text()
    if (!(await validSlackSignature(signingSecret, req, rawBody))) return new Response('Invalid signature', { status: 403 })

    const payload = JSON.parse(rawBody)

    // One-time handshake Slack performs when you first save the Request URL.
    if (payload.type === 'url_verification') {
      return new Response(payload.challenge, { headers: { 'Content-Type': 'text/plain' } })
    }

    const event = payload.event
    // Ignore anything that isn't a plain human DM: bot's own messages (would otherwise loop),
    // message edits/deletes, channel posts (only im.message — DMs — are subscribed anyway,
    // but double-check defensively since Slack event shapes vary by subtype).
    if (event?.type !== 'message' || event.bot_id || event.subtype) return new Response('ok')

    const slackUserId: string | undefined = event.user
    const text: string = (event.text ?? '').trim()
    const channel: string = event.channel
    if (!slackUserId || !text) return new Response('ok')

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: prof } = await admin.from('profiles').select('id, name').eq('slack_user_id', slackUserId).maybeSingle()
    if (!prof) {
      await postSlackMessage(botToken, channel, `This Slack account isn't registered with any Daybook account yet. Your member ID is ${slackUserId} — paste it into Settings > Telegram & Slack > Slack member ID, then message me again.`)
      return new Response('ok')
    }

    const { data: ws } = await admin.from('workspaces').select('id').eq('owner_id', prof.id).eq('kind', 'real').maybeSingle()
    if (!ws) { await postSlackMessage(botToken, channel, 'No account found to file this into.'); return new Response('ok') }

    const { data: row } = await admin.from('workspace_state').select('data').eq('workspace_id', ws.id).maybeSingle()
    const state = (row?.data ?? {}) as Record<string, unknown>
    const captures = Array.isArray(state.captures) ? state.captures as unknown[] : []
    const { collections: backfilledCollections, trackers: backfilledTrackers } = backfillNotesAndIdeas(
      Array.isArray(state.collections) ? state.collections as Record<string, unknown>[] : [],
      Array.isArray(state.trackers) ? state.trackers as Record<string, unknown>[] : [],
    )

    const routerState: RouterState = {
      areas: Array.isArray(state.areas) ? state.areas as RouterState['areas'] : [],
      projects: Array.isArray(state.projects) ? state.projects as RouterState['projects'] : [],
      people: Array.isArray(state.people) ? state.people as RouterState['people'] : [],
      categories: Array.isArray(state.categories) ? state.categories as RouterState['categories'] : [],
      actions: Array.isArray(state.actions) ? state.actions as RouterState['actions'] : [],
      trackers: backfilledTrackers as RouterState['trackers'],
    }
    const proposal = routeCaptureServer(text, routerState)
    const capture = {
      id: `cap_${crypto.randomUUID()}`,
      text,
      source: 'slack',
      created: new Date().toISOString().slice(0, 10),
      status: 'pending',
      proposal: { ...proposal, explanation: `${proposal.explanation} — via Slack` },
    }

    const nextState = { ...state, collections: backfilledCollections, trackers: backfilledTrackers, captures: [capture, ...captures] }
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
    await postSlackMessage(botToken, channel, reply)
    return new Response('ok')
  } catch (e) {
    return new Response(`Error: ${String(e)}`, { status: 500 })
  }
})
