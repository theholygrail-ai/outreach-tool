import { config } from "@outreach-tool/shared/config";

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
    const hasPair = (email && phone) || (email && li);
    if (!hasPair) {
      return { display_eligible: false, rejection_reason: "missing_required_contact_fields" };
    }
  }

  return { display_eligible: true };
}
