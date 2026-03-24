import { describe, it, expect } from "vitest";
import {
  emailLiteralInText,
  phoneDigitsInText,
  rolePhraseInText,
  sanitizeGroqWebsiteContacts,
} from "./grounding.js";

describe("grounding", () => {
  it("emailLiteralInText requires exact address in text", () => {
    expect(emailLiteralInText("a@b.com", "write to a@b.com today")).toBe(true);
    expect(emailLiteralInText("fake@x.com", "write to a@b.com today")).toBe(false);
  });

  it("phoneDigitsInText matches digit stream", () => {
    expect(phoneDigitsInText("+1 (555) 123-4567", "Call 555-123-4567 for help")).toBe(true);
    expect(phoneDigitsInText("555-999-9999", "Call 555-123-4567")).toBe(false);
  });

  it("sanitizeGroqWebsiteContacts drops hallucinated email", () => {
    const r = sanitizeGroqWebsiteContacts(
      { contact_email: "nope@evil.com", contact_name: "Jane Doe" },
      "Email us at hello@acme.com. Jane Doe is our CEO.",
    );
    expect(r.contact_email).toBeNull();
    expect(r.grounding_dropped).toContain("contact_email:not_in_page");
    expect(r.contact_name).toBe("Jane Doe");
  });

  it("rolePhraseInText", () => {
    expect(rolePhraseInText("Managing Director", "Our Managing Director leads sales")).toBe(true);
    expect(rolePhraseInText("VP of Imaginary", "Our CEO leads sales")).toBe(false);
  });
});
