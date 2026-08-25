import React, { createContext, useContext, useMemo, useState } from 'react'
import {
  Action, AdminUser, AppState, AuditEvent, Capture, Category, Collection, Entry, Interaction, Person, Priority,
  RoutingProposal, Settings, Task, TaskAttachment, TaskStatus, TierDef, Tracker, addDays, personCadence, personOverdueBy,
  daysSince, resolveTiers, tierLabel, today, uid,
} from './model'
import { seedState } from './seed'
import { nextDot } from './colors'

type Updater = (s: AppState) => AppState

// Categories tagged to specific areas (Settings > Categories) only show up for those
// areas; an untagged category still shows everywhere, so nothing already in use goes
// missing the moment this feature ships. `keepId` keeps a task's current category in the
// list even if it falls outside the area's tagged set, so changing area never silently
// hides what's already picked.
export function categoriesForArea(categories: Category[], areaId: string | undefined, keepId?: string): Category[] {
  return categories.filter(c =>
    c.active && (!c.areaIds || c.areaIds.length === 0 || (!!areaId && c.areaIds.includes(areaId)) || c.id === keepId),
  )
}

// How many live things reference this category — tasks filed under it, captures (pending or
// already actioned) proposing it, and any subcategory nested under it. Zero means it's safe to
// permanently delete instead of just archiving; anything above zero means archiving is the only
// option, since a hard delete would silently orphan real history.
export function categoryUsage(s: AppState, id: string): number {
  const inTasks = s.tasks.filter(t => t.categoryIds.includes(id)).length
  const inCaptures = s.captures.filter(c => c.proposal.categoryIds?.includes(id)).length
  const asParent = s.categories.filter(c => c.parentId === id).length
  return inTasks + inCaptures + asParent
}

// Same "never silently orphan" guard as categoryUsage, for the flat Action list — how many
// live things reference this action (tasks tagged with it, captures proposing it).
export function actionUsage(s: AppState, id: string): number {
  const inTasks = s.tasks.filter(t => t.actionIds?.includes(id)).length
  const inCaptures = s.captures.filter(c => c.proposal.actionIds?.includes(id)).length
  return inTasks + inCaptures
}

// Popularity signals for the other pickers that grow over time — same idea as
// categoryUsage/actionUsage above (how many live tasks reference this thing), just for
// areas, people, projects and trackers. Used only for ordering dropdowns (see
// withPopularFirst), never for delete-safety.
export function areaUsage(s: AppState, id: string): number {
  return s.tasks.filter(t => t.areaId === id).length
}
export function projectUsage(s: AppState, id: string): number {
  return s.tasks.filter(t => t.projectId === id).length
}
export function personUsage(s: AppState, id: string): number {
  return s.tasks.filter(t => t.personId === id).length + s.interactions.filter(i => i.personId === id).length
}
export function trackerUsage(s: AppState, id: string): number {
  return s.entries.filter(e => e.trackerId === id).length
}
export function vendorUsage(s: AppState, id: string): number {
  return s.tasks.filter(t => t.vendorId === id).length
}

// Orders a picker's options "frequently used first, then everything else alphabetically" —
// the shape SearchableSelect (components/ui/searchable-select.tsx) expects. `topN` caps how
// many items can count as "frequent" (only items with usage > 0 ever qualify), so a picker
// with nothing used yet just falls straight through to a plain A–Z list.
export function withPopularFirst<T>(
  items: T[], usage: (item: T) => number, label: (item: T) => string, topN = 4,
): { ordered: T[]; popularCount: number } {
  const withUsage = items.map(item => ({ item, u: usage(item) }))
  const popular = withUsage
    .filter(x => x.u > 0)
    .sort((a, b) => b.u - a.u || label(a.item).localeCompare(label(b.item)))
    .slice(0, topN)
    .map(x => x.item)
  const popularSet = new Set(popular)
  const rest = items.filter(item => !popularSet.has(item)).sort((a, b) => label(a).localeCompare(label(b)))
  return { ordered: [...popular, ...rest], popularCount: popular.length }
}

export interface Store {
  state: AppState
  // audit-aware mutators
  addTask: (t: Partial<Task> & { title: string }) => Task
  updateTask: (id: string, patch: Partial<Task>, auditLabel?: string) => void
  // Append a free-text note/update to a task's timeline. Recorded as a 'noted' audit event so the
  // full text shows in the task's History — a running log of what transpired, distinct from the
  // standing `notes` description edited in the form.
  noteTask: (id: string, text: string) => void
  completeTask: (id: string) => void
  dropTask: (id: string, reason: string) => void
  // Permanent removal (not archiving). Returns the removed task plus any of its subtasks, so the
  // caller can offer an Undo. Unlike complete/drop, a deleted task leaves the list entirely — this
  // is what clears out items that were only "dropped" and still lingered under Accomplished.
  deleteTask: (id: string) => Task[]
  reinsertTasks: (tasks: Task[]) => void
  snoozeTask: (id: string, days: number) => void
  calledFollowUp: (id: string) => void
  addPerson: (p: Partial<Person> & { name: string }) => Person
  updatePerson: (id: string, patch: Partial<Person>, auditLabel?: string) => void
  setBirthday: (personId: string, date: string | undefined) => void
  // Editable relationship tiers (Settings > Contacts). addTier appends a new tier; updateTier edits
  // one; deleteTier removes it and moves any contacts on it to a fallback tier so none are orphaned.
  addTier: (name: string) => void
  updateTier: (id: string, patch: Partial<TierDef>) => void
  deleteTier: (id: string) => void
  // `closeTaskIds` are the person's open call/follow-up tasks this touch resolves. Logging a
  // call used to update lastContact and clear the call flag but leave the task that prompted
  // the call sitting open forever — so the thing you just did still looked outstanding.
  logInteraction: (i: Omit<Interaction, 'id'>, opts?: { followUpTitle?: string; closeTaskIds?: string[] }) => void
  capture: (text: string, source: Capture['source']) => Capture
  // `trackerId` lets the Inbox redirect a pending capture to a different destination than
  // whatever the router guessed, regardless of its original proposal.kind: '' forces it to file
  // as a plain task (even if the router had proposed a tracker entry), any tracker id forces it
  // into that tracker/collection instead (even if the router had proposed a task) — this is the
  // manual safety net for whenever the keyword router doesn't recognize the tracker/collection a
  // message was really meant for. `title` optionally corrects the filed title before saving.
  acceptCapture: (id: string, overrides?: { areaId?: string; projectId?: string; categoryIds?: string[]; actionIds?: string[]; trackerId?: string; title?: string; due?: string }) => void
  dismissCapture: (id: string) => void
  addEntry: (trackerId: string, values: Entry['values']) => void
  updateEntry: (id: string, values: Entry['values']) => void
  // Multi-select actions in Collections. `patchEntries` merges a partial value map into every
  // listed entry (bulk "mark Watched", bulk rating, bulk set any single-choice field).
  patchEntries: (ids: string[], patch: Entry['values']) => void
  deleteEntries: (ids: string[]) => void
  addCategory: (c: Partial<Category> & { name: string }) => void
  updateCategory: (id: string, patch: Partial<Category>) => void
  // force=true deletes even if tasks/captures/subcategories still reference it — those
  // references are left pointing at a category that no longer exists (shown as blank/"—"
  // wherever the app looks it up) rather than being silently cleaned up. Default is the
  // safe path: refuse when anything is still using it.
  deleteCategory: (id: string, force?: boolean) => void
  addAction: (a: Partial<Action> & { name: string }) => Action
  updateAction: (id: string, patch: Partial<Action>) => void
  deleteAction: (id: string, force?: boolean) => void
  updateSettings: (patch: Partial<Settings>) => void
  updateFeatures: (patch: Partial<Settings['features']>) => void
  updateArea: (id: string, patch: Partial<AppState['areas'][0]>) => void
  addArea: (name: string) => void
  // Manual ordering for the Settings lists: nudge one item up/down (categories move only among
  // their own siblings), or sort a whole list A–Z at once.
  reorderArea: (id: string, dir: 'up' | 'down') => void
  reorderCategory: (id: string, dir: 'up' | 'down') => void
  reorderAction: (id: string, dir: 'up' | 'down') => void
  // Reorder a tracker within its collection. `dir` handles the up/down arrows; `targetId` handles a
  // drag-and-drop (move this tracker to just before that one). Only reorders within one collection.
  reorderTracker: (id: string, arg: 'up' | 'down' | { before: string }) => void
  sortAreasByName: () => void
  sortCategoriesByName: () => void
  sortActionsByName: () => void
  addProject: (p: Partial<AppState['projects'][0]> & { name: string; areaId: string }) => AppState['projects'][0]
  updateProject: (id: string, patch: Partial<AppState['projects'][0]>) => void
  /** Move every task on `fromId` to project `toId` (adopting its area), or clear the project link
   *  when `toId` is null. Used when a project is archived/removed so no task is left orphaned.
   *  Returns how many tasks were changed. */
  reassignProject: (fromId: string, toId: string | null) => number
  // Bulk import of projects (and the areas they live under) in one atomic update. Areas are
  // matched to existing ones by name (case-insensitive) and created when missing; projects are
  // merged into an existing same-name project in the same area rather than duplicated.
  importProjects: (rows: ImportProjectRow[]) => { areasCreated: number; projectsAdded: number; projectsMerged: number; newAreaNames: string[] }
  addAttachment: (taskId: string, attachment: TaskAttachment) => void
  removeAttachment: (taskId: string, attachmentId: string) => void
  addCollection: (c: Partial<Collection> & { name: string }) => Collection
  updateCollection: (id: string, patch: Partial<Collection>) => void
  addTracker: (t: Partial<Tracker> & { name: string; collectionId: string }) => Tracker
  updateTracker: (id: string, patch: Partial<Tracker>) => void
  inviteUser: (u: { name: string; email: string; role: AdminUser['role']; hasSample: boolean; hasReal: boolean }) => void
  updateAdminUser: (id: string, patch: Partial<AdminUser>, auditLabel?: string) => void
  removeAdminUser: (id: string, auditLabel?: string) => void
  logSuperAdmin: (action: string, detail: string) => void
}

