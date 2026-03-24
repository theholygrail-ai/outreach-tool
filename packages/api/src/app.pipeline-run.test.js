import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("./db.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getPipelineRun: vi.fn().mockResolvedValue({
      id: "run-1",
      status: "completed",
      started_at: "2025-01-01T00:00:00.000Z",
      completed_at: "2025-01-01T00:05:00.000Z",
      prospects_processed: 3,
      config: { mode: "process" },
    }),
  };
});

const { app } = await import("./app.js");

describe("GET /api/pipeline/runs/:id", () => {
  it("returns run with duration_ms", async () => {
    const res = await request(app).get("/api/pipeline/runs/run-1").expect(200);
    expect(res.body.id).toBe("run-1");
    expect(res.body.duration_ms).toBe(5 * 60 * 1000);
    expect(res.headers["x-request-id"]).toBeDefined();
  });
});
