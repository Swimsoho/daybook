import { useCallback, useEffect, useRef, useState } from 'react';

/** small primary pill, centred ~64px from the top, auto-dismisses after 2s */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-[20px] bg-primary px-4 py-2 text-[12.5px] font-semibold text-primary-foreground shadow-[0_4px_14px_rgba(0,0,0,0.2)] animate-[toast-in_160ms_ease-out]"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((msg: string) => {
    setMessage(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 2000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { message, show };
}
