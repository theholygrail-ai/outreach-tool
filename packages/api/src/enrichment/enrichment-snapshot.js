/**
 * Capture contact-related fields after vendor/deep enrich, before website verification mutates them.
 */
export function takeEnrichmentSnapshot(prospect) {
  return {
    taken_at: new Date().toISOString(),
    email: prospect.email?.trim() || null,
    phone_number: prospect.phone_number?.trim() || null,
    first_name: prospect.first_name?.trim() || null,
    last_name: prospect.last_name?.trim() || null,
    linkedin_url: prospect.linkedin_url?.trim() || null,
    executive_role: prospect.executive_role?.trim() || null,
    source_tags: [...(prospect.data_sources || [])],
  };
}

/**
 * @param {ReturnType<typeof takeEnrichmentSnapshot>} snapshot
 * @param {object} prospect — after website fill + audits
 * @param {Record<string, boolean>} filledFromWebsite — field -> true if set from site extraction this run
 * @param {Record<string, boolean>} [auditCleared] — field cleared after failed verification (e.g. LinkedIn)
 */
export function buildFieldResolution(snapshot, prospect, filledFromWebsite, auditCleared = {}) {
  const keys = ["email", "phone_number", "first_name", "last_name", "linkedin_url", "executive_role"];
  /** @type {Record<string, 'vendor' | 'website' | 'merged' | 'rejected' | null>} */
  const out = {};
  for (const k of keys) {
    const rawFinal = prospect[k];
    const final = typeof rawFinal === "string" ? rawFinal.trim() || null : rawFinal || null;
    const rawSnap = snapshot[k];
    const snap = typeof rawSnap === "string" ? rawSnap.trim() || null : rawSnap || null;
    const fromSite = !!filledFromWebsite[k];
    if (!final && !snap) {
      out[k] = null;
      continue;
    }
    if (auditCleared[k] && snap && !final) {
      out[k] = "rejected";
      continue;
    }
    if (fromSite) {
      out[k] = snap && final && String(snap).toLowerCase() === String(final).toLowerCase() ? "merged" : "website";
    } else if (snap) {
      out[k] = "vendor";
    } else if (final) {
      out[k] = "website";
    } else {
      out[k] = null;
    }
  }
  return out;
}
