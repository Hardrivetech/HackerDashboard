// Minimal GitHub Gist sync helpers (client-side)
// Requires a GitHub OAuth token with 'gist' scope (token stored in localStorage by app)

const API = "https://api.github.com";

function headers(token) {
  const h = { Accept: "application/vnd.github+json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function saveDashboardDataToGist(
  token,
  data,
  existingGistId = null
) {
  if (!token) throw new Error("Missing GitHub token");
  const files = {
    "bookmarks.json": {
      content: JSON.stringify(data.bookmarks || [], null, 2),
    },
    "notes.html": { content: data.notes || "" },
    "rss-sources.json": {
      content: JSON.stringify(data.rssSources || [], null, 2),
    },
    "cve-state.json": {
      content: JSON.stringify(
        {
          pinned: data.cvePinned || [],
          ignored: data.cveIgnored || [],
          tags: data.cveTags || {},
        },
        null,
        2
      ),
    },
  };
  const body = {
    description: "HackerDashboard data backup",
    public: false,
    files,
  };
  const endpoint = existingGistId
    ? `${API}/gists/${encodeURIComponent(existingGistId)}`
    : `${API}/gists`;
  const method = existingGistId ? "PATCH" : "POST";
  const res = await fetch(endpoint, {
    method,
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gist save failed: ${res.status}`);
  const json = await res.json();
  return json.id; // gist id
}

export async function loadDashboardDataFromGist(token, gistId) {
  if (!token) throw new Error("Missing GitHub token");
  if (!gistId) throw new Error("Missing gist id");
  const res = await fetch(`${API}/gists/${encodeURIComponent(gistId)}`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);
  const json = await res.json();
  const files = json.files || {};
  async function readFile(name) {
    const f = files[name];
    if (!f) return null;
    // Prefer raw_url to avoid truncated content in 'content'
    try {
      const r = await fetch(f.raw_url);
      if (r.ok) return await r.text();
    } catch {}
    return f.content || null;
  }
  const bookmarks = JSON.parse((await readFile("bookmarks.json")) || "[]");
  const notes = (await readFile("notes.html")) || "";
  const rssSources = JSON.parse((await readFile("rss-sources.json")) || "[]");
  const cveState = JSON.parse((await readFile("cve-state.json")) || "{}");
  return { bookmarks, notes, rssSources, cveState };
}
