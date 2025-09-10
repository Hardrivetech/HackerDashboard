// Fetch recent CVEs using a CORS-friendly proxy first (NVD recent feed)

export async function fetchLatestCVEs() {
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
