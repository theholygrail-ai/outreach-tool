import { describe, it, expect, vi } from "vitest";

vi.mock("@outreach-tool/shared/config", () => ({
  config: {
    enrichment: {
      strictMinQuality: 50,
      strictRequireContact: true,
      strictContactMode: "any_one_contact",
    },
  },
}));

import { strictDisplayGate } from "./strict-gate.js";

describe("strictDisplayGate any_one_contact", () => {
  it("accepts phone only when 10+ digits", () => {
    const r = strictDisplayGate(
      { quality_score: 80, email: "", phone_number: "+1 555 123 4567", linkedin_url: "" },
      { quality_score: 80, website_live: true },
    );
    expect(r.display_eligible).toBe(true);
  });

  it("accepts LinkedIn /in/ URL only", () => {
    const r = strictDisplayGate(
      {
        quality_score: 80,
        email: "",
        phone_number: "",
        linkedin_url: "https://www.linkedin.com/in/someone",
      },
      { quality_score: 80 },
    );
    expect(r.display_eligible).toBe(true);
  });

  it("rejects when no email, short phone, no linkedin", () => {
    const r = strictDisplayGate(
      { quality_score: 80, email: "", phone_number: "123", linkedin_url: "" },
      { quality_score: 80 },
    );
    expect(r.display_eligible).toBe(false);
  });
});
