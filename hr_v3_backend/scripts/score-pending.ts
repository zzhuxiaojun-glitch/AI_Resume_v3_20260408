/**
 * 批量并发评分脚本：处理 email_process_logs 中 status='parsed' 的候选人
 * 这些候选人已入库但还没有 AI 评分（Phase 1 完成，Phase 2 未执行）
 *
 * 用法：bun scripts/score-pending.ts
 *
 * 并发度：10 路（与 pollInbox Phase 2 一致）
 */
import { db } from "../src/db/index";
import {
  candidates,
  resumes,
  scores,
  positions,
  emailProcessLogs,
} from "../src/db/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { scoreResume } from "../src/services/ai-scorer";
import type { SkillConfig, UniversityTier } from "../src/lib/types";

const CONCURRENCY = 10;

export async function scorePending() {
  // 找到所有没有 score 记录的候选人（有简历文本）
  const pending = await db
    .select({
      candidateId: candidates.id,
      name: candidates.name,
      positionId: candidates.positionId,
      universityTier: candidates.universityTier,
      resumeText: resumes.rawText,
    })
    .from(candidates)
    .innerJoin(resumes, eq(resumes.candidateId, candidates.id))
    .where(
      sql`NOT EXISTS (SELECT 1 FROM scores WHERE scores."candidateId" = candidates.id)`,
    );

  console.log(`找到 ${pending.length} 个待评分候选人`);
  if (pending.length === 0) return { success: 0, failed: 0 };

  // 预加载所有职位
  const allPositions = await db.select().from(positions);
  const posMap = new Map(allPositions.map((p) => [p.id, p]));

  let success = 0;
  let failed = 0;

  // 分批并发处理
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        try {
          if (!row.resumeText) {
            throw new Error("no resume text");
          }

          const position = posMap.get(row.positionId);
          if (!position) {
            throw new Error(`position ${row.positionId} not found`);
          }

          const score = await scoreResume(
            row.resumeText,
            position.title,
            position.description ?? "",
            position.skillConfig as SkillConfig,
            position.locale ?? "zh",
            (row.universityTier ?? "D") as UniversityTier,
          );

          await db.insert(scores).values({
            candidateId: row.candidateId,
            positionId: row.positionId,
            ...score,
          });

          // 更新 email_process_logs 状态（如果有关联的记录）
          await db
            .update(emailProcessLogs)
            .set({
              status: "scored",
              candidateId: row.candidateId,
              processedAt: new Date(),
            })
            .where(
              and(
                eq(emailProcessLogs.candidateId, row.candidateId),
                eq(emailProcessLogs.status, "parsed"),
              ),
            );

          return { name: row.name, grade: score.grade, total: score.totalScore };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await db
            .update(emailProcessLogs)
            .set({
              status: "error",
              error: errMsg.replace(/\0/g, ""),
              processedAt: new Date(),
            })
            .where(
              and(
                eq(emailProcessLogs.candidateId, row.candidateId),
                eq(emailProcessLogs.status, "parsed"),
              ),
            );
          throw err;
        }
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        success++;
      } else {
        failed++;
      }
    }

    const done = Math.min(i + CONCURRENCY, pending.length);
    console.log(
      `[${done}/${pending.length}] 成功: ${success}, 失败: ${failed}`,
    );
  }

  console.log(`\n完成: ${success} 成功, ${failed} 失败`);
  return { success, failed };
}

if (import.meta.main) {
  scorePending().then(() => process.exit(0));
}
