# Tools and Tool Usage Rules

## Tool Priority Rule

Before producing a user-facing answer, always:

1. Inspect tools relevant to the task
2. Call the most relevant one
3. Use returned evidence to drive the response

If multiple tools apply, choose the one that reduces the most uncertainty first.

---

## LLM Configuration

**Provider**: Groq (OpenAI-compatible)
**Base URL**: `https://api.groq.com/openai/v1`
**Model**: `openai/gpt-oss-120b`
**Context**: 131,072 tokens
**Max output**: 65,536 tokens
**Speed**: ~500 tokens/sec
**Tool use**: Supported (sequential only, NO parallel tool calls)
**Built-in tools**: web search, code execution, browser automation (server-side)
**JSON mode**: Supported
**Rate limits**: 250K TPM, 1K RPM

### Tool Calling Pattern

Groq uses standard OpenAI function calling format:

1. Send `messages` + `tools` array in chat completion request
2. Model returns `tool_calls` array (one call at a time for this model)
3. Execute the tool locally, append result as `tool` role message
4. Send updated messages back
5. Repeat until model returns final text response (no `tool_calls`)

---

## Core Tool Stack

### 1. Explorium AgentSource MCP

**Endpoint**: `https://mcp.explorium.ai/sse` (SSE) or `https://mcp.explorium.ai/mcp` (streamable HTTP)
**Auth**: API key in `api_key` header

#### Available Tools

| Tool | Purpose |
|------|---------|
| `autocomplete` | Get valid values for filter fields. **MUST call before** using linkedin_category, google_category, naics_category, company_tech_stack_tech, or job_title. |
| `fetch-businesses` | Search businesses by country, size, revenue, industry, tech stack. Returns Business IDs. |
| `match-business` | Match a business by name/domain to get its Explorium ID. |
| `fetch-businesses-statistics` | Aggregated market stats. Does not consume credits on individual records. |
| `fetch-businesses-events` | Business events: funding, office changes, hiring, partnerships, M&A. |
| `enrich-business` | Enrich with firmographics, technographics, funding, workforce trends, website changes. Requires Business ID. |
| `fetch-prospects` | Find employees by job level, department, location, company. Returns Prospect IDs. |
| `match-prospects` | Match individuals to get Explorium Prospect IDs. |
| `fetch-prospects-statistics` | Aggregated prospect stats. |
| `fetch-prospects-events` | Prospect events: role changes, company changes, anniversaries. |
| `enrich-prospects` | Enrich with contacts (email, phone), social media, professional profile. Requires Prospect IDs. |

#### Recommended Tool Chain

```
autocomplete (validate filter values)
  -> fetch-businesses (get business IDs, filtered by geography + size + industry)
    -> enrich-business (firmographics, technographics for qualified businesses)
      -> fetch-prospects (find decision-makers at those businesses)
        -> enrich-prospects (get email, phone, LinkedIn for those prospects)
```

#### Critical Rules

- Never use both `country_code` and `region_country_code` in the same request
- Never use more than one category type (linkedin_category, google_category, naics_category) in a single request
- Always call `autocomplete` before using filterable fields
- Business IDs required before `enrich-business`
- Prospect IDs required before `enrich-prospects`
- Use `fetch-businesses-statistics` first to validate market size before spending credits
- Cap at 1,000 results per query; split by geography for larger datasets

---

### 2. Stitch MCP

**CLI**: `npx @_davideast/stitch-mcp`
**MCP Proxy**: `npx @_davideast/stitch-mcp proxy`
**Auth**: `STITCH_API_KEY` env var or gcloud OAuth via `npx @_davideast/stitch-mcp init`

#### Virtual Tools (via proxy)

| Tool | Purpose |
|------|---------|
| `build_site` | Build site from project: map screens to routes, returns HTML per page. |
| `get_screen_code` | Retrieve screen HTML code content. |
| `get_screen_image` | Retrieve screen screenshot as base64. |

#### `build_site` Schema

```json
{
  "projectId": "string (required)",
  "routes": [
    { "screenId": "string (required)", "route": "string (required)" }
  ]
}
```

#### CLI Commands

| Command | Purpose |
|---------|---------|
| `init` | Set up auth, gcloud, MCP config |
| `serve -p <id>` | Preview project screens locally |
| `site -p <id>` | Generate Astro project from screens |
| `view` | Interactive resource browser |
| `tool [name]` | Invoke MCP tools from CLI |
| `proxy` | Run MCP proxy for agents |
| `doctor` | Verify configuration health |

#### Rules

- Do not approve first design blindly -- always review generated screens
- Prefer realistic business copy over lorem ipsum
- Build for conversion, not decoration
- Iterate if quality is insufficient

---

### 3. Vercel MCP

**Endpoint**: `https://mcp.vercel.com` (remote MCP, OAuth)
**Supported in**: Cursor, Claude, VS Code, ChatGPT, Codex CLI, others

#### Available Tools

| Tool | Purpose |
|------|---------|
| `search_documentation` | Search Vercel docs by topic. |
| `list_teams` | List teams the authenticated user belongs to. |
| `list_projects` | List projects for a team. |
| `get_project` | Get project details including framework, domains, latest deployment. |
| `list_deployments` | List deployments for a project. |
| `get_deployment` | Get deployment details: build status, regions, metadata. |
| `get_deployment_build_logs` | Get build logs to investigate failures. |
| `get_runtime_logs` | Get runtime logs: console output, errors, function execution. |
| `deploy_to_vercel` | Deploy the current project. |
| `check_domain_availability_and_price` | Check if domains are available and get pricing. |
| `buy_domain` | Purchase a domain. |
| `get_access_to_vercel_url` | Create temporary shareable link for protected deployments. |
| `web_fetch_vercel_url` | Fetch content from a deployment URL (with auth if needed). |
| `use_vercel_cli` | Run Vercel CLI commands. |