// One row of a projects import — a project plus the name of the area it should live under. Extra
// source columns (owner, tool, type, system…) are folded into `notes` by the importer, since the
// Project model deliberately stays lean.
export interface ImportProjectRow {
  name: string
  areaName: string
  outcome?: string
  notes?: string
  status?: 'active' | 'on-hold' | 'done' | 'archived'
  priority?: Priority
  due?: string
}

// A small rotating palette for areas created during an import, so a batch of new areas doesn't all
// come out the same colour (unlike addArea's single default, which is fine for one-at-a-time adds).
const IMPORT_AREA_COLORS = [
  'hsl(152 26% 34%)', 'hsl(17 63% 47%)', 'hsl(210 45% 42%)', 'hsl(280 30% 45%)',
  'hsl(40 65% 42%)', 'hsl(340 45% 45%)', 'hsl(190 45% 38%)', 'hsl(95 35% 38%)',
]

const Ctx = createContext<Store | null>(null)

function baseAuditEvent(action: string, entity: string, entityId: string, detail: string, user = 'Craig'): AuditEvent {
  return { id: uid('au'), ts: new Date().toISOString().slice(0, 16).replace('T', 'T'), user, action, entity, entityId, detail }
}

// Move the item at `idx` one place up/down within its array; returns the array unchanged if the
// move would fall off either end. Used by the Settings reorder arrows.
function swapAdjacent<T>(arr: T[], idx: number, dir: 'up' | 'down'): T[] {
  if (idx < 0) return arr
  const j = idx + (dir === 'up' ? -1 : 1)
  if (j < 0 || j >= arr.length) return arr
  const next = [...arr]; const tmp = next[idx]; next[idx] = next[j]; next[j] = tmp
  return next
}

// ---------- The simulated AI router ----------
// Parse a "contact:" / "add contact …" capture into name + phone + email. Returns null if the
// message isn't a contact command at all, so it never hijacks a normal task. Keep this in sync
// with the identical copy in supabase/functions/telegram-inbound & slack-events (server can't
// import the client). Examples it handles:
//   "contact: David Feldman, 07700 900010, david@x.com"
//   "add contact David Feldman +44 7700 900010 david@x.com"
//   "add a new contact Rivka Stern"   (name only)
export function parseContactCapture(raw: string): { name: string; phone?: string; email?: string } | null {
  const m = raw.trim().match(/^\s*(?:contact\s*[:\-]|add\s+(?:a\s+)?(?:new\s+)?contact\b[:\-]?)\s*(.*)$/i)
  if (!m) return null
  let s = m[1].trim()
  if (!s) return null
  const email = s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]
  if (email) s = s.replace(email, ' ')
  const phone = s.match(/\+?\d[\d\s().-]{6,}\d/)?.[0]?.trim()
  if (phone) s = s.replace(phone, ' ')
  const name = s.replace(/[,;|]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!name) return null
  return { name, phone: phone || undefined, email: email || undefined }
}

