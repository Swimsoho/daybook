// ---------- Core data model (Section 3 of the spec) ----------

export type Priority = 'P0' | 'P1' | 'P2' | 'P3'
export type TaskStatus = 'inbox' | 'next' | 'in-progress' | 'waiting' | 'done' | 'dropped'
export type TaskType = 'todo' | 'call' | 'followup'
export type Tier = 'inner' | 'active' | 'network' | 'dormant'
export type Channel = 'call' | 'whatsapp' | 'email' | 'in-person'
export type Sentiment = 'positive' | 'neutral' | 'needs-attention'
export type Source = 'whatsapp' | 'sms' | 'email' | 'voice' | 'manual'

export interface Area {
  id: string
  name: string
  description: string
  color: string // hsl string
  sort: number
  active: boolean
  inBrief: boolean
  reviewDay: string
}

export interface Project {
  id: string
  areaId: string
  name: string
  outcome: string
  status: 'active' | 'on-hold' | 'done' | 'archived'
  priority: Priority
  due?: string // ISO date
  notes?: string
  lastActivity: string // ISO date, for stall detection
}

export interface Task {
  id: string
  title: string
  type: TaskType
  areaId?: string
  projectId?: string
  parentId?: string
  personId?: string
  vendorId?: string
  categoryIds: string[]
  priority: Priority
  status: TaskStatus
  due?: string
  followUp?: string
  source: Source
  notes?: string
  callAbout?: string
  waitingOn?: string
  waitingSince?: string
  created: string
  completedAt?: string
  droppedReason?: string
}

export interface Person {
  id: string
  name: string
  phone?: string
  email?: string
  tier: Tier
  how: string
  topics: string
  cadenceDays?: number // overrides tier default
  lastContact?: string
  vip: boolean
  flaggedForCall: boolean
  notes?: string
}

export interface Interaction {
  id: string
  date: string
  personId: string
  channel: Channel
  purpose: string
  outcome: string
  sentiment: Sentiment
  followUpDate?: string
}

export interface Category {
  id: string
  name: string
  parentId?: string
  level: 0 | 1 | 2
  color?: string
  active: boolean
}

export interface Vendor {
  id: string
  name: string
  category: string
  phone?: string
  email?: string
  notes?: string
  rating?: number
}

// ---------- Notes & Collections (Section 7) ----------

export type ColumnType =
  | 'text' | 'longtext' | 'number' | 'currency' | 'date'
  | 'select' | 'multiselect' | 'checkbox' | 'rating' | 'url' | 'status'

export interface TrackerColumn {
  key: string
  name: string
  type: ColumnType
  options?: string[] // for select / multiselect / status stages
  isTitle?: boolean
  required?: boolean
  showWhen?: { columnKey: string; equals: string } // conditional column
}

export interface Collection {
  id: string
  name: string
  description: string
  color: string
  active: boolean
}

export interface Tracker {
  id: string
  collectionId: string
  name: string
  description: string
  columns: TrackerColumn[]
  defaultView: 'table' | 'board' | 'gallery'
  active: boolean
}

export interface Entry {
  id: string
  trackerId: string
  values: Record<string, string | number | boolean | string[]>
  created: string
}

// ---------- Capture inbox ----------

export interface Capture {
  id: string
  text: string
  source: Source
  created: string
  proposal: RoutingProposal
  status: 'pending' | 'accepted' | 'dismissed'
}

export interface RoutingProposal {
  kind: 'task' | 'call' | 'idea' | 'note' | 'entry' | 'question'
  taskType: TaskType
  areaId?: string
  projectId?: string
  personId?: string
  trackerId?: string
  categoryIds?: string[]
  priority: Priority
  due?: string
  title: string
  explanation: string
}

// ---------- Audit trail ----------

export interface AuditEvent {
  id: string
  ts: string
  user: string
  action: string
  entity: string
  entityId: string
  detail: string
}

// ---------- Multi-user / admin (Section 16) ----------

