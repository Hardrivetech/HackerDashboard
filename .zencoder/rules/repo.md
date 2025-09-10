# HackerDashboard — Repository Guide

## Overview

- **Type**: Static web app (no build step required)
- **Framework**: Vue 3 (CDN, ESM in browser)
- **Entry**: `index.html` → `<script type="module" src="./src/main.js">`
- **State/Storage**: Uses `localStorage` for tokens, filters, notes, and bookmarks
- **APIs**:
  - GitHub Events (optional OAuth for higher rate limits)
  - RSS via rss2json public API
  - CVEs via NVD (with EPSS and KEV enrichment)
  - CTFTime events

## Directory Structure

- `index.html` — UI layout, styles, and bootstrapping
- `src/main.js` — Vue app setup, state, actions, and computed views
- `src/services/` — API integrations
  - `github.js` — GitHub events + device flow helpers
  - `rss.js` — Security RSS aggregator via rss2json
  - `cve.js` — NVD recent feed + EPSS + KEV enrichment
  - `ctf.js` — CTFTime upcoming events via CORS-friendly proxy
- `cloudflare-worker/` — OAuth proxy Worker
  - `github-oauth-proxy.js` — Popup OAuth flow + Device Flow POST proxy
  - `README.md` — Deployment notes
- `.github/workflows/gh-pages.yaml` — GitHub Pages deployment pipeline
- `.zencoder/rules/repo.md` — This guide (for tooling/assistants)

## Configuration

- The dashboard reads configuration injected into `index.html` at deploy time:
  - `window.GITHUB_CLIENT_ID` (optional) — GitHub OAuth App client_id for device flow (still useful for rate limit context)
  - `window.GH_PROXY` (optional) — Proxy/Worker URL for OAuth endpoints (required for popup OAuth)
- You may set these manually in `index.html` for local testing:

```html
<script>
  window.GH_PROXY = "https://your-worker.example.workers.dev";
  window.GITHUB_CLIENT_ID = "Iv1_xxxxxx"; // optional
</script>
```

## OAuth & Auth Flows

- Popup OAuth using the Worker (recommended):
  - Worker endpoints: `GET /oauth/start`, `GET /oauth/callback`
  - `main.js` opens `/oauth/start` in a popup. On success, the Worker `postMessage`s `{ type: 'gh_token', token }` to the opener and the token is stored at `localStorage["qc.gh.token"]`.
- Device Flow helpers exist in `src/services/github.js` for compatibility, proxied via Worker (POST only):
  - `/login/device/code`, `/login/oauth/access_token`

Worker environment (Cloudflare):

- Vars: `CLIENT_ID`, `ALLOWED_ORIGIN`, `OAUTH_SCOPE` (optional)
- Secret: `CLIENT_SECRET`

## Local Development

- Serve the folder with a static server (module imports require HTTP(s)):
  1. Any simple static server works (e.g., VS Code Live Server, `python -m http.server`).
  2. Open `http://localhost:PORT/index.html` in a modern browser.
- Without a Worker, GitHub login won’t work due to CORS. Public data (RSS, CVE via proxies, CTFTime) should still load.

## Deployment (GitHub Pages)

- Workflow: `.github/workflows/gh-pages.yaml`
  - Injects secrets into `index.html` (adds `GITHUB_CLIENT_ID` and `GH_PROXY` as globals)
  - Uploads the static site as Pages artifact and deploys
- Required repository secrets:
  - `GITHUB_CLIENT_ID` — GitHub OAuth App client ID
  - `GH_PROXY` — Cloudflare Worker URL (e.g., `https://gh-proxy.<subdomain>.workers.dev`)

## Data Sources & Notes

- **GitHub Events**: `https://api.github.com/users/{user}/events/public`
- **RSS**: `https://api.rss2json.com/v1/api.json?rss_url=<feed>` (public CORS proxy; consider self-hosting for production)
- **CVEs**:
  - Recent NVD JSON: `https://nvd.nist.gov/feeds/json/cve/1.1/recent.json`
  - EPSS: `https://api.first.org/data/v1/epss?cve=<comma-separated>`
  - KEV: `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`
  - A fallback CORS proxy is used: `https://r.jina.ai/http/<origin-host/...>`
- **CTFTime**: via `https://r.jina.ai/http://ctftime.org/api/v1/events/?limit=20`

## Local Storage Keys

- `qc.gh.token` — GitHub OAuth token
- `qc.cve.filters` — Persisted CVE filter settings
- `qc.bookmarks` — Bookmark list
- `qc.notes` — Notes HTML content

## Common Issues & Troubleshooting

- **Popup blocked**: Allow popups for the site when logging in to GitHub.
- **CORS errors on OAuth**: Ensure `window.GH_PROXY` is a valid HTTPS Worker URL and `ALLOWED_ORIGIN` matches your site origin.
- **GitHub rate limits**: Use OAuth to increase limits; otherwise expect 60 unauthenticated requests/hour per IP.
- **RSS failures**: Public proxy may throttle; consider self-hosted proxy for reliability.
- **CVEs/EPSS/KEV not loading**: Temporary upstream issues or proxy failures. Refresh or try later.

## Security Considerations

- Do not expose client secrets in the client app; only Worker holds `CLIENT_SECRET`.
- Consider CSP headers if serving behind a server/CDN (restrict scripts, connect-src to known APIs).
- Treat stored OAuth token as sensitive; it’s saved in `localStorage`.

## Contributing

- Keep UI simple and fast; avoid build steps if possible.
- Prefer small, isolated service modules for external data.
- Add feature flags via `window.*` config when introducing new integrations.

## Roadmap Ideas

- RSS source manager, CVE pin/ignore, global search, notifications on KEV/high-EPSS, PWA + offline, Gist sync for bookmarks/notes.
