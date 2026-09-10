import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * "A new version is available — Reload" prompt.
 *
 * Daybook is a PWA: a service worker caches the app shell so it loads instantly and works offline.
 * The catch is that a browser tab left open keeps running the *old* cached version until the worker
 * is updated — which is why a plain refresh sometimes didn't show the latest changes and people had
 * to hard-reload (Ctrl/Cmd+Shift+R). This removes that entirely: when a new version has been
 * deployed, the app notices on its own and shows a small banner. One tap on **Reload** swaps in the
 * new version — no keyboard shortcut, no guessing whether you're up to date.
 *
 * We also poll for updates every few minutes while the app is open, so a deploy is picked up soon
 * after it lands rather than only on the next cold start.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // Check for a newer deploy every 3 minutes while a tab is open.
      setInterval(() => { registration.update().catch(() => {}) }, 3 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-[200] flex justify-center px-4 pointer-events-none"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-lg max-w-[calc(100vw-2rem)]">
        <span className="h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" aria-hidden />
        <span className="text-[13px] text-foreground">A new version of Daybook is available.</span>
        <button
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Reload
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="shrink-0 rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          Later
        </button>
      </div>
    </div>
  )
}
