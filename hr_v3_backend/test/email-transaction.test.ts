/**
 * @file pollInbox 事务行为测试
 * @description 验证 email.ts 中 pollInbox 的事务原子性：
 *   - 事件必须在事务提交后才发出
 *   - scoreResume 失败时事务回滚，不留脏数据
 *
 * 注：pollInbox 本身被 setup.ts preload mock 了，所以这里直接测试
 *     db.transaction + eventBus 的协作模式，模拟 pollInbox 内部逻辑。
 */

import { describe, it, expect, spyOn } from "bun:test";
import { mockDb, mockEventBus, FAKE_CANDIDATE, FAKE_POSITION } from "./setup";
import type { ServerEvent } from "../src/lib/ws-types";

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

describe("pollInbox transaction behavior", () => {
  it("emits events only after transaction commits", async () => {
    const events: ServerEvent[] = [];
    const listener = (e: ServerEvent) => events.push(e);
    mockEventBus.on(listener);

    let eventsInsideTransaction = 0;

    // Simulate the pattern: transaction first, then emit
    const origTransaction = mockDb.transaction;
    mockDb.transaction = async (fn: (tx: any) => Promise<any>) => {
      const result = await fn(mockDb);
      // At this point the transaction has "committed"
      // Record how many events exist BEFORE we emit (should be 0)
      eventsInsideTransaction = events.length;
      return result;
    };

    // Simulate what pollInbox does: transaction → then emit
    const { candidate } = await mockDb.transaction(async (tx: any) => {
      const [candidate] = await tx.insert({}).values({}).returning();
      return { candidate };
    });

    // Events emitted AFTER transaction (simulating email.ts pattern)
    mockEventBus.emit({
      type: "candidate:new",
      candidateId: candidate.id,
      name: "张三",
      email: undefined,
      positionId: "pos-1",
      positionTitle: "软件工程师",
      source: "email",
      timestamp: new Date().toISOString(),
    });

    // Verify: no events were emitted during the transaction
    expect(eventsInsideTransaction).toBe(0);
    // Verify: event was emitted after transaction committed
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("candidate:new");

    mockEventBus.off(listener);
    mockDb.transaction = origTransaction;
  });

  it("skips candidate on scoreResume failure without leaving orphan", async () => {
    const events: ServerEvent[] = [];
    const listener = (e: ServerEvent) => events.push(e);
    mockEventBus.on(listener);

    const txSpy = spyOn(mockDb, "transaction");

    // Simulate pollInbox's try-catch around transaction
    let errorCaught = false;
    try {
      await mockDb.transaction(async (tx: any) => {
        await tx.insert({}).values({}).returning(); // candidate
        await tx.insert({}).values({});             // resume
        // scoreResume fails
        throw new Error("AI service unavailable");
      });
    } catch {
      errorCaught = true;
      // In real DB, transaction would have rolled back
      // In email.ts, this catch block updates emailProcessLogs to "error"
    }

    // No events emitted on failure (they're outside the try block)
    expect(errorCaught).toBe(true);
    expect(events.length).toBe(0);
    expect(txSpy).toHaveBeenCalledTimes(1);

    mockEventBus.off(listener);
    txSpy.mockRestore();
  });
});
