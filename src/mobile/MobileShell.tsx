import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { Fab } from '@/mobile/components/Fab'
import { TabBar } from '@/mobile/components/TabBar'
import { NewTaskSheet } from '@/mobile/components/sheets/NewTaskSheet'
import { PersonDetailSheet } from '@/mobile/components/sheets/PersonDetailSheet'
import { QuickCaptureSheet } from '@/mobile/components/sheets/QuickCaptureSheet'
import { TaskDetailSheet } from '@/mobile/components/sheets/TaskDetailSheet'
import { formatHeaderDate } from '@/mobile/lib/dates'
import type { SubPage, TabId, TaskFilter } from '@/mobile/lib/types'
import { Collections } from '@/mobile/pages/Collections'
import { History } from '@/mobile/pages/History'
import { Inbox } from '@/mobile/pages/Inbox'
import { More } from '@/mobile/pages/More'
import { Overall } from '@/mobile/pages/Overall'
import { People } from '@/mobile/pages/People'
import { Projects } from '@/mobile/pages/Projects'
import { Reports } from '@/mobile/pages/Reports'
import { Settings } from '@/mobile/pages/Settings'
import { Tasks } from '@/mobile/pages/Tasks'
import { Today } from '@/mobile/pages/Today'

/**
 * The phone layout.
 *
 * It is the same application as the desktop shell — same `useStore()`, same
 * `AppState`, same save path — rendered for a small screen. It holds no data
 * layer of its own, which is the whole point: there is nothing here that can
 * drift from, or fall out of sync with, the desktop view.
 *
 * The desktop sidebar carries eleven sections. A phone tab bar holds about five
 * before it gets cramped, so the daily loop (Today / Inbox / Tasks / People)
 * lives on the bar and everything else sits one tap under More.
 */

const TITLES: Record<TabId, [string, string]> = {
  today: ['Today', 'Everything else stays one click away'],
  inbox: ['Inbox', 'Capture first, organize later'],
  tasks: ['Tasks', 'Priority and status decide what you see'],
  people: ['People', 'Never let a promise go cold'],
  more: ['More', 'Everything beyond the daily loop'],
}

const SUB_TITLES: Record<SubPage, [string, string]> = {
  overall: ['Overall', 'The portfolio view'],
  projects: ['Projects', 'Grouped by area, with a WIP guardrail'],
  collections: ['Collections', 'Trackers for everything that isn’t a task'],
  reports: ['Reports', 'What needs attention, and why'],
  history: ['History', 'Every change, never edited'],
  settings: ['Settings', 'The control room'],
}

export function MobileShell({ onSwitchToDesktop }: { onSwitchToDesktop?: () => void }) {
  const store = useStore()
  const { state } = store

  const [tab, setTab] = useState<TabId>('today')
  /** one level of depth under More — null means the hub itself */
  const [sub, setSub] = useState<SubPage | null>(null)
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('open')

  const [captureOpen, setCaptureOpen] = useState(false)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null)
  const [personDetailId, setPersonDetailId] = useState<string | null>(null)

  const detailTask = useMemo(
    () => state.tasks.find(t => t.id === taskDetailId) ?? null,
    [state.tasks, taskDetailId],
  )
  const detailPerson = useMemo(
    () => state.people.find(p => p.id === personDetailId) ?? null,
    [state.people, personDetailId],
  )

  /**
   * One toggle path for the whole layout. Completing goes through the store's
   * audit-aware `completeTask`; reopening puts the task back to 'next' and
   * clears the completion date, matching what the desktop does.
   */
  const toggleTask = useCallback(
    (id: string) => {
      const task = state.tasks.find(t => t.id === id)
      if (!task) return
      if (task.status === 'done') {
        store.updateTask(id, { status: 'next', completedAt: undefined }, 'reopened')
        toast.success('Reopened')
      } else {
        store.completeTask(id)
        toast.success('Done')
      }
    },
    [state.tasks, store],
  )

  const goToTab = useCallback((next: TabId) => {
    setTab(next)
    setSub(null)
  }, [])

  const [title, subtitle] = sub ? SUB_TITLES[sub] : TITLES[tab]
  const pending = state.captures.filter(c => c.status === 'pending').length

  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-[520px] flex-col overflow-hidden bg-background text-[14px]">
      <header className="safe-top relative shrink-0 border-b border-border bg-card px-4 pb-3">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-primary" aria-hidden />
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-display m-0 flex items-center gap-2 text-[22px] font-semibold tracking-[-0.3px]">
            {sub ? (
              <button
                type="button"
                onClick={() => setSub(null)}
                aria-label="Back to More"
                className="-ml-1 rounded-[7px] px-1 text-[20px] leading-none opacity-60 active:opacity-100"
              >
                ‹
              </button>
            ) : null}
            {title}
          </h1>
          <span className="flex shrink-0 items-center gap-2">
            {onSwitchToDesktop ? (
              <button
                type="button"
                onClick={onSwitchToDesktop}
                className="rounded-[14px] border border-border px-[8px] py-[2px] text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
              >
                Desktop
              </button>
            ) : null}
            <span className="whitespace-nowrap text-[11px] text-muted-foreground">
              {formatHeaderDate()}
            </span>
          </span>
        </div>
        <p className="m-0 mt-[3px] text-[12px] text-muted-foreground">{subtitle}</p>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-4 pb-[90px] pt-[14px]">
        {tab === 'today' && !sub ? (
          <Today onOpenTask={setTaskDetailId} onToggleTask={toggleTask} />
        ) : null}
        {tab === 'inbox' && !sub ? <Inbox /> : null}
        {tab === 'tasks' && !sub ? (
          <Tasks
            filter={taskFilter}
            onFilterChange={setTaskFilter}
            onOpenTask={setTaskDetailId}
            onNewTask={() => setNewTaskOpen(true)}
            onToggleTask={toggleTask}
          />
        ) : null}
        {tab === 'people' && !sub ? <People onOpenPerson={setPersonDetailId} /> : null}
        {tab === 'more' && !sub ? <More onOpen={setSub} /> : null}

        {sub === 'overall' ? <Overall onOpenProjects={() => setSub('projects')} /> : null}
        {sub === 'projects' ? <Projects /> : null}
        {sub === 'collections' ? <Collections /> : null}
        {sub === 'reports' ? <Reports /> : null}
        {sub === 'history' ? <History /> : null}
        {sub === 'settings' ? <Settings onSwitchToDesktop={onSwitchToDesktop} /> : null}
      </main>

      <Fab onClick={() => setCaptureOpen(true)} />

      <TabBar active={tab} onChange={goToTab} pendingCaptures={pending} />

      <QuickCaptureSheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onSubmit={text => {
          const cap = store.capture(text, 'manual')
          setCaptureOpen(false)
          toast.success('Captured', { description: cap.proposal.explanation })
        }}
      />

      <NewTaskSheet
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onAdd={input => {
          store.addTask(input)
          setNewTaskOpen(false)
          toast.success('Task added')
        }}
      />

      <TaskDetailSheet
        task={detailTask}
        onClose={() => setTaskDetailId(null)}
        onToggle={toggleTask}
        onSnooze={id => {
          store.snoozeTask(id, 1)
          toast.success('Snoozed a day')
        }}
        onSave={(id, patch) => {
          store.updateTask(id, patch)
          toast.success('Saved')
        }}
      />

      <PersonDetailSheet
        person={detailPerson}
        onClose={() => setPersonDetailId(null)}
        onSave={(id, patch) => {
          store.updatePerson(id, patch)
          toast.success('Contact saved')
        }}
      />
    </div>
  )
}
