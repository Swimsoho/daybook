import { describe, expect, it } from 'vitest'
import { mergeStates } from './sync'
import { seedState } from './seed'
import type { AppState, Task } from './model'

/**
 * These are the scenarios that used to lose data.
 *
 * Before migration 0006 and this merge, every one of them ended with one
 * client's entire workspace replacing the other's. The assertions below are
 * about what survives.
 */

const clone = (s: AppState): AppState => JSON.parse(JSON.stringify(s))

function withTask(s: AppState, id: string, patch: Partial<Task>): AppState {
  return { ...s, tasks: s.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)) }
}

function newTask(id: string, title: string): Task {
  return {
    id,
    title,
    type: 'todo',
    categoryIds: [],
    priority: 'P1',
    status: 'next',
    source: 'manual',
    created: '2026-01-01',
  }
}

describe('two devices, different records', () => {
  it('keeps both changes', () => {
    const base = seedState()
    const [a, b] = [base.tasks[0].id, base.tasks[1].id]

    // phone completes one task
    const mine = withTask(clone(base), a, { status: 'done', completedAt: '2026-01-02' })
    // laptop renames a different one, and saves first
    const theirs = withTask(clone(base), b, { title: 'Renamed on the laptop' })

    const merged = mergeStates(base, mine, theirs)

    expect(merged.tasks.find(t => t.id === a)!.status).toBe('done')
    expect(merged.tasks.find(t => t.id === b)!.title).toBe('Renamed on the laptop')
  })

  it('does not resurrect, drop or duplicate anything else', () => {
    const base = seedState()
    const mine = withTask(clone(base), base.tasks[0].id, { title: 'Mine' })
    const theirs = withTask(clone(base), base.tasks[1].id, { title: 'Theirs' })

    const merged = mergeStates(base, mine, theirs)

    expect(merged.tasks).toHaveLength(base.tasks.length)
    expect(new Set(merged.tasks.map(t => t.id)).size).toBe(base.tasks.length)
  })
})

describe('two devices, the same record', () => {
  it('gives that one record to whoever saved second, and touches nothing else', () => {
    const base = seedState()
    const id = base.tasks[0].id
    const otherId = base.tasks[1].id

    const mine = withTask(clone(base), id, { title: 'Phone wins' })
    let theirs = withTask(clone(base), id, { title: 'Laptop got there first' })
    theirs = withTask(theirs, otherId, { title: 'Laptop also did this' })

    const merged = mergeStates(base, mine, theirs)

    // the contested record goes to the later writer — that's me
    expect(merged.tasks.find(t => t.id === id)!.title).toBe('Phone wins')
    // but their uncontested edit is untouched, which is the part that used to vanish
    expect(merged.tasks.find(t => t.id === otherId)!.title).toBe('Laptop also did this')
  })
})

describe('additions', () => {
  it('keeps tasks added on both sides at once', () => {
    const base = seedState()
    const mine = { ...clone(base), tasks: [...base.tasks, newTask('t_phone', 'Added on the phone')] }
    const theirs = { ...clone(base), tasks: [...base.tasks, newTask('t_laptop', 'Added on the laptop')] }

    const merged = mergeStates(base, mine, theirs)
    const titles = merged.tasks.map(t => t.title)

    expect(titles).toContain('Added on the phone')
    expect(titles).toContain('Added on the laptop')
  })

  it('keeps a capture a webhook filed while I was editing', () => {
    // this is the Telegram/SMS case: the server grew a capture I've never seen
    const base = seedState()
    const mine = withTask(clone(base), base.tasks[0].id, { title: 'Edited locally' })
    const theirs = clone(base)
    theirs.captures = [
      { ...base.captures[0], id: 'cap_from_telegram', text: 'sent from my phone' },
      ...base.captures,
    ]

    const merged = mergeStates(base, mine, theirs)

    expect(merged.captures.some(c => c.id === 'cap_from_telegram')).toBe(true)
    expect(merged.tasks.find(t => t.id === base.tasks[0].id)!.title).toBe('Edited locally')
  })
})

describe('deletions', () => {
  it('honours a delete I made, without disturbing their edits', () => {
    const base = seedState()
    const goneId = base.tasks[0].id
    const theirId = base.tasks[1].id

    const mine = { ...clone(base), tasks: base.tasks.filter(t => t.id !== goneId) }
    const theirs = withTask(clone(base), theirId, { title: 'Still here' })

    const merged = mergeStates(base, mine, theirs)

    expect(merged.tasks.some(t => t.id === goneId)).toBe(false)
    expect(merged.tasks.find(t => t.id === theirId)!.title).toBe('Still here')
  })

  it('does not delete something they added that I never saw', () => {
    const base = seedState()
    const mine = clone(base)
    const theirs = { ...clone(base), tasks: [...base.tasks, newTask('t_new', 'Theirs, brand new')] }

    const merged = mergeStates(base, mine, theirs)
    expect(merged.tasks.some(t => t.id === 't_new')).toBe(true)
  })
})

describe('settings', () => {
  it('merges field by field, not wholesale', () => {
    const base = seedState()

    // I changed the theme on my phone…
    const mine = clone(base)
    mine.settings = { ...mine.settings, theme: 'teal' }

    // …they changed the daily capacity on the laptop
    const theirs = clone(base)
    theirs.settings = { ...theirs.settings, dailyCapacity: base.settings.dailyCapacity + 3 }

    const merged = mergeStates(base, mine, theirs)

    expect(merged.settings.theme).toBe('teal')
    expect(merged.settings.dailyCapacity).toBe(base.settings.dailyCapacity + 3)
  })
})

describe('the audit trail', () => {
  it('unions both sides and never drops an entry', () => {
    const base = seedState()
    const entry = (id: string, ts: string) => ({
      id,
      ts,
      user: 'Craig',
      action: 'updated',
      entity: 'task',
      entityId: 'x',
      detail: id,
    })

    // dated ahead of the seed's own entries so the ordering assertion is about
    // these two, not about whatever timestamps the seed happens to carry
    const mine = { ...clone(base), audit: [entry('a_mine', '2099-01-02T10:00:00Z'), ...base.audit] }
    const theirs = { ...clone(base), audit: [entry('a_theirs', '2099-01-02T11:00:00Z'), ...base.audit] }

    const merged = mergeStates(base, mine, theirs)
    const ids = merged.audit.map(e => e.id)

    expect(ids).toContain('a_mine')
    expect(ids).toContain('a_theirs')
    expect(new Set(ids).size).toBe(ids.length) // no duplicates
    expect(merged.audit.length).toBe(base.audit.length + 2) // nothing dropped
    expect(ids.indexOf('a_theirs')).toBeLessThan(ids.indexOf('a_mine')) // newest first
  })
})

describe('no baseline', () => {
  it('prefers the server copy rather than overwriting with ours', () => {
    // Without a base we cannot tell our changes from theirs. Losing our unsaved,
    // still-on-screen edit is recoverable; overwriting their saved work is not.
    const base = seedState()
    const mine = withTask(clone(base), base.tasks[0].id, { title: 'Unsaved local edit' })
    const theirs = withTask(clone(base), base.tasks[0].id, { title: 'What the server holds' })

    const merged = mergeStates(null, mine, theirs)

    expect(merged.tasks.find(t => t.id === base.tasks[0].id)!.title).toBe('What the server holds')
  })
})
