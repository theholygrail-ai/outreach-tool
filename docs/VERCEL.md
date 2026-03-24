# Deploy on Vercel (GitHub integration — recommended)

Repo: **https://github.com/theholygrail-ai/outreach-tool**

Use **Vercel’s GitHub integration** so every push to GitHub triggers a deployment. It’s more reliable than one-off CLI deploys and keeps **Production** (usually `master`/`main`) and **Preview** (PRs and other branches) in sync automatically.

## 1. Connect GitHub to Vercel (once per account/team)

1. In [Vercel Dashboard](https://vercel.com/dashboard) → **Account Settings** → **Git** → **GitHub** → **Connect** (or adjust which repos Vercel can access).
2. Grant access to **`theholygrail-ai/outreach-tool`** (or the whole org, if you prefer).

## 2. Import the project

1. Open **[vercel.com/new](https://vercel.com/new)** → choose **Import Git Repository**.
2. Select **`theholygrail-ai/outreach-tool`**.
3. **Framework Preset**: Other (or Vite — root `vercel.json` defines build/output).
4. **Root Directory**: **repository root** (do **not** set to `packages/web`; the monorepo config lives at the repo root).
5. Confirm **Build & Output** matches `vercel.json`:
   - Install: `npm ci`
   - Build: `npm run build:web`
   - Output: `packages/web/dist`
6. Add **`VITE_API_URL`** under **Environment Variables** (see below), then **Deploy**.

After this, **every `git push`** to a tracked branch triggers a new deployment without using the CLI.

## 3. Automatic deploys

| Trigger | Typical result |
|--------|----------------|
| Push to **default branch** (`master` / `main`) | **Production** deployment |
| Push to other branches | **Preview** deployment |
| Pull requests | **Preview** deployment per PR |

Tune branch behavior under **Project → Settings → Git**.

## 4. Environment variables

Set for **Production** and **Preview** (and **Development** if you use it):

| Name | Value |
|------|--------|
| `VITE_API_URL` | Your AWS Lambda **Function URL** (no trailing slash), e.g. `https://xxxxx.lambda-url.us-east-1.on.aws` |

Without `VITE_API_URL`, the app expects the API on the same origin (local dev with Vite proxy only). **Static-only CLI deploys** (uploading `packages/web/dist` without env) must set the API in **`packages/web/public/api-config.json`** (`"apiBase": "https://…lambda-url…on.aws"`, no trailing slash), then run `npm run build:web` and redeploy — or the UI will show “API not configured”.

## 5. CLI (optional, not required)

The GitHub integration replaces routine deploys. Use the CLI only for debugging or advanced cases:

```bash
npx vercel        # local preview
npx vercel --prod # manual production (same project as GitHub-linked)
```

Prefer **dashboard deploys from Git** for day-to-day work.
