import { registerTool } from "../orchestrator.js";
import { createLogger } from "@outreach-tool/shared/logger";
import { spawn } from "child_process";

const log = createLogger("stitch");

let proxyProcess = null;
let requestId = 0;
let pendingRequests = new Map();

function ensureProxy() {
  if (proxyProcess && !proxyProcess.killed) return;

  log.info("Starting Stitch MCP proxy...");
  proxyProcess = spawn("npx", ["@_davideast/stitch-mcp", "proxy"], {
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });

  let buffer = "";
  proxyProcess.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pendingRequests.has(msg.id)) {
          pendingRequests.get(msg.id)(msg);
          pendingRequests.delete(msg.id);
        }
      } catch {}
    }
  });

  proxyProcess.stderr.on("data", (chunk) => {
    log.warn("Stitch stderr:", { output: chunk.toString().trim() });
  });

  proxyProcess.on("close", (code) => {
    log.warn(`Stitch proxy exited with code ${code}`);
    proxyProcess = null;
  });
}

function sendRpc(method, params, timeout = 60000) {
  ensureProxy();
  const id = ++requestId;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Stitch MCP timeout for ${method}`));
    }, timeout);

    pendingRequests.set(id, (response) => {
      clearTimeout(timer);
      if (response.error) reject(new Error(response.error.message || JSON.stringify(response.error)));
      else resolve(response.result);
    });

    proxyProcess.stdin.write(msg + "\n");
  });
}

export const STITCH_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "build_site",
      description: "Build a site from a Stitch project by mapping screens to routes. Returns design HTML.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          routes: {
            type: "array",
            items: {
              type: "object",
              properties: { screenId: { type: "string" }, route: { type: "string" } },
              required: ["screenId", "route"],
            },
          },
        },
        required: ["projectId", "routes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_screen_code",
      description: "Retrieve HTML code for a Stitch screen.",
      parameters: {
        type: "object",
        properties: { projectId: { type: "string" }, screenId: { type: "string" } },
        required: ["projectId", "screenId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_screen_image",
      description: "Retrieve screenshot of a Stitch screen as base64.",
      parameters: {
        type: "object",
        properties: { projectId: { type: "string" }, screenId: { type: "string" } },
        required: ["projectId", "screenId"],
      },
    },
  },
];

for (const def of STITCH_TOOL_DEFINITIONS) {
  const name = def.function.name;
  registerTool(name, async (args) => {
    log.info(`${name} -> Stitch MCP`, args);
    try {
      const result = await sendRpc("tools/call", { name, arguments: args });
      log.info(`${name} <- response received`);
      return result;
    } catch (err) {
      log.error(`${name} failed`, { error: err.message });
      return { error: err.message, tool: name };
    }
  });
}
