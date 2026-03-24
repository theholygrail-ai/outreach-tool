/**
 * Pipeline worker -- runs in a separate process spawned by the API server.
 * Uses REAL services: Explorium MCP for discovery/enrichment, Firecrawl for auditing, Groq for AI tasks.
 */
import { config } from "@outreach-tool/shared/config";
import { createLogger } from "@outreach-tool/shared/logger";
import { createProspect } from "@outreach-tool/shared/prospect-schema";
import { deepEnrichProspect } from "./enrichment/deep-enrich.js";
import { strictDisplayGate } from "./enrichment/strict-gate.js";
import { takeEnrichmentSnapshot, buildFieldResolution } from "./enrichment/enrichment-snapshot.js";
import { runCrossCheck } from "./enrichment/cross-check.js";
import { calculateQualityScore } from "./enrichment/quality-score.js";
import { resolveMxForEmail } from "./enrichment/providers/mx-dns.js";
import { validateEmailAbstract } from "./enrichment/providers/abstract-email.js";
import { searchCompaniesHouse } from "./enrichment/providers/companies-house.js";
import { auditLinkedInAffiliation, extractAllLinkedInUrls, pickBestPersonLinkedInFromPage, parseLinkedInUrl } from "./enrichment/linkedin-audit.js";
import { sanitizeGroqWebsiteContacts, agentRankEmailCandidates } from "./enrichment/grounding.js";
import { runVerificationInsightsAgent } from "./enrichment/agent-insights.js";
import { sendOutreachEmail, stripHtml, hasSenderIdentity } from "@outreach-tool/shared/ses-send";
import path from "path";
import { fileURLToPath } from "url";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);

const log = createLogger("pipeline-worker");
const client = new DynamoDBClient({ region: config.aws.region });
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = config.aws.dynamoTable;
const groq = new OpenAI({ apiKey: config.groq.apiKey, baseURL: config.groq.baseURL });

function send(event, data) {
  process.stdout.write(JSON.stringify({ event, data }) + "\n");
}

function withTimeout(promise, ms, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// ---- DynamoDB helpers ----

async function listProspects() {
  const res = await withTimeout(ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: "begins_with(PK, :prefix) AND SK = :sk",
    ExpressionAttributeValues: { ":prefix": "PROSPECT#", ":sk": "PROFILE" },
  })), 90000, "DynamoDB listProspects");
  return (res.Items || []).map(({ PK: _pk, SK: _sk, GSI1PK: _g1, GSI1SK: _g2, ...rest }) => rest);
}

async function saveProspect(prospect) {
  const status = prospect.status || prospect.outreach_status || "discovered";
  prospect.status = status;
  prospect.outreach_status = status;
  await withTimeout(ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { PK: `PROSPECT#${prospect.id}`, SK: "PROFILE", GSI1PK: `STATUS#${status}`, GSI1SK: `PROSPECT#${prospect.id}`, ...prospect },
  })), 45000, "DynamoDB saveProspect");
}

async function logActivity(entry) {
  const ts = Date.now();
  await withTimeout(ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { PK: "ACTIVITY", SK: `EVENT#${ts}#${Math.random().toString(36).slice(2, 6)}`, GSI1PK: "ACTIVITY", GSI1SK: `${ts}`, ...entry, ts },
  })), 30000, "DynamoDB logActivity");
}

async function logProspectEvent(pid, event) {
  const ts = Date.now();
  await withTimeout(ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { PK: `PROSPECT#${pid}`, SK: `EVENT#${ts}#${event.type || "unknown"}`, ...event, ts },
  })), 30000, "DynamoDB logProspectEvent");
}

async function savePipelineRun(run) {
  await withTimeout(ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { PK: `RUN#${run.id}`, SK: "DETAIL", GSI1PK: "RUNS", GSI1SK: `${run.started_at || Date.now()}`, ...run },
  })), 45000, "DynamoDB savePipelineRun");
}

// ---- Explorium MCP Client ----

let mcpSessionId = null;
let mcpRequestId = 0;
const MCP_URL = config.explorium.httpUrl;
const MCP_KEY = config.explorium.apiKey;

const TOOL_NAME_MAP = {
  fetch_businesses: "fetch-businesses",
  match_business: "match-business",
  enrich_business: "enrich-business",
  fetch_prospects: "fetch-prospects",
  enrich_prospects: "enrich-prospects",
  autocomplete: "autocomplete",
};

async function mcpCall(toolName, args) {
  if (!MCP_KEY) throw new Error("EXPLORIUM_API_KEY not set");
  const mcpName = TOOL_NAME_MAP[toolName] || toolName;

  if (!mcpSessionId) {
    const initRes = await fetch(MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", api_key: MCP_KEY },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++mcpRequestId, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "outreach-pipeline", version: "1.0" } } }),
      signal: AbortSignal.timeout(20000),
    });
    const sid = initRes.headers.get("mcp-session-id");
    if (sid) mcpSessionId = sid;
    await fetch(MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", api_key: MCP_KEY, ...(mcpSessionId ? { "Mcp-Session-Id": mcpSessionId } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: AbortSignal.timeout(15000),
    });
  }

  const hdrs = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", api_key: MCP_KEY };
  if (mcpSessionId) hdrs["Mcp-Session-Id"] = mcpSessionId;

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++mcpRequestId, method: "tools/call", params: { name: mcpName, arguments: args } }),
    signal: AbortSignal.timeout(45000),
  });

  const ct = res.headers.get("content-type") || "";
  let result;
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) try { result = JSON.parse(line.slice(6)); } catch {}
    }
  } else {
    result = await res.json();
  }

  if (result?.error) throw new Error(`Explorium ${mcpName}: ${result.error.message || JSON.stringify(result.error)}`);
  const content = result?.result?.content;
  if (content) {
    const txt = content.find(c => c.type === "text");
    if (txt) try { return JSON.parse(txt.text); } catch { return txt.text; }
  }
  return result?.result || result;
}

// ---- Website Scraper ----

async function scrapeWebsite(url) {
  try {
    const res = await fetch(url.startsWith("http") ? url : `https://${url}`, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    const html = await res.text();
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || "";
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i)?.[1] || "";
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
    return { title, meta_description: metaDesc, content: bodyText, status: res.status };
  } catch (err) {
    return { error: err.message };
  }
}

