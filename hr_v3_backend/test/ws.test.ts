import { describe, it, expect, afterAll, beforeAll } from "bun:test";
import { mockEventBus } from "./setup";
import { app } from "../src/app";
import type { ServerEvent } from "../src/lib/ws-types";

let baseUrl: string;

beforeAll(() => {
  app.listen(0);
  const port = app.server!.port;
  baseUrl = `ws://localhost:${port}`;
});

afterAll(() => {
  app.server?.stop();
});

function connectWs(path = "/ws"): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl}${path}`);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}

function waitForMessage(ws: WebSocket, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("WS message timeout")),
      timeoutMs,
    );
    ws.onmessage = (event) => {
      clearTimeout(timer);
      resolve(JSON.parse(event.data as string));
    };
  });
}

describe("WebSocket /ws", () => {
  it("connects and receives initial heartbeat", async () => {
    const ws = await connectWs();
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe("heartbeat");
    expect(typeof msg.timestamp).toBe("string");
    expect(typeof msg.connectedClients).toBe("number");
    ws.close();
  });

  it("replies with heartbeat on ping", async () => {
    const ws = await connectWs();
    // consume initial heartbeat
    await waitForMessage(ws);

    ws.send(JSON.stringify({ type: "ping" }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe("heartbeat");
    ws.close();
  });

  it("returns error on invalid JSON", async () => {
    const ws = await connectWs();
    await waitForMessage(ws); // initial heartbeat

    ws.send("not json");
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe("error");
    expect(msg.message).toBeDefined();
    ws.close();
  });

  it("returns error on unknown message type", async () => {
    const ws = await connectWs();
    await waitForMessage(ws); // initial heartbeat

    ws.send(JSON.stringify({ type: "unknown" }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe("error");
    ws.close();
  });

  it("receives events broadcast via EventBus", async () => {
    const ws = await connectWs();
    await waitForMessage(ws); // initial heartbeat

    // small delay to ensure subscription is active
    await Bun.sleep(50);

    const event: ServerEvent = {
      type: "candidate:new",
      candidateId: "c-test",
      name: "测试",
      email: "test@test.com",
      positionId: "p-1",
      positionTitle: "工程师",
      source: "email",
      timestamp: new Date().toISOString(),
    };

    // Simulate the bridge: publish to the Bun topic
    app.server!.publish("hr:events", JSON.stringify(event));

    const msg = await waitForMessage(ws);
    expect(msg.type).toBe("candidate:new");
    expect(msg.candidateId).toBe("c-test");
    ws.close();
  });

  it("accepts subscribe message without error", async () => {
    const ws = await connectWs();
    await waitForMessage(ws); // initial heartbeat

    ws.send(JSON.stringify({ type: "subscribe", positionId: "pos-1" }));

    // subscribe doesn't produce a reply currently, so send a ping to verify connection is alive
    ws.send(JSON.stringify({ type: "ping" }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe("heartbeat");
    ws.close();
  });

  it("broadcasts scored event with decimal totalScore", async () => {
    const ws = await connectWs();
    await waitForMessage(ws); // initial heartbeat
    await Bun.sleep(50);

    const event: ServerEvent = {
      type: "candidate:scored",
      candidateId: "c-dec",
      name: "小数测试",
      positionId: "p-1",
      totalScore: 78.35,
      grade: "B",
      matchedSkills: ["Java", "Spring"],
      educationScore: 70.00,
      timestamp: new Date().toISOString(),
    };

    app.server!.publish("hr:events", JSON.stringify(event));

    const msg = await waitForMessage(ws);
    expect(msg.type).toBe("candidate:scored");
    expect(msg.totalScore).toBe(78.35);
    expect(msg.grade).toBe("B");
    expect(msg.educationScore).toBe(70.00);
    ws.close();
  });
});
