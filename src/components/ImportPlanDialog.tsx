import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PRIORITY_LABELS, Project, STATUS_LABELS } from '@/lib/model'
import { useStore } from '@/lib/store'
import { SPREADSHEET_ACCEPT, parseSpreadsheetFile } from '@/lib/xlsxTemplate'
import {
  EMPTY_MAPPING, PlanField, PlanMapping, buildPlan, detectPlanColumns, parsePastedGrid,
} from '@/lib/planImport'

/**
 * Bring an existing plan in rather than retyping it.
 *
 * Most project plans already live in a tracker, a spreadsheet or a table in a
 * doc. Two ways in, because the two ways people have it differ: paste (copy the
 * table straight off the page — you get tabs) or a file (an export — you get
 * commas).
 *
 * Columns are auto-detected and then *shown*, editable, before anything is
 * created. An importer that silently guesses wrong is worse than one that asks:
 * a wrong guess here means forty mis-filed tasks to unpick by hand.
 */

const FIELDS: { key: PlanField; label: string; hint?: string }[] = [
  { key: 'title', label: 'Task', hint: 'required' },
  { key: 'phase', label: 'Phase', hint: 'groups the tasks' },
  { key: 'status', label: 'Status' },
  { key: 'owner', label: 'Owner' },
  { key: 'priority', label: 'Priority' },
  { key: 'due', label: 'Target date' },
  { key: 'notes', label: 'Description' },
  { key: 'ref', label: 'ID', hint: 'used to resolve dependencies' },
  { key: 'blockedBy', label: 'Waiting on', hint: 'IDs of blocking tasks' },
]

