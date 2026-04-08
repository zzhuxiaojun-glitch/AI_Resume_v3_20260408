import { describe, it, expect } from "bun:test";
import { app } from "../src/app";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
