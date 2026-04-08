/**
 * 一次性脚本：对数据库中所有候选人重新跑院校识别 + AI 评分
 * 用法：bun scripts/rescore-all.ts
 */
import { db } from "../src/db/index";
import { candidates, resumes, scores, positions } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { extractUniversityName, lookupUniversity } from "../src/services/university-lookup";
import { scoreResume } from "../src/services/ai-scorer";
import type { SkillConfig, UniversityTier } from "../src/lib/types";

async function main() {
  // 1. 拉出所有候选人 + 对应的简历文本
  const rows = await db
    .select({
      id: candidates.id,
      name: candidates.name,
      positionId: candidates.positionId,
      university: candidates.university,
      universityTier: candidates.universityTier,
      resumeText: resumes.rawText,
    })
    .from(candidates)
    .leftJoin(resumes, eq(resumes.candidateId, candidates.id))
    .orderBy(candidates.createdAt);

  console.log(`共 ${rows.length} 个候选人\n`);

  let success = 0;
  let skipped = 0;

  for (const row of rows) {
    const tag = `[${row.name}]`;

    if (!row.resumeText) {
      console.log(`${tag} 跳过 — 无简历文本`);
      skipped++;
      continue;
    }

    // 2. 提取院校名 + 查询 tier
    let university: string | null = null;
    let universityTier: UniversityTier | null = null;
    const extracted = extractUniversityName(row.resumeText);
    if (extracted) {
      const uni = await lookupUniversity(db, extracted);
      if (uni) {
        university = uni.name;
        universityTier = uni.tier as UniversityTier;
      }
    }

    // 3. 更新候选人的 university 字段
    await db
      .update(candidates)
      .set({
        ...(university && { university }),
        ...(universityTier && { universityTier }),
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, row.id));

    // 4. 查询目标职位
    const [position] = await db
      .select()
      .from(positions)
      .where(eq(positions.id, row.positionId))
      .limit(1);

    if (!position) {
      console.log(`${tag} 跳过 — 职位 ${row.positionId} 不存在`);
      skipped++;
      continue;
    }

    // 5. AI 重新评分
    try {
      const score = await scoreResume(
        row.resumeText,
        position.title,
        position.description ?? "",
        position.skillConfig as SkillConfig,
        position.locale ?? "zh",
        universityTier ?? "D",
      );

      // 6. 删除旧评分，插入新评分
      await db.delete(scores).where(eq(scores.candidateId, row.id));
      await db.insert(scores).values({
        candidateId: row.id,
        positionId: row.positionId,
        ...score,
      });

      const tierStr = universityTier ? `${university}(${universityTier})` : "未识别";
      console.log(
        `${tag} ✅ ${tierStr} | total=${score.totalScore} edu=${score.educationScore} grade=${score.grade}`,
      );
      success++;
    } catch (err: any) {
      console.log(`${tag} ❌ AI 评分失败: ${err.message?.slice(0, 100)}`);
      skipped++;
    }
  }

  console.log(`\n完成: ${success} 成功, ${skipped} 跳过`);
  process.exit(0);
}

main();
