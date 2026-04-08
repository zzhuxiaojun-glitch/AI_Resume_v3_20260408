/**
 * @file WebSocket 路由
 * @description 提供 /ws 端点，客户端连接后自动订阅 "hr:events" topic，
 *              接收 candidate:new / candidate:scored / inbox:summary / heartbeat 等实时事件。
 *              使用 Bun 原生 pub/sub 机制，零分配 C++ 层广播。
 */

import Elysia from "elysia";
import { isValidClientMessage, serializeEvent } from "../lib/ws-types";
import type { ServerEvent } from "../lib/ws-types";

const TOPIC = "hr:events";

export const wsRoute = new Elysia().ws("/ws", {
  open(ws) {
    ws.subscribe(TOPIC);

    // 连接时立即发送一次心跳
    const heartbeat: ServerEvent = {
      type: "heartbeat",
      timestamp: new Date().toISOString(),
      connectedClients: 0, // 将由 index.ts 桥接层更新
    };
    ws.send(serializeEvent(heartbeat));
  },

  message(ws, message) {
    let parsed: unknown;
    try {
      parsed =
        typeof message === "string" ? JSON.parse(message) : message;
    } catch {
      ws.send(
        serializeEvent({ type: "error", message: "Invalid JSON" }),
      );
      return;
    }

    if (!isValidClientMessage(parsed)) {
      ws.send(
        serializeEvent({
          type: "error",
          message: "Unknown message type",
        }),
      );
      return;
    }

    if (parsed.type === "ping") {
      const heartbeat: ServerEvent = {
        type: "heartbeat",
        timestamp: new Date().toISOString(),
        connectedClients: 0,
      };
      ws.send(serializeEvent(heartbeat));
    }

    // "subscribe" 预留，当前所有客户端都订阅同一 topic
  },

  close(ws) {
    ws.unsubscribe(TOPIC);
  },
});
