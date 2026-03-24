/**
 * Hunter.io — domain search, email finder, verifier.
 * @see https://hunter.io/api-documentation
 */
import { config } from "@outreach-tool/shared/config";

const HUNTER = "https://api.hunter.io/v2";

function withKey(path, searchParams) {
  const key = config.enrichment?.hunterApiKey;
  if (!key) return null;
  const q = new URLSearchParams(searchParams);
  q.set("api_key", key);
  return `${HUNTER}${path}?${q.toString()}`;
}

/**
 * @returns {Promise<{ skipped?: boolean, error?: string, data?: object }>}
 */
export async function hunterDomainSearch(domain) {
  const url = withKey("/domain-search", { domain, limit: "15" });
  if (!url) return { skipped: true };

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "invalid_json", raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    return { error: data?.errors?.[0]?.details || data?.message || text.slice(0, 200), status: res.status };
  }
  return { data: data?.data || data };
}

/**
 * @returns {Promise<{ skipped?: boolean, error?: string, data?: object }>}
 */
export async function hunterEmailFinder(domain, firstName, lastName) {
  if (!domain || (!firstName && !lastName)) return { skipped: true };
  const q = { domain };
  if (firstName) q.first_name = firstName;
  if (lastName) q.last_name = lastName;
  const url = withKey("/email-finder", q);
  if (!url) return { skipped: true };

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "invalid_json", raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    return { error: data?.errors?.[0]?.details || data?.message || text.slice(0, 200), status: res.status };
  }
  return { data: data?.data || data };
}

/**
 * @returns {Promise<{ skipped?: boolean, error?: string, data?: object }>}
 */
export async function hunterVerifyEmail(email) {
  if (!email) return { skipped: true };
  const url = withKey("/email-verifier", { email: String(email).trim() });
  if (!url) return { skipped: true };

  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "invalid_json", raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    return { error: data?.errors?.[0]?.details || data?.message || text.slice(0, 200), status: res.status };
  }
  return { data: data?.data || data };
}
