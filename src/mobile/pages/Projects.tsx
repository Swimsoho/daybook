import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PriorityChip, SectionTitle } from '@/mobile/components/bits';
import { activeAreas, isClosed, isDone, isStalled, staleDays } from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import { useCloud } from '@/lib/cloud';
import { groupByPhase, openBlockers, progress, projectTasks } from '@/lib/milestones';
import type { Project } from '@/lib/model';

type Status = Project['status'];

/** Projects — grouped by area, with stall detection and the WIP guardrail */
export function Projects({ onOpenTask }: { onOpenTask?: (id: string) => void }) {
  const { state, updateProject } = useStore();
  const areas = activeAreas(state);

  return (
    <div>
      {areas.map((area) => {
        const mine = state.projects.filter((p) => p.areaId === area.id && p.status !== 'archived');
        const activeCount = mine.filter((p) => p.status === 'active').length;
        const overWip = activeCount > state.settings.projectWipLimit;
        const loose = state.tasks.filter(
          (t) => t.areaId === area.id && !t.projectId && !isClosed(t),
        );

        if (!mine.length && !loose.length) return null;

        return (
          <div key={area.id} className="mb-6">
            <div className="mb-[10px] flex items-center gap-2">
              <SectionTitle>{area.name}</SectionTitle>
              {overWip ? (
                <span
                  className="ml-auto shrink-0 rounded-[4px] px-[6px] py-[2px] text-[10px] font-bold"
                  style={{ background: 'hsl(8 60% 41%)', color: 'hsl(45 50% 96%)' }}
                >
                  {activeCount}/{state.settings.projectWipLimit} — over WIP limit
                </span>
              ) : null}
            </div>

            {mine.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpenTask={onOpenTask}
                onStatusChange={(status) => {
                  updateProject(project.id, { status });
                  toast.success(`Moved to ${status}`);
                }}
              />
            ))}

            {loose.length ? <UnfiledTasks tasks={loose} onOpenTask={onOpenTask} /> : null}
          </div>
        );
      })}

      {state.projects.length === 0 ? <EmptyState>No projects yet.</EmptyState> : null}
    </div>
  );
}

/**
 * Area tasks with no project, collapsed.
 *
 * Listed in full they turned this screen into a second task list — the same
 * to-dos already on the Tasks tab, without the project structure that's the
 * reason to be here. Collapsed, the page stays about projects and the loose ends
 * are still one tap away.
 */
function UnfiledTasks({
  tasks,
  onOpenTask,
}: {
  tasks: { id: string; title: string }[];
  onOpenTask?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-[10px] border border-dashed border-border p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
          {tasks.length} task{tasks.length === 1 ? '' : 's'} with no project
        </span>
        <span className="ml-auto text-[10.5px] text-muted-foreground">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open
        ? tasks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpenTask?.(t.id)}
              className="block w-full py-[3px] text-left text-[12.5px] active:opacity-60"
            >
              {t.title}
            </button>
          ))
        : null}
    </div>
  );
}

