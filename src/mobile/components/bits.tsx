import type { CSSProperties, ReactNode } from 'react';
import { PRIORITY_STYLES } from '@/mobile/lib/colors';
import type { Area, Priority } from '@/lib/model';

/**
 * Shared primitives — the mobile counterpart of the repo's src/components/bits.tsx.
 * Every value here traces to the handoff token table.
 */

/** 3×13px primary bar + Fraunces label. Used for every section header in the app. */
export function SectionTitle({
  children,
  size = 16,
  className = '',
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span
        className="inline-block w-[3px] h-[13px] rounded-[2px] shrink-0"
        style={{ background: 'hsl(var(--primary) / 0.8)' }}
      />
      <span className="font-display font-semibold" style={{ fontSize: size }}>
        {children}
      </span>
    </div>
  );
}

export function PriorityChip({ priority }: { priority: Priority }) {
  return (
    <span
      className="inline-flex items-center rounded-[4px] px-[6px] py-[2px] text-[10px] font-bold uppercase tracking-[0.04em]"
      style={PRIORITY_STYLES[priority]}
    >
      {priority}
    </span>
  );
}

export function AreaTag({ area }: { area: Area | undefined }) {
  if (!area) return null;
  return (
    <span className="inline-flex items-center gap-[5px] text-[11px] text-muted-foreground">
      <span
        className="inline-block w-[6px] h-[6px] rounded-full shrink-0"
        style={{ background: area.color }}
      />
      {area.name}
    </span>
  );
}

export function DueLabel({ due }: { due: { label: string; tone: string; strong: boolean } }) {
  return (
    <span
      className="text-[11px] whitespace-nowrap"
      style={{ color: due.tone, fontWeight: due.strong ? 600 : 400 }}
    >
      {due.label}
    </span>
  );
}

export function TierBadge({
  label,
  color,
  size = 'sm',
}: {
  label: string;
  color: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={`shrink-0 rounded-[4px] uppercase tracking-[0.05em] text-white ${
        size === 'sm' ? 'text-[9.5px] px-[6px] py-[2px]' : 'text-[10px] px-[7px] py-[3px]'
      }`}
      style={{ background: color }}
    >
      {label}
    </span>
  );
}

export function Avatar({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size >= 34 ? 13 : 12,
      }}
      aria-hidden
    >
      {name.charAt(0)}
    </span>
  );
}

export function CallButton({
  phone,
  label = 'Call',
  full = false,
}: {
  phone: string;
  label?: string;
  full?: boolean;
}) {
  return (
    <a
      href={`tel:${phone}`}
      onClick={(e) => e.stopPropagation()}
      className={`${
        full ? 'block w-full py-[11px] text-[13px] rounded-lg' : 'rounded-[14px] px-3 py-[5px] text-[11.5px]'
      } shrink-0 text-center font-semibold no-underline bg-primary text-primary-foreground`}
    >
      {label}
    </a>
  );
}

/** the two button shapes used across every sheet footer */
export function PrimaryButton({
  children,
  onClick,
  style,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="flex-1 rounded-lg py-[11px] text-[13px] font-semibold bg-primary text-primary-foreground active:opacity-80"
      style={style}
    >
      {children}
    </button>
  );
}

export function OutlineButton({
  children,
  onClick,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg py-[11px] text-[13px] font-semibold border border-border bg-transparent active:opacity-70"
      style={style}
    >
      {children}
    </button>
  );
}

/** horizontally scrollable pill filter */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-[14px] px-3 py-[6px] text-[12px] font-semibold whitespace-nowrap border"
      style={{
        borderColor: active ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        background: active ? 'hsl(var(--primary))' : 'transparent',
        color: active ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
      }}
    >
      {children}
    </button>
  );
}

/** segmented control used for Priority / Area / Tier pickers */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-[6px] mb-3" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="rounded-[7px] px-[10px] py-[7px] text-[12px] font-semibold border"
            style={{
              borderColor: active ? o.color : 'hsl(var(--border))',
              background: active ? o.color : 'transparent',
              color: active ? '#fff' : 'hsl(var(--foreground))',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full box-border mb-3 rounded-[7px] border border-border bg-card px-[10px] py-[9px] text-[13px] outline-none focus:border-primary';

export const textareaClass = `${inputClass} min-h-[56px] resize-none`;

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-center italic opacity-55 text-[13px] py-8 m-0">{children}</p>;
}

/**
 * Shown wherever an edit control would otherwise be, while the app is showing
 * the user's live cloud workspace. Says what is switched off and why, rather
 * than leaving a dead-looking gap.
 */
export function ReadOnlyNote({ compact = false }: { compact?: boolean }) {
  return (
    <p
      className={`m-0 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11.5px] leading-[1.5] text-muted-foreground ${
        compact ? '' : 'text-center'
      }`}
    >
      Read-only — this is your live workspace. Editing from mobile is switched
      off until saving is concurrency-safe.
    </p>
  );
}
