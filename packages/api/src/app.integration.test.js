import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./app.js";

describe("HTTP API (integration)", () => {
  it("GET /api/health returns JSON ok", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.ts).toBe("number");
  });

  it("sets X-Request-Id (or echoes inbound id)", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("X-Request-Id", "trace-abc-123")
      .expect(200);
    expect(res.headers["x-request-id"]).toBe("trace-abc-123");
  });
});
