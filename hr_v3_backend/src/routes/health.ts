/**
 * @file 健康检查路由
 * @description 提供 /health 端点，用于监控系统和负载均衡器检测服务是否正常运行。
 */

import Elysia from "elysia";

export const healthRoute = new Elysia()
  .get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));
