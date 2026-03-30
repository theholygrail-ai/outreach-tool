/**
 * Browserbase + Playwright: operator signs into LinkedIn via live session (debugger URL),
 * then we reconnect over CDP and scrape public profile UI text into prospect fields (Groq with grounding).
 */
import { config } from "@outreach-tool/shared/config";
import { createLogger } from "@outreach-tool/shared/logger";
import OpenAI from "openai";
import { chromium } from "playwright";
import { emailLiteralInText, phoneDigitsInText, personNameInText, rolePhraseInText } from "./grounding.js";

const log = createLogger("browserbase-li");
const groq = new OpenAI({ apiKey: config.groq.apiKey, baseURL: config.groq.baseURL });

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getBbClient() {
  const { default: Browserbase } = await import("@browserbasehq/sdk");
  return new Browserbase({ apiKey: config.enrichment.browserbaseApiKey });
}

export function normalizeLinkedInProfileUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  const u = raw.trim();
  if (!u) return null;
  try {
    const url = new URL(u.startsWith("http") ? u : `https://${u}`);
    const host = url.hostname.replace(/^www\./i, "");
    if (!/^linkedin\.com$/i.test(host)) return null;
    const path = url.pathname.replace(/\/+$/, "");
    if (!/^\/(in|sales)\//i.test(path)) return null;
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

function linkedInSearchPeopleUrl(keywords) {
  const q = encodeURIComponent(keywords.trim());
  return `https://www.linkedin.com/search/results/people/?keywords=${q}&origin=GLOBAL_SEARCH_HEADER`;
}

/**
 * Heuristic: LinkedIn served a login / checkpoint / join page instead of content.
 * @param {string} url
 * @param {string} title
 * @param {string} excerpt
 */
export function isLinkedInAuthWall(url, title, excerpt) {
  const u = (url || "").toLowerCase();
  if (/\/login|\/checkpoint|\/uas\/|authwall|challenge/i.test(u)) return true;
  const t = (title || "").toLowerCase();
  if (t.includes("linkedin") && (t.includes("sign in") || t.includes("signin"))) return true;
  const e = (excerpt || "").slice(0, 800).toLowerCase();
  const short = (excerpt || "").length < 500;
  if (short && e.includes("sign in") && e.includes("linkedin")) return true;
  if (short && e.includes("join linkedin")) return true;
  if (short && e.includes("welcome to your professional community")) return true;
  return false;
}

function sessionCreateParams() {
  const createParams = {
    keepAlive: true,
    timeout: 1800,
    browserSettings: { solveCaptchas: true, blockAds: true },
  };
  if (config.enrichment.browserbaseProjectId) {
    createParams.projectId = config.enrichment.browserbaseProjectId;
  }
  return createParams;
}

/**
 * @param {import("playwright").Page} page
 * @param {object} raw — prospect-like row
 * @returns {Promise<{ ok?: boolean, skipped?: boolean, partial?: boolean, needsLogin?: boolean, prospect: object, detail: object, error?: string }>}
 */
export async function enrichOneProspectWithPage(page, raw) {
  const prospect = { ...raw };
  const detail = { linkedin_urls_tried: [], excerpt_chars: 0, used_search: false, page_url: "", page_title: "" };

  try {
    let profileUrl = normalizeLinkedInProfileUrl(prospect.linkedin_url);
    if (!profileUrl) {
      const kw = [prospect.first_name, prospect.last_name, prospect.company_name].filter(Boolean).join(" ").trim();
      if (kw.length < 3) {
        return { skipped: true, prospect, detail, error: "no LinkedIn URL and insufficient name/company for search" };
      }
      detail.used_search = true;
      await page.goto(linkedInSearchPeopleUrl(kw), { waitUntil: "domcontentloaded", timeout: 45000 });
      await delay(4000);
      detail.page_url = page.url();
      detail.page_title = await page.title().catch(() => "");
      let excerpt = await extractMainInnerText(page);
      if (isLinkedInAuthWall(detail.page_url, detail.page_title, excerpt)) {
        return { needsLogin: true, prospect, detail: { ...detail, excerpt_chars: excerpt.length } };
      }
      profileUrl = await firstProfileHrefFromSearch(page);
      detail.linkedin_urls_tried.push(linkedInSearchPeopleUrl(kw));
      if (profileUrl) {
        prospect.linkedin_url = prospect.linkedin_url || profileUrl;
        detail.linkedin_urls_tried.push(profileUrl);
      }
    } else {
      detail.linkedin_urls_tried.push(profileUrl);
    }

    if (!profileUrl) {
      return { skipped: true, prospect, detail, error: "could not resolve LinkedIn profile URL" };
    }

    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await delay(2500);
    detail.page_url = page.url();
    detail.page_title = await page.title().catch(() => "");
    const excerpt = await extractMainInnerText(page);
    detail.excerpt_chars = excerpt.length;

    if (isLinkedInAuthWall(detail.page_url, detail.page_title, excerpt)) {
      return { needsLogin: true, prospect, detail };
    }

    if (excerpt.length < 80) {
      return { partial: true, prospect, detail, error: "profile text too short (private profile, rate limit, or empty page)" };
    }

    const parsed = await askGroqFromProfileExcerpt(prospect.company_name, excerpt);
    applyProvenanceFromExcerpt(prospect, parsed.fields || {}, parsed.field_sources || {}, excerpt);

    if (!prospect.data_sources) prospect.data_sources = [];
    if (!prospect.data_sources.includes("browserbase_linkedin")) {
      prospect.data_sources.push("browserbase_linkedin");
    }

    return { ok: true, prospect, detail };
  } catch (e) {
    return { prospect, detail, error: e.message };
  }
}

function snippetInText(snippet, combinedLower) {
  if (!snippet || snippet.length < 4) return false;
  const s = snippet.toLowerCase().replace(/\s+/g, " ").slice(0, 200);
  return combinedLower.includes(s.slice(0, Math.min(40, s.length)));
}

async function askGroqFromProfileExcerpt(companyHint, excerpt) {
  const prompt =
    `Company context (may be wrong; use only profile text): "${companyHint || "unknown"}"\n\n` +
    `LinkedIn profile page plain text:\n${excerpt.slice(0, 24000)}\n\n` +
    `Return JSON only: {\n` +
    `  "fields": { "first_name": string|null, "last_name": string|null, "executive_role": string|null, "email": string|null, "phone": string|null, "linkedin_url": string|null, "city_or_region": string|null },\n` +
    `  "field_sources": { "first_name": {"snippet": string}|null, ... }\n` +
    `}\n` +
    `Rules: Only set a field if the value appears literally in the profile text or is an obvious substring. ` +
    `Never invent email or phone. field_sources.snippet must be a verbatim substring for each non-null field.`;

  const response = await groq.chat.completions.create({
    model: config.groq.model,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You extract professional profile data from LinkedIn-style plain text. Never invent contact info. " +
          "Use null unless the text clearly supports the field.",
      },
      { role: "user", content: prompt },
    ],
  });
  const raw = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return { fields: {}, field_sources: {} };
  }
}

