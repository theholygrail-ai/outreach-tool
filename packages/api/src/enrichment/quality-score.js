/**
 * Quality score 0–100: website signals + contact completeness + cross-check validity.
 *
 * Rough weight budget:
 * - Base signals (live site, search, formats, contacts): ~85 max
 * - Cross-check / validity bonus: up to ~25, minus penalties → capped so total ≤ 100
 */

/**
 * @param {object} prospect
 * @param {object} verification — includes cross_checks from runCrossCheck
 * @returns {number} 0–100
 */
export function calculateQualityScore(prospect, verification) {
  const cc = verification?.cross_checks;
  const validity = cc?.data_validity_score ?? 50;

  let score = 0;
  if (verification?.website_live) score += 18;
  if (verification?.company_found_in_search) score += 22;
  if (verification?.email_format_valid) score += 8;
  if (verification?.email_domain_matches_website) score += 8;
  if (verification?.phone_format_valid) score += 4;
  if (prospect?.first_name && prospect?.last_name) score += 9;
  if (prospect?.executive_role) score += 4;
  if (verification?.contacts_from_website) score += 12;

  if (verification?.email_domain_mx_ok) score += 6;
  if (verification?.company_registry_match) score += 5;

  const abs = verification?.abstract_email;
  if (abs && !abs.error) {
    if (abs.is_disposable_email?.value === true) score -= 15;
    else if (abs.deliverability === "DELIVERABLE" || abs.is_deliverable?.value === true) score += 6;
    else if (abs.quality_score != null && Number.isFinite(Number(abs.quality_score))) {
      const q = Number(abs.quality_score) <= 1 ? Number(abs.quality_score) : Number(abs.quality_score) / 100;
      if (q >= 0.7) score += 4;
    }
  }

  if (cc?.by_field?.email === "match") score += 8;
  else if (cc?.by_field?.email === "partial") score += 4;
  else if (cc?.by_field?.email === "mismatch") score -= 8;

  if (cc?.by_field?.phone === "match") score += 3;
  else if (cc?.by_field?.phone === "mismatch") score -= 4;

  if (cc?.conflicts?.email || cc?.conflicts?.phone) score -= 10;

  const validityDelta = (validity - 50) * 0.12;
  score += validityDelta;

  const la = verification?.linkedin_audit;
  if (la?.status === "verified" && prospect?.linkedin_url) score += 5;
  if (la?.status === "rejected" || la?.status === "company_page") score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** @param {string | null | undefined} w */
export function hasResolvableCompanyWebsite(w) {
  if (!w || typeof w !== "string") return false;
  try {
    const u = new URL(w.startsWith("http") ? w : `https://${w.trim()}`);
    return Boolean(u.hostname?.includes("."));
  } catch {
    return false;
  }
}

/**
 * Discovery leads often fail website_live / Brave name-match (e.g. UAE names, weak sites) but are still worth saving as needs_review.
 * Bonuses are applied only in the discovery pipeline after calculateQualityScore.
 *
 * @param {object} prospect
 * @param {number} baseScore — from calculateQualityScore
 */
export function adjustScoreForDiscoveryPipeline(prospect, baseScore) {
  let s = Number(baseScore) || 0;
  const trace = prospect?.source_trace || "";
  if (trace.startsWith("explorium:")) s += 18;
  else if (trace.includes("groq")) s += 26;
  else if ((prospect?.data_sources || []).includes("brave_search") || trace === "brave_search") s += 14;

  if (hasResolvableCompanyWebsite(prospect?.company_website)) s += 10;

  return Math.max(0, Math.min(100, Math.round(s)));
}
