import { config } from "@outreach-tool/shared/config";

const BASE = "https://api.company-information.service.gov.uk";

/**
 * @param {string} companyName
 * @returns {Promise<{ matched: boolean, title?: string, company_number?: string, error?: string }>}
 */
export async function searchCompaniesHouse(companyName) {
  const key = config.enrichment?.companiesHouseApiKey;
  if (!key || !companyName?.trim()) {
    return { matched: false };
  }
  const q = encodeURIComponent(companyName.trim().slice(0, 200));
  try {
    const auth = Buffer.from(`${key}:`, "utf8").toString("base64");
    const res = await fetch(`${BASE}/search/companies?q=${q}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { matched: false, error: `http_${res.status}` };
    }
    const data = await res.json();
    const items = data?.items || [];
    if (items.length === 0) return { matched: false };
    const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const target = norm(companyName);
    const firstWord = target.split(" ")[0] || target;
    const hit =
      items.find((it) => norm(it.title || "") === target) ||
      items.find((it) => norm(it.title || "").includes(firstWord) && firstWord.length > 2) ||
      items[0];
    if (!hit?.title) return { matched: false };
    const titleNorm = norm(hit.title);
    const matched =
      titleNorm === target ||
      titleNorm.includes(target) ||
      target.includes(titleNorm) ||
      titleNorm.split(" ")[0] === firstWord;
    return {
      matched: !!matched,
      title: hit.title,
      company_number: hit.company_number || undefined,
    };
  } catch (err) {
    return { matched: false, error: err?.message || "fetch_failed" };
  }
}
