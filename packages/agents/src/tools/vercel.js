import { registerTool } from "../orchestrator.js";
import { createLogger } from "@outreach-tool/shared/logger";
import { config } from "@outreach-tool/shared/config";

const log = createLogger("vercel");
const BASE = "https://api.vercel.com";

function vercelHeaders() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN || ""}`,
    "Content-Type": "application/json",
  };
}

async function vercelFetch(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...opts, headers: { ...vercelHeaders(), ...opts.headers } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export const VERCEL_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "deploy_to_vercel",
      description: "Deploy files to Vercel. Provide project name and files array.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string" },
          files: {
            type: "array",
            items: {
              type: "object",
              properties: { file: { type: "string" }, data: { type: "string" } },
            },
          },
        },
        required: ["project_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_projects",
      description: "List all Vercel projects.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deployment",
      description: "Get deployment status by ID or URL.",
      parameters: {
        type: "object",
        properties: { idOrUrl: { type: "string" } },
        required: ["idOrUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deployment_build_logs",
      description: "Get build logs for a deployment.",
      parameters: {
        type: "object",
        properties: { deploymentId: { type: "string" } },
        required: ["deploymentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch_vercel_url",
      description: "Fetch a deployed Vercel URL to verify it's live.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
];

registerTool("deploy_to_vercel", async (args) => {
  log.info("deploy_to_vercel", args);
  if (!process.env.VERCEL_TOKEN) return { error: "VERCEL_TOKEN not configured" };
  try {
    const payload = { name: args.project_name, files: args.files || [], projectSettings: { framework: null } };
    const result = await vercelFetch("/v13/deployments", { method: "POST", body: JSON.stringify(payload) });
    log.info("Deployed", { url: result.url, id: result.id });
    return { url: `https://${result.url}`, id: result.id, readyState: result.readyState };
  } catch (err) {
    return { error: err.message };
  }
});

registerTool("list_projects", async () => {
  log.info("list_projects");
  if (!process.env.VERCEL_TOKEN) return { error: "VERCEL_TOKEN not configured" };
  try {
    const result = await vercelFetch("/v9/projects");
    return { projects: result.projects?.map(p => ({ id: p.id, name: p.name, url: p.targets?.production?.url })) || [] };
  } catch (err) {
    return { error: err.message };
  }
});

registerTool("get_deployment", async (args) => {
  log.info("get_deployment", args);
  if (!process.env.VERCEL_TOKEN) return { error: "VERCEL_TOKEN not configured" };
  try {
    const result = await vercelFetch(`/v13/deployments/${encodeURIComponent(args.idOrUrl)}`);
    return { id: result.id, url: result.url, readyState: result.readyState, createdAt: result.createdAt };
  } catch (err) {
    return { error: err.message };
  }
});

registerTool("get_deployment_build_logs", async (args) => {
  log.info("get_deployment_build_logs", args);
  if (!process.env.VERCEL_TOKEN) return { error: "VERCEL_TOKEN not configured" };
  try {
    const result = await vercelFetch(`/v2/deployments/${args.deploymentId}/events`);
    return { logs: result.slice(0, 50) };
  } catch (err) {
    return { error: err.message };
  }
});

registerTool("web_fetch_vercel_url", async (args) => {
  log.info("web_fetch_vercel_url", args);
  try {
    const res = await fetch(args.url, { redirect: "follow" });
    const text = await res.text();
    return { status: res.status, ok: res.ok, title: text.match(/<title>(.*?)<\/title>/)?.[1] || "", bodyLength: text.length };
  } catch (err) {
    return { error: err.message, url: args.url };
  }
});
