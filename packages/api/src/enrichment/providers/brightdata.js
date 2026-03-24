/**
 * Bright Data Web Unlocker — sync scrape via POST /request (same contract as brightdata-sdk sync mode).
 * @see https://github.com/brightdata/sdk-python (WebUnlockerService ENDPOINT = "/request")
 */
import { config } from "@outreach-tool/shared/config";

const REQUEST_URL = "https://api.brightdata.com/request";

/**
 * @returns {Promise<{ skipped?: boolean, error?: string, html?: string, status?: number }>}
 */
export async function brightdataScrapeUrl(pageUrl) {
  const token = config.enrichment?.brightdataApiToken;
  const zone = config.enrichment?.brightdataZone;
  if (!token || !zone) return { skipped: true };

  let normalized = pageUrl;
  try {
    normalized = new URL(pageUrl.startsWith("http") ? pageUrl : `https://${pageUrl}`).href;
  } catch {
    return { error: "invalid_url" };
  }

  const res = await fetch(REQUEST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      zone,
      url: normalized,
      format: "raw",
      method: "GET",
    }),
    signal: AbortSignal.timeout(120000),
  });

  const text = await res.text();
  if (!res.ok) {
    return { error: text.slice(0, 500), status: res.status };
  }
  return { html: text };
}
