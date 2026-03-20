/**
 * Pipeline worker -- runs in a separate process spawned by the API server.
 * Uses REAL services: Explorium MCP for discovery/enrichment, Firecrawl for auditing, Groq for AI tasks.
 */
import { config } from "@outreach-tool/shared/config";
import { createLogger } from "@outreach-tool/shared/logger";
import { createProspect } from "@outreach-tool/shared/prospect-schema";
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
  return (res.Items || []).map(({ PK, SK, GSI1PK, GSI1SK, ...rest }) => rest);
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
      updates = { status: "sent" };
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
  log.info("Stage: ENRICH via Explorium MCP");
  const updates = {};

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
    updates.notes = (prospect.notes || "") + `\n[Groq fallback] ${groqData.summary || ""}`;
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
  const result = await askGroq(
    "You are a cold outreach copywriter. Write personalized, specific messages. Include a Calendly link placeholder.",
    `Write outreach for ${prospect.first_name || "the owner"} at "${prospect.company_name}" (${prospect.industry}, ${prospect.country}).
Website audit: ${prospect.audit_summary || "no website"}.
Value prop: $500/mo managed website, 30-day launch, client owns code, AWS hosting included.
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

// ---- Discovery (for POST /api/pipeline/discover) ----

export async function discoverProspects(searchConfig) {
  const { country, industry, limit } = searchConfig;
  log.info("Discovering prospects via Explorium", { country, industry, limit });
  const created = [];

  try {
    const businesses = await mcpCall("fetch_businesses", {
      country_code: country || "US",
      company_size_max: 100,
      limit: limit || 10,
    });

    const bizList = Array.isArray(businesses) ? businesses : businesses?.businesses || businesses?.results || [];
    log.info(`Explorium returned ${bizList.length} businesses`);

    for (const biz of bizList.slice(0, limit || 10)) {
      const prospect = createProspect({
        company_name: biz.company_name || biz.name || "Unknown",
        company_website: biz.website || biz.domain || null,
        country: country || biz.country || "US",
        industry: biz.industry || biz.linkedin_category || industry || null,
        company_size_estimate: biz.employee_count || biz.size || null,
        source_trace: `explorium:${biz.business_id || biz.id || "unknown"}`,
        status: "discovered",
      });
      await saveProspect(prospect);
      created.push(prospect);
    }
  } catch (err) {
    log.error("Explorium discovery failed", { error: err.message });
  }

  return created;
}

// ---- Exported for Lambda (worker-lambda.js) and forked CLI ----

export async function executePipelineRun(run) {
  log.info(`Pipeline worker started for run ${run.id}, mode: ${run.config?.mode}`);
  send("started", { run_id: run.id });

  try {
    if (run.config?.mode === "discover") {
      const created = await discoverProspects(run.config);
      run.prospects_processed = created.length;
      await logActivity({ type: "discovery_completed", detail: `Discovered ${created.length} new prospects via Explorium` });
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
