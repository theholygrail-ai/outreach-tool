/**
 * Hunter Discover — companies from natural-language query or geo/headcount filters.
 * @see https://hunter.io/api-documentation/v2 (Discover)
 */
import { config } from "@outreach-tool/shared/config";

const HUNTER_DISCOVER = "https://api.hunter.io/v2/discover";

const COUNTRY_NAMES = {
  US: "United States",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
};

/**
 * @param {string} country
 * @param {string | null} industry
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
export async function discoverViaHunter(country, industry, limit) {
  const key = config.enrichment?.hunterApiKey;
  if (!key) return [];

  const cc = country || "US";
  const countryName = COUNTRY_NAMES[cc] || cc;
  const maxRows = Math.min(100, Math.max(1, limit));

  const body = {
    query:
      `Small and medium service businesses in ${countryName}` +
      `${industry ? ` related to ${industry}` : ""}. Companies with websites.`,
    limit: maxRows,
    offset: 0,
  };

  const res = await fetch(`${HUNTER_DISCOVER}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Hunter discover invalid JSON (${res.status})`);
  }

  if (!res.ok) {
    const err = data?.errors?.[0]?.details || data?.message || text.slice(0, 300);
    throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  }

  const rows = data.data || [];
  return rows.slice(0, maxRows).map((row) => {
    const domain = row.domain || row.primary_domain;
    return {
      company_name: row.organization || row.name || row.company || "Unknown",
      company_website: domain ? `https://${String(domain).replace(/^https?:\/\//i, "").split("/")[0]}` : null,
      country: cc,
      industry: industry || null,
      source_trace: "hunter:discover",
      data_sources: ["hunter_discover"],
    };
  });
}
