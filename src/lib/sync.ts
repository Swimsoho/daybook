import type { AppState } from './model'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WORKSPACE SYNC
 * ─────────────────────────────────────────────────────────────────────────────
 * A workspace is one JSON document. That is fine for reading and catastrophic
 * for concurrent writing: whoever saved last used to replace the whole thing,
 * so a second tab — or a phone that woke up holding an hour-old copy — silently
 * destroyed everything the other client had done.
 *
 * The fix has two halves:
 *
 *   1. The database refuses a stale write (`save_workspace_state`, migration
 *      0006). A save carries the version it was based on; if the row has moved
 *      on, the write is rejected rather than applied.
 *
 *   2. This file turns that rejection into a merge instead of an error. We know
 *      three things — the state we last agreed on with the server (`base`),
 *      what we have now (`mine`), and what the server has now (`theirs`) — which
 *      is enough to work out what *this* client actually changed and replay only
 *      that on top of the other client's work.
 *
 * The merge is per record, not per document. If you complete a task on your
 * phone while the laptop renames a different one, both survive. If both edit
 * the *same* record, the one that saved second wins that record and nothing
 * else — which is the smallest possible loss, and the behaviour people expect.
 */

/** every collection on AppState that holds records with an `id` */
const COLLECTIONS = [
  'areas',
  'projects',
  'tasks',
  'people',
  'interactions',
  'categories',
  'actions',
  'vendors',
  'collections',
  'trackers',
  'entries',
  'captures',
  'adminUsers',
] as const

type CollectionKey = (typeof COLLECTIONS)[number]
type Record_ = { id: string }

function byId<T extends Record_>(list: T[] | undefined): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of list ?? []) if (item?.id) map.set(item.id, item)
  return map
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Merge one collection.
 *
 * Start from what the server has, then replay this client's own changes:
 *   - a record I added that the server hasn't seen → append it
 *   - a record I edited since `base` → my version wins for that record
 *   - a record I deleted since `base` → remove it
 * Anything I didn't touch is left exactly as the server has it, including
 * records the other client added or changed.
 */
function mergeCollection<T extends Record_>(base: T[], mine: T[], theirs: T[]): T[] {
  const baseMap = byId(base)
  const mineMap = byId(mine)
  const theirsMap = byId(theirs)

  const result = new Map(theirsMap)

  // my edits and additions
  for (const [id, record] of mineMap) {
    const before = baseMap.get(id)
    if (!before) {
      // I added it — keep the server's copy if it somehow has one already
      if (!result.has(id)) result.set(id, record)
    } else if (!same(before, record)) {
      result.set(id, record)
    }
  }

  // my deletions
  for (const id of baseMap.keys()) {
    if (!mineMap.has(id)) result.delete(id)
  }

  // order: the server's order first (so other clients' arrangement is respected),
  // then anything of mine it hasn't seen, in my order
  const ordered: T[] = []
  const seen = new Set<string>()
  for (const item of theirs ?? []) {
    const merged = result.get(item.id)
    if (merged && !seen.has(item.id)) {
      ordered.push(merged)
      seen.add(item.id)
    }
  }
  for (const item of mine ?? []) {
    const merged = result.get(item.id)
    if (merged && !seen.has(item.id)) {
      ordered.push(merged)
      seen.add(item.id)
    }
  }
  return ordered
}

/**
 * Settings merge, field by field. Changing the theme on your phone must not
 * revert the daily capacity you changed on the laptop a minute earlier.
 */
function mergeSettings(
  base: AppState['settings'],
  mine: AppState['settings'],
  theirs: AppState['settings'],
): AppState['settings'] {
  const result: Record<string, unknown> = { ...(theirs as unknown as Record<string, unknown>) }
  const baseRec = (base ?? {}) as unknown as Record<string, unknown>
  const mineRec = (mine ?? {}) as unknown as Record<string, unknown>
  for (const key of new Set([...Object.keys(mineRec), ...Object.keys(baseRec)])) {
    if (!same(baseRec[key], mineRec[key])) result[key] = mineRec[key]
  }
  return result as unknown as AppState['settings']
}

/**
 * The audit trail is append-only by design, so it never merges — it unions.
 * Nothing is ever dropped, and the newest entry sorts first.
 */
function mergeAudit(mine: AppState['audit'], theirs: AppState['audit']): AppState['audit'] {
  const seen = new Set<string>()
  const all = [...(theirs ?? []), ...(mine ?? [])].filter(e => {
    if (!e?.id || seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })
  return all.sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''))
}

/**
 * Three-way merge of two versions of a workspace.
 *
 * `base` is the last state this client and the server agreed on. Without it
 * there is no way to tell "I changed this" from "they changed this", so a null
 * base falls back to taking the server's copy — losing this client's unsaved
 * edits rather than overwriting the other client's saved ones. Losing the
 * smaller, more recent, still-on-screen thing is the safer failure.
 */
export function mergeStates(base: AppState | null, mine: AppState, theirs: AppState): AppState {
  if (!base) return theirs

  const merged = { ...theirs } as AppState
  for (const key of COLLECTIONS) {
    const b = (base[key] ?? []) as Record_[]
    const m = (mine[key] ?? []) as Record_[]
    const t = (theirs[key] ?? []) as Record_[]
    ;(merged as unknown as Record<string, unknown>)[key] = mergeCollection(b, m, t)
  }
  merged.settings = mergeSettings(base.settings, mine.settings, theirs.settings)
  merged.audit = mergeAudit(mine.audit, theirs.audit)
  return merged
}

/** true when this client's copy differs from what the server holds */
export function differs(a: AppState, b: AppState): boolean {
  return !same(a, b)
}

export type SaveOutcome =
  | { status: 'saved'; version: number }
  | { status: 'conflict'; version: number; serverData: AppState }
  /** the migration hasn't been applied yet — caller decides what to do */
  | { status: 'unsupported' }
  | { status: 'error'; message: string }

type RpcRow = { ok: boolean; version: number; data: unknown }

/**
 * Just enough of the Supabase client to call one function. Typed structurally so
 * this module doesn't depend on the SDK's generated database types — it's the
 * same client either app already has.
 */
type MinimalClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>
}

/**
 * Save, but only if nobody else has written since we loaded.
 *
 * Returns 'conflict' with the server's current state rather than throwing —
 * a conflict is an ordinary event here, not a failure.
 */
export async function saveWorkspaceState(
  client: MinimalClient,
  workspaceId: string,
  data: AppState,
  expectedVersion: number | null,
): Promise<SaveOutcome> {
  const { data: rows, error } = await client.rpc('save_workspace_state', {
    p_workspace_id: workspaceId,
    p_data: data as unknown as Record<string, unknown>,
    p_expected_version: expectedVersion,
  })

  if (error) {
    // PGRST202 = no such function: migration 0006 hasn't been applied yet
    const missing = error.code === 'PGRST202' || /save_workspace_state/i.test(error.message)
    return missing ? { status: 'unsupported' } : { status: 'error', message: error.message }
  }

  const row = (Array.isArray(rows) ? rows[0] : rows) as RpcRow | undefined
  if (!row) return { status: 'error', message: 'Save returned no result' }

  return row.ok
    ? { status: 'saved', version: Number(row.version) }
    : {
        status: 'conflict',
        version: Number(row.version),
        serverData: row.data as unknown as AppState,
      }
}