export function routeCapture(text: string, state: AppState): RoutingProposal {
  const lower = text.toLowerCase().trim()
  const reasons: string[] = []

  // "contact:" / "add contact …" — create a new Person rather than a task. Checked up front so it
  // wins over the person-name matcher below (which is for attaching a call to an existing contact).
  const contact = parseContactCapture(text)
  if (contact) {
    return {
      kind: 'contact', taskType: 'todo', priority: 'P3',
      title: contact.name, contactPhone: contact.phone, contactEmail: contact.email,
      explanation: `new contact → People${contact.phone ? ` · ${contact.phone}` : ''}${contact.email ? ` · ${contact.email}` : ''}`,
    }
  }

  // explicit prefixes
  let kind: RoutingProposal['kind'] = 'task'
  let body = text.trim()
  if (lower.startsWith('t:')) { kind = 'task'; body = body.slice(2).trim(); reasons.push('prefix t: → task') }
  else if (lower.startsWith('c:')) { kind = 'call'; body = body.slice(2).trim(); reasons.push('prefix c: → call log') }
  else if (lower.startsWith('i:') || lower.startsWith('idea:')) { kind = 'idea'; body = body.replace(/^i(dea)?:/i, '').trim(); reasons.push('prefix → idea') }
  else if (lower.startsWith('n:') || lower.startsWith('note:')) { kind = 'note'; body = body.replace(/^n(ote)?:/i, '').trim(); reasons.push('prefix → note') }
  else if (lower.startsWith('?')) { kind = 'question'; body = body.slice(1).trim(); reasons.push('“?” → question for the assistant') }

  // explicit "n:"/"note:" prefix — files straight into the Notes tracker (Collections > Notes)
  // rather than becoming a task, if that tracker still exists (it's seeded by default, but
  // someone could rename or delete it, so this degrades to a generic note-kind task instead
  // of failing outright).
  if (kind === 'note') {
    const notesTracker = state.trackers.find(t => t.active && t.name.toLowerCase() === 'notes')
    if (notesTracker) {
      return {
        kind: 'entry', taskType: 'todo', trackerId: notesTracker.id, priority: 'P3',
        title: body || text.trim(),
        explanation: `“n:”/“note:” → ${notesTracker.name} tracker`,
      }
    }
  }

  // explicit "i:"/"idea:" prefix — files straight into the Ideas tracker (Collections > Ideas)
  // rather than becoming a P3 task under the old "New Ideas" focus area. Matched by name, same
  // reasoning as Notes above: if the tracker's been renamed or removed, this falls through to
  // the old area-tagged-task behavior further down instead of failing outright.
  if (kind === 'idea') {
    const ideasTracker = state.trackers.find(t => t.active && t.name.toLowerCase() === 'ideas')
    if (ideasTracker) {
      return {
        kind: 'entry', taskType: 'todo', trackerId: ideasTracker.id, priority: 'P3',
        title: body || text.trim(),
        explanation: `“i:”/“idea:” → ${ideasTracker.name} tracker`,
      }
    }
  }

  // person match
  const person = state.people.find(p => {
    const first = p.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
    return first.length > 2 && lower.includes(first)
  })
  if (person) reasons.push(`“${person.name.split(' ')[0]}” matched contact ${person.name}`)

  // call detection
  const isCall = kind === 'call' || /\b(call|phone|ring)\b/.test(lower)
  if (isCall && kind === 'task') { kind = 'call'; reasons.push('“call” → to-call task') }

  // tracker match — either explicit "add X to my movies list" phrasing, or any word (4+
  // letters, so "to"/"my" etc. never accidentally match) from a tracker's own name mentioned
  // alongside a jotting/listing verb. Word-based rather than "first 5 characters of the
  // tracker's name" so multi-word tracker names (e.g. "TV Shows") match on either word.
  const tracker = state.trackers.find(t => {
    if (!t.active) return false
    const words = t.name.toLowerCase().split(/\s+/).filter(w => w.length >= 4)
    return words.length ? words.some(w => new RegExp(`\\b${w}\\b`).test(lower)) : lower.includes(t.name.toLowerCase())
  })
  if (tracker && /\b(add|to my|list|watch|read|track)\b/.test(lower)) {
    const m = text.match(/add (.+?) to/i)
    return {
      kind: 'entry', taskType: 'todo', trackerId: tracker.id, priority: 'P3',
      title: m ? m[1] : body,
      explanation: `“${tracker.name.toLowerCase()}” → ${tracker.name} tracker`,
    }
  }

  // area match
  let areaId: string | undefined
  let projectId: string | undefined
  const areaKeywords: Record<string, string[]> = {
    a_shul: ['shul', 'dinner', 'shiur', 'daven', 'chesed', 'rabbi', 'minyan'],
    a_family: ['school', 'kids', 'home', 'house', 'boiler', 'family', 'mum', 'shop', 'car', 'insurance', 'bill'],
    a_work: ['client', 'invoice', 'work', 'acme', 'proposal', 'meeting', 'vat'],
    a_ideas: ['idea'],
  }
  for (const [aid, kws] of Object.entries(areaKeywords)) {
    const hit = kws.find(k => lower.includes(k))
    if (hit) { areaId = aid; reasons.push(`“${hit}” → ${state.areas.find(a => a.id === aid)?.name}`); break }
  }
  if (kind === 'idea') { areaId = 'a_ideas' }
  if (!areaId && person) {
    areaId = 'a_work'
  }

  // project match
  const project = state.projects.find(p => p.status === 'active' && p.name.toLowerCase().split(' ').some(w => w.length > 4 && lower.includes(w.toLowerCase())))
  if (project) { projectId = project.id; areaId = project.areaId; reasons.push(`matched project “${project.name}”`) }

  // category match — subcategories checked before their parent, so "insurance" lands on
  // Money › Insurance rather than the broader Money bucket
  let categoryIds: string[] | undefined
  const categoryKeywords: { id: string; kws: string[] }[] = [
    { id: 'c_money_ins', kws: ['insurance', 'policy'] },
    { id: 'c_money_bills', kws: ['bill', 'late fee', 'invoice'] },
    { id: 'c_chesed_hosp', kws: ['hospital'] },
    { id: 'c_admin', kws: ['admin', 'paperwork', 'proposal', 'vat', 'form'] },
    { id: 'c_home', kws: ['boiler', 'garden', 'plumber', 'repair', 'maintenance', 'house'] },
    { id: 'c_events', kws: ['dinner', 'party', 'event', 'invitation', 'rsvp', 'seating'] },
    { id: 'c_chesed', kws: ['chesed', 'visit'] },
    { id: 'c_money', kws: ['money', 'payment', 'expense', 'pay '] },
  ]
  for (const { id, kws } of categoryKeywords) {
    const cat = state.categories.find(c => c.id === id && c.active)
    if (!cat) continue
    const hit = kws.find(k => lower.includes(k))
    if (hit) { categoryIds = [cat.id]; reasons.push(`“${hit}” → ${cat.level > 0 ? cat.name : cat.name} category`); break }
  }

  // action match — what kind of action this task is (Call, Errand, Follow-up, ...)
  let actionIds: string[] | undefined
  const actionKeywords: { id: string; kws: string[] }[] = [
    { id: 'a_call', kws: ['call', 'phone', 'ring'] },
    { id: 'a_errand', kws: ['errand', 'pick up', 'pickup', 'buy', 'shop', 'shopping', 'drop off'] },
    { id: 'a_followup', kws: ['follow up', 'follow-up', 'circle back', 'chase'] },
    { id: 'a_email', kws: ['email', 'reply to', 'send the'] },
    { id: 'a_meeting', kws: ['meeting', 'meet up', 'sit down'] },
  ]
  for (const { id, kws } of actionKeywords) {
    const act = state.actions.find(a => a.id === id && a.active)
    if (!act) continue
    const hit = kws.find(k => lower.includes(k))
    if (hit) { actionIds = [act.id]; reasons.push(`“${hit}” → ${act.name} action`); break }
  }

  // date extraction
  let due: string | undefined
  let priority: Priority = 'P2'
  if (/\b(today|urgent|now|asap)\b/.test(lower)) { due = today(); priority = 'P0'; reasons.push('“today/urgent” → P0, due today') }
  else if (/\btomorrow\b/.test(lower)) { due = addDays(today(), 1); priority = 'P1'; reasons.push('“tomorrow” → due tomorrow') }
  else if (/\bthis week\b/.test(lower)) { due = addDays(today(), 4); priority = 'P1'; reasons.push('“this week” → P1') }
  else if (/\bthursday\b/.test(lower)) { const d = new Date(); const delta = (4 - d.getDay() + 7) % 7 || 7; due = addDays(today(), delta); reasons.push('“Thursday” → next Thursday') }
  if (kind === 'idea') priority = 'P3'

  const title = body.charAt(0).toUpperCase() + body.slice(1)
  return {
    kind, taskType: isCall ? 'call' : kind === 'idea' ? 'todo' : 'todo',
    areaId, projectId, personId: person?.id, categoryIds, actionIds, priority, due, title,
    explanation: reasons.length ? reasons.join(' · ') : 'No strong match — left in the inbox for a quick confirm',
  }
}

