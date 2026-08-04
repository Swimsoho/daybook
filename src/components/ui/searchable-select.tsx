import * as React from "react"
import { Check, ChevronDown, Plus, Search } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SearchableSelectOption {
  value: string
  label: string
  /** Sub-label rendered lighter/smaller next to the label (e.g. a parent category) */
  hint?: string
  /** Optional colour dot shown before the label (areas / categories / actions) */
  color?: string
}

export interface SearchableSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: SearchableSelectOption[]
  /** How many leading options (already in `options` order) count as "Frequent" and get a divider after them */
  popularCount?: number
  placeholder?: string
  className?: string
  disabled?: boolean
  searchPlaceholder?: string
  /** When set, an "+ Add …" row appears for a typed name that doesn't already exist, letting the
   *  user create the entity inline. The handler receives the trimmed typed text; it should create
   *  the record AND select it (the menu closes automatically). */
  onCreate?: (label: string) => void
  /** Label for the create row (defaults to `Add "<query>"`). */
  createLabel?: (query: string) => string
}

// Finds the nearest scrollable ancestor — that element's box (not the viewport) is what actually
// clips an in-flow dropdown, so we measure available space against it to decide flip + max-height.
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if (oy === "auto" || oy === "scroll" || oy === "overlay") return node
    node = node.parentElement
  }
  return null
}

// A drop-in alternative to <Select> for pickers whose option list grows over time (areas,
// categories, actions, people, projects, trackers, ...). Adds a search box to filter by typing,
// and expects `options` pre-ordered by the caller — usually "frequently used" items first (see
// `withPopularFirst` in lib/store.tsx), then everything else alphabetically.
//
// The panel stays IN-FLOW (so it lives inside a dialog's focus scope and its search box is
// typable), but it flips above the trigger and caps its own height to the space available inside
// the clipping ancestor — so it is never cut off at the bottom of a scrollable dialog.
export function SearchableSelect({
  value, onValueChange, options, popularCount = 0, placeholder = "Select…", className, disabled,
  searchPlaceholder = "Search…", onCreate, createLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [layout, setLayout] = React.useState<{ up: boolean; maxH: number }>({ up: false, maxH: 300 })

  const measure = React.useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const clip = scrollParent(el)?.getBoundingClientRect()
    const topBound = clip ? clip.top : 0
    const bottomBound = clip ? clip.bottom : window.innerHeight
    const spaceBelow = bottomBound - r.bottom - 10
    const spaceAbove = r.top - topBound - 10
    const up = spaceBelow < 220 && spaceAbove > spaceBelow
    const maxH = Math.max(150, Math.min(320, up ? spaceAbove : spaceBelow))
    setLayout({ up, maxH })
  }, [])

  React.useLayoutEffect(() => {
    if (!open) return
    measure()
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDocMouseDown)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    const t = setTimeout(() => inputRef.current?.focus(), 20)
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
      clearTimeout(t)
    }
  }, [open, measure])

  React.useEffect(() => { if (!open) setQuery("") }, [open])

  const selected = options.find(o => o.value === value)
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)) : options
  const showDivider = !q && popularCount > 0 && popularCount < filtered.length
  const exact = options.some(o => o.label.trim().toLowerCase() === q)
  const canCreate = !!onCreate && q.length >= 2 && !exact

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-card px-3 py-2 text-[13.5px] shadow-sm ring-offset-background transition-colors hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground",
          open && "border-primary/70 ring-2 ring-primary/30",
          className
        )}
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          {selected?.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: selected.color }} />}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 opacity-50 shrink-0 ml-1 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          className={cn(
            "absolute z-[100] left-0 min-w-full w-max max-w-[320px] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-black/5 overflow-hidden animate-in fade-in-0 zoom-in-95",
            layout.up ? "bottom-full mb-1.5" : "top-full mt-1.5"
          )}
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2 bg-muted/40">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && canCreate) { e.preventDefault(); onCreate!(query.trim()); setOpen(false) } }}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="overflow-y-auto p-1.5" style={{ maxHeight: layout.maxH }}>
            {filtered.length === 0 && !canCreate && (
              <div className="px-2 py-3 text-[12.5px] text-muted-foreground italic text-center">No matches</div>
            )}
            {filtered.map((o, i) => (
              <React.Fragment key={o.value}>
                {showDivider && i === 0 && (
                  <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Frequent</div>
                )}
                {showDivider && i === popularCount && (
                  <div className="px-2 pt-2 pb-1 mt-1 border-t border-border/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">All</div>
                )}
                <button
                  type="button"
                  onClick={() => { onValueChange(o.value); setOpen(false) }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13.5px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                    o.value === value && "bg-primary/10 font-medium"
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0 text-primary", o.value === value ? "opacity-100" : "opacity-0")} />
                  {o.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: o.color }} />}
                  <span className="truncate flex-1">{o.label}</span>
                  {o.hint && <span className="text-[10.5px] text-muted-foreground shrink-0">{o.hint}</span>}
                </button>
              </React.Fragment>
            ))}
            {canCreate && (
              <button
                type="button"
                onClick={() => { onCreate!(query.trim()); setOpen(false) }}
                className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border/60 px-2 py-2 text-left text-[13.5px] text-primary font-medium outline-none transition-colors hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{createLabel ? createLabel(query.trim()) : <>Add “{query.trim()}”</>}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
