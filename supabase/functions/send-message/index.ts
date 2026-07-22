// Outbound half of the Telegram/Slack integration: sends `text` to whichever channel the
// caller registered (Settings > Telegram & Slack). Called two ways:
//   1. Directly from Settings' "Send test message" buttons, with the signed-in user's own
//      session — verify_jwt: true means Supabase already checked the JWT is valid before this
//      code runs; it still resolves *which* profile made the call from that JWT below, so one
//      account can never trigger a send registered to a different account.
//   2. (Not wired up yet — see the manual's honest-scope note) a scheduled job, e.g. a Supabase
//      Cron entry calling this once per profile per day with the composed morning-brief text,
//      to make "Morning brief" a real push instead of only the in-app card it is today.
//
// Bot tokens (TELEGRAM_BOT_TOKEN, SLACK_BOT_TOKEN) live only as Edge Function secrets — never
// sent to or stored in the browser.

import { createClient } from 'npm:@supabase/supabase-js@2'

// This function is called directly from the browser (Settings > Telegram & Slack > "Send test
// message"), unlike telegram-inbound/slack-events which are only ever called server-to-server
// by Telegram/Slack. A browser call with an Authorization header triggers a CORS preflight
// (an OPTIONS request) before the real POST — omitting these headers means the preflight gets
// a 405 and the browser never sends the POST at all, surfacing to supabase-js as the generic
// "Failed to send a request to the Edge Function" (a fetch-level failure, not an error *from*
// the function — the function never even ran). Every response below carries these headers.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authErr } = await callerClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Not authenticated' }, 401)

    const { channel, text } = await req.json() as { channel?: 'telegram' | 'slack'; text?: string }
    if (channel !== 'telegram' && channel !== 'slack') return json({ error: 'channel must be "telegram" or "slack"' }, 400)
    if (!text || !text.trim()) return json({ error: 'text is required' }, 400)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: prof } = await admin.from('profiles').select('telegram_chat_id, slack_user_id').eq('id', user.id).maybeSingle()
    if (!prof) return json({ error: 'Profile not found' }, 404)

    if (channel === 'telegram') {
      const chatId = prof.telegram_chat_id
      if (!chatId) return json({ error: 'No Telegram chat ID registered — message the bot first, then paste your chat ID into Settings.' }, 400)
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
      if (!botToken) return json({ error: 'TELEGRAM_BOT_TOKEN secret not set — see Settings > Telegram & Slack for setup steps.' }, 500)
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      })
      const body = await resp.json()
      if (!body.ok) return json({ error: `Telegram rejected the send: ${body.description ?? 'unknown error'}` }, 502)
      return json({ ok: true })
    }

    // channel === 'slack'
    const slackUserId = prof.slack_user_id
    if (!slackUserId) return json({ error: 'No Slack member ID registered — see Settings > Telegram & Slack.' }, 400)
    const botToken = Deno.env.get('SLACK_BOT_TOKEN')
    if (!botToken) return json({ error: 'SLACK_BOT_TOKEN secret not set — see Settings > Telegram & Slack for setup steps.' }, 500)

    // Slack sends DMs to a channel ID, not a user ID directly — open (or reuse) the DM first.
    const openResp = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
      body: JSON.stringify({ users: slackUserId }),
    })
    const openBody = await openResp.json()
    if (!openBody.ok) return json({ error: `Slack rejected opening the DM: ${openBody.error ?? 'unknown error'}` }, 502)
    const channelId = openBody.channel.id

    const sendResp = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
      body: JSON.stringify({ channel: channelId, text }),
    })
    const sendBody = await sendResp.json()
    if (!sendBody.ok) return json({ error: `Slack rejected the send: ${sendBody.error ?? 'unknown error'}` }, 502)
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
