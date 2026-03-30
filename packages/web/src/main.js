import * as api from "./api.js";

const FLAGS = { US: "\u{1F1FA}\u{1F1F8}", GB: "\u{1F1EC}\u{1F1E7}", AE: "\u{1F1E6}\u{1F1EA}" };

function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function timeAgo(ts) {
  const d = Date.now() - (typeof ts === "string" ? new Date(ts).getTime() : ts);
  const m = Math.floor(d / 60000); if (m < 1) return "now"; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`;
}
function badge(status) {
  return `<span class="badge badge-${status}">${(status || "").replace(/_/g, " ")}</span>`;
}
function icpBadge(score) {
  const c = score >= 85 ? "icp-high" : score >= 70 ? "icp-med" : "icp-low";
  return `<span class="icp-score ${c}">${score || "?"}</span>`;
}
function qualityBadge(score) {
  if (score == null) return `<span class="quality-badge quality-none">—</span>`;
  const cls = score >= 70 ? "quality-high" : score >= 40 ? "quality-med" : "quality-low";
  return `<span class="quality-badge ${cls}">${score}</span>`;
}
function verifiedIcon(v) {
  if (!v) return "";
  return v.company_found_in_search ? `<span class="verified-icon" title="Verified">✓</span>` : `<span class="unverified-icon" title="Not verified">✗</span>`;
}
function linkOrDash(url, label) {
  if (!url) return "\u2014";
  const href = url.startsWith("http") ? url : `https://${url}`;
  return `<a href="${href}" target="_blank" rel="noopener">${esc(label || url)}</a>`;
}

const main = () => document.getElementById("main-content");

function pipelineProgressWrap() {
  return document.getElementById("pipeline-progress-ui");
}

/** Human-readable line from worker `progress` payloads (see pipeline-worker send("progress")). */
function formatPipelineProgressMessage(data) {
  if (!data || typeof data !== "object") return "Pipeline running…";
  if (data.stage && data.company) {
    const st = String(data.stage);
    const cap = st.charAt(0).toUpperCase() + st.slice(1);
    return `${cap}: ${data.company}`;
  }
  if (data.from != null && data.to != null) {
    const a = String(data.from).replace(/_/g, " ");
    const b = String(data.to).replace(/_/g, " ");
    return `${a} → ${b}`;
  }
  if (data.discovered != null) {
    const n = data.discovered;
    const src = data.source ? ` via ${data.source}` : "";
    return `Discovered ${n} prospect${n === 1 ? "" : "s"}${src}`;
  }
  return "Pipeline running…";
}

function showPipelineProgressBar(message) {
  const wrap = pipelineProgressWrap();
  if (!wrap) return;
  const textEl = wrap.querySelector(".pipeline-progress-text");
  if (textEl) textEl.textContent = message;
  wrap.classList.remove("hidden");
}

function hidePipelineProgressBar() {
  pipelineProgressWrap()?.classList.add("hidden");
}

function updatePipelineProgressUI(data) {
  showPipelineProgressBar(formatPipelineProgressMessage(data));
}

/** Sidebar: Groq + Browserbase from GET /api/tools/status */
async function refreshNavIntegrationStatus() {
  const groqEl = document.getElementById("nav-groq-status");
  const bbEl = document.getElementById("nav-browserbase-status");
  if (!groqEl && !bbEl) return;
  try {
    const st = await api.fetchToolsStatus();
    if (groqEl) {
      const ok = st.groq?.status === "connected";
      groqEl.innerHTML = `<span class="dot ${ok ? "dot-green" : "dot-red"}"></span> Groq: ${ok ? "ready" : "no key"}`;
    }
    if (bbEl) {
      const ok = st.browserbase?.status === "configured";
      bbEl.innerHTML = `<span class="dot ${ok ? "dot-green" : "dot-amber"}"></span> Browserbase: ${ok ? "ready" : "needs key"}`;
      bbEl.title = ok
        ? "LinkedIn enrichment available from Prospects or prospect modal"
        : "Set BROWSERBASE_API_KEY on the API server, then restart";
    }
  } catch {
    if (groqEl) groqEl.innerHTML = `<span class="dot dot-gray"></span> Groq: offline?`;
    if (bbEl) bbEl.innerHTML = `<span class="dot dot-gray"></span> Browserbase: offline?`;
  }
}

function browserbaseProspectsBannerHtml(toolsStatus, sessionIdShort) {
  const bb = toolsStatus?.browserbase || {};
  const ok = bb.status === "configured";
  const cls = ok ? "bb-ok" : "bb-warn";
  const sessionLine = ok
    ? (sessionIdShort
      ? `<p class="text-muted" style="margin:0.35rem 0 0">Saved browser session: <code class="mono">${esc(sessionIdShort)}</code> (reused until it expires). Top bar shows progress while enriching.</p>`
      : `<p class="text-muted" style="margin:0.35rem 0 0">No saved session yet — first run may open LinkedIn sign-in. Progress appears in the <strong>top bar</strong> and in the prospect modal.</p>`)
    : `<p class="text-muted" style="margin:0.35rem 0 0">Add <code>BROWSERBASE_API_KEY</code> to the API environment and restart. Confirm under <strong>Settings → Connectors → browserbase → Test</strong>.</p>`;
  const clearBtn = ok && sessionIdShort
    ? `<button type="button" class="btn btn-xs" id="btn-bb-clear-session" style="margin-top:0.5rem">Clear saved session</button>`
    : "";
  return `<div class="bb-status-card ${cls}">
    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
      <strong>Browserbase · LinkedIn enrichment</strong>
      ${badge(ok ? "configured" : "not_configured")}
    </div>
    ${sessionLine}
    <p class="text-muted" style="margin:0.35rem 0 0;font-size:0.78rem">Open any prospect → <strong>Info</strong> → <strong>Enrich from LinkedIn</strong>. Successful runs also appear in <strong>Dashboard → Recent Activity</strong>.</p>
    ${clearBtn}
  </div>`;
}

// ---- ROUTER ----
function route() {
  const h = location.hash || "#/";
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  if (h.startsWith("#/prospects")) { setActive("prospects"); renderProspects(); }
  else if (h.startsWith("#/outreach")) { setActive("outreach"); renderOutreach(); }
  else if (h.startsWith("#/tools")) { setActive("tools"); renderTools(); }
  else if (h.startsWith("#/bookings")) { setActive("bookings"); renderBookings(); }
  else if (h.startsWith("#/runs")) { setActive("runs"); renderRuns(); }
  else if (h.startsWith("#/settings")) { setActive("settings"); renderSettings(); }
  else { setActive("dashboard"); renderDashboard(); }
  void refreshNavIntegrationStatus();
}
function setActive(v) { document.querySelector(`[data-view="${v}"]`)?.classList.add("active"); }

/** Set true only after initApiConfig + API base resolution, so hashchange cannot race ahead of /api-config.json. */
let appReady = false;

/** Cancels in-flight `renderProspects` when navigating away or re-entering the route. */
let prospectsRenderGeneration = 0;

/** Set after "LinkedIn: open session" or modal enrich (Browserbase debugger / reuse). */
let linkedInBrowserbaseSessionId = null;

