#!/usr/bin/env node
/**
 * Validates BASE_URL then runs the same checks as api-smoke.mjs.
 * Enterprise / operator confidence: fail fast on bad URL shape before hitting AWS.
 *
 * Usage:
 *   BASE_URL=https://xxx.lambda-url.region.on.aws node scripts/verify-deploy.mjs
 */
import { runApiSmokeChecks } from "./lib/smoke-http.mjs";

const raw = (process.env.BASE_URL || "").trim();
if (!raw) {
  console.error("verify-deploy: set BASE_URL to your Lambda Function URL (https, no trailing slash).");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(raw);
} catch {
  console.error("verify-deploy: BASE_URL is not a valid URL.");
  process.exit(1);
}

if (parsed.protocol !== "https:") {
  console.error("verify-deploy: BASE_URL must use https://");
  process.exit(1);
}

const host = parsed.hostname;
if (!host.includes(".") || host.length < 4) {
  console.error("verify-deploy: BASE_URL hostname looks invalid.");
  process.exit(1);
}

console.log(`verify-deploy: checking ${parsed.origin} ...\n`);
const base = raw.replace(/\/+$/, "");
const { ok } = await runApiSmokeChecks(base);
process.exit(ok ? 0 : 1);
