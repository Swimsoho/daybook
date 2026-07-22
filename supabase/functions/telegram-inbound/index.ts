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

import { createClient } from 'npm:@supabase/supabase-js@2'

async function sendTelegram(token: string, chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {}) // best-effort — a failed reply shouldn't fail the whole webhook
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

    const title = text.charAt(0).toUpperCase() + text.slice(1)
    const capture = {
      id: `cap_${crypto.randomUUID()}`,
      text,
      source: 'telegram',
      created: new Date().toISOString().slice(0, 10),
      status: 'pending',
      proposal: {
        kind: 'task',
        taskType: 'todo',
        priority: 'P2',
        title,
        explanation: 'Received via Telegram — confirm area & category in the Inbox',
      },
    }

    const nextState = { ...state, captures: [capture, ...captures] }
    const { error: updateErr } = await admin
      .from('workspace_state')
      .update({ data: nextState, updated_at: new Date().toISOString() })
      .eq('workspace_id', ws.id)

    await sendTelegram(botToken, chatId, updateErr ? 'Filing failed on our end — try again shortly.' : 'Filed — check your Daybook inbox to confirm the area & category.')
    return new Response('ok')
  } catch (e) {
    return new Response(`Error: ${String(e)}`, { status: 500 })
  }
})
