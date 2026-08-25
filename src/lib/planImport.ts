import type { Priority, TaskStatus } from './model'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTING A PLAN INTO A PROJECT
 * ─────────────────────────────────────────────────────────────────────────────
 * Phases give a project a shape, but typing forty rows in to get one is not a
 * feature, it's a chore. Most plans already exist somewhere — a tracker, a
 * spreadsheet, a table in a doc — with the same handful of columns every time:
 * an id, the task, a status, an owner, a priority, a target date, which block it
 * belongs to, and what it's waiting on.
 *
 * This module turns any of those into phases and tasks. It is deliberately
 * forgiving about headers and deliberately strict about what it invents: a
 * column it can't identify is left for the person to map, never guessed at.
 */

export type PlanField = 'ref' | 'title' | 'notes' | 'status' | 'owner' | 'priority' | 'due' | 'phase' | 'blockedBy'

export type PlanMapping = Record<PlanField, number>

export const EMPTY_MAPPING: PlanMapping = {
  ref: -1, title: -1, notes: -1, status: -1, owner: -1, priority: -1, due: -1, phase: -1, blockedBy: -1,
}

/**
 * Header synonyms, most specific first — 'target date' has to beat 'date', and
 * 'blocked by' has to beat 'by', or a column gets claimed by the wrong field.
 */
const SYNONYMS: Record<PlanField, string[]> = {
  ref: ['id', 'ref', 'key', 'code', '#'],
  title: ['task', 'title', 'name', 'item', 'summary', 'work', 'deliverable', 'action'],
  notes: ['description', 'detail', 'details', 'notes', 'note', 'comment', 'context'],
  status: ['status', 'state', 'progress'],
  owner: ['owner', 'assignee', 'assigned to', 'assigned', 'responsible', 'who', 'lead'],
  priority: ['priority', 'prio', 'importance', 'p'],
  due: ['target date', 'target', 'due date', 'due', 'deadline', 'when', 'date'],
  phase: ['phase', 'milestone', 'group', 'section', 'stage', 'workstream', 'sprint', 'epic', 'category'],
  blockedBy: ['waiting on', 'blocked by', 'blocker', 'blockers', 'depends on', 'dependency', 'dependencies', 'predecessor'],
}

const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, ' ').trim()

/**
 * Guess which column is which.
 *
 * Scored rather than first-match: an exact header wins over a substring, so a
 * sheet with both "Task" and "Task owner" doesn't hand the owner column to
 * `title`. A field with no plausible column stays -1 and the person maps it.
 */
export function detectPlanColumns(header: string[]): PlanMapping {
  const cells = header.map(norm)
  const mapping = { ...EMPTY_MAPPING }
  const taken = new Set<number>()

  for (const field of Object.keys(SYNONYMS) as PlanField[]) {
    let best = -1
    let bestScore = 0
    cells.forEach((cell, i) => {
      if (!cell || taken.has(i)) return
      for (const syn of SYNONYMS[field]) {
        const score = cell === syn ? 3 : cell.startsWith(syn) ? 2 : cell.includes(syn) ? 1 : 0
        if (score > bestScore) { bestScore = score; best = i }
      }
    })
    if (best !== -1) { mapping[field] = best; taken.add(best) }
  }

  // A sheet with no recognisable title column is still usable — the first column
  // that nothing else claimed is almost always the task itself.
  if (mapping.title === -1) {
    const free = cells.findIndex((_, i) => !taken.has(i))
    if (free !== -1) mapping.title = free
  }
  return mapping
}

/**
 * Statuses out in the world are prose, not enums. Anything unrecognised becomes
 * 'next' — an imported task landing in the normal queue is recoverable, whereas
 * guessing 'done' would quietly hide real work.
 */
