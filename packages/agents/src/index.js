import { validateConfig } from "@outreach-tool/shared/config";
import { createLogger } from "@outreach-tool/shared/logger";
import { runAgentLoop, loadAllTools } from "./orchestrator.js";
import { SYSTEM_PROMPT } from "./prompts/system.js";

const log = createLogger("main");

async function main() {
  validateConfig();
  log.info("Outreach Tool agent starting");

  log.info("Loading tool definitions...");
  await loadAllTools();

  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  const userTask = process.argv[2] || "Find 5 qualified SME prospects in the United States";
  messages.push({ role: "user", content: userTask });

  log.info("Running agent loop", { task: userTask });
  const result = await runAgentLoop(messages);

  if (result.finalContent) {
    log.info("Agent completed");
    console.log("\n--- Agent Response ---\n");
    console.log(result.finalContent);
  } else {
    log.warn("Agent did not produce a final response");
  }
}

main().catch((err) => {
  log.error("Fatal error", { error: err.message });
  process.exit(1);
});
