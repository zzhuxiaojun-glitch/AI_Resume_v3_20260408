/**
 * 修复 email_process_logs 中 status='parsed' 但 candidateId=NULL 的记录
 *
 * 根因：email.ts Phase 1 更新 parsed 时未写入 candidateId，Phase 2 中断后
 * score-pending.ts 补评分时也无法匹配更新（WHERE candidateId=? 匹配不到 NULL）
 *
 * 修复策略：
 * 1. 通过 subject 中的姓名匹配 resumes.fileName 关联 candidateId
 * 2. 已评分的 → 更新 status=scored + candidateId
 * 3. 未评分的 → 仅补 candidateId（后续跑 score-pending.ts 评分）
 * 4. 发票等非简历 → 改为 skipped
 *
 * 用法：bun scripts/fix-parsed-logs.ts
 */
import { db } from "../src/db/index";
import { emailProcessLogs, resumes, scores } from "../src/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

async function main() {
  // 找到所有 parsed + candidateId=NULL 的记录
  const parsed = await db
    .select({
      id: emailProcessLogs.id,
      messageId: emailProcessLogs.messageId,
      subject: emailProcessLogs.subject,
    })
    .from(emailProcessLogs)
    .where(
      and(
        eq(emailProcessLogs.status, "parsed"),
        isNull(emailProcessLogs.candidateId),
      ),
    );

  console.log(`找到 ${parsed.length} 条 parsed + candidateId=NULL 的记录`);

  let fixed = 0;
  let scored = 0;
  let linked = 0;
  let skipped = 0;
  let noMatch = 0;

  for (const log of parsed) {
    // 从 subject 提取姓名（BOSS直聘格式："姓名 | ..."）
    const name = log.subject?.split(" | ")[0]?.trim();
    if (!name || name.length < 2 || name.includes("发票")) {
      // 非简历邮件，标记为 skipped
      await db
        .update(emailProcessLogs)
        .set({ status: "skipped", processedAt: new Date() })
        .where(eq(emailProcessLogs.id, log.id));
      skipped++;
      continue;
    }

    // 通过姓名匹配 resume.fileName，取时间最接近的
    const [match] = await db
      .select({
        candidateId: resumes.candidateId,
      })
      .from(resumes)
      .where(
        and(
          sql`${resumes.fileName} LIKE ${"%" + name + "%"}`,
          eq(resumes.source, "email"),
        ),
      )
      .limit(1);

    if (!match) {
      noMatch++;
      continue;
    }

    // 检查该候选人是否已有评分
    const [scoreRow] = await db
      .select({ id: scores.id })
      .from(scores)
      .where(eq(scores.candidateId, match.candidateId))
      .limit(1);

    if (scoreRow) {
      // 已评分：更新 candidateId + status=scored
      await db
        .update(emailProcessLogs)
        .set({
          candidateId: match.candidateId,
          status: "scored",
          processedAt: new Date(),
        })
        .where(eq(emailProcessLogs.id, log.id));
      scored++;
    } else {
      // 未评分：仅补 candidateId
      await db
        .update(emailProcessLogs)
        .set({ candidateId: match.candidateId })
        .where(eq(emailProcessLogs.id, log.id));
      linked++;
    }

    fixed++;
    if (fixed % 100 === 0) {
      console.log(`[${fixed}/${parsed.length}] scored=${scored} linked=${linked} skipped=${skipped}`);
    }
  }

  console.log(`\n修复完成:`);
  console.log(`  已评分 → scored: ${scored}`);
  console.log(`  未评分 → 补 candidateId: ${linked}`);
  console.log(`  非简历 → skipped: ${skipped}`);
  console.log(`  未匹配: ${noMatch}`);
  process.exit(0);
}

main();
