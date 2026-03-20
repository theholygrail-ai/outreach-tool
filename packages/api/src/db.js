import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "@outreach-tool/shared/config";

const client = new DynamoDBClient({ region: config.aws.region });
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = config.aws.dynamoTable;

/** Quick connectivity check for settings / health probes */
export async function pingDynamo() {
  await client.send(new DescribeTableCommand({ TableName: TABLE }));
  return { ok: true, table: TABLE };
}

export async function putItem(item) {
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function getItem(pk, sk) {
  const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: pk, SK: sk } }));
  return res.Item || null;
}

export async function queryItems(pk, skPrefix) {
  const params = {
    TableName: TABLE,
    KeyConditionExpression: skPrefix
      ? "PK = :pk AND begins_with(SK, :sk)"
      : "PK = :pk",
    ExpressionAttributeValues: { ":pk": pk, ...(skPrefix ? { ":sk": skPrefix } : {}) },
  };
  const res = await ddb.send(new QueryCommand(params));
  return res.Items || [];
}

export async function queryByGSI(gsi1pk, gsi1skPrefix) {
  const params = {
    TableName: TABLE,
    IndexName: "GSI1",
    KeyConditionExpression: gsi1skPrefix
      ? "GSI1PK = :pk AND begins_with(GSI1SK, :sk)"
      : "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": gsi1pk, ...(gsi1skPrefix ? { ":sk": gsi1skPrefix } : {}) },
  };
  const res = await ddb.send(new QueryCommand(params));
  return res.Items || [];
}

export async function deleteItem(pk, sk) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: pk, SK: sk } }));
}

export async function scanAll(filterExpression, expressionValues) {
  const params = { TableName: TABLE };
  if (filterExpression) {
    params.FilterExpression = filterExpression;
    params.ExpressionAttributeValues = expressionValues;
  }
  const res = await ddb.send(new ScanCommand(params));
  return res.Items || [];
}

// --- Prospect CRUD ---

export async function saveProspect(prospect) {
  const status = prospect.status || prospect.outreach_status || "discovered";
  prospect.status = status;
  prospect.outreach_status = status;
  const item = {
    PK: `PROSPECT#${prospect.id}`,
    SK: "PROFILE",
    GSI1PK: `STATUS#${status}`,
    GSI1SK: `PROSPECT#${prospect.id}`,
    ...prospect,
  };
  await putItem(item);
  return prospect;
}

export async function getProspect(id) {
  const item = await getItem(`PROSPECT#${id}`, "PROFILE");
  return item ? stripKeys(item) : null;
}

export async function listProspects() {
  const items = await scanAll("begins_with(PK, :prefix) AND SK = :sk", {
    ":prefix": "PROSPECT#",
    ":sk": "PROFILE",
  });
  return items.map(stripKeys).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export async function deleteProspect(id) {
  await deleteItem(`PROSPECT#${id}`, "PROFILE");
  const events = await queryItems(`PROSPECT#${id}`, "EVENT#");
  for (const e of events) await deleteItem(e.PK, e.SK);
}

// --- Activity / Events ---

export async function logActivity(entry) {
  const ts = Date.now();
  const item = {
    PK: "ACTIVITY",
    SK: `EVENT#${ts}#${Math.random().toString(36).slice(2, 8)}`,
    GSI1PK: "ACTIVITY",
    GSI1SK: `${ts}`,
    ...entry,
    ts,
  };
  await putItem(item);
  return item;
}

export async function listActivity(limit = 50) {
  const items = await queryItems("ACTIVITY", "EVENT#");
  return items.sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, limit);
}

// --- Prospect Events (timeline) ---

export async function logProspectEvent(prospectId, event) {
  const ts = Date.now();
  const item = {
    PK: `PROSPECT#${prospectId}`,
    SK: `EVENT#${ts}#${event.type || "unknown"}`,
    ...event,
    ts,
  };
  await putItem(item);
  return item;
}

export async function listProspectEvents(prospectId) {
  return queryItems(`PROSPECT#${prospectId}`, "EVENT#");
}

// --- Bookings ---

export async function saveBooking(booking) {
  const item = {
    PK: `BOOKING#${booking.id}`,
    SK: "DETAIL",
    GSI1PK: booking.prospect_id ? `PROSPECT#${booking.prospect_id}` : "BOOKING",
    GSI1SK: `BOOKING#${booking.scheduled_at || Date.now()}`,
    ...booking,
  };
  await putItem(item);
  return booking;
}

export async function listBookings() {
  const items = await scanAll("begins_with(PK, :prefix)", { ":prefix": "BOOKING#" });
  return items.map(stripKeys).sort((a, b) => (b.scheduled_at || "").localeCompare(a.scheduled_at || ""));
}

// --- Pipeline Runs ---

export async function savePipelineRun(run) {
  const item = {
    PK: `RUN#${run.id}`,
    SK: "DETAIL",
    GSI1PK: "RUNS",
    GSI1SK: `${run.started_at || Date.now()}`,
    ...run,
  };
  await putItem(item);
  return run;
}

export async function listPipelineRuns() {
  const items = await queryByGSI("RUNS");
  return items.map(stripKeys).sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""));
}

/** Latest run still marked running (used instead of in-memory state for Lambda / multi-instance). */
export async function getRunningPipelineRun() {
  const items = await queryByGSI("RUNS");
  const runs = items.map(stripKeys).filter((r) => r.status === "running");
  return runs.sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""))[0] || null;
}

export async function getPipelineRun(id) {
  const item = await getItem(`RUN#${id}`, "DETAIL");
  return item ? stripKeys(item) : null;
}

// --- Suppression ---

export async function addSuppression(identifier, reason) {
  await putItem({
    PK: `SUPPRESSION#${identifier}`,
    SK: "DETAIL",
    identifier,
    reason,
    created_at: new Date().toISOString(),
  });
}

export async function checkSuppression(identifier) {
  const item = await getItem(`SUPPRESSION#${identifier}`, "DETAIL");
  return !!item;
}

function stripKeys(item) {
  const { PK, SK, GSI1PK, GSI1SK, ...rest } = item;
  return rest;
}
