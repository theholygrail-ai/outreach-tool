# Pipeline Worker (Docker)

The CDK `PipelineWorkerFn` is built from [`pipeline-worker/Dockerfile`](pipeline-worker/Dockerfile) (repository root as build context). It bundles `worker-lambda.js` with esbuild and installs Playwright separately so Chromium can be used when `PLAYWRIGHT_ENABLED=1` on the Lambda.

## Requirements

- Docker (for `cdk deploy` / `cdk synth` when the worker stack is included)
- `npm ci` must succeed at the repo root inside the image (all workspaces are copied)

## Local smoke

```bash
# From repo root
docker build -f packages/api/docker/pipeline-worker/Dockerfile -t outreach-pipeline-worker .
```

## Environment

| Variable | Description |
|----------|-------------|
| `PLAYWRIGHT_ENABLED` | `1` to run headless Chromium during deep enrichment (default `0` in image) |
| `ENRICH_MAX_PAGES` | Max pages to fetch per prospect (default `8`) |
| `STRICT_MIN_QUALITY` | Minimum quality score for default list visibility (default `45`) |
| `STRICT_REQUIRE_CONTACT` | `0` to disable requiring (email+phone) or (email+linkedin) |

Set these on the **Pipeline Worker** Lambda in AWS after deploy (same as other API keys).

## Fallback without Docker

If you cannot build the Docker image, temporarily replace `DockerImageFunction` with `NodejsFunction` in `infra/lib/api-stack.js` and deploy the worker as a zip bundle (Playwright should stay disabled: `PLAYWRIGHT_ENABLED=0`).
