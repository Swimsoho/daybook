// Public project share links: "invite someone to a project who doesn't have Daybook" (Phase 1 —
// a read-only, no-login view of a single project). Same shape as shared-task.
//
//   - action: 'create' — a signed-in workspace owner mints a token for one of their projects.
//   - action: 'view'   — anyone with the link (no login) fetches a snapshot of JUST that project:
//     its details, phases, tasks (with assignee names resolved), team and documents (short-lived
//     signed URLs). Nothing else from the workspace is ever exposed.
//   - action: 'revoke' — the owner turns a link off.
//
// verify_jwt is off for the function (two actions are anonymous); 'create'/'revoke' do their own
// auth check inline, matching shared-task.

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
const ATTACH_BUCKET = 'task-attachments'

type Rec = Record<string, unknown>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const authedOwner = async (workspaceId: string, authHeader: string | null): Promise<string | null> => {
    if (!authHeader) return 'Missing Authorization header'
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error } = await caller.auth.getUser()
    if (error || !user) return 'Not authenticated'
    const { data: ws } = await admin.from('workspaces').select('id, owner_id').eq('id', workspaceId).maybeSingle()
    if (!ws || ws.owner_id !== user.id) return 'Not your workspace'
    return null
  }

  try {
    const body = await req.json() as Rec
    const action = body.action

    if (action === 'create') {
      const { workspaceId, projectId } = body as { workspaceId?: string; projectId?: string }
      if (!workspaceId || !projectId) return json({ error: 'workspaceId and projectId are required' }, 400)
      const err = await authedOwner(workspaceId, req.headers.get('Authorization'))
      if (err) return json({ error: err }, err === 'Not your workspace' ? 403 : 401)

      // Reuse an existing active token for this project if there is one, so the link is stable.
      const { data: existing } = await admin.from('project_shares')
        .select('token').eq('workspace_id', workspaceId).eq('project_id', projectId).eq('revoked', false)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (existing?.token) return json({ token: existing.token })

      const token = randomToken()
      const { error: insErr } = await admin.from('project_shares').insert({ token, workspace_id: workspaceId, project_id: projectId })
      if (insErr) return json({ error: insErr.message }, 500)
      return json({ token })
    }

    if (action === 'revoke') {
      const { workspaceId, token } = body as { workspaceId?: string; token?: string }
      if (!workspaceId || !token) return json({ error: 'workspaceId and token are required' }, 400)
      const err = await authedOwner(workspaceId, req.headers.get('Authorization'))
      if (err) return json({ error: err }, err === 'Not your workspace' ? 403 : 401)
      await admin.from('project_shares').update({ revoked: true }).eq('token', token).eq('workspace_id', workspaceId)
      return json({ ok: true })
    }

    if (action === 'view') {
      const { token } = body as { token?: string }
      if (!token) return json({ error: 'token is required' }, 400)
      const { data: share } = await admin.from('project_shares').select('*').eq('token', token).maybeSingle()
      if (!share || share.revoked) return json({ error: 'not_found' }, 404)

      const { data: wsState } = await admin.from('workspace_state').select('data, updated_at').eq('workspace_id', share.workspace_id).maybeSingle()
      const state = (wsState?.data ?? {}) as Rec
      const projects = (state.projects as Rec[]) ?? []
      const project = projects.find(p => p.id === share.project_id)
      if (!project) return json({ error: 'not_found' }, 404)

      const areas = (state.areas as Rec[]) ?? []
      const milestones = (state.milestones as Rec[]) ?? []
      const allTasks = (state.tasks as Rec[]) ?? []
      const members = (project.members as Rec[]) ?? []
      const memberName = (id: unknown) => members.find(m => m.id === id)?.name ?? null

      const phases = milestones.filter(m => m.projectId === share.project_id)
        .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0))
        .map(m => ({ id: m.id, name: m.name, detail: m.detail ?? null, due: m.due ?? null, status: m.status }))

      const tasks = allTasks.filter(t => t.projectId === share.project_id && !t.parentId).map(t => ({
        id: t.id, title: t.title, status: t.status, priority: t.priority, due: t.due ?? null,
        milestoneId: t.milestoneId ?? null, assigneeName: memberName(t.assigneeMemberId),
      }))

      // Documents — short-lived signed URLs so the recipient can actually open them.
      const docsIn = (project.documents as Rec[]) ?? []
      const documents: Rec[] = []
      for (const d of docsIn) {
        let signed: string | null = null
        try {
          const { data } = await admin.storage.from(ATTACH_BUCKET).createSignedUrl(String(d.path), 3600)
          signed = data?.signedUrl ?? null
        } catch (_e) { /* ignore */ }
        documents.push({ name: d.name, size: d.size, type: d.type, url: signed })
      }

      return json({
        project: {
          name: project.name, outcome: project.outcome ?? '', status: project.status, priority: project.priority,
          due: project.due ?? null, start: project.start ?? null, notes: project.notes ?? '',
          ownerMemberId: project.ownerMemberId ?? null,
        },
        areaName: areas.find(a => a.id === project.areaId)?.name ?? null,
        members: members.map(m => ({ id: m.id, name: m.name, role: m.role ?? null })),
        phases, tasks, documents,
        updatedAt: wsState?.updated_at ?? null,
      })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
