// Fetch recent CVEs with CORS-safe strategy
// Primary: CIRCL API (may send duplicate ACAO). Fallback: NVD recent CVEs via Jina reader proxy.

export async function fetchLatestCVEs() {
  try {
    const res = await fetch("https://cve.circl.lu/api/last");
    if (!res.ok) throw new Error("CVE fetch failed");
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.slice(0, 20).map((item) => ({
      id: item.id || item.cve || item.cve_id,
      summary: item.summary || item.description,
    }));
  } catch (e) {
    // Fallback: fetch NVD feed through CORS-friendly text proxy and parse
    try {
      const prox =
        "https://r.jina.ai/http://nvd.nist.gov/feeds/json/cve/1.1/recent.json";
      const res = await fetch(prox);
      if (!res.ok) return [];
      const txt = await res.text();
      const json = JSON.parse(txt);
      const items = json?.CVE_Items || [];
      return items.slice(0, 20).map((it) => ({
        id: it.cve?.CVE_data_meta?.ID,
        summary:
          it.cve?.description?.description_data?.[0]?.value || "No description",
      }));
    } catch {
      return [];
    }
  }
}
