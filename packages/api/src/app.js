import { config } from "@outreach-tool/shared/config";
import { createLogger } from "@outreach-tool/shared/logger";
import { createProspect, isProspectListVisible } from "@outreach-tool/shared/prospect-schema";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "crypto";
import { fork } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import * as db from "./db.js";
import { addClient, broadcast } from "./events.js";
import { buildSettingsSnapshot, runConnectorTest } from "./settings-lib.js";
import { hasSenderIdentity } from "@outreach-tool/shared/ses-send";
import {
  createLinkedInAuthSession,
  enrichProspectsViaLinkedInSession,
  enrichOneProspectLinkedInFlow,
} from "./enrichment/browserbase-linkedin.js";
import { deepEnrichProspect } from "./enrichment/deep-enrich.js";

const log = createLogger("api");
const app = express();

/** JSON API: disable CSP (not serving HTML). Other helmet defaults apply. */
app.use(helmet({ contentSecurityPolicy: false }));

/** Correlate logs / support tickets with client or generate UUID. */
app.use((req, res, next) => {
  const incoming = req.headers["x-request-id"] || req.headers["x-correlation-id"];
  const rid =
    typeof incoming === "string" && incoming.trim().length > 0
      ? incoming.trim().slice(0, 128)
      : crypto.randomUUID();
  res.setHeader("X-Request-Id", rid);
  req.requestId = rid;
  next();
});

const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
if (!isLambda) {
  const extraCorsOrigins = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (/^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return cb(null, true);
      if (extraCorsOrigins.includes(origin)) return cb(null, true);
      if (origin.endsWith(".vercel.app")) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  }));
}
app.use(express.json({ limit: "5mb" }));
app._getLambdaRawBody = null;
app.use((req, _res, next) => {
  const needsParse = req.method !== "GET" && req.method !== "HEAD"
    && (!req.body || Buffer.isBuffer(req.body) || (typeof req.body === "object" && req.body?.type === "Buffer"));
  if (needsParse) {
    const raw = app._getLambdaRawBody?.() || req.apiGateway?.event?.body;
    if (raw && typeof raw === "string") {
      try { req.body = JSON.parse(raw); } catch { /* leave empty */ }
    }
  }
  next();
});

// --- Health ---
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    port: parseInt(process.env.API_PORT, 10) || 9002,
  });
});

/** Readiness: verifies DynamoDB (same credentials as app data plane). */
app.get("/api/health/ready", async (req, res) => {
  try {
    await db.pingDynamo();
    res.json({ ok: true, dynamo: "ok", ts: Date.now() });
  } catch (err) {
    log.error("ready check failed", { error: err.message });
    res.status(503).json({ ok: false, error: err.message });
  }
});


