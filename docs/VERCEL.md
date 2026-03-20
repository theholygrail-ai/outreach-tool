# Deploy on Vercel

Repo: **https://github.com/theholygrail-ai/outreach-tool**

## One-time setup

1. Go to [vercel.com/new](https://vercel.com/new) → **Import** this repository.
2. **Framework Preset**: Other (or “Vite” is fine; root `vercel.json` overrides build).
3. **Root Directory**: leave as **repository root** (do not set to `packages/web` — the config expects the monorepo root).
4. **Build & Output** (auto-detected from `vercel.json`):
   - Install: `npm ci`
   - Build: `npm run build:web`
   - Output: `packages/web/dist`

## Environment variables (Production + Preview)

| Name | Value |
|------|--------|
| `VITE_API_URL` | Your AWS Lambda **Function URL** (no trailing slash), e.g. `https://xxxxx.lambda-url.us-east-1.on.aws` |

Without `VITE_API_URL`, the SPA assumes the API is same-origin (local dev with proxy only).

## CLI (optional)

```bash
npm i -g vercel   # or: npx vercel
cd /path/to/outreach-tool
vercel link       # link to team/project
vercel --prod     # production deploy
```

Set `VITE_API_URL` in the Vercel project **Settings → Environment Variables** before promoting to production.
