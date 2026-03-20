import { config } from "@outreach-tool/shared/config";
import { createLogger } from "@outreach-tool/shared/logger";

const log = createLogger("mcp-client");

let sessionId = null;
let requestId = 0;

const NAME_MAP = {
  autocomplete: "autocomplete",
  fetch_businesses: "fetch-businesses",
  match_business: "match-business",
  enrich_business: "enrich-business",
  fetch_prospects: "fetch-prospects",
  enrich_prospects: "enrich-prospects",
  fetch_businesses_statistics: "fetch-businesses-statistics",
  fetch_businesses_events: "fetch-businesses-events",
  fetch_prospects_events: "fetch-prospects-events",
  match_prospects: "match-prospects",
};

function headers() {
  const h = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    api_key: config.explorium.apiKey,
  };
  if (sessionId) h["Mcp-Session-Id"] = sessionId;
  return h;
}

async function sendRpc(method, params) {
  const id = ++requestId;
  const body = { jsonrpc: "2.0", id, method, params };

  log.info(`MCP RPC: ${method}`, { id, params: params ? Object.keys(params) : [] });

  const res = await fetch(config.explorium.httpUrl, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const lines = text.split("\n");
    let lastData = null;
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { lastData = JSON.parse(line.slice(6)); } catch {}
      }
    }
    return lastData;
  }

  return res.json();
}

let initialized = false;

export async function initMcp() {
  if (initialized) return;
  const res = await sendRpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "outreach-tool", version: "1.0" },
  });
  log.info("MCP initialized", { serverInfo: res?.result?.serverInfo });

  await sendRpc("notifications/initialized", undefined);
  initialized = true;
}

export async function callTool(toolName, args) {
  await initMcp();
  const mcpName = NAME_MAP[toolName] || toolName;
  log.info(`Calling MCP tool: ${mcpName}`, { args });

  const res = await sendRpc("tools/call", { name: mcpName, arguments: args });

  if (res?.error) {
    log.error(`MCP tool error: ${mcpName}`, { error: res.error });
    throw new Error(`MCP error: ${res.error.message || JSON.stringify(res.error)}`);
  }

  const result = res?.result;
  if (result?.content) {
    const textContent = result.content.find(c => c.type === "text");
    if (textContent) {
      try { return JSON.parse(textContent.text); } catch { return textContent.text; }
    }
    return result.content;
  }

  return result;
}

export async function listTools() {
  await initMcp();
  const res = await sendRpc("tools/list", {});
  return res?.result?.tools || [];
}