const BB_LI_SESSION_STORAGE_KEY = "outreach_tool_bb_linkedin_session";
function getStoredBbLiSession() {
  try {
    return sessionStorage.getItem(BB_LI_SESSION_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}
function setStoredBbLiSession(sessionId) {
  try {
    if (sessionId) sessionStorage.setItem(BB_LI_SESSION_STORAGE_KEY, sessionId);
    else sessionStorage.removeItem(BB_LI_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} prospectId
 * @param {string | null | undefined} sessionIdExplicit — pass session from needs_login retry; undefined = use sessionStorage if any
 */
function startModalBrowserbaseLinkedInEnrich(prospectId, sessionIdExplicit) {
  const wrap = document.getElementById("modal-bb-progress-wrap");
  const label = document.getElementById("modal-bb-progress-label");
  const bar = document.getElementById("modal-bb-progress-bar");
  const hint = document.getElementById("modal-bb-login-hint");
  const btn = document.getElementById("modal-btn-bb-enrich");
  if (!wrap || !label || !bar || !hint) return;
  hint.classList.add("hidden");
  hint.innerHTML = "";
  wrap.classList.remove("hidden");
  bar.classList.add("indeterminate");
  if (btn) btn.disabled = true;
  const reuse = sessionIdExplicit !== undefined && sessionIdExplicit !== null
    ? sessionIdExplicit
    : getStoredBbLiSession();
  label.textContent = reuse ? "Connecting with saved session…" : "Starting Browserbase session…";
  showPipelineProgressBar(reuse ? "Browserbase: LinkedIn enrichment (saved session)…" : "Browserbase: LinkedIn enrichment…");

  api.browserbaseLinkedInEnrichOne(prospectId, reuse)
    .then((out) => {
      if (out.session_id) {
        setStoredBbLiSession(out.session_id);
        linkedInBrowserbaseSessionId = out.session_id;
      }
      if (out.status === "needs_login") {
        hidePipelineProgressBar();
        showPipelineProgressBar("Browserbase: sign in to LinkedIn in the popup, then Retry in the modal");
        bar.classList.remove("indeterminate");
        label.textContent = "Sign in required — use the remote browser, then Retry.";
        hint.innerHTML = `<p class="text-muted" style="margin:0 0 0.5rem">A Browserbase window opens your signed-out session. Log in to LinkedIn there, then retry (same session).</p>
          <button type="button" class="btn btn-sm" id="modal-bb-open-debugger">Open sign-in window</button>
          <button type="button" class="btn btn-sm" style="margin-left:0.35rem" id="modal-bb-retry">Retry enrichment</button>`;
        hint.classList.remove("hidden");
        const openBtn = document.getElementById("modal-bb-open-debugger");
        const retryBtn = document.getElementById("modal-bb-retry");
        if (openBtn) {
          openBtn.onclick = () => {
            window.open(out.debugger_url, "outreach_bb_linkedin_modal", "width=1280,height=860,noopener,noreferrer");
          };
        }
        if (retryBtn) {
          retryBtn.onclick = () => startModalBrowserbaseLinkedInEnrich(prospectId, out.session_id);
        }
        return;
      }
      hidePipelineProgressBar();
      wrap.classList.add("hidden");
      bar.classList.remove("indeterminate");
      if (out.status === "ok") {
        openProspectModal(prospectId);
        return;
      }
      label.textContent = out.error || out.status || "Incomplete";
      wrap.classList.remove("hidden");
      alert(out.error || out.status || "Enrichment did not complete");
    })
    .catch((e) => {
      hidePipelineProgressBar();
      bar.classList.remove("indeterminate");
      label.textContent = e.message || String(e);
    })
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}

function startModalWebsearchEnrich(prospectId) {
  const wrap = document.getElementById("modal-bb-progress-wrap");
  const label = document.getElementById("modal-bb-progress-label");
  const bar = document.getElementById("modal-bb-progress-bar");
  const hint = document.getElementById("modal-bb-login-hint");
  const btn = document.getElementById("modal-btn-web-enrich");
  if (!wrap || !label || !bar || !hint) return;
  hint.classList.add("hidden");
  hint.innerHTML = "";
  wrap.classList.remove("hidden");
  bar.classList.add("indeterminate");
  if (btn) btn.disabled = true;
  label.textContent = "Running websearch enrichment…";
  showPipelineProgressBar("Websearch enrichment: collecting and grounding website/search evidence…");

  api.websearchEnrichOne(prospectId)
    .then((out) => {
      hidePipelineProgressBar();
      bar.classList.remove("indeterminate");
      wrap.classList.add("hidden");
      if (out.status === "ok" || out.status === "partial") {
        openProspectModal(prospectId);
        return;
      }
      label.textContent = out.error || out.status || "Incomplete";
      wrap.classList.remove("hidden");
      alert(out.error || out.status || "Websearch enrichment did not complete");
    })
    .catch((e) => {
      hidePipelineProgressBar();
      bar.classList.remove("indeterminate");
      label.textContent = e.message || String(e);
    })
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}

function isProspectsRoute() {
  return (location.hash || "#/").startsWith("#/prospects");
}

/** Dashboard / prospects / runs can update without tearing down the whole main view. */
function isLivePatchView() {
  const h = location.hash || "#/";
  if (h === "#" || h === "#/" || h === "") return true;
  if (h.startsWith("#/prospects")) return true;
  if (h.startsWith("#/runs")) return true;
  return false;
}

// ---- SSE (registered after initApiConfig in boot) ----
function registerRealtime() {
  api.subscribeSSE((event, _data) => {
    if (event === "poll_refresh") {
      void refreshFromPoll();
      return;
    }
    if (event === "pipeline_progress") {
      updatePipelineProgressUI(_data);
      return;
    }
    if (["prospect_created", "prospect_updated", "prospect_deleted", "prospects_imported"].includes(event)) {
      void refreshFromPoll();
      void refreshProspectsTableFromPoll();
      if (!isLivePatchView()) route();
      return;
    }
    if (event === "pipeline_started") {
      showPipelineProgressBar("Pipeline running…");
      void refreshFromPoll();
      void refreshProspectsTableFromPoll();
      if (!isLivePatchView()) route();
      return;
    }
    if (event === "pipeline_completed" || event === "pipeline_failed") {
      hidePipelineProgressBar();
      void refreshFromPoll();
      void refreshProspectsTableFromPoll();
      if (!isLivePatchView()) route();
      return;
    }
    if (event === "booking_created") {
      void refreshFromPoll();
      void refreshProspectsTableFromPoll();
      if (!isLivePatchView()) route();
      return;
    }
  });
}

/** Remote deployments poll pipeline/activity; update live regions only — no full view tear-down. */
async function refreshFromPoll() {
  const dashBody = document.getElementById("dashboard-body");
  if (dashBody) {
    try {
      const [stats, activity, pStatus] = await Promise.all([
        api.fetchPipelineStats(), api.fetchActivity(10), api.fetchPipelineStatus(),
      ]);
      const pipelineRunning = pStatus.status === "running";
      const badge = document.getElementById("dashboard-pipeline-badge");
      if (badge) {
        badge.textContent = pipelineRunning ? "Pipeline Running" : "Idle";
        badge.className = `badge badge-${pipelineRunning ? "running" : "idle"}`;
      }
      dashBody.innerHTML = dashboardBodyInnerHtml(stats, activity);
    } catch {
      /* ignore */
    }
  }
  const runsMount = document.getElementById("runs-body");
  if (runsMount) {
    try {
      const runs = await api.fetchPipelineRuns();
      const countEl = document.getElementById("runs-count");
      if (countEl) countEl.textContent = `(${runs.length})`;
      runsMount.innerHTML = runs.length
        ? `<div class="card"><table><thead><tr><th>ID</th><th>Mode</th><th>Status</th><th>Processed</th><th>Errors</th><th>Started</th><th>Completed</th></tr></thead>
        <tbody>${runs.map(r => `<tr><td class="mono">${(r.id || "").slice(0, 8)}</td><td>${esc(r.config?.mode || "")}</td>
          <td>${badge(r.status || "unknown")}</td><td>${r.prospects_processed || 0}</td><td>${(r.errors || []).length}</td>
          <td>${r.started_at ? new Date(r.started_at).toLocaleString() : "\u2014"}</td>
          <td>${r.completed_at ? new Date(r.completed_at).toLocaleString() : "\u2014"}</td></tr>`).join("")}</tbody></table></div>`
        : '<div class="card empty">No pipeline runs yet. Click "Run Pipeline" on the dashboard to start.</div>';
    } catch {
      /* ignore */
    }
  }
}

/** When on Prospects, re-fetch and re-apply filters without re-running renderProspects (avoids "Loading…" flash). */
async function refreshProspectsTableFromPoll() {
  const wrap = document.getElementById("prospect-table-wrap");
  if (!wrap) return;
  const showHidden = document.getElementById("show-hidden")?.checked === true;
  const qualityFilter = document.getElementById("quality-filter")?.value || "all";
  const q = (document.getElementById("search")?.value || "").toLowerCase();
  try {
    const prospects = await api.fetchProspects({ visibility: showHidden ? "all" : "default" });
    const countEl = document.getElementById("prospect-count");
    if (countEl) countEl.textContent = `(${prospects.length})`;
    let filtered = prospects;
    if (qualityFilter === "verified") filtered = filtered.filter(p => (p.quality_score || 0) >= 60);
    else if (qualityFilter === "review") filtered = filtered.filter(p => {
      const s = p.quality_score || 0;
      return s >= 30 && s < 60;
    });
    else if (qualityFilter === "30+") filtered = filtered.filter(p => (p.quality_score || 0) >= 30);
    if (q) filtered = filtered.filter(p => `${p.first_name} ${p.last_name} ${p.company_name} ${p.country} ${p.status}`.toLowerCase().includes(q));
    wrap.innerHTML = prospectTable(filtered);
    bindRows();
  } catch {
    /* ignore */
  }
}

function dashboardBodyInnerHtml(stats, activity) {
  const byStatus = stats.by_status || {};
  return `
      <div class="stats-row">
        ${statCard("Total", stats.total, (stats.hidden_count > 0 ? `${stats.total_all || stats.total} incl. ${stats.hidden_count} hidden` : "list-visible"))}
        ${statCard("Qualified", (byStatus.qualified || 0) + (byStatus.audited_or_researched || 0) + (byStatus.design_brief_ready || 0) + (byStatus.design_generated || 0) + (byStatus.design_reviewed || 0), "in pipeline")}
        ${statCard("Deployed", (byStatus.deployed || 0) + (byStatus.proof_captured || 0) + (byStatus.outreach_ready || 0) + (byStatus.sent || 0), "MVPs live")}
        ${statCard("Booked", byStatus.meeting_booked || 0, "meetings")}
        ${statCard("Won", byStatus.won || 0, "closed")}
      </div>
      <div class="pipeline-section"><h2>Pipeline <small class="text-muted">click a stage to filter</small></h2>
        <div class="pipeline-columns">${renderPipeline(byStatus)}</div>
      </div>
      <div class="two-col">
        <div class="card"><div class="card-header"><h2>Recent Activity</h2></div>
          <div class="activity-feed">${activity.map(a => `
            <div class="activity-item">
              <div class="activity-dot dot-${a.type === "pipeline_started" || a.type === "pipeline_completed" ? "blue" : a.type === "booking" || a.type === "browserbase_linkedin_enrich" ? "green" : "gray"}"></div>
              <div class="activity-content">
                <div class="activity-text">${esc(a.detail || "")}</div>
                <div class="activity-time">${timeAgo(a.ts)}</div>
              </div>
            </div>`).join("") || '<div class="empty">No activity yet. Run the pipeline to start.</div>'}</div>
        </div>
        <div class="card"><div class="card-header"><h2>Quick Actions</h2></div>
          <div class="actions-grid">
            <button class="action-btn" onclick="location.hash='#/prospects'">View Prospects</button>
            <button class="action-btn" onclick="location.hash='#/outreach'">Outreach Queue</button>
            <button class="action-btn" onclick="location.hash='#/bookings'">Bookings</button>
            <button class="action-btn" onclick="location.hash='#/tools'">Tool Status</button>
            <button class="action-btn" onclick="location.hash='#/runs'">Pipeline Runs</button>
          </div>
        </div>
      </div>`;
}

// ---- DASHBOARD ----
async function renderDashboard() {
  main().innerHTML = `<div class="loading">Loading dashboard...</div>`;
  try {
    const [stats, activity, pStatus] = await Promise.all([
      api.fetchPipelineStats(), api.fetchActivity(10), api.fetchPipelineStatus(),
    ]);
    const pipelineRunning = pStatus.status === "running";

    main().innerHTML = `
      <div class="view-header"><h1>Dashboard</h1>
        <div class="view-actions">
          <span class="badge badge-${pipelineRunning ? "running" : "idle"}" id="dashboard-pipeline-badge">${pipelineRunning ? "Pipeline Running" : "Idle"}</span>
          <button class="btn btn-sm" id="btn-discover">Discover Prospects</button>
          <button class="btn btn-sm" id="btn-run">Run Pipeline</button>
        </div>
      </div>
      <div id="dashboard-body">${dashboardBodyInnerHtml(stats, activity)}</div>`;

    document.getElementById("btn-discover")?.addEventListener("click", async () => {
      const country = prompt("Country code (US, GB, AE):", "US");
      if (!country) return;
      const btn = document.getElementById("btn-discover");
      btn.textContent = "Discovering..."; btn.disabled = true;
      try {
        const { id: runId } = await api.triggerDiscovery({ country, limit: 50 });
        btn.textContent = "Running...";
        const poll = setInterval(async () => {
          try {
            const st = await api.fetchPipelineStatus();
            if (st.status !== "running") {
              clearInterval(poll);
              const runs = await api.fetchPipelineRuns();
              const thisRun = runs.find(r => r.id === runId) || runs[0];
              if (thisRun?.status === "failed") {
                alert(`Discovery failed: ${thisRun.error || "unknown error"}`);
              } else {
                const count = thisRun?.prospects_processed || 0;
                btn.textContent = count > 0 ? `Found ${count}!` : "Done (0 found)";
              }
              btn.disabled = false;
              setTimeout(() => { btn.textContent = "Discover Prospects"; }, 3000);
              route();
            }
          } catch { /* keep polling */ }
        }, 2500);
        setTimeout(() => { clearInterval(poll); btn.disabled = false; btn.textContent = "Discover Prospects"; route(); }, 120000);
      } catch (e) { alert(e.message); btn.textContent = "Discover Prospects"; btn.disabled = false; }
    });

    document.getElementById("btn-run")?.addEventListener("click", async () => {
      const btn = document.getElementById("btn-run");
      btn.textContent = "Starting..."; btn.disabled = true;
      try {
        await api.triggerPipelineRun({ mode: "process", batch_size: 5 });
        btn.textContent = "Running...";
        setTimeout(route, 5000);
      } catch (e) { alert(e.message); btn.textContent = "Run Pipeline"; btn.disabled = false; }
    });
  } catch (err) {
    main().innerHTML = `<div class="error">Failed to load dashboard: ${esc(err.message)}<br><br>Is the API server running on port 9002?<br><code>npm run dev:api</code></div>`;
  }
}

// ---- PROSPECTS ----
async function renderProspects() {
  const gen = ++prospectsRenderGeneration;
  const alreadyMounted = !!document.getElementById("prospect-table-wrap");
  if (!alreadyMounted) {
    main().innerHTML = `<div class="loading">Loading prospects...</div>`;
  }
  try {
    let showHidden = false;
    const [prospects, toolsSt] = await Promise.all([
      api.fetchProspects({ visibility: "default" }),
      api.fetchToolsStatus().catch(() => ({})),
    ]);
    const storedBb = getStoredBbLiSession();
    const sessionShort = storedBb ? `${storedBb.slice(0, 14)}…` : "";
    if (storedBb) linkedInBrowserbaseSessionId = storedBb;
    if (gen !== prospectsRenderGeneration || !isProspectsRoute()) return;
    let qualityFilter = "all";

    function applyFilters(q = "") {
      let filtered = prospects;
      if (qualityFilter === "verified") filtered = filtered.filter(p => (p.quality_score || 0) >= 60);
      else if (qualityFilter === "review") filtered = filtered.filter(p => { const s = p.quality_score || 0; return s >= 30 && s < 60; });
      else if (qualityFilter === "30+") filtered = filtered.filter(p => (p.quality_score || 0) >= 30);
      if (q) filtered = filtered.filter(p => `${p.first_name} ${p.last_name} ${p.company_name} ${p.country} ${p.status}`.toLowerCase().includes(q));
      document.getElementById("prospect-table-wrap").innerHTML = prospectTable(filtered);
      bindRows();
    }

    main().innerHTML = `
      <div class="view-header"><h1>Prospects <small class="text-muted" id="prospect-count">(${prospects.length})</small></h1>
        <div class="view-actions">
          <label class="text-muted" style="display:flex;align-items:center;gap:0.35rem;font-size:0.8rem;margin-right:0.5rem">
            <input type="checkbox" id="show-hidden" /> Show hidden
          </label>
          <select id="quality-filter" class="input" style="width:auto">
            <option value="all">All prospects</option>
            <option value="verified">Verified (60+)</option>
            <option value="review">Needs review (30-59)</option>
            <option value="30+">Scored 30+</option>
          </select>
          <input type="text" id="search" class="input" placeholder="Search..." />
          <button type="button" class="btn btn-sm" id="btn-bb-li-start" title="Open remote browser to sign in to LinkedIn">LinkedIn: open session</button>
          <button type="button" class="btn btn-sm" id="btn-bb-li-run" title="Enrich up to 25 prospects from the current list">LinkedIn: enrich list</button>
          <span class="text-muted" id="bb-li-status" style="font-size:0.72rem;max-width:8rem;overflow:hidden;text-overflow:ellipsis"></span>
          <button class="btn btn-sm" id="btn-add">+ New Prospect</button>
          <button class="btn btn-sm" id="btn-csv">Import CSV</button>
        </div>
      </div>
      ${browserbaseProspectsBannerHtml(toolsSt, sessionShort)}
      <div class="card"><div class="table-wrap" id="prospect-table-wrap">${prospectTable(prospects)}</div></div>`;

    document.getElementById("btn-bb-clear-session")?.addEventListener("click", () => {
      setStoredBbLiSession(null);
      linkedInBrowserbaseSessionId = null;
      const stEl = document.getElementById("bb-li-status");
      if (stEl) stEl.textContent = "";
      void renderProspects();
    });

    document.getElementById("show-hidden").addEventListener("change", async (e) => {
      showHidden = e.target.checked;
      prospects = await api.fetchProspects({ visibility: showHidden ? "all" : "default" });
      document.getElementById("prospect-count").textContent = `(${prospects.length})`;
      applyFilters(document.getElementById("search").value.toLowerCase());
    });

    document.getElementById("search").addEventListener("input", (e) => applyFilters(e.target.value.toLowerCase()));
    document.getElementById("quality-filter").addEventListener("change", (e) => {
      qualityFilter = e.target.value;
      applyFilters(document.getElementById("search").value.toLowerCase());
    });
    document.getElementById("btn-bb-li-start")?.addEventListener("click", async () => {
      const btn = document.getElementById("btn-bb-li-start");
      const statusEl = document.getElementById("bb-li-status");
      btn.disabled = true;
      showPipelineProgressBar("Browserbase: creating live browser session…");
      try {
        const s = await api.createBrowserbaseLinkedInSession();
        linkedInBrowserbaseSessionId = s.session_id;
        setStoredBbLiSession(s.session_id);
        if (statusEl) statusEl.textContent = s.session_id ? `${s.session_id.slice(0, 10)}…` : "";
        hidePipelineProgressBar();
        window.open(s.debugger_url, "outreach_bb_linkedin", "width=1280,height=860,noopener,noreferrer");
        alert("Sign in to LinkedIn in the new window. When finished, click \"LinkedIn: enrich list\" here (session expires when Browserbase times it out).");
      } catch (e) {
        linkedInBrowserbaseSessionId = null;
        if (statusEl) statusEl.textContent = "";
        hidePipelineProgressBar();
        alert(e.message || String(e));
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("btn-bb-li-run")?.addEventListener("click", async () => {
      const sid = linkedInBrowserbaseSessionId || getStoredBbLiSession();
      if (!sid) {
        alert("Use \"LinkedIn: open session\" first (or run modal enrich once to create a session), then sign in if prompted.");
        return;
      }
      linkedInBrowserbaseSessionId = sid;
      const btn = document.getElementById("btn-bb-li-run");
      const ids = prospects.slice(0, 25).map((p) => p.id);
      if (!ids.length) {
        alert("No prospects in the current list.");
        return;
      }
      btn.disabled = true;
      showPipelineProgressBar(`Browserbase: LinkedIn enrichment (${ids.length} prospects)…`);
      try {
        const out = await api.browserbaseLinkedInEnrich(sid, ids);
        hidePipelineProgressBar();
        const ok = (out.saved || []).filter((x) => x.ok).length;
        const skipped = (out.saved || []).filter((x) => x.skipped).length;
        const errs = (out.errors || []).length;
        const needLogin = (out.saved || []).filter((x) => x.needs_login).length;
        alert(
          `LinkedIn enrich finished: ${ok} updated, ${skipped} skipped, ${errs} scrape errors` +
            (needLogin ? `, ${needLogin} need LinkedIn sign-in (open session + debugger).` : ".") +
            " Check Dashboard activity for a log line.",
        );
        prospects = await api.fetchProspects({ visibility: showHidden ? "all" : "default" });
        document.getElementById("prospect-count").textContent = `(${prospects.length})`;
        applyFilters(document.getElementById("search").value.toLowerCase());
      } catch (e) {
        hidePipelineProgressBar();
        alert(e.message || String(e));
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("btn-add")?.addEventListener("click", showNewProspectForm);
    document.getElementById("btn-csv")?.addEventListener("click", showCsvImport);
    bindRows();
  } catch (err) {
    if (gen !== prospectsRenderGeneration || !isProspectsRoute()) return;
    main().innerHTML = `<div class="error">Failed to load prospects: ${esc(err.message)}<br>Is the API running? <code>npm run dev:api</code></div>`;
  }
}

function prospectTable(prospects) {
  return `<table><thead><tr><th>Name</th><th>Company</th><th>Role</th><th>Email</th><th>Phone</th><th>Location</th><th>Website</th><th>Status</th><th>Quality</th><th>ICP</th></tr></thead>
    <tbody>${prospects.map(p => `<tr class="clickable-row" data-id="${p.id}">
      <td>${verifiedIcon(p.verification)} ${esc(p.first_name || "")} ${esc(p.last_name || "")}</td>
      <td>${esc(p.company_name || "")}</td><td>${esc(p.executive_role || p.role || "")}</td>
      <td class="mono">${esc(p.email || "")}</td>
      <td class="mono">${esc(p.phone_number || p.phone || "")}</td>
      <td>${FLAGS[p.country] || ""} ${p.country || ""} ${p.city_or_region ? `<span class="text-muted">· ${esc(p.city_or_region)}</span>` : ""}</td>
      <td>${p.deployment_url ? linkOrDash(p.deployment_url, "MVP") : linkOrDash(p.company_website, p.company_website)}</td>
      <td>${badge(p.status || p.outreach_status || "discovered")}</td>
      <td>${qualityBadge(p.quality_score)}</td>
      <td>${icpBadge(p.icp_score)}</td>
    </tr>`).join("")}</tbody></table>`;
}

function bindRows() {
  document.querySelectorAll(".clickable-row").forEach(r => r.addEventListener("click", () => openProspectModal(r.dataset.id)));
}

// ---- PROSPECT MODAL ----
async function openProspectModal(id) {
  const overlay = document.getElementById("modal-overlay");
  const modal = document.getElementById("prospect-modal");
  overlay.classList.remove("hidden"); modal.classList.remove("hidden");
  modal.innerHTML = `<div class="loading">Loading...</div>`;

  try {
    const p = await api.fetchProspect(id);
    const tabs = ["info", "audit", "email", "whatsapp", "linkedin", "voice", "timeline"];

    modal.innerHTML = `
      <div class="modal-header"><div><h2>${esc(p.first_name)} ${esc(p.last_name)}</h2><span class="text-muted">${esc(p.executive_role || p.role || "")} at ${esc(p.company_name || "")}</span></div>
        <button class="modal-close" onclick="window.__closeModal()">&times;</button></div>
      <div class="modal-tabs">${tabs.map((t, i) => `<button class="tab ${i === 0 ? "active" : ""}" data-tab="${t}">${t === "voice" ? "Voice" : t.charAt(0).toUpperCase() + t.slice(1)}</button>`).join("")}</div>
      <div id="modal-body"></div>`;

    function showTab(tab) {
      const body = document.getElementById("modal-body");
      if (tab === "info") {
        body.innerHTML = `<div class="modal-enrich-panel" id="modal-bb-enrich-panel">
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
            <button type="button" class="btn btn-sm" id="modal-btn-bb-enrich">Enrich from LinkedIn</button>
            <button type="button" class="btn btn-sm" id="modal-btn-web-enrich">Enrich from Websearch</button>
            <span class="text-muted" style="font-size:0.75rem">LinkedIn uses Browserbase session reuse; Websearch runs grounded website/search enrichment.</span>
          </div>
          <div id="modal-bb-progress-wrap" class="modal-bb-progress-wrap hidden">
            <div id="modal-bb-progress-label" class="modal-bb-progress-label"></div>
            <div class="modal-bb-progress-track"><div id="modal-bb-progress-bar" class="modal-bb-progress-bar"></div></div>
          </div>
          <div id="modal-bb-login-hint" class="modal-bb-login-hint hidden"></div>
        </div>
        <div class="detail-grid">
          ${dRow("Name", `${esc(p.first_name)} ${esc(p.last_name)}`)}
          ${dRow("Company", esc(p.company_name))}${dRow("Role", esc(p.executive_role || p.role))}
          ${dRow("Email", linkOrDash(p.email ? `mailto:${p.email}` : null, p.email))}
          ${dRow("Phone", esc(p.phone_number || p.phone))}
          ${dRow("LinkedIn", linkOrDash(p.linkedin_url, p.linkedin_url))}
          ${dRow("Country", `${FLAGS[p.country] || ""} ${p.country || ""}`)}${dRow("City", esc(p.city_or_region || p.city))}
          ${dRow("Website", linkOrDash(p.company_website, p.company_website))}
          ${dRow("Deployed MVP", p.deployment_url ? `<a href="${p.deployment_url}" target="_blank" class="btn btn-xs">${esc(p.deployment_url)}</a>` : "Not deployed yet")}
          ${dRow("Industry", esc(p.industry))}${dRow("Size", p.company_size_estimate || p.company_size ? `~${p.company_size_estimate || p.company_size} employees` : "\u2014")}
          ${dRow("Status", badge(p.status || p.outreach_status))}${dRow("ICP", icpBadge(p.icp_score))}
          ${dRow("List visibility", p.display_eligible === false ? badge("hidden") : badge("visible"))}
          ${dRow("Enrichment", esc(p.enrichment_status || "—"))}
          ${(() => {
            const bb = p.enrichment_details?.browserbase_linkedin;
            if (!bb?.last_run_at && bb?.last_ok == null) return "";
            const when = bb.last_run_at ? `${timeAgo(bb.last_run_at)} · ${esc(bb.last_run_at)}` : "—";
            const st = bb.last_ok === true ? "success" : bb.last_ok === false ? "incomplete" : "—";
            const ex = bb.last_detail?.excerpt_chars != null ? ` · ${bb.last_detail.excerpt_chars} chars scraped` : "";
            return dRow("Last LinkedIn (Browserbase)", `${when} · ${st}${ex}`);
          })()}
          ${dRow("Notes", esc(p.notes))}
        </div>`;
        document.getElementById("modal-btn-bb-enrich")?.addEventListener("click", () => {
          startModalBrowserbaseLinkedInEnrich(id, undefined);
        });
        document.getElementById("modal-btn-web-enrich")?.addEventListener("click", () => {
          startModalWebsearchEnrich(id);
        });
      } else if (tab === "audit") {
        const v = p.verification;
        if (!v) {
          body.innerHTML = `<div class="empty">No verification data yet. Run discovery with verification enabled.</div>`;
        } else {
          const checkRow = (label, passed, detail) =>
            `<div class="audit-check ${passed ? "check-pass" : "check-fail"}">
              <span class="check-icon">${passed ? "✓" : "✗"}</span>
              <span class="check-label">${label}</span>
              ${detail ? `<span class="check-detail text-muted">${esc(detail)}</span>` : ""}
            </div>`;
          body.innerHTML = `
            <div class="audit-report">
              <div class="audit-score-header">
                <div class="audit-score-big ${(v.quality_score || 0) >= 70 ? "quality-high" : (v.quality_score || 0) >= 40 ? "quality-med" : "quality-low"}">${v.quality_score ?? "—"}</div>
                <div class="audit-score-label">Quality Score</div>
                <div class="audit-verified-at text-muted">${v.verified_at ? `Verified ${timeAgo(v.verified_at)}` : ""}</div>
              </div>
              <div class="audit-checks">
                <h3>Verification Checks</h3>
                ${checkRow("Website is live", v.website_live, v.website_live ? `HTTP ${v.website_http_status}` : v.website_description || "Not reachable")}
                ${v.website_title ? checkRow("Website title", true, v.website_title) : ""}
                ${checkRow("Company found in web search", v.company_found_in_search, v.company_search_snippet || (v.company_search_url ? v.company_search_url : "Not found"))}
                ${checkRow("Contacts extracted from website", v.contacts_from_website, v.contacts_from_website ? `${(v.extracted_emails || []).length} emails, ${(v.extracted_phones || []).length} phones` : "None found")}
                ${checkRow("Email format valid", v.email_format_valid, p.email || "No email")}
                ${checkRow("Email domain matches website", v.email_domain_matches_website, "")}
                ${checkRow("Phone format valid", v.phone_format_valid, p.phone_number || "No phone")}
                ${checkRow("Has contact name", !!(p.first_name && p.last_name), p.first_name ? `${p.first_name} ${p.last_name}` : "Missing")}
                ${checkRow("Has role/title", !!p.executive_role, p.executive_role || "Missing")}
                ${v.linkedin_audit && v.linkedin_audit.status !== "no_url" ? checkRow(
                  "LinkedIn person affiliation",
                  v.linkedin_audit.status === "verified",
                  v.linkedin_audit.reason || v.linkedin_audit.status || "",
                ) : ""}
                ${v.linkedin_company_page ? checkRow("Company LinkedIn (page)", true, v.linkedin_company_page) : ""}
              </div>
              ${(v.extracted_emails?.length || v.extracted_phones?.length || Object.keys(v.extracted_social || {}).length) ? `
              <div class="audit-extracted">
                <h3>Extracted Contact Data</h3>
                ${v.extracted_emails?.length ? `<div class="audit-field"><label>Emails from website</label><div class="mono">${v.extracted_emails.map(e => esc(e)).join(", ")}</div></div>` : ""}
                ${v.extracted_phones?.length ? `<div class="audit-field"><label>Phones from website</label><div class="mono">${v.extracted_phones.map(ph => esc(ph)).join(", ")}</div></div>` : ""}
                ${Object.keys(v.extracted_social || {}).length ? `<div class="audit-field"><label>Social links</label><div>${Object.entries(v.extracted_social).map(([k, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(k)}</a>`).join(" · ")}</div></div>` : ""}
              </div>` : ""}
              ${v.enrichment_agent_insights?.summary ? `<div class="audit-insights"><h3>Enrichment agent insights</h3><p class="audit-text">${esc(v.enrichment_agent_insights.summary)}</p>${(v.enrichment_agent_insights.data_risks || []).length ? `<div class="audit-field"><label>Data risks</label><ul>${v.enrichment_agent_insights.data_risks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}${(v.enrichment_agent_insights.recommended_follow_ups || []).length ? `<div class="audit-field"><label>Suggested follow-ups</label><ul>${v.enrichment_agent_insights.recommended_follow_ups.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}</div>` : ""}
              ${v.agent_notes ? `<div class="audit-notes"><h3>Agent Notes</h3><pre class="audit-text">${esc(v.agent_notes)}</pre></div>` : ""}
              ${(p.data_sources || []).length ? `<div class="audit-sources"><h3>Data Sources</h3><div class="source-tags">${p.data_sources.map(s => `<span class="source-tag">${esc(s.replace(/_/g, " "))}</span>`).join("")}</div></div>` : ""}
              ${p.audit_summary ? `<div class="audit-ux"><h3>Website UX Audit</h3><pre class="audit-text">${esc(p.audit_summary)}</pre></div>` : ""}
            </div>`;
        }
      } else if (tab === "timeline") {
        body.innerHTML = `<div class="loading">Loading timeline...</div>`;
        api.fetchProspectTimeline(id).then(events => {
          body.innerHTML = events.length ? events.map(e => `<div class="timeline-item"><span class="text-muted">${timeAgo(e.ts)}</span> ${badge(e.type || "")} ${esc(e.detail || e.event_type || "")}</div>`).join("") : '<div class="empty">No timeline events yet.</div>';
        }).catch(() => { body.innerHTML = '<div class="empty">Could not load timeline.</div>'; });
      } else {
        const ch = tab === "voice" ? "voice_note" : tab;
        const msg = p.outreach?.[ch];
        if (!msg || (!msg.body && !msg.message && !msg.script && !msg.connection_note)) {
          body.innerHTML = `<div class="empty">No ${tab} content yet. Generate outreach via the pipeline.</div>`;
          return;
        }
        const content = ch === "email" ? msg.body : ch === "whatsapp" ? msg.message : ch === "linkedin" ? (msg.inmail || msg.connection_note) : msg.script;
        body.innerHTML = `<div class="msg-status-row">Status: ${badge(msg.status || "pending")}</div>
          ${ch === "email" && msg.subject ? `<div class="msg-field"><label>Subject</label><div>${esc(msg.subject)}</div></div>` : ""}
          <div class="msg-field"><label>${tab === "voice" ? "Script" : "Message"}</label><pre class="msg-body">${esc(content || "")}</pre></div>`;
      }
    }

    showTab("info");
    modal.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
      modal.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active"); showTab(t.dataset.tab);
    }));
  } catch (err) {
    modal.innerHTML = `<div class="error">Failed to load: ${esc(err.message)}</div>`;
  }
  overlay.onclick = () => { overlay.classList.add("hidden"); modal.classList.add("hidden"); };
}
window.__closeModal = () => { document.getElementById("modal-overlay").classList.add("hidden"); document.getElementById("prospect-modal").classList.add("hidden"); };
document.addEventListener("keydown", e => { if (e.key === "Escape") window.__closeModal(); });

// ---- NEW PROSPECT FORM ----
function showNewProspectForm() {
  const modal = document.getElementById("prospect-modal");
  const overlay = document.getElementById("modal-overlay");
  overlay.classList.remove("hidden"); modal.classList.remove("hidden");
  modal.innerHTML = `<div class="modal-header"><h2>New Prospect</h2><button class="modal-close" onclick="window.__closeModal()">&times;</button></div>
    <form id="new-prospect-form" class="form-grid">
      ${formField("first_name", "First Name")}${formField("last_name", "Last Name")}${formField("company_name", "Company")}
      ${formField("executive_role", "Role")}${formField("email", "Email")}${formField("phone_number", "Phone")}
      ${formField("company_website", "Website")}${formField("linkedin_url", "LinkedIn URL")}
      ${formField("country", "Country (US/GB/AE)")}${formField("city_or_region", "City")}
      ${formField("industry", "Industry")}${formField("company_size_estimate", "Company Size")}
      <div class="form-actions"><button type="submit" class="btn">Create Prospect</button></div>
    </form>`;
  document.getElementById("new-prospect-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    try {
      await api.createProspect(data);
      window.__closeModal();
      route();
    } catch (err) { alert(err.message); }
  });
}

function showCsvImport() {
  const modal = document.getElementById("prospect-modal");
  const overlay = document.getElementById("modal-overlay");
  overlay.classList.remove("hidden"); modal.classList.remove("hidden");
  modal.innerHTML = `<div class="modal-header"><h2>Import CSV</h2><button class="modal-close" onclick="window.__closeModal()">&times;</button></div>
    <p class="text-muted" style="margin-bottom:1rem">Paste CSV with headers: first_name, last_name, company_name, email, country, etc.</p>
    <textarea id="csv-input" class="textarea" rows="10" placeholder="first_name,last_name,company_name,email,country\nJohn,Doe,Acme Corp,john@acme.com,US"></textarea>
    <button class="btn" id="csv-submit" style="margin-top:0.75rem">Import</button>`;
  document.getElementById("csv-submit").addEventListener("click", async () => {
    const text = document.getElementById("csv-input").value;
    const lines = text.trim().split("\n");
    if (lines.length < 2) { alert("Need headers + at least 1 row"); return; }
    const headers = lines[0].split(",").map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(","); const obj = {};
      headers.forEach((h, i) => { if (vals[i]) obj[h] = vals[i].trim(); });
      return obj;
    });
    try {
      const result = await api.importProspects(rows);
      alert(`Imported ${result.imported} prospects`);
      window.__closeModal(); route();
    } catch (err) { alert(err.message); }
  });
}

// ---- OUTREACH ----
async function renderOutreach() {
  main().innerHTML = `<div class="loading">Loading outreach...</div>`;
  try {
    const prospects = await api.fetchProspects({ visibility: "all" });
    const channels = ["email", "whatsapp", "linkedin", "voice_note"];
    const chLabels = { email: "Email", whatsapp: "WhatsApp", linkedin: "LinkedIn", voice_note: "Voice Notes" };

    main().innerHTML = `<div class="view-header"><h1>Outreach</h1></div>
      <div class="outreach-tabs">${channels.map((ch, i) => {
        const count = prospects.filter(p => p.outreach?.[ch] && p.outreach[ch].status !== "pending").length;
        return `<button class="tab ${i === 0 ? "active" : ""}" data-ch="${ch}">${chLabels[ch]} <span class="tab-count">${count}</span></button>`;
      }).join("")}</div>
      <div id="outreach-content"></div>`;

    function showCh(ch) {
      const items = prospects.filter(p => p.outreach?.[ch]).map(p => ({ p, m: p.outreach[ch] }));
      const el = document.getElementById("outreach-content");
      el.innerHTML = items.filter(x => x.m.body || x.m.message || x.m.script || x.m.connection_note).map(({ p, m }) => {
        const content = ch === "email" ? m.body : ch === "whatsapp" ? m.message : ch === "linkedin" ? (m.inmail || m.connection_note) : m.script;
        if (!content) return "";
        return `<div class="card outreach-item"><div class="outreach-item-header">
          <div><strong>${esc(p.first_name)} ${esc(p.last_name)}</strong> <span class="text-muted">\u2014 ${esc(p.company_name)}</span>
          ${ch === "email" && m.subject ? `<div class="outreach-subject">${esc(m.subject)}</div>` : ""}</div>
          ${badge(m.status || "pending")}</div>
          <pre class="outreach-body">${esc(content)}</pre>
          <div class="outreach-item-footer"><button class="btn btn-xs" onclick="window.__openP('${p.id}')">View Prospect</button></div>
        </div>`;
      }).join("") || '<div class="empty">No messages in this channel yet.</div>';
    }

    showCh("email");
    document.querySelectorAll(".outreach-tabs .tab").forEach(t => t.addEventListener("click", () => {
      document.querySelectorAll(".outreach-tabs .tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active"); showCh(t.dataset.ch);
    }));
  } catch (err) {
    main().innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}
window.__openP = (id) => openProspectModal(id);

// ---- TOOLS ----
async function renderTools() {
  main().innerHTML = `<div class="loading">Loading tools...</div>`;
  try {
    const status = await api.fetchToolsStatus();
    const groups = [
      { name: "explorium", label: "Explorium MCP", tools: ["autocomplete","fetch_businesses","match_business","enrich_business","fetch_prospects","enrich_prospects","fetch_businesses_statistics"] },
      { name: "stitch", label: "Stitch MCP", tools: ["build_site","get_screen_code","get_screen_image"] },
      { name: "vercel", label: "Vercel API", tools: ["deploy_to_vercel","list_projects","get_deployment","get_deployment_build_logs","web_fetch_vercel_url"] },
      { name: "screenshot", label: "Screenshot MCP", tools: ["take_screenshot","take_system_screenshot"] },
      { name: "outreach", label: "Outreach", tools: ["send_email","queue_whatsapp_message","queue_linkedin_message","generate_voice_note_script"] },
      { name: "tracking", label: "Tracking", tools: ["log_outreach_event","check_suppression"] },
      { name: "calendly", label: "Calendly", tools: ["list_calendly_bookings"] },
      { name: "browserbase", label: "Browserbase", tools: ["linkedin_session (API)", "linkedin_enrich (API)"] },
    ];

    main().innerHTML = `<div class="view-header"><h1>Tools</h1><span class="text-muted">${groups.reduce((s, g) => s + g.tools.length, 0)} tools across ${groups.length} integrations</span></div>
      ${groups.map(g => {
        const s = status[g.name === "outreach" ? "ses" : g.name] || {};
        const bbHelp =
          g.name === "browserbase" && s.note
            ? `<p class="text-muted" style="font-size:0.78rem;margin:0;padding:0 1rem 1rem;line-height:1.45">${esc(s.note)}</p>`
            : "";
        return `<div class="card"><div class="card-header"><h2><span class="tool-dot ${g.name}"></span> ${g.label}</h2>${badge(s.status || "unknown")}</div>
          <div class="tools-list">${g.tools.map(t => `<div class="tool-row"><span class="tool-name">${t}</span></div>`).join("")}</div>${bbHelp}</div>`;
      }).join("")}`;
  } catch (err) {
    main().innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

// ---- BOOKINGS ----
async function renderBookings() {
  main().innerHTML = `<div class="loading">Loading bookings...</div>`;
  try {
    const bookings = await api.fetchBookings();
    main().innerHTML = `<div class="view-header"><h1>Bookings <small class="text-muted">(${bookings.length})</small></h1></div>
      ${bookings.length ? `<div class="card"><table><thead><tr><th>Name</th><th>Email</th><th>Event</th><th>Scheduled</th><th>Status</th></tr></thead>
        <tbody>${bookings.map(b => `<tr><td>${esc(b.invitee_name || "")}</td><td>${esc(b.invitee_email || "")}</td>
          <td>${esc(b.event_type || "")}</td><td>${b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "\u2014"}</td>
          <td>${badge(b.status || "booked")}</td></tr>`).join("")}</tbody></table></div>`
        : '<div class="card empty">No bookings yet. Bookings will appear here when prospects book via Calendly.</div>'}`;
  } catch (err) {
    main().innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

// ---- SETTINGS ----
async function probeEndpoint(path, isSse) {
  const ctrl = new AbortController();
  const ms = isSse ? 1500 : 6000;
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(api.apiUrl(path), { method: "GET", signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    clearTimeout(t);
    return false;
  }
}

async function renderSettings() {
  main().innerHTML = `<div class="loading">Loading settings...</div>`;
  try {
    const data = await api.fetchSettings();
    const endpoints = data.endpoints || [];
    const probeResults = await Promise.all(
      endpoints.map(async (e) => {
        const isSse = (e.path || "").includes("/events");
        const live = await probeEndpoint(e.path, isSse);
        return { ...e, live };
      }),
    );

    main().innerHTML = `
      <div class="view-header"><h1>Settings</h1>
        <span class="text-muted">Connectors &amp; API · ${data.deployment?.publicApiUrl ? `Production API <code>${esc(data.deployment.publicApiUrl)}</code>` : `Local ports API ${data.ports.api} / Web ${data.ports.web}`}</span></div>

      <div class="two-col">
        <div class="card"><div class="card-header"><h2>Ports</h2></div>
          <div class="detail-grid">
            ${dRow("API (Express)", String(data.ports.api))}
            ${dRow("Web (Vite dev)", String(data.ports.web))}
          </div>
        </div>
        <div class="card"><div class="card-header"><h2>AWS</h2></div>
          <div class="detail-grid">
            ${dRow("Profile", esc(data.aws?.profile))}
            ${dRow("Region", esc(data.aws?.region))}
            ${dRow("DynamoDB", esc(data.aws?.dynamoTable))}
            ${dRow("S3", esc(data.aws?.s3Bucket))}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:1rem"><div class="card-header"><h2>Outreach defaults</h2></div>
        <div class="detail-grid">
          ${dRow("Sender email (SES)", esc(data.outreach?.senderEmail))}
          ${dRow("Calendly link", data.outreach?.calendlyLink ? `<a href="${esc(data.outreach.calendlyLink)}" target="_blank" rel="noopener">${esc(data.outreach.calendlyLink)}</a>` : "\u2014")}
        </div>
      </div>

      <div class="card" style="margin-top:1rem"><div class="card-header"><h2>Connectors</h2>
        <span class="text-muted">Keys are masked. Use Test to run a live smoke check.</span></div>
        <div class="table-wrap"><table><thead><tr><th>Connector</th><th>Status</th><th>Key / info</th><th></th></tr></thead><tbody>
          ${(data.connectors || []).map((c) => `
            <tr>
              <td><strong>${esc(c.label || c.id)}</strong><div class="text-muted mono" style="font-size:0.8rem">${esc(c.id)}</div></td>
              <td>${c.configured ? badge("configured") : badge("not_configured")}</td>
              <td class="mono" style="font-size:0.85rem">
                ${c.keyMasked ? esc(c.keyMasked) : (c.id === "aws" ? `table: ${esc(c.dynamoTable)}` : "\u2014")}
                ${c.model ? `<div class="text-muted">${esc(c.model)}</div>` : ""}
                ${c.endpoint ? `<div class="text-muted">${esc(c.endpoint)}</div>` : ""}
                ${c.region && c.id !== "aws" ? `<div class="text-muted">${esc(c.region)}</div>` : ""}
                ${c.hasAccessToken === false && c.id === "calendly" ? `<div class="text-muted">No access token (optional for API test)</div>` : ""}
                ${c.hasAccessToken ? `<div class="text-muted">Access token: ${esc(c.accessTokenMasked || "set")}</div>` : ""}
              </td>
              <td><button type="button" class="btn btn-sm btn-test-connector" data-connector="${esc(c.id)}">Test</button>
                <span class="test-result" data-result="${esc(c.id)}"></span></td>
            </tr>`).join("")}
        </tbody></table></div>
      </div>

      <div class="card" style="margin-top:1rem"><div class="card-header"><h2>API endpoints</h2>
        <span class="text-muted">Green = reachable from this browser (via Vite proxy)</span></div>
        <div class="table-wrap"><table><thead><tr><th></th><th>Method</th><th>Path</th><th>Note</th></tr></thead><tbody>
          ${probeResults.map((e) => `
            <tr>
              <td><span class="dot ${e.live ? "dot-green" : "dot-red"}"></span></td>
              <td>${esc(e.method)}</td>
              <td class="mono">${esc(e.path)}</td>
              <td class="text-muted">${esc(e.note || "")}</td>
            </tr>`).join("")}
        </tbody></table></div>
      </div>`;

    main().querySelectorAll(".btn-test-connector").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-connector");
        const slot = main().querySelector(`[data-result="${id}"]`);
        if (slot) slot.textContent = " …";
        btn.disabled = true;
        try {
          const r = await api.testConnector(id);
          const ok = r.ok === true;
          if (slot) slot.innerHTML = ok ? ` <span class="badge badge-completed">OK</span> ${esc(r.detail || "")}` : ` <span class="badge badge-failed">Fail</span> ${esc(r.error || r.detail || "")}`;
        } catch (err) {
          if (slot) slot.innerHTML = ` <span class="badge badge-failed">Error</span> ${esc(err.message)}`;
        }
        btn.disabled = false;
      });
    });
  } catch (err) {
    main().innerHTML = `<div class="error">Failed to load settings: ${esc(err.message)}<br>Ensure API is on port 9002 (<code>npm run dev:api</code>).</div>`;
  }
}

// ---- PIPELINE RUNS ----
async function renderRuns() {
  main().innerHTML = `<div class="loading">Loading runs...</div>`;
  try {
    const runs = await api.fetchPipelineRuns();
    main().innerHTML = `<div class="view-header"><h1>Pipeline Runs <small class="text-muted" id="runs-count">(${runs.length})</small></h1></div>
      <div id="runs-body">${runs.length ? `<div class="card"><table><thead><tr><th>ID</th><th>Mode</th><th>Status</th><th>Processed</th><th>Errors</th><th>Started</th><th>Completed</th></tr></thead>
        <tbody>${runs.map(r => `<tr><td class="mono">${(r.id || "").slice(0, 8)}</td><td>${esc(r.config?.mode || "")}</td>
          <td>${badge(r.status || "unknown")}</td><td>${r.prospects_processed || 0}</td><td>${(r.errors || []).length}</td>
          <td>${r.started_at ? new Date(r.started_at).toLocaleString() : "\u2014"}</td>
          <td>${r.completed_at ? new Date(r.completed_at).toLocaleString() : "\u2014"}</td></tr>`).join("")}</tbody></table></div>`
        : '<div class="card empty">No pipeline runs yet. Click "Run Pipeline" on the dashboard to start.</div>'}</div>`;
  } catch (err) {
    main().innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

// ---- HELPERS ----
function statCard(label, value, sub) { return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`; }
function dRow(l, v) { return `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${v || "\u2014"}</span></div>`; }
function formField(name, label) { return `<div class="form-field"><label>${label}</label><input type="text" name="${name}" class="input" /></div>`; }

function renderPipeline(byStatus) {
  const stages = [
    { key: "discovered", label: "Discovered", color: "var(--accent)" },
    { key: "enriched", label: "Enriched", color: "var(--cyan)" },
    { key: "qualified", label: "Qualified", color: "var(--success)", extra: ["audited_or_researched","design_brief_ready"] },
    { key: "designed", label: "Designed", color: "var(--purple)", extra: ["design_generated","design_reviewed"] },
    { key: "deployed", label: "Deployed", color: "var(--warning)", extra: ["prototype_built","proof_captured"] },
    { key: "sent", label: "Outreach", color: "var(--accent)", extra: ["outreach_ready"] },
    { key: "responded", label: "Responded", color: "var(--success)" },
    { key: "meeting_booked", label: "Booked", color: "var(--success)" },
  ];
  return stages.map(s => {
    const count = (byStatus[s.key] || 0) + (s.extra || []).reduce((sum, k) => sum + (byStatus[k] || 0), 0);
    return `<div class="pipeline-col" onclick="location.hash='#/prospects'" title="${s.label}: ${count}">
      <div class="pipeline-col-count">${count}</div><div class="pipeline-col-label">${s.label}</div>
      <div class="pipeline-col-bar" style="background:${s.color};opacity:${count > 0 ? 0.8 : 0.15}"></div></div>`;
  }).join("");
}

// ---- INIT ----
function showMissingApiConfig() {
  const el = main();
  if (!el) return;
  el.innerHTML = `
    <div class="card" style="max-width:42rem;margin:2rem auto;padding:1.5rem;">
      <h1>API not configured</h1>
      <p>This production build has no backend URL. The app was calling <code>/api/…</code> on the static host, which has no API.</p>
      <p><strong>Fix (pick one):</strong></p>
      <ol>
        <li>Set <code>VITE_API_URL</code> to your Lambda Function URL (no trailing slash), then run <code>npm run build:web</code> and redeploy.</li>
        <li>Or add <code>packages/web/public/api-config.json</code> with <code>{ "apiBase": "https://…lambda-url…on.aws" }</code>, rebuild, redeploy.</li>
        <li>Or set <code>VITE_API_URL</code> in the Vercel project and deploy from Git (see <code>docs/VERCEL.md</code>).</li>
      </ol>
      <p>Ensure the Lambda allows CORS from this origin (or use a Vercel rewrite to proxy <code>/api</code> — see docs).</p>
    </div>`;
}

async function boot() {
  await api.initApiConfig();
  if (import.meta.env.PROD && !api.getApiBase()) {
    showMissingApiConfig();
    return;
  }
  appReady = true;
  window.addEventListener("hashchange", () => {
    if (appReady) route();
  });
  registerRealtime();
  route();
}

boot();