function applyProvenanceFromExcerpt(prospect, fields, fieldSources, combinedText) {
  const lower = combinedText.toLowerCase();
  const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emailsInText = combinedText.match(emailRe) || [];

  const merge = (key, val, sourceKey) => {
    if (!val) return;
    const src = fieldSources?.[sourceKey];
    if (src?.snippet && snippetInText(src.snippet, lower)) {
      prospect[key] = prospect[key] || val;
      return;
    }
    if (key === "email" && emailLiteralInText(val, combinedText)) prospect[key] = prospect[key] || val;
    if (key === "phone_number" && phoneDigitsInText(val, combinedText)) prospect[key] = prospect[key] || val;
  };

  merge("email", fields.email, "email");
  merge("phone_number", fields.phone, "phone");

  if (fields.first_name && fields.last_name) {
    const full = `${fields.first_name} ${fields.last_name}`;
    const src = fieldSources?.first_name || fieldSources?.last_name;
    if (src?.snippet && snippetInText(src.snippet, lower)) {
      prospect.first_name = prospect.first_name || fields.first_name;
      prospect.last_name = prospect.last_name || fields.last_name;
    } else if (personNameInText(full, combinedText)) {
      prospect.first_name = prospect.first_name || fields.first_name;
      prospect.last_name = prospect.last_name || fields.last_name;
    }
  }

  if (fields.executive_role) {
    const src = fieldSources?.executive_role;
    if (src?.snippet && snippetInText(src.snippet, lower)) {
      prospect.executive_role = prospect.executive_role || fields.executive_role;
    } else if (rolePhraseInText(fields.executive_role, combinedText)) {
      prospect.executive_role = prospect.executive_role || fields.executive_role;
    }
  }

  if (fields.linkedin_url) {
    const norm = normalizeLinkedInProfileUrl(fields.linkedin_url);
    if (norm && combinedText.replace(/\s/g, "").toLowerCase().includes(norm.replace(/^https?:\/\//, "").replace(/\s/g, "").toLowerCase())) {
      prospect.linkedin_url = prospect.linkedin_url || norm;
    }
  }

  if (fields.city_or_region && fieldSources?.city_or_region?.snippet && snippetInText(fieldSources.city_or_region.snippet, lower)) {
    prospect.city_or_region = prospect.city_or_region || fields.city_or_region;
  }

  if (!prospect.email && emailsInText.length) {
    const good = emailsInText.find((e) => !e.includes("example.com") && !e.includes("linkedin.com"));
    if (good) prospect.email = good;
  }
}

async function extractMainInnerText(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const root = main || document.body;
    return (root?.innerText || "").replace(/\s+/g, " ").trim();
  });
}

