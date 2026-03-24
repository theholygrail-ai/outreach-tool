import { describe, it, expect, vi } from "vitest";
import {
  parseLinkedInUrl,
  slugMatchesPersonName,
  extractAllLinkedInUrls,
  auditLinkedInAffiliation,
} from "./linkedin-audit.js";

describe("parseLinkedInUrl", () => {
  it("detects person vs company", () => {
    expect(parseLinkedInUrl("https://www.linkedin.com/in/jane-doe-123").type).toBe("person");
    expect(parseLinkedInUrl("https://linkedin.com/company/acme-corp").type).toBe("company");
  });
});

describe("slugMatchesPersonName", () => {
  it("matches hyphenated slug", () => {
    expect(slugMatchesPersonName("jane-doe-9911", "Jane", "Doe")).toBe(true);
  });
  it("rejects unrelated slug", () => {
    expect(slugMatchesPersonName("random-user-12", "Jane", "Doe")).toBe(false);
  });
});

describe("extractAllLinkedInUrls", () => {
  it("collects multiple URLs", () => {
    const t = "See https://linkedin.com/in/a and also https://www.linkedin.com/company/foo-bar/";
    const u = extractAllLinkedInUrls(t);
    expect(u.length).toBe(2);
  });
});

describe("auditLinkedInAffiliation", () => {
  it("rejects company page for contact field", async () => {
    const p = { linkedin_url: "https://www.linkedin.com/company/acme", company_name: "Acme" };
    const r = await auditLinkedInAffiliation(p, "some text", null);
    expect(r.status).toBe("company_page");
    expect(r.action).toBe("clear");
  });

  it("verifies person slug matching name on site", async () => {
    const url = "https://www.linkedin.com/in/jane-smith";
    const content = `Our team: ${url} is our director.`;
    const p = {
      linkedin_url: url,
      first_name: "Jane",
      last_name: "Smith",
      company_name: "Co",
    };
    const r = await auditLinkedInAffiliation(p, content, null);
    expect(r.status).toBe("verified");
    expect(r.action).toBe("keep");
  });

  it("calls Groq when on site but slug does not match name", async () => {
    const url = "https://www.linkedin.com/in/someone-else";
    const content =
      `Jane Smith handles accounts at TestCo Inc. Employee profile ${url} ` +
      "is provided for reference. Additional service information available upon request.";
    const p = {
      linkedin_url: url,
      first_name: "Jane",
      last_name: "Smith",
      company_name: "TestCo Inc",
    };
    const askGroq = vi.fn().mockResolvedValue({ affiliated: true, confidence: 0.9, reason: "Named on team page" });
    const r = await auditLinkedInAffiliation(p, content, askGroq);
    expect(askGroq).toHaveBeenCalled();
    expect(r.status).toBe("verified");
  });
});
