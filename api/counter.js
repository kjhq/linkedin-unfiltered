export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (url.pathname.endsWith("/count") && request.method === "GET") {
      const val = await env.COUNTER.get("global", { type: "text" });
      return Response.json({ globalCount: parseInt(val) || 0 }, { headers });
    }

    if (url.pathname.endsWith("/count") && request.method === "POST") {
      const val = await env.COUNTER.get("global", { type: "text" });
      const next = (parseInt(val) || 0) + 1;
      await env.COUNTER.put("global", String(next));
      return Response.json({ globalCount: next }, { headers });
    }

    return new Response("Not found", { status: 404 });
  },
};
