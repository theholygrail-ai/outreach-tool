/**
 * Dedupe merged discovery rows by domain (preferred) or normalized company name.
 * @param {object} biz
 * @returns {string|null}
 */
export function discoveryDedupeKey(biz) {
  const w = biz.company_website;
  if (w && typeof w === "string") {
    try {
      const host = new URL(w.startsWith("http") ? w : `https://${w.trim()}`).hostname.replace(/^www\./i, "").toLowerCase();
      if (host && host.includes(".")) return `dom:${host}`;
    } catch {
      /* fall through */
    }
  }
  const n = (biz.company_name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return n.length > 2 ? `name:${n.slice(0, 160)}` : null;
}

/**
 * @param {object[]} rows
 * @param {Set<string>} seen
 * @param {object[]} out — mutated
 * @param {number} maxTotal
 */
export function mergeDiscoveryRows(rows, seen, out, maxTotal) {
  for (const b of rows) {
    if (out.length >= maxTotal) break;
    const k = discoveryDedupeKey(b);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(b);
  }
}
