# Go-live checklist (production outreach)

Use this before pointing real prospects or sending real email.

## 1. AWS

- [ ] CDK stacks deployed: **Data** + **Api** (HTTP Lambda + **pipeline worker** Lambda).
- [ ] **Function URL** copied; **both** Lambdas have the same env vars as local `.env` (keys in Console, not in git).
- [ ] **IAM:** Worker role can **SES SendEmail**, **DynamoDB**, **S3**, **invoke** (if applicable).
- [ ] **SES:** Verified **sender** identity (`SENDER_EMAIL`); sandbox recipients verified **or** production access approved.

## 2. Outreach email

- [ ] `SENDER_EMAIL` + `CALENDLY_LINK` set on **worker** Lambda.
- [ ] `OUTREACH_AUTO_SEND` — unset or `1` for real sends; `0` for drafts only; `OUTREACH_DRY_RUN=1` only in staging.
- [ ] Test one prospect through **`outreach_ready`** with a **verified** recipient (sandbox) before broad send.

## 3. Vercel / web

- [ ] `VITE_API_URL` **or** `public/api-config.json` → correct Function URL (no trailing slash).
- [ ] Production deploy loads dashboard without CORS errors (browser devtools).

## 4. Verification commands

```bash
npm test
npm run lint
npm run build:web
```

Deployed API (any OS):

```bash
BASE_URL=https://YOUR.lambda-url.region.on.aws npm run smoke:api
# Stricter URL validation first:
BASE_URL=https://YOUR.lambda-url.region.on.aws npm run verify:deploy
```

**GitHub:** add secret `LAMBDA_FUNCTION_URL`, then run workflow **Deploy smoke** (`.github/workflows/deploy-smoke.yml`) after each production deploy.

PowerShell (extended):

```powershell
.\scripts\e2e-smoke.ps1 -BaseUrl "https://YOUR.lambda-url.region.on.aws"
```

## 5. Legal / compliance (operator responsibility)

- [ ] Consent, opt-out, and regional rules (e.g. GDPR, CAN-SPAM) are satisfied for your lists and copy.
- [ ] Suppression / bounce handling aligned with your org policy.

## 6. After launch

- [ ] CloudWatch alarms on Lambda errors and duration.
- [ ] Revisit **`docs/AUDIT.md`** for ongoing quality gates.

## 7. Enterprise edge (optional, recommended at scale)

- [ ] **Throttling / WAF:** Put **API Gateway** or **CloudFront + WAF** in front of the Lambda Function URL (or migrate to API Gateway HTTP API) for rate limits, IP allowlists, and AWS WAF rules.
- [ ] **Logs:** Set Lambda **log retention** (e.g. 30–90 days) and log-based alarms on `ERROR` / high duration.
- [ ] **Secrets:** Prefer **SSM Parameter Store** or **Secrets Manager** for API keys over long-lived plain env vars in the console (rotate regularly).
