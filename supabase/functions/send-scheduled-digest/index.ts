// Scheduled digest — the real push behind Settings > "Morning to-do push" and "Lunch reminder
// push". A Postgres pg_cron job (see supabase/migrations/0003_scheduled_digest.sql) calls this
// function every 15 minutes; this function itself decides who's actually due a message right
// now, so one cron schedule serves every account regardless of each person's own Morning/Lunch
// time and timezone (Settings > Morning brief & nudges).
//
// For each account with Telegram and/or Slack connected (Settings > Telegram & Slack) and the
// relevant toggle on, it works out "what time is it for them" from their `timezone` setting, and
// if that's within a few minutes of their configured Morning or Lunch time — and it hasn't
// already sent that one today — composes today's to-do list (or a lighter midday check-in) and
// pushes it. A `lastMorningPushSent` / `lastLunchPushSent` date is stamped back onto their
// settings straight after sending, so a cron tick landing twice in the same window never
// double-sends.
//
// Deployed as a public Edge Function (verify_jwt: false) — pg_cron/pg_net has no Supabase user
// session to send. Guarded instead by a shared secret header (see DEFAULT_SECRET below) so a
// random internet request can't trigger it. This is an anti-spam token, not a real credential
// like your bot tokens — rotate it any time by setting a DIGEST_CRON_SECRET Edge Function secret
// AND updating the header in the pg_cron job (Database > Cron in the dashboard) to match.

import { createClient } from 'npm:@supabase/supabase-js@2'

// Falls back to this if no DIGEST_CRON_SECRET secret is set, so scheduling works out of the box
// with nothing for Craig to configure by hand. Low-stakes on purpose — see note above.
const DEFAULT_SECRET = 'df291fd260702ae2d1b8e18b7eb2036020af1f14adcb5980'

type Task = {
  id: string; title: string; type: string; status: string; due?: string; priority: string
  personId?: string; areaId?: string; completedAt?: string
}
type Person = { id: string; name: string; flaggedForCall?: boolean }
type Settings = {
  timezone?: string; briefTime?: string; lunchTime?: string; dailyCapacity?: number
  lastMorningPushSent?: string; lastLunchPushSent?: string
  features?: { morningBrief?: boolean; lunchReminder?: boolean }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// "What time and date is it right now, for someone in this timezone" — Intl handles DST and
// odd offsets correctly, which manual UTC-offset math doesn't.
function nowInTz(tz: string): { hhmm: string; date: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return { hhmm: `${get('hour')}:${get('minute')}`, date: `${get('year')}-${get('month')}-${get('day')}` }
}

// Is `now` (HH:MM) within `window` minutes of `target` (HH:MM)? Cron ticks every 15 min, so an
// 8-minute window guarantees at least one tick lands inside it without ever reaching the next
// scheduled time (avoiding a false match on the following slot).
function withinWindow(nowHHMM: string, targetHHMM: string, windowMin = 8): boolean {
  const [nh, nm] = nowHHMM.split(':').map(Number)
  const [th, tm] = targetHHMM.split(':').map(Number)
  return Math.abs((nh * 60 + nm) - (th * 60 + tm)) <= windowMin
}

function todayTasks(tasks: Task[], date: string) {
  return tasks.filter(t => t.status !== 'done' && t.status !== 'dropped' && t.due === date)
}
function overdueTasks(tasks: Task[], date: string) {
  return tasks.filter(t => t.status !== 'done' && t.status !== 'dropped' && t.due && t.due < date)
}
const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
function topByPriority(tasks: Task[], n: number) {
  return [...tasks].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)).slice(0, n)
}
function callsDueToday(tasks: Task[], people: Person[], date: string) {
  const out: string[] = []
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'dropped') continue
    if ((t.type === 'call' || t.type === 'followup') && t.due && t.due <= date && t.personId) {
      const p = people.find(x => x.id === t.personId)
      if (p && !out.includes(p.name)) out.push(p.name)
    }
  }
  for (const p of people) if (p.flaggedForCall && !out.includes(p.name)) out.push(p.name)
  return out
}

function composeMorningHtml(name: string, tasks: Task[], people: Person[], date: string, capacity: number) {
  const today = todayTasks(tasks, date)
  const overdue = overdueTasks(tasks, date)
  const top3 = topByPriority(today, 3)
  const calls = callsDueToday(tasks, people, date).slice(0, 3)
  const lines = [`<b>Good morning, ${escapeHtml(name)}.</b> Here's today (${today.length} of ${capacity} capacity${today.length > capacity ? ' — over' : ''}):`]
  if (top3.length) {
    lines.push('', '<b>Top of the list:</b>')
    top3.forEach((t, i) => lines.push(`${i + 1}. ${escapeHtml(t.title)}`))
  } else {
    lines.push('', 'Nothing due today — a rare quiet morning.')
  }
  if (overdue.length) lines.push('', `⚠️ <b>${overdue.length}</b> overdue task${overdue.length === 1 ? '' : 's'} waiting.`)
  if (calls.length) lines.push('', `📞 Calls: ${calls.map(escapeHtml).join(', ')}`)
  return lines.join('\n')
}

