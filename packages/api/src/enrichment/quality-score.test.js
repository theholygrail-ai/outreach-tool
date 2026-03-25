import { describe, it, expect } from "vitest";
import {
  adjustScoreForDiscoveryPipeline,
  calculateQualityScore,
  hasResolvableCompanyWebsite,
} from "./quality-score.js";

describe("calculateQualityScore", () => {
  it("caps at 100", () => {
    const prospect = {
      first_name: "A",
      last_name: "B",
      executive_role: "CEO",
      email: "a@company.com",
    };
    const verification = {
      website_live: true,
      company_found_in_search: true,
      email_format_valid: true,
      email_domain_matches_website: true,
      phone_format_valid: true,
      contacts_from_website: true,
      email_domain_mx_ok: true,
      company_registry_match: true,
      abstract_email: { deliverability: "DELIVERABLE" },
      cross_checks: {
        data_validity_score: 100,
        by_field: { email: "match", phone: "match" },
        conflicts: { email: false, phone: false },
      },
    };
    const s = calculateQualityScore(prospect, verification);
    expect(s).toBeLessThanOrEqual(100);
    expect(s).toBeGreaterThan(60);
  });

  it("penalizes disposable abstract flag", () => {
    const prospect = { first_name: "A", last_name: "B", email: "x@y.com" };
    const verification = {
      website_live: true,
      email_format_valid: true,
      abstract_email: { is_disposable_email: { value: true } },
      cross_checks: { data_validity_score: 40, by_field: {}, conflicts: {} },
    };
    const s = calculateQualityScore(prospect, verification);
    const baseline = calculateQualityScore(prospect, {
      ...verification,
      abstract_email: null,
      cross_checks: { data_validity_score: 50, by_field: {}, conflicts: {} },
    });
    expect(s).toBeLessThan(baseline);
  });

  it("hasResolvableCompanyWebsite accepts bare domains", () => {
    expect(hasResolvableCompanyWebsite("example.com")).toBe(true);
    expect(hasResolvableCompanyWebsite("https://www.example.com/path")).toBe(true);
    expect(hasResolvableCompanyWebsite("")).toBe(false);
    expect(hasResolvableCompanyWebsite("not a url")).toBe(false);
  });

  it("adjustScoreForDiscoveryPipeline boosts Groq-sourced leads with a website", () => {
    const prospect = {
      source_trace: "groq:llm-fallback",
      company_website: "epsilon-it.ae",
    };
    expect(adjustScoreForDiscoveryPipeline(prospect, 0)).toBe(36);
  });

  it("adjustScoreForDiscoveryPipeline boosts Explorium-sourced leads", () => {
    const prospect = { source_trace: "explorium:abc123", company_website: null };
    expect(adjustScoreForDiscoveryPipeline(prospect, 5)).toBe(23);
  });

  it("adjustScoreForDiscoveryPipeline boosts Apollo discovery leads", () => {
    const prospect = { source_trace: "apollo:discovery", company_website: null };
    expect(adjustScoreForDiscoveryPipeline(prospect, 0)).toBe(20);
  });
});
