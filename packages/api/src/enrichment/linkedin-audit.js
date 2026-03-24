/**
 * Audit LinkedIn URLs on prospects: ensure /in/ profiles plausibly belong to the company
 * (name slug, presence on company site, or LLM check on excerpt). Company pages are not person contacts.
 */

/** @param {string} url */
export function parseLinkedInUrl(url) {
  if (!url || typeof url !== "string") return { type: null, slug: null, normalized: null };
  const m = url.trim().match(/linkedin\.com\/(in|company)\/([^/?#]+)/i);
  if (!m) return { type: null, slug: null, normalized: null };
  const kind = m[1].toLowerCase() === "company" ? "company" : "person";
  let slug = m[2];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* keep raw */
  }
  const normalized = `https://www.linkedin.com/${m[1].toLowerCase()}/${slug}`.toLowerCase();
  return { type: kind, slug: slug.toLowerCase(), normalized };
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractAllLinkedInUrls(text) {
  if (!text) return [];
  const re = /https?:\/\/(?:www\.)?linkedin\.com\/(in|company)\/[^?\s"'<>#)]+/gi;
  const found = text.match(re) || [];
  return [...new Set(found.map((u) => u.replace(/\/+$/, "").trim()))];
}

function normToken(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * LinkedIn /in/ slugs often look like ann-smith-12345678 or annsmith
 */
export function slugMatchesPersonName(slug, firstName, lastName) {
  if (!slug) return false;
  const f = normToken(firstName);
  const l = normToken(lastName);
  if (!f && !l) return false;
  let s = slug.toLowerCase().replace(/\/+$/, "");
  s = s.replace(/-\d{5,}$/, "").replace(/-\d+$/, "");
  const parts = s.split("-").map((p) => normToken(p)).filter(Boolean);
  const compact = parts.join("");
  const fl = f + l;
  const lf = l + f;
  if (f && l && (compact === fl || compact === lf)) return true;
  if (f && l && parts.length >= 2) {
    const hasF = parts.some((p) => p === f || p.startsWith(f) || f.startsWith(p));
    const hasL = parts.some((p) => p === l || p.startsWith(l) || l.startsWith(p));
    if (hasF && hasL) return true;
  }
  if (f && parts.length === 1 && parts[0].includes(f)) return true;
  return false;
}

function normalizeUrlForMatch(u) {
  try {
    const p = parseLinkedInUrl(u);
    return p.normalized || u.toLowerCase().replace(/\/+$/, "");
  } catch {
    return u.toLowerCase().replace(/\/+$/, "");
  }
}

export function linkedInUrlAppearsOnSite(url, websiteContent) {
  if (!url || !websiteContent) return false;
  const n = normalizeUrlForMatch(url);
  const lower = websiteContent.toLowerCase();
  if (lower.includes(n.replace("https://", "").replace("http://", ""))) return true;
  const short = n.split("/in/")[1] || n.split("/company/")[1];
  if (short && lower.includes(short.toLowerCase())) return true;
  return false;
}

const TEAM_CTX = /\b(team|about\s*us|our\s*team|leadership|staff|contact|people|who\s*we\s*are|meet\s*the)\b/i;

export function linkedInUrlInTeamContext(url, websiteContent) {
  if (!url || !websiteContent) return false;
  const idx = websiteContent.toLowerCase().indexOf(url.toLowerCase().slice(0, Math.min(80, url.length)));
  if (idx < 0) {
    const slug = parseLinkedInUrl(url).slug;
    if (!slug) return false;
    const i2 = websiteContent.toLowerCase().indexOf(slug);
    if (i2 < 0) return false;
    return TEAM_CTX.test(websiteContent.slice(Math.max(0, i2 - 120), i2 + 200));
  }
  return TEAM_CTX.test(websiteContent.slice(Math.max(0, idx - 120), idx + 200));
}

/**
 * Pick best /in/ URL for prospect from page; prefer name match + team context.
 * @param {string[]} urls
 * @param {{ first_name?: string, last_name?: string, company_name?: string }} prospect
 * @param {string} websiteContent
 */
export function pickBestPersonLinkedInFromPage(urls, prospect, websiteContent) {
  const { first_name, last_name } = prospect;
  const personUrls = urls.filter((u) => parseLinkedInUrl(u).type === "person");
  if (personUrls.length === 0) return null;

  let best = null;
  let bestScore = -1;
  for (const u of personUrls) {
    const { slug } = parseLinkedInUrl(u);
    let score = 0;
    if (slugMatchesPersonName(slug || "", first_name || "", last_name || "")) score += 50;
    if (linkedInUrlAppearsOnSite(u, websiteContent)) score += 25;
    if (linkedInUrlInTeamContext(u, websiteContent)) score += 25;
    if (score > bestScore) {
      bestScore = score;
      best = u;
    }
  }
  if (bestScore >= 50) return best;
  if (personUrls.length === 1 && linkedInUrlAppearsOnSite(personUrls[0], websiteContent)) return personUrls[0];
  return bestScore >= 25 ? best : null;
}

/**
 * @param {object} prospect
 * @param {string} websiteContent — plain text from site
 * @param {(system: string, user: string) => Promise<object>} askGroqFn
 */
export async function auditLinkedInAffiliation(prospect, websiteContent, askGroqFn) {
  const url = prospect.linkedin_url?.trim() || null;
  if (!url) {
    return {
      status: "no_url",
      action: "none",
      kind: null,
      reason: "No LinkedIn URL on prospect.",
    };
  }

  const parsed = parseLinkedInUrl(url);
  if (!parsed.type) {
    return {
      status: "rejected",
      action: "clear",
      kind: null,
      reason: "Unparseable LinkedIn URL.",
    };
  }

  if (parsed.type === "company") {
    return {
      status: "company_page",
      action: "clear",
      kind: "company",
      company_url: url,
      reason: "LinkedIn URL is a company page, not an individual contact.",
    };
  }

  const content = websiteContent || "";
  const slugHit = slugMatchesPersonName(parsed.slug || "", prospect.first_name || "", prospect.last_name || "");
  const onSite = linkedInUrlAppearsOnSite(url, content);
  const teamCtx = linkedInUrlInTeamContext(url, content);

  if (slugHit && (onSite || teamCtx || content.length < 80)) {
    return {
      status: "verified",
      action: "keep",
      kind: "person",
      reason: "Profile slug matches contact name" + (onSite ? " and URL appears on company site." : "."),
      signals: { slug_matches_name: true, on_company_website: onSite, team_context: teamCtx },
    };
  }

  if (onSite && teamCtx) {
    return {
      status: "verified",
      action: "keep",
      kind: "person",
      reason: "LinkedIn profile linked from team/about-style section on company website.",
      signals: { slug_matches_name: slugHit, on_company_website: true, team_context: true },
    };
  }

  if (onSite && !teamCtx && (prospect.first_name || prospect.last_name)) {
    if (slugHit) {
      return {
        status: "verified",
        action: "keep",
        kind: "person",
        reason: "URL on site and slug matches name.",
        signals: { slug_matches_name: true, on_company_website: true, team_context: false },
      };
    }
  }

  if (onSite && !slugHit && (prospect.first_name || prospect.last_name)) {
    const excerpt = extractExcerptAroundLinkedIn(content, url, 900);
    if (askGroqFn && excerpt.length > 40) {
      try {
        const groq = await askGroqFn(
          "You verify employment affiliation using ONLY the excerpt. Never invent ties. If unsure, answer not affiliated.",
          `Company: "${prospect.company_name || "unknown"}"\n` +
            `Contact name: "${`${prospect.first_name || ""} ${prospect.last_name || ""}`.trim()}"\n` +
            `LinkedIn profile URL path: /in/${parsed.slug}\n\n` +
            `Website excerpt (may mention this person or LinkedIn):\n${excerpt}\n\n` +
            `Return JSON only: { "affiliated": boolean, "confidence": number, "reason": string }\n` +
            `affiliated=true ONLY if the excerpt explicitly associates this person with this company ` +
            `(employee, founder, team member, director, etc.).`,
        );
        const ok = groq?.affiliated === true && Number(groq?.confidence) >= 0.55;
        if (ok) {
          return {
            status: "verified",
            action: "keep",
            kind: "person",
            reason: `Groq audit: ${groq.reason || "affiliated"}`,
            signals: { groq_affiliated: true, on_company_website: true },
          };
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (!content || content.length < 40) {
    if (slugHit) {
      return {
        status: "verified",
        action: "keep",
        kind: "person",
        reason: "No site text; slug matches contact name (weak signal).",
        signals: { slug_matches_name: true, on_company_website: false },
      };
    }
    return {
      status: "rejected",
      action: "clear",
      kind: "person",
      reason: "No website content to verify; LinkedIn slug does not match contact name.",
    };
  }

  if (slugHit) {
    return {
      status: "verified",
      action: "keep",
      kind: "person",
      reason: "Slug matches contact name.",
      signals: { slug_matches_name: true, on_company_website: onSite, team_context: teamCtx },
    };
  }

  return {
    status: "rejected",
    action: "clear",
    kind: "person",
    reason:
      "LinkedIn profile does not match contact name and is not clearly tied to the company on the website.",
    signals: { slug_matches_name: false, on_company_website: onSite, team_context: teamCtx },
  };
}

function extractExcerptAroundLinkedIn(content, url, maxLen) {
  const lower = content.toLowerCase();
  const slug = parseLinkedInUrl(url).slug;
  let pos = lower.indexOf(url.toLowerCase().slice(0, 60));
  if (pos < 0 && slug) pos = lower.indexOf(slug);
  if (pos < 0) return content.slice(0, maxLen);
  const start = Math.max(0, pos - maxLen / 2);
  return content.slice(start, start + maxLen);
}
