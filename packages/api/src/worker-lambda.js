/**
 * AWS Lambda — runs pipeline-worker logic (async invoke from API Lambda).
 */
import { executePipelineRun } from "./pipeline-worker.js";

export const handler = async (event) => {
  const payload = typeof event === "string" ? JSON.parse(event) : event;
  const run = payload.run || payload;
  if (!run?.id) {
    return { ok: false, error: "Missing run payload" };
  }
  await executePipelineRun(run);
  return { ok: true, run_id: run.id };
};