async function firstProfileHrefFromSearch(page) {
  return page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/in/"]')];
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      if (/linkedin\.com\/(in|sales)\/[^/?#]+/i.test(href) && !/miniProfile|overlay/i.test(href)) {
        try {
          const u = new URL(href, "https://www.linkedin.com");
          return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
        } catch {
          /* ignore */
        }
      }
    }
    return null;
  });
}

/**
 * Create a Browserbase session for LinkedIn login. Open `debugger_url` in a popup so the user can authenticate.
 * @returns {Promise<{ session_id: string, debugger_url: string, debugger_fullscreen_url: string, expires_at: string }>}
 */
export async function createLinkedInAuthSession() {
  if (!config.enrichment?.browserbaseApiKey) {
    throw new Error("BROWSERBASE_API_KEY is not configured");
  }
  const bb = await getBbClient();
  const session = await bb.sessions.create(sessionCreateParams());
  const live = await bb.sessions.debug(session.id);
  log.info("Browserbase session created", { session_id: session.id });
  return {
    session_id: session.id,
    debugger_url: live.debuggerUrl,
    debugger_fullscreen_url: live.debuggerFullscreenUrl,
    expires_at: session.expiresAt,
  };
}

/**
 * Reconnect to an existing session and enrich prospects (mutates copies — caller saves).
 * @param {string} sessionId
 * @param {object[]} prospects — plain objects with id, linkedin_url, first_name, etc.
 * @returns {Promise<{ results: object[], errors: string[] }>}
 */
