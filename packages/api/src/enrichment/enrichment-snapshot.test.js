import { describe, it, expect } from "vitest";
import { takeEnrichmentSnapshot, buildFieldResolution } from "./enrichment-snapshot.js";

describe("enrichment snapshot", () => {
  it("buildFieldResolution marks vendor when unchanged", () => {
    const snap = takeEnrichmentSnapshot({
      email: "a@b.com",
      phone_number: null,
      first_name: "Ann",
      last_name: "Bee",
      linkedin_url: null,
      executive_role: "CEO",
      data_sources: ["explorium"],
    });
    const prospect = {
      email: "a@b.com",
      phone_number: null,
      first_name: "Ann",
      last_name: "Bee",
      linkedin_url: null,
      executive_role: "CEO",
    };
    const fr = buildFieldResolution(snap, prospect, {});
    expect(fr.email).toBe("vendor");
    expect(fr.first_name).toBe("vendor");
  });

  it("buildFieldResolution marks website when filled from site", () => {
    const snap = takeEnrichmentSnapshot({ email: null, data_sources: [] });
    const prospect = { email: "found@site.com" };
    const fr = buildFieldResolution(snap, prospect, { email: true });
    expect(fr.email).toBe("website");
  });

  it("buildFieldResolution marks rejected when audit cleared vendor LinkedIn", () => {
    const snap = takeEnrichmentSnapshot({
      linkedin_url: "https://linkedin.com/in/bad",
      data_sources: [],
    });
    const prospect = { linkedin_url: null };
    const fr = buildFieldResolution(snap, prospect, {}, { linkedin_url: true });
    expect(fr.linkedin_url).toBe("rejected");
  });
});
