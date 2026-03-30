/**
 * Merge BROWSERBASE_* into Lambda env without dropping existing variables.
 * Uses @aws-sdk/client-lambda (no aws CLI file:// quirks on Windows).
 *
 * Usage: node scripts/set-lambda-browserbase-env.mjs <functionName> <apiKey> <projectId>
 *
 * Honors AWS_PROFILE / AWS_DEFAULT_REGION (defaults: astro-invest, us-east-1).
 */
import { LambdaClient, GetFunctionConfigurationCommand, UpdateFunctionConfigurationCommand } from "@aws-sdk/client-lambda";

const [, , fn, apiKey, projectId] = process.argv;
if (!fn || !apiKey || !projectId) {
  console.error("Usage: node scripts/set-lambda-browserbase-env.mjs <functionName> <apiKey> <projectId>");
  process.exit(1);
}

const region = process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || "us-east-1";

const client = new LambdaClient({ region });

const get = await client.send(new GetFunctionConfigurationCommand({ FunctionName: fn }));
const variables = { ...(get.Environment?.Variables || {}) };
variables.BROWSERBASE_API_KEY = apiKey;
variables.BROWSERBASE_PROJECT_ID = projectId;

await client.send(
  new UpdateFunctionConfigurationCommand({
    FunctionName: fn,
    Environment: { Variables: variables },
  }),
);

console.log("Updated:", fn);
