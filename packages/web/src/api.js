/**
 * API base URL resolution:
 * 1. Build-time: `VITE_API_URL` (used by Vercel/GitHub builds).
 * 2. Runtime: `GET /api-config.json` → `{ "apiBase": "https://....lambda-url....on.aws" }` (no trailing slash).
 *    Use this when you deploy prebuilt `dist/` (CLI) without env — edit `public/api-config.json`, rebuild, redeploy.
 * Empty base = same origin (Vite dev proxy only); production static hosts have no `/api`.
 */
let _configLoaded = false;
let _apiBase = "";

function viteEnvBase() {
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw !== "string") return "";
  const u = raw.trim().replace(/\/+$/, "");
  return u.length > 0 ? u : "";
}

/** Resolved API origin (no trailing slash), or "" if using same-origin. */
export function getApiBase() {
  if (!_configLoaded) return viteEnvBase();
  return _apiBase;
}

/** Test-only: reset loader state (Vitest). No-op in production. */
export function __resetApiConfigForTests() {
  if (!import.meta.env.VITEST) return;
  _configLoaded = false;
  _apiBase = "";
}

/** Call once before any API requests. Loads `/api-config.json` to override `VITE_API_URL` when present. */
export async function initApiConfig() {
  _apiBase = viteEnvBase();
  try {
    const r = await fetch("/api-config.json", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    const b = typeof j.apiBase === "string" ? j.apiBase.trim().replace(/\/+$/, "") : "";
    if (b.length > 0) _apiBase = b;
  } catch {
    /* keep _apiBase from env */
  } finally {
    _configLoaded = true;
  }
}

export function apiUrl(path) {
  if (!path.startsWith("/")) return path;
  const base = getApiBase();
  return `${base}${path}`;
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(apiUrl(path), {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API ${res.status}`);
  }
  return res.json();
}

/** @param {{ visibility?: "default" | "all" }} [opts] */
export async function fetchProspects(opts = {}) {
  const v = opts.visibility === "all" ? "all" : "default";
  return apiFetch(`/api/prospects?visibility=${encodeURIComponent(v)}`);
}
export async function fetchProspect(id) { return apiFetch(`/api/prospects/${id}`); }
export async function createProspect(data) { return apiFetch("/api/prospects", { method: "POST", body: JSON.stringify(data) }); }
export async function updateProspect(id, data) { return apiFetch(`/api/prospects/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
export async function deleteProspect(id) { return apiFetch(`/api/prospects/${id}`, { method: "DELETE" }); }
export async function importProspects(rows) { return apiFetch("/api/prospects/import", { method: "POST", body: JSON.stringify({ rows }) }); }
export async function fetchProspectTimeline(id) { return apiFetch(`/api/prospects/${id}/timeline`); }

export async function fetchActivity(limit = 50) { return apiFetch(`/api/activity?limit=${limit}`); }
export async function fetchPipelineStats() { return apiFetch("/api/pipeline/stats"); }
export async function triggerPipelineRun(config = {}) { return apiFetch("/api/pipeline/run", { method: "POST", body: JSON.stringify(config) }); }
export async function triggerDiscovery(config = {}) { return apiFetch("/api/pipeline/discover", { method: "POST", body: JSON.stringify(config) }); }
export async function fetchPipelineStatus() { return apiFetch("/api/pipeline/status"); }
export async function fetchPipelineRuns() { return apiFetch("/api/pipeline/runs"); }

export async function fetchBookings() { return apiFetch("/api/bookings"); }
export async function fetchToolsStatus() { return apiFetch("/api/tools/status"); }
export async function fetchSettings() { return apiFetch("/api/settings"); }

/** Browserbase live session for LinkedIn sign-in; open `debugger_url` in a popup. */
export async function createBrowserbaseLinkedInSession() {
  return apiFetch("/api/enrichment/browserbase/linkedin-session", { method: "POST", body: JSON.stringify({}) });
}

/** After sign-in, scrape LinkedIn for up to 25 prospects (profile URL or name+company search). */
export async function browserbaseLinkedInEnrich(sessionId, prospectIds) {
  return apiFetch("/api/enrichment/browserbase/linkedin-enrich", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, prospect_ids: prospectIds }),
  });
}

/** Single prospect LinkedIn scrape; pass stored session_id after sign-in to skip popup when still authenticated. */
export async function browserbaseLinkedInEnrichOne(prospectId, sessionId) {
  return apiFetch("/api/enrichment/browserbase/linkedin-enrich-one", {
    method: "POST",
    body: JSON.stringify({
      prospect_id: prospectId,
      session_id: sessionId || null,
    }),
  });
}

/** Single prospect websearch enrichment with grounded extraction from website/search sources. */
export async function websearchEnrichOne(prospectId) {
  return apiFetch("/api/enrichment/websearch/enrich-one", {
    method: "POST",
    body: JSON.stringify({ prospect_id: prospectId }),
  });
}

export async function testConnector(connectorId) {
  const res = await fetch(apiUrl(`/api/settings/test/${encodeURIComponent(connectorId)}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Test failed (${res.status})`);
  return body;
}

let eventSource = null;
const listeners = new Set();
let pollIntervalId = null;
let pollRefCount = 0;
let _lastPipelineStatus = null;
let _lastActivityTs = 0;

export function subscribeSSE(callback) {
  listeners.add(callback);
  const remote = getApiBase().length > 0;
  if (remote) {
    const tick = async () => {
      try {
        const ps = await fetchPipelineStatus();
        const act = await fetchActivity(1);
        const newStatus = ps.status || "idle";
        const rawTs = act[0]?.ts;
        const newTs = rawTs != null ? new Date(rawTs).getTime() : 0;
        const statusChanged = _lastPipelineStatus !== null && _lastPipelineStatus !== newStatus;
        const activityChanged = _lastActivityTs !== 0 && Number.isFinite(newTs) && newTs > _lastActivityTs;
        _lastPipelineStatus = newStatus;
        _lastActivityTs = newTs;
        if (statusChanged || activityChanged) {
          for (const cb of listeners) cb("poll_refresh", {});
        }
      } catch {
        /* ignore */
      }
    };
    pollRefCount += 1;
    if (!pollIntervalId) {
      tick();
      pollIntervalId = setInterval(tick, 10000);
    }
    return () => {
      listeners.delete(callback);
      pollRefCount -= 1;
      if (pollRefCount <= 0 && pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    };
  }
  if (!eventSource) {
    eventSource = new EventSource(apiUrl("/api/events"));
    eventSource.onmessage = (e) => {
      try { const data = JSON.parse(e.data); notify(e.type || "message", data); } catch {}
    };
    for (const evt of ["connected", "prospect_created", "prospect_updated", "prospect_deleted", "prospects_imported",
      "pipeline_started", "pipeline_progress", "pipeline_completed", "pipeline_failed", "booking_created"]) {
      eventSource.addEventListener(evt, (e) => {
        try { notify(evt, JSON.parse(e.data)); } catch {}
      });
    }
  }
  return () => {
    listeners.delete(callback);
  };
}

function notify(event, data) {
  for (const cb of listeners) cb(event, data);
}
