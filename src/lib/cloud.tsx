import React, { useEffect, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { supabase } from './supabase'
import { AdminUser, AppState, Role, Tracker, TrackerColumn } from './model'
import { mergeStates, saveWorkspaceState } from './sync'
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

export interface MovieLookupResult {
  ok?: boolean
  notFound?: boolean
  error?: string
  kind?: 'movie' | 'tv'
  matched?: { title: string; year: string; releaseDate?: string; tmdbId: number }
  providers?: { stream: string[]; ads: string[]; rent: string[]; buy: string[] }
  summary?: string
  link?: string
}

export interface EntrySuggestion {
  title: string
  year: string
  overview: string
  why: string
}
export interface SuggestEntriesResult {
  ok?: boolean
  error?: string
  suggestions?: EntrySuggestion[]
}

export interface Cloud {
  profile: CloudProfile
  mode: 'real' | 'sample'
  setMode: (m: 'real' | 'sample') => void
  state: AppState
  save: (s: AppState) => void
  saveKey: string // workspace id — remount key
  // Re-read the active workspace's persisted state straight from the database. Used to pull in
  // captures that arrived server-side (Telegram/Slack/SMS webhooks) after this tab loaded, without
  // a full reload. Returns null if unavailable (not signed in / read failed).
  fetchState: () => Promise<AppState | null>
  signOut: () => void
  setPassword: (pw: string) => Promise<string | null>
  setPhone: (phone: string) => Promise<string | null>
  setTelegramChatId: (id: string) => Promise<string | null>
  setSlackUserId: (id: string) => Promise<string | null>
  sendTestMessage: (channel: 'telegram' | 'slack', text?: string) => Promise<string | null>
  shareTask: (task: { id: string; title: string; notes?: string; due?: string }) => Promise<{ token?: string; error?: string }>
  // Live "where to watch" lookup (movie/TV trackers) — calls the movie-lookup Edge Function,
  // which returns current US streaming/rent/buy providers from TMDB. Returns a result object,
  // or { error } if the function isn't deployed / the TMDB key isn't set.
  lookupMovie: (title: string, year?: string) => Promise<MovieLookupResult>
  // Personalised "what to add next" for any collection — calls the suggest-entries Edge Function.
  // `kind: 'watch'` uses TMDB recommendations from the titles you already have (same TMDB key as
  // lookupMovie); anything else ('generic') uses an LLM over the list's name/description + items,
  // so books, subscriptions, restaurants and custom trackers get real recommendations too.
  suggestEntries: (payload: {
    titles: { title: string; year?: string; rating?: number }[]
    count?: number
    kind?: 'watch' | 'generic'
    context?: { name?: string; description?: string }
  }) => Promise<SuggestEntriesResult>
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

// supabase-js wraps ANY non-2xx Edge Function response in a generic "Edge Function returned a
// non-2xx status code" error and hides the response body — so users only ever saw that opaque line.
// The real, actionable message (e.g. "email rate limit exceeded", "already signed in") is in
// error.context (the underlying Response). This digs it out so the UI can show the true reason.
async function readFnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context
  try {
    if (ctx instanceof Response) {
      const body = await ctx.clone().json().catch(() => null) as { error?: string } | null
      if (body?.error) return body.error
      const text = await ctx.clone().text().catch(() => '')
      if (text) return text.slice(0, 300)
    }
  } catch { /* fall through to the generic message */ }
  return (error as { message?: string } | null)?.message ?? 'Unknown error'
}

// ---------- Persistence helpers ----------

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}

/**
 * Per-workspace sync bookkeeping.
 *  - `version`  the row version this client last agreed with the server on
 *  - `base`     the state at that version — the reference point for merging
 *  - `latest`   the most recent state handed to save(), i.e. what's on screen
 *  - `legacy`   true once we've discovered the versioned save isn't available
 *               (migration 0006 not applied), so we stop retrying it
 */
type SyncInfo = {
  version: number | null
  base: AppState | null
  latest: AppState | null
  legacy: boolean
  onRemote?: (next: AppState) => void
}
const sync: Record<string, SyncInfo> = {}

