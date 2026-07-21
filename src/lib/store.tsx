import React, { createContext, useContext, useMemo, useState } from 'react'
import {
  AdminUser, AppState, AuditEvent, Capture, Category, Entry, Interaction, Person, Priority,
  RoutingProposal, Settings, Task, TaskStatus, addDays, personOverdueBy,
  daysSince, today, uid,
} from './model'
import { seedState } from './seed'

type Updater = (s: AppState) => AppState

export interface Store {
  state: AppState
  // audit-aware mutators
  addTask: (t: Partial<Task> & { title: string }) => Task
  updateTask: (id: string, patch: Partial<Task>, auditLabel?: string) => void
  completeTask: (id: string) => void
  dropTask: (id: string, reason: string) => void
  snoozeTask: (id: string, days: number) => void
  calledFollowUp: (id: string) => void
  addPerson: (p: Partial<Person> & { name: string }) => Person
  updatePerson: (id: string, patch: Partial<Person>, auditLabel?: string) => void
  logInteraction: (i: Omit<Interaction, 'id'>, opts?: { followUpTitle?: string }) => void
  capture: (text: string, source: Capture['source']) => Capture
  acceptCapture: (id: string) => void
  dismissCapture: (id: string) => void
  addEntry: (trackerId: string, values: Entry['values']) => void
  updateEntry: (id: string, values: Entry['values']) => void
  addCategory: (c: Partial<Category> & { name: string }) => void
  updateSettings: (patch: Partial<Settings>) => void
  updateFeatures: (patch: Partial<Settings['features']>) => void
  updateArea: (id: string, patch: Partial<AppState['areas'][0]>) => void
  addArea: (name: string) => void
  addProject: (p: Partial<AppState['projects'][0]> & { name: string; areaId: string }) => void
  updateProject: (id: string, patch: Partial<AppState['projects'][0]>) => void
  inviteUser: (u: { name: string; email: string; role: AdminUser['role']; hasSample: boolean; hasReal: boolean }) => void
  updateAdminUser: (id: string, patch: Partial<AdminUser>, auditLabel?: string) => void
  removeAdminUser: (id: string, auditLabel?: string) => void
  logSuperAdmin: (action: string, detail: string) => void
}

const Ctx = createContext<Store | null>(null)

function baseAuditEvent(action: string, entity: string, entityId: string, detail: string, user = 'Craig'): AuditEvent {
  return { id: uid('au'), ts: new Date().toISOString().slice(0, 16).replace('T', 'T'), user, action, entity, entityId, detail }
}

// ---------- The simulated AI router ----------
export function routeCapture(text: string, state: AppState): RoutingProposal {
  const lower = text.toLowerCase().trim()
  const reasons: string[] = []

  // explicit prefixes
  let kind: RoutingProposal['kind'] = 'task'
  let body = text.trim()
  if (lower.startsWith('t:')) { kind = 'task'; body = body.slice(2).trim(); reasons.push('prefix t: → task') }
  else if (lower.startsWith('c:')) { kind = 'call'; body = body.slice(2).trim(); reasons.push('prefix c: → call log') }
  else if (lower.startsWith('i:') || lower.startsWith('idea:')) { kind = 'idea'; body = body.replace(/^i(dea)?:/i, '').trim(); reasons.push('prefix → idea') }
  else if (lower.startsWith('?')) { kind = 'question'; body = body.slice(1).trim(); reasons.push('“?” → question for the assistant') }

  // person match
  const person = state.people.find(p => {
    const first = p.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
    return first.length > 2 && lower.includes(first)
  })
  if (person) reasons.push(`“${person.name.split(' ')[0]}” matched contact ${person.name}`)

  // call detection
  const isCall = kind === 'call' || /\b(call|phone|ring)\b/.test(lower)
  if (isCall && kind === 'task') { kind = 'call'; reasons.push('“call” → to-call task') }

  // tracker match ("add X to my movies list")
  const tracker = state.trackers.find(t => lower.includes(t.name.toLowerCase().slice(0, 5)))
  if (tracker && /\b(add|to my|list|watch|read)\b/.test(lower)) {
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
    areaId, projectId, personId: person?.id, priority, due, title,
    explanation: reasons.length ? reasons.join(' · ') : 'No strong match — left in the inbox for a quick confirm',
  }
}

