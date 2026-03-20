# Deploy: AWS API (Lambda) + Vercel (Web) + GitHub

## 1. AWS — data + API

1. Deploy DynamoDB/S3 (if not already):
   ```bash
   npm run deploy:infra --workspace infra -- OutreachTool-Data
   ```
2. Load secrets into the shell (same keys as local `.env`), then deploy the API stack:
   ```bash
   set AWS_PROFILE=astro-invest
   set CDK_DEFAULT_REGION=us-east-1
   npm run deploy:infra --workspace infra -- OutreachTool-Api
   ```
   On macOS/Linux use `export` instead of `set`.

3. Copy **ApiFunctionUrl** from the CDK output. This is your public REST base URL (no trailing slash).

4. **Configure secrets on both Lambdas** (same function names as in CDK: HTTP API + Pipeline worker): in the AWS Console → Lambda → Configuration → Environment variables, add the same keys you use locally (`GROQ_API_KEY`, `EXPLORIUM_API_KEY`, `SES_*`, `CALENDLY_*`, etc.). Do **not** commit API keys to git.

5. Optional: set `PUBLIC_API_URL` on both functions to the Function URL (for Settings UI). Set **Calendly webhook** to `{ApiFunctionUrl}/api/webhooks/calendly` if you use webhooks.

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
