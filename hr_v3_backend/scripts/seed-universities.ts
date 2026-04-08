/**
 * @file 院校种子数据导入脚本
 * @description 从 data/ 目录的 JSON 文件中读取院校数据，批量导入到 university_tiers 表。
 *              支持增量导入：已存在的院校（按 name 匹配）会被跳过。
 * @usage bun scripts/seed-universities.ts
 */

import { db } from "../src/db/index";
import { universityTiers } from "../src/db/schema";
import { eq } from "drizzle-orm";
import cnData from "../data/universities-cn.json";
import intlData from "../data/universities-intl.json";

interface UniversityEntry {
  name: string;
  aliases: string[];
  country: string;
  domesticTag: string | null;
  qsRank: number | null;
  tier: "S" | "A" | "B" | "C" | "D";
  updatedYear: number;
}

async function seed() {
  const allData: UniversityEntry[] = [
    ...(cnData as UniversityEntry[]),
    ...(intlData as UniversityEntry[]),
  ];

  console.log(`📚 准备导入 ${allData.length} 所院校数据...`);

  let inserted = 0;
  let skipped = 0;

  for (const entry of allData) {
    // 检查是否已存在
    const [existing] = await db
      .select({ id: universityTiers.id })
      .from(universityTiers)
      .where(eq(universityTiers.name, entry.name))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(universityTiers).values({
      name: entry.name,
      aliases: entry.aliases,
      country: entry.country,
      domesticTag: entry.domesticTag,
      qsRank: entry.qsRank,
      tier: entry.tier,
      updatedYear: entry.updatedYear,
    });
    inserted++;
  }

  console.log(`✅ 导入完成: ${inserted} 条新增, ${skipped} 条已存在跳过`);
  console.log(`📊 总计: ${allData.length} 所院校`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ 种子数据导入失败:", err);
  process.exit(1);
});