function composeLunchHtml(name: string, tasks: Task[], people: Person[], date: string) {
  const today = todayTasks(tasks, date)
  const done = tasks.filter(t => t.status === 'done' && t.completedAt === date).length
  const calls = callsDueToday(tasks, people, date)
  const lines = [`<b>Midday check-in, ${escapeHtml(name)}:</b>`]
  lines.push(`${done} done, ${today.length} still open for today.`)
  if (calls.length) lines.push(`${calls.length} call${calls.length === 1 ? '' : 's'} still on your list: ${calls.slice(0, 3).map(escapeHtml).join(', ')}${calls.length > 3 ? '…' : ''}`)
  else lines.push('No calls left on today’s list.')
  return lines.join('\n')
}

async function sendTelegram(token: string, chatId: string, html: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML' }),
    })
  } catch { /* best-effort */ }
}
async function sendSlack(token: string, slackUserId: string, text: string) {
  try {
    const openResp = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ users: slackUserId }),
    })
    const openBody = await openResp.json()
    if (!openBody.ok) return
    // Slack uses its own mrkdwn, not HTML — strip the tags this function's HTML composer used.
    const mrkdwn = text.replace(/<b>(.*?)<\/b>/g, '*$1*').replace(/<\/?[^>]+>/g, '')
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel: openBody.channel.id, text: mrkdwn }),
    })
  } catch { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const expected = Deno.env.get('DIGEST_CRON_SECRET') || DEFAULT_SECRET
  if (req.headers.get('x-digest-secret') !== expected) return new Response('Unauthorized', { status: 401 })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const slackToken = Deno.env.get('SLACK_BOT_TOKEN')

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name, telegram_chat_id, slack_user_id')
    .or('telegram_chat_id.not.is.null,slack_user_id.not.is.null')

  let sent = 0
  for (const prof of profiles ?? []) {
    try {
      const { data: ws } = await admin.from('workspaces').select('id').eq('owner_id', prof.id).eq('kind', 'real').maybeSingle()
      if (!ws) continue
      const { data: row } = await admin.from('workspace_state').select('data').eq('workspace_id', ws.id).maybeSingle()
      const state = (row?.data ?? {}) as { tasks?: Task[]; people?: Person[]; settings?: Settings }
      const settings = state.settings ?? {}
      // Fall back for fields added in v31 (timezone, lunchTime, features.lunchReminder) that an
      // account's stored settings blob won't have until its client next loads and re-saves (the
      // client-side backfill in cloud.tsx does this automatically) — defaulting here means the
      // push works immediately for existing accounts rather than silently waiting on that.
      const tz = settings.timezone || 'Europe/London'
      const lunchTime = settings.lunchTime || '12:30'
      const lunchEnabled = settings.features?.lunchReminder ?? true
      const { hhmm, date } = nowInTz(tz)
      const tasks = Array.isArray(state.tasks) ? state.tasks : []
      const people = Array.isArray(state.people) ? state.people : []
      const name = prof.name || 'there'

      let patch: Partial<Settings> | null = null
      let html: string | null = null

      if (settings.features?.morningBrief && settings.briefTime && withinWindow(hhmm, settings.briefTime) && settings.lastMorningPushSent !== date) {
        html = composeMorningHtml(name, tasks, people, date, settings.dailyCapacity ?? 6)
        patch = { lastMorningPushSent: date }
      } else if (lunchEnabled && withinWindow(hhmm, lunchTime) && settings.lastLunchPushSent !== date) {
        html = composeLunchHtml(name, tasks, people, date)
        patch = { lastLunchPushSent: date }
      }

      if (!html || !patch) continue

      if (prof.telegram_chat_id && telegramToken) await sendTelegram(telegramToken, prof.telegram_chat_id, html)
      if (prof.slack_user_id && slackToken) await sendSlack(slackToken, prof.slack_user_id, html)

      // Targeted merge — only the dedup-date field changes; everything else in this account's
      // settings/state is written back exactly as read, so nothing the user has entered is
      // ever touched by this scheduled job.
      const nextState = { ...state, settings: { ...settings, ...patch } }
      await admin.from('workspace_state').update({ data: nextState, updated_at: new Date().toISOString() }).eq('workspace_id', ws.id)
      sent++
    } catch {
      // one account's failure shouldn't block the rest of the run
      continue
    }
  }

  return new Response(JSON.stringify({ ok: true, checked: profiles?.length ?? 0, sent }), { headers: { 'Content-Type': 'application/json' } })
})
