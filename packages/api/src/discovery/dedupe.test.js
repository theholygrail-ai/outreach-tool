import { describe, it, expect } from "vitest";
import { discoveryDedupeKey, mergeDiscoveryRows } from "./dedupe.js";

describe("discovery dedupe", () => {
  it("mergeDiscoveryRows respects limit and dedupes by domain", () => {
    const seen = new Set();
    const out = [];
    mergeDiscoveryRows(
      [
        { company_name: "A", company_website: "https://a.com" },
        { company_name: "B", company_website: "https://b.com" },
        { company_name: "A2", company_website: "https://a.com" },
      ],
      seen,
      out,
      2,
    );
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.company_name)).toEqual(["A", "B"]);
  });

  it("discoveryDedupeKey falls back to name", () => {
    expect(discoveryDedupeKey({ company_name: "Acme Ltd", company_website: null })).toMatch(/^name:/);
  });
});