export function normaliseStatus(raw: string): TaskStatus {
  const s = norm(raw)
  if (!s) return 'next'
  // Negations first. "Not started" contains "started", and "not done" contains
  // "done" — match either positively and a whole plan imports as work already
  // underway or already finished, which is the worst possible wrong answer.
  if (/\bnot\s+(yet\s+)?(started|begun|done|complete\w*)\b|^(to ?do|todo|new|open|next|planned|upcoming|not started)$/.test(s)) return 'next'
  if (/(^|\b)(done|complete|completed|finished|shipped|closed)\b/.test(s)) return 'done'
  if (/(dropped|cancel|cancelled|canceled|won'?t do|abandoned)/.test(s)) return 'dropped'
  if (/(in progress|in-progress|doing|started|active|wip|ongoing)/.test(s)) return 'in-progress'
  if (/(blocked|waiting|on hold|hold|paused|stuck)/.test(s)) return 'waiting'
  if (/(inbox|triage|unsorted|backlog)/.test(s)) return 'inbox'
  return 'next'
}

export function normalisePriority(raw: string): Priority {
  const s = norm(raw)
  const direct = s.match(/\bp([0-3])\b/)
  if (direct) return `P${direct[1]}` as Priority
  if (/(critical|urgent|highest|blocker)/.test(s)) return 'P0'
  if (/\bhigh\b/.test(s)) return 'P1'
  if (/(medium|normal|med)/.test(s)) return 'P2'
  if (/(low|minor|someday|nice to have)/.test(s)) return 'P3'
  return 'P2'
}

/**
 * Dates arrive as ISO, US or UK. Only ISO is unambiguous, so anything else is
 * accepted only when the day is over 12 (making the order provable) or the
 * format is explicitly named. A date we can't be sure about is dropped rather
 * than silently filed three months out.
 */
export function normaliseDate(raw: string): string | undefined {
  const s = raw.trim()
  if (!s) return undefined
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const slash = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (slash) {
    const [, a, b, y] = slash
    // mm/dd/yyyy unless the first number can't be a month
    const [m, d] = Number(a) > 12 ? [b, a] : [a, b]
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10)
}

export interface PlanTask {
  ref?: string
  title: string
  notes?: string
  status: TaskStatus
  owner?: string
  priority: Priority
  due?: string
  phase?: string
  /** refs as written in the source, resolved to task ids at import time */
  blockedByRefs: string[]
}

export interface Plan {
  /** in first-seen order, which is the order the source listed them */
  phases: string[]
  tasks: PlanTask[]
}

/** Splits "F1, P2" / "F1; P2" / "F1 and P2" into refs. */
function splitRefs(raw: string): string[] {
  return raw
    .replace(/waiting on|blocked by|depends on/gi, '')
    .split(/[,;/|]|\band\b|\+/)
    .map(s => s.trim())
    .filter(Boolean)
}

export function buildPlan(rows: string[][], mapping: PlanMapping, hasHeader = true): Plan {
  const body = hasHeader ? rows.slice(1) : rows
  const at = (row: string[], col: number) => (col === -1 ? '' : (row[col] ?? '').toString().trim())

  const phases: string[] = []
  const tasks: PlanTask[] = []

  for (const row of body) {
    const title = at(row, mapping.title)
    // A row with no title is a spacer, a total, or the template's own instruction
    // line. Importing it would create a nameless task nobody can find.
    if (!title) continue

    const phase = at(row, mapping.phase)
    if (phase && !phases.includes(phase)) phases.push(phase)

    tasks.push({
      ref: at(row, mapping.ref) || undefined,
      title,
      notes: at(row, mapping.notes) || undefined,
      status: normaliseStatus(at(row, mapping.status)),
      owner: at(row, mapping.owner) || undefined,
      priority: normalisePriority(at(row, mapping.priority)),
      due: normaliseDate(at(row, mapping.due)),
      phase: phase || undefined,
      blockedByRefs: splitRefs(at(row, mapping.blockedBy)),
    })
  }

  return { phases, tasks }
}

/**
 * Parse pasted text.
 *
 * Copying a table out of a web page or a spreadsheet gives tab-separated rows;
 * a saved export gives commas. Sniffing beats asking — the first line decides,
 * and tabs win when both appear, because a comma inside a pasted cell is far
 * commoner than a stray tab.
 */
export function parsePastedGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() !== '')
  if (!lines.length) return []
  const delimiter = lines[0].includes('\t') ? '\t' : ','
  return lines.map(line => (delimiter === '\t' ? line.split('\t') : splitCsvLine(line)).map(c => c.trim()))
}

/** One CSV line, respecting quotes and doubled escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else quoted = false
      } else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
