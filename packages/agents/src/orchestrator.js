import { groq, MODEL, MAX_TOKENS } from "./groq-client.js";
import { createLogger } from "@outreach-tool/shared/logger";

const log = createLogger("orchestrator");

export const toolRegistry = {};

export function registerTool(name, handler) {
  toolRegistry[name] = handler;
}

let _allToolDefinitions = null;

export function getAllToolDefinitions() {
  if (!_allToolDefinitions) {
    throw new Error("Tools not loaded. Call loadAllTools() first.");
  }
  return _allToolDefinitions;
}

export async function loadAllTools() {
  const [explorium, stitch, vercel, screenshot, outreach, tracking, calendly, braveSearch, firecrawl] =
    await Promise.all([
      import("./tools/explorium.js"),
      import("./tools/stitch.js"),
      import("./tools/vercel.js"),
      import("./tools/screenshot.js"),
      import("./tools/outreach.js"),
      import("./tools/tracking.js"),
      import("./tools/calendly.js"),
      import("./tools/brave-search.js"),
      import("./tools/firecrawl.js"),
    ]);

  _allToolDefinitions = [
    ...explorium.TOOL_DEFINITIONS,
    ...stitch.STITCH_TOOL_DEFINITIONS,
    ...vercel.VERCEL_TOOL_DEFINITIONS,
    ...screenshot.SCREENSHOT_TOOL_DEFINITIONS,
    ...outreach.OUTREACH_TOOL_DEFINITIONS,
    ...tracking.TRACKING_TOOL_DEFINITIONS,
    ...calendly.CALENDLY_TOOL_DEFINITIONS,
    ...braveSearch.BRAVE_SEARCH_TOOL_DEFINITIONS,
    ...firecrawl.FIRECRAWL_TOOL_DEFINITIONS,
  ];

  log.info(`Loaded ${_allToolDefinitions.length} tool definitions, ${Object.keys(toolRegistry).length} handlers registered`);
  return _allToolDefinitions;
}

/**
 * Run a single agent turn: send messages + tools, handle sequential
 * tool calls until the model produces a final text response.
 *
 * openai/gpt-oss-120b does NOT support parallel tool use.
 * Each iteration returns at most one tool_call.
 */
export async function runAgentLoop(messages, tools = null, maxIterations = 20) {
  const allTools = tools || getAllToolDefinitions();
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    log.info(`Agent loop iteration ${iterations}`);

    const response = await groq.chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages,
      tools: allTools.length > 0 ? allTools : undefined,
      tool_choice: allTools.length > 0 ? "auto" : undefined,
    });

    const choice = response.choices[0];
    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      log.info("Agent produced final response");
      return { messages, finalContent: assistantMsg.content };
    }

    for (const toolCall of assistantMsg.tool_calls) {
      const { name, arguments: argsStr } = toolCall.function;
      log.info(`Tool call: ${name}`, { args: argsStr });

      let result;
      try {
        const args = JSON.parse(argsStr);
        result = await executeToolCall(name, args);
      } catch (err) {
        log.error(`Tool call failed: ${name}`, { error: err.message });
        result = JSON.stringify({ error: err.message });
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name,
        content: typeof result === "string" ? result : JSON.stringify(result),
      });
    }
  }

  log.warn("Max iterations reached");
  return { messages, finalContent: null };
}

async function executeToolCall(name, args) {
  const handler = toolRegistry[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return handler(args);
}
