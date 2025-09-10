// Fetch upcoming events from CTFTime (via JSON endpoints). Some endpoints require CORS proxy.

export async function fetchCTFTimeEvents() {
  // Public calendar-ish list; if CORS blocks, use a read-only proxy
  const url = "https://ctftime.org/api/v1/events/?limit=20";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("CTFTime fetch failed");
    const data = await res.json();
    return data.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      finish: e.finish,
      format: e.format,
      onsite: e.onsite,
      ctftime_url: e.ctftime_url,
    }));
  } catch (e) {
    // Fallback via proxied source (simple CORS workaround)
    const proxy =
      "https://r.jina.ai/http://ctftime.org/api/v1/events/?limit=20";
    const res = await fetch(proxy);
    if (!res.ok) return [];
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }
}
