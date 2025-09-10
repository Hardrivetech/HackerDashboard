// Cloudflare Worker (Modules syntax)
// GitHub OAuth Proxy & Device Flow Support
// - Popup OAuth flow:
//   • GET /oauth/start        → redirects to GitHub authorize
//   • GET /oauth/callback     → exchanges code → returns HTML that postMessages token to opener
// - Device Flow proxy (for compatibility):
//   • POST /login/device/code
//   • POST /login/oauth/access_token
//
// Configure the following in Cloudflare Worker bindings (Dashboard or wrangler.toml):
// - Vars: CLIENT_ID, ALLOWED_ORIGIN, OAUTH_SCOPE (optional)
// - Secrets: CLIENT_SECRET
//
// Example wrangler.toml (modules):
// compatibility_date = "2024-01-01"
// [vars]
// CLIENT_ID = "Iv1.xxxxxx"
// ALLOWED_ORIGIN = "https://your-username.github.io"
// OAUTH_SCOPE = "read:user repo"
//
// Then set secret:
// wrangler secret put CLIENT_SECRET

function corsHeaders(origin, allowedOrigin) {
  const allow = allowedOrigin || origin || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type, accept, authorization, x-requested-with",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function htmlPostToken({ token = "", error = "", allowedOrigin = "*" }) {
  const safeToken = token.replace(/'/g, "&#39;");
  const safeError = error.replace(/'/g, "&#39;");
  return `<!doctype html>
<meta charset="utf-8" />
<title>GitHub OAuth</title>
<script>
  (function(){
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'gh_token', token: '${safeToken}', error: '${safeError}' }, '${allowedOrigin}');
        window.close();
      } else {
        document.body.textContent = ${
          safeError
            ? "'Error: ' + '" + safeError + "'"
            : "'You can close this window.'"
        };
      }
    } catch (e) {
      document.body.textContent = 'Unable to communicate with opener.';
    }
  })();
</script>`;
}

const DEVICE_ALLOWED_PATHS = new Set([
  "/login/device/code",
  "/login/oauth/access_token",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const CLIENT_ID = env.CLIENT_ID;
    const CLIENT_SECRET = env.CLIENT_SECRET; // secret binding
    const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || "*";
    const OAUTH_SCOPE = env.OAUTH_SCOPE || "read:user repo";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, ALLOWED_ORIGIN),
      });
    }

    // Popup OAuth start → redirect to GitHub authorize
    if (request.method === "GET" && url.pathname === "/oauth/start") {
      if (!CLIENT_ID || !CLIENT_SECRET) {
        return new Response("Missing CLIENT_ID/CLIENT_SECRET", { status: 500 });
      }
      const redirectUri = `${url.origin}/oauth/callback`;
      const auth = new URL("https://github.com/login/oauth/authorize");
      auth.searchParams.set("client_id", CLIENT_ID);
      auth.searchParams.set("scope", OAUTH_SCOPE);
      auth.searchParams.set("redirect_uri", redirectUri);
      // Optional: implement state for CSRF with cookies
      return Response.redirect(auth.toString(), 302);
    }

    // Popup OAuth callback → exchange code for token and postMessage back
    if (request.method === "GET" && url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response(
          htmlPostToken({
            error: "Missing code",
            allowedOrigin: ALLOWED_ORIGIN,
          }),
          { headers: { "content-type": "text/html; charset=utf-8" } }
        );
      }
      const tokenRes = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: { Accept: "application/json" },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            redirect_uri: `${url.origin}/oauth/callback`,
          }),
        }
      );
      if (!tokenRes.ok) {
        const t = await tokenRes.text().catch(() => "");
        return new Response(
          htmlPostToken({
            error: `Token exchange failed (${tokenRes.status}) ${t}`,
            allowedOrigin: ALLOWED_ORIGIN,
          }),
          { headers: { "content-type": "text/html; charset=utf-8" } }
        );
      }
      const data = await tokenRes.json();
      const token = data.access_token || "";
      return new Response(
        htmlPostToken({
          token,
          error: token
            ? ""
            : data.error_description || data.error || "Unknown error",
          allowedOrigin: ALLOWED_ORIGIN,
        }),
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    // Existing Device Flow proxy (POST only)
    if (request.method === "POST" && DEVICE_ALLOWED_PATHS.has(url.pathname)) {
      const upstream = "https://github.com" + url.pathname;
      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.set("accept", "application/json");

      const resp = await fetch(upstream, {
        method: "POST",
        headers,
        body: request.body,
        redirect: "follow",
      });

      const respHeaders = new Headers(resp.headers);
      const ch = corsHeaders(origin, ALLOWED_ORIGIN);
      respHeaders.set(
        "Access-Control-Allow-Origin",
        ch["Access-Control-Allow-Origin"]
      );
      respHeaders.set("Vary", "Origin");
      if (!respHeaders.get("content-type"))
        respHeaders.set("content-type", "application/json; charset=utf-8");

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: respHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: {
        "content-type": "application/json",
        ...corsHeaders(origin, ALLOWED_ORIGIN),
      },
    });
  },
};
