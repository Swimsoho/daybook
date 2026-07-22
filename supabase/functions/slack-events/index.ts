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

    const title = text.charAt(0).toUpperCase() + text.slice(1)
    const capture = {
      id: `cap_${crypto.randomUUID()}`,
      text,
      source: 'slack',
      created: new Date().toISOString().slice(0, 10),
      status: 'pending',
      proposal: {
        kind: 'task',
        taskType: 'todo',
        priority: 'P2',
        title,
        explanation: 'Received via Slack — confirm area & category in the Inbox',
      },
    }

    const nextState = { ...state, captures: [capture, ...captures] }
    const { error: updateErr } = await admin
      .from('workspace_state')
      .update({ data: nextState, updated_at: new Date().toISOString() })
      .eq('workspace_id', ws.id)

    await postSlackMessage(botToken, channel, updateErr ? 'Filing failed on our end — try again shortly.' : 'Filed — check your Daybook inbox to confirm the area & category.')
    return new Response('ok')
  } catch (e) {
    return new Response(`Error: ${String(e)}`, { status: 500 })
  }
})