// ---- Groq Helper ----

async function askGroq(systemPrompt, userPrompt, jsonMode = true) {
  const response = await withTimeout(
    groq.chat.completions.create({
      model: config.groq.model,
      max_tokens: 4096,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    120000,
    "Groq completion",
  );
  const content = response.choices[0]?.message?.content || "{}";
  if (jsonMode) try { return JSON.parse(content); } catch { return { raw: content }; }
  return content;
}

// ---- Stage Handlers ----

const NEXT_STAGE = {
  discovered: "enriched",
  enriched: "qualified",
  qualified: "audited_or_researched",
  audited_or_researched: "design_brief_ready",
  design_brief_ready: "design_generated",
  design_generated: "design_reviewed",
  design_reviewed: "prototype_built",
  prototype_built: "deployed",
  deployed: "proof_captured",
  proof_captured: "outreach_ready",
  outreach_ready: "sent",
};

async function advanceProspect(prospect, runId) {
  const stage = prospect.status || prospect.outreach_status || "discovered";
  log.info(`Processing ${prospect.id} (${prospect.first_name} ${prospect.last_name}) at stage: ${stage}`);

  let updates = {};

  switch (stage) {
    case "discovered":
      updates = await stageEnrich(prospect);
      break;
    case "enriched":
      updates = await stageQualify(prospect);
      break;
    case "qualified":
      updates = await stageAudit(prospect);
      break;
    case "audited_or_researched":
      updates = await stageDesignBrief(prospect);
      break;
    case "design_brief_ready":
    case "design_generated":
    case "design_reviewed":
    case "prototype_built":
    case "deployed":
    case "proof_captured":
      updates = await stageOutreach(prospect);
      break;
    case "outreach_ready":
      updates = await stageSendOutreach(prospect);
      break;
    default:
      log.info(`No action for stage ${stage}`);
      return;
  }

  const nextStatus = updates.status || NEXT_STAGE[stage] || stage;
  const updated = {
    ...prospect,
    ...updates,
    status: nextStatus,
    outreach_status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  log.info(`Saving prospect ${prospect.id}: ${stage} -> ${nextStatus}`, { updates: Object.keys(updates) });
  await saveProspect(updated);
  await logProspectEvent(prospect.id, { type: "stage_transition", from: stage, to: nextStatus, run_id: runId });
  await logActivity({ type: "stage_transition", detail: `${prospect.first_name} ${prospect.last_name}: ${stage} -> ${nextStatus}`, prospect_id: prospect.id });
  send("progress", { prospect_id: prospect.id, from: stage, to: nextStatus });
  log.info(`Prospect ${prospect.id} saved successfully`);
}

async function stageEnrich(prospect) {
  log.info("Stage: ENRICH (pipeline)");
  const updates = {};

  const maxAgeMs = (config.enrichment?.verificationMaxAgeDays ?? 30) * 86400000;
  const forceReverify = process.env.FORCE_REVERIFY === "1" || process.env.FORCE_REVERIFY === "true";
  const verifiedAtRaw = prospect.verification?.verified_at;
  const verifiedAt = verifiedAtRaw ? Date.parse(verifiedAtRaw) : NaN;
  const stale = !Number.isFinite(verifiedAt) || Date.now() - verifiedAt > maxAgeMs;
  const needsFullVerify =
    forceReverify ||
    !prospect.verification ||
    prospect.verification.quality_score == null ||
    stale;

  if (needsFullVerify) {
    log.info("Running deep enrich + verification (missing, stale, or FORCE_REVERIFY)", { prospect_id: prospect.id });
    let enrichmentPages = [];
    try {
      const enriched = await deepEnrichProspect(prospect);
      enrichmentPages = enriched.pages || [];
      updates.enrichment_status = "complete";
      updates.enrichment_details = enriched.enrichment_details || {};
    } catch (enrErr) {
      log.warn(`Deep enrich failed for pipeline prospect ${prospect.id}`, { error: enrErr.message });
      updates.enrichment_status = "failed";
      updates.enrichment_details = { errors: [enrErr.message] };
    }

    const verification = await verifyProspect(prospect, enrichmentPages.length ? { pages: enrichmentPages } : null);
    const qualityScore = calculateQualityScore(prospect, verification);
    verification.quality_score = qualityScore;
    const gate = strictDisplayGate({ ...prospect, ...updates, quality_score: qualityScore }, verification);

    updates.quality_score = qualityScore;
    updates.verification = verification;
    updates.data_sources = verification.data_sources;
    updates.website_status = prospect.website_status || (verification.website_live ? "live" : "unknown");
    updates.display_eligible = gate.display_eligible;
    if (!gate.display_eligible) {
      updates.notes = `${prospect.notes || ""}\n[Hidden from default list] ${gate.rejection_reason || "strict_gate"}`.trim();
    }
  }

  try {
    if (prospect.company_name) {
      const matched = await mcpCall("match_business", { company_name: prospect.company_name, domain: prospect.company_website || undefined });
      if (matched && !matched.error) {
        updates.source_trace = JSON.stringify(matched).slice(0, 500);
        const bizId = matched.business_id || matched.id || (Array.isArray(matched) ? matched[0]?.business_id : null);
        if (bizId) {
          const enriched = await mcpCall("enrich_business", { business_id: bizId, enrichments: ["firmographics"] });
          if (enriched && !enriched.error) {
            updates.industry = enriched.industry || enriched.linkedin_category || prospect.industry;
            updates.company_size_estimate = enriched.employee_count || enriched.company_size || prospect.company_size_estimate;
            updates.company_website = enriched.website || enriched.domain || prospect.company_website;
          }
        }
      }
    }
  } catch (err) {
    log.warn("Explorium enrich failed, falling back to Groq", { error: err.message });
    const groqData = await askGroq(
      "You are a B2B data enrichment agent. Respond with valid JSON.",
      `Enrich this company: "${prospect.company_name}" in ${prospect.country}. Return JSON: { industry, company_size_estimate, services, has_website, website_guess, summary }`
    );
    updates.industry = groqData.industry || prospect.industry;
    updates.company_size_estimate = groqData.company_size_estimate || prospect.company_size_estimate;
    const baseNotes = updates.notes ?? prospect.notes ?? "";
    updates.notes = `${baseNotes}\n[Groq fallback] ${groqData.summary || ""}`.trim();
  }

  return updates;
}

async function stageQualify(prospect) {
  log.info("Stage: QUALIFY via Groq");
  const result = await askGroq(
    "You are an ICP qualification agent. Our ICP: SMEs in US/UK/UAE, $500/mo budget, weak/missing websites, service businesses.",
    `Qualify: "${prospect.company_name}", Size: ${prospect.company_size_estimate || "unknown"}, Industry: ${prospect.industry || "unknown"}, Country: ${prospect.country}, Website: ${prospect.company_website || "none"}. Return JSON: { icp_score, verdict, reasoning }`
  );
  const updates = { icp_score: result.icp_score || 50 };
  if (result.verdict === "disqualified") {
    updates.status = "suppressed";
    updates.notes = (prospect.notes || "") + `\n[Disqualified] ${result.reasoning || ""}`;
  }
  return updates;
}

async function stageAudit(prospect) {
  log.info("Stage: AUDIT");
  if (prospect.company_website) {
    const scraped = await scrapeWebsite(prospect.company_website);
    if (scraped.error) {
      return { audit_summary: `Website scrape failed: ${scraped.error}`, website_status: "unreachable" };
    }
    const audit = await askGroq(
      "You are a website UX/conversion auditor.",
      `Audit this website for "${prospect.company_name}" (${prospect.company_website}):\nTitle: ${scraped.title}\nMeta: ${scraped.meta_description}\nContent (first 3000 chars): ${scraped.content?.slice(0, 3000)}\n\nReturn JSON: { verdict, top_issues, top_improvements, summary, website_status }`
    );
    return {
      audit_summary: audit.summary || JSON.stringify(audit).slice(0, 500),
      website_status: audit.website_status || audit.verdict || "audited",
    };
  } else {
    const research = await askGroq(
      "You are a business researcher.",
      `Research "${prospect.company_name}" (${prospect.industry || "unknown"}, ${prospect.country}). No website. Return JSON: { business_model, services, target_customers, website_concept, summary }`
    );
    return {
      audit_summary: research.summary || JSON.stringify(research).slice(0, 500),
      website_status: "none",
    };
  }
}

async function stageDesignBrief(prospect) {
  log.info("Stage: DESIGN BRIEF");
  const brief = await askGroq(
    "You are a web design strategist.",
    `Create a design brief for "${prospect.company_name}" (${prospect.industry}). Audit: ${prospect.audit_summary || "none"}. Return JSON: { pages, visual_direction, primary_cta, trust_elements, summary }`
  );
  return { notes: (prospect.notes || "") + `\n[Design Brief] ${brief.summary || JSON.stringify(brief).slice(0, 300)}` };
}

async function stageOutreach(prospect) {
  log.info("Stage: GENERATE OUTREACH");
  const calLine = config.outreach.calendlyLink
    ? `Include this booking link verbatim in the email HTML: ${config.outreach.calendlyLink}`
    : "Include a clear call-to-action to book a short call (ops will add the booking link when sending if missing).";
  const result = await askGroq(
    "You are a cold outreach copywriter. Write personalized, specific messages.",
    `Write outreach for ${prospect.first_name || "the owner"} at "${prospect.company_name}" (${prospect.industry}, ${prospect.country}).
Website audit: ${prospect.audit_summary || "no website"}.
Value prop: $500/mo managed website, 30-day launch, client owns code, AWS hosting included.
${calLine}
Return JSON: { email_subject, email_body, whatsapp_message, linkedin_note, linkedin_inmail, voice_script }`
  );

  return {
    outreach: {
      email: { status: "draft", subject: result.email_subject || "", body: result.email_body || "" },
      whatsapp: { status: "draft", message: result.whatsapp_message || "" },
      linkedin: { status: "draft", connection_note: result.linkedin_note || "", inmail: result.linkedin_inmail || "" },
      voice_note: { status: "draft", script: result.voice_script || "" },
    },
    status: "outreach_ready",
  };
}

/**
 * Real SES send when SENDER_EMAIL + SES are configured; otherwise stays outreach_ready with reason.
 * Set OUTREACH_AUTO_SEND=0 to generate drafts only. OUTREACH_DRY_RUN=1 marks sent without calling SES.
 */
async function stageSendOutreach(prospect) {
  const draft = prospect.outreach?.email || {};
  const subject = draft.subject || "Quick idea for your website";
  let bodyHtml = draft.body || "";
  const calLink = config.outreach.calendlyLink;
  if (calLink && bodyHtml && !bodyHtml.includes(calLink)) {
    bodyHtml += `\n\n<p><a href="${calLink}">Book a quick call</a></p>`;
  } else if (calLink && !bodyHtml.trim()) {
    bodyHtml = `<p>I'd love to share a quick idea — <a href="${calLink}">grab a time here</a>.</p>`;
  }

  const email = prospect.email?.trim();
  if (!email) {
    log.warn(`No email for prospect ${prospect.id}; cannot deliver`);
    return {
      status: "outreach_ready",
      outreach: {
        ...prospect.outreach,
        email: {
          ...draft,
          body: bodyHtml || draft.body,
          delivery_status: "blocked_no_email",
          note: "Add prospect email to send",
        },
      },
    };
  }

  const autoOff = process.env.OUTREACH_AUTO_SEND === "0" || process.env.OUTREACH_AUTO_SEND === "false";
  if (autoOff) {
    return {
      status: "outreach_ready",
      outreach: {
        ...prospect.outreach,
        email: { ...draft, body: bodyHtml || draft.body, delivery_status: "auto_send_disabled" },
      },
    };
  }

  if (!hasSenderIdentity()) {
    return {
      status: "outreach_ready",
      outreach: {
        ...prospect.outreach,
        email: {
          ...draft,
          body: bodyHtml || draft.body,
          delivery_status: "missing_sender",
          note: "Set SENDER_EMAIL (and SES identity) on the worker Lambda",
        },
      },
    };
  }

  const dryRun = process.env.OUTREACH_DRY_RUN === "1" || process.env.OUTREACH_DRY_RUN === "true";
  if (dryRun) {
    log.info("OUTREACH_DRY_RUN: skipping SES", { to: email, subject });
    return {
      status: "sent",
      outreach: {
        ...prospect.outreach,
        email: {
          ...draft,
          body: bodyHtml,
          delivery_status: "dry_run",
          sent_at: new Date().toISOString(),
        },
      },
    };
  }

  try {
    const bodyText = stripHtml(bodyHtml);
    const { messageId } = await sendOutreachEmail({ to: email, subject, bodyHtml, bodyText });
    await logActivity({
      type: "outreach_sent",
      detail: `SES to ${email}`,
      prospect_id: prospect.id,
    });
    return {
      status: "sent",
      outreach: {
        ...prospect.outreach,
        email: {
          ...draft,
          body: bodyHtml,
          delivery_status: "delivered",
          sent_at: new Date().toISOString(),
          ses_message_id: messageId,
        },
      },
    };
  } catch (err) {
    log.error("SES send failed", { error: err.message, prospect_id: prospect.id });
    return {
      status: "outreach_ready",
      outreach: {
        ...prospect.outreach,
        email: {
          ...draft,
          body: bodyHtml,
          delivery_status: "send_failed",
          error: err.message,
        },
      },
    };
  }
}

// ---- Discovery (for POST /api/pipeline/discover) ----

async function discoverViaExplorium(country, industry, limit) {
  const n = limit || 10;
  const businesses = await mcpCall("fetch_businesses", {
    country_code: country || "US",
    company_size_max: 100,
    limit: n,
  });
  const bizList = Array.isArray(businesses) ? businesses : businesses?.businesses || businesses?.results || [];
  if (bizList.length === 0) return [];

  const prospects = [];
  for (const biz of bizList.slice(0, n)) {
    const bizId = biz.business_id || biz.id;
    const base = {
      company_name: biz.company_name || biz.name || "Unknown",
      company_website: biz.website || biz.domain || null,
      country: country || biz.country || "US",
      industry: biz.industry || biz.linkedin_category || industry || null,
      company_size_estimate: biz.employee_count || biz.size || null,
      city_or_region: biz.city || biz.location || null,
      source_trace: `explorium:${bizId || "unknown"}`,
    };

    if (bizId) {
      try {
        const people = await mcpCall("fetch_prospects", { business_id: bizId, limit: 1 });
        const personList = Array.isArray(people) ? people : people?.prospects || people?.results || [];
        if (personList.length > 0) {
          const p = personList[0];
          base.first_name = p.first_name || p.name?.split(" ")[0] || null;
          base.last_name = p.last_name || p.name?.split(" ").slice(1).join(" ") || null;
          base.email = p.email || p.business_email || null;
          base.phone_number = p.phone || p.phone_number || p.direct_phone || null;
          base.executive_role = p.title || p.role || p.job_title || null;
          base.linkedin_url = p.linkedin_url || p.linkedin || null;

          try {
            const enriched = await mcpCall("enrich_prospects", { prospect_id: p.prospect_id || p.id, enrichments: ["contact_info"] });
            if (enriched && !enriched.error) {
              base.email = base.email || enriched.email || enriched.business_email || null;
              base.phone_number = base.phone_number || enriched.phone || enriched.direct_phone || null;
              base.linkedin_url = base.linkedin_url || enriched.linkedin_url || null;
            }
          } catch (err) {
            log.warn(`Explorium enrich_prospects failed for ${base.company_name}`, { error: err.message });
          }
        }
      } catch (err) {
        log.warn(`Explorium fetch_prospects failed for ${base.company_name}`, { error: err.message });
      }
    }
    prospects.push(base);
  }
  return prospects;
}

// ---- Brave Search Client ----

const BRAVE_KEY = config.brave.apiKey;
const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";

async function braveSearch(query, count = 10, country = "") {
  if (!BRAVE_KEY) throw new Error("BRAVE_API_KEY not set");
  const params = new URLSearchParams({ q: query, count: String(count) });
  if (country) params.set("country", country);
  const res = await fetch(`${BRAVE_URL}?${params}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": BRAVE_KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Brave Search ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return (data.web?.results || []).map(r => ({
    title: r.title, url: r.url, description: r.description,
  }));
}

async function discoverViaBraveSearch(country, industry, limit) {
  const n = Math.min(limit || 10, 15);
  const cc = country || "US";
  const countryNames = { US: "United States", GB: "United Kingdom", AE: "United Arab Emirates" };
  const countryName = countryNames[cc] || cc;

  const queries = [];
  if (industry) {
    queries.push(`small ${industry} businesses in ${countryName} company website`);
    queries.push(`"${industry}" small business ${countryName} contact`);
  } else {
    queries.push(`small service businesses in ${countryName} that need a website`);
    queries.push(`small business directory ${countryName} local services company`);
  }

  const allResults = [];
  for (const q of queries) {
    try {
      const results = await braveSearch(q, 10, cc.toLowerCase());
      allResults.push(...results);
      log.info(`Brave Search "${q}" returned ${results.length} results`);
    } catch (err) {
      log.warn(`Brave Search query failed: ${err.message}`);
    }
  }

  if (allResults.length === 0) throw new Error("Brave Search returned no results");

  const searchContext = allResults.slice(0, 20).map((r, i) =>
    `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.description || ""}`
  ).join("\n\n");

  const result = await askGroq(
    "You are a B2B lead data extractor. You MUST extract real businesses from the provided search results. " +
    "Do NOT invent or fabricate any data. Only use information actually present in the search results. " +
    "If a field is not available in the search results, set it to null. Return ONLY valid JSON.",
    `Extract up to ${n} real small-to-medium service businesses from these search results.\n` +
    `Target country: ${countryName} (${cc}).\n` +
    `Only include businesses that appear to be real companies from the search results.\n\n` +
    `SEARCH RESULTS:\n${searchContext}\n\n` +
    `For each business found in the results, extract:\n` +
    `Return JSON: { "prospects": [{ ` +
    `"company_name": string, "company_website": string|null (from the search URL if it looks like a company site), ` +
    `"industry": string|null, "city": string|null, "description": string (brief, from search snippet) }] }`
  );

  const list = result?.prospects || result?.businesses || [];
  return list.slice(0, n).map(p => ({
    company_name: p.company_name || "Unknown",
    company_website: p.company_website || null,
    country: cc,
    industry: p.industry || industry || null,
    company_size_estimate: p.company_size_estimate || null,
    city_or_region: p.city || null,
    source_trace: "brave_search",
    data_sources: ["brave_search"],
  }));
}

// ---- Verification Agent ----

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function emailDomainMatchesWebsite(email, website) {
  if (!email || !website) return false;
  const emailDomain = email.split("@")[1]?.toLowerCase();
  try {
    const siteDomain = new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
    return emailDomain === siteDomain || siteDomain.endsWith(`.${emailDomain}`) || emailDomain.endsWith(`.${siteDomain}`);
  } catch { return false; }
}

function isValidPhone(phone, country) {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  const prefixes = { US: "1", GB: "44", AE: "971" };
  const prefix = prefixes[country];
  if (prefix && !digits.startsWith(prefix)) return false;
  return digits.length >= 10 && digits.length <= 15;
}

async function checkWebsite(url) {
  if (!url) return { website_live: false, website_http_status: 0, website_title: null, website_description: null };
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  try {
    const res = await fetch(fullUrl, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || null;
    const desc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i)?.[1]?.trim() || null;
    return {
      website_live: res.ok,
      website_http_status: res.status,
      website_title: title,
      website_description: desc,
    };
  } catch (err) {
    return { website_live: false, website_http_status: 0, website_title: null, website_description: `Error: ${err.message}` };
  }
}

async function crossReferenceCompany(companyName, country) {
  try {
    const results = await braveSearch(`"${companyName}" ${country}`, 5, (country || "").toLowerCase());
    const match = results.find(r =>
      r.title?.toLowerCase().includes(companyName.toLowerCase().split(" ")[0]) ||
      r.description?.toLowerCase().includes(companyName.toLowerCase().split(" ")[0])
    );
    return {
      company_found_in_search: !!match,
      company_search_url: match?.url || null,
      company_search_snippet: match?.description?.slice(0, 300) || null,
    };
  } catch (err) {
    log.warn(`Brave cross-reference failed for ${companyName}`, { error: err.message });
    return { company_found_in_search: false, company_search_url: null, company_search_snippet: null };
  }
}

async function extractContactsFromWebsite(prospect, websiteContent) {
  const companyName = prospect.company_name || "Company";
  if (!websiteContent || websiteContent.length < 50) {
    return {
      contacts_from_website: false,
      extracted_emails: [],
      extracted_phones: [],
      extracted_social: {},
      extracted_linkedin_urls: [],
      extracted_contact_name: null,
      extracted_contact_role: null,
      extracted_contact_email: null,
      extracted_contact_phone: null,
      extracted_grounding_dropped: [],
    };
  }

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
  const rawEmails = [...new Set((websiteContent.match(emailRegex) || []).filter(e => !e.includes("example.com") && !e.includes("sentry")))].slice(0, 5);
  const rawPhones = [...new Set((websiteContent.match(phoneRegex) || []).filter(p => p.replace(/\D/g, "").length >= 10))].slice(0, 5);

  const allLi = extractAllLinkedInUrls(websiteContent);

  const fbMatch = websiteContent.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/i);
  const twMatch = websiteContent.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s"'<>]+/i);

  let groqContacts = {};
  try {
    groqContacts = await askGroq(
      "You extract contact fields from website text only. Rules: use null unless the exact value appears in the excerpt " +
        "(same spelling for email/phone; name tokens must appear; role phrase must appear verbatim). " +
        "Never infer from company type or guess generic addresses.",
      `Company label: "${companyName}"\n\nWebsite text excerpt:\n${websiteContent.slice(0, 3000)}\n\n` +
        `Return JSON only: { "contact_name": string|null, "contact_role": string|null, "contact_email": string|null, "contact_phone": string|null }`,
    );
  } catch { /* skip Groq extraction if it fails */ }

  const grounded = sanitizeGroqWebsiteContacts(groqContacts, websiteContent);
  const extracted_grounding_dropped = grounded.grounding_dropped || [];
  delete grounded.grounding_dropped;
  groqContacts = { ...groqContacts, ...grounded };

  let rankedEmails = [...rawEmails];
  if (rankedEmails.length > 1 && config.enrichment?.agentEmailRanker !== false && config.groq?.apiKey) {
    const idx = await agentRankEmailCandidates(websiteContent, rankedEmails, askGroq);
    const chosen = rankedEmails[idx];
    rankedEmails = [chosen, ...rankedEmails.filter((_, i) => i !== idx)];
  }

  let mergeFirst = prospect.first_name || null;
  let mergeLast = prospect.last_name || null;
  if (groqContacts.contact_name) {
    const parts = String(groqContacts.contact_name).trim().split(/\s+/).filter(Boolean);
    if (!mergeFirst && parts[0]) mergeFirst = parts[0];
    if (!mergeLast && parts.length > 1) mergeLast = parts.slice(1).join(" ");
  }
  const prospectForLi = {
    ...prospect,
    first_name: mergeFirst,
    last_name: mergeLast,
  };
  const bestPersonLi = pickBestPersonLinkedInFromPage(allLi, prospectForLi, websiteContent);
  const companyLi = allLi.find(u => parseLinkedInUrl(u).type === "company") || null;

  const social = {};
  if (bestPersonLi) social.linkedin = bestPersonLi;
  if (companyLi) social.linkedin_company = companyLi;
  if (fbMatch) social.facebook = fbMatch[0];
  if (twMatch) social.twitter = twMatch[0];

  return {
    contacts_from_website:
      rankedEmails.length > 0 || rawPhones.length > 0 || !!groqContacts.contact_name || !!bestPersonLi,
    extracted_emails: rankedEmails,
    extracted_phones: rawPhones,
    extracted_social: social,
    extracted_linkedin_urls: allLi,
    extracted_contact_name: groqContacts.contact_name || null,
    extracted_contact_role: groqContacts.contact_role || null,
    extracted_contact_email: groqContacts.contact_email || null,
    extracted_contact_phone: groqContacts.contact_phone || null,
    extracted_grounding_dropped,
  };
}

/**
 * @param {object} prospect
 * @param {{ pages?: Array<{ url: string, title?: string, text: string }> } | null} enrichmentContext — if set, reuse multi-page text instead of re-scraping homepage only
 */
async function verifyProspect(prospect, enrichmentContext = null) {
  log.info(`Verifying prospect: ${prospect.company_name}`);
  const enrichment_snapshot = takeEnrichmentSnapshot(prospect);
  /** @type {Record<string, boolean>} */
  const filledFromWebsite = {};

  const v = {
    website_live: false, website_http_status: 0, website_title: null, website_description: null,
    company_found_in_search: false, company_search_url: null, company_search_snippet: null,
    contacts_from_website: false,
    extracted_emails: [],
    extracted_phones: [],
    extracted_social: {},
    extracted_linkedin_urls: [],
    extracted_grounding_dropped: [],
    email_format_valid: false, email_domain_matches_website: false, phone_format_valid: false,
    data_sources: [...(prospect.data_sources || [])],
    verified_at: new Date().toISOString(),
    agent_notes: "",
    enrichment_snapshot,
  };
  const notes = [];

  const webCheck = await checkWebsite(prospect.company_website);
  Object.assign(v, webCheck);
  if (v.website_live) {
    notes.push(`Website is live (HTTP ${v.website_http_status}).`);
  } else if (prospect.company_website) {
    notes.push(`Website ${prospect.company_website} is unreachable.`);
  } else {
    notes.push("No website provided.");
  }

  if (BRAVE_KEY) {
    const searchCheck = await crossReferenceCompany(prospect.company_name, prospect.country);
    Object.assign(v, searchCheck);
    if (v.company_found_in_search) {
      notes.push(`Company confirmed via Brave Search: ${v.company_search_url}`);
      if (!v.data_sources.includes("brave_search")) v.data_sources.push("brave_search");
    } else {
      notes.push("Company not found in web search results.");
    }
  }

  const useEnrichmentPages = enrichmentContext?.pages?.length > 0;
  let contentForContacts = "";
  if (v.website_live && prospect.company_website) {
    try {
      let scrapedTitle = "";
      let scrapedMeta = "";
      if (useEnrichmentPages) {
        contentForContacts = enrichmentContext.pages.map((p) => p.text).join("\n\n");
        scrapedTitle = enrichmentContext.pages[0]?.title || "";
        if (!v.data_sources.includes("website_scrape")) v.data_sources.push("website_scrape");
        notes.push(`Using ${enrichmentContext.pages.length} enriched page(s) for contact extraction.`);
      } else {
        const scraped = await scrapeWebsite(prospect.company_website);
        if (scraped.error || !scraped.content) {
          throw new Error(scraped.error || "empty scrape");
        }
        contentForContacts = scraped.content;
        scrapedTitle = scraped.title;
        scrapedMeta = scraped.meta_description || "";
        if (!v.data_sources.includes("website_scrape")) v.data_sources.push("website_scrape");
      }

      if (contentForContacts) {
        const contactData = await extractContactsFromWebsite(prospect, contentForContacts);
        Object.assign(v, contactData);
        if (contactData.extracted_grounding_dropped?.length) {
          notes.push(`Grounding dropped unverified Groq fields: ${contactData.extracted_grounding_dropped.join(", ")}`);
        }

        if (contactData.extracted_contact_name && !prospect.first_name) {
          const nameParts = contactData.extracted_contact_name.split(" ");
          prospect.first_name = nameParts[0] || null;
          prospect.last_name = nameParts.slice(1).join(" ") || null;
          filledFromWebsite.first_name = true;
          filledFromWebsite.last_name = true;
          notes.push(`Contact name found on website: ${contactData.extracted_contact_name}`);
        }
        if (contactData.extracted_contact_role && !prospect.executive_role) {
          prospect.executive_role = contactData.extracted_contact_role;
          filledFromWebsite.executive_role = true;
        }
        if (contactData.extracted_contact_email && !prospect.email) {
          prospect.email = contactData.extracted_contact_email;
          filledFromWebsite.email = true;
          notes.push(`Email found on website: ${contactData.extracted_contact_email}`);
        } else if (contactData.extracted_emails.length > 0 && !prospect.email) {
          prospect.email = contactData.extracted_emails[0];
          filledFromWebsite.email = true;
          notes.push(`Email extracted from website: ${contactData.extracted_emails[0]}`);
        }
        if (contactData.extracted_contact_phone && !prospect.phone_number) {
          prospect.phone_number = contactData.extracted_contact_phone;
          filledFromWebsite.phone_number = true;
          notes.push(`Phone found on website: ${contactData.extracted_contact_phone}`);
        } else if (contactData.extracted_phones.length > 0 && !prospect.phone_number) {
          prospect.phone_number = contactData.extracted_phones[0];
          filledFromWebsite.phone_number = true;
          notes.push(`Phone extracted from website: ${contactData.extracted_phones[0]}`);
        }
        if (contactData.extracted_social.linkedin && !prospect.linkedin_url) {
          prospect.linkedin_url = contactData.extracted_social.linkedin;
          filledFromWebsite.linkedin_url = true;
        }

        const auditChunk = contentForContacts.slice(0, 2000);
        const auditResult = await askGroq(
          "You are a website UX/conversion auditor. Be concise.",
          `Audit this website for "${prospect.company_name}" (${prospect.company_website}):\n` +
          `Title: ${scrapedTitle}\nMeta: ${scrapedMeta}\n` +
          `Content (first 2000 chars): ${auditChunk}\n\n` +
          `Return JSON: { "summary": string (2-3 sentence audit), "website_status": "live"|"outdated"|"weak" }`
        );
        prospect.audit_summary = auditResult.summary || `Website title: ${scrapedTitle || "N/A"}. ${scrapedMeta || ""}`;
        prospect.website_status = auditResult.website_status || "live";
      }
    } catch (err) {
      log.warn(`Website scrape/extract failed for ${prospect.company_name}`, { error: err.message });
    }
  }

  /** @type {Record<string, boolean>} */
  const auditCleared = {};
  const liAudit = await auditLinkedInAffiliation(prospect, contentForContacts, askGroq);
  v.linkedin_audit = liAudit;
  if (liAudit.company_url) {
    v.linkedin_company_page = liAudit.company_url;
  }
  if (liAudit.action === "clear" && prospect.linkedin_url) {
    auditCleared.linkedin_url = true;
    prospect.linkedin_url = null;
    delete filledFromWebsite.linkedin_url;
    notes.push(`LinkedIn removed after affiliation audit: ${liAudit.reason}`);
  }
  if (liAudit.status === "verified" && !v.data_sources.includes("linkedin_affiliation_audit")) {
    v.data_sources.push("linkedin_affiliation_audit");
  }

  v.email_format_valid = isValidEmail(prospect.email);
  v.email_domain_matches_website = emailDomainMatchesWebsite(prospect.email, prospect.company_website);
  v.phone_format_valid = isValidPhone(prospect.phone_number, prospect.country);

  if (v.email_format_valid) notes.push("Email format valid.");
  if (v.email_domain_matches_website) notes.push("Email domain matches company website.");
  if (v.phone_format_valid) notes.push("Phone format valid.");

  v.field_resolution = buildFieldResolution(enrichment_snapshot, prospect, filledFromWebsite, auditCleared);

  let mxResult = { ok: false, mx_hosts: [] };
  if (prospect.email) {
    mxResult = await resolveMxForEmail(prospect.email);
    v.email_domain_mx_ok = mxResult.ok;
    if (mxResult.ok) notes.push(`MX records found for email domain (${mxResult.mx_hosts[0] || "ok"}).`);
    else notes.push(`No MX or DNS error for email domain: ${mxResult.error || "unknown"}.`);
  } else {
    v.email_domain_mx_ok = false;
  }

  let abstractResult = null;
  if (config.enrichment?.abstractApiKey && prospect.email) {
    abstractResult = await validateEmailAbstract(prospect.email);
    v.abstract_email = abstractResult;
    if (abstractResult && !abstractResult.error && abstractResult.is_disposable_email?.value === true) {
      notes.push("Abstract: disposable email domain flagged.");
    }
    if (!v.data_sources.includes("abstract_email") && abstractResult && !abstractResult.error) {
      v.data_sources.push("abstract_email");
    }
  }

  let registryMatch = false;
  if (prospect.country === "GB" && config.enrichment?.companiesHouseApiKey && prospect.company_name) {
    const ch = await searchCompaniesHouse(prospect.company_name);
    registryMatch = !!ch.matched;
    v.company_registry_match = registryMatch;
    v.company_registry = ch.title ? { title: ch.title, company_number: ch.company_number } : null;
    if (registryMatch) {
      notes.push(`Companies House match: ${ch.title}`);
      if (!v.data_sources.includes("companies_house")) v.data_sources.push("companies_house");
    }
  } else {
    v.company_registry_match = false;
  }

  v.cross_checks = runCrossCheck({
    snapshot: enrichment_snapshot,
    prospect,
    extracted_emails: v.extracted_emails,
    extracted_phones: v.extracted_phones,
    extracted_social: v.extracted_social,
    extracted_contact_email: v.extracted_contact_email,
    extracted_contact_phone: v.extracted_contact_phone,
    extracted_contact_name: v.extracted_contact_name,
    email_domain_mx_ok: v.email_domain_mx_ok,
    abstract_email: abstractResult,
    company_registry_match: registryMatch,
    linkedin_audit: v.linkedin_audit,
  });

  if (config.groq?.apiKey && config.enrichment?.agentVerificationInsights !== false) {
    const facts = {
      company_name: prospect.company_name,
      country: prospect.country,
      website_live: v.website_live,
      company_found_in_search: v.company_found_in_search,
      contacts_from_website: v.contacts_from_website,
      email_format_valid: v.email_format_valid,
      email_domain_matches_website: v.email_domain_matches_website,
      phone_format_valid: v.phone_format_valid,
      has_email: !!prospect.email,
      has_phone: !!prospect.phone_number,
      has_linkedin_person: !!prospect.linkedin_url,
      linkedin_audit_status: v.linkedin_audit?.status,
      data_validity_score: v.cross_checks?.data_validity_score,
      cross_check_signals: v.cross_checks?.signals,
      grounding_dropped_fields: v.extracted_grounding_dropped,
      field_resolution: v.field_resolution
        ? { email: v.field_resolution.email, phone_number: v.field_resolution.phone_number, linkedin_url: v.field_resolution.linkedin_url }
        : null,
    };
    v.enrichment_agent_insights = await runVerificationInsightsAgent(facts, askGroq);
    if (!v.data_sources.includes("enrichment_agent_insights")) v.data_sources.push("enrichment_agent_insights");
  }

  v.agent_notes = notes.join(" ");
  return v;
}

function statusFromQualityScore(score) {
  if (score >= 60) return "discovered";
  if (score >= 30) return "needs_review";
  return "unverified";
}

// ---- Groq Fallback Discovery (last resort — generates plausible but unverified data) ----

async function discoverViaGroqFallback(country, industry, limit) {
  const n = Math.min(limit || 10, 15);
  const cc = country || "US";
  const countryNames = { US: "United States", GB: "United Kingdom", AE: "United Arab Emirates" };
  const countryName = countryNames[cc] || cc;
  const result = await askGroq(
    "You are a B2B lead generation researcher. Return ONLY valid JSON.",
    `Find ${n} real small-to-medium service businesses in ${countryName} (${cc})` +
    `${industry ? ` in the "${industry}" industry` : ""}. ` +
    `Return JSON: { "prospects": [{ "company_name": string, "company_website": string|null, "industry": string, "city": string }] }`
  );
  const list = result?.prospects || result?.businesses || [];
  return list.slice(0, n).map(p => ({
    company_name: p.company_name || "Unknown",
    company_website: p.company_website || null,
    country: cc,
    industry: p.industry || industry || null,
    city_or_region: p.city || null,
    source_trace: "groq:llm-fallback",
    data_sources: ["groq_llm"],
  }));
}

// ---- Discovery (for POST /api/pipeline/discover) ----

export async function discoverProspects(searchConfig) {
  const { country, industry, limit } = searchConfig;
  log.info("Discovering prospects", { country, industry, limit });
  const created = [];
  const errors = [];

  let bizData = [];
  let discoverySource = "explorium";
  try {
    bizData = await discoverViaExplorium(country, industry, limit);
    log.info(`Explorium returned ${bizData.length} businesses`);
  } catch (err) {
    const msg = `Explorium discovery failed: ${err.message}`;
    log.warn(msg);
    errors.push(msg);
  }

  if (bizData.length === 0 && BRAVE_KEY) {
    log.info("Explorium returned nothing, falling back to Brave Search discovery");
    discoverySource = "brave_search";
    try {
      bizData = await discoverViaBraveSearch(country, industry, limit);
      log.info(`Brave Search returned ${bizData.length} businesses`);
    } catch (err) {
      const msg = `Brave Search discovery failed: ${err.message}`;
      log.warn(msg);
      errors.push(msg);
    }
  }

  if (bizData.length === 0) {
    log.info("No results from primary sources, using Groq LLM fallback (results will be verified)");
    discoverySource = "groq_llm";
    try {
      bizData = await discoverViaGroqFallback(country, industry, limit);
      log.info(`Groq fallback returned ${bizData.length} businesses`);
    } catch (err) {
      const msg = `Groq fallback discovery failed: ${err.message}`;
      log.error(msg);
      errors.push(msg);
    }
  }

  if (bizData.length === 0) {
    throw new Error(`Discovery found 0 prospects. Errors: ${errors.join("; ")}`);
  }

  for (const biz of bizData) {
    try {
      biz.enrichment_status = "pending";
      log.info(`Deep enriching: ${biz.company_name}`);
      send("progress", { stage: "enriching", company: biz.company_name });

      let enrichmentPages = [];
      let enrichmentDetails = {};
      try {
        const enriched = await deepEnrichProspect(biz);
        enrichmentPages = enriched.pages || [];
        enrichmentDetails = enriched.enrichment_details || {};
        biz.enrichment_status = "complete";
        biz.enrichment_details = enrichmentDetails;
      } catch (enrErr) {
        log.warn(`Deep enrich failed for ${biz.company_name}`, { error: enrErr.message });
        biz.enrichment_status = "failed";
        biz.enrichment_details = { errors: [enrErr.message] };
      }

      log.info(`Verifying: ${biz.company_name}`);
      send("progress", { stage: "verifying", company: biz.company_name });

      const verification = await verifyProspect(biz, enrichmentPages.length ? { pages: enrichmentPages } : null);
      const qualityScore = calculateQualityScore(biz, verification);
      const status = statusFromQualityScore(qualityScore);
      verification.quality_score = qualityScore;

      log.info(`${biz.company_name}: quality=${qualityScore}, status=${status}, website=${verification.website_live}, search=${verification.company_found_in_search}`);

      if (qualityScore < 30) {
        log.info(`Skipping ${biz.company_name} — quality score ${qualityScore} below threshold`);
        errors.push(`Rejected ${biz.company_name}: quality score ${qualityScore}/100`);
        continue;
      }

      const gate = strictDisplayGate({ ...biz, quality_score: qualityScore }, verification);
      let notes = biz.notes || null;
      if (!gate.display_eligible) {
        notes = `${notes || ""}\n[Hidden from default list] ${gate.rejection_reason || "strict_gate"}`.trim();
      }

      const prospect = createProspect({
        ...biz,
        status,
        quality_score: qualityScore,
        verification,
        data_sources: verification.data_sources,
        website_status: biz.website_status || (verification.website_live ? "live" : "unknown"),
        display_eligible: gate.display_eligible,
        notes,
      });
      await saveProspect(prospect);
      created.push(prospect);
      log.info(`Saved prospect: ${prospect.company_name} quality=${qualityScore} display_eligible=${gate.display_eligible}`);
    } catch (err) {
      log.error(`Failed to process prospect ${biz.company_name}: ${err.message}`);
      errors.push(`Failed for ${biz.company_name}: ${err.message}`);
    }
  }

  if (created.length === 0 && errors.length > 0) {
    throw new Error(`Discovery verified 0 prospects. Errors: ${errors.join("; ")}`);
  }

  return { created, discoverySource };
}

// ---- Exported for Lambda (worker-lambda.js) and forked CLI ----

export async function executePipelineRun(run) {
  log.info(`Pipeline worker started for run ${run.id}, mode: ${run.config?.mode}`);
  send("started", { run_id: run.id });

  try {
    if (run.config?.mode === "discover") {
      const { created, discoverySource } = await discoverProspects(run.config);
      run.prospects_processed = created.length;
      const sourceLabel = discoverySource === "groq_llm" ? "Groq LLM"
        : discoverySource === "brave_search" ? "Brave Search"
          : "Explorium";
      await logActivity({ type: "discovery_completed", detail: `Discovered ${created.length} new prospects via ${sourceLabel}` });
      send("progress", { discovered: created.length, source: sourceLabel });
    } else {
      const prospects = await listProspects();
      const processable = prospects.filter(p => !["won", "lost", "suppressed", "sent", "responded", "meeting_booked"].includes(p.status));
      const batch = run.config?.geography ? processable.filter(p => p.country === run.config.geography) : processable;
      const toProcess = batch.slice(0, run.config?.batch_size || 5);

      log.info(`Processing ${toProcess.length} of ${prospects.length} total prospects`);

      for (const prospect of toProcess) {
        try {
          await advanceProspect(prospect, run.id);
          run.prospects_processed = (run.prospects_processed || 0) + 1;
        } catch (err) {
          run.errors = run.errors || [];
          run.errors.push({ prospect_id: prospect.id, error: err?.message || String(err) });
          log.error(`Error processing ${prospect.id}: ${err.message}`);
          send("error", { prospect_id: prospect.id, error: err.message });
        }
      }
    }

    run.status = "completed";
    run.completed_at = new Date().toISOString();
    await savePipelineRun(run);
    await logActivity({ type: "pipeline_completed", detail: `Pipeline ${run.config?.mode || "process"}: ${run.prospects_processed || 0} processed, ${(run.errors || []).length} errors` });
    send("completed", run);
  } catch (err) {
    run.status = "failed";
    run.error = err.message;
    await savePipelineRun(run).catch(() => {});
    send("failed", { error: err.message });
    throw err;
  }
}

async function main() {
  const runJson = process.argv[2];
  if (!runJson) {
    console.error("Usage: node pipeline-worker.js <run-json>");
    process.exit(1);
  }
  const run = JSON.parse(runJson);
  try {
    await executePipelineRun(run);
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  main().catch((err) => {
    send("failed", { error: err.message });
    process.exit(1);
  });
}
