import { Plus } from 'lucide-react';

/** primary circle floating above the tab bar — opens Quick capture */
export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Quick capture"
      className="absolute bottom-[88px] right-4 z-20 flex h-[52px] w-[52px] items-center justify-center rounded-full border-none bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(0,0,0,0.25)] active:scale-95 transition-transform"
    >
      <Plus size={24} strokeWidth={2.2} />
    </button>
  );
}
