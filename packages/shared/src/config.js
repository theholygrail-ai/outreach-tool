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

  /** Post-enrichment strict display gate (discovery pipeline) */
  enrichment: {
    maxPages: parseInt(process.env.ENRICH_MAX_PAGES, 10) || 8,
    playwrightEnabled: process.env.PLAYWRIGHT_ENABLED === "1" || process.env.PLAYWRIGHT_ENABLED === "true",
    /** Minimum quality score after verify to be list-eligible */
    strictMinQuality: parseInt(process.env.STRICT_MIN_QUALITY, 10) || 28,
    /**
     * Minimum score to keep a lead from discovery (after adjustScoreForDiscoveryPipeline).
     * Base verify scores are harsh when the site is down or Brave does not match Arabic names — default kept low so fewer leads are dropped.
     */
    discoveryMinQuality: parseInt(process.env.DISCOVERY_MIN_QUALITY, 10) || 12,
    /** If false, skip contact-field requirements (quality only) */
    strictRequireContact: process.env.STRICT_REQUIRE_CONTACT !== "0",
    /** Browserbase — remote browser for LinkedIn sign-in + profile scrape (see /api/enrichment/browserbase/*) */
    browserbaseApiKey: process.env.BROWSERBASE_API_KEY || null,
    browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID || null,
    /**
     * any_one_contact (default when env unset) — valid email OR dialable phone OR LinkedIn /in/ URL.
     * email_only — valid email only.
     * email_plus_alt — (email && phone) OR (email && linkedin).
     * firmographic — live website + company name + website URL (no person contact required).
     */
    strictContactMode: (() => {
      const raw = process.env.STRICT_CONTACT_MODE;
      if (raw == null || String(raw).trim() === "") return "any_one_contact";
      const m = String(raw).toLowerCase().trim();
      if (m === "email_only") return "email_only";
      if (m === "email_plus_alt") return "email_plus_alt";
      if (m === "firmographic") return "firmographic";
      if (m === "any_one_contact" || m === "relaxed") return "any_one_contact";
      return "email_plus_alt";
    })(),
    abstractApiKey: process.env.ABSTRACT_API_KEY || null,
    companiesHouseApiKey: process.env.COMPANIES_HOUSE_API_KEY || null,
    /** Re-run full verify in pipeline when older than this many days */
    verificationMaxAgeDays: parseInt(process.env.VERIFICATION_MAX_AGE_DAYS, 10) || 30,
    /** Groq ranks regex-extracted emails (pick index only; no invented addresses). Set "0" to disable. */
    agentEmailRanker: process.env.ENRICHMENT_AGENT_EMAIL_RANKER !== "0",
    /** Structured data-quality insights on verification (facts-only prompt). Set "0" to disable. */
    agentVerificationInsights: process.env.ENRICHMENT_AGENT_INSIGHTS !== "0",
    /** Apollo People Enrichment — https://docs.apollo.io/docs/create-api-key */
    apolloApiKey: process.env.APOLLO_API_KEY || null,
    /** Consumes credits when true — personal work emails where policy allows */
    apolloRevealPersonalEmails: process.env.APOLLO_REVEAL_PERSONAL_EMAILS === "1",
    /** Hunter.io — domain search / finder / verifier */
    hunterApiKey: process.env.HUNTER_API_KEY || null,
    /**
     * Bright Data Web Unlocker (same API as Python SDK sync mode: POST /request).
     * Set BRIGHTDATA_ZONE to your Web Unlocker zone name from the Bright Data control panel.
     */
    brightdataApiToken: process.env.BRIGHTDATA_API_TOKEN || null,
    brightdataZone: process.env.BRIGHTDATA_ZONE || null,
  },
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
