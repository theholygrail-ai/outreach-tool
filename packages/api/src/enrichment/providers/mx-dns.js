import dns from "node:dns/promises";

/**
 * @param {string} domain
 * @returns {{ ok: boolean, mx_hosts: string[], error?: string }}
 */
export async function resolveMxForDomain(domain) {
  if (!domain || typeof domain !== "string") {
    return { ok: false, mx_hosts: [], error: "no_domain" };
  }
  const d = domain.toLowerCase().replace(/^www\./, "").trim();
  if (!d) return { ok: false, mx_hosts: [], error: "empty_domain" };
  try {
    const records = await dns.resolveMx(d);
    const hosts = (records || []).map((r) => r.exchange).filter(Boolean);
    return { ok: hosts.length > 0, mx_hosts: hosts };
  } catch (err) {
    return { ok: false, mx_hosts: [], error: err?.code || err?.message || "dns_failed" };
  }
}

/**
 * @param {string} email
 */
export async function resolveMxForEmail(email) {
  const domain = email?.includes("@") ? email.split("@")[1]?.trim() : null;
  return resolveMxForDomain(domain || "");
}
