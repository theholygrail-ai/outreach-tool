import { registerTool } from "../orchestrator.js";
import { createLogger } from "@outreach-tool/shared/logger";

const log = createLogger("firecrawl");
const BASE = "https://api.firecrawl.dev/v1";

function headers() {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
}

export const FIRECRAWL_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "scrape_website",
      description: "Scrape a website URL and extract its content as clean text/markdown. Use for website auditing.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to scrape" },
          formats: {
            type: "array",
            items: { type: "string", enum: ["markdown", "html", "links", "screenshot"] },
            description: "Output formats. Default: markdown",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crawl_website",
      description: "Crawl a website and extract content from multiple pages. Use for comprehensive site audit.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Starting URL" },
          max_pages: { type: "number", description: "Max pages to crawl (default 5)" },
        },
        required: ["url"],
      },
    },
  },
];

registerTool("scrape_website", async (args) => {
  log.info("scrape_website", { url: args.url });
  const h = headers();

  if (!h) {
    log.info("No FIRECRAWL_API_KEY, using basic fetch fallback");
    try {
      const res = await fetch(args.url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
      const html = await res.text();
      const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || "";
      const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i)?.[1] || "";
      const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 5000);
      return { title, meta_description: metaDesc, content: bodyText, url: args.url, source: "basic_fetch" };
    } catch (err) {
      return { error: err.message, url: args.url };
    }
  }

  try {
    const res = await fetch(`${BASE}/scrape`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ url: args.url, formats: args.formats || ["markdown"] }),
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      content: data.data?.markdown?.slice(0, 5000) || data.data?.html?.slice(0, 5000) || "",
      title: data.data?.metadata?.title || "",
      url: args.url,
      source: "firecrawl",
    };
  } catch (err) {
    log.error("scrape_website failed", { error: err.message });
    return { error: err.message, url: args.url };
  }
});

registerTool("crawl_website", async (args) => {
  log.info("crawl_website", { url: args.url, max_pages: args.max_pages });
  const h = headers();

  if (!h) {
    log.info("No FIRECRAWL_API_KEY, scraping single page as fallback");
    try {
      const res = await fetch(args.url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
      const html = await res.text();
      const links = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/g)].map(m => m[1]).slice(0, 20);
      const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
      return { pages: [{ url: args.url, content: bodyText }], links, source: "basic_fetch" };
    } catch (err) {
      return { error: err.message };
    }
  }

  try {
    const res = await fetch(`${BASE}/crawl`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ url: args.url, limit: args.max_pages || 5 }),
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      pages: (data.data || []).slice(0, 5).map(p => ({
        url: p.metadata?.url || "",
        title: p.metadata?.title || "",
        content: (p.markdown || "").slice(0, 2000),
      })),
      source: "firecrawl",
    };
  } catch (err) {
    log.error("crawl_website failed", { error: err.message });
    return { error: err.message };
  }
});
