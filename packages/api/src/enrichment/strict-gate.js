import { config } from "@outreach-tool/shared/config";

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function hasDialablePhone(phone) {
  if (!phone || typeof phone !== "string") return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function linkedinPersonUrl(li) {
  return typeof li === "string" && /linkedin\.com\/(in|sales)\//i.test(li);
}

/**
 * After enrichment + verification, decide if prospect should appear in default list.
 * @param {object} prospect
 * @param {object} verification
 * @returns {{ display_eligible: boolean, rejection_reason?: string }}
 */
export function strictDisplayGate(prospect, verification) {
  const q = verification?.quality_score ?? prospect.quality_score ?? 0;
  const minQ = config.enrichment?.strictMinQuality ?? 50;
  if (q < minQ) {
    return { display_eligible: false, rejection_reason: `quality_below_${minQ}` };
  }

  if (config.enrichment?.strictRequireContact !== false) {
    const email = prospect.email?.trim();
    const phone = prospect.phone_number?.trim();
    const li = prospect.linkedin_url?.trim();
    const mode = config.enrichment?.strictContactMode || "any_one_contact";

    if (mode === "email_only") {
      if (!email || !isValidEmailFormat(email)) {
        return { display_eligible: false, rejection_reason: "missing_required_contact_fields" };
      }
    } else if (mode === "any_one_contact") {
      const emailOk = email && isValidEmailFormat(email);
      const phoneOk = hasDialablePhone(phone);
      const liOk = linkedinPersonUrl(li);
      if (!emailOk && !phoneOk && !liOk) {
        return { display_eligible: false, rejection_reason: "missing_required_contact_fields" };
      }
    } else if (mode === "firmographic") {
      const site = Boolean(prospect.company_website?.trim());
      const name = Boolean(prospect.company_name?.trim());
      const live = verification?.website_live === true;
      if (!site || !name || !live) {
        return { display_eligible: false, rejection_reason: "firmographic_requires_live_site_and_company" };
      }
    } else {
      const hasPair = (email && phone) || (email && li);
      if (!hasPair) {
        return { display_eligible: false, rejection_reason: "missing_required_contact_fields" };
      }
    }
  }

  return { display_eligible: true };
}
