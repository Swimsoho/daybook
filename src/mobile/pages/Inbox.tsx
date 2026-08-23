import { pendingCaptures } from '@/mobile/lib/select';
import { useStore } from '@/lib/store';
import { toast } from 'sonner';
import { EmptyState } from '@/mobile/components/bits';
import { fmtDate } from '@/lib/model';

/**
 * Inbox — confirm or dismiss the AI router's filing proposals.
 * The proposal shape is the platform's `RoutingProposal`, so what you see here
 * is exactly what the web app would act on.
 */
export function Inbox() {
  const { state, acceptCapture, dismissCapture } = useStore();
  const captures = pendingCaptures(state);

  return (
    <div>
      <p className="m-0 mb-3 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
        {captures.length} pending capture{captures.length === 1 ? '' : 's'}
      </p>

      {captures.length === 0 ? <EmptyState>Inbox is clear.</EmptyState> : null}

      {captures.map((capture) => {
        const area = state.areas.find((a) => a.id === capture.proposal.areaId);
        const project = state.projects.find((p) => p.id === capture.proposal.projectId);
        const route = [capture.proposal.kind, area?.name, project?.name, capture.proposal.priority]
          .filter(Boolean)
          .join(' · ');

        return (
          <div key={capture.id} className="mb-[10px] rounded-[10px] border border-border bg-card p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                {capture.source}
              </span>
              <span className="text-[10.5px] text-muted-foreground">
                {fmtDate(capture.created.slice(0, 10))}
              </span>
            </div>

            <p className="my-[6px] text-[13.5px] italic leading-[1.4]">“{capture.text}”</p>

            <p className="m-0 text-[11.5px]" style={{ color: 'hsl(152 22% 30%)' }}>
              → {route}
            </p>
            {capture.proposal.explanation ? (
              <p className="m-0 mt-1 text-[11px] leading-[1.45] text-muted-foreground">
                {capture.proposal.explanation}
              </p>
            ) : null}

            <div className="mt-[10px] flex gap-2">
              <button
                type="button"
                onClick={() => {
                  acceptCapture(capture.id);
                  toast.success('Filed');
                }}
                className="flex-1 rounded-[7px] border-none bg-primary py-2 text-[12px] font-semibold text-primary-foreground active:opacity-80"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissCapture(capture.id);
                  toast('Dismissed');
                }}
                className="flex-1 rounded-[7px] border border-border bg-transparent py-2 text-[12px] font-semibold active:opacity-70"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
