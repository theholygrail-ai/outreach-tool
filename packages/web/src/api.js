/** Base URL for API (empty = same origin / Vite proxy). Set VITE_API_URL on Vercel to Lambda Function URL. */
function getApiBase() {
  const u = import.meta.env.VITE_API_URL;
  if (typeof u === "string" && u.trim().length > 0) return u.replace(/\/$/, "");
  return "";
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

export async function fetchProspects() { return apiFetch("/api/prospects"); }
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

export function subscribeSSE(callback) {
  listeners.add(callback);
  const remote = getApiBase().length > 0;
  if (remote) {
    const tick = async () => {
      try {
        await fetchPipelineStatus();
        await fetchActivity(8);
        for (const cb of listeners) cb("poll_refresh", {});
      } catch {
        /* ignore */
      }
    };
    pollRefCount += 1;
    if (!pollIntervalId) {
      tick();
      pollIntervalId = setInterval(tick, 6000);
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
