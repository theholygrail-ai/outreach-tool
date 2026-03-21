# Deploy: AWS API (Lambda) + Vercel (Web) + GitHub

Use AWS CLI profile **`astro-invest`**.

## 1. AWS — deploy all stacks (recommended)

From the repo root (PowerShell):

```powershell
$env:AWS_PROFILE = "astro-invest"
$env:CDK_DEFAULT_REGION = "us-east-1"
.\scripts\deploy-aws.ps1
```

Or from `infra/`:

```bash
export AWS_PROFILE=astro-invest
export CDK_DEFAULT_REGION=us-east-1
npm run deploy
```

This deploys **OutreachTool-Billing**, **OutreachTool-Data** (DynamoDB + S3), and **OutreachTool-Api** (HTTP Lambda + Function URL + pipeline worker). Lambdas get **`DYNAMO_TABLE`**, **`S3_BUCKET`** (CDK asset bucket name), and **`PIPELINE_WORKER_FUNCTION_NAME`** in template; **API keys** are not in CloudFormation—add them after deploy.

**Smoke test:**

```powershell
.\scripts\e2e-smoke.ps1 -BaseUrl "https://YOUR.lambda-url.us-east-1.on.aws"
```

**List Lambdas:**

```powershell
.\scripts\aws-list-lambdas.ps1
```

## 1b. AWS — deploy stacks individually (optional)

1. Data: `npm run deploy:infra -w infra -- OutreachTool-Data`
2. API: `npm run deploy:infra -w infra -- OutreachTool-Api` (set `AWS_PROFILE` / `CDK_DEFAULT_REGION` first)

3. Copy **ApiFunctionUrl** from the CDK output (no trailing slash).

4. **Configure secrets on both Lambdas** (HTTP API + pipeline worker): Lambda → Configuration → Environment variables — same keys as local `.env` (`GROQ_API_KEY`, `EXPLORIUM_API_KEY`, `SES_*`, `CALENDLY_*`, etc.). Do **not** commit API keys to git.

5. Optional: set `PUBLIC_API_URL` on both functions to the Function URL. Calendly webhook: `{ApiFunctionUrl}/api/webhooks/calendly`.

## 2. Vercel — static dashboard (GitHub integration)

Use **Vercel → Import Git Repository** and connect **this** GitHub repo. That enables **automatic deploys on every push** (Production for the default branch, Previews for branches/PRs). More reliable than one-off CLI deploys.

1. **Root directory**: repository root — `vercel.json` builds `packages/web`.
2. **Environment variables** (Production + Preview): `VITE_API_URL` = your Lambda Function URL (CDK `ApiFunctionUrl`, **no trailing slash**).
3. After the first deploy, **each `git push`** redeploys the site. Details: **[docs/VERCEL.md](VERCEL.md)**.

## 3. GitHub

```bash
git add -A
git commit -m "Outreach tool: AWS Lambda API + Vercel web"
gh repo create outreach-tool --private --source=. --remote=origin --push
```

Use another repo name if `outreach-tool` is taken (`gh repo create my-org/outreach-tool ...`).

## Notes

- **Pipeline** on AWS runs in a **separate Lambda** invoked asynchronously (no local `fork`).
- **SSE** (`/api/events`) is not used from the Vercel origin; the UI **polls** when `VITE_API_URL` is set.
- **CORS** allows `*.vercel.app` and optional `CORS_ORIGINS` (comma-separated) on the API Lambda env.
