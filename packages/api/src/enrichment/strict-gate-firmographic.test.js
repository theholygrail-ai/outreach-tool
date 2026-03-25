import { describe, it, expect, vi } from "vitest";

vi.mock("@outreach-tool/shared/config", () => ({
  config: {
    enrichment: {
      strictMinQuality: 50,
      strictRequireContact: true,
      strictContactMode: "firmographic",
    },
  },
}));

import { strictDisplayGate } from "./strict-gate.js";

describe("strictDisplayGate firmographic", () => {
  it("accepts company + live site + URL without person contact", () => {
    const r = strictDisplayGate(
      {
        quality_score: 80,
        company_name: "Acme Co",
        company_website: "https://acme.com",
        email: "",
        phone_number: "",
        linkedin_url: "",
      },
      { quality_score: 80, website_live: true },
    );
    expect(r.display_eligible).toBe(true);
  });

  it("rejects when site not live", () => {
    const r = strictDisplayGate(
      {
        quality_score: 80,
        company_name: "Acme Co",
        company_website: "https://acme.com",
      },
      { quality_score: 80, website_live: false },
    );
    expect(r.display_eligible).toBe(false);
  });
});
