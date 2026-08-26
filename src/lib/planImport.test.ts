import { describe, expect, it } from 'vitest'
import {
  buildPlan, detectPlanColumns, normaliseDate, normalisePriority, normaliseStatus, parsePastedGrid,
} from './planImport'

/**
 * An importer that guesses wrong is worse than one that asks, because a wrong
 * guess arrives as forty mis-filed tasks. These tests are mostly about the cases
 * where a plausible-looking guess would be the wrong one.
 */

describe('detecting columns', () => {
  it('reads a typical execution-tracker header', () => {
    const m = detectPlanColumns(['ID', 'TASK', 'STATUS', 'OWNER', 'PRIORITY', 'TARGET', 'PHASE', 'NOTES'])
    expect(m).toMatchObject({ ref: 0, title: 1, status: 2, owner: 3, priority: 4, due: 5, phase: 6, notes: 7 })
  })

  it('prefers an exact header over a substring match', () => {
    // 'Task owner' contains 'task'. Handing it to `title` would put people's names
    // in the task column and lose every real title.
    const m = detectPlanColumns(['Task owner', 'Task'])
    expect(m.title).toBe(1)
    expect(m.owner).toBe(0)
  })

  it('never assigns one column to two fields', () => {
    const m = detectPlanColumns(['Item', 'Status', 'Due date'])
    const used = [m.ref, m.title, m.notes, m.status, m.owner, m.priority, m.due, m.phase, m.blockedBy].filter(i => i !== -1)
    expect(new Set(used).size).toBe(used.length)
  })

  it('falls back to the first free column for the title', () => {
    const m = detectPlanColumns(['Thing', 'Status'])
    expect(m.title).toBe(0)
  })

  it('leaves a field unmapped rather than inventing one', () => {
    const m = detectPlanColumns(['Task', 'Status'])
    expect(m.phase).toBe(-1)
    expect(m.owner).toBe(-1)
  })
})

describe('normalising statuses', () => {
  it('maps the words people actually use', () => {
    expect(normaliseStatus('Not started')).toBe('next')
    expect(normaliseStatus('In progress')).toBe('in-progress')
    expect(normaliseStatus('Done')).toBe('done')
    expect(normaliseStatus('Blocked')).toBe('waiting')
    expect(normaliseStatus("Won't do")).toBe('dropped')
  })

  it('does not read a negation as its own opposite', () => {
    // "Not started" contains "started"; "not done" contains "done". Matching those
    // positively imported an entire untouched plan as already underway or already
    // finished — the worst wrong answer available.
    expect(normaliseStatus('Not started')).toBe('next')
    expect(normaliseStatus('not yet started')).toBe('next')
    expect(normaliseStatus('Not done')).toBe('next')
    expect(normaliseStatus('not complete')).toBe('next')
  })

  it('falls back to open, never to done', () => {
    // Guessing 'done' hides real work. Guessing 'next' at worst adds a row to the
    // queue, which you'll see and can fix.
    expect(normaliseStatus('¯\\_(ツ)_/¯')).toBe('next')
    expect(normaliseStatus('')).toBe('next')
  })
})

describe('normalising priorities', () => {
  it('takes P-codes and words', () => {
    expect(normalisePriority('P1')).toBe('P1')
    expect(normalisePriority('High')).toBe('P1')
    expect(normalisePriority('critical')).toBe('P0')
    expect(normalisePriority('Low')).toBe('P3')
    expect(normalisePriority('')).toBe('P2')
  })
})

describe('normalising dates', () => {
  it('takes ISO as written', () => {
    expect(normaliseDate('2026-03-14')).toBe('2026-03-14')
  })

  it('resolves an ambiguous slash date by which number cannot be a month', () => {
    expect(normaliseDate('13/04/2026')).toBe('2026-04-13') // 13 can't be a month
    expect(normaliseDate('04/13/2026')).toBe('2026-04-13')
  })

  it('drops a date it cannot read rather than inventing one', () => {
    expect(normaliseDate('soon')).toBeUndefined()
    expect(normaliseDate('')).toBeUndefined()
  })
})

describe('building a plan', () => {
  const header = ['ID', 'Task', 'Status', 'Owner', 'Priority', 'Target', 'Phase', 'Waiting on']
  const rows = [
    header,
    ['B1', 'Book the hall', 'Not started', 'Craig', 'P1', '2026-03-01', 'Booked', ''],
    ['B2', 'Agree the budget', 'Not started', '', 'P1', '', 'Booked', ''],
    ['B3', 'Confirm the caterer', 'Not started', '', 'P1', '', 'Booked', 'B2'],
    ['G1', 'Send the invitations', 'In progress', 'Craig', 'P1', '', 'Guests', 'B3'],
    ['G3', 'Draw up the seating plan', 'Not started', '', 'P1', '', 'Guests', 'G1, G2'],
  ]
  const plan = buildPlan(rows, detectPlanColumns(header))

  it('collects phases in the order the source listed them', () => {
    expect(plan.phases).toEqual(['Booked', 'Guests'])
  })

  it('keeps every task and its filing', () => {
    expect(plan.tasks).toHaveLength(5)
    expect(plan.tasks[0]).toMatchObject({
      ref: 'B1', title: 'Book the hall', status: 'next',
      owner: 'Craig', priority: 'P1', due: '2026-03-01', phase: 'Booked',
    })
  })

  it('splits a multi-value dependency cell', () => {
    expect(plan.tasks[4].blockedByRefs).toEqual(['G1', 'G2'])
  })

  it('skips rows with no task name', () => {
    // Spacers, totals and the template's own instruction row all look like this.
    // Importing them creates nameless tasks nobody can find again.
    const withJunk = buildPlan([header, ['', '', '', '', '', '', '', ''], rows[1]], detectPlanColumns(header))
    expect(withJunk.tasks).toHaveLength(1)
  })
})

describe('parsing pasted text', () => {
  it('reads a table copied off a web page as tab-separated', () => {
    const grid = parsePastedGrid('ID\tTask\tStatus\nF1\tIncorporate\tDone')
    expect(grid).toEqual([['ID', 'Task', 'Status'], ['F1', 'Incorporate', 'Done']])
  })

  it('reads a CSV export, respecting quoted commas', () => {
    const grid = parsePastedGrid('Task,Notes\n"Build model","FOB, duty, freight"')
    expect(grid[1]).toEqual(['Build model', 'FOB, duty, freight'])
  })

  it('prefers tabs when a line has both', () => {
    // A pasted cell containing a comma is common; a stray tab is not. Splitting on
    // commas here would shred every description into fragments.
    const grid = parsePastedGrid('Task\tNotes\nBuild\tFOB, duty, freight')
    expect(grid[1]).toEqual(['Build', 'FOB, duty, freight'])
  })

  it('ignores blank lines', () => {
    expect(parsePastedGrid('a\tb\n\n\nc\td')).toHaveLength(2)
  })
})
