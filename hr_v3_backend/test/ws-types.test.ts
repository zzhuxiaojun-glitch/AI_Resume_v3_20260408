import { describe, it, expect } from "bun:test";
import {
  isValidClientMessage,
  serializeEvent,
  type ServerEvent,
  type ClientMessage,
} from "../src/lib/ws-types";

describe("ws-types", () => {
  describe("isValidClientMessage", () => {
    it("accepts a valid ping message", () => {
      expect(isValidClientMessage({ type: "ping" })).toBe(true);
    });

    it("accepts a subscribe message without positionId", () => {
      expect(isValidClientMessage({ type: "subscribe" })).toBe(true);
    });

    it("accepts a subscribe message with positionId", () => {
      expect(
        isValidClientMessage({ type: "subscribe", positionId: "abc-123" }),
      ).toBe(true);
    });

    it("rejects null", () => {
      expect(isValidClientMessage(null)).toBe(false);
    });

    it("rejects non-object", () => {
      expect(isValidClientMessage("ping")).toBe(false);
    });

    it("rejects missing type", () => {
      expect(isValidClientMessage({})).toBe(false);
    });

    it("rejects unknown type", () => {
      expect(isValidClientMessage({ type: "unknown" })).toBe(false);
    });

    it("rejects subscribe with non-string positionId", () => {
      expect(
        isValidClientMessage({ type: "subscribe", positionId: 123 }),
      ).toBe(false);
    });
  });

  describe("serializeEvent", () => {
    it("serializes a heartbeat event to JSON string", () => {
      const event: ServerEvent = {
        type: "heartbeat",
        timestamp: "2026-01-01T00:00:00.000Z",
        connectedClients: 2,
      };
      const json = serializeEvent(event);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe("heartbeat");
      expect(parsed.connectedClients).toBe(2);
    });

    it("serializes a candidate:new event", () => {
      const event: ServerEvent = {
        type: "candidate:new",
        candidateId: "c-1",
        name: "张三",
        email: "z@test.com",
        positionId: "p-1",
        positionTitle: "工程师",
        source: "email",
        timestamp: "2026-01-01T00:00:00.000Z",
      };
      const json = serializeEvent(event);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe("candidate:new");
      expect(parsed.candidateId).toBe("c-1");
      expect(parsed.name).toBe("张三");
    });

    it("serializes a candidate:scored event", () => {
      const event: ServerEvent = {
        type: "candidate:scored",
        candidateId: "c-1",
        name: "张三",
        positionId: "p-1",
        totalScore: 85.50,
        grade: "A",
        matchedSkills: ["TypeScript", "React"],
        educationScore: 95.00,
        timestamp: "2026-01-01T00:00:00.000Z",
      };
      const json = serializeEvent(event);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe("candidate:scored");
      expect(parsed.totalScore).toBe(85.50);
      expect(parsed.grade).toBe("A");
      expect(parsed.educationScore).toBe(95.00);
    });

    it("serializes an inbox:summary event", () => {
      const event: ServerEvent = {
        type: "inbox:summary",
        totalProcessed: 5,
        gradeDistribution: { A: 1, B: 2, C: 1, D: 1, F: 0 },
        topCandidates: [
          { candidateId: "c-1", name: "张三", grade: "A", totalScore: 90.25 },
        ],
        timestamp: "2026-01-01T00:00:00.000Z",
      };
      const json = serializeEvent(event);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe("inbox:summary");
      expect(parsed.totalProcessed).toBe(5);
      expect(parsed.topCandidates).toHaveLength(1);
    });

    it("serializes an error event", () => {
      const event: ServerEvent = { type: "error", message: "Invalid JSON" };
      const json = serializeEvent(event);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe("error");
      expect(parsed.message).toBe("Invalid JSON");
    });

    it("returns valid JSON for round-trip", () => {
      const event: ServerEvent = {
        type: "heartbeat",
        timestamp: new Date().toISOString(),
        connectedClients: 0,
      };
      expect(() => JSON.parse(serializeEvent(event))).not.toThrow();
    });
  });
});
