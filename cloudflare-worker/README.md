# Cloudflare Worker: GitHub OAuth Device Flow Proxy

This Worker proxies GitHub’s OAuth Device Flow endpoints with browser-friendly CORS. Use it when your dashboard is a static site without a backend.

Endpoints (POST only):

- /login/device/code → https://github.com/login/device/code
- /login/oauth/access_token → https://github.com/login/oauth/access_token

CORS: Adds `Access-Control-Allow-Origin` and related headers. Preflight (OPTIONS) is supported.

## Deploy

1. Create a new Worker

- In Cloudflare Dashboard → Workers & Pages → Create → Worker → Quick Edit
- Paste the content of `github-oauth-proxy.js`
- Save & deploy. Note the Worker URL, e.g. `https://gh-proxy.your-subdomain.workers.dev`

2. Restrict routes (optional but recommended)

- You can bind a custom route (e.g., `https://proxy.yourdomain.com/gh-proxy/*`) and use a rewrite rule to map `/gh-proxy/login/...` to the Worker.

3. Configure your dashboard

- Set the proxy base URL in `index.html`:
  ```html
  <script>
    window.GH_PROXY = "https://gh-proxy.your-subdomain.workers.dev";
  </script>
  ```
- Now the “Login with GitHub” button should work in the browser without CORS errors.

## Security Notes

- The Worker only forwards the two OAuth endpoints and forces JSON responses.
- Consider adding simple rate-limiting or an allowlist for Origins if needed.
- Client ID can remain public; do NOT put client secret in the Worker.

## Troubleshooting

- If you see 404 from Worker: ensure you’re calling the correct path (`/login/device/code` or `/login/oauth/access_token`).
- If you see CORS errors: confirm the Worker is reachable and that `window.GH_PROXY` is set and not empty.
- If GitHub returns `authorization_pending/slow_down`: this is expected while polling—just wait or respect `interval`.
