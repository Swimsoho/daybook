// "Research this for me" on a task — the general-purpose cousin of the movie "Where to watch"
// lookup. Given a task (its title + your notes + whatever you type in the box), it asks Claude to
// research it on the LIVE web and hand back a practical, actionable answer: where to buy something
// and roughly what it costs, how to do a thing, options to compare, who to contact, etc.
//
// Setup (Craig does this once — SAME key as the generic "Suggest" recommendations, nothing new):
//   • Reuses the ANTHROPIC_API_KEY Edge Function secret (see claude/daybook-movie-streaming-setup.md,
//     step 6b). If you've already set it for non-movie suggestions, this works with no extra setup.
//   • Deploy it:  supabase functions deploy task-research
//
// Called from the client via supabase.functions.invoke('task-research', { body: {...} }).

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
// Haiku is cheap and fast and supports web search; bump via the RESEARCH_MODEL secret for deeper work.
const MODEL = Deno.env.get('RESEARCH_MODEL') || 'claude-3-5-haiku-latest'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!ANTHROPIC_KEY) {
    return json({ error: 'Research needs an Anthropic API key. Set the ANTHROPIC_API_KEY Edge Function secret (see claude/daybook-movie-streaming-setup.md, step 6b).' }, 200)
  }

  let body: any = {}
  try { body = await req.json() } catch { /* empty body */ }
  const query = String(body.query ?? body.title ?? '').trim().slice(0, 500)
  const title = String(body.title ?? '').trim().slice(0, 200)
  const notes = String(body.notes ?? '').trim().slice(0, 1000)
  if (!query) return json({ error: 'Nothing to research — type what you want to find out.' }, 200)

  const today = new Date().toISOString().slice(0, 10)
  const prompt = `You are a practical research assistant helping someone get a personal to-do done. Today is ${today}.

The task${title && title !== query ? ` ("${title}")` : ''}: ${query}
${notes ? `\nTheir notes on it: ${notes}\n` : ''}
Search the live web and give a concise, practical, actionable answer that moves this task forward. Depending on the task that might mean: where to buy it and roughly what it costs right now, the best options to compare, how to do it step by step, who to contact, or what to watch out for. Prefer current, specific, real information (names, prices, places, links) over generalities. Use the web search tool for anything that could be out of date. Keep it tight — short sections or a short list, not an essay. If the task is unclear, make a sensible assumption and say so in one line.`

  let resp: any
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    }).then(r => r.json())
  } catch (e) {
    return json({ error: `Research service unreachable: ${String((e as Error).message ?? e)}` }, 200)
  }
  if (resp?.error) return json({ error: `Research service error: ${resp.error?.message ?? JSON.stringify(resp.error)}` }, 200)

  // Pull the assistant's prose out of the text blocks, and collect cited web sources (dedup by URL).
  const blocks: any[] = Array.isArray(resp?.content) ? resp.content : []
  const text = blocks.filter(b => b?.type === 'text').map(b => String(b.text ?? '')).join('').trim()
  const seen = new Set<string>()
  const sources: { title: string; url: string }[] = []
  for (const b of blocks) {
    for (const c of (Array.isArray(b?.citations) ? b.citations : [])) {
      const url = String(c?.url ?? '')
      if (url && !seen.has(url)) { seen.add(url); sources.push({ title: String(c?.title ?? url).slice(0, 160), url }) }
    }
  }
  if (!text) return json({ ok: false, error: 'No research came back — try rephrasing the task, or try again.' }, 200)
  return json({ ok: true, text, sources: sources.slice(0, 12) })
})
