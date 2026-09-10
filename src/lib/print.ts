// Print / "Save as PDF" for a task or a project. We render a clean, self-contained HTML document
// into a new window and call print() — the browser's print dialog then offers "Save as PDF". This
// keeps the output beautiful and page-friendly without dragging the app's screen layout into print.

import {
  AppState, Project, Task, PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS, fmtDate, fmtDateLong,
} from './model'
import { projectMilestones } from './milestones'
import {
  projectStats, projectHealth, HEALTH_META, projectMembers, projectOwnerMember, projectMember,
} from './projects'

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const nl2br = (s: string) => esc(s).replace(/\n/g, '<br>')

// ---- shared shell + styles ----
function shell(title: string, subtitle: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  :root { --ink:#1c2b1b; --muted:#6b7269; --line:#e3e1d8; --accent:#20351f; --paper:#faf9f4; --wash:#f4f2ea; }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; background:#fff; color:var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { max-width: 820px; margin: 0 auto; padding: 40px 44px 64px; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 30px; line-height:1.15; margin:0 0 4px; letter-spacing:-0.01em; }
  h2 { font-family: Georgia, serif; font-size: 15px; text-transform:uppercase; letter-spacing:0.09em; color:var(--muted); margin:28px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--line); }
  .sub { color:var(--muted); font-size:13px; margin:0 0 18px; }
  .band { border-left:4px solid var(--accent); padding-left:14px; margin-bottom:8px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 4px; }
  .chip { display:inline-block; font-size:11px; font-weight:600; padding:3px 9px; border-radius:5px; border:1px solid var(--line); background:var(--wash); color:var(--ink); }
  .chip.accent { background:var(--accent); color:#fff; border-color:var(--accent); }
  .chip.bad { background:#fdecec; color:#a23; border-color:#e7b7b7; }
  .chip.warn { background:#fbf0d9; color:#7a561d; border-color:#e6cd97; }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap:2px 26px; margin-top:6px; }
  .row { display:flex; gap:10px; padding:6px 0; border-bottom:1px solid var(--line); font-size:13px; }
  .row .k { color:var(--muted); width:120px; flex:0 0 120px; }
  .row .v { color:var(--ink); font-weight:500; }
  .note { border-left:3px solid var(--line); padding:2px 0 2px 12px; margin:8px 0; font-size:13.5px; color:#333; white-space:pre-wrap; }
  .log { font-size:12.5px; }
  .log .entry { padding:6px 0; border-bottom:1px solid var(--line); display:flex; gap:12px; }
  .log .date { color:var(--muted); flex:0 0 84px; font-variant-numeric:tabular-nums; }
  .log .noted { background:var(--wash); border-left:3px solid var(--accent); padding-left:9px; margin-left:-12px; }
  ul.docs, ul.tasks { list-style:none; margin:6px 0; padding:0; }
  ul.docs li { display:flex; justify-content:space-between; gap:12px; padding:6px 0; border-bottom:1px solid var(--line); font-size:13px; }
  ul.tasks li { padding:6px 0; border-bottom:1px solid var(--line); font-size:13px; display:flex; align-items:baseline; gap:10px; }
  ul.tasks .t { flex:1; }
  ul.tasks .done { text-decoration:line-through; color:var(--muted); }
  ul.tasks .m { color:var(--muted); font-size:11.5px; flex:0 0 auto; }
  .phase { margin:14px 0; }
  .phase .ph-head { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid var(--accent); padding-bottom:4px; }
  .phase .ph-name { font-weight:700; font-size:13.5px; text-transform:uppercase; letter-spacing:0.04em; }
  .bar { height:8px; border-radius:5px; background:var(--wash); overflow:hidden; margin:8px 0; }
  .bar > i { display:block; height:100%; background:var(--accent); }
  .muted { color:var(--muted); font-size:12.5px; }
  .foot { margin-top:36px; padding-top:10px; border-top:1px solid var(--line); color:var(--muted); font-size:10.5px; display:flex; justify-content:space-between; }
  @media print { .page { padding:0 8px; } h2 { break-after:avoid; } .phase, .row, ul.tasks li, .log .entry { break-inside:avoid; } }
</style></head>
<body><div class="page">
  <div class="band"><h1>${esc(title)}</h1></div>
  <p class="sub">${subtitle}</p>
  ${body}
  <div class="foot"><span>Daybook</span><span>Printed ${esc(fmtDateLong(new Date().toISOString().slice(0,10)))}</span></div>
</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body></html>`
}

function openWindow(html: string) {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  return true
}

function rows(items: [string, string | undefined][]): string {
  return items.filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')
}

// ---- Task ----
export function printTask(state: AppState, task: Task): boolean {
  const scheme = state.settings.priorityScheme
  const area = state.areas.find(a => a.id === task.areaId)
  const project = state.projects.find(p => p.id === task.projectId)
  const phase = state.milestones.find(m => m.id === task.milestoneId)
  const person = state.people.find(p => p.id === task.personId)
  const assignee = project && task.assigneeMemberId ? projectMember(project, task.assigneeMemberId) : undefined
  const done = task.status === 'done' || task.status === 'dropped'
  const history = state.audit.filter(a => a.entityId === task.id)
  const atts = task.attachments ?? []

  const chips = [
    `<span class="chip accent">${esc(TYPE_LABELS[task.type])}</span>`,
    `<span class="chip">${esc(STATUS_LABELS[task.status])}</span>`,
    `<span class="chip">${esc(PRIORITY_LABELS[scheme][task.priority])}</span>`,
    task.due && !done ? `<span class="chip warn">Due ${esc(fmtDate(task.due))}</span>` : '',
  ].join('')

  const meta = rows([
    ['Area', area?.name],
    [project?.kind === 'label' ? 'Label' : 'Project', project?.name],
    ['Phase', phase?.name],
    ['Due date', task.due ? fmtDateLong(task.due) : undefined],
    ['Estimate', task.estMinutes ? `${task.estMinutes} min` : undefined],
    ['Contact', person?.name],
    ['Assignee', assignee?.name],
    ['Waiting on', task.status === 'waiting' ? task.waitingOn : undefined],
    ['Created', fmtDateLong(task.created)],
    ['Completed', task.completedAt ? fmtDateLong(task.completedAt) : undefined],
  ])

  const notesBlock = task.notes ? `<h2>Notes</h2><div class="note">${nl2br(task.notes)}</div>` : ''

  const logBlock = `<h2>History &amp; notes</h2><div class="log">${
    history.map(h => h.action === 'noted'
      ? `<div class="entry noted"><span class="date">${esc(h.ts.slice(5,10))}</span><span><b>${esc(h.user)}</b> noted: ${esc(h.detail)}</span></div>`
      : `<div class="entry"><span class="date">${esc(h.ts.slice(5,10))}</span><span><b>${esc(h.user)}</b> ${esc(h.action)} — ${esc(h.detail)}</span></div>`
    ).join('')
  }<div class="entry"><span class="date">${esc(fmtDate(task.created))}</span><span>created · source: ${esc(task.source)}</span></div></div>`

  const attBlock = atts.length
    ? `<h2>Attachments (${atts.length})</h2><ul class="docs">${atts.map(a => `<li><span>${esc(a.name)}</span><span class="muted">${esc(a.type)} · ${(a.size/1024).toFixed(0)} KB</span></li>`).join('')}</ul>`
    : ''

  const body = `<div class="chips">${chips}</div>${task.callAbout ? `<p class="muted">About: ${esc(task.callAbout)}</p>` : ''}
    <h2>Details</h2><div>${meta}</div>${notesBlock}${attBlock}${logBlock}`

  return openWindow(shell(task.title, `Task${area ? ` · ${esc(area.name)}` : ''}`, body))
}

// ---- Project ----
export function printProject(state: AppState, project: Project): boolean {
  const scheme = state.settings.priorityScheme
  const area = state.areas.find(a => a.id === project.areaId)
  const stats = projectStats(state, project.id)
  const health = projectHealth(state, project, stats)
  const hm = HEALTH_META[health]
  const owner = projectOwnerMember(project)
  const members = projectMembers(state, project.id).filter(m => m.id !== project.ownerMemberId)
  const phases = projectMilestones(state, project.id)
  const tasks = state.tasks.filter(t => t.projectId === project.id && !t.parentId)
  const docs = project.documents ?? []

  const taskLine = (t: Task) => {
    const a = t.assigneeMemberId ? projectMember(project, t.assigneeMemberId) : undefined
    const done = t.status === 'done' || t.status === 'dropped'
    return `<li><span class="t ${done ? 'done' : ''}">${esc(t.title)}</span>${a ? `<span class="m">${esc(a.name)}</span>` : ''}<span class="m">${esc(STATUS_LABELS[t.status])}</span>${t.due ? `<span class="m">${esc(fmtDate(t.due))}</span>` : ''}</li>`
  }

  const chips = [
    `<span class="chip" style="background:${hm.bg};color:${hm.text};border-color:${hm.border}">${esc(hm.label)}</span>`,
    `<span class="chip">${esc(project.status)}</span>`,
    `<span class="chip">${esc(PRIORITY_LABELS[scheme][project.priority])}</span>`,
    project.due ? `<span class="chip warn">Target ${esc(fmtDate(project.due))}</span>` : '',
  ].join('')

  const meta = rows([
    ['Area', area?.name],
    ['Owner', owner?.name],
    ['Team', members.length ? members.map(m => m.name).join(', ') : undefined],
    ['Start', project.start ? fmtDateLong(project.start) : undefined],
    ['Target', project.due ? fmtDateLong(project.due) : undefined],
    ['Progress', `${stats.done}/${stats.total} done · ${stats.pct}%`],
    ['Open', String(stats.open)],
    ['Overdue', stats.overdue ? String(stats.overdue) : undefined],
    ['Blocked', stats.blocked ? String(stats.blocked) : undefined],
  ])

  const phaseBlocks = phases.map(ph => {
    const pt = tasks.filter(t => t.milestoneId === ph.id)
    const d = pt.filter(t => t.status === 'done' || t.status === 'dropped').length
    return `<div class="phase"><div class="ph-head"><span class="ph-name">${esc(ph.name)}</span><span class="muted">${d}/${pt.length}${ph.due ? ` · ${esc(fmtDate(ph.due))}` : ''}</span></div>${ph.detail ? `<p class="muted">${esc(ph.detail)}</p>` : ''}${pt.length ? `<ul class="tasks">${pt.map(taskLine).join('')}</ul>` : '<p class="muted">No tasks in this phase.</p>'}</div>`
  }).join('')
  const noPhase = tasks.filter(t => !t.milestoneId)
  const noPhaseBlock = noPhase.length
    ? `<div class="phase"><div class="ph-head"><span class="ph-name">No phase</span><span class="muted">${noPhase.length}</span></div><ul class="tasks">${noPhase.map(taskLine).join('')}</ul></div>`
    : ''

  const docsBlock = docs.length
    ? `<h2>Documents (${docs.length})</h2><ul class="docs">${docs.map(d => `<li><span>${esc(d.name)}</span><span class="muted">${(d.size/1024).toFixed(0)} KB${d.uploadedAt ? ` · ${esc(fmtDate(d.uploadedAt.slice(0,10)))}` : ''}</span></li>`).join('')}</ul>`
    : ''

  const notesBlock = project.notes ? `<h2>Notes</h2><div class="note">${nl2br(project.notes)}</div>` : ''

  const body = `<div class="chips">${chips}</div>${project.outcome ? `<p class="muted"><b>Goal:</b> ${esc(project.outcome)}</p>` : ''}
    <div class="bar"><i style="width:${stats.pct}%"></i></div>
    <h2>Summary</h2><div>${meta}</div>${notesBlock}
    <h2>Work — ${phases.length} phase${phases.length === 1 ? '' : 's'}, ${tasks.length} task${tasks.length === 1 ? '' : 's'}</h2>
    ${phaseBlocks}${noPhaseBlock || (phases.length === 0 && tasks.length === 0 ? '<p class="muted">No tasks yet.</p>' : '')}
    ${docsBlock}`

  return openWindow(shell(project.name, `Project${area ? ` · ${esc(area.name)}` : ''}`, body))
}