function syncInfo(workspaceId: string): SyncInfo {
  sync[workspaceId] ??= { version: null, base: null, latest: null, legacy: false }
  return sync[workspaceId]
}

/** Called after a successful load so the first save has something to merge against. */
export function noteLoadedState(workspaceId: string, s: AppState, version: number | null) {
  const info = syncInfo(workspaceId)
  info.base = s
  info.latest = s
  info.version = version
}

/** Lets the store receive state that arrived from another device. */
export function onRemoteState(workspaceId: string, fn: (next: AppState) => void): () => void {
  const info = syncInfo(workspaceId)
  info.onRemote = fn
  return () => {
    if (info.onRemote === fn) info.onRemote = undefined
  }
}

let warnedLegacy = false

/**
 * Save with optimistic concurrency.
 *
 * On conflict we do NOT overwrite: we merge our own changes onto whatever the
 * other client saved, hand the result back to the UI, and save that. Up to a
 * few attempts, because a third client could write in between.
 */
async function pushState(workspaceId: string, s: AppState, attempt = 0): Promise<void> {
  if (!supabase) return
  const sb = supabase
  const info = syncInfo(workspaceId)
  info.latest = s

  // Pre-migration fallback: the old blind upsert. Still lossy — which is the
  // whole reason for migration 0006 — so it warns once rather than silently
  // pretending everything is fine.
  if (info.legacy) {
    const { error } = await sb
      .from('workspace_state')
      .upsert({ workspace_id: workspaceId, data: s as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
    if (error) toast.error('Cloud save failed — ' + error.message)
    else info.base = s
    return
  }

  const outcome = await saveWorkspaceState(sb as unknown as Parameters<typeof saveWorkspaceState>[0], workspaceId, s, info.version)

  if (outcome.status === 'saved') {
    info.version = outcome.version
    info.base = s
    return
  }

  if (outcome.status === 'unsupported') {
    info.legacy = true
    if (!warnedLegacy) {
      warnedLegacy = true
      toast.warning('Multi-device protection is off', {
        description: 'Run migration 0006 in Supabase so two devices can’t overwrite each other.',
        duration: 10000,
      })
    }
    return pushState(workspaceId, s, attempt)
  }

  if (outcome.status === 'error') {
    toast.error('Cloud save failed — ' + outcome.message)
    return
  }

  // conflict — someone else saved first
  if (attempt >= 3) {
    toast.error('Couldn’t save — too many changes at once', {
      description: 'Your latest edit may not have saved. Reload to see the current version.',
    })
    return
  }

  const merged = mergeStates(info.base, info.latest ?? s, outcome.serverData)
  info.version = outcome.version
  info.base = outcome.serverData
  info.latest = merged
  info.onRemote?.(merged) // put the other device's work on screen straight away
  return pushState(workspaceId, merged, attempt + 1)
}

function debouncedSave(workspaceId: string, s: AppState) {
  if (!supabase) return
  syncInfo(workspaceId).latest = s
  clearTimeout(saveTimers[workspaceId])
  saveTimers[workspaceId] = setTimeout(() => { void pushState(workspaceId, s) }, 800)
}

/**
 * Watch a workspace for changes made anywhere else — another tab, a laptop, a
 * phone, or an Edge Function filing a capture from Telegram — and merge them in
 * as they happen rather than discovering them at save time.
 */
export function subscribeWorkspace(workspaceId: string): () => void {
  if (!supabase) return () => {}
  const sb = supabase
  const info = syncInfo(workspaceId)

  const channel = sb
    .channel(`workspace_state:${workspaceId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workspace_state', filter: `workspace_id=eq.${workspaceId}` },
      payload => {
        const row = payload.new as { version?: number; data?: unknown } | null
        if (!row?.data) return
        const version = Number(row.version ?? 0)
        if (info.version !== null && version <= info.version) return // our own write echoing back

        const theirs = row.data as unknown as AppState
        const merged = mergeStates(info.base, info.latest ?? theirs, theirs)
        info.version = version
        info.base = theirs
        info.latest = merged
        info.onRemote?.(merged)
      },
    )
    .subscribe()

  return () => { void sb.removeChannel(channel) }
}

// Fields added to Settings after some accounts were already saved to Supabase — a loaded
// blob missing a key would otherwise leave it silently undefined (blank inputs, broken
// comparisons) instead of falling back to a sane default. Extend this whenever Settings grows.
const SETTINGS_BACKFILL: Partial<AppState['settings']> = {
  projectWipLimit: 3, theme: 'sage', timezone: 'Europe/London', lunchTime: '12:30',
}

// Appends any seeded item (by name, case-insensitive) missing from an existing list — used to
// backfill collections/trackers that shipped after some accounts were already saved. Existing
// items are never modified or reordered; a missing name is simply appended once.
function backfillByName<T extends { name: string }>(existing: T[] | undefined, seeded: T[], namesLower: string[]): T[] {
  const list = existing ?? []
  const have = new Set(list.map(x => x.name.toLowerCase()))
  const missing = seeded.filter(s => namesLower.includes(s.name.toLowerCase()) && !have.has(s.name.toLowerCase()))
  return missing.length ? [...list, ...missing] : list
}

// Non-destructively bring the standard Notes/Ideas trackers up to date with options and columns
// that shipped after an account's tracker was first created (backfillByName only adds a whole
// missing tracker, never touches an existing one's columns). Only ADDS — never removes an option
// or column the person may have customised. Runs on every load; a no-op once everything's present.
function augmentStandardTrackers(trackers: Tracker[]): Tracker[] {
  const mergeOptions = (col: TrackerColumn, want: string[]): TrackerColumn => {
    const have = col.options ?? []
    const add = want.filter(o => !have.includes(o))
    return add.length ? { ...col, options: [...have, ...add] } : col
  }
  return trackers.map(t => {
    const name = t.name.trim().toLowerCase()
    if (name === 'notes') {
      return { ...t, columns: t.columns.map(c => (c.key === 'tag' && (c.type === 'select' || c.type === 'multiselect'))
        ? mergeOptions(c, ['Personal', 'Work', 'Idea', 'List', 'Reminder', 'Quote', 'Other']) : c) }
    }
    if (name === 'ideas') {
      // add the Category column (once) after Status, and keep Status' own options current
      let columns = t.columns.map(c => (c.key === 'status' && c.type === 'status')
        ? mergeOptions(c, ['New', 'Exploring', 'Parked', 'Acted on']) : c)
      if (!columns.some(c => c.key === 'category')) {
        const catCol: TrackerColumn = { key: 'category', name: 'Category', type: 'select', options: ['Business', 'Community', 'Personal', 'Family', 'Product', 'Other'] }
        const si = columns.findIndex(c => c.key === 'status')
        columns = si >= 0 ? [...columns.slice(0, si + 1), catCol, ...columns.slice(si + 1)] : [...columns, catCol]
      }
      return { ...t, columns }
    }
    return t
  })
}

// A watch-list (Movies / TV Series / …) needs a Status column *with options* for its board and its
// status filter to work — and the conditional Rating needs a value to switch on. A list the person
// built by hand often has a "Watched" status field with the options never typed in, leaving the
// board blank, the filter empty, and the Edit dropdown showing only "Choose…". This fills sensible
// defaults for exactly that case — a watch-list whose watch-status column has NO options yet — and
// never touches a column that already has its own options. Runs on load; a no-op once set.
const WATCH_STATUS_DEFAULTS = ['Want to watch', 'Watching', 'Watched']
function normalizeWatchTrackers(trackers: Tracker[]): Tracker[] {
  const isWatchList = (name: string) => /movie|film|tv|show|series|watch|cinema/i.test(name)
  return trackers.map(t => {
    if (!isWatchList(t.name)) return t
    let cols: TrackerColumn[] = t.columns.map(c => ({ ...c }))

    // A watch list is much more useful showing who's in it and when it came out, and the
    // shipped Movies tracker has had both since it was seeded. A list built by hand — or
    // created before those fields existed — has neither, so the cards show a bare title.
    // Add them once, only when genuinely absent, matching by key OR name so a hand-made
    // "Cast" or "Released" column isn't duplicated. Never reorders or edits what's there.
    const hasCol = (key: string, re: RegExp) =>
      cols.some(c => c.key === key || re.test(c.name))
    const titleIndex = Math.max(0, cols.findIndex(c => c.isTitle))
    const additions: TrackerColumn[] = []
    if (!hasCol('starring', /star|cast|actor|lead/i)) {
      additions.push({ key: 'starring', name: 'Starring', type: 'text' })
    }
    if (!hasCol('release', /release|aired|year|premier/i)) {
      additions.push({ key: 'release', name: 'Release date', type: 'date' })
    }
    // When you actually watched it. Defaults to the day you add the entry (see the New-entry dialog)
    // but is fully editable. Matched loosely so a hand-made "Watched on" / "Seen date" isn't doubled.
    if (!hasCol('watched_on', /watch(ed)?\s*(on|date)|date\s*watch|seen\s*(on|date)/i)) {
      additions.push({ key: 'watched_on', name: 'Date watched', type: 'date' })
    }
    if (additions.length) {
      // straight after the title, so they read as part of the entry's identity
      cols = [...cols.slice(0, titleIndex + 1), ...additions, ...cols.slice(titleIndex + 1)]
    }
    // The watch-status column: a status/select field named like Watch / Status / Seen / Progress
    // that has no options defined yet. (A checkbox "Watched" is left alone — it's a different shape.)
    const wc = cols.find(c => (c.type === 'status' || c.type === 'select') && /watch|status|seen|progress/i.test(c.name) && !(c.options?.length))
    if (!wc) return additions.length ? { ...t, columns: cols } : t
    wc.type = 'status' // so the Board view (which groups by a Status column) can render it
    wc.options = [...WATCH_STATUS_DEFAULTS]
    // A dependent column (e.g. Rating "appears when Watched reaches ___") left with a blank target
    // never fires — point it at "Watched" now that the option exists.
    for (const c of cols) {
      if (c.showWhen && c.showWhen.columnKey === wc.key && !c.showWhen.equals) {
        c.showWhen = { ...c.showWhen, equals: 'Watched' }
      }
    }
    return { ...t, columns: cols }
  })
}

async function loadOrSeedState(ws: WorkspaceRow, ownerName: string): Promise<AppState> {
  // `version` is added by migration 0006. Selecting it before that migration is
  // applied would error, so fall back to the data-only select in that case —
  // the app then saves the old (unguarded) way until the migration lands.
  type StateRow = { data?: Record<string, unknown>; version?: number }
  let data: StateRow | null = null
  const versioned = await supabase!
    .from('workspace_state')
    .select('data, version')
    .eq('workspace_id', ws.id)
    .maybeSingle()
  if (versioned.error) {
    const plain = await supabase!.from('workspace_state').select('data').eq('workspace_id', ws.id).maybeSingle()
    data = (plain.data ?? null) as StateRow | null
  } else {
    data = (versioned.data ?? null) as StateRow | null
  }

  if (data?.data && Object.keys(data.data).length > 0) {
    const loaded = data.data as unknown as AppState
    const normalised: AppState = {
      ...loaded,
      settings: {
        ...SETTINGS_BACKFILL,
        ...loaded.settings,
        // `features` is a nested object — the shallow spread above would otherwise let an
        // existing account's saved `features` blob (from before `lunchReminder` existed)
        // silently drop the new key, since object spread doesn't merge nested objects. The
        // field is typed as required, but an old saved blob won't actually have it at runtime —
        // hence the explicit ?? fallback rather than relying on spread order.
        features: { ...loaded.settings?.features, lunchReminder: loaded.settings?.features?.lunchReminder ?? true },
      },
      // Actions (Settings > Actions) shipped after some accounts were already saved — a blob
      // saved before then has no `actions` key at all, and every `state.actions.filter(...)`
      // call across the app would throw on undefined. Backfill the standard starter set once;
      // it behaves exactly like a freshly seeded account from here on.
      actions: loaded.actions ?? seedState().actions,
      // Project phases shipped after every existing account was already saved, so
      // their blob has no `milestones` key at all and every `state.milestones.filter(…)`
      // would throw on undefined. Empty, never seeded: an existing project has no
      // phases until its owner adds one, and inventing some would rearrange a plan
      // nobody asked us to touch.
      milestones: loaded.milestones ?? [],
      // Notes (v33) and Ideas trackers shipped after some accounts were already saved — a blob
      // saved before either existed has no matching collection/tracker at all, so the
      // "n:"/"note:"/"i:"/"idea:" capture prefixes would silently do nothing (no tracker to
      // find by name) even though the code fully supports them. Backfill each by name only if
      // it's actually missing — never touches anything the person's already renamed/added.
      collections: backfillByName(loaded.collections, seedState().collections, ['notes', 'ideas', 'dates', 'health', 'learning']),
      trackers: normalizeWatchTrackers(augmentStandardTrackers(backfillByName(loaded.trackers, seedState().trackers, ['notes', 'ideas', 'dates to remember', 'exercise', 'learning']))),
    }
    // Record what the server holds, and at which version, so the first save can
    // tell "I changed this" apart from "they changed this" (see lib/sync.ts).
    // The baseline is the *loaded* blob, not the normalised one — the backfills
    // above are local repairs we haven't saved yet, and treating them as the
    // server's own would make every one of them look like a remote change.
    noteLoadedState(ws.id, loaded, data.version === undefined ? null : Number(data.version))
    return normalised
  }
  const fresh = ws.kind === 'sample' ? seedState() : emptyState(ownerName || 'there')
  await supabase!.from('workspace_state').upsert({ workspace_id: ws.id, data: fresh as unknown as Record<string, unknown> })
  noteLoadedState(ws.id, fresh, null)
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
        <div className="border border-border bg-card shadow-sm rounded-lg p-5 grid grid-cols-1 gap-3">
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

  // Watch the workspace that's on screen for changes made anywhere else — the
  // other tab, the laptop, the phone, or an Edge Function filing a capture from
  // Telegram. Without this, the only way you'd learn about someone else's work
  // was by colliding with it.
  const activeWorkspaceId = (workspaces.find(w => w.kind === mode) ?? workspaces[0])?.id
  useEffect(() => {
    if (!activeWorkspaceId) return
    return subscribeWorkspace(activeWorkspaceId)
  }, [activeWorkspaceId])

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
    fetchState: async () => {
      if (!supabase) return null
      const { data, error } = await supabase.from('workspace_state').select('data').eq('workspace_id', activeWs.id).maybeSingle()
      if (error || !data?.data) return null
      return data.data as unknown as AppState
    },
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
    // client code. `text` defaults to a generic connectivity check (Settings > "Send test");
    // Settings > "Send now" passes the real composed brief/check-in text instead, so a
    // person can trigger today's push on demand rather than waiting for the scheduled time.
    sendTestMessage: async (channel, text) => {
      const { data, error } = await supabase!.functions.invoke('send-message', {
        body: { channel, text: text ?? 'Test message from Daybook — if you can read this, the connection works.' },
      })
      if (error) return error.message
      if (data?.error) return data.error as string
      return null
    },
    // "Share a task with someone to do, and get it back from them" (task detail > Share). Snap-
    // shots the task into a `task_shares` row via the shared-task Edge Function and returns a
    // token to build a public, no-login link from — see shared-task/index.ts for the full flow.
    shareTask: async task => {
      const { data, error } = await supabase!.functions.invoke('shared-task', {
        body: { action: 'create', workspaceId: activeWs.id, taskId: task.id, title: task.title, notes: task.notes, due: task.due },
      })
      if (error) return { error: error.message }
      if (data?.error) return { error: data.error as string }
      return { token: data.token as string }
    },
    lookupMovie: async (title, year) => {
      const { data, error } = await supabase!.functions.invoke('movie-lookup', { body: { title, year } })
      if (error) return { error: error.message }
      return (data ?? { error: 'No response' }) as MovieLookupResult
    },
    suggestEntries: async (payload) => {
      const { data, error } = await supabase!.functions.invoke('suggest-entries', { body: payload })
      if (error) return { error: error.message }
      return (data ?? { error: 'No response' }) as SuggestEntriesResult
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
        if (error) return await readFnError(error)
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
        if (error) return await readFnError(error)
        if (data?.error) return String(data.error)
        return null
      },
      async resendInvite(userId, u) {
        const { data, error } = await supabase!.functions.invoke('manage-user', { body: { action: 'resend', userId, ...u } })
        if (error) return await readFnError(error)
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
