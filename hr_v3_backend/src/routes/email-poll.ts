/**
 * @file 邮件轮询 API 端点
 * @description POST /api/email/poll — 触发一次邮箱收件箱轮询。
 *              调用 pollInbox() 批量处理未读邮件，流程：
 *              DB 去重 → classifyEmail 预分类 → 附件下载 → 简历解析 →
 *              候选人入库 → AI 评分 → 评分入库 → WS 实时推送。
 *              返回本次新创建的候选人 ID 列表。
 */

import Elysia from "elysia";
import { pollInbox } from "../services/email";

export const emailPollRoute = new Elysia().post(
  "/api/email/poll",
  async ({ body, set }) => {
    const { positionId } = body as { positionId?: string };

    if (!positionId) {
      set.status = 400;
      return { error: "positionId is required" };
    }

    try {
      const candidateIds = await pollInbox(positionId);
      return { candidateIds, count: candidateIds.length };
    } catch (err) {
      set.status = 500;
      return {
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
);
