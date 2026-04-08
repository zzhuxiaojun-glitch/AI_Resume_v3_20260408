import { describe, it, expect, beforeEach } from "bun:test";
import { setMockPollInbox } from "./setup";
import { app } from "../src/app";

describe("POST /api/email/poll", () => {
  beforeEach(() => {
    setMockPollInbox(["cand-1"]);
  });

  it("returns 400 when positionId is missing", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/email/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("positionId");
  });

  it("returns 200 with candidateIds on success", async () => {
    setMockPollInbox(["cand-1", "cand-2"]);

    const res = await app.handle(
      new Request("http://localhost/api/email/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId: "pos-1", limit: 5 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidateIds).toEqual(["cand-1", "cand-2"]);
    expect(body.count).toBe(2);
  });

  it("returns 500 when pollInbox throws", async () => {
    setMockPollInbox([], new Error("IMAP connection failed"));

    const res = await app.handle(
      new Request("http://localhost/api/email/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId: "pos-1" }),
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("IMAP connection failed");
  });
});
