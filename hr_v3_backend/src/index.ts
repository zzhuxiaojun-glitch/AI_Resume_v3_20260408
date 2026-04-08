/**
 * @file 应用入口文件
 * @description HR 智能筛选系统的后端服务入口。
 *              基于 Elysia 框架构建 RESTful API + WebSocket，通过 Bun 运行时启动服务。
 *              桥接 EventBus 事件到 Bun 原生 pub/sub，实现 WS 实时推送。
 */

import { app } from "./app";
import { eventBus } from "./lib/event-bus";
import { serializeEvent } from "./lib/ws-types";

const port = Number(process.env.PORT) || 3001;
app.listen(port);

console.log(`HR Screening API running on http://localhost:${port}`);

/* ── EventBus → WebSocket 桥接 ─────────────────────────────── */

eventBus.on((event) => {
  app.server?.publish("hr:events", serializeEvent(event));
});

/* ── 心跳定时器（每 30 秒广播一次） ──────────────────────────── */

setInterval(() => {
  app.server?.publish(
    "hr:events",
    serializeEvent({
      type: "heartbeat",
      timestamp: new Date().toISOString(),
      connectedClients: app.server?.subscriberCount("hr:events") ?? 0,
    }),
  );
}, 30_000);
