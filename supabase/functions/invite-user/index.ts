// Invite a user by email. Super-admin only. Deployed as a Supabase Edge Function.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)
    const { data: prof } = await admin.from('profiles').select('is_super_admin').eq('id', user.id).single()
    if (!prof?.is_super_admin) return json({ error: 'super-admin only' }, 403)

    const { name, email, role } = await req.json()
    if (!email) return json({ error: 'email required' }, 400)
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { name, role } })
    if (error) return json({ error: error.message }, 400)
    await admin.from('profiles').update({ status: 'invited' }).eq('id', data.user!.id)
    return json({ ok: true, id: data.user?.id })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
