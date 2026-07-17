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

async function upstash(env, command) {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error('Missing Upstash secrets')
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upstash ${res.status}: ${text}`)
  }
  return res.json()
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
        const result = await upstash(env, ['GET', 'globalCount'])
        const globalCount = result.result == null ? 0 : Number(result.result)
        return json({ globalCount })
      }

      if (request.method === 'POST') {
        const result = await upstash(env, ['INCR', 'globalCount'])
        const globalCount = Number(result.result)
        return json({ globalCount })
      }

      return new Response(null, { status: 405, headers: corsHeaders })
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, 500)
    }
  },
}
