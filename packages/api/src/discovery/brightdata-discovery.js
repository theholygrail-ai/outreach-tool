/**
 * Bright Data Web Unlocker: fetch a search-engine HTML page, then Groq extracts company rows.
 * Uses the same /request unlocker as site enrichment (BRIGHTDATA_ZONE + BRIGHTDATA_API_TOKEN).
 */
import { config } from "@outreach-tool/shared/config";
import { brightdataScrapeUrl } from "../enrichment/providers/brightdata.js";

const COUNTRY_NAMES = {
  US: "United States",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
};

/**
 * @param {string} country
 * @param {string | null} industry
 * @param {number} limit
 * @param {{ askGroq: (system: string, user: string) => Promise<object> }} deps
 * @returns {Promise<object[]>}
 */
export async function discoverViaBrightData(country, industry, limit, deps) {
  const token = config.enrichment?.brightdataApiToken;
  const zone = config.enrichment?.brightdataZone;
  if (!token || !zone) return [];

  const cc = country || "US";
  const countryName = COUNTRY_NAMES[cc] || cc;
  const q = [
    "small business",
    industry || "services",
    countryName,
    "company website",
  ]
    .filter(Boolean)
    .join(" ");
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;

  const scraped = await brightdataScrapeUrl(searchUrl);
  if (scraped.skipped || scraped.error || !scraped.html) {
    throw new Error(scraped.error || "brightdata_discovery_empty");
  }

  const excerpt = scraped.html.replace(/\s+/g, " ").slice(0, 22000);
  const n = Math.min(50, Math.max(1, limit));

  const result = await deps.askGroq(
    "You extract REAL businesses from search-result HTML. Return ONLY valid JSON. Never invent domains.",
    `From this search results HTML chunk, list up to ${n} distinct small/medium companies that appear related to ${countryName}` +
      `${industry ? ` and "${industry}"` : ""}.\n` +
      `Use only names/sites clearly present in the text. If unsure, omit the row.\n` +
      `Return JSON: { "prospects": [{ "company_name": string, "company_website": string|null, "city": string|null, "industry": string|null }] }\n\n` +
      `HTML:\n${excerpt}`,
  );

  const list = result?.prospects || result?.businesses || [];
  return list.slice(0, n).map((p) => ({
    company_name: p.company_name || "Unknown",
    company_website: p.company_website || null,
    country: cc,
    industry: p.industry || industry || null,
    city_or_region: p.city || null,
    source_trace: "brightdata:discovery",
    data_sources: ["brightdata_discovery"],
  }));
}
