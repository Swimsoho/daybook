// Scheduled auto-refresh of "where to watch (US)" for every watch-list collection (Movies, TV
// Shows, Watchlist…). A pg_cron job (see supabase/migrations/0005_refresh_watch_providers.sql)
// calls this daily; it re-looks-up current US streaming providers on TMDB and writes them into
// each list's text "Platform / Where to watch" column, so the data stays correct as titles move
// between services — no manual button-pressing needed. The in-app "Where to watch (US)" button
// (Collections) still works for on-demand / newly-added titles; this keeps the rest fresh.
//
// Guarded by the same shared secret as the digest job. Needs TMDB_API_KEY (or TMDB_ACCESS_TOKEN)
// set as an Edge Function secret — the same key the movie-lookup function uses.
//
// To stay comfortably inside the function time limit it refreshes the STALEST entries first (never
// looked up, or oldest) up to a per-run cap, so across daily runs everything rotates through and
// recently-changed availability is corrected quickly. The cap + cadence are easy to tune.

import { createClient } from 'npm:@supabase/supabase-js@2'

const DEFAULT_SECRET = 'df291fd260702ae2d1b8e18b7eb2036020af1f14adcb5980'
const TMDB = 'https://api.themoviedb.org/3'
const KEY = Deno.env.get('TMDB_API_KEY') ?? ''
const TOKEN = Deno.env.get('TMDB_ACCESS_TOKEN') ?? ''

// Per-invocation cap on TMDB lookups, to stay under the edge-function wall-clock limit. With a
// daily schedule this refreshes ~250 titles/day — a 600-title list fully cycles about every 2–3
// days, staler ones first.
const MAX_LOOKUPS = 250
const UPDATED_KEY = '__platformUpdated' // hidden per-entry stamp (not a visible column)

type Col = { key: string; name: string; type: string; isTitle?: boolean }
type Tracker = { id: string; name: string; active?: boolean; columns: Col[] }
type Entry = { id: string; trackerId: string; values: Record<string, unknown> }

const isWatchTracker = (t: Tracker) => /movie|film|tv|show|series|watch|cinema/i.test(t.name)
const streamingCol = (t: Tracker) => t.columns.find(c => (c.type === 'text' || c.type === 'longtext') && /platform|stream|where|watch|provider/i.test(c.name))
const titleCol = (t: Tracker) => t.columns.find(c => c.isTitle) ?? t.columns[0]
const yearCol = (t: Tracker) => t.columns.find(c => /\byear\b|released?/i.test(c.name))
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(TMDB + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`
  else url.searchParams.set('api_key', KEY)
  return fetch(url.toString(), { headers }).then(r => r.json()).catch(() => null)
}

async function lookupSummary(title: string, year: string): Promise<string | null> {
  const params: Record<string, string> = { query: title, include_adult: 'false' }
  if (/^\d{4}$/.test(year)) params.year = year
  let kind: 'movie' | 'tv' = 'movie'
  let results: any[] = (await tmdbFetch('/search/movie', params))?.results ?? []
  if (!results.length) { results = (await tmdbFetch('/search/tv', { query: title }))?.results ?? []; kind = 'tv' }
  if (!results.length) return null
  const hit = results.find(r => norm(r.title ?? r.name ?? '') === norm(title)) ?? results[0]
  const wp = await tmdbFetch(`/${kind}/${hit.id}/watch/providers`)
  const us = wp?.results?.US ?? {}
  const names = (a: any[] | undefined) => (a ?? []).map(p => p.provider_name).filter(Boolean)
  const stream = names(us.flatrate), ads = names(us.ads), rent = names(us.rent), buy = names(us.buy)
  if (stream.length) return stream.join(', ')
  if (ads.length) return `${ads.join(', ')} (free w/ ads)`
  if (rent.length) return `Rent: ${rent.slice(0, 3).join(', ')}`
  if (buy.length) return `Buy: ${buy.slice(0, 3).join(', ')}`
  return 'Not streaming in the US right now'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const expected = Deno.env.get('DIGEST_CRON_SECRET') || DEFAULT_SECRET
  if (req.headers.get('x-digest-secret') !== expected) return new Response('Unauthorized', { status: 401 })
  if (!KEY && !TOKEN) return new Response(JSON.stringify({ error: 'TMDB key not set' }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const today = new Date().toISOString().slice(0, 10)
  let looked = 0, updated = 0, lists = 0

  const { data: profiles } = await admin.from('profiles').select('id')
  for (const prof of profiles ?? []) {
    if (looked >= MAX_LOOKUPS) break
    try {
      const { data: ws } = await admin.from('workspaces').select('id').eq('owner_id', prof.id).eq('kind', 'real').maybeSingle()
      if (!ws) continue
      const { data: row } = await admin.from('workspace_state').select('data').eq('workspace_id', ws.id).maybeSingle()
      const state = (row?.data ?? {}) as { trackers?: Tracker[]; entries?: Entry[] }
      const trackers = (state.trackers ?? []).filter(t => t.active !== false && isWatchTracker(t))
      if (!trackers.length) continue
      const entries = state.entries ?? []
      let dirty = false

      for (const trk of trackers) {
        const sCol = streamingCol(trk)
        if (!sCol) continue // list has no free-text platform column to write into
        lists++
        const tCol = titleCol(trk), yCol = yearCol(trk)
        // Stalest first: never-updated (no stamp) before oldest stamp.
        const mine = entries
          .filter(e => e.trackerId === trk.id && String(e.values[tCol.key] ?? '').trim())
          .sort((a, b) => String(a.values[UPDATED_KEY] ?? '').localeCompare(String(b.values[UPDATED_KEY] ?? '')))
        for (const e of mine) {
          if (looked >= MAX_LOOKUPS) break
          const title = String(e.values[tCol.key] ?? '').trim()
          const yr = yCol ? String(e.values[yCol.key] ?? '') : ''
          looked++
          const summary = await lookupSummary(title, yr)
          if (summary && summary !== String(e.values[sCol.key] ?? '')) { e.values[sCol.key] = summary; updated++; dirty = true }
          e.values[UPDATED_KEY] = today
          if (summary) dirty = true
          await new Promise(r => setTimeout(r, 60)) // gentle on TMDB
        }
      }

      if (dirty) {
        const next = { ...state, entries }
        await admin.from('workspace_state').update({ data: next, updated_at: new Date().toISOString() }).eq('workspace_id', ws.id)
      }
    } catch { continue }
  }

  return new Response(JSON.stringify({ ok: true, lists, looked, updated }), { headers: { 'Content-Type': 'application/json' } })
})