export type Role = 'owner' | 'member' | 'view-only'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  status: 'active' | 'invited' | 'suspended'
  lastActive?: string
  hasSample: boolean
  hasReal: boolean
  isSuperAdmin?: boolean
}

// ---------- Settings ----------

export type PriorityScheme = 'p' | 'hml' | 'num'

export interface Settings {
  priorityScheme: PriorityScheme
  eisenhower: boolean
  dailyCapacity: number
  callGoal: number
  followUpDays: number
  briefChannel: 'whatsapp' | 'email'
  briefTime: string
  stallDays: number
  projectWipLimit: number
  tierCadence: Record<Tier, number>
  quickActions: { done: boolean; called: boolean; snooze: boolean; reassign: boolean }
  features: {
    whatsapp: boolean
    emailForward: boolean
    gmail: boolean
    outlook: boolean
    sms: boolean
    slack: boolean
    teams: boolean
    voiceNotes: boolean
    calendar: boolean
    collections: boolean
    morningBrief: boolean
  }
}

export interface AppState {
  areas: Area[]
  projects: Project[]
  tasks: Task[]
  people: Person[]
  interactions: Interaction[]
  categories: Category[]
  vendors: Vendor[]
  collections: Collection[]
  trackers: Tracker[]
  entries: Entry[]
  captures: Capture[]
  audit: AuditEvent[]
  settings: Settings
  adminUsers: AdminUser[]
}

// ---------- Helpers ----------

export const DAY = 86400000

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
export function today(): string {
  return iso(new Date())
}
export function addDays(base: string | Date, n: number): string {
  const d = typeof base === 'string' ? new Date(base + 'T12:00:00') : new Date(base)
  return iso(new Date(d.getTime() + n * DAY))
}
export function daysAgo(n: number): string {
  return addDays(new Date(), -n)
}
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / DAY)
}
export function daysSince(d?: string): number {
  if (!d) return 9999
  return daysBetween(d, today())
}
export function fmtDate(d?: string): string {
  if (!d) return '—'
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
export function fmtDateLong(d?: string): string {
  if (!d) return '—'
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
export function relDue(d?: string): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' | 'none' } {
  if (!d) return { label: 'no date', tone: 'none' }
  const n = daysBetween(today(), d)
  if (n < 0) return { label: `${-n}d overdue`, tone: 'overdue' }
  if (n === 0) return { label: 'today', tone: 'today' }
  if (n === 1) return { label: 'tomorrow', tone: 'soon' }
  if (n <= 7) return { label: `in ${n}d`, tone: 'soon' }
  return { label: fmtDate(d), tone: 'later' }
}

let idCounter = 0
export function uid(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

export const PRIORITY_LABELS: Record<PriorityScheme, Record<Priority, string>> = {
  p: { P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3' },
  hml: { P0: 'Urgent', P1: 'High', P2: 'Medium', P3: 'Low' },
  num: { P0: '1', P1: '2', P2: '3', P3: '4' },
}

export const PRIORITY_DESC: Record<Priority, string> = {
  P0: 'Do today',
  P1: 'This week',
  P2: 'This month',
  P3: 'Someday',
}

export const TIER_LABELS: Record<Tier, string> = {
  inner: 'Inner',
  active: 'Active',
  network: 'Network',
  dormant: 'Dormant',
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  'inbox': 'Inbox',
  'next': 'Next',
  'in-progress': 'In progress',
  'waiting': 'Waiting on',
  'done': 'Done',
  'dropped': 'Dropped',
}

export const TYPE_LABELS: Record<TaskType, string> = {
  todo: 'To-do',
  call: 'To-call',
  followup: 'Follow-up',
}

export function personCadence(p: Person, s: Settings): number {
  return p.cadenceDays ?? s.tierCadence[p.tier]
}

export function personOverdueBy(p: Person, s: Settings): number {
  return daysSince(p.lastContact) - personCadence(p, s)
}