export function ImportPlanDialog({ project, open, onClose }: {
  project: Project
  open: boolean
  onClose: () => void
}) {
  const { state, importProjectPlan } = useStore()
  const [rows, setRows] = useState<string[][] | null>(null)
  const [mapping, setMapping] = useState<PlanMapping>(EMPTY_MAPPING)
  const [paste, setPaste] = useState('')
  const [source, setSource] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => { setRows(null); setMapping(EMPTY_MAPPING); setPaste(''); setSource('') }
  const close = () => { reset(); onClose() }

  const load = (grid: string[][], label: string) => {
    if (grid.length < 2) { toast.error('Needs a header row and at least one task'); return }
    setRows(grid)
    setMapping(detectPlanColumns(grid[0]))
    setSource(label)
  }

  const plan = useMemo(
    () => (rows && mapping.title !== -1 ? buildPlan(rows, mapping) : null),
    [rows, mapping],
  )

  // Phases already on the project are matched by name rather than duplicated, so
  // the preview has to say which of these are genuinely new.
  const existingPhases = new Set(
    state.milestones.filter(m => m.projectId === project.id).map(m => m.name.trim().toLowerCase()),
  )
  const newPhases = plan?.phases.filter(p => !existingPhases.has(p.trim().toLowerCase())) ?? []
  const knownPeople = new Set(state.people.map(p => p.name.trim().toLowerCase()))
  const newPeople = [...new Set(
    (plan?.tasks.map(t => t.owner).filter(Boolean) as string[] ?? [])
      .filter(n => !knownPeople.has(n.trim().toLowerCase())),
  )]

  const header = rows?.[0] ?? []

  return (
    <Dialog open={open} onOpenChange={o => !o && close()}>
      <DialogContent className="sm:max-w-[680px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Import a plan into {project.name}</DialogTitle>
        </DialogHeader>

        {!rows ? (
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-1.5">
              <Label className="text-[12px] font-semibold text-foreground/80">Paste your table</Label>
              <p className="text-[12px] text-muted-foreground">
                Select the rows in your tracker or spreadsheet — including the header row — and paste them here.
              </p>
              <Textarea
                value={paste}
                onChange={e => setPaste(e.target.value)}
                rows={8}
                placeholder={'ID\tTask\tStatus\tOwner\tPriority\tTarget\tPhase\n1\tBook the hall\tDone\t\tP1\t\tBooked\n2\tSend the invitations\tNot started\t\tP1\t\tGuests'}
                className="font-mono text-[11.5px]"
              />
              <Button
                className="justify-self-start"
                disabled={!paste.trim()}
                onClick={() => load(parsePastedGrid(paste), 'pasted table')}
              >
                Read the pasted rows
              </Button>
            </div>

            <div className="flex items-center gap-3 text-[11.5px] uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
            </div>

            <div>
              <input
                ref={fileRef} type="file" accept={SPREADSHEET_ACCEPT} className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  parseSpreadsheetFile(f)
                    .then(g => load(g, f.name))
                    .catch(() => toast.error('Couldn’t read that file — try a .csv or .xlsx'))
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />Choose a CSV or Excel file
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <p className="text-[12.5px] text-muted-foreground">
              Read <b className="text-foreground">{rows.length - 1} rows</b> from {source}. Check the columns below — anything set to “—” is ignored.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <div key={f.key} className="grid grid-cols-1 gap-1.5">
                  <Label className="text-[12px] font-semibold text-foreground/80">
                    {f.label}{f.hint && <span className="font-normal text-muted-foreground"> — {f.hint}</span>}
                  </Label>
                  <Select
                    value={String(mapping[f.key])}
                    onValueChange={v => setMapping(m => ({ ...m, [f.key]: Number(v) }))}
                  >
                    <SelectTrigger className="h-9 text-[12.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">—</SelectItem>
                      {header.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>{h || `Column ${i + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {plan && (
              <div className="rounded-lg border border-border bg-muted/30 p-3.5 grid grid-cols-1 gap-2">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">What will be created</div>
                <p className="text-[13px]">
                  <b>{plan.tasks.length}</b> task{plan.tasks.length === 1 ? '' : 's'}
                  {newPhases.length > 0 && <> in <b>{newPhases.length}</b> new phase{newPhases.length === 1 ? '' : 's'} ({newPhases.join(', ')})</>}
                  {newPeople.length > 0 && <>, plus <b>{newPeople.length}</b> new contact{newPeople.length === 1 ? '' : 's'} ({newPeople.join(', ')})</>}
                </p>
                <div className="max-h-44 overflow-y-auto rounded border border-border bg-card">
                  {plan.tasks.slice(0, 12).map((t, i) => (
                    <div key={i} className="px-2.5 py-1.5 border-b border-border last:border-0 flex items-baseline gap-2 text-[12px]">
                      {t.ref && <span className="tabular text-muted-foreground shrink-0">{t.ref}</span>}
                      <span className="truncate">{t.title}</span>
                      <span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground">
                        {t.phase ? `${t.phase} · ` : ''}{STATUS_LABELS[t.status]} · {PRIORITY_LABELS[state.settings.priorityScheme][t.priority]}
                      </span>
                    </div>
                  ))}
                  {plan.tasks.length > 12 && (
                    <div className="px-2.5 py-1.5 text-[11.5px] italic text-muted-foreground">
                      …and {plan.tasks.length - 12} more
                    </div>
                  )}
                </div>
                <p className="text-[11.5px] text-muted-foreground">
                  Nothing existing is changed — this only adds. A phase whose name already exists here is reused, not duplicated.
                </p>
              </div>
            )}
            {mapping.title === -1 && (
              <p className="text-[12.5px] text-[hsl(8_60%_41%)]">Pick which column holds the task name before importing.</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          {rows && <Button variant="outline" onClick={reset}>Start over</Button>}
          {rows && (
            <Button
              disabled={!plan || plan.tasks.length === 0}
              onClick={() => {
                if (!plan) return
                const r = importProjectPlan(project.id, plan)
                const bits = [`${r.tasksAdded} task${r.tasksAdded === 1 ? '' : 's'}`]
                if (r.phasesAdded) bits.push(`${r.phasesAdded} phase${r.phasesAdded === 1 ? '' : 's'}`)
                if (r.peopleAdded) bits.push(`${r.peopleAdded} contact${r.peopleAdded === 1 ? '' : 's'}`)
                toast.success(`Imported ${bits.join(' · ')}`)
                close()
              }}
            >
              Import {plan?.tasks.length ?? 0} task{plan?.tasks.length === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
