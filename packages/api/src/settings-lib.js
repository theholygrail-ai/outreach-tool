/**
 * Settings snapshot + connector smoke tests (no secrets returned unmasked).
 */
import sesPkg from "@aws-sdk/client-ses";
const { SESClient, ListEmailIdentitiesCommand } = sesPkg;
import { config } from "@outreach-tool/shared/config";
import * as db from "./db.js";

export function maskSecret(value) {
  if (!value || typeof value !== "string") return null;
  const s = value.trim();
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function buildSettingsSnapshot() {
  const apiPort = parseInt(process.env.API_PORT, 10) || 9002;
  const webPort = config.web.port;

  const connectors = [
    {
      id: "groq",
      label: "Groq LLM",
      configured: !!config.groq.apiKey,
      keyMasked: maskSecret(config.groq.apiKey),
      model: config.groq.model,
    },
    {
      id: "explorium",
      label: "Explorium MCP",
      configured: !!config.explorium.apiKey,
      keyMasked: maskSecret(config.explorium.apiKey),
      endpoint: config.explorium.httpUrl,
    },
    {
      id: "ses",
      label: "Amazon SES",
      configured: !!(config.ses.accessKeyId && config.ses.secretAccessKey),
      keyMasked: maskSecret(config.ses.accessKeyId),
      region: config.ses.region,
      senderEmail: config.outreach.senderEmail || null,
    },
    {
      id: "calendly",
      label: "Calendly",
      configured: !!(config.calendly?.clientId && config.calendly?.clientSecret),
      keyMasked: maskSecret(config.calendly?.clientId),
      hasAccessToken: !!config.calendly?.accessToken,
      accessTokenMasked: maskSecret(config.calendly?.accessToken),
    },
    {
      id: "brave",
      label: "Brave Search",
      configured: !!config.brave?.apiKey,
      keyMasked: maskSecret(config.brave?.apiKey),
    },
    {
      id: "firecrawl",
      label: "Firecrawl",
      configured: !!config.firecrawl?.apiKey,
      keyMasked: maskSecret(config.firecrawl?.apiKey),
    },
    {
      id: "apollo",
      label: "Apollo.io",
      configured: !!config.enrichment?.apolloApiKey,
      keyMasked: maskSecret(config.enrichment?.apolloApiKey),
    },
    {
      id: "hunter",
      label: "Hunter.io",
      configured: !!config.enrichment?.hunterApiKey,
      keyMasked: maskSecret(config.enrichment?.hunterApiKey),
    },
    {
      id: "brightdata",
      label: "Bright Data (Web Unlocker)",
      configured: !!(config.enrichment?.brightdataApiToken && config.enrichment?.brightdataZone),
      keyMasked: maskSecret(config.enrichment?.brightdataApiToken),
      zone: config.enrichment?.brightdataZone || null,
    },
    {
      id: "vercel",
      label: "Vercel",
      configured: !!config.vercel?.token,
      keyMasked: maskSecret(config.vercel?.token),
    },
    {
      id: "aws",
      label: "AWS (DynamoDB)",
      configured: true,
      profile: config.aws.profile,
      region: config.aws.region,
      dynamoTable: config.aws.dynamoTable,
      s3Bucket: config.aws.s3Bucket,
    },
  ];

  const endpoints = [
    { id: "health", path: "/api/health", method: "GET", note: "Liveness" },
    { id: "health_ready", path: "/api/health/ready", method: "GET", note: "DynamoDB readiness" },
    { id: "prospects", path: "/api/prospects", method: "GET" },
    { id: "activity", path: "/api/activity?limit=1", method: "GET" },
    { id: "pipeline_stats", path: "/api/pipeline/stats", method: "GET" },
    { id: "pipeline_status", path: "/api/pipeline/status", method: "GET" },
    { id: "pipeline_runs", path: "/api/pipeline/runs", method: "GET" },
    { id: "pipeline_run_by_id", path: "/api/pipeline/runs/:id", method: "GET", note: "Single run + duration_ms" },
    { id: "bookings", path: "/api/bookings", method: "GET" },
    { id: "tools_status", path: "/api/tools/status", method: "GET" },
    { id: "settings", path: "/api/settings", method: "GET" },
    { id: "events_sse", path: "/api/events", method: "GET", note: "SSE stream (probe may abort early)" },
  ];

  return {
    ports: { api: apiPort, web: webPort },
    deployment: {
      publicApiUrl: process.env.PUBLIC_API_URL || null,
    },
    aws: {
      profile: config.aws.profile,
      region: config.aws.region,
      dynamoTable: config.aws.dynamoTable,
      s3Bucket: config.aws.s3Bucket,
    },
    outreach: {
      senderEmail: config.outreach.senderEmail || null,
      calendlyLink: config.outreach.calendlyLink || null,
    },
    connectors,
    endpoints,
  };
}

export async function runConnectorTest(name) {
  const n = String(name).toLowerCase();
  switch (n) {
    case "groq":
      return testGroq();
    case "explorium":
      return testExplorium();
    case "ses":
      return testSes();
    case "calendly":
      return testCalendly();
    case "brave":
      return testBrave();
    case "firecrawl":
      return testFirecrawl();
    case "vercel":
      return testVercel();
    case "aws":
      return testAws();
    case "apollo":
      return testApollo();
    case "hunter":
      return testHunter();
    case "brightdata":
      return testBrightData();
    default:
      return { ok: false, error: `Unknown connector: ${name}` };
  }
}

async function testGroq() {
  if (!config.groq.apiKey) return { ok: false, error: "GROQ_API_KEY not set" };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.groq.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.groq.model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 4,
    }),
    signal: AbortSignal.timeout(25000),
  });
  const txt = await r.text();
  if (!r.ok) return { ok: false, status: r.status, detail: txt.slice(0, 400) };
  return { ok: true, detail: "Groq chat completion succeeded" };
}

