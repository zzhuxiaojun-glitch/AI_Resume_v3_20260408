import { describe, it, expect } from "bun:test";
import { mockDb } from "./setup";
import { scorePending } from "../scripts/score-pending";

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

/** chainable that captures .set() calls for verifying db.update behavior */
function trackingChainable(calls: any[]): any {
  return new Proxy(() => {}, {
    get(_t, prop) {
      if (prop === "then")
        return (ok: any, fail: any) => Promise.resolve([]).then(ok, fail);
      if (prop === "catch")
        return (fail: any) => Promise.resolve([]).catch(fail);
      if (prop === "set")
        return (data: any) => { calls.push(data); return trackingChainable(calls); };
      if (typeof prop === "symbol") return undefined;
      return (..._: any[]) => trackingChainable(calls);
    },
    apply() { return trackingChainable(calls); },
  });
}

describe("score-pending", () => {
  it("writes error to emailProcessLogs when scoring fails", async () => {
    const origSelect = mockDb.select;
    const origUpdate = mockDb.update;

    let selectCall = 0;
    mockDb.select = (..._: any[]) => {
      selectCall++;
      if (selectCall === 1) {
        // pending candidates — resumeText=null triggers "no resume text" error
        return chainable([{
          candidateId: "cand-fail",
          name: "FailTest",
          positionId: "pos-1",
          universityTier: "D",
          resumeText: null,
        }]);
      }
      // positions query
      if (selectCall >= 2) mockDb.select = origSelect;
      return chainable([{
        id: "pos-1",
        title: "Engineer",
        description: "desc",
        skillConfig: { must: [], nice: [], reject: [] },
        locale: "zh",
      }]);
    };

    const updateSetCalls: any[] = [];
    mockDb.update = (..._: any[]) => trackingChainable(updateSetCalls);

    const result = await scorePending();

    mockDb.select = origSelect;
    mockDb.update = origUpdate;

    expect(result.failed).toBe(1);
    expect(result.success).toBe(0);

    // Verify error was written to emailProcessLogs
    const errorUpdate = updateSetCalls.find((c: any) => c.status === "error");
    expect(errorUpdate).toBeDefined();
    expect(errorUpdate.error).toContain("no resume text");
  });
});
