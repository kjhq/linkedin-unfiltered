const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  })
}

function isCountPath(pathname) {
  return (
    pathname === '/api/linkedin/count' ||
    pathname === '/linkedin/count' ||
    pathname === '/api/linkedin/count/' ||
    pathname === '/linkedin/count/'
  )
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders })
      }

      if (!isCountPath(url.pathname)) {
        return new Response('Not Found', { status: 404, headers: corsHeaders })
      }

      if (request.method === 'GET') {
        const raw = await env.COUNTER.get('globalCount')
        const globalCount = raw == null ? 0 : Number(raw)
        return json({ globalCount })
      }

      if (request.method === 'POST') {
        const raw = await env.COUNTER.get('globalCount')
        const next = (raw == null ? 0 : Number(raw)) + 1
        await env.COUNTER.put('globalCount', String(next))
        return json({ globalCount: next })
      }

      return new Response(null, { status: 405, headers: corsHeaders })
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, 500)
    }
  },
}
