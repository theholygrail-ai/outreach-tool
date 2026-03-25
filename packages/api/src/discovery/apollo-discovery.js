/**
 * Apollo People API Search → unique employers as discovery rows (no emails in search response).
 * @see https://docs.apollo.io/reference/people-api-search
 */
import { config } from "@outreach-tool/shared/config";

const APOLLO_SEARCH = "https://api.apollo.io/api/v1/mixed_people/api_search";

const COUNTRY_TO_APOLLO_LOCATION = {
  US: "United States",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
};

function websiteFromOrg(org) {
  if (!org || typeof org !== "object") return null;
  const d = org.primary_domain || org.domain || org.primary_domain_name;
  if (d && typeof d === "string" && d.includes(".")) {
    const clean = d.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./i, "");
    return `https://${clean}`;
  }
  const w = org.website_url || org.website;
  if (w && typeof w === "string" && /^https?:\/\//i.test(w)) return w;
  return null;
}

function mapPersonToBiz(person, countryCode) {
  const org = person.organization || {};
  const company_name = org.name || "Unknown";
  return {
    company_name,
    company_website: websiteFromOrg(org),
    first_name: person.first_name || null,
    last_name:
      person.last_name && typeof person.last_name === "string" && !person.last_name.includes("*")
        ? person.last_name
        : null,
    executive_role: person.title || null,
    linkedin_url: person.linkedin_url || null,
    country: countryCode,
    industry: org.industry || org.linkedin_industry || null,
    city_or_region: org.city || org.raw_address || null,
    company_size_estimate: org.estimated_num_employees || org.employee_count || null,
    source_trace: "apollo:discovery",
    data_sources: ["apollo_discovery"],
  };
}

/**
 * @param {string} country — US | GB | AE
 * @param {string | null} industry
 * @param {number} limit — target unique companies
 * @returns {Promise<object[]>}
 */
export async function discoverViaApollo(country, industry, limit) {
  const key = config.enrichment?.apolloApiKey;
  if (!key) return [];

  const cc = country || "US";
  const apolloLoc = COUNTRY_TO_APOLLO_LOCATION[cc] || cc;
  const perPage = Math.min(100, Math.max(limit, 25));
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("per_page", String(perPage));
  params.append("organization_locations[]", apolloLoc);
  params.append("organization_num_employees_ranges[]", "1,10");
  params.append("organization_num_employees_ranges[]", "11,50");
  params.append("organization_num_employees_ranges[]", "51,200");
  for (const s of ["owner", "founder", "c_suite", "partner", "director", "head", "manager"]) {
    params.append("person_seniorities[]", s);
  }
  if (industry) params.set("q_keywords", industry);

  const url = `${APOLLO_SEARCH}?${params.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": key,
    },
    body: "{}",
    signal: AbortSignal.timeout(60000),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Apollo search invalid JSON (${res.status})`);
  }

  if (!res.ok) {
    const err = data?.error || data?.message || text.slice(0, 400);
    throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  }

  const people = data.people || data.contacts || [];
  const byOrg = new Map();
  for (const p of people) {
    const org = p.organization || {};
    const oid = org.id || org.organization_id || org.name;
    if (!oid || byOrg.has(String(oid))) continue;
    byOrg.set(String(oid), mapPersonToBiz(p, cc));
    if (byOrg.size >= limit) break;
  }

  return [...byOrg.values()].slice(0, limit);
}
