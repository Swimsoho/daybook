import React, { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

interface ShareSnapshot {
  title: string
  notes?: string | null
  due?: string | null
  status: 'pending' | 'done'
  created_at: string
  responded_at?: string | null
}

async function callSharedTask(body: Record<string, unknown>): Promise<{ share?: ShareSnapshot; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { error: 'not_configured' }
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/shared-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
    })
    const data = await resp.json()
    if (!resp.ok) return { error: data?.error ?? 'request_failed' }
    return data
  } catch {
    return { error: 'network_error' }
  }
}

// A standalone, no-login page for the recipient of a "share this task" link — deliberately
// mounted outside StoreProvider/CloudProvider/AuthGate (see main.tsx), since whoever opens it
// from a text/email/WhatsApp has no Daybook account at all. Talks only to the shared-task Edge
// Function, never to any authenticated table — see that function for the full read/complete flow.
export default function SharedTaskPage({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error' | 'not_configured'>('loading')
  const [share, setShare] = useState<ShareSnapshot | null>(null)
  const [completing, setCompleting] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false
    callSharedTask({ action: 'view', token }).then(res => {
      if (cancelled) return
      if (res.error === 'not_configured') setState('not_configured')
      else if (res.error === 'not_found') setState('not_found')
      else if (res.error) setState('error')
      else if (res.share) { setShare(res.share); setState('ready') }
      else setState('error')
    })
    return () => { cancelled = true }
  }, [token])

  async function markDone() {
    setCompleting(true)
    const res = await callSharedTask({ action: 'complete', token, note: note.trim() || undefined })
    setCompleting(false)
    if (res.share) setShare(res.share)
    else setState('error')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f1ea', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 440, width: '100%', background: '#fff', border: '1px solid #ddd6c8', borderRadius: 6, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8371', marginBottom: 12, fontWeight: 600 }}>Shared from Daybook</div>

        {state === 'loading' && <p style={{ color: '#8a8371', margin: 0 }}>Loading…</p>}
        {state === 'not_configured' && <p style={{ margin: 0 }}>Shared task links aren't available on this deployment.</p>}
        {state === 'not_found' && <p style={{ margin: 0 }}>This link isn't valid anymore, or was never created.</p>}
        {state === 'error' && <p style={{ margin: 0 }}>Something went wrong loading this — try refreshing.</p>}

        {state === 'ready' && share && (
          <>
            <h1 style={{ fontSize: 21, margin: '0 0 10px', lineHeight: 1.3, fontWeight: 600 }}>{share.title}</h1>
            {share.due && <p style={{ fontSize: 13, color: '#8a8371', margin: '0 0 10px' }}>Due {share.due}</p>}
            {share.notes && <p style={{ fontSize: 14, borderLeft: '2px solid #ddd6c8', paddingLeft: 10, color: '#444', margin: '0 0 6px' }}>{share.notes}</p>}

            {share.status === 'done' ? (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#2f5d43', fontSize: 14 }}>
                <Check size={16} /> Marked done — thanks!
              </div>
            ) : (
              <div style={{ marginTop: 18 }}>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add a note (optional)"
                  rows={2}
                  style={{ width: '100%', border: '1px solid #ddd6c8', borderRadius: 4, padding: 8, fontSize: 13, resize: 'vertical', marginBottom: 12, fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
                <button
                  onClick={markDone}
                  disabled={completing}
                  style={{ background: '#20351f', color: '#fdfaf3', border: 'none', borderRadius: 4, padding: '10px 18px', fontSize: 14, cursor: completing ? 'default' : 'pointer', opacity: completing ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 7 }}
                >
                  {completing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  {completing ? 'Marking done…' : 'Mark as done'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
