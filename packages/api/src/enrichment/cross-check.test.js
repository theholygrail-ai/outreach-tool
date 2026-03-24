import { describe, it, expect } from "vitest";
import { runCrossCheck } from "./cross-check.js";

describe("runCrossCheck", () => {
  it("flags email match when snapshot and final agree and appear on site", () => {
    const snapshot = { email: "x@acme.com" };
    const prospect = { email: "x@acme.com" };
    const r = runCrossCheck({
      snapshot,
      prospect,
      extracted_emails: ["x@acme.com"],
      email_domain_mx_ok: true,
    });
    expect(r.by_field.email).toBe("match");
    expect(r.signals).toContain("email_domain_mx_ok");
    expect(r.data_validity_score).toBeGreaterThan(50);
  });

  it("detects email conflict when domains differ", () => {
    const snapshot = { email: "a@other.com" };
    const prospect = { email: "b@acme.com" };
    const r = runCrossCheck({
      snapshot,
      prospect,
      extracted_emails: ["b@acme.com"],
    });
    expect(r.conflicts.email).toBe(true);
    expect(r.signals).toContain("email_source_conflict");
  });
});
