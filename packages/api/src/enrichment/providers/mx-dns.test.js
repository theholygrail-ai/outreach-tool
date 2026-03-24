import { describe, it, expect } from "vitest";
import { resolveMxForDomain } from "./mx-dns.js";

describe("resolveMxForDomain", () => {
  it("returns ok false for empty domain", async () => {
    const r = await resolveMxForDomain("");
    expect(r.ok).toBe(false);
    expect(r.mx_hosts).toEqual([]);
  });

});
