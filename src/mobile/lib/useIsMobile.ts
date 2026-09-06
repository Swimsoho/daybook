import { useEffect, useState } from 'react'

/**
 * Which layout to render.
 *
 * Below this width the phone layout takes over; above it, the desktop shell.
 * 768px is Tailwind's `md` breakpoint, which the desktop layout already uses to
 * switch its sidebar into a drawer — so the two agree about what "small" means.
 *
 * A saved override wins over the width, so someone can force the desktop layout
 * on a tablet (or the phone layout on a laptop, which is how you'd check the
 * mobile design without a phone in your hand).
 */
const BREAKPOINT = 768
const OVERRIDE_KEY = 'daybook.layout'

export type LayoutOverride = 'mobile' | 'desktop' | null

export function readOverride(): LayoutOverride {
  try {
    const v = localStorage.getItem(OVERRIDE_KEY)
    return v === 'mobile' || v === 'desktop' ? v : null
  } catch {
    return null
  }
}

export function writeOverride(v: LayoutOverride) {
  try {
    if (v) localStorage.setItem(OVERRIDE_KEY, v)
    else localStorage.removeItem(OVERRIDE_KEY)
  } catch {
    /* private mode — the choice just doesn't persist */
  }
}

/**
 * A recovery / preview escape hatch via the URL: `?layout=mobile`, `?layout=desktop`,
 * or `?layout=auto` (clear the override and go back to following the screen width).
 * Typed into the address bar, it works on any device — the point being that if someone
 * forces a layout and can't find the button back, a link always gets them out.
 * Returns `undefined` when no (recognised) param is present, distinct from `null` = reset.
 */
function layoutFromUrl(): LayoutOverride | undefined {
  try {
    const p = new URLSearchParams(window.location.search).get('layout')
    if (p === 'mobile' || p === 'desktop') return p
    if (p === 'auto' || p === 'clear' || p === 'reset') return null
  } catch { /* no URL / blocked — ignore */ }
  return undefined
}

export function useIsMobile(): { isMobile: boolean; override: LayoutOverride; setOverride: (v: LayoutOverride) => void } {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < BREAKPOINT,
  )
  // A `?layout=` param wins on load and is persisted, so a recovery link sticks after reload.
  const [override, setOverrideState] = useState<LayoutOverride>(() => {
    const fromUrl = layoutFromUrl()
    if (fromUrl !== undefined) { writeOverride(fromUrl); return fromUrl }
    return readOverride()
  })

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${BREAKPOINT - 1}px)`)
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setNarrow(e.matches)
    onChange(mq)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setOverride = (v: LayoutOverride) => {
    writeOverride(v)
    setOverrideState(v)
  }

  return {
    isMobile: override ? override === 'mobile' : narrow,
    override,
    setOverride,
  }
}
