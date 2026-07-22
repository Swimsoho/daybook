import * as React from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SearchableSelectOption {
  value: string
  label: string
  /** Sub-label rendered lighter/smaller next to the label (e.g. a parent category) */
  hint?: string
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
}

// A drop-in alternative to <Select> for pickers whose option list grows over time (areas,
// categories, actions, people, projects, trackers, ...). Adds a search box to filter by typing,
// and expects `options` pre-ordered by the caller — usually "frequently used" items first (see
// `withPopularFirst` in lib/store.tsx), then everything else alphabetically. Built as a plain
// controlled popover (no extra Radix dependency) so it drops into the same flex/grid layouts the
// existing shadcn Select already sits in.
export function SearchableSelect({
  value, onValueChange, options, popularCount = 0, placeholder = "Select…", className, disabled, searchPlaceholder = "Search…",
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocMouseDown)
    document.addEventListener("keydown", onKeyDown)
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown)
      document.removeEventListener("keydown", onKeyDown)
      clearTimeout(t)
    }
  }, [open])

  React.useEffect(() => { if (!open) setQuery("") }, [open])

  const selected = options.find(o => o.value === value)
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)) : options
  // Only show the "Frequent" divider when we're not filtering (search results are just one flat
  // relevance-ish list) and there's a rest-of-list to actually divide from.
  const showDivider = !q && popularCount > 0 && popularCount < filtered.length

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground",
          className
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 min-w-full w-max max-w-[280px] rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto p-1">
            {filtered.length === 0 && (
              <div className="px-2 py-2 text-[12px] text-muted-foreground italic">No matches</div>
            )}
            {filtered.map((o, i) => (
              <React.Fragment key={o.value}>
                {showDivider && i === 0 && (
                  <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">Frequent</div>
                )}
                {showDivider && i === popularCount && (
                  <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">All</div>
                )}
                <button
                  type="button"
                  onClick={() => { onValueChange(o.value); setOpen(false) }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] outline-none hover:bg-accent hover:text-accent-foreground",
                    o.value === value && "bg-accent/60"
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate flex-1">{o.label}</span>
                  {o.hint && <span className="text-[10.5px] text-muted-foreground shrink-0">{o.hint}</span>}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
