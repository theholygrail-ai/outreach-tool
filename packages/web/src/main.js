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
function linkOrDash(url, label) {
  if (!url) return "\u2014";
  const href = url.startsWith("http") ? url : `https://${url}`;
  return `<a href="${href}" target="_blank" rel="noopener">${esc(label || url)}</a>`;
}

const main = () => document.getElementById("main-content");

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
}
function setActive(v) { document.querySelector(`[data-view="${v}"]`)?.classList.add("active"); }
window.addEventListener("hashchange", route);

// ---- SSE ----
api.subscribeSSE((event, data) => {
  if (["prospect_created","prospect_updated","prospect_deleted","prospects_imported","pipeline_started","pipeline_progress","pipeline_completed","pipeline_failed","booking_created", "poll_refresh"].includes(event)) {
    route(); // re-render current view
  }
});

// ---- DASHBOARD ----
async function renderDashboard() {
  main().innerHTML = `<div class="loading">Loading dashboard...</div>`;
  try {
    const [stats, activity, pStatus] = await Promise.all([
      api.fetchPipelineStats(), api.fetchActivity(10), api.fetchPipelineStatus(),
    ]);
    const byStatus = stats.by_status || {};
    const pipelineRunning = pStatus.status === "running";

    main().innerHTML = `
      <div class="view-header"><h1>Dashboard</h1>
        <div class="view-actions">
          <span class="badge badge-${pipelineRunning ? "running" : "idle"}">${pipelineRunning ? "Pipeline Running" : "Idle"}</span>
          <button class="btn btn-sm" id="btn-discover">Discover Prospects</button>
          <button class="btn btn-sm" id="btn-run">Run Pipeline</button>
        </div>
      </div>
      <div class="stats-row">
        ${statCard("Total", stats.total, "prospects")}
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
              <div class="activity-dot dot-${a.type === "pipeline_started" || a.type === "pipeline_completed" ? "blue" : a.type === "booking" ? "green" : "gray"}"></div>
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

    document.getElementById("btn-discover")?.addEventListener("click", async () => {
      const country = prompt("Country code (US, GB, AE):", "US");
      if (!country) return;
      const btn = document.getElementById("btn-discover");
      btn.textContent = "Discovering..."; btn.disabled = true;
      try {
        const { id: runId } = await api.triggerDiscovery({ country, limit: 10 });
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
  main().innerHTML = `<div class="loading">Loading prospects...</div>`;
  try {
    const prospects = await api.fetchProspects();
    main().innerHTML = `
      <div class="view-header"><h1>Prospects <small class="text-muted">(${prospects.length})</small></h1>
        <div class="view-actions">
          <input type="text" id="search" class="input" placeholder="Search..." />
          <button class="btn btn-sm" id="btn-add">+ New Prospect</button>
          <button class="btn btn-sm" id="btn-csv">Import CSV</button>
        </div>
      </div>
      <div class="card"><div class="table-wrap" id="prospect-table-wrap">${prospectTable(prospects)}</div></div>`;

    document.getElementById("search").addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = prospects.filter(p => `${p.first_name} ${p.last_name} ${p.company_name} ${p.country} ${p.status}`.toLowerCase().includes(q));
      document.getElementById("prospect-table-wrap").innerHTML = prospectTable(filtered);
      bindRows();
    });
    document.getElementById("btn-add")?.addEventListener("click", showNewProspectForm);
    document.getElementById("btn-csv")?.addEventListener("click", showCsvImport);
    bindRows();
  } catch (err) {
    main().innerHTML = `<div class="error">Failed to load prospects: ${esc(err.message)}<br>Is the API running? <code>npm run dev:api</code></div>`;
  }
}

function prospectTable(prospects) {
  return `<table><thead><tr><th>Name</th><th>Company</th><th>Role</th><th>Email</th><th>Phone</th><th>Location</th><th>Website</th><th>Status</th><th>ICP</th></tr></thead>
    <tbody>${prospects.map(p => `<tr class="clickable-row" data-id="${p.id}">
      <td>${esc(p.first_name || "")} ${esc(p.last_name || "")}</td>
      <td>${esc(p.company_name || "")}</td><td>${esc(p.executive_role || p.role || "")}</td>
      <td class="mono">${esc(p.email || "")}</td>
      <td class="mono">${esc(p.phone_number || p.phone || "")}</td>
      <td>${FLAGS[p.country] || ""} ${p.country || ""} ${p.city_or_region ? `<span class="text-muted">· ${esc(p.city_or_region)}</span>` : ""}</td>
      <td>${p.deployment_url ? linkOrDash(p.deployment_url, "MVP") : linkOrDash(p.company_website, p.company_website)}</td>
      <td>${badge(p.status || p.outreach_status || "discovered")}</td>
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
        body.innerHTML = `<div class="detail-grid">
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
          ${dRow("Notes", esc(p.notes))}
        </div>`;
      } else if (tab === "audit") {
        body.innerHTML = `<div class="audit-section"><h3>Website: ${linkOrDash(p.company_website, p.company_website)} ${badge(p.website_status || "unknown")}</h3>
          ${p.audit_summary ? `<pre class="audit-text">${esc(p.audit_summary)}</pre>` : '<div class="empty">No audit yet. Process this prospect through the pipeline.</div>'}</div>`;
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
    const prospects = await api.fetchProspects();
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
    ];

    main().innerHTML = `<div class="view-header"><h1>Tools</h1><span class="text-muted">${groups.reduce((s, g) => s + g.tools.length, 0)} tools across ${groups.length} integrations</span></div>
      ${groups.map(g => {
        const s = status[g.name === "outreach" ? "ses" : g.name] || {};
        return `<div class="card"><div class="card-header"><h2><span class="tool-dot ${g.name}"></span> ${g.label}</h2>${badge(s.status || "unknown")}</div>
          <div class="tools-list">${g.tools.map(t => `<div class="tool-row"><span class="tool-name">${t}</span></div>`).join("")}</div></div>`;
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
    main().innerHTML = `<div class="view-header"><h1>Pipeline Runs <small class="text-muted">(${runs.length})</small></h1></div>
      ${runs.length ? `<div class="card"><table><thead><tr><th>ID</th><th>Mode</th><th>Status</th><th>Processed</th><th>Errors</th><th>Started</th><th>Completed</th></tr></thead>
        <tbody>${runs.map(r => `<tr><td class="mono">${(r.id || "").slice(0, 8)}</td><td>${esc(r.config?.mode || "")}</td>
          <td>${badge(r.status || "unknown")}</td><td>${r.prospects_processed || 0}</td><td>${(r.errors || []).length}</td>
          <td>${r.started_at ? new Date(r.started_at).toLocaleString() : "\u2014"}</td>
          <td>${r.completed_at ? new Date(r.completed_at).toLocaleString() : "\u2014"}</td></tr>`).join("")}</tbody></table></div>`
        : '<div class="card empty">No pipeline runs yet. Click "Run Pipeline" on the dashboard to start.</div>'}`;
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
route();
