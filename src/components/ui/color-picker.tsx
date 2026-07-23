import * as React from "react"
import { cn } from "@/lib/utils"
import { DOT_PALETTE } from "@/lib/colors"

// A small colour dot that opens a swatch popover when clicked — used for Focus areas and
// Categories in Settings so their colours are actually editable (and visible), not just a
// static dot. Plain controlled popover, no extra dependency, closes on outside-click / Escape.
export function ColorPicker({
  value, onChange, size = 12, title = "Change colour", className,
}: {
  value: string
  onChange: (color: string) => void
  size?: number
  title?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey) }
  }, [open])

  return (
    <div ref={ref} className={cn("relative shrink-0 leading-none", className)}>
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={() => setOpen(o => !o)}
        className="rounded-full border border-black/15 hover:ring-2 hover:ring-border transition-shadow cursor-pointer"
        style={{ background: value, width: size, height: size }}
      />
      {open && (
        <div className="absolute z-50 mt-1 left-0 grid grid-cols-6 gap-1.5 p-2 rounded-md border bg-popover shadow-md">
          {DOT_PALETTE.map(c => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => { onChange(c); setOpen(false) }}
              className={cn(
                "h-5 w-5 rounded-full border border-black/10 hover:scale-110 transition-transform",
                c === value && "ring-2 ring-offset-1 ring-foreground",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
