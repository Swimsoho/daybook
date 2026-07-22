import React, { useEffect, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { supabase } from './supabase'
import { AdminUser, AppState, Role } from './model'
import { emptyState, seedState } from './seed'

// ---------- Types ----------

export interface CloudProfile {
  id: string
  email: string
  name: string
  role: Role
  isSuperAdmin: boolean
  status: 'active' | 'invited' | 'suspended'
  phone?: string
  telegramChatId?: string
  slackUserId?: string
}

export interface PortalHandle {
  initial: AppState
  save: (s: AppState) => void
}

export interface Cloud {
  profile: CloudProfile
  mode: 'real' | 'sample'
  setMode: (m: 'real' | 'sample') => void
  state: AppState
  save: (s: AppState) => void
  saveKey: string // workspace id — remount key
  signOut: () => void
  setPassword: (pw: string) => Promise<string | null>
  setPhone: (phone: string) => Promise<string | null>
  setTelegramChatId: (id: string) => Promise<string | null>
  setSlackUserId: (id: string) => Promise<string | null>
  sendTestMessage: (channel: 'telegram' | 'slack') => Promise<string | null>
  admin: {
    listUsers: () => Promise<AdminUser[]>
    invite: (u: { name: string; email: string; role: Role }) => Promise<string | null>
    setRole: (userId: string, role: Role) => Promise<void>
    setStatus: (userId: string, status: 'active' | 'suspended') => Promise<void>
    openPortal: (userId: string, mode: 'real' | 'sample') => Promise<PortalHandle | null>
    deleteUser: (userId: string) => Promise<string | null>
    resendInvite: (userId: string, u: { name: string; email: string; role: Role }) => Promise<string | null>
  }
}

interface WorkspaceRow { id: string; kind: 'real' | 'sample'; owner_id: string }

// ---------- Persistence helpers ----------

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debouncedSave(workspaceId: string, s: AppState) {
  if (!supabase) return
  const sb = supabase
  clearTimeout(saveTimers[workspaceId])
  saveTimers[workspaceId] = setTimeout(async () => {
    const { error } = await sb
      .from('workspace_state')
      .upsert({ workspace_id: workspaceId, data: s as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
    if (error) toast.error('Cloud save failed — ' + error.message)
  }, 800)
}

// Fields added to Settings after some accounts were already saved to Supabase — a loaded
// blob missing a key would otherwise leave it silently undefined (blank inputs, broken
// comparisons) instead of falling back to a sane default. Extend this whenever Settings grows.
const SETTINGS_BACKFILL: Partial<AppState['settings']> = { projectWipLimit: 3, theme: 'sage' }

async function loadOrSeedState(ws: WorkspaceRow, ownerName: string): Promise<AppState> {
  const { data } = await supabase!.from('workspace_state').select('data').eq('workspace_id', ws.id).maybeSingle()
  if (data?.data && Object.keys(data.data).length > 0) {
    const loaded = data.data as unknown as AppState
    return {
      ...loaded,
      settings: { ...SETTINGS_BACKFILL, ...loaded.settings },
      // Actions (Settings > Actions) shipped after some accounts were already saved — a blob
      // saved before then has no `actions` key at all, and every `state.actions.filter(...)`
      // call across the app would throw on undefined. Backfill the standard starter set once;
      // it behaves exactly like a freshly seeded account from here on.
      actions: loaded.actions ?? seedState().actions,
    }
  }
  const fresh = ws.kind === 'sample' ? seedState() : emptyState(ownerName || 'there')
  await supabase!.from('workspace_state').upsert({ workspace_id: ws.id, data: fresh as unknown as Record<string, unknown> })
  return fresh
}

// ---------- AuthGate ----------

export function AuthGate({ children }: { children: (cloud: Cloud | null) => React.ReactNode }) {
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSessionUserId(data.session?.user.id ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionUserId(session?.user.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!supabase) return <>{children(null)}</>
  if (sessionUserId === undefined) return <Splash text="Waking Daybook up…" />
  if (sessionUserId === null) return <LoginScreen />
  return <CloudLoader key={sessionUserId} userId={sessionUserId}>{children}</CloudLoader>
}

function Splash({ text }: { text: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="text-center">
        <div className="font-display-soft text-4xl mb-2">Daybook</div>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

// ---------- Login / sign-up ----------

function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function go() {
    if (!supabase) return
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { data: { name } } })
        if (error) setMsg({ kind: 'err', text: error.message })
        else if (data.session) setMsg({ kind: 'ok', text: 'Account created — taking you in…' })
        else setMsg({ kind: 'ok', text: 'Account created. Check your email for the confirmation link, click it, then sign in here.' })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) setMsg({ kind: 'err', text: error.message === 'Invalid login credentials' ? 'Invalid login credentials — check the password, or use “Forgot password”. If you just signed up, confirm your email first.' : error.message })
      }
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    if (!supabase || !email) { setMsg({ kind: 'err', text: 'Enter your email above first' }); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    if (error) setMsg({ kind: 'err', text: error.message })
    else setMsg({ kind: 'ok', text: 'Reset link sent — check your inbox' })
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-6">
          <div className="font-display-soft text-4xl">Daybook</div>
          <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground mt-1.5">Run your life from it</p>
        </div>
        <div className="border border-border bg-card shadow-sm p-5 grid gap-3">
          {mode === 'signup' && (
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
              className="h-10 border border-input bg-background px-3 text-sm rounded-sm outline-none focus:border-primary" />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email"
            className="h-10 border border-input bg-background px-3 text-sm rounded-sm outline-none focus:border-primary" />
          <input value={pw} onChange={e => setPw(e.target.value)} placeholder="Password" type="password"
            onKeyDown={e => e.key === 'Enter' && go()}
            className="h-10 border border-input bg-background px-3 text-sm rounded-sm outline-none focus:border-primary" />
          <button onClick={go} disabled={busy}
            className="h-10 bg-primary text-primary-foreground rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          {msg && (
            <p className={`text-[12.5px] leading-snug border rounded-sm px-3 py-2 ${msg.kind === 'ok'
              ? 'border-[hsl(152_20%_60%)] bg-[hsl(152_25%_38%_/_0.08)] text-[hsl(152_25%_25%)]'
              : 'border-[hsl(8_40%_65%)] bg-[hsl(8_60%_45%_/_0.07)] text-[hsl(8_60%_35%)]'}`}>
              {msg.text}
            </p>
          )}
          <div className="flex justify-between text-[12px] text-muted-foreground">
            <button className="hover:text-foreground" onClick={() => setMode(m => m === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </button>
            <button className="hover:text-foreground" onClick={forgot}>Forgot password</button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Invited by email? Open the invite link, then set your password from the sidebar once you're in.
        </p>
      </div>
      <Toaster position="top-center" />
    </div>
  )
}

// ---------- CloudLoader — profile, workspaces, state ----------

function CloudLoader({ userId, children }: { userId: string; children: (cloud: Cloud | null) => React.ReactNode }) {
  const [profile, setProfile] = useState<CloudProfile | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([])
  const [states, setStates] = useState<Record<string, AppState>>({})
  const [mode, setMode] = useState<'real' | 'sample'>('real')
  const [err, setErr] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current || !supabase) return
    loaded.current = true
    ;(async () => {
      const { data: prof, error: pe } = await supabase!.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (pe || !prof) { setErr(pe?.message ?? 'Profile not found — was the database schema applied?'); return }
      const { data: wss, error: we } = await supabase!.from('workspaces').select('*').eq('owner_id', userId)
      if (we || !wss?.length) { setErr(we?.message ?? 'No workspaces — was the sign-up trigger installed?'); return }
      const p: CloudProfile = {
        id: prof.id, email: prof.email, name: prof.name, role: prof.role, isSuperAdmin: prof.is_super_admin, status: prof.status,
        phone: prof.phone ?? undefined, telegramChatId: prof.telegram_chat_id ?? undefined, slackUserId: prof.slack_user_id ?? undefined,
      }
      const loadedStates: Record<string, AppState> = {}
      for (const ws of wss as WorkspaceRow[]) {
        loadedStates[ws.id] = await loadOrSeedState(ws as WorkspaceRow, prof.name)
      }
      setProfile(p)
      setWorkspaces(wss as WorkspaceRow[])
      setStates(loadedStates)
    })().catch(e => setErr(String(e)))
  }, [userId])

  if (err) {
    return (
      <Splash text={`Something needs attention: ${err}`} />
    )
  }
  if (!profile) return <Splash text="Loading your workspaces…" />
  if (profile.status === 'suspended') {
    return <Splash text="This account is suspended. Contact your administrator." />
  }

  const activeWs = workspaces.find(w => w.kind === mode) ?? workspaces[0]

  const cloud: Cloud = {
    profile,
    mode,
    setMode,
    state: states[activeWs.id],
    saveKey: activeWs.id,
    save: s => debouncedSave(activeWs.id, s),
    signOut: () => { supabase!.auth.signOut() },
    setPassword: async pw => {
      const { error } = await supabase!.auth.updateUser({ password: pw })
      return error ? error.message : null
    },
    setPhone: async phone => {
      const trimmed = phone.trim()
      const { error } = await supabase!.from('profiles').update({ phone: trimmed || null }).eq('id', profile.id)
      if (error) return error.message
      setProfile(p => p && { ...p, phone: trimmed || undefined })
      return null
    },
    setTelegramChatId: async id => {
      const trimmed = id.trim()
      const { error } = await supabase!.from('profiles').update({ telegram_chat_id: trimmed || null }).eq('id', profile.id)
      if (error) return error.message
      setProfile(p => p && { ...p, telegramChatId: trimmed || undefined })
      return null
    },
    setSlackUserId: async id => {
      const trimmed = id.trim()
      const { error } = await supabase!.from('profiles').update({ slack_user_id: trimmed || null }).eq('id', profile.id)
      if (error) return error.message
      setProfile(p => p && { ...p, slackUserId: trimmed || undefined })
      return null
    },
    // Calls the send-message Edge Function with the caller's own session — the function
    // verifies the JWT belongs to this profile (verify_jwt: true) before sending, and holds
    // the actual bot token / signing secret server-side (Edge Function secrets), never in
    // client code. Lets Craig confirm end-to-end delivery is really wired up before trusting
    // it for the scheduled morning brief.
    sendTestMessage: async channel => {
      const { data, error } = await supabase!.functions.invoke('send-message', {
        body: { channel, text: 'Test message from Daybook — if you can read this, the connection works.' },
      })
      if (error) return error.message
      if (data?.error) return data.error as string
      return null
    },
    admin: {
      async listUsers() {
        const { data, error } = await supabase!.from('profiles').select('*').order('created_at')
        if (error) { toast.error(error.message); return [] }
        return (data ?? []).map(u => ({
          id: u.id, name: u.name || u.email, email: u.email, role: u.role as Role,
          status: u.status, lastActive: (u.created_at ?? '').slice(0, 10),
          hasSample: true, hasReal: true, isSuperAdmin: u.is_super_admin,
        }))
      },
      async invite(u) {
        const { data, error } = await supabase!.functions.invoke('invite-user', { body: u })
        if (error) return error.message
        if (data?.error) return String(data.error)
        return null
      },
      async setRole(uid, role) {
        const { error } = await supabase!.from('profiles').update({ role }).eq('id', uid)
        if (error) toast.error(error.message)
      },
      async setStatus(uid, status) {
        const { error } = await supabase!.from('profiles').update({ status }).eq('id', uid)
        if (error) toast.error(error.message)
      },
      async openPortal(uid, m) {
        const { data: wss, error } = await supabase!.from('workspaces').select('*').eq('owner_id', uid).eq('kind', m)
        if (error || !wss?.length) { toast.error(error?.message ?? 'No such workspace'); return null }
        const ws = wss[0] as WorkspaceRow
        const { data: prof } = await supabase!.from('profiles').select('name,email').eq('id', uid).maybeSingle()
        const initial = await loadOrSeedState(ws, prof?.name ?? '')
        return { initial, save: s => debouncedSave(ws.id, s) }
      },
      async deleteUser(userId) {
        const { data, error } = await supabase!.functions.invoke('manage-user', { body: { action: 'delete', userId } })
        if (error) return error.message
        if (data?.error) return String(data.error)
        return null
      },
      async resendInvite(userId, u) {
        const { data, error } = await supabase!.functions.invoke('manage-user', { body: { action: 'resend', userId, ...u } })
        if (error) return error.message
        if (data?.error) return String(data.error)
        return null
      },
    },
  }

  return <>{children(cloud)}</>
}

// ---------- Cloud context ----------
// AuthGate hands `cloud` to the app via a render-prop (see App.tsx), which is fine at the
// root but would mean prop-drilling `cloud` through every page and dialog that needs it —
// e.g. task attachments, which need cloud.profile.id + the active workspace id to build a
// storage path, but render deep inside TasksPage/Dashboard/ProjectsPage. This context lets
// any component reach it directly with `useCloud()` instead.
const CloudContext = React.createContext<Cloud | null>(null)
export function CloudProvider({ cloud, children }: { cloud: Cloud | null; children: React.ReactNode }) {
  return <CloudContext.Provider value={cloud}>{children}</CloudContext.Provider>
}
export function useCloud(): Cloud | null {
  return React.useContext(CloudContext)
}
