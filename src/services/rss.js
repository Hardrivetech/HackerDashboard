// Simple RSS fetch via rss2json free API (public CORS proxy)
// For production, consider hosting your own proxy.

async function fetchOne(url) {
  const api = "https://api.rss2json.com/v1/api.json?rss_url=";
  const res = await fetch(api + encodeURIComponent(url));
  if (!res.ok) throw new Error("RSS fetch failed");
  const data = await res.json();
  if (!data.items) return [];
  return data.items.slice(0, 10).map((i) => ({
    title: i.title,
    link: i.link,
    pubDate: i.pubDate || i.pub_date || i.pubdate,
    source: data.feed?.title || new URL(url).hostname,
  }));
}

export async function fetchSecurityRSS(urls) {
  const all = await Promise.all(urls.map(fetchOne));
  return all
    .flat()
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 20);
}
