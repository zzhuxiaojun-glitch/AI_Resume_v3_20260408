/**
 * @file 事件总线
 * @description 应用内部事件发布/订阅机制，解耦 services 层与 WebSocket 传输层。
 *              services（如 email.ts）通过 eventBus.emit() 发布事件，
 *              index.ts 中桥接到 Bun server.publish() 广播给所有 WS 客户端。
 */

import type { ServerEvent } from "./ws-types";

export type EventListener = (event: ServerEvent) => void;

export class EventBus {
  private listeners: Set<EventListener> = new Set();

  on(listener: EventListener): void {
    this.listeners.add(listener);
  }

  off(listener: EventListener): void {
    this.listeners.delete(listener);
  }

  emit(event: ServerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  removeAll(): void {
    this.listeners.clear();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

export const eventBus = new EventBus();
