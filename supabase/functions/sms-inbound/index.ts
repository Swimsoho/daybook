// Receives inbound Twilio SMS / WhatsApp webhooks and files them as a pending Capture
// on whichever account has registered the sender's phone number (Settings > Text-in
// capture number). Deployed as a public Supabase Edge Function (verify_jwt: false) —
// Twilio can't send a Supabase JWT, so this authenticates the request itself using
// Twilio's request-signature scheme instead.
//
// Configure in the Twilio console, on each number/sender you want to feed Daybook:
//   Messaging (or WhatsApp Sender) > "A message comes in" webhook (HTTP POST) ->
//   https://<project-ref>.supabase.co/functions/v1/sms-inbound
//
// Required secret (set via the Supabase dashboard, Edge Functions > Manage secrets —
// never commit or paste this into chat/code): TWILIO_AUTH_TOKEN

import { createClient } from 'npm:@supabase/supabase-js@2'

// Must exactly match the URL configured in the Twilio console (Twilio signs over the
// exact webhook URL it was told to call) — not derived from the incoming request, since
// edge-runtime-internal request URLs can differ from the public-facing one.
const FUNCTION_URL = 'https://hduzhemuhyqthfnxchwi.supabase.co/functions/v1/sms-inbound'

function twiml(message: string) {
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } },
  )
}

async function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null): Promise<boolean> {
  if (!signature) return false
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const key of sortedKeys) data += key + params[key]
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sigBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  const computed = btoa(String.fromCharCode(...sigBytes))
  return computed === signature
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    if (!authToken) return new Response('Server not configured (missing TWILIO_AUTH_TOKEN)', { status: 500 })

    const formData = await req.formData()
    const params: Record<string, string> = {}
    for (const [key, value] of formData.entries()) params[key] = String(value)

    const signature = req.headers.get('X-Twilio-Signature')
    const ok = await validTwilioSignature(authToken, FUNCTION_URL, params, signature)
    if (!ok) return new Response('Invalid signature', { status: 403 })

    const rawFrom = params['From'] ?? ''
    const isWhatsapp = rawFrom.startsWith('whatsapp:')
    const from = rawFrom.replace(/^whatsapp:/, '').trim()
    const body = (params['Body'] ?? '').trim()
    if (!from || !body) return twiml('Nothing to file — the message looked empty.')

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: prof } = await admin.from('profiles').select('id, name').eq('phone', from).maybeSingle()
    if (!prof) {
      return twiml("This number isn't registered with any Daybook account yet — add it under Settings > Text-in capture number.")
    }

    const { data: ws } = await admin.from('workspaces').select('id').eq('owner_id', prof.id).eq('kind', 'real').maybeSingle()
    if (!ws) return twiml('No account found to file this into — contact support.')

    const { data: row } = await admin.from('workspace_state').select('data').eq('workspace_id', ws.id).maybeSingle()
    const state = (row?.data ?? {}) as Record<string, unknown>
    const captures = Array.isArray(state.captures) ? state.captures as unknown[] : []

    const source = isWhatsapp ? 'whatsapp' : 'sms'
    const title = body.charAt(0).toUpperCase() + body.slice(1)
    const capture = {
      id: `cap_${crypto.randomUUID()}`,
      text: body,
      source,
      created: new Date().toISOString().slice(0, 10),
      status: 'pending',
      proposal: {
        kind: 'task',
        taskType: 'todo',
        priority: 'P2',
        title,
        explanation: `Received via ${isWhatsapp ? 'WhatsApp' : 'text'} — confirm area & category in the Inbox`,
      },
    }

    const nextState = { ...state, captures: [capture, ...captures] }
    const { error: updateErr } = await admin
      .from('workspace_state')
      .update({ data: nextState, updated_at: new Date().toISOString() })
      .eq('workspace_id', ws.id)
    if (updateErr) return twiml('Filing failed on our end — try again shortly.')

    return twiml('Filed — check your Daybook inbox to confirm the area & category.')
  } catch (e) {
    return new Response(`Error: ${String(e)}`, { status: 500 })
  }
})
