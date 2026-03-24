#!/usr/bin/env node
/**
 * Cross-platform API smoke: GET health, health/ready, prospects, pipeline/status.
 * Usage: BASE_URL=https://xxx.lambda-url.region.on.aws node scripts/api-smoke.mjs
 */
import { runApiSmokeChecks } from "./lib/smoke-http.mjs";

const base = (process.env.BASE_URL || "").trim().replace(/\/+$/, "");
if (!base) {
  console.error("Set BASE_URL to your Lambda Function URL (no trailing slash).");
  process.exit(1);
}

const { ok } = await runApiSmokeChecks(base);
if (!ok) process.exit(1);
