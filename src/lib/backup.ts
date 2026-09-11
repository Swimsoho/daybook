import type { AppState } from './model'

// Every top-level array on AppState — kept in sync with the loader's coercion so an imported backup
// can never load a shape that crashes the app.
const STATE_ARRAY_KEYS = [
  'areas', 'projects', 'milestones', 'tasks', 'people', 'interactions', 'categories', 'actions',
  'vendors', 'collections', 'trackers', 'entries', 'captures', 'audit', 'adminUsers',
] as const

// Rough content size, shown in the confirm dialog so the user can sanity-check a backup before it
// replaces their live data ("this file has 89 tasks, 4 projects…").
export function backupSummary(state: AppState): { tasks: number; projects: number; people: number; entries: number } {
  const n = (a: unknown) => (Array.isArray(a) ? a.length : 0)
  return { tasks: n(state.tasks), projects: n(state.projects), people: n(state.people), entries: n(state.entries) }
}

// Download the entire workspace as a JSON file the user can keep as their own backup. Runs entirely
// in the browser — nothing leaves for a server — so it works regardless of plan or connectivity.
export function exportData(state: AppState): void {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const payload = { _daybookBackup: 1, exportedAt: new Date().toISOString(), state }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `daybook-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Parse + validate a backup file's text into an AppState, throwing a friendly message if it isn't a
// Daybook backup. Accepts either the wrapped { _daybookBackup, state } shape or a bare state object,
// and coerces every array so a partial/older backup can't crash the app on import.
export function parseBackup(text: string): AppState {
  let obj: unknown
  try { obj = JSON.parse(text) } catch { throw new Error('That file isn’t valid JSON — pick the .json backup you downloaded.') }
  if (!obj || typeof obj !== 'object') throw new Error('That file doesn’t look like a Daybook backup.')
  const root = obj as Record<string, unknown>
  const raw = ('state' in root && root.state && typeof root.state === 'object' ? root.state : root) as Record<string, unknown>
  const hasCore = 'settings' in raw && STATE_ARRAY_KEYS.some(k => Array.isArray(raw[k]))
  if (!hasCore) throw new Error('That file doesn’t look like a Daybook backup — no workspace data found in it.')
  const out = { ...raw }
  for (const k of STATE_ARRAY_KEYS) if (!Array.isArray(out[k])) out[k] = []
  return out as unknown as AppState
}
