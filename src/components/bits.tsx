import React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Priority, PRIORITY_LABELS, relDue, Tier, TIER_LABELS } from '@/lib/model'
import { useStore } from '@/lib/store'

export function PriorityChip({ p, className }: { p: Priority; className?: string }) {
  const { state } = useStore()
  const label = PRIORITY_LABELS[state.settings.priorityScheme][p]
  const styles: Record<Priority, string> = {
    P0: 'bg-[hsl(8_60%_41%)] text-[hsl(45_50%_96%)]',
    P1: 'bg-[hsl(35_70%_88%)] text-[hsl(28_60%_28%)] border border-[hsl(35_50%_70%)]',
    P2: 'bg-[hsl(160_25%_88%)] text-[hsl(160_25%_24%)] border border-[hsl(160_20%_70%)]',
    P3: 'bg-transparent text-muted-foreground border border-border',
  }
  return (
    <span className={cn('inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide tabular', styles[p], className)}>
      {label}
    </span>
  )
}

export function AreaDot({ areaId, withName = false }: { areaId?: string; withName?: boolean }) {
  const { state } = useStore()
  const area = state.areas.find(a => a.id === areaId)
  if (!area) return withName ? <span className="text-xs text-muted-foreground">no area</span> : null
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: area.color }} />
      {withName && <span>{area.name}</span>}
    </span>
  )
}

export function DueChip({ due }: { due?: string }) {
  const r = relDue(due)
  if (r.tone === 'none') return null
  const cls = {
    overdue: 'text-[hsl(8_60%_41%)] font-semibold',
    today: 'text-[hsl(28_60%_32%)] font-semibold',
    soon: 'text-foreground/70',
    later: 'text-muted-foreground',
    none: '',
  }[r.tone]
  return <span className={cn('text-xs tabular whitespace-nowrap', cls)}>{r.label}</span>
}

export function TierBadge({ tier }: { tier: Tier }) {
  const styles: Record<Tier, string> = {
    inner: 'bg-[hsl(17_63%_47%)] text-[hsl(45_50%_96%)]',
    active: 'bg-[hsl(152_25%_32%)] text-[hsl(45_50%_96%)]',
    network: 'bg-[hsl(215_35%_88%)] text-[hsl(215_40%_28%)]',
    dormant: 'bg-muted text-muted-foreground',
  }
  return <Badge className={cn('rounded-sm text-[10.5px] uppercase tracking-wide hover:opacity-90', styles[tier])}>{TIER_LABELS[tier]}</Badge>
}

export function SectionTitle({ children, right, className }: { children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 mb-3', className)}>
      <h2 className="flex items-baseline gap-2">
        <span className="inline-block w-[3px] h-[13px] rounded-full bg-primary/80 translate-y-[1.5px] shrink-0" aria-hidden="true" />
        <span className="font-display text-[17.5px] font-semibold tracking-tight">{children}</span>
      </h2>
      {right}
    </div>
  )
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground italic py-4 text-center">{children}</p>
}

export function Stars({ n, onChange }: { n: number; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(i)}
          className={cn('text-sm leading-none', i <= n ? 'text-[hsl(40_65%_42%)]' : 'text-border', onChange && 'cursor-pointer hover:scale-110 transition-transform')}
        >
          ★
        </button>
      ))}
    </span>
  )
}

export function KpiTile({ label, value, sub, tone, onClick }: { label: string; value: React.ReactNode; sub?: string; tone?: 'bad' | 'good'; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'rise-in border border-border bg-card px-4 py-3 flex flex-col gap-0.5 min-w-0 text-left',
        onClick && 'cursor-pointer transition-all hover:border-[hsl(152_22%_40%)] hover:shadow-sm hover:-translate-y-px active:translate-y-0',
      )}
    >
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground truncate">{label}{onClick && ' ↗'}</span>
      <span className={cn('font-display text-[26px] leading-none font-semibold tabular', tone === 'bad' && 'text-[hsl(8_60%_41%)]', tone === 'good' && 'text-[hsl(152_25%_32%)]')}>{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground truncate">{sub}</span>}
    </Comp>
  )
}

export function ClearFiltersButton({ active, onClear }: { active: boolean; onClear: () => void }) {
  if (!active) return null
  return (
    <button
      onClick={onClear}
      className="inline-flex items-center gap-1 h-8 px-2.5 text-[12px] border border-[hsl(17_40%_60%)] text-[hsl(17_63%_40%)] bg-[hsl(17_63%_47%_/_0.07)] rounded-sm hover:bg-[hsl(17_63%_47%_/_0.14)] transition-colors"
    >
      ✕ Clear filters
    </button>
  )
}
