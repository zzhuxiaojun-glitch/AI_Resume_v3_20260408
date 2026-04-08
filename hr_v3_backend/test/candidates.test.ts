import { describe, it, expect } from "bun:test";
import { mockDb, FAKE_CANDIDATE, FAKE_SCORE } from "./setup";
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

describe("Candidates API", () => {
  describe("GET /api/candidates", () => {
    it("returns 200 with array", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("accepts positionId query parameter", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates?positionId=pos-1"),
      );
      expect(res.status).toBe(200);
    });

    it("accepts grade query parameter", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates?grade=A"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("accepts status query parameter", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates?status=screening"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("accepts multiple filters combined", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates?positionId=pos-1&grade=B&status=screening"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("accepts universityTier query parameter", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates?universityTier=S"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("accepts jlptLevel query parameter", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates?jlptLevel=N2"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("GET /api/candidates/:id", () => {
    it("returns 200 with candidate + scores for existing", async () => {
      const orig = mockDb.select;
      let call = 0;
      mockDb.select = (..._: any[]) => {
        call++;
        if (call === 1) return chainable([FAKE_CANDIDATE]);
        mockDb.select = orig;
        return chainable([FAKE_SCORE]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/candidates/cand-1"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.scores).toBeDefined();
    });

    it("returns 404 for non-existent candidate", async () => {
      const orig = mockDb.select;
      mockDb.select = (..._: any[]) => { mockDb.select = orig; return chainable([]); };

      const res = await app.handle(
        new Request("http://localhost/api/candidates/non-existent"),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/candidates/stats", () => {
    it("returns 200 with total/byGrade/byStatus/byUniversityTier/byJlptLevel", async () => {
      const orig = mockDb.select;
      let call = 0;
      mockDb.select = (..._: any[]) => {
        call++;
        if (call >= 5) mockDb.select = orig;
        return chainable([{ count: 2, grade: "B", status: "screening", tier: "A", level: "N2" }]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/candidates/stats"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBeDefined();
      expect(body.byGrade).toBeDefined();
      expect(body.byStatus).toBeDefined();
      expect(body.byUniversityTier).toBeDefined();
      expect(body.byJlptLevel).toBeDefined();
    });
  });

  describe("GET /api/candidates/export", () => {
    it("returns CSV with UTF-8 BOM and correct Content-Type", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates/export"),
      );
      expect(res.status).toBe(200);
      const ct = res.headers.get("content-type") ?? "";
      expect(ct.toLowerCase()).toContain("text/csv");
      const text = await res.text();
      // UTF-8 BOM
      expect(text.charCodeAt(0)).toBe(0xFEFF);
    });

    it("CSV contains header row", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates/export"),
      );
      const text = await res.text();
      expect(text).toContain("名前");
    });

    it("returns Content-Disposition attachment header", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates/export"),
      );
      const cd = res.headers.get("content-disposition") ?? "";
      expect(cd).toContain("attachment");
      expect(cd).toContain(".csv");
    });
  });

  describe("GET /api/candidates/search", () => {
    it("returns empty array when q is empty", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates/search?q="),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });

    it("returns results when q matches name", async () => {
      const orig = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = orig;
        return chainable([FAKE_CANDIDATE]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/candidates/search?q=张三"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("respects limit parameter (max 100)", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates/search?q=test&limit=200"),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("PATCH /api/candidates/:id", () => {
    it("returns 200 when updating existing candidate", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/candidates/cand-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "shortlisted", notes: "优秀候选人" }),
        }),
      );
      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent candidate", async () => {
      const orig = mockDb.update;
      mockDb.update = (..._: any[]) => { mockDb.update = orig; return chainable([]); };

      const res = await app.handle(
        new Request("http://localhost/api/candidates/non-existent", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "rejected" }),
        }),
      );
      expect(res.status).toBe(404);
    });
  });
});
