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
 * Pick best Hunter domain-search row: name match if possible, else highest-confidence personal → generic.
 * Mutates prospect (email, first_name, last_name) when empty; tags data_sources with "hunter".
 * @param {object} prospect
 * @param {object[]} emails — Hunter `data.emails`
 * @returns {boolean} true if an email was applied
 */
export function applyHunterDomainEmailsToProspect(prospect, emails) {
  if (!Array.isArray(emails) || emails.length === 0) return false;
  if (!prospect.data_sources) prospect.data_sources = [];

  const fn = (prospect.first_name || "").toLowerCase();
  const ln = (prospect.last_name || "").toLowerCase();
  let chosen = null;
  if (fn || ln) {
    chosen = emails.find((e) => {
      const f = (e.first_name || "").toLowerCase();
      const l = (e.last_name || "").toLowerCase();
      return (
        (fn && f.includes(fn)) ||
        (ln && l.includes(ln)) ||
        (fn && ln && f.includes(fn) && l.includes(ln))
      );
    });
  }
  if (!chosen?.value) {
    const sorted = [...emails]
      .filter((e) => e.value)
      .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
    chosen =
      sorted.find((e) => e.type === "personal") ||
      sorted.find((e) => e.type === "generic") ||
      sorted[0];
  }
  const email = chosen?.value;
  if (!email) return false;

  if (!prospect.email) prospect.email = email;
  if (chosen.first_name && !prospect.first_name) prospect.first_name = chosen.first_name;
  if (chosen.last_name && !prospect.last_name) prospect.last_name = chosen.last_name;
  if (!prospect.data_sources.includes("hunter")) prospect.data_sources.push("hunter");
  return true;
}

export async function hunterDomainSearch(domain) {
  const url = withKey("/domain-search", { domain, limit: "30" });
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
