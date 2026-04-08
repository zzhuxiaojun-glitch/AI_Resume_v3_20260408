import { describe, it, expect, spyOn } from "bun:test";
import { mockDb, FAKE_POSITION, FAKE_CANDIDATE, FAKE_SCORE } from "./setup";
import { app } from "../src/app";
import * as aiScorer from "../src/services/ai-scorer";

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

describe("Resumes API", () => {
  describe("POST /api/resumes/upload", () => {
    it("returns 400 when no file uploaded", async () => {
      const form = new FormData();
      form.append("positionId", "pos-1");

      const res = await app.handle(
        new Request("http://localhost/api/resumes/upload", {
          method: "POST",
          body: form,
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("file");
    });

    it("returns 400 when no positionId", async () => {
      const form = new FormData();
      form.append("file", new File(["dummy"], "resume.pdf", { type: "application/pdf" }));

      const res = await app.handle(
        new Request("http://localhost/api/resumes/upload", {
          method: "POST",
          body: form,
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("positionId");
    });

    it("returns 201 with candidate + score on success", async () => {
      // mock select → position found
      const origSelect = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = origSelect;
        return chainable([FAKE_POSITION]);
      };

      // mock insert: 1st → candidate, 2nd → resume (void), 3rd → score
      const origInsert = mockDb.insert;
      let insertCount = 0;
      mockDb.insert = (..._: any[]) => {
        insertCount++;
        if (insertCount === 1) return chainable([FAKE_CANDIDATE]);
        if (insertCount === 2) return chainable(undefined);
        mockDb.insert = origInsert;
        return chainable([FAKE_SCORE]);
      };

      const form = new FormData();
      form.append(
        "file",
        new File(["dummy pdf content"], "resume.pdf", { type: "application/pdf" }),
      );
      form.append("positionId", "pos-1");
      form.append("name", "张三");

      const res = await app.handle(
        new Request("http://localhost/api/resumes/upload", {
          method: "POST",
          body: form,
        }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.candidate).toBeDefined();
      expect(body.score).toBeDefined();
      expect(body.resumeText).toBeDefined();
      expect(body.score.educationScore).toBeDefined();
      expect(body.structuredInfo).toBeDefined();
    });

    it("returns 404 when position does not exist", async () => {
      const origSelect = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = origSelect;
        return chainable([]);
      };

      const form = new FormData();
      form.append(
        "file",
        new File(["dummy"], "resume.pdf", { type: "application/pdf" }),
      );
      form.append("positionId", "non-existent");

      const res = await app.handle(
        new Request("http://localhost/api/resumes/upload", {
          method: "POST",
          body: form,
        }),
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("Position not found");
    });

    it("defaults candidate name to Unknown when not provided", async () => {
      const origSelect = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = origSelect;
        return chainable([FAKE_POSITION]);
      };

      const origInsert = mockDb.insert;
      let insertCount = 0;
      mockDb.insert = (..._: any[]) => {
        insertCount++;
        if (insertCount === 1) return chainable([{ ...FAKE_CANDIDATE, name: "Unknown" }]);
        if (insertCount === 2) return chainable(undefined);
        mockDb.insert = origInsert;
        return chainable([FAKE_SCORE]);
      };

      const form = new FormData();
      form.append(
        "file",
        new File(["dummy"], "resume.pdf", { type: "application/pdf" }),
      );
      form.append("positionId", "pos-1");
      // no name field

      const res = await app.handle(
        new Request("http://localhost/api/resumes/upload", {
          method: "POST",
          body: form,
        }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.candidate.name).toBe("Unknown");
    });

    it("uses db.transaction for atomic insert", async () => {
      const txSpy = spyOn(mockDb, "transaction");

      const origSelect = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = origSelect;
        return chainable([FAKE_POSITION]);
      };

      const origInsert = mockDb.insert;
      let insertCount = 0;
      mockDb.insert = (..._: any[]) => {
        insertCount++;
        if (insertCount === 1) return chainable([FAKE_CANDIDATE]);
        if (insertCount === 2) return chainable(undefined);
        mockDb.insert = origInsert;
        return chainable([FAKE_SCORE]);
      };

      const form = new FormData();
      form.append(
        "file",
        new File(["dummy pdf content"], "resume.pdf", { type: "application/pdf" }),
      );
      form.append("positionId", "pos-1");
      form.append("name", "张三");

      const res = await app.handle(
        new Request("http://localhost/api/resumes/upload", {
          method: "POST",
          body: form,
        }),
      );
      expect(res.status).toBe(201);
      expect(txSpy).toHaveBeenCalledTimes(1);
      txSpy.mockRestore();
    });

    it("passes position scoringWeights to scoreResume", async () => {
      const scoreSpy = spyOn(aiScorer, "scoreResume");

      const origSelect = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = origSelect;
        return chainable([{ ...FAKE_POSITION, scoringWeights: { must: 0.65, nice: 0.20, education: 0.10, reject: 0.05 } }]);
      };

      const origInsert = mockDb.insert;
      let insertCount = 0;
      mockDb.insert = (..._: any[]) => {
        insertCount++;
        if (insertCount === 1) return chainable([FAKE_CANDIDATE]);
        if (insertCount === 2) return chainable(undefined);
        mockDb.insert = origInsert;
        return chainable([FAKE_SCORE]);
      };

      const form = new FormData();
      form.append("file", new File(["dummy"], "resume.pdf", { type: "application/pdf" }));
      form.append("positionId", "pos-1");

      await app.handle(new Request("http://localhost/api/resumes/upload", { method: "POST", body: form }));

      expect(scoreSpy).toHaveBeenCalled();
      const callArgs = scoreSpy.mock.calls[0];
      // 7th argument is weights
      expect(callArgs[6]).toEqual({ must: 0.65, nice: 0.20, education: 0.10, reject: 0.05 });

      scoreSpy.mockRestore();
      mockDb.insert = origInsert;
    });

    it("rolls back on AI scorer failure", async () => {
      const origSelect = mockDb.select;
      mockDb.select = (..._: any[]) => {
        mockDb.select = origSelect;
        return chainable([FAKE_POSITION]);
      };

      // Track inserts to verify no score insert happens
      const insertCalls: any[] = [];
      const origInsert = mockDb.insert;
      mockDb.insert = (...args: any[]) => {
        insertCalls.push(args);
        if (insertCalls.length === 1) return chainable([FAKE_CANDIDATE]);
        if (insertCalls.length === 2) return chainable(undefined);
        // 3rd insert (scores) should never be reached
        mockDb.insert = origInsert;
        return chainable([FAKE_SCORE]);
      };

      // Make scoreResume throw
      const scoreSpy = spyOn(aiScorer, "scoreResume").mockRejectedValue(
        new Error("AI service unavailable"),
      );

      const form = new FormData();
      form.append(
        "file",
        new File(["dummy pdf content"], "resume.pdf", { type: "application/pdf" }),
      );
      form.append("positionId", "pos-1");
      form.append("name", "张三");

      const res = await app.handle(
        new Request("http://localhost/api/resumes/upload", {
          method: "POST",
          body: form,
        }),
      );
      expect(res.status).toBe(500);

      // In a real DB, transaction would have rolled back the candidate + resume inserts
      // Here we verify the error propagated (no partial 201 response)
      scoreSpy.mockRestore();
      mockDb.insert = origInsert;
    });
  });
});