export function StoreProvider({ children, initial, onChange, fetchLatest, userName, subscribeRemote }: { children: React.ReactNode; initial?: () => AppState; onChange?: (s: AppState) => void; fetchLatest?: () => Promise<AppState | null>; userName?: string; subscribeRemote?: (apply: (next: AppState) => void) => () => void }) {
  const [state, setState] = useState<AppState>(initial ?? seedState)
  const first = React.useRef(true)
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange
  React.useEffect(() => {
    if (first.current) { first.current = false; return }
    onChangeRef.current?.(state)
  }, [state])

  // ---- Remote changes ---------------------------------------------------------------------------
  // Another device (or another tab) saved. cloud.tsx has already merged their work with ours —
  // record-by-record, so nothing of either side is lost — and hands us the result to display.
  // Applying it here is what makes two screens on the same account agree without a reload.
  React.useEffect(() => {
    if (!subscribeRemote) return
    return subscribeRemote(next => setState(next))
  }, [subscribeRemote])

  // ---- Live capture sync ------------------------------------------------------------------------
  // The app loads its state once and then owns it in memory, saving back on change. That means a
  // capture written server-side by a webhook (Telegram / Slack / SMS → the *-inbound Edge Functions)
  // never appears until a full reload — and worse, this tab's next autosave would overwrite it. So
  // we periodically re-read the persisted state and merge in ONLY captures whose id we've never seen
  // locally, appended at the front. We never remove or alter anything else, so unsaved local edits
  // are safe; and because a dismissed/handled capture's id stays in `seenCaptureIds`, it's never
  // resurrected. Runs on tab focus / becoming visible, plus a gentle poll while visible.
  const fetchLatestRef = React.useRef(fetchLatest)
  fetchLatestRef.current = fetchLatest
  const seenCaptureIds = React.useRef<Set<string>>(new Set((initial ? initial() : seedState()).captures?.map(c => c.id) ?? []))
  // Keep the seen-set current with whatever's in state now (covers dismissed ones too, so they
  // don't come back on the next sync).
  React.useEffect(() => { for (const c of state.captures ?? []) seenCaptureIds.current.add(c.id) }, [state.captures])

  React.useEffect(() => {
    if (!fetchLatestRef.current) return
    let cancelled = false
    const syncCaptures = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const latest = await fetchLatestRef.current?.().catch(() => null)
      if (cancelled || !latest?.captures?.length) return
      const fresh = latest.captures.filter(c => c && c.id && !seenCaptureIds.current.has(c.id))
      if (!fresh.length) return
      for (const c of fresh) seenCaptureIds.current.add(c.id)
      setState(s => ({ ...s, captures: [...fresh, ...(s.captures ?? [])] }))
    }
    const onVisible = () => { if (document.visibilityState === 'visible') syncCaptures() }
    window.addEventListener('focus', syncCaptures)
    document.addEventListener('visibilitychange', onVisible)
    const iv = setInterval(syncCaptures, 45000)
    syncCaptures() // catch anything that arrived before this tab opened
    return () => { cancelled = true; window.removeEventListener('focus', syncCaptures); document.removeEventListener('visibilitychange', onVisible); clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const store = useMemo<Store>(() => {
    const apply = (fn: Updater) => setState(s => fn(s))
    // Attributes an action to whoever is actually signed in, instead of a hardcoded name —
    // explicit callers (e.g. 'Super-admin', 'AI router') still override this.
    const auditEvent = (action: string, entity: string, entityId: string, detail: string, user?: string) =>
      baseAuditEvent(action, entity, entityId, detail, user ?? userName ?? 'Craig')
    const withAudit = (fn: Updater, ev: AuditEvent) => apply(s => {
      const next = fn(s)
      return { ...next, audit: [ev, ...next.audit] }
    })

    return {
      state,
      addTask(t) {
        const task: Task = {
          id: uid('t'), title: t.title, type: t.type ?? 'todo', areaId: t.areaId, projectId: t.projectId,
          parentId: t.parentId, personId: t.personId, vendorId: t.vendorId, categoryIds: t.categoryIds ?? [],
          actionIds: t.actionIds,
          priority: t.priority ?? 'P2', status: t.status ?? 'next', due: t.due, followUp: t.followUp,
          source: t.source ?? 'manual', notes: t.notes, estMinutes: t.estMinutes, startTime: t.startTime, callAbout: t.callAbout, waitingOn: t.waitingOn,
          // If a task is created already in "waiting" status (e.g. from an import) stamp when the
          // wait started, so "days waiting" is a real number instead of an unknown-date sentinel.
          waitingSince: t.waitingSince ?? (t.status === 'waiting' ? today() : undefined),
          created: today(),
        }
        withAudit(s => ({ ...s, tasks: [...s.tasks, task] }), auditEvent('created', 'task', task.id, task.title))
        return task
      },
      updateTask(id, patch, auditLabel) {
        withAudit(
          s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, ...patch } : t) }),
          auditEvent('updated', 'task', id, auditLabel ?? Object.keys(patch).join(', ') + ' changed'),
        )
      },
      noteTask(id, text) {
        const t = text.trim()
        if (!t) return
        // No field change — the value of a note is the timeline entry itself. withAudit still
        // returns a fresh top-level state object, so the panel re-renders and the note appears.
        withAudit(s => s, auditEvent('noted', 'task', id, t))
      },
      completeTask(id) {
        withAudit(
          s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, status: 'done' as TaskStatus, completedAt: today() } : t) }),
          auditEvent('completed', 'task', id, (state.tasks.find(t => t.id === id)?.title ?? '') + ' → Done (archived, never deleted)'),
        )
      },
      dropTask(id, reason) {
        withAudit(
          s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, status: 'dropped' as TaskStatus, droppedReason: reason, completedAt: today() } : t) }),
          auditEvent('dropped', 'task', id, reason),
        )
      },
      deleteTask(id) {
        const target = state.tasks.find(t => t.id === id)
        const removed = state.tasks.filter(t => t.id === id || t.parentId === id)
        withAudit(
          s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id && t.parentId !== id) }),
          auditEvent('deleted', 'task', id, `${target?.title ?? 'task'} permanently deleted${removed.length > 1 ? ` (with ${removed.length - 1} subtask${removed.length - 1 === 1 ? '' : 's'})` : ''}`),
        )
        return removed
      },
      reinsertTasks(tasks) {
        if (!tasks.length) return
        withAudit(
          s => ({ ...s, tasks: [...s.tasks, ...tasks.filter(t => !s.tasks.some(x => x.id === t.id))] }),
          auditEvent('restored', 'task', tasks[0].id, `restored ${tasks.length} task${tasks.length === 1 ? '' : 's'} from delete`),
        )
      },
      snoozeTask(id, days) {
        const d = addDays(today(), days)
        withAudit(
          s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, due: d } : t) }),
          auditEvent('snoozed', 'task', id, `deferred to ${d}`),
        )
      },
      calledFollowUp(id) {
        const t = state.tasks.find(x => x.id === id)
        if (!t) return
        const fu: Task = {
          id: uid('t'), title: `Follow up: ${t.title.replace(/^Call /i, '')}`, type: 'followup',
          areaId: t.areaId, projectId: t.projectId, personId: t.personId, categoryIds: [],
          actionIds: ['a_followup'],
          priority: 'P1', status: 'next', due: addDays(today(), state.settings.followUpDays),
          source: 'manual', created: today(),
        }
        withAudit(
          s => ({
            ...s,
            tasks: [...s.tasks.map(x => x.id === id ? { ...x, status: 'done' as TaskStatus, completedAt: today() } : x), fu],
            people: t.personId ? s.people.map(p => p.id === t.personId ? { ...p, lastContact: today() } : p) : s.people,
          }),
          auditEvent('called', 'task', id, `logged call, auto-created follow-up due in ${state.settings.followUpDays} days`),
        )
      },
      addPerson(p) {
        const person: Person = {
          id: uid('p'), name: p.name, phone: p.phone, email: p.email, tier: p.tier ?? 'network',
          how: p.how ?? '', topics: p.topics ?? '', vip: p.vip ?? false, flaggedForCall: false, notes: p.notes,
          // Carry through the optional fields callers actually pass (bulk import sets these) —
          // previously dropped, so an imported custom cadence or birthday was silently lost.
          cadenceDays: p.cadenceDays, birthday: p.birthday,
        }
        withAudit(s => ({ ...s, people: [...s.people, person] }), auditEvent('created', 'person', person.id, person.name))
        return person
      },
      updatePerson(id, patch, auditLabel) {
        withAudit(
          s => ({ ...s, people: s.people.map(p => p.id === id ? { ...p, ...patch } : p) }),
          auditEvent('updated', 'person', id, auditLabel ?? Object.keys(patch).join(', ') + ' changed'),
        )
      },
      // Set (or clear, with date=undefined) a person's birthday AND keep a matching recurring
      // entry in the Dates to Remember tracker in sync — created/updated/removed in the same
      // atomic state update. The mirrored entry carries a hidden `personId` value (not a tracker
      // column, so it never shows in the table) so we can find and update the right one later.
      setBirthday(personId, date) {
        withAudit(s => {
          const person = s.people.find(p => p.id === personId)
          if (!person) return s
          const people = s.people.map(p => p.id === personId ? { ...p, birthday: date || undefined } : p)
          const datesTracker = s.trackers.find(t => t.active && (t.id === 'trk_dates' || t.name.trim().toLowerCase() === 'dates to remember'))
          let entries = s.entries
          if (datesTracker) {
            const existing = entries.find(e => e.trackerId === datesTracker.id && e.values.personId === personId)
            const label = `${person.name}’s birthday`
            if (date) {
              if (existing) {
                entries = entries.map(e => e.id === existing.id ? { ...e, values: { ...e.values, name: label, date, recurring: true, type: 'Birthday' } } : e)
              } else {
                entries = [...entries, { id: uid('e'), trackerId: datesTracker.id, created: today(), values: { name: label, date, recurring: true, type: 'Birthday', personId } }]
              }
            } else if (existing) {
              entries = entries.filter(e => e.id !== existing.id)
            }
          }
          return { ...s, people, entries }
        }, auditEvent('updated', 'person', personId, date ? 'birthday set' : 'birthday cleared'))
      },
      addTier(name) {
        const palette = ['hsl(280 35% 55%)', 'hsl(28 65% 50%)', 'hsl(175 40% 40%)', 'hsl(330 42% 55%)', 'hsl(200 45% 45%)', 'hsl(120 30% 42%)']
        withAudit(s => {
          const tiers = resolveTiers(s.settings)
          const id = uid('tier')
          const color = palette[tiers.length % palette.length]
          const next: TierDef = { id, name: name.trim() || `Tier ${tiers.length + 1}`, color, cadenceDays: 30 }
          return { ...s, settings: { ...s.settings, tiers: [...tiers, next] } }
        }, auditEvent('created', 'user', 'tier', `tier “${name}” added`, 'Craig'))
      },
      updateTier(id, patch) {
        withAudit(s => {
          const tiers = resolveTiers(s.settings).map(t => t.id === id ? { ...t, ...patch } : t)
          return { ...s, settings: { ...s.settings, tiers } }
        }, auditEvent('updated', 'user', 'tier', `tier ${id} edited`, 'Craig'))
      },
      deleteTier(id) {
        withAudit(s => {
          const tiers = resolveTiers(s.settings)
          if (tiers.length <= 1) return s // never delete the last tier
          const remaining = tiers.filter(t => t.id !== id)
          const fallback = remaining[0].id
          // Move any contacts on the deleted tier to the first remaining tier, so nobody is orphaned.
          const people = s.people.map(p => p.tier === id ? { ...p, tier: fallback } : p)
          return { ...s, people, settings: { ...s.settings, tiers: remaining } }
        }, auditEvent('deleted', 'user', 'tier', `tier ${id} deleted — contacts moved to the first tier`, 'Craig'))
      },
      logInteraction(i, opts) {
        const inter: Interaction = { ...i, id: uid('i') }
        const followTask: Task | null = i.followUpDate ? {
          id: uid('t'), title: opts?.followUpTitle || `Follow up with ${state.people.find(p => p.id === i.personId)?.name ?? 'contact'}`,
          type: 'followup', personId: i.personId, categoryIds: [], actionIds: ['a_followup'], priority: 'P1', status: 'next',
          due: i.followUpDate, source: 'manual', created: today(),
        } : null
        const closeIds = new Set(opts?.closeTaskIds ?? [])
        const closedTitles = state.tasks.filter(t => closeIds.has(t.id)).map(t => t.title)
        withAudit(
          s => ({
            ...s,
            interactions: [inter, ...s.interactions],
            people: s.people.map(p => p.id === i.personId ? { ...p, lastContact: i.date, flaggedForCall: false } : p),
            tasks: [
              // the call happened, so the tasks that asked for it are done
              ...s.tasks.map(t =>
                closeIds.has(t.id) ? { ...t, status: 'done' as const, completedAt: i.date } : t,
              ),
              ...(followTask ? [followTask] : []),
            ],
          }),
          auditEvent(
            'logged ' + i.channel,
            'person',
            i.personId,
            [
              `${i.purpose} · ${i.sentiment}`,
              closedTitles.length ? `closed: ${closedTitles.join(', ')}` : '',
              followTask ? 'follow-up task created' : '',
            ].filter(Boolean).join(' · '),
          ),
        )
      },
      capture(text, source) {
        const proposal = routeCapture(text, state)
        const cap: Capture = { id: uid('cap'), text, source, created: today(), proposal, status: 'pending' }
        withAudit(s => ({ ...s, captures: [cap, ...s.captures] }), auditEvent('captured', 'inbox', cap.id, `${source}: “${text}”`, source === 'manual' ? 'Craig' : 'AI router'))
        return cap
      },
      acceptCapture(id, overrides) {
        const cap = state.captures.find(c => c.id === id)
        if (!cap) return
        const p = cap.proposal
        const areaId = overrides?.areaId ?? p.areaId
        const projectId = overrides?.projectId ?? p.projectId
        const categoryIds = overrides?.categoryIds ?? p.categoryIds ?? []
        const actionIds = overrides?.actionIds ?? p.actionIds
        const title = overrides?.title?.trim() || p.title
        // Due date set on the Inbox card wins over the router's guess; '' explicitly clears it.
        const due = overrides?.due !== undefined ? (overrides.due || undefined) : p.due
        // A manual "File as" override always wins over the router's guess — '' means "file as a
        // task no matter what the router thought", any tracker id means "file into this
        // tracker/collection no matter what the router thought". Only when no override was
        // given at all do we fall back to the router's own proposal.
        const trackerId = overrides?.trackerId !== undefined
          ? (overrides.trackerId || undefined)
          : (p.kind === 'entry' ? p.trackerId : undefined)
        // A "contact" capture creates a real Person (unless the user redirected it via File-as,
        // in which case the tracker/task path below takes over). Title = the name; phone/email
        // ride along on the proposal. Defaults to the 'network' tier — editable on the card after.
        if (p.kind === 'contact' && overrides?.trackerId === undefined) {
          const person: Person = {
            id: uid('p'), name: title, phone: p.contactPhone, email: p.contactEmail,
            tier: 'network', how: '', topics: '', vip: false, flaggedForCall: false,
          }
          withAudit(
            s => ({ ...s, people: [...s.people, person], captures: s.captures.map(c => c.id === id ? { ...c, status: 'accepted' as const } : c) }),
            auditEvent('created', 'person', person.id, `${person.name} (from ${cap.source} capture)`),
          )
          return
        }
        if (trackerId) {
          const trk = state.trackers.find(t => t.id === trackerId)
          const titleCol = trk?.columns.find(c => c.isTitle)?.key ?? 'name'
          const statusCol = trk?.columns.find(c => c.type === 'status')
          const entry: Entry = { id: uid('e'), trackerId, created: today(), values: { [titleCol]: title, ...(statusCol ? { [statusCol.key]: statusCol.options?.[0] ?? '' } : {}) } }
          withAudit(
            s => ({ ...s, entries: [...s.entries, entry], captures: s.captures.map(c => c.id === id ? { ...c, status: 'accepted' as const } : c) }),
            auditEvent('filed', 'entry', entry.id, `${title} → ${trk?.name}${overrides?.trackerId !== undefined ? ' (manually redirected)' : ''}`, overrides?.trackerId !== undefined ? 'Craig' : 'AI router'),
          )
          return
        }
        const task: Task = {
          id: uid('t'), title, type: p.taskType, areaId, projectId,
          personId: p.personId, categoryIds, actionIds, priority: p.priority, status: 'next', due,
          source: cap.source, created: today(),
        }
        withAudit(
          s => ({ ...s, tasks: [...s.tasks, task], captures: s.captures.map(c => c.id === id ? { ...c, status: 'accepted' as const } : c) }),
          auditEvent('filed', 'task', task.id, `${title} → ${state.areas.find(a => a.id === areaId)?.name ?? 'no area'}`, 'AI router'),
        )
      },
      dismissCapture(id) {
        withAudit(
          s => ({ ...s, captures: s.captures.map(c => c.id === id ? { ...c, status: 'dismissed' as const } : c) }),
          auditEvent('dismissed', 'inbox', id, 'capture archived'),
        )
      },
      addEntry(trackerId, values) {
        const e: Entry = { id: uid('e'), trackerId, values, created: today() }
        withAudit(s => ({ ...s, entries: [...s.entries, e] }), auditEvent('created', 'entry', e.id, String(Object.values(values)[0] ?? '')))
      },
      updateEntry(id, values) {
        withAudit(
          s => ({ ...s, entries: s.entries.map(e => e.id === id ? { ...e, values: { ...e.values, ...values } } : e) }),
          auditEvent('updated', 'entry', id, Object.keys(values).join(', ') + ' changed'),
        )
      },
      /**
       * Multi-select bulk edit. One audit line for the whole action rather than one per entry —
       * "12 entries → Watched" is what happened; twelve identical lines is noise.
       */
      patchEntries(ids, patch) {
        if (!ids.length) return
        const set = new Set(ids)
        const tracker = state.trackers.find(t => t.id === state.entries.find(e => set.has(e.id))?.trackerId)
        withAudit(
          s => ({
            ...s,
            entries: s.entries.map(e => (set.has(e.id) ? { ...e, values: { ...e.values, ...patch } } : e)),
          }),
          auditEvent(
            'updated',
            'entry',
            ids[0],
            `${ids.length} ${ids.length === 1 ? 'entry' : 'entries'} in ${tracker?.name ?? 'a tracker'} — ${Object.entries(patch).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}`,
          ),
        )
      },
      deleteEntries(ids) {
        if (!ids.length) return
        const set = new Set(ids)
        const going = state.entries.filter(e => set.has(e.id))
        const tracker = state.trackers.find(t => t.id === going[0]?.trackerId)
        const titleKey = tracker?.columns.find(c => c.isTitle)?.key
        const names = going
          .map(e => (titleKey ? String(e.values[titleKey] ?? '') : ''))
          .filter(Boolean)
          .slice(0, 5)
        withAudit(
          s => ({ ...s, entries: s.entries.filter(e => !set.has(e.id)) }),
          auditEvent(
            'deleted',
            'entry',
            ids[0],
            `${ids.length} from ${tracker?.name ?? 'a tracker'}${names.length ? ` — ${names.join(', ')}${going.length > names.length ? '…' : ''}` : ''}`,
          ),
        )
      },
      addCategory(c) {
        // Auto-assign a colour (cycling the shared palette) so a new category shows a dot right
        // away, matching Focus areas — the caller can still pass an explicit colour to override.
        const cat: Category = { id: uid('c'), name: c.name, parentId: c.parentId, level: (c.level ?? 0) as 0 | 1 | 2, active: true, color: c.color ?? nextDot(state.categories.length) }
        withAudit(s => ({ ...s, categories: [...s.categories, cat] }), auditEvent('created', 'category', cat.id, cat.name))
      },
      updateCategory(id, patch) {
        withAudit(
          s => ({ ...s, categories: s.categories.map(c => c.id === id ? { ...c, ...patch } : c) }),
          auditEvent('updated', 'category', id, Object.keys(patch).join(', ') + ' changed'),
        )
      },
      deleteCategory(id, force) {
        const cat = state.categories.find(c => c.id === id)
        if (!cat) return
        const usage = categoryUsage(state, id)
        if (!force && usage > 0) return // never silently orphan a task, capture, or subcategory
        withAudit(
          s => ({ ...s, categories: s.categories.filter(c => c.id !== id) }),
          auditEvent(
            'deleted', 'category', id,
            usage > 0 ? `${cat.name} force-deleted while in use ×${usage} — those tasks/captures were left referencing a category that no longer exists` : `${cat.name} permanently deleted — never used`,
          ),
        )
      },
      addAction(a) {
        // Auto-assign a colour (cycling the palette) so new actions get a dot like categories.
        const act: Action = { id: uid('a'), name: a.name, active: true, color: a.color ?? nextDot(state.actions.length) }
        withAudit(s => ({ ...s, actions: [...s.actions, act] }), auditEvent('created', 'action', act.id, act.name))
        return act
      },
      updateAction(id, patch) {
        withAudit(
          s => ({ ...s, actions: s.actions.map(a => a.id === id ? { ...a, ...patch } : a) }),
          auditEvent('updated', 'action', id, Object.keys(patch).join(', ') + ' changed'),
        )
      },
      deleteAction(id, force) {
        const act = state.actions.find(a => a.id === id)
        if (!act) return
        const usage = actionUsage(state, id)
        if (!force && usage > 0) return // never silently orphan a task or capture
        withAudit(
          s => ({ ...s, actions: s.actions.filter(a => a.id !== id) }),
          auditEvent(
            'deleted', 'action', id,
            usage > 0 ? `${act.name} force-deleted while in use ×${usage} — those tasks/captures were left referencing an action that no longer exists` : `${act.name} permanently deleted — never used`,
          ),
        )
      },
      updateSettings(patch) {
        withAudit(s => ({ ...s, settings: { ...s.settings, ...patch } }), auditEvent('settings', 'settings', 'settings', Object.keys(patch).join(', ') + ' changed'))
      },
      updateFeatures(patch) {
        withAudit(
          s => ({ ...s, settings: { ...s.settings, features: { ...s.settings.features, ...patch } } }),
          auditEvent('settings', 'settings', 'features', Object.entries(patch).map(([k, v]) => `${k} ${v ? 'on' : 'off'}`).join(', ')),
        )
      },
      updateArea(id, patch) {
        withAudit(s => ({ ...s, areas: s.areas.map(a => a.id === id ? { ...a, ...patch } : a) }), auditEvent('updated', 'area', id, Object.keys(patch).join(', ') + ' changed'))
      },
      addArea(name) {
        const a = { id: uid('a'), name, description: '', color: 'hsl(200 30% 40%)', sort: state.areas.length, active: true, inBrief: true, reviewDay: 'Sunday' }
        withAudit(s => ({ ...s, areas: [...s.areas, a] }), auditEvent('created', 'area', a.id, name))
      },
      // ---- Manual ordering for Settings lists (display follows array order) ----
      reorderArea(id, dir) {
        withAudit(s => ({ ...s, areas: swapAdjacent(s.areas, s.areas.findIndex(a => a.id === id), dir) }), auditEvent('reordered', 'area', id, `moved ${dir}`))
      },
      reorderAction(id, dir) {
        withAudit(s => ({ ...s, actions: swapAdjacent(s.actions, s.actions.findIndex(a => a.id === id), dir) }), auditEvent('reordered', 'action', id, `moved ${dir}`))
      },
      reorderCategory(id, dir) {
        withAudit(s => {
          const cat = s.categories.find(c => c.id === id)
          if (!cat) return s
          // move only among siblings (same parent) so the grouped display stays coherent
          const siblings = s.categories.filter(c => (c.parentId ?? null) === (cat.parentId ?? null))
          const si = siblings.findIndex(c => c.id === id)
          const target = siblings[si + (dir === 'up' ? -1 : 1)]
          if (!target) return s
          const i = s.categories.findIndex(c => c.id === id)
          const j = s.categories.findIndex(c => c.id === target.id)
          const next = [...s.categories]; const tmp = next[i]; next[i] = next[j]; next[j] = tmp
          return { ...s, categories: next }
        }, auditEvent('reordered', 'category', id, `moved ${dir}`))
      },
      sortAreasByName() {
        withAudit(s => ({ ...s, areas: [...s.areas].sort((a, b) => a.name.localeCompare(b.name)) }), auditEvent('reordered', 'area', 'all', 'sorted A–Z'))
      },
      sortActionsByName() {
        withAudit(s => ({ ...s, actions: [...s.actions].sort((a, b) => a.name.localeCompare(b.name)) }), auditEvent('reordered', 'action', 'all', 'sorted A–Z'))
      },
      sortCategoriesByName() {
        withAudit(s => {
          // depth-first: top-level A–Z, each parent immediately followed by its children A–Z
          const ordered: typeof s.categories = []
          const pushTree = (parentId: string | null) => {
            for (const c of s.categories.filter(x => (x.parentId ?? null) === parentId).sort((a, b) => a.name.localeCompare(b.name))) {
              ordered.push(c); pushTree(c.id)
            }
          }
          pushTree(null)
          return { ...s, categories: ordered }
        }, auditEvent('reordered', 'category', 'all', 'sorted A–Z'))
      },
      addProject(p) {
        const proj = { id: uid('pr'), areaId: p.areaId, name: p.name, outcome: p.outcome ?? '', status: p.status ?? 'active' as const, priority: p.priority ?? 'P2' as Priority, due: p.due, notes: p.notes, lastActivity: today() }
        withAudit(s => ({ ...s, projects: [...s.projects, proj] }), auditEvent('created', 'project', proj.id, p.name))
        return proj
      },
      updateProject(id, patch) {
        withAudit(s => ({ ...s, projects: s.projects.map(pr => pr.id === id ? { ...pr, ...patch, lastActivity: today() } : pr) }), auditEvent('updated', 'project', id, Object.keys(patch).join(', ') + ' changed'))
      },
      reassignProject(fromId, toId) {
        const affected = state.tasks.filter(t => t.projectId === fromId)
        if (!affected.length) return 0
        const from = state.projects.find(p => p.id === fromId)
        const to = toId ? state.projects.find(p => p.id === toId) : null
        withAudit(
          s => ({
            ...s,
            tasks: s.tasks.map(t => t.projectId === fromId
              ? { ...t, projectId: to ? to.id : undefined, areaId: to ? to.areaId : t.areaId }
              : t),
          }),
          auditEvent('updated', 'project', fromId, to
            ? `moved ${affected.length} task${affected.length === 1 ? '' : 's'} from ${from?.name ?? 'project'} → ${to.name}`
            : `cleared project link from ${affected.length} task${affected.length === 1 ? '' : 's'} (was ${from?.name ?? 'project'})`),
        )
        return affected.length
      },
      importProjects(rows) {
        const user = userName ?? 'Craig'
        let areasCreated = 0, projectsAdded = 0, projectsMerged = 0
        const newAreaNames: string[] = []
        apply(s => {
          const areas = [...s.areas]
          const projects = [...s.projects]
          const audit = [...s.audit]
          const findArea = (name: string) => areas.find(a => a.name.trim().toLowerCase() === name.trim().toLowerCase())
          for (const r of rows) {
            const areaName = (r.areaName || 'Imported').trim()
            let area = findArea(areaName)
            if (!area) {
              area = {
                id: uid('a'), name: areaName, description: '',
                color: IMPORT_AREA_COLORS[areas.length % IMPORT_AREA_COLORS.length],
                sort: areas.length, active: true, inBrief: true, reviewDay: 'Sunday',
              }
              areas.push(area)
              areasCreated++; newAreaNames.push(areaName)
              audit.unshift(baseAuditEvent('created', 'area', area.id, `${areaName} (from import)`, user))
            }
            const key = r.name.trim().toLowerCase()
            const existing = projects.find(p => p.areaId === area!.id && p.name.trim().toLowerCase() === key)
            if (existing) {
              const idx = projects.indexOf(existing)
              projects[idx] = {
                ...existing,
                outcome: r.outcome || existing.outcome,
                notes: r.notes ?? existing.notes,
                status: r.status ?? existing.status,
                priority: r.priority ?? existing.priority,
                due: r.due ?? existing.due,
                lastActivity: today(),
              }
              projectsMerged++
              audit.unshift(baseAuditEvent('updated', 'project', existing.id, `“${r.name}” merged from import`, user))
            } else {
              const proj = {
                id: uid('pr'), areaId: area.id, name: r.name.trim(),
                outcome: r.outcome ?? '', status: r.status ?? ('active' as const),
                priority: r.priority ?? ('P2' as Priority), due: r.due, notes: r.notes,
                lastActivity: today(),
              }
              projects.push(proj)
              projectsAdded++
              audit.unshift(baseAuditEvent('created', 'project', proj.id, `${r.name} → ${area.name} (import)`, user))
            }
          }
          return { ...s, areas, projects, audit }
        })
        return { areasCreated, projectsAdded, projectsMerged, newAreaNames }
      },
      addAttachment(taskId, attachment) {
        const t = state.tasks.find(x => x.id === taskId)
        withAudit(
          s => ({ ...s, tasks: s.tasks.map(x => x.id === taskId ? { ...x, attachments: [...(x.attachments ?? []), attachment] } : x) }),
          auditEvent('attached', 'task', taskId, `${attachment.name} attached${t ? ` to “${t.title}”` : ''}`),
        )
      },
      removeAttachment(taskId, attachmentId) {
        const t = state.tasks.find(x => x.id === taskId)
        const att = t?.attachments?.find(a => a.id === attachmentId)
        withAudit(
          s => ({ ...s, tasks: s.tasks.map(x => x.id === taskId ? { ...x, attachments: (x.attachments ?? []).filter(a => a.id !== attachmentId) } : x) }),
          auditEvent('removed attachment', 'task', taskId, `${att?.name ?? 'file'} removed${t ? ` from “${t.title}”` : ''}`),
        )
      },
      addCollection(c) {
        const col: Collection = { id: uid('col'), name: c.name, description: c.description ?? '', color: c.color ?? 'hsl(200 30% 40%)', active: true }
        withAudit(s => ({ ...s, collections: [...s.collections, col] }), auditEvent('created', 'collection', col.id, col.name))
        return col
      },
      updateCollection(id, patch) {
        withAudit(s => ({ ...s, collections: s.collections.map(c => c.id === id ? { ...c, ...patch } : c) }), auditEvent('updated', 'collection', id, Object.keys(patch).join(', ') + ' changed'))
      },
      addTracker(t) {
        const trk: Tracker = {
          id: uid('trk'), collectionId: t.collectionId, name: t.name, description: t.description ?? '',
          columns: t.columns ?? [{ key: 'name', name: 'Name', type: 'text', isTitle: true, required: true }],
          defaultView: t.defaultView ?? 'table', active: true,
        }
        withAudit(s => ({ ...s, trackers: [...s.trackers, trk] }), auditEvent('created', 'tracker', trk.id, trk.name))
        return trk
      },
      reorderTracker(id, arg) {
        withAudit(s => {
          const moving = s.trackers.find(t => t.id === id)
          if (!moving) return s
          // Work within the moving tracker's collection only; other collections stay untouched.
          const siblings = s.trackers.filter(t => t.collectionId === moving.collectionId)
          const others = s.trackers.filter(t => t.collectionId !== moving.collectionId)
          const from = siblings.findIndex(t => t.id === id)
          let to: number
          if (arg === 'up') to = from - 1
          else if (arg === 'down') to = from + 1
          else { const t = siblings.findIndex(x => x.id === arg.before); to = t < 0 ? from : (t > from ? t - 1 : t) }
          if (to < 0 || to >= siblings.length || to === from) return s
          const next = [...siblings]
          next.splice(to, 0, next.splice(from, 1)[0])
          // Rebuild the flat trackers array preserving the (unchanged) relative order of others.
          return { ...s, trackers: [...others, ...next] }
        }, auditEvent('reordered', 'tracker', id, 'moved'))
      },
      updateTracker(id, patch) {
        withAudit(s => ({ ...s, trackers: s.trackers.map(t => t.id === id ? { ...t, ...patch } : t) }), auditEvent('updated', 'tracker', id, Object.keys(patch).join(', ') + ' changed'))
      },
      inviteUser(u) {
        const nu: AdminUser = { id: uid('u'), name: u.name, email: u.email, role: u.role, status: 'invited', hasSample: u.hasSample, hasReal: u.hasReal }
        withAudit(
          s => ({ ...s, adminUsers: [...s.adminUsers, nu] }),
          auditEvent('invited', 'user', nu.id, `${u.name} <${u.email}> · role ${u.role} · ${[u.hasReal && 'real account', u.hasSample && 'sample account'].filter(Boolean).join(' + ')}`, 'Super-admin'),
        )
      },
      updateAdminUser(id, patch, auditLabel) {
        withAudit(
          s => ({ ...s, adminUsers: s.adminUsers.map(u => u.id === id ? { ...u, ...patch } : u) }),
          auditEvent('updated', 'user', id, auditLabel ?? Object.keys(patch).join(', ') + ' changed', 'Super-admin'),
        )
      },
      removeAdminUser(id, auditLabel) {
        const target = state.adminUsers.find(u => u.id === id)
        withAudit(
          s => ({ ...s, adminUsers: s.adminUsers.filter(u => u.id !== id) }),
          auditEvent('deleted', 'user', id, auditLabel ?? `${target?.name ?? 'user'} removed`, 'Super-admin'),
        )
      },
      logSuperAdmin(action, detail) {
        apply(s => ({ ...s, audit: [auditEvent(action, 'super-admin', 'sa', detail, 'Super-admin'), ...s.audit] }))
      },
    }
  }, [state, userName])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}

