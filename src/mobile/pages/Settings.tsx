import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { THEMES } from '@/lib/themes'
import { SectionTitle } from '@/mobile/components/bits'

/**
 * Mobile Settings — the handful of settings you actually want to change from a
 * phone: palette, daily capacity, and a way back to the full desktop screen.
 *
 * The desktop Settings page is deliberately not reproduced here. It carries
 * focus areas, categories, actions, tiers, tracker design, feature toggles,
 * messaging channels and admin — configuration you do once, sitting down, not
 * one-handed on a train. Everything here writes through the same store, so a
 * change made on the phone is the same change made on the laptop.
 */
export function Settings({ onSwitchToDesktop }: { onSwitchToDesktop?: () => void }) {
  const { state, updateSettings } = useStore()
  const { settings } = state

  return (
    <div>
      <SectionTitle className="mb-[10px]">Appearance</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {THEMES.map(theme => {
          const selected = theme.id === settings.theme
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => updateSettings({ theme: theme.id })}
              aria-pressed={selected}
              title={theme.blurb}
              className="flex flex-col items-center rounded-[10px] px-1 py-[10px]"
              style={{
                border: `1.5px solid ${selected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                background: theme.swatch[0],
              }}
            >
              {/* the repo's own three-dot swatch: background, primary, accent */}
              <span className="flex gap-[3px]">
                {theme.swatch.map((c, i) => (
                  <Dot key={i} color={c} border={i === 0 ? 'hsl(var(--border))' : undefined} />
                ))}
              </span>
              <span className="mt-[6px] text-[10px] font-semibold text-foreground">{theme.name}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-[22px]">
        <SectionTitle className="mb-[10px]">Capacity</SectionTitle>
        <div className="flex items-center justify-between rounded-[10px] border border-border bg-card px-[14px] py-3">
          <div>
            <div className="text-[13px] font-semibold">Daily capacity</div>
            <div className="text-[11px] text-muted-foreground">Tasks you expect to finish</div>
          </div>
          <div className="flex items-center gap-3">
            <Stepper
              label="Decrease"
              onClick={() =>
                updateSettings({ dailyCapacity: Math.max(1, settings.dailyCapacity - 1) })
              }
            >
              −
            </Stepper>
            <span className="tabular font-display text-[20px] font-semibold">
              {settings.dailyCapacity}
            </span>
            <Stepper
              label="Increase"
              onClick={() =>
                updateSettings({ dailyCapacity: Math.min(20, settings.dailyCapacity + 1) })
              }
            >
              +
            </Stepper>
          </div>
        </div>
      </div>

      <div className="mt-[22px]">
        <SectionTitle className="mb-[10px]">Call goal</SectionTitle>
        <div className="flex items-center justify-between rounded-[10px] border border-border bg-card px-[14px] py-3">
          <div>
            <div className="text-[13px] font-semibold">Calls per week</div>
            <div className="text-[11px] text-muted-foreground">Drives the Overall KPI</div>
          </div>
          <div className="flex items-center gap-3">
            <Stepper
              label="Fewer calls"
              onClick={() => updateSettings({ callGoal: Math.max(0, settings.callGoal - 1) })}
            >
              −
            </Stepper>
            <span className="tabular font-display text-[20px] font-semibold">
              {settings.callGoal}
            </span>
            <Stepper
              label="More calls"
              onClick={() => updateSettings({ callGoal: Math.min(50, settings.callGoal + 1) })}
            >
              +
            </Stepper>
          </div>
        </div>
      </div>

      <div className="mt-[22px] rounded-[10px] border border-dashed border-border p-[14px]">
        <div className="text-[12.5px] font-semibold">Everything else</div>
        <p className="m-0 mt-1 text-[11.5px] leading-[1.55] text-muted-foreground">
          Focus areas, categories, actions, contact tiers, tracker fields, feature
          toggles and messaging channels all live on the desktop layout. Same
          account, same data — just a screen with room for them.
        </p>
        {onSwitchToDesktop ? (
          <button
            type="button"
            onClick={() => {
              onSwitchToDesktop()
              toast('Switched to the desktop layout')
            }}
            className="mt-3 w-full rounded-lg border border-border py-[11px] text-[13px] font-semibold active:opacity-70"
          >
            Open the desktop layout
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Dot({ color, border }: { color: string; border?: string }) {
  return (
    <span
      className="block h-[9px] w-[9px] rounded-full"
      style={{ background: color, border: border ? `1px solid ${border}` : undefined }}
    />
  )
}

function Stepper({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border bg-transparent text-[14px] leading-none active:opacity-70"
    >
      {children}
    </button>
  )
}
