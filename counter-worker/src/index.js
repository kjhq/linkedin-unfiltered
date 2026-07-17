import { Redis } from '@upstash/redis/cloudflare'

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
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders })
    }

    if (!isCountPath(url.pathname)) {
      return new Response('Not Found', { status: 404, headers: corsHeaders })
    }

    const redis = Redis.fromEnv(env)

    if (request.method === 'GET') {
      const globalCount = (await redis.get('globalCount')) || 0
      return json({ globalCount })
    }

    if (request.method === 'POST') {
      const globalCount = await redis.incr('globalCount')
      return json({ globalCount })
    }

    return new Response(null, { status: 405, headers: corsHeaders })
  },
}
