import { useEffect, type ReactNode } from 'react';

/**
 * Bottom sheet — backdrop tap closes, drag handle sits at the top of every sheet.
 *
 * The prototype's handle was decorative. This one is real: it responds to a
 * downward drag (and to Escape / a swipe on the handle), because a handle that
 * doesn't drag is the kind of thing that reads as broken on a phone. The handoff
 * explicitly flags "add real gesture dismissal in the native/RN build".
 */
export function BottomSheet({
  open,
  onClose,
  height,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** CSS height, e.g. '52%' */
  height: string;
  title?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="absolute inset-0 z-40 bg-black/40 animate-[fade_140ms_ease-out]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 z-[41] flex flex-col rounded-t-[20px] bg-card px-[18px] pt-4 pb-[26px] shadow-[0_-8px_30px_rgba(0,0,0,0.2)] animate-[sheet-up_180ms_cubic-bezier(0.32,0.72,0,1)]"
        style={{ height }}
      >
        <DragHandle onDismiss={onClose} />
        {title ? <div className="mb-3 shrink-0">{title}</div> : null}
        <div className="min-h-0 flex-1 overflow-auto no-scrollbar">{children}</div>
      </div>
    </>
  );
}

function DragHandle({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="-mt-1 mb-2 flex shrink-0 cursor-grab touch-none justify-center py-2"
      onPointerDown={(e) => {
        const startY = e.clientY;
        const el = e.currentTarget;
        const sheet = el.parentElement as HTMLElement | null;
        el.setPointerCapture(e.pointerId);

        const move = (ev: PointerEvent) => {
          const dy = Math.max(0, ev.clientY - startY);
          if (sheet) sheet.style.transform = `translateY(${dy}px)`;
        };
        const up = (ev: PointerEvent) => {
          el.releasePointerCapture(ev.pointerId);
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          const dy = ev.clientY - startY;
          if (sheet) sheet.style.transform = '';
          if (dy > 80) onDismiss();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      }}
    >
      <span className="block h-1 w-9 rounded-full" style={{ background: 'hsl(42 22% 78%)' }} />
    </div>
  );
}

export function SheetTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-[17.5px] font-semibold m-0">{children}</h2>;
}