// ---------- Derived selectors ----------

export function openTasks(s: AppState): Task[] {
  return s.tasks.filter(t => t.status !== 'done' && t.status !== 'dropped' && t.status !== 'inbox')
}

export function isOverdue(t: Task): boolean {
  return !!t.due && daysSince(t.due) > 0 && t.status !== 'done' && t.status !== 'dropped'
}

export function dueToday(t: Task): boolean {
  return !!t.due && t.due === today()
}

export function subtasksOf(s: AppState, parentId: string): Task[] {
  return s.tasks.filter(t => t.parentId === parentId)
}

export function rollup(s: AppState, parentId: string) {
  const kids = subtasksOf(s, parentId)
  return {
    total: kids.length,
    done: kids.filter(k => k.status === 'done').length,
    open: kids.filter(k => k.status !== 'done' && k.status !== 'dropped').length,
    overdue: kids.filter(isOverdue).length,
  }
}

export interface CallSuggestion {
  person: Person
  reason: string
  kind: 'overdue' | 'followup' | 'flagged' | 'reconnect'
}

export function buildCallList(s: AppState): CallSuggestion[] {
  const out: CallSuggestion[] = []
  const seen = new Set<string>()
  const add = (p: Person, reason: string, kind: CallSuggestion['kind']) => {
    if (seen.has(p.id)) return
    seen.add(p.id)
    out.push({ person: p, reason, kind })
  }
  // follow-ups due today or earlier
  for (const t of s.tasks) {
    if (t.status !== 'done' && t.status !== 'dropped' && t.personId && (t.type === 'call' || t.type === 'followup') && t.due && daysSince(t.due) >= 0) {
      const p = s.people.find(x => x.id === t.personId)
      if (p) add(p, t.type === 'call' ? `Open call: ${t.callAbout ?? t.title}` : `You promised to circle back — “${t.title}”`, 'followup')
    }
  }
  // flagged
  for (const p of s.people) if (p.flaggedForCall) add(p, 'You flagged them “call this week”', 'flagged')
  // overdue for cadence, worst first
  const over = s.people
    .filter(p => p.tier !== 'dormant' && personOverdueBy(p, s.settings) > 0)
    .sort((a, b) => personOverdueBy(b, s.settings) - personOverdueBy(a, s.settings))
  for (const p of over) add(p, `${daysSince(p.lastContact)} days since contact — ${tierLabel(s.settings, p.tier)} tier target is every ${personCadence(p, s.settings)}`, 'overdue')
  // one dormant reconnect — only among dormant contacts you've actually spoken to before (a
  // never-contacted contact has no "since you spoke" to count from).
  const dorm = s.people.filter(p => p.tier === 'dormant' && p.lastContact).sort((a, b) => daysSince(b.lastContact) - daysSince(a.lastContact))[0]
  if (dorm) add(dorm, `Reconnect — ${daysSince(dorm.lastContact)} days since you spoke`, 'reconnect')
  return out
}

