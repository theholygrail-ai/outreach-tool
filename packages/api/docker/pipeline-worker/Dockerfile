# Build context: repository root (OutreachTool/)
FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY package.json package-lock.json ./
COPY packages packages
COPY infra infra

RUN npm ci --omit=dev

# ESM bundle; Playwright is external (installed below) so Chromium binaries resolve at runtime
RUN npx --yes esbuild@0.24 packages/api/src/worker-lambda.js \
  --bundle --platform=node --target=node20 --format=esm \
  --outfile=${LAMBDA_TASK_ROOT}/handler.js \
  --external:playwright \
  --external:playwright-core

# Runtime deps for dynamic import("playwright")
RUN npm install playwright@1.49.1 --omit=dev --no-save
RUN npx playwright install chromium || true

ENV PLAYWRIGHT_ENABLED=0

CMD ["handler.handler"]