function ProjectCard({
  project,
  onStatusChange,
  onOpenTask,
}: {
  project: Project;
  onStatusChange: (status: Status) => void;
  onOpenTask?: (id: string) => void;
}) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);

  // Top-level tasks only — subtasks belong under their parent, not on the board,
  // which is the same rule the desktop project view uses.
  const mine = projectTasks(state, project.id);
  const groups = groupByPhase(state, project.id, mine);
  const done = mine.filter(isDone).length;
  const pct = mine.length ? Math.round((done / mine.length) * 100) : 0;
  const stalled = isStalled(project, state.settings.stallDays);

  return (
    <div className="mb-[10px] rounded-[10px] border border-border bg-card p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left">
        <div className="flex items-start gap-2">
          <span
            className="mt-[6px] h-[8px] w-[8px] shrink-0 rounded-full"
            style={{
              background: stalled
                ? 'hsl(8 60% 47%)'
                : project.status === 'on-hold'
                  ? 'hsl(220 9% 60%)'
                  : 'hsl(152 30% 40%)',
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">{project.name}</div>
            {project.outcome ? (
              <p className="m-0 mt-[2px] text-[11.5px] leading-[1.45] text-muted-foreground">
                {project.outcome}
              </p>
            ) : null}
          </div>
          <PriorityChip priority={project.priority} />
        </div>

        <div className="mt-[10px] flex items-center gap-2">
          <div
            className="h-[5px] flex-1 overflow-hidden rounded-full"
            style={{ background: 'hsl(var(--muted))' }}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular shrink-0 text-[10.5px] text-muted-foreground">
            {done}/{mine.length}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-[6px]">
          {stalled ? <Badge tone="danger">stalled {staleDays(project)}d</Badge> : null}
          {project.status === 'on-hold' ? <Badge tone="muted">on hold</Badge> : null}
          {project.status === 'done' ? <Badge tone="ok">done</Badge> : null}
        </div>
      </button>

      {open ? (
        <div className="mt-3 border-t border-border pt-3">
          {mine.length ? (
            groups.map(({ milestone, tasks }) => {
              const p = progress(tasks);
              return (
                <div key={milestone?.id ?? 'none'} className="mb-3 last:mb-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      {milestone ? milestone.name : 'No phase'}
                    </span>
                    <span className="tabular text-[10.5px] text-muted-foreground">
                      {p.done} of {p.total}
                    </span>
                    <div
                      className="ml-auto h-[4px] w-[52px] shrink-0 overflow-hidden rounded-full"
                      style={{ background: 'hsl(var(--muted))' }}
                    >
                      <div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} />
                    </div>
                  </div>
                  {milestone?.detail ? (
                    <p className="m-0 mt-[1px] text-[10.5px] leading-[1.4] text-muted-foreground">
                      {milestone.detail}
                    </p>
                  ) : null}
                  {tasks.length ? (
                    tasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onOpenTask?.(t.id)}
                        className="block w-full py-[4px] text-left text-[12.5px] active:opacity-60"
                      >
                        <span style={isDone(t) ? { textDecoration: 'line-through', opacity: 0.5 } : undefined}>
                          {t.title}
                        </span>
                        {/* Only open blockers — a finished one isn't holding this up. */}
                        {openBlockers(state, t).length ? (
                          <span className="ml-[6px] text-[10.5px] font-semibold text-[hsl(8_55%_45%)]">
                            waiting on {openBlockers(state, t).length}
                          </span>
                        ) : null}
                      </button>
                    ))
                  ) : (
                    <p className="m-0 py-[3px] text-[11.5px] italic opacity-50">Nothing here yet.</p>
                  )}
                </div>
              );
            })
          ) : (
            <p className="m-0 text-[12px] italic opacity-55">No tasks filed to this project.</p>
          )}

          <div className="mt-3 flex flex-wrap gap-[6px]">
              {(['active', 'on-hold', 'done'] as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStatusChange(s)}
                  className="rounded-[14px] border px-[10px] py-[5px] text-[11.5px] font-semibold"
                  style={{
                    borderColor: project.status === s ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                    background: project.status === s ? 'hsl(var(--primary))' : 'transparent',
                    color:
                      project.status === s
                        ? 'hsl(var(--primary-foreground))'
                        : 'hsl(var(--foreground))',
                  }}
                >
                  {s}
                </button>
            ))}
          </div>

          <ProjectShare project={project} />
        </div>
      ) : null}
    </div>
  );
}

// Public, no-login share link for a whole project — the phone counterpart of the desktop
// ShareProjectDialog. Reuses the same cloud.shareProject / revokeProjectShare and the persisted
// project.share token, so a link made on the phone matches one made on the computer.
function ProjectShare({ project }: { project: Project }) {
  const cloud = useCloud();
  const { updateProject } = useStore();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const token = project.share?.token;
  const link = token ? `${window.location.origin}/share/project/${token}` : '';

  if (!cloud) {
    return (
      <p className="mt-3 m-0 text-[11.5px] italic text-muted-foreground">
        Sign in to a real account to share this project by link.
      </p>
    );
  }

  const create = async () => {
    setBusy(true);
    const { token: t, error } = await cloud.shareProject(project.id);
    setBusy(false);
    if (error || !t) {
      toast.error(error ?? 'Couldn’t create the link');
      return;
    }
    updateProject(project.id, { share: { token: t, createdAt: new Date().toISOString() } });
    toast.success('Share link ready');
  };
  const revoke = async () => {
    if (!token) return;
    setBusy(true);
    await cloud.revokeProjectShare(token);
    setBusy(false);
    updateProject(project.id, { share: undefined });
    toast('Link turned off');
  };
  const copy = () => {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mt-3 rounded-[10px] border border-border p-3">
      <div className="mb-2 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
        Share this project
      </div>
      {!token ? (
        <>
          <p className="m-0 mb-2 text-[11.5px] leading-[1.5] text-muted-foreground">
            A read-only link anyone can open — no account needed on their end. They see this
            project's progress, phases, tasks and notes, and can tick tasks done or post an update
            that comes back to you.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={create}
            className="w-full rounded-lg bg-primary py-[10px] text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? 'Creating…' : 'Create share link'}
          </button>
        </>
      ) : (
        <>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-border bg-background px-3 py-[8px] text-[12px]"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="rounded-lg border border-border px-3 py-[8px] text-[12px] font-semibold active:opacity-60"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={revoke}
              className="ml-auto text-[12px] font-semibold text-[hsl(8_60%_45%)] disabled:opacity-60"
            >
              Turn off
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'danger' | 'muted' | 'ok' }) {
  const styles = {
    danger: { background: 'hsl(8 60% 41%)', color: 'hsl(45 50% 96%)' },
    muted: { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
    ok: { background: 'hsl(160 25% 88%)', color: 'hsl(160 25% 24%)' },
  }[tone];
  return (
    <span
      className="rounded-[4px] px-[6px] py-[2px] text-[10px] font-bold uppercase tracking-[0.04em]"
      style={styles}
    >
      {children}
    </span>
  );
}