const PRIORITY_ORDER: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

// Plain-text versions of the Morning Brief / midday check-in, for the "Send now" buttons in
// Settings > Telegram & Slack — same underlying data as the scheduled push (see the
// send-scheduled-digest Edge Function), computed client-side so pressing the button is instant
// rather than waiting for the next cron tick. Kept in plain text (not HTML) since this same
// string goes to whichever of Telegram/Slack is connected via send-message, and Slack doesn't
// understand HTML tags.
export function composeMorningBriefText(s: AppState): string {
  const t = today()
  const open = s.tasks.filter(x => x.status !== 'done' && x.status !== 'dropped')
  const dueToday = open.filter(x => x.due === t).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  const overdue = open.filter(x => x.due && x.due < t)
  const calls = buildCallList(s).slice(0, s.settings.callGoal)
  const lines = [`Good morning. Here's today (${dueToday.length} of ${s.settings.dailyCapacity} capacity${dueToday.length > s.settings.dailyCapacity ? ' — over' : ''}):`]
  if (dueToday.length) {
    lines.push('', 'Top of the list:')
    dueToday.slice(0, 3).forEach((x, i) => lines.push(`${i + 1}. ${x.title}`))
  } else {
    lines.push('', 'Nothing due today — a rare quiet morning.')
  }
  if (overdue.length) lines.push('', `${overdue.length} overdue task${overdue.length === 1 ? '' : 's'} waiting.`)
  if (calls.length) lines.push('', `Calls: ${calls.map(c => c.person.name).join(', ')}`)
  return lines.join('\n')
}

export function composeLunchCheckinText(s: AppState): string {
  const t = today()
  const dueToday = s.tasks.filter(x => x.due === t && x.status !== 'dropped')
  const done = dueToday.filter(x => x.status === 'done').length
  const open = dueToday.filter(x => x.status !== 'done').length
  const calls = buildCallList(s).slice(0, s.settings.callGoal)
  const lines = [`Midday check-in: ${done} done, ${open} still open for today.`]
  if (calls.length) lines.push(`${calls.length} call${calls.length === 1 ? '' : 's'} still on your list: ${calls.map(c => c.person.name).join(', ')}`)
  else lines.push('No calls left on today’s list.')
  return lines.join('\n')
}

export function callsMadeOn(s: AppState, date: string): number {
  return s.interactions.filter(i => i.date === date && (i.channel === 'call' || i.channel === 'whatsapp')).length
}

export function stalledProjects(s: AppState) {
  return s.projects.filter(p => p.status === 'active' && daysSince(p.lastActivity) >= s.settings.stallDays)
}
