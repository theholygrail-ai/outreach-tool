import { registerTool } from "../orchestrator.js";
import { createLogger } from "@outreach-tool/shared/logger";
import { config } from "@outreach-tool/shared/config";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { spawn } from "child_process";
import { readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const log = createLogger("screenshot");
const s3 = new S3Client({ region: config.aws.region });

let mcpProcess = null;
let mcpRequestId = 0;
let mcpPending = new Map();

function ensureMcp() {
  if (mcpProcess && !mcpProcess.killed) return;
  log.info("Starting Screenshot MCP...");
  mcpProcess = spawn("npx", ["-y", "universal-screenshot-mcp"], { stdio: ["pipe", "pipe", "pipe"], shell: true });

  let buffer = "";
  mcpProcess.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && mcpPending.has(msg.id)) {
          mcpPending.get(msg.id)(msg);
          mcpPending.delete(msg.id);
        }
      } catch {}
    }
  });

  mcpProcess.on("close", () => { mcpProcess = null; });
}

function callMcp(method, params, timeout = 30000) {
  ensureMcp();
  const id = ++mcpRequestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { mcpPending.delete(id); reject(new Error("Screenshot MCP timeout")); }, timeout);
    mcpPending.set(id, (res) => { clearTimeout(timer); res.error ? reject(new Error(res.error.message)) : resolve(res.result); });
    mcpProcess.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

async function uploadToS3(filePath, key) {
  const body = await readFile(filePath);
  await s3.send(new PutObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
    Body: body,
    ContentType: "image/png",
  }));
  await unlink(filePath).catch(() => {});
  return `s3://${config.aws.s3Bucket}/${key}`;
}

export const SCREENSHOT_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "take_screenshot",
      description: "Capture a web page screenshot via headless Chromium.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          width: { type: "number" },
          height: { type: "number" },
          fullPage: { type: "boolean" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "take_system_screenshot",
      description: "Capture desktop/window/region screenshot.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["fullscreen", "window", "region"] },
          windowName: { type: "string" },
          format: { type: "string", enum: ["png", "jpg"] },
        },
        required: ["mode"],
      },
    },
  },
];

registerTool("take_screenshot", async (args) => {
  log.info("take_screenshot", args);
  const outputPath = join(tmpdir(), `screenshot_${Date.now()}.png`);
  try {
    const result = await callMcp("tools/call", {
      name: "take_screenshot",
      arguments: { ...args, outputPath },
    });

    const s3Key = `screenshots/${Date.now()}_${args.url.replace(/[^a-z0-9]/gi, "_").slice(0, 50)}.png`;
    try {
      const s3Url = await uploadToS3(outputPath, s3Key);
      log.info("Screenshot uploaded to S3", { s3Url });
      return { ...result, s3_key: s3Key, s3_url: s3Url };
    } catch (uploadErr) {
      log.warn("S3 upload failed, returning local path", { error: uploadErr.message });
      return { ...result, local_path: outputPath };
    }
  } catch (err) {
    log.error("take_screenshot failed", { error: err.message });
    return { error: err.message };
  }
});

registerTool("take_system_screenshot", async (args) => {
  log.info("take_system_screenshot", args);
  try {
    const result = await callMcp("tools/call", { name: "take_system_screenshot", arguments: args });
    return result;
  } catch (err) {
    return { error: err.message };
  }
});
