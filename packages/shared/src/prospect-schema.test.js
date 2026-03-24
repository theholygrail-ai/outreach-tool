import { describe, it, expect } from "vitest";
import { createProspect, isProspectListVisible, PROSPECT_FIELDS } from "./prospect-schema.js";

describe("prospect-schema", () => {
  it("createProspect assigns id and defaults status discovered", () => {
    const p = createProspect({ company_name: "Acme", email: "a@acme.com" });
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(p.status).toBe("discovered");
    expect(p.outreach_status).toBe("discovered");
    expect(p.company_name).toBe("Acme");
    expect(p.email).toBe("a@acme.com");
  });

  it("createProspect respects explicit status and display_eligible", () => {
    const p = createProspect({ status: "enriched", display_eligible: false });
    expect(p.status).toBe("enriched");
    expect(p.display_eligible).toBe(false);
  });

  it("createProspect preserves display_eligible undefined as undefined", () => {
    const p = createProspect({ company_name: "X" });
    expect(p.display_eligible).toBeUndefined();
  });

  it("isProspectListVisible hides list_ready === false before display_eligible", () => {
    expect(isProspectListVisible({ list_ready: false, display_eligible: true })).toBe(false);
    expect(isProspectListVisible({ list_ready: true, display_eligible: false })).toBe(false);
    expect(isProspectListVisible({ list_ready: true, display_eligible: true })).toBe(true);
  });

  it("isProspectListVisible is false only when display_eligible === false (legacy list_ready)", () => {
    expect(isProspectListVisible({ display_eligible: true })).toBe(true);
    expect(isProspectListVisible({ display_eligible: undefined })).toBe(true);
    expect(isProspectListVisible({})).toBe(true);
    expect(isProspectListVisible({ display_eligible: false })).toBe(false);
  });

  it("PROSPECT_FIELDS includes core keys", () => {
    expect(PROSPECT_FIELDS).toContain("email");
    expect(PROSPECT_FIELDS).toContain("display_eligible");
    expect(PROSPECT_FIELDS).toContain("list_ready");
    expect(PROSPECT_FIELDS).toContain("enrichment_status");
  });
});
