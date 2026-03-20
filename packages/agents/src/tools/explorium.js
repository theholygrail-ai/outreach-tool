import { registerTool } from "../orchestrator.js";
import { callTool } from "../mcp-client.js";
import { createLogger } from "@outreach-tool/shared/logger";

const log = createLogger("explorium");

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "autocomplete",
      description: "Get valid autocomplete values for Explorium filter fields. MUST be called before using linkedin_category, google_category, naics_category, company_tech_stack_tech, or job_title filters.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", enum: ["linkedin_category", "google_category", "naics_category", "company_tech_stack_tech", "job_title"] },
          query: { type: "string" },
        },
        required: ["field", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_businesses",
      description: "Fetch businesses from Explorium by country, size, industry. Returns Business IDs for enrichment.",
      parameters: {
        type: "object",
        properties: {
          country_code: { type: "string", description: "ISO code: US, GB, AE" },
          company_size_min: { type: "number" },
          company_size_max: { type: "number" },
          linkedin_category: { type: "string" },
          google_category: { type: "string" },
          limit: { type: "number" },
        },
        required: ["country_code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "match_business",
      description: "Match a business by name/domain to get its Explorium ID.",
      parameters: {
        type: "object",
        properties: { company_name: { type: "string" }, domain: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enrich_business",
      description: "Enrich a business with firmographics, technographics. Requires business ID.",
      parameters: {
        type: "object",
        properties: {
          business_id: { type: "string" },
          enrichments: { type: "array", items: { type: "string" } },
        },
        required: ["business_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_prospects",
      description: "Fetch prospects/employees by job level, department, company.",
      parameters: {
        type: "object",
        properties: {
          business_ids: { type: "array", items: { type: "string" } },
          job_title: { type: "string" },
          seniority: { type: "string", enum: ["c_level", "vp", "director", "manager", "senior", "entry"] },
          department: { type: "string" },
          country_code: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enrich_prospects",
      description: "Enrich prospects with email, phone, LinkedIn. Requires prospect IDs.",
      parameters: {
        type: "object",
        properties: {
          prospect_ids: { type: "array", items: { type: "string" } },
          enrichments: { type: "array", items: { type: "string" } },
        },
        required: ["prospect_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_businesses_statistics",
      description: "Get aggregated market stats. Does not consume credits on individual records.",
      parameters: {
        type: "object",
        properties: {
          country_code: { type: "string" },
          linkedin_category: { type: "string" },
          company_size_min: { type: "number" },
          company_size_max: { type: "number" },
        },
      },
    },
  },
];

for (const def of TOOL_DEFINITIONS) {
  const name = def.function.name;
  registerTool(name, async (args) => {
    log.info(`${name} -> Explorium MCP`, args);
    try {
      const result = await callTool(name, args);
      log.info(`${name} <- response received`);
      return result;
    } catch (err) {
      log.error(`${name} failed`, { error: err.message });
      return { error: err.message, tool: name };
    }
  });
}
