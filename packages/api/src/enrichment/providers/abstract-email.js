import { config } from "@outreach-tool/shared/config";

const BASE = "https://emailvalidation.abstractapi.com/v1/";

/**
 * @param {string} email
 * @returns {Promise<object|null>} raw API JSON or null if skipped/failed
 */
export async function validateEmailAbstract(email) {
  const key = config.enrichment?.abstractApiKey;
  if (!key || !email?.trim()) return null;
  const params = new URLSearchParams({ api_key: key, email: email.trim() });
  try {
    const res = await fetch(`${BASE}?${params}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { error: `http_${res.status}`, body: await res.text().catch(() => "") };
    return await res.json();
  } catch (err) {
    return { error: err?.message || "fetch_failed" };
  }
}
