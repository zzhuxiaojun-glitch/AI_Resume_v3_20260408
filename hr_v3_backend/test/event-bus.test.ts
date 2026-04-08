import { describe, it, expect, beforeEach } from "bun:test";
import { EventBus, eventBus } from "../src/lib/event-bus";
import type { ServerEvent } from "../src/lib/ws-types";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("exports a global singleton", () => {
    expect(eventBus).toBeInstanceOf(EventBus);
  });

  it("calls listener when event is emitted", () => {
    const received: ServerEvent[] = [];
    bus.on((e) => received.push(e));

    const event: ServerEvent = {
      type: "heartbeat",
      timestamp: new Date().toISOString(),
      connectedClients: 0,
    };
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it("calls multiple listeners", () => {
    let count = 0;
    bus.on(() => count++);
    bus.on(() => count++);

    bus.emit({
      type: "heartbeat",
      timestamp: new Date().toISOString(),
      connectedClients: 0,
    });

    expect(count).toBe(2);
  });

  it("removes a specific listener with off()", () => {
    const received: ServerEvent[] = [];
    const listener = (e: ServerEvent) => received.push(e);
    bus.on(listener);
    bus.off(listener);

    bus.emit({
      type: "heartbeat",
      timestamp: new Date().toISOString(),
      connectedClients: 0,
    });

    expect(received).toHaveLength(0);
  });

  it("removes all listeners with removeAll()", () => {
    let count = 0;
    bus.on(() => count++);
    bus.on(() => count++);
    bus.removeAll();

    bus.emit({
      type: "heartbeat",
      timestamp: new Date().toISOString(),
      connectedClients: 0,
    });

    expect(count).toBe(0);
  });

  it("does not throw when emitting with no listeners", () => {
    expect(() =>
      bus.emit({
        type: "heartbeat",
        timestamp: new Date().toISOString(),
        connectedClients: 0,
      }),
    ).not.toThrow();
  });

  it("off() is safe when listener was never added", () => {
    expect(() => bus.off(() => {})).not.toThrow();
  });

  it("returns listener count", () => {
    expect(bus.listenerCount).toBe(0);
    const fn = () => {};
    bus.on(fn);
    expect(bus.listenerCount).toBe(1);
    bus.on(() => {});
    expect(bus.listenerCount).toBe(2);
    bus.off(fn);
    expect(bus.listenerCount).toBe(1);
  });
});
