import { describe, it, expect } from "bun:test";
import { mockDb } from "./setup";
import { app } from "../src/app";

/** 创建一个可链式调用且 await 时返回 val 的 mock */
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

describe("Positions API", () => {
  describe("GET /api/positions", () => {
    it("returns 200 with array", async () => {
      const res = await app.handle(new Request("http://localhost/api/positions"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("POST /api/positions", () => {
    it("returns 201 with created position", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "前端工程师", department: "研发部" }),
        }),
      );
      expect(res.status).toBe(201);
    });

    it("accepts skillConfig with must/nice/reject arrays", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "后端工程师",
            skillConfig: { must: ["TypeScript", "PostgreSQL"], nice: ["Docker"], reject: ["PHP"] },
          }),
        }),
      );
      expect(res.status).toBe(201);
    });

    it("accepts custom scoringWeights", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "技术岗",
            scoringWeights: { must: 0.65, nice: 0.20, education: 0.10, reject: 0.05 },
          }),
        }),
      );
      expect(res.status).toBe(201);
    });
  });

  describe("GET /api/positions/:id", () => {
    it("returns 200 for existing position", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/positions/pos-1"),
      );
      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent position", async () => {
      const orig = mockDb.select;
      mockDb.select = (..._: any[]) => { mockDb.select = orig; return chainable([]); };

      const res = await app.handle(
        new Request("http://localhost/api/positions/non-existent"),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/positions/:id", () => {
    it("returns 200 for existing position", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/positions/pos-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "高级前端工程师" }),
        }),
      );
      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent position", async () => {
      const orig = mockDb.update;
      mockDb.update = (..._: any[]) => { mockDb.update = orig; return chainable([]); };

      const res = await app.handle(
        new Request("http://localhost/api/positions/non-existent", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "test" }),
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/positions/:id", () => {
    it("returns 200 for existing position", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/positions/pos-1", {
          method: "DELETE",
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);
    });

    it("returns 404 for non-existent position", async () => {
      const orig = mockDb.delete;
      mockDb.delete = (..._: any[]) => { mockDb.delete = orig; return chainable([]); };

      const res = await app.handle(
        new Request("http://localhost/api/positions/non-existent", { method: "DELETE" }),
      );
      expect(res.status).toBe(404);
    });
  });
});
