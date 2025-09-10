// CVE service with enrichment: CVSS, vendor/products, EPSS score, and KEV flag

// Helper: safe fetch JSON with optional CORS proxy fallback
async function fetchJsonWithFallback(url) {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch {}
  try {
    const prox = `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}`;
    const res2 = await fetch(prox);
    if (res2.ok) {
      const txt = await res2.text();
      return JSON.parse(txt);
    }
  } catch {}
  return null;
}

// Flatten vendor/product from NVD item
function extractVendorProducts(it) {
  const list = [];
  try {
    const vendors = it.cve?.affects?.vendor?.vendor_data || [];
    for (const v of vendors) {
      const vname = v.vendor_name || "";
      const products = v.product?.product_data || [];
      if (!products.length && vname) list.push(vname);
      for (const p of products) {
        const pname = p.product_name || "";
        if (vname && pname) list.push(`${vname}:${pname}`);
        else if (pname) list.push(pname);
      }
    }
  } catch {}
  return Array.from(new Set(list));
}

// Enrich items with EPSS and KEV
async function enrichEPSSandKEV(items) {
  if (!items?.length) return items || [];

  const ids = items.map((x) => x.id).filter(Boolean);

  // EPSS
  let epssMap = new Map();
  try {
    const epssUrl = `https://api.first.org/data/v1/epss?cve=${encodeURIComponent(
      ids.join(",")
    )}`;
    const epssJson = await fetchJsonWithFallback(epssUrl);
    const rows = epssJson?.data || [];
    for (const r of rows) {
      const id = r.cve;
      const score = r.epss != null ? parseFloat(r.epss) : null;
      const pct = r.percentile != null ? parseFloat(r.percentile) : null;
      if (id) epssMap.set(id, { epss: score, epssPercentile: pct });
    }
  } catch {}

  // KEV
  let kevSet = new Set();
  try {
    const kevUrl =
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
    const kevJson = await fetchJsonWithFallback(kevUrl);
    const vulns = kevJson?.vulnerabilities || kevJson?.vulns || [];
    for (const v of vulns) {
      if (v.cveID) kevSet.add(v.cveID);
      if (v.cve_id) kevSet.add(v.cve_id);
    }
  } catch {}

  return items.map((it) => {
    const extra = epssMap.get(it.id) || {};
    return {
      ...it,
      epss: typeof extra.epss === "number" ? extra.epss : null,
      epssPercentile:
        typeof extra.epssPercentile === "number" ? extra.epssPercentile : null,
      kev: kevSet.has(it.id) || false,
    };
  });
}

export async function fetchLatestCVEs() {
  try {
    // NVD recent feed (CORS via r.jina.ai fallback)
    const nvdUrl = "https://nvd.nist.gov/feeds/json/cve/1.1/recent.json";
    const json = await fetchJsonWithFallback(nvdUrl);
    const items = json?.CVE_Items || [];

    const parsed = items.slice(0, 50).map((it) => {
      const id = it.cve?.CVE_data_meta?.ID;
      const summary =
        it.cve?.description?.description_data?.[0]?.value || "No description";
      const cvssV3 = it.impact?.baseMetricV3?.cvssV3?.baseScore;
      const cvssV2 = it.impact?.baseMetricV2?.cvssV2?.baseScore;
      const cvss =
        typeof cvssV3 === "number"
          ? cvssV3
          : typeof cvssV2 === "number"
          ? cvssV2
          : null;
      const published = it.publishedDate || it.published || null;
      const products = extractVendorProducts(it);
      return { id, summary, cvss, published, products };
    });

    const enriched = await enrichEPSSandKEV(parsed);
    return enriched;
  } catch {
    return [];
  }
}
