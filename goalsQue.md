# Goals queue — mission: complete Outreach Tool (E2E production-ready)

**Mission:** Ship a working agentic prospecting + outreach system: **Vercel UI → Lambda API → worker → DynamoDB/SES**, with tests and CI. **Upgrade the workspace** so the application is **enterprise-oriented**: secure API surface, stable UI, observable runs, and **operator confidence** (verification, docs, automation).

**Operator loop:** Take the **next task** below → implement → run tests → remove the task from this queue → re-read mission → append one new logical task → repeat until the user sends **`Sieze`** (stop signal).

---

## Queue (next task = top)

1. [ ] **Web UI: Pipeline run detail** — On **Runs** view, allow opening a run (hash query or modal) and **`GET /api/pipeline/runs/:id`** to show full `errors[]`, `duration_ms`, and config JSON.
2. [ ] **Observability: structured JSON logs in Lambda** — Document using `AWS_LAMBDA_LOG_FORMAT=JSON` (Node 22+) or ensure `console.log(JSON.stringify({...}))` pattern for worker/API (doc-only if runtime is 20).
3. [ ] **Calendly webhook: idempotency** — Store processed event IDs in Dynamo to avoid duplicate bookings on webhook retries.

---

## Completed (archived)

- **2025-03-22 — Shared `prospect-schema` Vitest** — `packages/shared` (5 tests).
- **2025-03-22 — CI `npm test` (all workspaces)** — web + shared + api.
- **2025-03-22 — Web `api.js` Vitest** — `api.test.js` (3), `__resetApiConfigForTests`.
- **2025-03-22 — ESLint flat config** — root `eslint.config.js`, `npm run lint`.
- **2025-03-22 — CI lint step** — runs before build + test.
- **2025-03-22 — `scripts/api-smoke.mjs`** — `npm run smoke:api` (requires `BASE_URL`).
- **2025-03-22 — `docs/GO_LIVE.md`** — go-live checklist.
- **2025-03-22 — `strict-gate` unit tests** — `strict-gate.test.js` (4 tests).
- **2025-03-24 — Deploy verification automation** — `scripts/lib/smoke-http.mjs`, `npm run verify:deploy`, GitHub **Deploy smoke** workflow (`LAMBDA_FUNCTION_URL` secret).
- **2025-03-24 — Integration test** — `supertest` + `app.integration.test.js` (`GET /api/health`, `X-Request-Id`).
- **2025-03-24 — SES unified in `@outreach-tool/shared/ses-send`** — API worker + app + agents CLI share one module.
- **2025-03-24 — API hardening** — `helmet` (CSP off for JSON API), **`X-Request-Id`** / echo `x-correlation-id`.
- **2025-03-24 — Observable runs** — **`GET /api/pipeline/runs/:id`** returns run + **`duration_ms`**; settings catalog updated; `app.pipeline-run.test.js`.
- **2025-03-24 — CI CDK synth** — Job **`cdk-synth`** runs `npx cdk synth --quiet` in `infra/` (`.github/workflows/ci.yml`).
- **2025-03-24 — Enterprise edge doc** — `docs/GO_LIVE.md` §7 (WAF, logs, secrets).

---

## Stop

When the user messages **`Sieze`**, pause the operator loop and leave the queue as-is.
