// Fetch recent CVEs from CIRCL cve-search public API (CORS-enabled)
// Docs: https://cve.circl.lu/api/last

export async function fetchLatestCVEs() {
  const res = await fetch("https://cve.circl.lu/api/last");
  if (!res.ok) throw new Error("CVE fetch failed");
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .slice(0, 20)
    .map((item) => ({
      id: item.id || item.cve || item.cve_id,
      summary: item.summary || item.description,
    }));
}
