# Outreach Tool

Agentic Prospecting + Website MVP Outreach Engine

An agentic system that discovers qualified SME prospects, generates complete website MVPs, deploys them, and uses them as proof-of-work in personalized multi-channel outreach.

## Architecture

```
packages/
  web/          Vite + vanilla JS dashboard
  mobile/       React Native app (JS)
  agents/       Groq-powered agent orchestration
  api/          Express app (local) + Lambda handlers (AWS)
  shared/       Config, logging, schemas, state machine
infra/          AWS CDK (billing + data + API Lambda stacks)
docs/           Agent instruction files
```

## Cloud deployment (production)

- **GitHub**: **https://github.com/theholygrail-ai/outreach-tool**
- **Web UI (Vercel)**: Import the repo → see **[docs/VERCEL.md](docs/VERCEL.md)** — `vercel.json` builds `packages/web`.
- **REST API**: AWS Lambda (Function URL) + async pipeline worker Lambda — see **[docs/DEPLOY.md](docs/DEPLOY.md)**.
- Set **`VITE_API_URL`** on Vercel to the Lambda Function URL (no trailing slash). Configure API keys on the Lambdas in the AWS Console (do not embed secrets in CDK templates).

## Prerequisites

- Node.js >= 18
- npm >= 9
- AWS CLI (authenticated on astro-invest account)
- Groq API key ([console.groq.com](https://console.groq.com))
- Explorium API key ([explorium.ai](https://www.vibeprospecting.ai))
- Google Cloud auth for Stitch MCP (`npx @_davideast/stitch-mcp init`)
- Vercel account (OAuth via MCP)

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url> OutreachTool
cd OutreachTool
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
# Edit .env with your actual keys
```

Required variables:

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key for openai/gpt-oss-120b |
| `EXPLORIUM_API_KEY` | Explorium AgentSource API key |
| `STITCH_API_KEY` | Google Stitch API key (or use gcloud OAuth) |
| `AWS_PROFILE` | AWS CLI profile name (default: astro-invest) |
| `AWS_REGION` | AWS region (default: us-east-1) |
| `BILLING_ALERT_EMAIL` | Email for AWS billing alerts |
| `CALENDLY_LINK` | Calendly booking URL for kickoff calls |
| `SENDER_EMAIL` | Verified SES email for outreach |

### 3. AWS Profile

If the astro-invest profile is not yet named:

```bash
aws configure --profile astro-invest
# Region: us-east-1
# Output: json
```

### 4. Deploy AWS Infrastructure

```bash
cd infra
npx cdk bootstrap --profile astro-invest
npx cdk deploy --all --profile astro-invest
```

This creates:
- Billing alarm ($8 threshold) + budget ($10/month) + SNS alerts
- S3 bucket for assets (90-day lifecycle)
- DynamoDB table (on-demand, single-table design)

### 5. MCP Setup

MCP servers are configured in `.cursor/mcp.json`. For each:

**Explorium**: Replace `${EXPLORIUM_API_KEY}` with your key or set the env var.

**Stitch**: Run initial setup:
```bash
npx @_davideast/stitch-mcp init
```

**Vercel**: OAuth handles auth -- click "Needs login" in Cursor when prompted.

**Screenshot**: Works out of the box via npx.

### 6. Run the Agent

```bash
npm run agents:run -- "Find 5 qualified SME prospects in the United States"
```

### 7. Development

```bash
# Web dashboard
npm run dev:web

# Agent dev mode (auto-restart)
npm run dev:agents
```

## LLM Configuration

| Setting | Value |
|---------|-------|
| Provider | Groq |
| Base URL | `https://api.groq.com/openai/v1` |
| Model | `openai/gpt-oss-120b` |
| Context | 131,072 tokens |
| Max output | 65,536 tokens |
| Speed | ~500 tokens/sec |
| Parallel tools | Not supported |
| Pricing | $0.15 input / $0.60 output per 1M tokens |

## AWS Cost Controls

- **Hard cap**: $10/month budget with SNS alerts
- **Billing alarm**: CloudWatch triggers at $8
- **Expected spend**: $0-$2/month (free tier)
- **Approved services**: S3, DynamoDB (on-demand), SES (sandbox), CloudWatch, SNS, Lambda
- **Banned**: EC2, CloudFront, Route53, RDS, NAT gateway, Elastic IP

Check current spend:
```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-03-01,End=2026-03-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --profile astro-invest
```

## Agent Workflow

1. Prospect search (Explorium)
2. Data enrichment
3. ICP qualification
4. Website audit or company research
5. Design brief
6. Design generation (Stitch)
7. Design review
8. Prototype assembly
9. Deployment (Vercel)
10. Screenshot + demo capture
11. Outreach generation (email, WhatsApp, LinkedIn, voice)
12. Send / queue
13. Response tracking
14. Meeting handoff (Calendly)

## Documentation

| File | Purpose |
|------|---------|
| `docs/context.md` | Project scope, ICP, compliance, cost constraints |
| `docs/identity.md` | Agent identity and behavior rules |
| `docs/Agent.md` | Operating instructions and workflow rules |
| `docs/tools.md` | Tool reference with schemas and usage chains |
| `docs/workflow.md` | State machine and required artifacts |

## Target Markets

- United States (US)
- United Kingdom (GB)
- United Arab Emirates (AE)

## Value Proposition

- Completed website MVP delivered as proof of work in outreach
- $500/month managed web service
- 30-day launch timeline
- Hosting, domain management, server-side infra included
- All code belongs to the client

## License

Private / Proprietary
