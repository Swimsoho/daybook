import type { Priority } from '@/lib/model';

/**
 * Fixed semantic colors — the same whichever palette is active. Priority red
 * means the same thing in every theme, which is the point of it being fixed.
 *
 * Tier and area colors are NOT here: those are user-editable data on the
 * platform (`settings.tiers`, `state.areas`), read through lib/select.ts.
 */

export const PRIORITY_STYLES: Record<Priority, React.CSSProperties> = {
  P0: { background: 'hsl(8 60% 41%)', color: 'hsl(45 50% 96%)', border: '1px solid transparent' },
  P1: { background: 'hsl(35 70% 88%)', color: 'hsl(28 60% 28%)', border: '1px solid hsl(35 50% 70%)' },
  P2: { background: 'hsl(160 25% 88%)', color: 'hsl(160 25% 24%)', border: '1px solid hsl(160 20% 70%)' },
  P3: { background: 'transparent', color: 'hsl(75 8% 40%)', border: '1px solid hsl(var(--border))' },
};

/** solid fill for a selected priority in a segmented control */
export const PRIORITY_SOLID: Record<Priority, string> = {
  P0: 'hsl(8 60% 41%)',
  P1: 'hsl(28 60% 40%)',
  P2: 'hsl(160 25% 35%)',
  P3: 'hsl(75 8% 40%)',
};

/** the fixed red used by the Overdue KPI and destructive controls */
export const DANGER = {
  kpi: 'hsl(8 62% 46%)',
  text: 'hsl(8 60% 40%)',
  border: 'hsl(8 40% 60%)',
  tint: 'hsl(8 60% 47% / 0.08)',
  solid: 'hsl(8 60% 47%)',
};
