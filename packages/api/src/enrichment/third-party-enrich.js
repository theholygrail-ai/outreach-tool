/**
 * Apollo + Hunter enrichment before website crawl (fills gaps; does not invent on-site text).
 */
import { createLogger } from "@outreach-tool/shared/logger";
import { apolloPeopleMatch } from "./providers/apollo.js";
import { hunterDomainSearch, hunterEmailFinder } from "./providers/hunter.js";

const log = createLogger("third-party-enrich");

function hostnameFromWebsite(w) {
  if (!w) return null;
  try {
    const u = new URL(w.startsWith("http") ? w : `https://${w}`);
    return u.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function applyApolloPerson(prospect, person) {
  if (!person) return;
  if (person.email && !prospect.email) prospect.email = person.email;
  if (person.phone_numbers?.[0]?.raw_number && !prospect.phone_number) {
    prospect.phone_number = person.phone_numbers[0].raw_number;
  }
  if (person.linkedin_url && !prospect.linkedin_url) prospect.linkedin_url = person.linkedin_url;
  if (person.title && !prospect.executive_role) prospect.executive_role = person.title;
  if (person.first_name && !prospect.first_name) prospect.first_name = person.first_name;
  if (person.last_name && !prospect.last_name) prospect.last_name = person.last_name;
}

function pickHunterEmail(emails, firstName, lastName) {
  if (!Array.isArray(emails) || emails.length === 0) return null;
  const fn = (firstName || "").toLowerCase();
  const ln = (lastName || "").toLowerCase();
  if (fn || ln) {
    const byName = emails.find((e) => {
      const f = (e.first_name || "").toLowerCase();
      const l = (e.last_name || "").toLowerCase();
      return (fn && f.includes(fn)) || (ln && l.includes(ln)) || (fn && ln && f.includes(fn) && l.includes(ln));
    });
    if (byName?.value) return byName.value;
  }
  const generic = emails.find((e) => e.type === "generic" && e.value);
  if (generic?.value) return generic.value;
  return emails[0]?.value || null;
}

/**
 * Mutates prospect; returns a small audit object for enrichment_details.
 * @param {object} prospect
 */
export async function runVendorEnrichment(prospect) {
  const out = { apollo: null, hunter: null, errors: [] };

  if (!prospect.data_sources) prospect.data_sources = [];

  try {
    const apollo = await apolloPeopleMatch(prospect);
    out.apollo = apollo;
    if (apollo.matched && apollo.person) {
      applyApolloPerson(prospect, apollo.person);
      if (!prospect.data_sources.includes("apollo")) prospect.data_sources.push("apollo");
    } else if (apollo.error) {
      out.errors.push(`apollo: ${apollo.error}`);
    }
  } catch (e) {
    log.warn("Apollo enrichment failed", { error: e.message });
    out.errors.push(`apollo: ${e.message}`);
  }

  const domain = hostnameFromWebsite(prospect.company_website);
  if (domain) {
    try {
      const ds = await hunterDomainSearch(domain);
      out.hunter = out.hunter || {};
      out.hunter.domain_search = ds.error ? { error: ds.error } : { emails_found: ds.data?.emails?.length ?? 0 };

      if (!ds.error && ds.data?.emails?.length) {
        const email = pickHunterEmail(ds.data.emails, prospect.first_name, prospect.last_name);
        if (email && !prospect.email) {
          prospect.email = email;
          if (!prospect.data_sources.includes("hunter")) prospect.data_sources.push("hunter");
        }
      }

      if (prospect.first_name && prospect.last_name && !prospect.email) {
        const finder = await hunterEmailFinder(domain, prospect.first_name, prospect.last_name);
        out.hunter.email_finder = finder.error ? { error: finder.error } : { email: finder.data?.email || null };
        if (!finder.error && finder.data?.email && !prospect.email) {
          prospect.email = finder.data.email;
          if (!prospect.data_sources.includes("hunter")) prospect.data_sources.push("hunter");
        }
      } else if (ds.skipped) {
        /* no-op */
      }
    } catch (e) {
      log.warn("Hunter enrichment failed", { error: e.message });
      out.errors.push(`hunter: ${e.message}`);
    }
  }

  return out;
}
