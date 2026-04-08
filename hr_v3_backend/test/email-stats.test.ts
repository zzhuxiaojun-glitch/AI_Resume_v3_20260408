import { describe, it, expect } from "bun:test";
import { mockDb } from "./setup";
import { app } from "../src/app";

function chainable(val: any): any {
  return new Proxy(() => {}, {
    get(_t, prop) {
      if (prop === "then")
        return (ok: any, fail: any) => Promise.resolve(val).then(ok, fail);
      if (prop === "catch")
        return (fail: any) => Promise.resolve(val).catch(fail);
      if (typeof prop === "symbol") return undefined;
      return (..._: any[]) => chainable(val);
    },
    apply() { return chainable(val); },
  });
}

describe("Email Stats API", () => {
  describe("GET /api/email/stats", () => {
    it("returns 200 with correct structure", async () => {
      const orig = mockDb.select;
      let callCount = 0;
      mockDb.select = (..._: any[]) => {
        callCount++;
        if (callCount === 1) {
          // emailProcessLogs groupBy → breakdown rows
          return chainable([
            { classification: "resume", status: "scored", hasResumeAttachment: true, count: 1994 },
            { classification: "resume", status: "parsed", hasResumeAttachment: true, count: 1346 },
            { classification: "resume", status: "scored", hasResumeAttachment: false, count: 1 },
            { classification: "resume", status: "error", hasResumeAttachment: true, count: 18 },
            { classification: "not_resume", status: "skipped", hasResumeAttachment: false, count: 579 },
            { classification: "uncertain", status: "fetched", hasResumeAttachment: false, count: 2 },
          ]);
        }
        if (callCount === 2) {
          // candidates total
          return chainable([{ total: 3379, withScore: 3167 }]);
        }
        // resumes count
        if (callCount >= 3) mockDb.select = orig;
        return chainable([{ total: 3378, withFile: 519 }]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/email/stats"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      // emails
      expect(body.emails).toBeDefined();
      expect(body.emails.total).toBe(1994 + 1346 + 1 + 18 + 579 + 2);
      expect(body.emails.byClassification).toBeDefined();
      expect(body.emails.byClassification.resume).toBe(1994 + 1346 + 1 + 18);
      expect(body.emails.byClassification.not_resume).toBe(579);
      expect(body.emails.byClassification.uncertain).toBe(2);
      expect(body.emails.byStatus).toBeDefined();
      expect(body.emails.byStatus.scored).toBe(1994 + 1);
      expect(body.emails.byStatus.parsed).toBe(1346);
      expect(body.emails.byStatus.skipped).toBe(579);
      expect(body.emails.byStatus.error).toBe(18);
      expect(body.emails.byStatus.fetched).toBe(2);
      expect(Array.isArray(body.emails.breakdown)).toBe(true);
      expect(body.emails.breakdown.length).toBe(6);

      // candidates
      expect(body.candidates).toBeDefined();
      expect(body.candidates.total).toBe(3379);
      expect(body.candidates.withScore).toBe(3167);
      expect(body.candidates.withoutScore).toBe(3379 - 3167);

      // resumes
      expect(body.resumes).toBeDefined();
      expect(body.resumes.total).toBe(3378);
      expect(body.resumes.withFile).toBe(519);
      expect(body.resumes.withoutFile).toBe(3378 - 519);
    });

    it("handles empty database gracefully", async () => {
      const orig = mockDb.select;
      let callCount = 0;
      mockDb.select = (..._: any[]) => {
        callCount++;
        if (callCount === 1) return chainable([]);
        if (callCount === 2) return chainable([{ total: 0, withScore: 0 }]);
        if (callCount >= 3) mockDb.select = orig;
        return chainable([{ total: 0, withFile: 0 }]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/email/stats"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.emails.total).toBe(0);
      expect(body.emails.byClassification).toEqual({});
      expect(body.emails.byStatus).toEqual({});
      expect(body.emails.breakdown).toEqual([]);
      expect(body.candidates.total).toBe(0);
      expect(body.candidates.withScore).toBe(0);
      expect(body.candidates.withoutScore).toBe(0);
      expect(body.resumes.total).toBe(0);
      expect(body.resumes.withFile).toBe(0);
      expect(body.resumes.withoutFile).toBe(0);
    });
  });
});
