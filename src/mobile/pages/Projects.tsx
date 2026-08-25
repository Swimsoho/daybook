import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PriorityChip, SectionTitle } from '@/mobile/components/bits';
import { activeAreas, isClosed, isDone, isStalled, staleDays } from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
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

            {loose.length ? (
              <div className="mt-2 rounded-[10px] border border-dashed border-border p-3">
                <div className="mb-1 text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                  Loose tasks · no project
                </div>
                {loose.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpenTask?.(t.id)}
                    className="block w-full py-[3px] text-left text-[12.5px] active:opacity-60"
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      {state.projects.length === 0 ? <EmptyState>No projects yet.</EmptyState> : null}
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
        </div>
      ) : null}
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
