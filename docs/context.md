# Project Context

## Project Name

Agentic Prospecting + Website MVP Outreach Engine

## Core Goal

Build an agentic system that identifies qualified SME prospects in the United States, United Kingdom, and United Arab Emirates, then generates a complete website MVP for each prospect and uses it as the centerpiece of personalized multi-channel outreach.

The system must:

1. Gather prospect and company data via Explorium AgentSource MCP.
2. Qualify prospects against ICP rules.
3. Audit existing websites or research the company if no website exists.
4. Generate a proposed website design using Google Stitch via stitch-mcp.
5. Review the generated design for quality.
6. Export designs into a clickable prototype with routed pages.
7. Deploy the prototype to Vercel via Vercel MCP.
8. Browse the deployed experience and verify it works.
9. Capture screenshots via universal-screenshot-mcp and record a demo.
10. Generate tailored outreach assets (email, WhatsApp, LinkedIn, voice note).
11. Send outreach across supported channels.
12. Track responses and manage follow-up.
13. Route interested leads into a Calendly-driven kickoff flow.

---

## Technology Stack

### LLM Provider -- Groq

- **Base URL**: `https://api.groq.com/openai/v1`
- **Model**: `openai/gpt-oss-120b`
- **Context window**: 131,072 tokens
- **Max output**: 65,536 tokens
- **Speed**: ~500 tokens/sec
- **Capabilities**: Tool Use, Browser Search, Code Execution, JSON Mode, Reasoning
- **Parallel tool use**: NOT supported -- sequential tool calls only
- **Pricing**: $0.15/1M input, $0.60/1M output tokens
- **Rate limits**: 250K TPM, 1K RPM (developer plan)

### Infrastructure -- AWS (astro-invest)

- **Account**: astro-invest (new, 12-month free tier active)
- **Budget**: $10/month hard cap
- **Services used**: S3, DynamoDB (on-demand), SES (sandbox), CloudWatch, SNS
- **Services banned**: EC2, CloudFront, Route53, RDS, NAT gateway, Elastic IP, API Gateway

### Monorepo Structure

- `packages/web` -- Vite + vanilla JS dashboard
- `packages/mobile` -- React Native (JS, no TypeScript)
- `packages/agents` -- Groq-powered agent orchestration
- `packages/shared` -- Config, logging, schemas, state machine
- `infra/` -- AWS CDK (JS) for billing + data stacks

### MCP Servers

1. **Explorium** (SSE at `https://mcp.explorium.ai/sse`) -- prospect discovery + enrichment
2. **Stitch** (local proxy via `npx @_davideast/stitch-mcp proxy`) -- design generation
3. **Vercel** (remote at `https://mcp.vercel.com`) -- deployment management
4. **Screenshot** (local via `npx -y universal-screenshot-mcp`) -- webpage/system capture

---

## Value Proposition

We offer qualified businesses a completed website MVP in our outreach -- not just a pitch.

- **Monthly budget target**: $500/month
- **We handle**: hosting, domain management, server-side infrastructure (AWS-backed)
- **MVP delivery**: launched in 30 days
- **Code ownership**: all code belongs to the client

---

## ICP (Ideal Customer Profile)

### Prioritize

- SMEs and small businesses in US, GB, AE
- Service businesses, local brands, regional operators
- Businesses with weak, outdated, broken, or missing websites
- Visibly active businesses that are digitally under-optimized
- Businesses likely able to sustain $500/month
- Founder-led or lean operational structure

### Positive Signals

- Active social presence
- Real operating business with demand
- Clear service offering
- Evidence of growth intent
- Website issues or no website at all

### Disqualifiers

- Enterprise accounts
- Hobby businesses with no spend capacity
- No meaningful online footprint and no verifiable legitimacy
- Outside US, GB, AE
- Insufficient data for personalization
- Businesses that clearly exceed target fit or require enterprise procurement

---

## Required Prospect Fields

Each prospect record includes:

| Field | Source |
|-------|--------|
| id | Generated UUID |
| first_name | Explorium fetch-prospects / enrich-prospects |
| last_name | Explorium |
| full_name | Explorium |
| executive_role | Explorium (job_title / seniority) |
| company_name | Explorium |
| company_website | Explorium (domain) |
| email | Explorium enrich-prospects (contacts) |
| phone_number | Explorium enrich-prospects (contacts) |
| linkedin_url | Explorium enrich-prospects (social_media) |
| country | Explorium (country_code) |
| city_or_region | Explorium |
| company_size_estimate | Explorium (firmographics) |
| industry | Explorium (linkedin_category / google_category) |
| website_status | Agent audit |
| audit_summary | Agent audit |
| budget_fit_estimate | Agent qualification |
| icp_score | Agent qualification |
| outreach_status | State machine |
| outreach_channel_status | Tracking system |
| calendly_link_used | Outreach system |
| notes | Agent notes |
| source_trace | Explorium source metadata |

---

## Website Handling Logic

### Case A: Prospect Has a Website

1. Browse the website
2. Perform structured audit (UX, trust, messaging, conversion, mobile, speed, content)
3. Identify top issues and improvements
4. Design an improved MVP concept based on the business model
5. Generate a clickable prototype
6. Prepare proof assets for outreach

### Case B: Prospect Has No Website

1. Research the company from public sources
2. Infer business model, services, customer journey, trust requirements
3. Generate a new website concept from scratch
4. Produce a clickable prototype
5. Prepare proof assets for outreach

---

## Compliance Constraints

### United States

- CAN-SPAM: commercial email requires physical address, unsubscribe mechanism, honest headers/subject lines, identification as ad
- CAN-SPAM applies to B2B email -- there is no B2B exemption

### United Kingdom

- PECR + GDPR: B2B email marketing to corporate addresses is permitted under soft opt-in / legitimate interest, but must maintain objection/suppression lists
- ICO guidance requires easy opt-out and honest identification

### United Arab Emirates

- Stricter telemarketing and marketing communication rules
- Campaign governance requirements
- Approval requirements for telemarketing campaigns

### All Markets

- Maintain do-not-contact lists per channel
- Stop outreach after objection
- Include unsubscribe/opt-out in every email
- Never fabricate relationships, referrals, or prior work
- Never claim the website was requested by the prospect
- Preserve audit logs of source and message history

---

## Primary Success Metric

Book qualified kickoff calls from high-fit SME prospects using prototype-led outreach.

## Secondary Metrics

- Qualified prospect volume
- Response rate by channel
- Positive reply rate
- Call booking rate
- Proposal rate
- Close rate
- Time from discovery to outreach
- Time from design start to prototype deployment

---

## AWS Cost Constraints

- **Hard cap**: $10/month
- **Expected spend**: $0-$2/month (all free tier)
- **Billing alarm**: CloudWatch triggers at $8 estimated charges
- **Budget alerts**: 80% ($8) and 100% ($10) notifications via SNS email
- **Approved services only**: S3, DynamoDB (on-demand), SES (sandbox), CloudWatch, SNS, Lambda (if needed)
- **Banned services**: EC2, CloudFront, Route53, RDS, NAT gateway, Elastic IP, ECS, Fargate, API Gateway, Cognito
- Client MVPs deploy to Vercel free tier, not AWS
