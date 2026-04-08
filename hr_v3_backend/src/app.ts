/**
 * @file Elysia 应用实例（与服务启动分离）
 * @description 创建并导出 Elysia app 实例，方便测试中直接 import 使用，
 *              不触发 HTTP 监听。启动逻辑在 index.ts 中。
 */

import Elysia from "elysia";
import cors from "@elysiajs/cors";
import { healthRoute } from "./routes/health";
import { positionsRoute } from "./routes/positions";
import { candidatesRoute } from "./routes/candidates";
import { resumesRoute } from "./routes/resumes";
import { emailPollRoute } from "./routes/email-poll";
import { emailStatsRoute } from "./routes/email-stats";
import { wsRoute } from "./routes/ws";
import { universitiesRoute } from "./routes/universities";

export const app = new Elysia()
  .use(cors())
  .use(healthRoute)
  .use(positionsRoute)
  .use(candidatesRoute)
  .use(resumesRoute)
  .use(emailPollRoute)
  .use(emailStatsRoute)
  .use(universitiesRoute)
  .use(wsRoute);
