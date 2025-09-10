/*****************************************************
 GitHub OAuth Device Flow CORS Proxy (Cloudflare Worker)
 - Proxies only the required OAuth endpoints:
   • POST /login/device/code
   • POST /login/oauth/access_token
 - Adds CORS headers so browsers can call from static sites
 - Keeps scope limited for safety; deny other paths
*****************************************************/

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

const ALLOWED_PATHS = new Set([
  "/login/device/code",
  "/login/oauth/access_token",
]);

function corsHeaders(origin) {
  // Allow any origin (works for file:// which sends Origin: null)
  const o = origin && origin !== "null" ? origin : "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type, accept, authorization, x-requested-with",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

async function handleRequest(request) {
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers.get("Origin")),
    });
  }

  if (request.method !== "POST" || !ALLOWED_PATHS.has(url.pathname)) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: {
        "content-type": "application/json",
        ...corsHeaders(request.headers.get("Origin")),
      },
    });
  }

  const upstream = "https://github.com" + url.pathname;

  // Clone headers and strip hop-by-hop/forbidden ones
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("accept", "application/json"); // ensure JSON responses

  const resp = await fetch(upstream, {
    method: "POST",
    headers,
    body: request.body, // stream forward
    redirect: "follow",
  });

  // Pass-through body and status; add CORS headers
  const respHeaders = new Headers(resp.headers);
  respHeaders.set(
    "Access-Control-Allow-Origin",
    corsHeaders(request.headers.get("Origin"))["Access-Control-Allow-Origin"]
  );
  respHeaders.set("Vary", "Origin");
  // Normalize content-type to JSON when possible
  if (!respHeaders.get("content-type"))
    respHeaders.set("content-type", "application/json; charset=utf-8");

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: respHeaders,
  });
}