export async function enrichProspectsViaLinkedInSession(sessionId, prospects) {
  if (!config.enrichment?.browserbaseApiKey) {
    throw new Error("BROWSERBASE_API_KEY is not configured");
  }
  const bb = await getBbClient();
  const retrieved = await bb.sessions.retrieve(sessionId);
  const connectUrl = retrieved.connectUrl;
  if (!connectUrl) {
    throw new Error("Session has no connectUrl (expired or invalid session_id)");
  }

  const browser = await chromium.connectOverCDP(connectUrl);
  const results = [];
  const errors = [];

  try {
    const context = browser.contexts()[0] || (await browser.newContext());
    const pages = context.pages();
    const page = pages[0] || (await context.newPage());

    for (const raw of prospects) {
      const r = await enrichOneProspectWithPage(page, raw);
      const prospect = r.prospect;
      const detail = r.detail;
      if (r.needsLogin) {
        errors.push(`${prospect.id || "?"}: LinkedIn sign-in required (use live session / debugger)`);
        results.push({ prospect, needs_login: true, detail });
        continue;
      }
      if (r.skipped) {
        errors.push(`${prospect.id || "?"}: ${r.error || "skipped"}`);
        results.push({ prospect, skipped: true, detail });
        continue;
      }
      if (r.partial) {
        errors.push(`${prospect.id || "?"}: ${r.error || "partial"}`);
        results.push({ prospect, partial: true, detail });
        continue;
      }
      if (r.error) {
        log.warn("LinkedIn enrich row failed", { id: prospect.id, error: r.error });
        errors.push(`${prospect.id || "?"}: ${r.error}`);
        results.push({ prospect, error: r.error, detail });
        continue;
      }
      if (r.ok) {
        results.push({ prospect, ok: true, detail });
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return { results, errors };
}

/**
 * Single prospect: reuse Browserbase session when provided and still valid, or create a new one.
 * If LinkedIn shows a login wall, returns `needs_login` with debugger URLs (session stays alive).
 *
 * @param {object} prospect — full DB row
 * @param {{ session_id?: string | null }} [opts]
 * @returns {Promise<
 *   | { status: "ok", session_id: string, prospect: object, detail: object }
 *   | { status: "needs_login", session_id: string, debugger_url: string, debugger_fullscreen_url: string, prospect: object, detail: object }
 *   | { status: "skipped" | "partial" | "error", session_id: string, prospect: object, detail: object, error?: string }
 * >}
 */
export async function enrichOneProspectLinkedInFlow(prospect, opts = {}) {
  if (!config.enrichment?.browserbaseApiKey) {
    throw new Error("BROWSERBASE_API_KEY is not configured");
  }
  const bb = await getBbClient();
  let sessionId = opts.session_id || null;
  let connectUrl = null;

  if (sessionId) {
    try {
      const r = await bb.sessions.retrieve(sessionId);
      connectUrl = r.connectUrl || null;
      if (!connectUrl) sessionId = null;
    } catch {
      sessionId = null;
    }
  }

  if (!sessionId) {
    const session = await bb.sessions.create(sessionCreateParams());
    sessionId = session.id;
  }

  const retrieved = await bb.sessions.retrieve(sessionId);
  connectUrl = retrieved.connectUrl;
  if (!connectUrl) {
    throw new Error("Browserbase session has no connectUrl (expired or invalid)");
  }

  const browser = await chromium.connectOverCDP(connectUrl);
  try {
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());
    const r = await enrichOneProspectWithPage(page, prospect);

    if (r.needsLogin) {
      const live = await bb.sessions.debug(sessionId);
      return {
        status: "needs_login",
        session_id: sessionId,
        debugger_url: live.debuggerUrl,
        debugger_fullscreen_url: live.debuggerFullscreenUrl,
        prospect: r.prospect,
        detail: r.detail,
      };
    }
    if (r.skipped) {
      return { status: "skipped", session_id: sessionId, prospect: r.prospect, detail: r.detail, error: r.error };
    }
    if (r.partial) {
      return { status: "partial", session_id: sessionId, prospect: r.prospect, detail: r.detail, error: r.error };
    }
    if (r.error) {
      return { status: "error", session_id: sessionId, prospect: r.prospect, detail: r.detail, error: r.error };
    }
    if (r.ok) {
      return { status: "ok", session_id: sessionId, prospect: r.prospect, detail: r.detail };
    }
    return {
      status: "error",
      session_id: sessionId,
      prospect: r.prospect,
      detail: r.detail,
      error: "unexpected enrich result",
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
