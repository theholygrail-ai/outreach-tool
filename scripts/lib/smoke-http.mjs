/**
 * Shared HTTP smoke checks against a deployed API base URL.
 * @param {string} base - e.g. https://xxx.lambda-url.region.on.aws (no trailing slash)
 * @returns {Promise<{ ok: boolean }>}
 */
export async function runApiSmokeChecks(base) {
  const normalized = String(base || "")
    .trim()
    .replace(/\/+$/, "");
  const paths = [
    "/api/health",
    "/api/health/ready",
    "/api/prospects?visibility=default",
    "/api/pipeline/status",
  ];

  let failed = false;
  for (const p of paths) {
    const url = `${normalized}${p}`;
    process.stdout.write(`GET ${url} ... `);
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      const text = await r.text();
      if (!r.ok) {
        console.log(`FAIL ${r.status}`);
        failed = true;
        continue;
      }
      console.log(`OK ${r.status}`);
      if (text.length > 200) console.log(`  ${text.slice(0, 200)}...`);
      else if (text) console.log(`  ${text}`);
    } catch (e) {
      console.log(`ERROR ${e.message}`);
      failed = true;
    }
  }

  if (!failed) console.log("\napi-smoke: all checks passed.");
  return { ok: !failed };
}
