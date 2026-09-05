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
// For NON-movie lists (books, subscriptions, restaurants, anything you track), recommendations
// come from an LLM instead of TMDB. Set an ANTHROPIC_API_KEY secret to enable them.
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const LLM_MODEL = Deno.env.get('SUGGEST_MODEL') || 'claude-3-5-haiku-latest'

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

// ---- Generic (any list type) recommendations via an LLM -----------------------------------------
async function suggestViaLLM(body: any, count: number) {
  if (!ANTHROPIC_KEY) {
    return json({ error: 'Recommendations for non-movie lists need an Anthropic API key. Set the ANTHROPIC_API_KEY Edge Function secret (see claude/daybook-movie-streaming-setup.md, step 6b).' }, 200)
  }
  const ctx = body.context ?? {}
  const listName = String(ctx.name ?? 'this list').slice(0, 80)
  const desc = String(ctx.description ?? '').slice(0, 300)
  const existing: string[] = Array.isArray(body.titles) ? body.titles.map((t: any) => String(t.title ?? '')).filter(Boolean).slice(0, 60) : []
  const prompt = `You recommend new items to add to a person's personal tracking list.

List name: "${listName}"
${desc ? `List description: ${desc}\n` : ''}Items already on the list (do NOT repeat any of these): ${existing.length ? existing.join('; ') : '(the list is empty — suggest popular, high-quality starting picks that fit the list name)'}

Suggest ${count} NEW, real, specific, verifiable items that fit this list and, where the existing items reveal a taste or theme, match that taste. Avoid obscure or made-up items. For each item give: a concise title, an optional year (only where it makes sense — books, films, albums, games), a one-sentence reason tailored to THIS list, and a one-sentence description.

Return ONLY a JSON array (no prose, no code fences) of objects with exactly these keys: {"title": string, "year": string, "why": string, "overview": string}. Use "" for year when not applicable.`
  let resp: any
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: LLM_MODEL, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    }).then(r => r.json())
  } catch (e) {
    return json({ error: `Suggestion service unreachable: ${String((e as Error).message ?? e)}` }, 200)
  }
  if (resp?.error) return json({ error: `Suggestion service error: ${resp.error?.message ?? JSON.stringify(resp.error)}` }, 200)
  const text = String(resp?.content?.[0]?.text ?? '').trim()
  let arr: any[] = []
  try {
    arr = JSON.parse(text.replace(/^```(json)?/i, '').replace(/```$/, '').trim())
  } catch {
    const m = text.match(/\[[\s\S]*\]/)
    if (m) { try { arr = JSON.parse(m[0]) } catch { /* give up */ } }
  }
  const owned = new Set(existing.map(t => norm(t)))
  const suggestions = (Array.isArray(arr) ? arr : [])
    .filter(o => o && o.title && !owned.has(norm(String(o.title))))
    .slice(0, count)
    .map(o => ({
      title: String(o.title).slice(0, 140),
      year: String(o.year ?? '').replace(/[^0-9]/g, '').slice(0, 4),
      why: String(o.why ?? '').slice(0, 180),
      overview: String(o.overview ?? '').slice(0, 260),
    }))
  if (!suggestions.length) return json({ ok: false, error: 'No fresh suggestions came back — try again, or add a few items so it can read your taste.' }, 200)
  return json({ ok: true, suggestions })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let body: any = {}
  try { body = await req.json() } catch { /* empty body */ }
  const count = typeof body.count === 'number' ? Math.max(1, Math.min(20, body.count)) : 8
  // 'watch' → TMDB (movies/TV); anything else → the LLM path (books, subscriptions, custom lists…).
  const kind: 'watch' | 'generic' = body.kind === 'generic' ? 'generic' : 'watch'

  if (kind === 'generic') return await suggestViaLLM(body, count)

  // ---- Watch-list path (TMDB) --------------------------------------------------------------------
  if (!KEY && !TOKEN) return json({ error: 'TMDB key not configured. Set the TMDB_API_KEY Edge Function secret (same one as Where-to-watch).' }, 200)
  const seeds: SeedTitle[] = Array.isArray(body.titles) ? body.titles.slice(0, 12) : []
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
