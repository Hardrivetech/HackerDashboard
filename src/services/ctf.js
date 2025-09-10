// Fetch upcoming events from CTFTime using a CORS-friendly proxy first

export async function fetchCTFTimeEvents() {
  const proxy = "https://r.jina.ai/http://ctftime.org/api/v1/events/?limit=20";
  try {
    const res = await fetch(proxy);
    if (!res.ok) return [];
    const text = await res.text();
    const data = JSON.parse(text);
    return data.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      finish: e.finish,
      format: e.format,
      onsite: e.onsite,
      ctftime_url: e.ctftime_url,
    }));
  } catch {
    return [];
  }
}
