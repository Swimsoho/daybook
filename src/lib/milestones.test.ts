import { describe, expect, it } from 'vitest'
import { seedState } from './seed'
import {
  eligibleBlockers, groupByPhase, isBlocked, openBlockers, phaseRefs, progress,
  projectStats, projectTasks,
} from './milestones'
import type { AppState, Milestone, Task } from './model'

/**
 * Phases are a grouping, never a container. Almost every test below is really
 * asking the same question in a different way: when the plan's shape changes,
 * does the work underneath survive?
 */

const clone = (s: AppState): AppState => JSON.parse(JSON.stringify(s))

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    type: 'todo',
    categoryIds: [],
    priority: 'P2',
    status: 'next',
    source: 'manual',
    created: '2026-01-01',
    projectId: 'pr',
    ...over,
  }
}

function phase(id: string, sort: number, over: Partial<Milestone> = {}): Milestone {
  return { id, projectId: 'pr', name: id, sort, status: 'open', ...over }
}

/** A bare state with one project, two phases and four tasks. */
function fixture(): AppState {
  const s = clone(seedState())
  s.projects = [{ id: 'pr', areaId: 'a', name: 'Build', outcome: '', status: 'active', priority: 'P1', lastActivity: '2026-01-01' }]
  s.milestones = [phase('one', 0), phase('two', 1)]
  s.tasks = [
    task('t1', { milestoneId: 'one', status: 'done' }),
    task('t2', { milestoneId: 'one' }),
    task('t3', { milestoneId: 'two', status: 'in-progress' }),
    task('t4'), // no phase
  ]
  return s
}

describe('grouping tasks into phases', () => {
  it('keeps phases in order and puts unphased work last', () => {
    const s = fixture()
    const groups = groupByPhase(s, 'pr')

    expect(groups.map(g => g.milestone?.name ?? null)).toEqual(['one', 'two', null])
    expect(groups[2].tasks.map(t => t.id)).toEqual(['t4'])
  })

  it('shows an empty phase rather than hiding it', () => {
    // An empty phase is information — "Platform hasn't started". Dropping it would
    // make a plan look shorter than it is.
    const s = fixture()
    s.tasks = s.tasks.filter(t => t.milestoneId !== 'two')

    const groups = groupByPhase(s, 'pr')
    expect(groups.find(g => g.milestone?.id === 'two')).toBeTruthy()
    expect(groups.find(g => g.milestone?.id === 'two')!.tasks).toHaveLength(0)
  })

  it('rescues a task pointing at a phase that no longer exists', () => {
    // If a phase is removed by any route that misses the cleanup, its tasks must
    // still appear somewhere. Silently vanishing off the board is the one
    // unacceptable outcome.
    const s = fixture()
    s.milestones = s.milestones.filter(m => m.id !== 'one')

    const groups = groupByPhase(s, 'pr')
    const shown = groups.flatMap(g => g.tasks.map(t => t.id))
    expect(shown).toContain('t1')
    expect(shown).toContain('t2')
  })

  it('never loses or duplicates a task across the groups', () => {
    const s = fixture()
    const shown = groupByPhase(s, 'pr').flatMap(g => g.tasks.map(t => t.id))
    expect(shown.sort()).toEqual(['t1', 't2', 't3', 't4'])
  })

  it('leaves subtasks off the board — they belong to their parent', () => {
    const s = fixture()
    s.tasks.push(task('t5', { parentId: 't2', milestoneId: 'one' }))
    expect(projectTasks(s, 'pr').map(t => t.id)).not.toContain('t5')
  })
})

describe('progress', () => {
  it('counts dropped work as settled, not outstanding', () => {
    // A dropped task is a decision, not a debt. Leaving it in the denominator as
    // "not done" would keep a finished phase permanently short of 100%.
    const done = progress([task('a', { status: 'done' }), task('b', { status: 'dropped' })])
    expect(done).toEqual({ done: 2, total: 2, pct: 100 })
  })

  it('reports 0 rather than NaN for an empty phase', () => {
    expect(progress([])).toEqual({ done: 0, total: 0, pct: 0 })
  })
})

describe('dependencies', () => {
  it('reports a task as blocked only while its blocker is open', () => {
    const s = fixture()
    s.tasks = s.tasks.map(t => (t.id === 't3' ? { ...t, blockedBy: ['t2'] } : t))

    expect(isBlocked(s, s.tasks.find(t => t.id === 't3')!)).toBe(true)

    // finish the blocker
    s.tasks = s.tasks.map(t => (t.id === 't2' ? { ...t, status: 'done' as const } : t))
    expect(isBlocked(s, s.tasks.find(t => t.id === 't3')!)).toBe(false)
  })

  it('ignores a blocker id that no longer resolves to a task', () => {
    const s = fixture()
    const t = { ...task('t9'), blockedBy: ['deleted'] }
    expect(openBlockers(s, t)).toEqual([])
  })

  it('refuses to offer a choice that would create a cycle', () => {
    // t2 → t3 → t4 already. Offering t3 or t4 as a blocker of t2 would close the
    // loop, and every task in it would then be blocked forever with no way out.
    const s = fixture()
    s.tasks = s.tasks.map(t =>
      t.id === 't3' ? { ...t, blockedBy: ['t2'] } : t.id === 't4' ? { ...t, blockedBy: ['t3'], projectId: 'pr' } : t,
    )

    const offered = eligibleBlockers(s, s.tasks.find(t => t.id === 't2')!).map(t => t.id)
    expect(offered).toContain('t1')
    expect(offered).not.toContain('t2') // itself
    expect(offered).not.toContain('t3') // direct dependant
    expect(offered).not.toContain('t4') // dependant via t3
  })

  it('does not offer tasks from another project', () => {
    const s = fixture()
    s.tasks.push(task('other', { projectId: 'pr2' }))
    expect(eligibleBlockers(s, s.tasks.find(t => t.id === 't2')!).map(t => t.id)).not.toContain('other')
  })
})

describe('the project stat strip', () => {
  it('counts only open work as unassigned or blocked', () => {
    // A finished task with no owner isn't a gap in the plan, and a finished task
    // whose blocker is open isn't waiting on anything. Counting either would send
    // you chasing work that's already done.
    const s = fixture()
    s.tasks = [
      task('a', { status: 'done' }),
      task('b', { status: 'done', blockedBy: ['c'] }),
      task('c', { personId: 'p1' }),
      task('d'),
    ]

    const stats = projectStats(s, s.tasks)
    expect(stats.total).toBe(4)
    expect(stats.done).toBe(2)
    expect(stats.unassigned).toBe(1) // only 'd'
    expect(stats.blocked).toBe(0)
  })
})

describe('task references', () => {
  it('numbers from the phase initial and renumbers when work moves', () => {
    const s = fixture()
    expect(phaseRefs(s, 'pr').get('t1')).toBe('O1')
    expect(phaseRefs(s, 'pr').get('t2')).toBe('O2')
    expect(phaseRefs(s, 'pr').get('t3')).toBe('T1')

    // move t1 out of phase one — t2 becomes the first task in it
    s.tasks = s.tasks.map(t => (t.id === 't1' ? { ...t, milestoneId: 'two' } : t))
    expect(phaseRefs(s, 'pr').get('t2')).toBe('O1')
  })
})
