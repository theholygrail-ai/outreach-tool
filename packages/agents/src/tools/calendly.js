import { registerTool } from "../orchestrator.js";
import { createLogger } from "@outreach-tool/shared/logger";
import { config } from "@outreach-tool/shared/config";

const log = createLogger("calendly");
const BASE = "https://api.calendly.com";

async function calendlyFetch(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${await res.text()}`);
  return res.json();
}

export const CALENDLY_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "list_calendly_bookings",
      description: "List scheduled events from Calendly.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "canceled"], description: "Filter by status" },
          count: { type: "number", description: "Max events to return" },
        },
      },
    },
  },
];

registerTool("list_calendly_bookings", async (args) => {
  log.info("list_calendly_bookings", args);
  const token = process.env.CALENDLY_ACCESS_TOKEN;
  if (!token) {
    return {
      status: "not_configured",
      note: "CALENDLY_ACCESS_TOKEN not set. OAuth flow required to get a user access token.",
      calendly_link: config.outreach.calendlyLink || "Not configured",
    };
  }
  try {
    const me = await calendlyFetch("/users/me", token);
    const org = me.resource.current_organization;
    const params = new URLSearchParams({ organization: org, status: args.status || "active" });
    if (args.count) params.set("count", args.count);
    const events = await calendlyFetch(`/scheduled_events?${params}`, token);
    return { events: events.collection || [], count: events.collection?.length || 0 };
  } catch (err) {
    log.error("list_calendly_bookings failed", { error: err.message });
    return { error: err.message };
  }
});