// --- Settings (connectors + endpoint catalog; secrets masked) ---
app.get("/api/settings", (req, res) => {
  try {
    res.json(buildSettingsSnapshot());
  } catch (err) {
    log.error("settings", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/settings/test/:connector", async (req, res) => {
  try {
    const result = await runConnectorTest(req.params.connector);
    res.json({ connector: req.params.connector, ...result });
  } catch (err) {
    log.error("settings test", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- SSE ---
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  addClient(res);
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
});

// --- Prospects ---
app.get("/api/prospects", async (req, res) => {
  try {
    const visibility = (req.query.visibility || "default").toLowerCase();
    const prospects = await db.listProspects();
    if (visibility === "all") {
      res.json(prospects);
    } else {
      res.json(prospects.filter(isProspectListVisible));
    }
  } catch (err) {
    log.error("list prospects", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/prospects/:id", async (req, res) => {
  try {
    const p = await db.getProspect(req.params.id);
    if (!p) return res.status(404).json({ error: "Not found" });
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/prospects", async (req, res) => {
  try {
    const prospect = createProspect({
      ...req.body,
      list_ready: req.body.list_ready === true,
    });
    await db.saveProspect(prospect);
    await db.logActivity({ type: "prospect_created", detail: `Created ${prospect.first_name} ${prospect.last_name} at ${prospect.company_name || ""}` });
    broadcast("prospect_created", prospect);
    res.status(201).json(prospect);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/prospects/:id", async (req, res) => {
  try {
    const existing = await db.getProspect(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updated = { ...existing, ...req.body, id: req.params.id, updated_at: new Date().toISOString() };
    await db.saveProspect(updated);
    broadcast("prospect_updated", updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/prospects/:id", async (req, res) => {
  try {
    await db.deleteProspect(req.params.id);
    broadcast("prospect_deleted", { id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/prospects/:id/timeline", async (req, res) => {
  try {
    const events = await db.listProspectEvents(req.params.id);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CSV Import ---
app.post("/api/prospects/import", async (req, res) => {
  try {
    const rows = req.body.rows;
    if (!Array.isArray(rows)) return res.status(400).json({ error: "rows array required" });
    const created = [];
    for (const row of rows) {
      const prospect = createProspect({
        ...row,
        list_ready: row.list_ready === true,
      });
      await db.saveProspect(prospect);
      created.push(prospect);
    }
    await db.logActivity({ type: "import", detail: `Imported ${created.length} prospects from CSV` });
    broadcast("prospects_imported", { count: created.length });
    res.status(201).json({ imported: created.length, prospects: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Browserbase: LinkedIn sign-in in live session, then CDP scrape into prospects ---
app.post("/api/enrichment/browserbase/linkedin-session", async (req, res) => {
  try {
    const out = await createLinkedInAuthSession();
    res.json(out);
  } catch (err) {
    log.error("browserbase linkedin-session", { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/enrichment/browserbase/linkedin-enrich", async (req, res) => {
  try {
    const sessionId = req.body?.session_id;
    const prospectIds = req.body?.prospect_ids;
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "session_id required" });
    }
    if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
      return res.status(400).json({ error: "prospect_ids must be a non-empty array" });
    }
    const ids = [...new Set(prospectIds.map(String))].slice(0, 25);
    const loaded = await Promise.all(ids.map((id) => db.getProspect(id)));
    const miss = ids.filter((id, i) => !loaded[i]);
    if (miss.length) {
      return res.status(404).json({ error: `Unknown prospect id(s): ${miss.join(", ")}` });
    }

    const { results, errors } = await enrichProspectsViaLinkedInSession(sessionId, loaded);

    const saved = [];
    for (const r of results) {
      const id = r.prospect?.id;
      if (!id) continue;
      if (r.needs_login) {
        saved.push({
          id,
          ok: false,
          skipped: false,
          partial: false,
          needs_login: true,
          error: "linkedin_sign_in_required",
        });
        continue;
      }
      const existing = await db.getProspect(id);
      if (!existing) continue;
      const p = r.prospect;
      const merged = { ...existing, updated_at: new Date().toISOString() };
      for (const k of ["first_name", "last_name", "executive_role", "email", "phone_number", "linkedin_url", "city_or_region"]) {
        if (p[k] != null && String(p[k]).trim() !== "") merged[k] = p[k];
      }
      merged.data_sources = [...new Set([...(existing.data_sources || []), ...(p.data_sources || [])])];
      merged.enrichment_details = {
        ...(existing.enrichment_details || {}),
        browserbase_linkedin: {
          ...(existing.enrichment_details?.browserbase_linkedin || {}),
          last_run_at: new Date().toISOString(),
          last_detail: r.detail ?? null,
          last_ok: !!r.ok,
        },
      };
      await db.saveProspect(merged);
      broadcast("prospect_updated", merged);
      saved.push({
        id,
        ok: !!r.ok,
        skipped: !!r.skipped,
        partial: !!r.partial,
        needs_login: false,
        error: r.error || null,
      });
    }

    await db.logActivity({
      type: "browserbase_linkedin_enrich",
      detail: `Browserbase LinkedIn: ${saved.filter((x) => x.ok).length} updated, ${saved.filter((x) => x.needs_login).length} need login, ${errors.length} errors, ${ids.length} requested`,
    });

    res.json({ saved, errors });
  } catch (err) {
    log.error("browserbase linkedin-enrich", { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/enrichment/browserbase/linkedin-enrich-one", async (req, res) => {
  try {
    const prospectId = req.body?.prospect_id;
    const sessionIdIn = req.body?.session_id && String(req.body.session_id).trim() ? String(req.body.session_id).trim() : null;
    if (!prospectId) {
      return res.status(400).json({ error: "prospect_id required" });
    }
    const existing = await db.getProspect(prospectId);
    if (!existing) {
      return res.status(404).json({ error: "Prospect not found" });
    }

    const flow = await enrichOneProspectLinkedInFlow(existing, { session_id: sessionIdIn });

    if (flow.status === "needs_login") {
      return res.json({
        status: "needs_login",
        session_id: flow.session_id,
        debugger_url: flow.debugger_url,
        debugger_fullscreen_url: flow.debugger_fullscreen_url,
        detail: flow.detail,
        message: "Open the debugger window, sign in to LinkedIn, then retry enrichment using the same session.",
      });
    }

    if (flow.status === "ok") {
      const p = flow.prospect;
      const merged = { ...existing, updated_at: new Date().toISOString() };
      for (const k of ["first_name", "last_name", "executive_role", "email", "phone_number", "linkedin_url", "city_or_region"]) {
        if (p[k] != null && String(p[k]).trim() !== "") merged[k] = p[k];
      }
      merged.data_sources = [...new Set([...(existing.data_sources || []), ...(p.data_sources || [])])];
      merged.enrichment_details = {
        ...(existing.enrichment_details || {}),
        browserbase_linkedin: {
          ...(existing.enrichment_details?.browserbase_linkedin || {}),
          last_run_at: new Date().toISOString(),
          last_detail: flow.detail ?? null,
          last_ok: true,
        },
      };
      await db.saveProspect(merged);
      broadcast("prospect_updated", merged);
      await db.logActivity({
        type: "browserbase_linkedin_enrich",
        detail: `Browserbase LinkedIn (single): ${merged.first_name} ${merged.last_name} @ ${merged.company_name || ""}`,
        prospect_id: prospectId,
      });
      return res.json({
        status: "ok",
        session_id: flow.session_id,
        prospect: merged,
        detail: flow.detail,
      });
    }

    const errMsg = flow.error || flow.status;
    await db.logActivity({
      type: "browserbase_linkedin_enrich",
      detail: `Browserbase LinkedIn (single) incomplete: ${errMsg}`,
      prospect_id: prospectId,
    });
    return res.json({
      status: flow.status,
      session_id: flow.session_id,
      error: flow.error || flow.status,
      detail: flow.detail,
      prospect: existing,
    });
  } catch (err) {
    log.error("browserbase linkedin-enrich-one", { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/enrichment/websearch/enrich-one", async (req, res) => {
  try {
    const prospectId = req.body?.prospect_id;
    if (!prospectId) {
      return res.status(400).json({ error: "prospect_id required" });
    }
    const existing = await db.getProspect(prospectId);
    if (!existing) {
      return res.status(404).json({ error: "Prospect not found" });
    }

    const working = {
      ...existing,
      data_sources: Array.isArray(existing.data_sources) ? [...existing.data_sources] : [],
      enrichment_details: { ...(existing.enrichment_details || {}) },
    };
    const out = await deepEnrichProspect(working);
    const detail = out?.enrichment_details || {};

    const merged = { ...existing, updated_at: new Date().toISOString() };
    for (const k of [
      "first_name",
      "last_name",
      "executive_role",
      "email",
      "phone_number",
      "linkedin_url",
      "city_or_region",
      "industry",
      "company_website",
      "company_size_estimate",
    ]) {
      if (working[k] != null && String(working[k]).trim() !== "") merged[k] = working[k];
    }
    merged.data_sources = [...new Set([...(existing.data_sources || []), ...(working.data_sources || [])])];
    merged.enrichment_details = {
      ...(existing.enrichment_details || {}),
      ...(working.enrichment_details || {}),
      websearch_enrich: {
        ...(existing.enrichment_details?.websearch_enrich || {}),
        last_run_at: new Date().toISOString(),
        last_ok: !detail.errors || detail.errors.length === 0,
        last_detail: detail,
      },
    };
    merged.enrichment_status = detail.errors?.length ? "partial" : "complete";

    await db.saveProspect(merged);
    broadcast("prospect_updated", merged);
    await db.logActivity({
      type: "websearch_enrich",
      detail: `Websearch enrich: ${merged.first_name || ""} ${merged.last_name || ""} @ ${merged.company_name || ""}`.trim(),
      prospect_id: prospectId,
    });
    return res.json({
      status: detail.errors?.length ? "partial" : "ok",
      prospect: merged,
      detail,
    });
  } catch (err) {
    log.error("websearch enrich-one", { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// --- Activity ---
app.get("/api/activity", async (req, res) => {
  try {
    const items = await db.listActivity(parseInt(req.query.limit) || 50);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Pipeline ---

app.get("/api/pipeline/stats", async (req, res) => {
  try {
    const prospects = await db.listProspects();
    const visible = prospects.filter(isProspectListVisible);
    const hiddenCount = prospects.length - visible.length;
    const stats = {};
    for (const p of visible) stats[p.status] = (stats[p.status] || 0) + 1;
    const running = await db.getRunningPipelineRun();
    res.json({
      total: visible.length,
      total_all: prospects.length,
      hidden_count: hiddenCount,
      by_status: stats,
      pipeline_status: running ? "running" : "idle",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline/run", async (req, res) => {
  const existing = await db.getRunningPipelineRun();
  if (existing) {
    return res.status(409).json({ error: "Pipeline already running", run: existing });
  }
  try {
    const runConfig = {
      mode: req.body.mode || "process",
      geography: req.body.geography || null,
      batch_size: req.body.batch_size || 5,
    };

    const runId = crypto.randomUUID();
    const run = {
      id: runId,
      status: "running",
      config: runConfig,
      started_at: new Date().toISOString(),
      prospects_processed: 0,
      errors: [],
    };

    await db.savePipelineRun(run);
    await db.logActivity({ type: "pipeline_started", detail: `Pipeline run ${runId} started (mode: ${runConfig.mode})` });
    broadcast("pipeline_started", run);

    try {
      await runPipeline(run);
    } catch (err) {
      log.error("pipeline spawn failed", { error: err.message });
      run.status = "failed";
      run.error = err.message;
      await db.savePipelineRun(run).catch(() => {});
      broadcast("pipeline_failed", run);
    }

    res.status(202).json(run);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pipeline/status", async (req, res) => {
  const running = await db.getRunningPipelineRun();
  res.json(running ? { status: "running", current_run: running } : { status: "idle", current_run: null });
});

app.post("/api/pipeline/discover", async (req, res) => {
  const existing = await db.getRunningPipelineRun();
  if (existing) {
    return res.status(409).json({ error: "Pipeline already running", run: existing });
  }
  try {
    const runConfig = {
      mode: "discover",
      country: req.body.country || "US",
      industry: req.body.industry || null,
      limit: Math.min(100, Math.max(1, parseInt(req.body.limit, 10) || 50)),
    };
    const runId = crypto.randomUUID();
    const run = { id: runId, status: "running", config: runConfig, started_at: new Date().toISOString(), prospects_processed: 0, errors: [] };
    await db.savePipelineRun(run);
    await db.logActivity({ type: "discovery_started", detail: `Discovering prospects in ${runConfig.country} (limit: ${runConfig.limit})` });
    broadcast("pipeline_started", run);
    try {
      await runPipeline(run);
    } catch (err) {
      broadcast("pipeline_failed", { run_id: runId, error: err.message });
    }
    res.status(202).json(run);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pipeline/runs", async (req, res) => {
  try {
    const runs = await db.listPipelineRuns();
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Single run for operator drill-down (includes duration when completed). */
app.get("/api/pipeline/runs/:id", async (req, res) => {
  try {
    const run = await db.getPipelineRun(req.params.id);
    if (!run) return res.status(404).json({ error: "Not found" });
    const started = run.started_at ? new Date(run.started_at).getTime() : null;
    const completed = run.completed_at ? new Date(run.completed_at).getTime() : null;
    const duration_ms = started != null && completed != null ? completed - started : null;
    res.json({ ...run, duration_ms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bookings ---
app.get("/api/bookings", async (req, res) => {
  try {
    const bookings = await db.listBookings();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Calendly Webhook ---
app.post("/api/webhooks/calendly", async (req, res) => {
  try {
    const signature = req.headers["calendly-webhook-signature"];
    if (config.calendly?.webhookSecret && signature) {
      const expected = crypto.createHmac("sha256", config.calendly.webhookSecret).update(JSON.stringify(req.body)).digest("hex");
      if (!signature.includes(expected)) {
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    const event = req.body;
    if (event.event === "invitee.created") {
      const payload = event.payload;
      const booking = {
        id: crypto.randomUUID(),
        calendly_event_uri: payload.event,
        invitee_name: payload.name,
        invitee_email: payload.email,
        scheduled_at: payload.scheduled_event?.start_time,
        event_type: payload.scheduled_event?.name,
        status: "booked",
        created_at: new Date().toISOString(),
      };
      await db.saveBooking(booking);
      await db.logActivity({ type: "booking", detail: `${booking.invitee_name} booked a call via Calendly` });
      broadcast("booking_created", booking);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    log.error("calendly webhook", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- Tools Status ---
app.get("/api/tools/status", (req, res) => {
  res.json({
    explorium: { status: config.explorium.apiKey ? "configured" : "not_configured" },
    stitch: { status: "requires_auth" },
    vercel: { status: config.vercel?.token ? "configured" : "not_configured" },
    screenshot: { status: "available" },
    ses: {
      status: hasSenderIdentity() ? "sender_configured" : "not_configured",
      region: config.ses.region,
      note: "Pipeline uses SES on the worker Lambda; verify domain/email in SES and attach iam:SendEmail to the role or set SES_* keys.",
    },
    calendly: { status: config.calendly?.clientId ? "configured" : "not_configured" },
    groq: { status: config.groq.apiKey ? "connected" : "not_configured" },
    browserbase: {
      status: config.enrichment?.browserbaseApiKey ? "configured" : "not_configured",
      note:
        "Set BROWSERBASE_API_KEY on the API. In the app: Prospects → status strip, or open a prospect → Enrich from LinkedIn. Activity log records each run.",
    },
    outreach: {
      auto_send: process.env.OUTREACH_AUTO_SEND !== "0" && process.env.OUTREACH_AUTO_SEND !== "false",
      dry_run: process.env.OUTREACH_DRY_RUN === "1" || process.env.OUTREACH_DRY_RUN === "true",
    },
  });
});

// --- Pipeline Runner: AWS Lambda async invoke (prod) or child process (local) ---
const appDir = dirname(fileURLToPath(import.meta.url));

async function runPipeline(run) {
  const workerFn = process.env.PIPELINE_WORKER_FUNCTION_NAME;
  if (workerFn) {
    const lambda = new LambdaClient({ region: process.env.AWS_REGION || config.aws.region });
    await lambda.send(
      new InvokeCommand({
        FunctionName: workerFn,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify({ run })),
      }),
    );
    log.info("Pipeline worker invoked (async Lambda)", { run_id: run.id, workerFn });
    return;
  }

  const workerPath = join(appDir, "pipeline-worker.js");
  const child = fork(workerPath, [JSON.stringify(run)], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    env: { ...process.env },
  });

  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.event === "progress") broadcast("pipeline_progress", msg.data);
        if (msg.event === "completed") broadcast("pipeline_completed", msg.data);
        if (msg.event === "failed") broadcast("pipeline_failed", msg.data);
        if (msg.event === "error") broadcast("pipeline_error", msg.data);
      } catch {}
    }
  });

  child.stderr.on("data", (chunk) => {
    log.warn("Pipeline worker stderr", { output: chunk.toString().trim().slice(0, 200) });
  });

  child.on("close", (code) => {
    log.info(`Pipeline worker exited with code ${code}`);
    if (code !== 0) {
      broadcast("pipeline_failed", { run_id: run.id, error: `Worker exited with code ${code}` });
    }
  });

  child.on("error", (err) => {
    log.error("Pipeline worker spawn error", { error: err.message });
    broadcast("pipeline_failed", { run_id: run.id, error: err.message });
  });
}

export { app, broadcast };
