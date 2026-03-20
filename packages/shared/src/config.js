import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

export const config = {
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    maxTokens: 65536,
    contextWindow: 131072,
  },

  explorium: {
    apiKey: process.env.EXPLORIUM_API_KEY,
    sseUrl: "https://mcp.explorium.ai/sse",
    httpUrl: "https://mcp.explorium.ai/mcp",
  },

  aws: {
    profile: process.env.AWS_PROFILE || "astro-invest",
    region: process.env.AWS_REGION || "us-east-1",
    s3Bucket: process.env.S3_BUCKET || "outreach-tool-assets",
    dynamoTable: process.env.DYNAMO_TABLE || "outreach-tool-data",
  },

  calendly: {
    clientId: process.env.CALENDLY_CLIENT_ID,
    clientSecret: process.env.CALENDLY_CLIENT_SECRET,
    webhookSecret: process.env.CALENDLY_WEBHOOK_SECRET,
    accessToken: process.env.CALENDLY_ACCESS_TOKEN,
  },

  ses: {
    accessKeyId: process.env.SES_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.SES_AWS_SECRET_ACCESS_KEY,
    region: process.env.SES_REGION || "us-east-1",
  },

  outreach: {
    senderEmail: process.env.SENDER_EMAIL,
    calendlyLink: process.env.CALENDLY_LINK,
  },

  api: {
    port: parseInt(process.env.API_PORT, 10) || 9002,
  },

  web: {
    port: parseInt(process.env.WEB_PORT, 10) || 9001,
  },

  brave: {
    apiKey: process.env.BRAVE_API_KEY,
  },

  firecrawl: {
    apiKey: process.env.FIRECRAWL_API_KEY,
  },

  vercel: {
    token: process.env.VERCEL_TOKEN,
  },

  stitch: {
    apiKey: process.env.STITCH_API_KEY,
  },

  targetGeographies: ["US", "GB", "AE"],
  budgetTarget: 500,
  mvpTimelineDays: 30,
};

export function validateConfig() {
  const required = ["groq.apiKey"];
  const missing = required.filter((key) => {
    const parts = key.split(".");
    let val = config;
    for (const p of parts) val = val?.[p];
    return !val;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`);
  }

  return true;
}