export function StoreProvider({ children, initial, onChange, userName }: { children: React.ReactNode; initial?: () => AppState; onChange?: (s: AppState) => void; userName?: string }) {
  const [state, setState] = useState<AppState>(initial ?? seedState)
  const first = React.useRef(true)
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange
  React.useEffect(() => {
    if (first.current) { first.current = false; return }
    onChangeRef.current?.(state)
  }, [state])

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
          priority: t.priority ?? 'P2', status: t.status ?? 'next', due: t.due, followUp: t.followUp,
          source: t.source ?? 'manual', notes: t.notes, callAbout: t.callAbout, waitingOn: t.waitingOn,
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
          areaId: t.areaId, projectId: t.projectId, personId: t.personId, categoryIds: ['c_followup'],
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
      logInteraction(i, opts) {
        const inter: Interaction = { ...i, id: uid('i') }
        const followTask: Task | null = i.followUpDate ? {
          id: uid('t'), title: opts?.followUpTitle || `Follow up with ${state.people.find(p => p.id === i.personId)?.name ?? 'contact'}`,
          type: 'followup', personId: i.personId, categoryIds: ['c_followup'], priority: 'P1', status: 'next',
          due: i.followUpDate, source: 'manual', created: today(),
        } : null
        withAudit(
          s => ({
            ...s,
            interactions: [inter, ...s.interactions],
            people: s.people.map(p => p.id === i.personId ? { ...p, lastContact: i.date, flaggedForCall: false } : p),
            tasks: followTask ? [...s.tasks, followTask] : s.tasks,
          }),
          auditEvent('logged ' + i.channel, 'person', i.personId, `${i.purpose} · ${i.sentiment}${followTask ? ' · follow-up task created' : ''}`),
        )
      },
      capture(text, source) {
        const proposal = routeCapture(text, state)
        const cap: Capture = { id: uid('cap'), text, source, created: today(), proposal, status: 'pending' }
        withAudit(s => ({ ...s, captures: [cap, ...s.captures] }), auditEvent('captured', 'inbox', cap.id, `${source}: “${text}”`, source === 'manual' ? 'Craig' : 'AI router'))
        return cap
      },
      acceptCapture(id) {
        const cap = state.captures.find(c => c.id === id)
        if (!cap) return
        const p = cap.proposal
        if (p.kind === 'entry' && p.trackerId) {
          const trk = state.trackers.find(t => t.id === p.trackerId)
          const titleCol = trk?.columns.find(c => c.isTitle)?.key ?? 'name'
          const statusCol = trk?.columns.find(c => c.type === 'status')
          const entry: Entry = { id: uid('e'), trackerId: p.trackerId, created: today(), values: { [titleCol]: p.title, ...(statusCol ? { [statusCol.key]: statusCol.options?.[0] ?? '' } : {}) } }
          withAudit(
            s => ({ ...s, entries: [...s.entries, entry], captures: s.captures.map(c => c.id === id ? { ...c, status: 'accepted' as const } : c) }),
            auditEvent('filed', 'entry', entry.id, `${p.title} → ${trk?.name}`, 'AI router'),
          )
          return
        }
        const task: Task = {
          id: uid('t'), title: p.title, type: p.taskType, areaId: p.areaId, projectId: p.projectId,
          personId: p.personId, categoryIds: [], priority: p.priority, status: 'next', due: p.due,
          source: cap.source, created: today(),
        }
        withAudit(
          s => ({ ...s, tasks: [...s.tasks, task], captures: s.captures.map(c => c.id === id ? { ...c, status: 'accepted' as const } : c) }),
          auditEvent('filed', 'task', task.id, `${p.title} → ${state.areas.find(a => a.id === p.areaId)?.name ?? 'no area'}`, 'AI router'),
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
      addCategory(c) {
        const cat: Category = { id: uid('c'), name: c.name, parentId: c.parentId, level: (c.level ?? 0) as 0 | 1 | 2, active: true, color: c.color }
        withAudit(s => ({ ...s, categories: [...s.categories, cat] }), auditEvent('created', 'category', cat.id, cat.name))
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
      addProject(p) {
        const proj = { id: uid('pr'), areaId: p.areaId, name: p.name, outcome: p.outcome ?? '', status: p.status ?? 'active' as const, priority: p.priority ?? 'P2' as Priority, due: p.due, notes: p.notes, lastActivity: today() }
        withAudit(s => ({ ...s, projects: [...s.projects, proj] }), auditEvent('created', 'project', proj.id, p.name))
      },
      updateProject(id, patch) {
        withAudit(s => ({ ...s, projects: s.projects.map(pr => pr.id === id ? { ...pr, ...patch, lastActivity: today() } : pr) }), auditEvent('updated', 'project', id, Object.keys(patch).join(', ') + ' changed'))
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
  for (const p of over) add(p, `${daysSince(p.lastContact)} days since contact — ${p.tier} tier target is every ${p.cadenceDays ?? s.settings.tierCadence[p.tier]}`, 'overdue')
  // one dormant reconnect
  const dorm = s.people.filter(p => p.tier === 'dormant').sort((a, b) => daysSince(b.lastContact) - daysSince(a.lastContact))[0]
  if (dorm) add(dorm, `Reconnect — ${daysSince(dorm.lastContact)} days since you spoke`, 'reconnect')
  return out
}

export function callsMadeOn(s: AppState, date: string): number {
  return s.interactions.filter(i => i.date === date && (i.channel === 'call' || i.channel === 'whatsapp')).length
}

export function stalledProjects(s: AppState) {
  return s.projects.filter(p => p.status === 'active' && daysSince(p.lastActivity) >= s.settings.stallDays)
}
