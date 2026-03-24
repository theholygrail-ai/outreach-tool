/**
 * Apollo.io People Enrichment (POST /people/match).
 * @see https://docs.apollo.io/reference/people-enrichment
 */
import { config } from "@outreach-tool/shared/config";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function hostnameFromWebsite(w) {
  if (!w) return null;
  try {
    const u = new URL(w.startsWith("http") ? w : `https://${w}`);
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ skipped?: boolean, error?: string, status?: number, person?: object, matched?: boolean }>}
 */
export async function apolloPeopleMatch(prospect) {
  const key = config.enrichment?.apolloApiKey;
  if (!key) return { skipped: true };

  const params = new URLSearchParams();
  if (prospect.email) params.set("email", String(prospect.email).trim());
  if (prospect.first_name) params.set("first_name", prospect.first_name);
  if (prospect.last_name) params.set("last_name", prospect.last_name);
  if (prospect.full_name && !prospect.first_name) params.set("name", prospect.full_name);
  if (prospect.company_name) params.set("organization_name", prospect.company_name);
  const domain = hostnameFromWebsite(prospect.company_website);
  if (domain) params.set("domain", domain);
  if (prospect.linkedin_url) params.set("linkedin_url", prospect.linkedin_url);

  if (config.enrichment?.apolloRevealPersonalEmails) {
    params.set("reveal_personal_emails", "true");
  }

  if ([...params.keys()].length === 0) {
    return { skipped: true, error: "no_match_params" };
  }

  const url = `${APOLLO_BASE}/people/match?${params.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": key,
    },
    body: "{}",
    signal: AbortSignal.timeout(45000),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "invalid_json", status: res.status, raw: text.slice(0, 200) };
  }

  if (!res.ok) {
    return { error: data?.error || data?.message || text.slice(0, 300), status: res.status };
  }

  const person = data?.person;
  if (!person || typeof person !== "object") {
    return { matched: false, person: null };
  }

  return { matched: true, person };
}
