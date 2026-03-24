/**
 * Deterministic checks: contact values must appear in source text (anti-hallucination).
 */

export function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

/**
 * @param {string} email
 * @param {string} text
 */
export function emailLiteralInText(email, text) {
  if (!email || !text) return false;
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  return text.toLowerCase().includes(e);
}

/**
 * Phone matches if the same national significant digits (last 10 for US-style) appear in order in the page digit stream.
 * @param {string} phone
 * @param {string} text
 */
export function phoneDigitsInText(phone, text) {
  const d = digitsOnly(phone);
  if (d.length < 10) return false;
  const tail = d.length > 11 ? d.slice(-10) : d.length === 11 && d.startsWith("1") ? d.slice(1) : d.slice(-10);
  const td = digitsOnly(text);
  return td.includes(tail);
}

/**
 * Each word token (2+ chars, letters) from name must appear in text.
 * @param {string} name
 * @param {string} text
 */
export function personNameInText(name, text) {
  if (!name || !text) return false;
  const lower = text.toLowerCase();
  const tokens = String(name)
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z']/g, "").toLowerCase())
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return false;
  return tokens.every((t) => lower.includes(t));
}

/**
 * Role / title must appear substantially in text (prevents invented titles).
 * @param {string} role
 * @param {string} text
 */
export function rolePhraseInText(role, text) {
  if (!role || !text) return false;
  const r = String(role).trim().toLowerCase().replace(/\s+/g, " ");
  if (r.length < 4) return false;
  return text.toLowerCase().includes(r);
}

/**
 * Strip Groq-extracted contact fields that are not substantiated by the page text.
 * @returns {{ contact_name, contact_role, contact_email, contact_phone, grounding_dropped: string[] }}
 */
export function sanitizeGroqWebsiteContacts(groq, websiteContent) {
  const grounding_dropped = [];
  const out = {
    contact_name: groq.contact_name || null,
    contact_role: groq.contact_role || null,
    contact_email: groq.contact_email || null,
    contact_phone: groq.contact_phone || null,
    grounding_dropped,
  };

  if (out.contact_email && !emailLiteralInText(out.contact_email, websiteContent)) {
    grounding_dropped.push("contact_email:not_in_page");
    out.contact_email = null;
  }
  if (out.contact_phone && !phoneDigitsInText(out.contact_phone, websiteContent)) {
    grounding_dropped.push("contact_phone:not_in_page");
    out.contact_phone = null;
  }
  if (out.contact_name && !personNameInText(out.contact_name, websiteContent)) {
    grounding_dropped.push("contact_name:not_in_page");
    out.contact_name = null;
  }
  if (out.contact_role && !rolePhraseInText(out.contact_role, websiteContent)) {
    grounding_dropped.push("contact_role:not_in_page");
    out.contact_role = null;
  }

  return out;
}

/**
 * When multiple emails exist, agent picks an index only (cannot invent addresses).
 * @param {string} excerpt
 * @param {string[]} emails
 * @param {(s: string, u: string) => Promise<object>} askGroq
 * @returns {Promise<number>} safe index
 */
export async function agentRankEmailCandidates(excerpt, emails, askGroq) {
  if (!emails?.length) return 0;
  if (emails.length === 1) return 0;
  try {
    const r = await askGroq(
      "You select the best business contact email using ONLY the excerpt. You MUST pick one of the listed indices; never output an email string not in the list. If unclear, pick 0.",
      `Website excerpt:\n${excerpt.slice(0, 2800)}\n\nCandidate emails (choose by index only):\n${emails.map((e, i) => `${i}: ${e}`).join("\n")}\n\n` +
        `Return JSON only: { "index": number, "reason": string }. Index must be 0..${emails.length - 1}.`,
    );
    const i = Number(r?.index);
    if (Number.isInteger(i) && i >= 0 && i < emails.length) return i;
  } catch {
    /* fall through */
  }
  return 0;
}
