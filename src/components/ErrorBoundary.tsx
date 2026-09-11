import { Component, type ErrorInfo, type ReactNode } from 'react'

// App-wide safety net. Before this existed, ANY render-time exception (e.g. a malformed saved blob
// making `state.something.filter(...)` throw) unmounted the whole React tree and left a blank white
// page — the user just saw "Daybook" and then nothing, with no way forward but DevTools. This catches
// that, keeps the page usable, shows the actual error (so it can be diagnosed), and offers a plain
// Reload plus a "Clear cached app" button that unregisters the service worker + clears caches — the
// reliable fix when a stale PWA shell is the cause.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the browser console for support/debugging.
    console.error('[Daybook] Uncaught render error:', error, info?.componentStack)
  }

  private async clearAndReload() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
      }
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch { /* best effort */ }
    location.reload()
  }

  render() {
    const err = this.state.error
    if (!err) return this.props.children

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'hsl(45 30% 96%)', color: 'hsl(20 14% 20%)',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}>
        <div style={{
          maxWidth: 520, width: '100%', background: '#fff', border: '1px solid hsl(30 12% 85%)',
          borderRadius: 12, padding: 28, boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Daybook hit a snag</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'hsl(20 10% 40%)', marginTop: 0 }}>
            The app ran into an unexpected error while loading. Your data is safe — this is just the
            screen failing to draw. Try reloading; if that doesn’t help, clear the cached app.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            <button
              onClick={() => location.reload()}
              style={{
                padding: '9px 16px', borderRadius: 8, border: '1px solid hsl(30 12% 82%)',
                background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
              }}
            >
              Reload
            </button>
            <button
              onClick={() => this.clearAndReload()}
              style={{
                padding: '9px 16px', borderRadius: 8, border: '1px solid hsl(150 30% 30%)',
                background: 'hsl(150 30% 30%)', color: 'hsl(45 50% 96%)', cursor: 'pointer',
                fontSize: 13.5, fontWeight: 600,
              }}
            >
              Clear cached app &amp; reload
            </button>
          </div>
          <details style={{ marginTop: 18 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'hsl(20 10% 45%)' }}>
              Technical details
            </summary>
            <pre style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11.5, marginTop: 10,
              background: 'hsl(45 20% 97%)', border: '1px solid hsl(30 12% 88%)', borderRadius: 8,
              padding: 12, color: 'hsl(8 55% 40%)', maxHeight: 220, overflow: 'auto',
            }}>
              {String(err?.message || err)}{err?.stack ? '\n\n' + err.stack : ''}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
