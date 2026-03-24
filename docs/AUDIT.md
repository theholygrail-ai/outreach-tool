# Application audit & quality gates

This document describes what **Outreach Tool** is, how to verify it works, known gaps, and how to harden it at the current scale (single-team SaaS-style deployment: **Vercel static UI** + **AWS Lambda API** + **async worker Lambda** + **DynamoDB/S3**).

## What we are building

| Layer | Role |
|--------|------|
| **Web (`packages/web`)** | Vite SPA: prospects, pipeline, bookings, settings, tools. Talks to the API via `VITE_API_URL` or runtime `public/api-config.json`. |
| **API (`packages/api`)** | Express app behind `serverless-http` on the **HTTP Lambda**. CRUD, pipeline **orchestration**, webhooks, SSE (local) / polling (remote). |
| **Worker (`packages/api` → `worker-lambda` / `pipeline-worker.js`)** | Long-running discovery/enrichment/pipeline steps; invoked **asynchronously** from the API Lambda when `PIPELINE_WORKER_FUNCTION_NAME` is set. |
| **Shared (`packages/shared`)** | Config, prospect schema, state machine. |
| **Infra (`infra`)** | CDK: DynamoDB, S3, Lambdas, Function URL (CORS `*` on API URL). |

**Critical integration:** the browser must call the **Lambda Function URL**, not the Vercel origin, unless you add a **Vercel rewrite** proxying `/api/*` to that URL.

---

## Automated checks (run locally)

| Check | Command | Notes |
|--------|---------|--------|
| **Web build** | `npm run build:web` | Must succeed before any Vercel deploy. |
| **Infra synth** | `npm run build:infra` | Validates CDK; needs deps. |
| **Lint** | `npm run lint` | Root **ESLint** on `packages/*/src` (see `eslint.config.js`). |
| **Unit tests** | `npm test` | Vitest: SES (`packages/shared/src/ses-send.test.js`), strict-gate, `app.integration.test.js` (supertest). |
| **Deployed API smoke** | `.\scripts\e2e-smoke.ps1 -BaseUrl "https://….lambda-url….on.aws"` | GETs health, **health/ready**, prospects (incl. visibility), pipeline, activity, bookings, tools, settings. |

Reliability: **CI** (GitHub Actions) runs `build:web` + API tests; use smoke script + manual QA for Lambda.

---

## Frontend-specific risks (addressed)

| Risk | Mitigation |
|------|------------|
| **API base empty on static host** | `initApiConfig()` + production guard if `PROD` and no base; optional `api-config.json`. |
| **Race: `hashchange` before `/api-config.json` loads** | `hashchange` is registered **only after** `initApiConfig()` completes (`appReady`). |

---

## Backend-specific risks

| Risk | Notes |
|------|--------|
| **`/api/health` is liveness only** | Returns `{ ok: true }` without DynamoDB. Use **`GET /api/health/ready`** for DynamoDB connectivity (`DescribeTable`). |
| **Outreach email delivery** | At **`outreach_ready`**, the **worker** calls **SES** (`@outreach-tool/shared/ses-send`) when `SENDER_EMAIL` is set, recipient email exists, and `OUTREACH_AUTO_SEND` is not `0`. Sandbox: verify recipient in SES. |
| **CORS on Express** | Disabled when `AWS_LAMBDA_FUNCTION_NAME` is set; **Function URL CORS** in CDK allows `*`. Browser calls to the Function URL are OK. |
| **Security headers** | **`helmet`** (CSP disabled for JSON API) + **`X-Request-Id`** on every response (echoes inbound `X-Request-Id` / `X-Correlation-Id` or generates UUID). |
| **API Lambda timeout (29s)** | Long work must stay in the **worker** Lambda; HTTP handler only invokes worker and returns **202**. |
| **Worker env / secrets** | Same connectors as API must be configured on **both** Lambdas in AWS (Groq, Explorium, Brave, etc.). |
| **Playwright** | Optional; zip worker bundles with Playwright **external** — runtime Playwright in Lambda requires Docker image or layer; `PLAYWRIGHT_ENABLED=0` is safe default. |

---

## Stress / load testing (current scale)

At “small team” scale, focus on **correctness and failure modes**, not millions of RPS.

1. **API smoke** (script above) after every deploy.
2. **Concurrency:** two browser tabs starting **Discover** — second should get **409** if a run is already `running` (verify Dynamo state).
3. **Worker failure:** stop worker or break a key — UI should show failed run / activity (poll path).
4. **Optional tools:** [k6](https://k6.io/) or `hey` against `GET /api/health` and `GET /api/prospects` with low VUs to find cold-start ceilings — not required for MVP.

---

## Gaps & roadmap

1. **More Vitest coverage:** pipeline-worker (mocked AWS), web `main.js` routing.
2. **Integration test** against local API or staging URL (create → list → delete prospect).
3. **Optional:** extend CI with `npm run build:infra` and a **staging** smoke (Function URL as repo secret).

---

## Quick manual QA checklist (after deploy)

- [ ] Vercel: `VITE_API_URL` or `api-config.json` points to current Function URL.
- [ ] Dashboard loads stats; no console CORS errors.
- [ ] Prospects list (default + “all/hidden” toggle if present).
- [ ] Settings page shows connector status; run one connector test.
- [ ] Discover (small limit) completes or fails visibly; pipeline run list updates.
- [ ] Bookings / tools pages load (may be empty).

---

## Summary

Nothing in the recent **API base / `api-config` / boot order** changes intentionally breaks local dev: **dev** uses the Vite proxy with `PROD === false`, so the “API not configured” screen only appears in **production builds** without an API URL. Use the smoke script plus the checklist above to keep releases safe until automated tests land.