#### Deployment Chain

```
deploy_to_vercel
  -> get_deployment (verify build status)
    -> web_fetch_vercel_url (verify site is reachable)
      -> get_deployment_build_logs (if failed, diagnose)
```

#### Rules

- Verify deployment URL after release
- Inspect logs if deployment is broken
- Do not mark deployment done until the site is reachable and browsed
- Use project-specific URLs (`https://mcp.vercel.com/{team}/{project}`) for better context

---

### 4. Screenshot MCP (universal-screenshot-mcp)

**Package**: `universal-screenshot-mcp`
**MCP Config**: `npx -y universal-screenshot-mcp`
**Platform**: Windows (PowerShell + .NET for system capture), Puppeteer for web capture

#### Tools

| Tool | Purpose |
|------|---------|
| `take_screenshot` | Capture web page via headless Chromium. |
| `take_system_screenshot` | Capture desktop, window, or region via native OS tools. |

#### `take_screenshot` Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| url | string | Yes | URL to capture (http/https only) |
| width | number | No | Viewport width (1-3840) |
| height | number | No | Viewport height (1-2160) |
| fullPage | boolean | No | Capture full scrollable page |
| selector | string | No | CSS selector for specific element |
| waitForTimeout | number | No | Delay ms before capture (0-30000) |
| outputPath | string | No | Output file path |

#### `take_system_screenshot` Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| mode | enum | Yes | fullscreen, window, or region |
| windowName | string | No | App name e.g. "Chrome" |
| format | enum | No | png (default) or jpg |
| delay | number | No | Capture delay 0-10 seconds |
| outputPath | string | No | Output file path |

#### Rules

- Capture at least one clean homepage screenshot per prototype
- Use full-page capture for comprehensive proof
- Name files consistently: `{company_slug}_{page}_{date}.png`
- Allowed output directories: ~/Desktop/Screenshots, ~/Downloads, ~/Documents, /tmp

---

### 5. AWS Services (free tier only)

#### Approved Services

| Service | Use | Free Tier Limit |
|---------|-----|-----------------|
| S3 | Asset storage (designs, screenshots, outreach) | 5 GB, 20K GET, 2K PUT |
| DynamoDB | Prospect tracking, outreach state, response logs | 25 GB, 25 RCU, 25 WCU |
| SES (sandbox) | Email sending | Free in sandbox (verified addresses only) |
| CloudWatch | Billing alarms | 10 alarms, 10 metrics |
| SNS | Alert notifications | 1M publishes, 1K email |
| Lambda | Webhook receiver (if needed) | 1M requests, 400K GB-sec |

#### Banned Services -- NEVER Create

- EC2 instances
- CloudFront distributions
- Route53 hosted zones (without explicit operator approval)
- RDS / Aurora
- NAT gateways
- Elastic IPs
- ECS / Fargate
- API Gateway
- Cognito

#### Cost Check Command

```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --profile astro-invest
```

---

### 6. Outreach Channel Adapters

| Tool | Channel | Status |
|------|---------|--------|
| `send_email` | Email via AWS SES | **`@outreach-tool/shared/ses-send`** — used by **agents CLI**, **HTTP app** (`hasSenderIdentity`), and **pipeline worker** at `outreach_ready` → `sent`. |
| `queue_whatsapp_message` | WhatsApp | Queue for manual/API delivery |
| `queue_linkedin_message` | LinkedIn | Queue for manual/API delivery |
| `generate_voice_note_script` | Voice | LLM generates script |

---

### 7. Tracking Tools

| Tool | Purpose |
|------|---------|
| `log_outreach_event` | Log event (sent, delivered, opened, replied, objected, suppressed) to DynamoDB |
| `check_suppression` | Check if prospect is on do-not-contact list |

---

## Tool Selection Heuristics

| Task | Tools |
|------|-------|
| Find prospects | autocomplete -> fetch_businesses -> fetch_prospects -> enrich_prospects |
| Validate market | fetch_businesses_statistics |
| Research company | match_business -> enrich_business (firmographics, technographics) |
| Audit website | Browser / built-in web search -> take_screenshot |
| Build design | build_site -> get_screen_code -> get_screen_image |
| Deploy prototype | deploy_to_vercel -> get_deployment -> web_fetch_vercel_url |
| Capture proof | take_screenshot -> take_system_screenshot |
| Generate outreach | LLM prompts (email, WhatsApp, LinkedIn, voice) |
| Send outreach | send_email, queue_whatsapp_message, queue_linkedin_message |
| Track responses | log_outreach_event, check_suppression |

---

## Failure Handling

If a tool fails:

1. Record the failure
2. Identify whether retry is safe
3. Try the best fallback
4. Respond honestly with: what failed, impact, current best next step

Never mask tool failure with confident prose.

---

## Mandatory Tool-First Response Policy

The agent must not respond with generic text when a tool could:

- Verify a fact
- Retrieve a contact
- Inspect a website
- Generate a design
- Deploy a prototype
- Capture proof
- Update state

If a tool is available and relevant, use it first.
