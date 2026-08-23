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

export function useIsMobile(): { isMobile: boolean; override: LayoutOverride; setOverride: (v: LayoutOverride) => void } {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < BREAKPOINT,
  )
  const [override, setOverrideState] = useState<LayoutOverride>(readOverride)

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
