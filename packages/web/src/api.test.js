import { describe, it, expect, vi, beforeEach } from "vitest";
import { initApiConfig, getApiBase, apiUrl, __resetApiConfigForTests } from "./api.js";

describe("api base resolution", () => {
  beforeEach(() => {
    __resetApiConfigForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );
  });

  it("initApiConfig uses api-config.json apiBase when present", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apiBase: "https://lambda.example.aws/" }),
    });
    await initApiConfig();
    expect(getApiBase()).toBe("https://lambda.example.aws");
    expect(apiUrl("/api/prospects")).toBe("https://lambda.example.aws/api/prospects");
  });

  it("initApiConfig ignores empty apiBase in json", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apiBase: "  " }),
    });
    await initApiConfig();
    expect(getApiBase()).toBe("");
  });

  it("apiUrl returns absolute path unchanged", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
    await initApiConfig();
    expect(apiUrl("https://other.com/x")).toBe("https://other.com/x");
  });
});
