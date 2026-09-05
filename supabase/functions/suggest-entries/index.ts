// Personalised "what to add next" recommendations for movie / TV watch-lists (Collections).
// Given the titles already on a list, it asks TMDB for films/shows similar to the ones you have,
// aggregates and ranks them, drops anything already on your list, and returns fresh suggestions —
// real titles with a year and a one-line reason. The app shows them with Add / Ignore.
//
// Setup (Craig does this once — SAME key as "Where to watch", nothing new needed):
//   • It reuses the TMDB_API_KEY (or TMDB_ACCESS_TOKEN) Edge Function secret you already set for
//     the movie-lookup function.
//   • Deploy it:  supabase functions deploy suggest-entries
//
// Called from the client via supabase.functions.invoke('suggest-entries', { body: {...} }).

const TMDB = 'https://api.themoviedb.org/3'
const KEY = Deno.env.get('TMDB_API_KEY') ?? ''
const TOKEN = Deno.env.get('TMDB_ACCESS_TOKEN') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(TMDB + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`
  else url.searchParams.set('api_key', KEY)
  return fetch(url.toString(), { headers }).then(r => r.json()).catch(() => null)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

type SeedTitle = { title: string; year?: string; rating?: number }
type Suggestion = { title: string; year: string; overview: string; why: string; score: number }

// Resolve one of the user's titles to a TMDB id (movie first, then TV).
async function resolveId(title: string, year: string): Promise<{ id: number; kind: 'movie' | 'tv'; name: string } | null> {
  const params: Record<string, string> = { query: title, include_adult: 'false' }
  if (/^\d{4}$/.test(year)) params.year = year
  let search = await tmdbFetch('/search/movie', params)
  let results: any[] = search?.results ?? []
  let kind: 'movie' | 'tv' = 'movie'
  if (!results.length) {
    const tv: Record<string, string> = { query: title }
    if (/^\d{4}$/.test(year)) tv.first_air_date_year = year
    search = await tmdbFetch('/search/tv', tv)
    results = search?.results ?? []
    kind = 'tv'
  }
  if (!results.length) return null
  const exact = results.find(r => norm(r.title ?? r.name ?? '') === norm(title))
  const hit = exact ?? results[0]
  return { id: hit.id, kind, name: hit.title ?? hit.name ?? title }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!KEY && !TOKEN) return json({ error: 'TMDB key not configured. Set the TMDB_API_KEY Edge Function secret (same one as Where-to-watch).' }, 200)

  let seeds: SeedTitle[] = []
  let count = 8
  try {
    const body = await req.json()
    seeds = Array.isArray(body.titles) ? body.titles.slice(0, 12) : []
    if (typeof body.count === 'number') count = Math.max(1, Math.min(20, body.count))
  } catch { /* fall through */ }
  if (!seeds.length) return json({ ok: false, error: 'No titles to base suggestions on. Add a few films/shows first.' }, 200)

  // Weight seeds you rated highly more heavily (a 5★ film says more about taste than an unrated one).
  const ranked = [...seeds].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 8)
  const owned = new Set(seeds.map(s => norm(s.title)))

  const agg = new Map<number, { s: Suggestion; from: Set<string> }>()
  try {
    for (const seed of ranked) {
      const resolved = await resolveId(String(seed.title ?? '').trim(), String(seed.year ?? '').trim().slice(0, 4))
      if (!resolved) continue
      // TMDB's own "recommendations" (behavioural) then "similar" (metadata) as a fallback/supplement.
      const rec = await tmdbFetch(`/${resolved.kind}/${resolved.id}/recommendations`)
      const sim = await tmdbFetch(`/${resolved.kind}/${resolved.id}/similar`)
      const pool: any[] = [...(rec?.results ?? []), ...(sim?.results ?? [])]
      for (const r of pool) {
        const title = r.title ?? r.name ?? ''
        if (!title || owned.has(norm(title))) continue
        const rel = r.release_date ?? r.first_air_date ?? ''
        const yr = rel ? rel.slice(0, 4) : ''
        const existing = agg.get(r.id)
        if (existing) { existing.from.add(resolved.name); existing.s.score += (r.vote_average ?? 0) }
        else {
          agg.set(r.id, {
            from: new Set([resolved.name]),
            s: { title, year: yr, overview: (r.overview ?? '').slice(0, 220), why: '', score: (r.popularity ?? 0) / 20 + (r.vote_average ?? 0) },
          })
        }
      }
    }
  } catch (e) {
    return json({ error: `Suggestion lookup failed: ${String((e as Error).message ?? e)}` }, 200)
  }

  const out = [...agg.values()]
    // titles recommended off MORE of your films rank higher (shared taste signal)
    .map(v => ({ ...v.s, score: v.s.score + v.from.size * 6, why: `Because you have ${[...v.from].slice(0, 2).join(' & ')}${v.from.size > 2 ? ` +${v.from.size - 2}` : ''}` }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ score: _score, ...rest }) => rest)

  return json({ ok: true, suggestions: out })
})
