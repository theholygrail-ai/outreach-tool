/**
 * Second-pass vendor fill when website scrape / Groq left contacts sparse (common on thin or JS-heavy sites).
 */
import { config } from "@outreach-tool/shared/config";
import { createLogger } from "@outreach-tool/shared/logger";
import {
  applyHunterDomainEmailsToProspect,
  hunterDomainSearch,
  hunterEmailFinder,
} from "./providers/hunter.js";
import { apolloPeopleMatch } from "./providers/apollo.js";

const log = createLogger("contact-backfill");

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

/**
 * Fills missing email / name / phone / LinkedIn using Hunter (domain) then Apollo (match), then Hunter email-finder.
 * @param {object} prospect — mutated
 */
export async function backfillProspectContactsFromVendors(prospect) {
  if (!prospect.company_website) return;

  const domain = hostnameFromWebsite(prospect.company_website);
  const sparse =
    !prospect.email ||
    !prospect.first_name ||
    !prospect.last_name ||
    !prospect.phone_number ||
    !prospect.linkedin_url;
  if (!sparse) return;

  if (domain && config.enrichment?.hunterApiKey) {
    try {
      const ds = await hunterDomainSearch(domain);
      const emails = ds.data?.emails;
      if (!ds.error && emails?.length) {
        const applied = applyHunterDomainEmailsToProspect(prospect, emails);
        if (applied && !prospect.data_sources.includes("hunter_backfill")) {
          prospect.data_sources.push("hunter_backfill");
        }
      }
    } catch (e) {
      log.warn("Hunter backfill failed", { company: prospect.company_name, error: e.message });
    }
  }

  if (config.enrichment?.apolloApiKey) {
    try {
      const apollo = await apolloPeopleMatch(prospect);
      if (apollo.matched && apollo.person) {
        applyApolloPerson(prospect, apollo.person);
        if (!prospect.data_sources.includes("apollo_backfill")) prospect.data_sources.push("apollo_backfill");
      }
    } catch (e) {
      log.warn("Apollo backfill failed", { company: prospect.company_name, error: e.message });
    }
  }

  if (domain && config.enrichment?.hunterApiKey && prospect.first_name && prospect.last_name && !prospect.email) {
    try {
      const finder = await hunterEmailFinder(domain, prospect.first_name, prospect.last_name);
      if (!finder.error && finder.data?.email && !prospect.email) {
        prospect.email = finder.data.email;
        if (!prospect.data_sources.includes("hunter")) prospect.data_sources.push("hunter");
      }
    } catch (e) {
      log.warn("Hunter email-finder backfill failed", { error: e.message });
    }
  }
}
