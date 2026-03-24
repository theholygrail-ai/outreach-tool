import { describe, it, expect, vi } from "vitest";

vi.mock("@outreach-tool/shared/config", () => ({
  config: {
    enrichment: {
      strictMinQuality: 50,
      strictRequireContact: true,
    },
  },
}));

import { strictDisplayGate } from "./strict-gate.js";

describe("strictDisplayGate", () => {
  it("rejects when quality below strictMinQuality", () => {
    const r = strictDisplayGate(
      { quality_score: 40, email: "a@b.com", phone_number: "1" },
      { quality_score: 40 },
    );
    expect(r.display_eligible).toBe(false);
    expect(r.rejection_reason).toMatch(/quality/);
  });

  it("rejects when email+phone pair missing (linkedin alone not enough with email only)", () => {
    const r = strictDisplayGate(
      { quality_score: 80, email: "a@b.com", phone_number: "", linkedin_url: "" },
      { quality_score: 80 },
    );
    expect(r.display_eligible).toBe(false);
    expect(r.rejection_reason).toBe("missing_required_contact_fields");
  });

  it("accepts when quality ok and email+phone present", () => {
    const r = strictDisplayGate(
      { quality_score: 80, email: "a@b.com", phone_number: "+15551212" },
      { quality_score: 80 },
    );
    expect(r.display_eligible).toBe(true);
  });

  it("accepts email + linkedin without phone", () => {
    const r = strictDisplayGate(
      { quality_score: 80, email: "a@b.com", phone_number: "", linkedin_url: "https://linkedin.com/in/x" },
      { quality_score: 80 },
    );
    expect(r.display_eligible).toBe(true);
  });
});
