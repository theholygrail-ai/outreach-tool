/**
 * Deep enrichment: multi-page fetch, optional Firecrawl + Playwright, Groq with field provenance.
 */
import { config } from "@outreach-tool/shared/config";
import { createLogger } from "@outreach-tool/shared/logger";
import OpenAI from "openai";
import { firecrawlScrape } from "./firecrawl-client.js";
import { emailLiteralInText, phoneDigitsInText, personNameInText, rolePhraseInText } from "./grounding.js";

const log = createLogger("deep-enrich");
const groq = new OpenAI({ apiKey: config.groq.apiKey, baseURL: config.groq.baseURL });

const STATIC_PATHS = [
  "/",
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/team",
  "/our-team",
  "/imprint",
  "/legal",
];

function normalizeOrigin(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchStaticPage(url) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12000) });
    const html = await res.text();
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || "";
    const text = htmlToText(html).slice(0, 6000);
    return { url, title, text, status: res.status, source: "fetch" };
  } catch (err) {
    return { url, error: err.message, source: "fetch" };
  }
}

async function parseSitemapUrls(origin) {
  const urls = [];
  for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
    try {
      const res = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
      for (const loc of locs) {
        if (/contact|about|team|imprint|legal/i.test(loc)) urls.push(loc);
      }
    } catch { /* ignore */ }
  }
  return [...new Set(urls)].slice(0, 6);
}

async function fetchWithPlaywright(url) {
  if (!config.enrichment?.playwrightEnabled) return null;
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage({ userAgent: "OutreachTool-Enrich/1.0" });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      const html = await page.content();
      const title = await page.title().catch(() => "");
      const text = htmlToText(html).slice(0, 8000);
      return { url, title, text, source: "playwright" };
    } finally {
      await browser.close();
    }
  } catch (err) {
    log.warn("Playwright fetch failed", { url, error: err.message });
    return null;
  }
}

async function askGroqFields(companyName, excerpts) {
  const prompt =
    `Company: "${companyName}"\n\n` +
    `Page excerpts (with URL labels):\n${excerpts.slice(0, 24000)}\n\n` +
    `Return JSON only: {\n` +
    `  "fields": { "first_name": string|null, "last_name": string|null, "executive_role": string|null, "email": string|null, "phone": string|null, "linkedin_url": string|null },\n` +
    `  "field_sources": { "email": {"url": string, "snippet": string}|null, "phone": {...}|null, ... }\n` +
    `}\n` +
    `Rules: Only include a field if it appears in the excerpts or is clearly implied by exact text. ` +
    `field_sources must quote a short snippet from that URL's text for each non-null field.`;

  const response = await groq.chat.completions.create({
    model: config.groq.model,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You extract contact data from website excerpts. Never invent emails, phone numbers, names, or URLs. " +
          "If a value is not literally present or unambiguously quoted in the excerpts, use null. " +
          "field_sources.snippet must be a verbatim substring from the excerpts for every non-null field.",
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

function snippetInText(snippet, combinedLower) {
  if (!snippet || snippet.length < 4) return false;
  const s = snippet.toLowerCase().replace(/\s+/g, " ").slice(0, 200);
  return combinedLower.includes(s.slice(0, Math.min(40, s.length)));
}

function applyProvenance(prospect, fields, fieldSources, combinedText) {
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
    if (src?.url && combinedText.includes(String(val).trim())) {
      prospect[key] = prospect[key] || val;
      return;
    }
    if (key === "email" && emailLiteralInText(val, combinedText)) {
      prospect[key] = prospect[key] || val;
      return;
    }
    if (key === "phone_number" && phoneDigitsInText(val, combinedText)) {
      prospect[key] = prospect[key] || val;
    }
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
    const u = String(fields.linkedin_url).replace(/^https?:\/\/(www\.)?/i, "").toLowerCase();
    if (u.includes("linkedin.com") && lower.replace(/\s/g, "").includes(u.replace(/\s/g, ""))) {
      prospect.linkedin_url = prospect.linkedin_url || fields.linkedin_url;
    }
  }

  // Regex backup: any email in combined text
  if (!prospect.email && emailsInText.length) {
    const good = emailsInText.find((e) => !e.includes("example.com") && !e.includes("sentry.io"));
    if (good) prospect.email = good;
  }
}

/**
 * @param {object} prospect — mutated in place
 * @returns {{ enrichment_details: object, pages: Array<{url: string, title: string, text: string, source?: string}> }}
 */
export async function deepEnrichProspect(prospect) {
  const details = {
    pages_visited: [],
    errors: [],
    used_playwright: false,
    used_firecrawl: false,
  };
  const pages = [];
  const maxPages = config.enrichment?.maxPages ?? 8;

  const origin = normalizeOrigin(prospect.company_website);
  if (!origin) {
    return {
      enrichment_details: { ...details, errors: ["no_valid_website"] },
      pages: [],
    };
  }

  const toFetch = new Set();
  for (const p of STATIC_PATHS) toFetch.add(`${origin}${p === "/" ? "/" : p}`);

  const sitemapUrls = await parseSitemapUrls(origin);
  sitemapUrls.forEach((u) => toFetch.add(u));

  const urls = [...toFetch].slice(0, maxPages);

  for (const url of urls) {
    let row = await fetchStaticPage(url);
    if (row.text && row.text.length < 120 && config.firecrawl?.apiKey) {
      const fc = await firecrawlScrape(url);
      if (fc?.content && !fc.error) {
        row = { url, title: fc.title || row.title, text: fc.content, source: "firecrawl" };
        details.used_firecrawl = true;
      }
    }
    if ((!row.text || row.text.length < 80) && config.enrichment?.playwrightEnabled) {
      const pw = await fetchWithPlaywright(url);
      if (pw?.text?.length) {
        row = { ...pw, url };
        details.used_playwright = true;
      }
    }
    if (row.text?.length) {
      pages.push({ url: row.url, title: row.title || "", text: row.text, source: row.source || "fetch" });
      details.pages_visited.push(row.url);
    } else if (row.error) details.errors.push(`${url}: ${row.error}`);
  }

  const combined = pages.map((p) => `\n--- URL: ${p.url} ---\n${p.text}`).join("\n");
  if (combined.length < 50) {
    return { enrichment_details: { ...details, errors: [...details.errors, "no_page_content"] }, pages };
  }

  try {
    const parsed = await askGroqFields(prospect.company_name || "Company", combined);
    applyProvenance(prospect, parsed.fields || {}, parsed.field_sources || {}, combined);
  } catch (err) {
    details.errors.push(`groq: ${err.message}`);
  }

  if (!prospect.data_sources) prospect.data_sources = [];
  if (!prospect.data_sources.includes("deep_enrich")) prospect.data_sources.push("deep_enrich");

  return {
    enrichment_details: { ...details, page_count: pages.length },
    pages,
  };
}
