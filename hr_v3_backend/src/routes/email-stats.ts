/**
 * @file 邮件处理统计 REST API
 * @description 提供邮件处理全貌统计：邮件分类/状态分布、候选人评分情况、简历文件情况。
 *              基础路径：/api/email
 */

import Elysia from "elysia";
import { db } from "../db/index";
import { emailProcessLogs, candidates, resumes, scores } from "../db/schema";
import { count, sql } from "drizzle-orm";

export const emailStatsRoute = new Elysia({ prefix: "/api/email" })

  /**
   * GET /api/email/stats
   * 邮件处理全貌统计
   */
  .get("/stats", async () => {
    // 1. Email breakdown by classification + status + hasResumeAttachment
    const emailRows = await db
      .select({
        classification: emailProcessLogs.classification,
        status: emailProcessLogs.status,
        hasResumeAttachment: emailProcessLogs.hasResumeAttachment,
        count: count(),
      })
      .from(emailProcessLogs)
      .groupBy(
        emailProcessLogs.classification,
        emailProcessLogs.status,
        emailProcessLogs.hasResumeAttachment,
      );

    let emailTotal = 0;
    const byClassification: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const breakdown = emailRows.map((row) => {
      const c = Number(row.count);
      emailTotal += c;
      byClassification[row.classification] =
        (byClassification[row.classification] ?? 0) + c;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + c;
      return {
        classification: row.classification,
        status: row.status,
        hasAttachment: row.hasResumeAttachment,
        count: c,
      };
    });

    // 2. Candidates with/without score
    const [candidateRow] = await db
      .select({
        total: count(),
        withScore: count(scores.id),
      })
      .from(candidates)
      .leftJoin(scores, sql`${candidates.id} = ${scores.candidateId}`);

    const candidateTotal = Number(candidateRow?.total ?? 0);
    const candidateWithScore = Number(candidateRow?.withScore ?? 0);

    // 3. Resumes with/without file
    const [resumeRow] = await db
      .select({
        total: count(),
        withFile: count(resumes.filePath),
      })
      .from(resumes);

    const resumeTotal = Number(resumeRow?.total ?? 0);
    const resumeWithFile = Number(resumeRow?.withFile ?? 0);

    return {
      emails: {
        total: emailTotal,
        byClassification,
        byStatus,
        breakdown,
      },
      candidates: {
        total: candidateTotal,
        withScore: candidateWithScore,
        withoutScore: candidateTotal - candidateWithScore,
      },
      resumes: {
        total: resumeTotal,
        withFile: resumeWithFile,
        withoutFile: resumeTotal - resumeWithFile,
      },
    };
  });
