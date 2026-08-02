// Delete a user, or resend/correct their invite. Super-admin only. Deployed as a Supabase Edge Function.
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
    const { data: { user: caller } } = await asUser.auth.getUser()
    if (!caller) return json({ error: 'unauthorized' }, 401)
    const { data: callerProf } = await admin.from('profiles').select('is_super_admin').eq('id', caller.id).single()
    if (!callerProf?.is_super_admin) return json({ error: 'super-admin only' }, 403)

    const body = await req.json()
    const { action, userId } = body
    if (!userId) return json({ error: 'userId required' }, 400)

    const { data: targetProf } = await admin.from('profiles').select('is_super_admin, name, email').eq('id', userId).maybeSingle()
    if (targetProf?.is_super_admin) return json({ error: 'cannot remove a super-admin account' }, 400)
    if (userId === caller.id) return json({ error: 'cannot remove your own account' }, 400)

    if (action === 'delete') {
      // profiles → workspaces → workspace_state all cascade off auth.users via foreign keys,
      // so deleting the auth user removes everything belonging to them in one step.
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'resend') {
      const { name, email, role } = body
      if (!email) return json({ error: 'email required' }, 400)

      // Only safe to blow away and re-provision an account that has never actually been used.
      const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(userId)
      if (getErr || !authUser?.user) return json({ error: getErr?.message ?? 'user not found' }, 404)
      if (authUser.user.last_sign_in_at) {
        return json({ error: 'This person has already signed in — resending would wipe their existing data. Use Delete if you really want to remove their account, or have them use "Forgot password" instead.' }, 409)
      }

      const { error: delErr } = await admin.auth.admin.deleteUser(userId)
      if (delErr) return json({ error: delErr.message }, 400)

      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { data: { name, role } })
      if (invErr) return json({ error: invErr.message }, 400)
      await admin.from('profiles').update({ status: 'invited' }).eq('id', invited.user!.id)
      return json({ ok: true, id: invited.user?.id })
    }

    return json({ error: `unknown action "${action}"` }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
