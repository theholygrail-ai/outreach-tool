import { describe, it, expect, vi } from "vitest";

vi.mock("@outreach-tool/shared/config", () => ({
  config: {
    enrichment: {
      strictMinQuality: 50,
      strictRequireContact: true,
      strictContactMode: "email_only",
    },
  },
}));

import { strictDisplayGate } from "./strict-gate.js";

describe("strictDisplayGate with STRICT_CONTACT_MODE email_only", () => {
  it("accepts valid email without phone or linkedin", () => {
    const r = strictDisplayGate(
      { quality_score: 80, email: "a@b.com", phone_number: "", linkedin_url: "" },
      { quality_score: 80 },
    );
    expect(r.display_eligible).toBe(true);
  });

  it("rejects invalid email", () => {
    const r = strictDisplayGate(
      { quality_score: 80, email: "not-an-email", phone_number: "", linkedin_url: "" },
      { quality_score: 80 },
    );
    expect(r.display_eligible).toBe(false);
    expect(r.rejection_reason).toBe("missing_required_contact_fields");
  });
});
