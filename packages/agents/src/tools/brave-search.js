import { registerTool } from "../orchestrator.js";
import { createLogger } from "@outreach-tool/shared/logger";

const log = createLogger("brave-search");
const BASE = "https://api.search.brave.com/res/v1";

function headers() {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return null;
  return { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": key };
}

async function braveSearch(endpoint, params) {
  const h = headers();
  if (!h) return { error: "BRAVE_API_KEY not configured. Get a free key at https://brave.com/search/api" };

  const url = `${BASE}${endpoint}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: h });
  if (!res.ok) throw new Error(`Brave API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const BRAVE_SEARCH_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "brave_web_search",
      description: "Search the web using Brave Search API. Good for finding businesses, verifying companies, and gathering public info.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          count: { type: "number", description: "Number of results (max 20)" },
          country: { type: "string", description: "Country code for results (US, GB, etc)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "brave_local_search",
      description: "Search for local businesses by location and type. Returns business names, addresses, phone numbers, ratings.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "e.g. 'plumbing companies in Manchester UK'" },
          count: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
];

registerTool("brave_web_search", async (args) => {
  log.info("brave_web_search", { query: args.query });
  try {
    const data = await braveSearch("/web/search", {
      q: args.query,
      count: args.count || 10,
      country: args.country || "",
    });
    const results = (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description,
    }));
    log.info(`brave_web_search returned ${results.length} results`);
    return { results, total: data.web?.totalEstimatedMatches || 0 };
  } catch (err) {
    log.error("brave_web_search failed", { error: err.message });
    return { error: err.message };
  }
});

registerTool("brave_local_search", async (args) => {
  log.info("brave_local_search", { query: args.query });
  try {
    const data = await braveSearch("/web/search", {
      q: args.query,
      count: args.count || 10,
      result_filter: "web",
    });
    const locations = (data.locations?.results || []).map(l => ({
      name: l.title || l.name,
      address: l.address,
      phone: l.phone,
      rating: l.rating,
      url: l.url,
    }));
    const webResults = (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description,
    }));
    log.info(`brave_local_search returned ${locations.length} locations, ${webResults.length} web results`);
    return { locations, web_results: webResults };
  } catch (err) {
    log.error("brave_local_search failed", { error: err.message });
    return { error: err.message };
  }
});
