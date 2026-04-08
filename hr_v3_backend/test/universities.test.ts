import { describe, it, expect } from "bun:test";
import { mockDb, FAKE_UNIVERSITY } from "./setup";
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

describe("Universities API", () => {
  describe("GET /api/universities", () => {
    it("returns 200 with array", async () => {
      const orig = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = orig;
        return chainable([FAKE_UNIVERSITY]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/universities"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("accepts country query parameter", async () => {
      const orig = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = orig;
        return chainable([FAKE_UNIVERSITY]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/universities?country=CN"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("accepts tier query parameter", async () => {
      const orig = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = orig;
        return chainable([FAKE_UNIVERSITY]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/universities?tier=S"),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/universities/lookup", () => {
    it("returns 200 with tier for known university", async () => {
      const orig = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = orig;
        return chainable([FAKE_UNIVERSITY]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/universities/lookup?name=清华"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tier).toBe("S");
      expect(body.name).toBe("清华大学");
    });

    it("returns 404 for unknown university", async () => {
      const orig = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = orig;
        return chainable([]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/universities/lookup?name=不存在的大学"),
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 when name parameter is missing", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/universities/lookup"),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/universities/stats", () => {
    it("returns 200 with total/byTier/byCountry", async () => {
      const orig = mockDb.select;
      let callCount = 0;
      mockDb.select = (..._: any[]) => {
        callCount++;
        if (callCount >= 3) mockDb.select = orig;
        return chainable([{ count: 1 }]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/universities/stats"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBeDefined();
    });
  });
});
