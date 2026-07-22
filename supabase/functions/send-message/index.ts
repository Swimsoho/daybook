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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authErr } = await callerClient.auth.getUser()
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })

    const { channel, text } = await req.json() as { channel?: 'telegram' | 'slack'; text?: string }
    if (channel !== 'telegram' && channel !== 'slack') return new Response(JSON.stringify({ error: 'channel must be "telegram" or "slack"' }), { status: 400 })
    if (!text || !text.trim()) return new Response(JSON.stringify({ error: 'text is required' }), { status: 400 })

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: prof } = await admin.from('profiles').select('telegram_chat_id, slack_user_id').eq('id', user.id).maybeSingle()
    if (!prof) return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404 })

    if (channel === 'telegram') {
      const chatId = prof.telegram_chat_id
      if (!chatId) return new Response(JSON.stringify({ error: 'No Telegram chat ID registered — message the bot first, then paste your chat ID into Settings.' }), { status: 400 })
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
      if (!botToken) return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN secret not set — see Settings > Telegram & Slack for setup steps.' }), { status: 500 })
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      })
      const body = await resp.json()
      if (!body.ok) return new Response(JSON.stringify({ error: `Telegram rejected the send: ${body.description ?? 'unknown error'}` }), { status: 502 })
      return new Response(JSON.stringify({ ok: true }))
    }

    // channel === 'slack'
    const slackUserId = prof.slack_user_id
    if (!slackUserId) return new Response(JSON.stringify({ error: 'No Slack member ID registered — see Settings > Telegram & Slack.' }), { status: 400 })
    const botToken = Deno.env.get('SLACK_BOT_TOKEN')
    if (!botToken) return new Response(JSON.stringify({ error: 'SLACK_BOT_TOKEN secret not set — see Settings > Telegram & Slack for setup steps.' }), { status: 500 })

    // Slack sends DMs to a channel ID, not a user ID directly — open (or reuse) the DM first.
    const openResp = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
      body: JSON.stringify({ users: slackUserId }),
    })
    const openBody = await openResp.json()
    if (!openBody.ok) return new Response(JSON.stringify({ error: `Slack rejected opening the DM: ${openBody.error ?? 'unknown error'}` }), { status: 502 })
    const channelId = openBody.channel.id

    const sendResp = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
      body: JSON.stringify({ channel: channelId, text }),
    })
    const sendBody = await sendResp.json()
    if (!sendBody.ok) return new Response(JSON.stringify({ error: `Slack rejected the send: ${sendBody.error ?? 'unknown error'}` }), { status: 502 })
    return new Response(JSON.stringify({ ok: true }))
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