async function testExplorium() {
  if (!config.explorium.apiKey) return { ok: false, error: "EXPLORIUM_API_KEY not set" };
  const MCP_URL = config.explorium.httpUrl;
  const initRes = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", api_key: config.explorium.apiKey },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "outreach-settings-test", version: "1" } },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const sid = initRes.headers.get("mcp-session-id");
  if (!initRes.ok && initRes.status !== 200) {
    const t = await initRes.text().catch(() => "");
    return { ok: false, status: initRes.status, detail: t.slice(0, 300) };
  }
  return { ok: true, detail: sid ? `MCP session: ${sid.slice(0, 8)}…` : "MCP responded" };
}

async function testSes() {
  if (!config.ses.accessKeyId || !config.ses.secretAccessKey) {
    return { ok: false, error: "SES_AWS_ACCESS_KEY_ID / SES_AWS_SECRET_ACCESS_KEY not set" };
  }
  const ses = new SESClient({
    region: config.ses.region,
    credentials: { accessKeyId: config.ses.accessKeyId, secretAccessKey: config.ses.secretAccessKey },
  });
  const out = await ses.send(new ListEmailIdentitiesCommand({}));
  return { ok: true, detail: `Listed identities: ${out.Identities?.length ?? 0}` };
}

async function testCalendly() {
  const tok = config.calendly?.accessToken;
  if (tok) {
    const r = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${tok}` },
      signal: AbortSignal.timeout(20000),
    });
    const txt = await r.text();
    if (!r.ok) return { ok: false, status: r.status, detail: txt.slice(0, 300) };
    return { ok: true, detail: "Calendly user API OK" };
  }
  if (config.calendly?.clientId) {
    return { ok: true, detail: "OAuth client configured (set CALENDLY_ACCESS_TOKEN to probe API)" };
  }
  return { ok: false, error: "Calendly not configured" };
}

async function testBrave() {
  if (!config.brave?.apiKey) return { ok: false, error: "BRAVE_API_KEY not set" };
  const r = await fetch("https://api.search.brave.com/res/v1/web/search?q=outreach&count=1", {
    headers: { Accept: "application/json", "X-Subscription-Token": config.brave.apiKey },
    signal: AbortSignal.timeout(20000),
  });
  const txt = await r.text();
  if (!r.ok) return { ok: false, status: r.status, detail: txt.slice(0, 300) };
  return { ok: true, detail: "Brave web search OK" };
}

async function testFirecrawl() {
  if (!config.firecrawl?.apiKey) return { ok: false, error: "FIRECRAWL_API_KEY not set" };
  const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.firecrawl.apiKey}` },
    body: JSON.stringify({ url: "https://example.com", formats: ["markdown"] }),
    signal: AbortSignal.timeout(25000),
  });
  const txt = await r.text();
  if (!r.ok) return { ok: false, status: r.status, detail: txt.slice(0, 400) };
  return { ok: true, detail: "Firecrawl scrape OK" };
}

async function testVercel() {
  if (!config.vercel?.token) return { ok: false, error: "VERCEL_TOKEN not set" };
  const r = await fetch("https://api.vercel.com/v2/user", {
    headers: { Authorization: `Bearer ${config.vercel.token}` },
    signal: AbortSignal.timeout(20000),
  });
  const txt = await r.text();
  if (!r.ok) return { ok: false, status: r.status, detail: txt.slice(0, 300) };
  return { ok: true, detail: "Vercel user API OK" };
}

async function testAws() {
  try {
    await db.pingDynamo();
    return { ok: true, detail: "DynamoDB DescribeTable OK" };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function testApollo() {
  const key = config.enrichment?.apolloApiKey;
  if (!key) return { ok: false, error: "APOLLO_API_KEY not set" };
  return { ok: true, detail: "Key configured (live people/match skipped to avoid credit use)" };
}

async function testHunter() {
  const key = config.enrichment?.hunterApiKey;
  if (!key) return { ok: false, error: "HUNTER_API_KEY not set" };
  const r = await fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(20000),
  });
  const txt = await r.text();
  if (!r.ok) return { ok: false, status: r.status, detail: txt.slice(0, 300) };
  return { ok: true, detail: "Hunter account API OK" };
}

async function testBrightData() {
  const token = config.enrichment?.brightdataApiToken;
  const zone = config.enrichment?.brightdataZone;
  if (!token || !zone) return { ok: false, error: "BRIGHTDATA_API_TOKEN and BRIGHTDATA_ZONE required" };
  const r = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ zone, url: "https://example.com", format: "raw", method: "GET" }),
    signal: AbortSignal.timeout(60000),
  });
  const txt = await r.text();
  if (!r.ok) return { ok: false, status: r.status, detail: txt.slice(0, 400) };
  return { ok: true, detail: "Bright Data /request OK (example.com)" };
}
