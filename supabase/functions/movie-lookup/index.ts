// Live "where to watch" lookup for movie/TV trackers (Collections). Given a title (+ optional
// year), it finds the film on TMDB and returns the CURRENT US streaming / rent / buy providers,
// straight from TMDB's JustWatch-sourced data — so the app never stores a stale snapshot.
//
// Setup (Craig does this once):
//   1. Make a free account at themoviedb.org → Settings → API → request an API key (v3 auth).
//   2. Add it as a Supabase Edge Function secret named TMDB_API_KEY:
//        Supabase dashboard → Edge Functions → Manage secrets → add TMDB_API_KEY = <your key>
//      (A v4 "API Read Access Token" also works — set it as TMDB_ACCESS_TOKEN instead.)
//   3. Deploy this function:  supabase functions deploy movie-lookup
//
// Called from the client via supabase.functions.invoke('movie-lookup', { body: { title, year } }).
// verify_jwt stays on (default) — it's a logged-in-only feature, same as the other functions.

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
  return fetch(url.toString(), { headers }).then(r => r.json())
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Normalise a title for fuzzy matching against TMDB search results.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!KEY && !TOKEN) return json({ error: 'TMDB key not configured. Set the TMDB_API_KEY Edge Function secret.' }, 200)

  let title = '', year = ''
  try {
    const body = await req.json()
    title = String(body.title ?? '').trim()
    year = String(body.year ?? '').trim().slice(0, 4)
  } catch { /* fall through */ }
  if (!title) return json({ error: 'No title provided.' }, 200)

  try {
    // 1) Search movies (year narrows it when supplied), then fall back to TV if no movie hit.
    const params: Record<string, string> = { query: title, include_adult: 'false' }
    if (/^\d{4}$/.test(year)) params.year = year
    let kind: 'movie' | 'tv' = 'movie'
    let search = await tmdbFetch('/search/movie', params)
    let results: any[] = search?.results ?? []
    if (!results.length) {
      const tvParams: Record<string, string> = { query: title }
      if (/^\d{4}$/.test(year)) tvParams.first_air_date_year = year
      search = await tmdbFetch('/search/tv', tvParams)
      results = search?.results ?? []
      kind = 'tv'
    }
    if (!results.length) return json({ ok: false, notFound: true, query: title })

    // Prefer an exact-ish title match; otherwise take TMDB's top (popularity-ranked) result.
    const exact = results.find(r => norm(r.title ?? r.name ?? '') === norm(title))
    const hit = exact ?? results[0]
    const id = hit.id
    const matchedTitle = hit.title ?? hit.name ?? title
    const rel = hit.release_date ?? hit.first_air_date ?? ''
    const matchedYear = rel ? rel.slice(0, 4) : ''

    // 2) US watch providers.
    const wp = await tmdbFetch(`/${kind}/${id}/watch/providers`)
    const us = wp?.results?.US ?? {}
    const names = (arr: any[] | undefined) => (arr ?? []).map(p => p.provider_name).filter(Boolean)
    const stream = names(us.flatrate)
    const rent = names(us.rent)
    const buy = names(us.buy)
    const ads = names(us.ads) // free-with-ads (Tubi, Freevee, etc.)
    const link = us.link ?? `https://www.themoviedb.org/${kind}/${id}/watch?locale=US`

    // Compact human summary for a single cell / chip.
    let summary = ''
    if (stream.length) summary = stream.join(', ')
    else if (ads.length) summary = `${ads.join(', ')} (free w/ ads)`
    else if (rent.length) summary = `Rent: ${rent.slice(0, 3).join(', ')}`
    else if (buy.length) summary = `Buy: ${buy.slice(0, 3).join(', ')}`
    else summary = 'Not streaming in the US right now'

    return json({
      ok: true, kind,
      matched: { title: matchedTitle, year: matchedYear, releaseDate: rel, tmdbId: id },
      providers: { stream, ads, rent, buy },
      summary, link,
    })
  } catch (e) {
    return json({ error: `Lookup failed: ${String(e)}` }, 200)
  }
})
