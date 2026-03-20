import { registerTool } from "../orchestrator.js";
import { createLogger } from "@outreach-tool/shared/logger";
import { config } from "@outreach-tool/shared/config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const log = createLogger("tracking");
const client = new DynamoDBClient({ region: config.aws.region });
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = config.aws.dynamoTable;

export const TRACKING_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "log_outreach_event",
      description: "Log an outreach event to the tracking store.",
      parameters: {
        type: "object",
        properties: {
          prospect_id: { type: "string" },
          channel: { type: "string", enum: ["email", "whatsapp", "linkedin", "voice"] },
          event_type: { type: "string", enum: ["sent", "delivered", "opened", "clicked", "replied", "objected", "suppressed", "meeting_booked"] },
          metadata: { type: "object" },
        },
        required: ["prospect_id", "channel", "event_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_suppression",
      description: "Check if a prospect is on the do-not-contact list.",
      parameters: {
        type: "object",
        properties: { prospect_id: { type: "string" }, email: { type: "string" }, phone: { type: "string" } },
      },
    },
  },
];

registerTool("log_outreach_event", async (args) => {
  log.info("log_outreach_event", args);
  try {
    const ts = Date.now();
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `PROSPECT#${args.prospect_id}`,
        SK: `EVENT#${ts}#${args.channel}`,
        type: `outreach_${args.event_type}`,
        channel: args.channel,
        event_type: args.event_type,
        ts,
        ...args.metadata,
      },
    }));
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: "ACTIVITY",
        SK: `EVENT#${ts}#${Math.random().toString(36).slice(2, 6)}`,
        GSI1PK: "ACTIVITY",
        GSI1SK: `${ts}`,
        type: "outreach_event",
        detail: `${args.event_type} on ${args.channel} for prospect ${args.prospect_id}`,
        prospect_id: args.prospect_id,
        ts,
      },
    }));
    return { status: "logged", ...args };
  } catch (err) {
    log.error("log_outreach_event failed", { error: err.message });
    return { error: err.message };
  }
});

registerTool("check_suppression", async (args) => {
  log.info("check_suppression", args);
  try {
    const identifiers = [args.prospect_id, args.email, args.phone].filter(Boolean);
    for (const id of identifiers) {
      const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: `SUPPRESSION#${id}`, SK: "DETAIL" } }));
      if (res.Item) return { suppressed: true, identifier: id };
    }
    return { suppressed: false };
  } catch (err) {
    log.error("check_suppression failed", { error: err.message });
    return { suppressed: false, error: err.message };
  }
});
