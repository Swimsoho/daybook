// Public task-delegation links: "share a task with someone to do, and get it back from them" —
// no Daybook account needed on the recipient's end.
//
// Three actions, all through this one function:
//   - action: 'create'   — called from inside Daybook by a signed-in user (their own session's
//     JWT, validated by hand below since this function's own JWT check is off at the project
//     level — see why below). Snapshots the task's title/notes/due into a new task_shares row
//     with a fresh random token and returns it; the caller builds the shareable URL from it.
//   - action: 'view'     — called anonymously by the recipient's browser (no login at all) when
//     they open the link. Returns just that one row's snapshot + status — nothing else from the
//     workspace is ever exposed.
//   - action: 'complete' — called anonymously when the recipient clicks "Mark as done". Flips
//     task_shares.status to 'done', then best-effort writes the real task's status/completedAt
//     back into the owner's workspace_state (the only place this function needs the
//     service-role key's elevated access) plus an audit event, so it shows up in the owner's
//     own Audit Trail exactly like any other completion — just attributed to "the person it was
//     shared with" instead of Craig.
//
// verify_jwt is off for the whole function (same as telegram-inbound/slack-events) because two
// of the three actions have no Daybook session at all; 'create' does its own auth check inline
// instead, the same pattern send-message uses for its browser-invoked call.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
function randomToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const body = await req.json() as Record<string, unknown>
    const action = body.action

    if (action === 'create') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
      const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
      const { data: { user }, error: authErr } = await callerClient.auth.getUser()
      if (authErr || !user) return json({ error: 'Not authenticated' }, 401)

      const { workspaceId, taskId, title, notes, due } = body as { workspaceId?: string; taskId?: string; title?: string; notes?: string; due?: string }
      if (!workspaceId || !taskId || !title) return json({ error: 'workspaceId, taskId, and title are required' }, 400)

      // Confirm the caller actually owns this workspace before creating a link into it — a
      // valid JWT alone isn't enough, it has to be *this* workspace's owner.
      const { data: ws } = await admin.from('workspaces').select('id, owner_id').eq('id', workspaceId).maybeSingle()
      if (!ws || ws.owner_id !== user.id) return json({ error: 'Not your workspace' }, 403)

      const token = randomToken()
      const { error: insErr } = await admin.from('task_shares').insert({
        token, workspace_id: workspaceId, task_id: taskId, title, notes: notes ?? null, due: due ?? null,
      })
      if (insErr) return json({ error: insErr.message }, 500)
      return json({ token })
    }

    if (action === 'view') {
      const { token } = body as { token?: string }
      if (!token) return json({ error: 'token is required' }, 400)
      const { data: share } = await admin.from('task_shares')
        .select('title, notes, due, status, created_at, responded_at').eq('token', token).maybeSingle()
      if (!share) return json({ error: 'not_found' }, 404)
      return json({ share })
    }

    if (action === 'complete') {
      const { token, note } = body as { token?: string; note?: string }
      if (!token) return json({ error: 'token is required' }, 400)
      const { data: share } = await admin.from('task_shares').select('*').eq('token', token).maybeSingle()
      if (!share) return json({ error: 'not_found' }, 404)
      if (share.status === 'done') {
        return json({ share: { title: share.title, notes: share.notes, due: share.due, status: share.status, created_at: share.created_at, responded_at: share.responded_at } })
      }

      const nowIso = new Date().toISOString()
      const { error: updErr } = await admin.from('task_shares').update({ status: 'done', responded_at: nowIso }).eq('token', token)
      if (updErr) return json({ error: updErr.message }, 500)

      // Reflect it back onto the real task in the owner's workspace, best-effort — a recipient
      // confirming completion shouldn't fail just because this half hiccups; the task_shares
      // row above is already the source of truth for what the public page shows either way.
      try {
        const { data: wsState } = await admin.from('workspace_state').select('data').eq('workspace_id', share.workspace_id).maybeSingle()
        if (wsState?.data) {
          const state = wsState.data as Record<string, unknown>
          const tasks = Array.isArray(state.tasks) ? (state.tasks as Record<string, unknown>[]) : []
          const idx = tasks.findIndex(t => t.id === share.task_id)
          if (idx !== -1 && tasks[idx].status !== 'done') {
            const today = nowIso.slice(0, 10)
            const prevShared = (tasks[idx].shared as Record<string, unknown> | undefined) ?? {}
            tasks[idx] = {
              ...tasks[idx],
              status: 'done',
              completedAt: today,
              shared: { ...prevShared, status: 'done', respondedAt: nowIso },
            }
            const audit = Array.isArray(state.audit) ? (state.audit as Record<string, unknown>[]) : []
            audit.unshift({
              id: `au_${crypto.randomUUID().slice(0, 8)}`,
              ts: nowIso.slice(0, 16),
              user: 'Shared link',
              action: 'completed',
              entity: 'task',
              entityId: share.task_id,
              detail: note ? `Marked done by the person it was shared with — "${note}"` : 'Marked done by the person it was shared with',
            })
            await admin.from('workspace_state').update({ data: { ...state, tasks, audit }, updated_at: nowIso }).eq('workspace_id', share.workspace_id)
          }
        }
      } catch (_e) {
        // swallow — task_shares is already updated, which is all the public page depends on
      }

      return json({ share: { title: share.title, notes: share.notes, due: share.due, status: 'done', created_at: share.created_at, responded_at: nowIso } })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
