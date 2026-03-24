import { config } from "@outreach-tool/shared/config";

const BASE = "https://api.firecrawl.dev/v1";

/**
 * Scrape a URL via Firecrawl API (markdown). Returns null if no key or error.
 */
export async function firecrawlScrape(url) {
  const key = config.firecrawl?.apiKey;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { error: `Firecrawl ${res.status}`, url };
    const data = await res.json();
    const content = data.data?.markdown?.slice(0, 8000) || data.data?.html?.slice(0, 8000) || "";
    return {
      title: data.data?.metadata?.title || "",
      content,
      url,
      source: "firecrawl",
    };
  } catch (err) {
    return { error: err.message, url };
  }
}
