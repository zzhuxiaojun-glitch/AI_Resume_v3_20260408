/**
 * @file 院校层级查询与 educationScore 计算
 * @description 提供院校层级映射、评分计算和校名提取等纯函数，
 *              以及基于数据库的院校模糊匹配查询功能。
 */

import type { UniversityTier } from "../lib/types";

/**
 * 国内院校标签到统一层级的映射
 */
const DOMESTIC_TAG_MAP: Record<string, UniversityTier> = {
  "985": "S",
  "211": "A",
  "双一流": "A",
  "省重点一本": "B",
  "普通一本": "C",
  "普通本科": "D",
};

/**
 * 层级到 educationScore 的映射
 */
const TIER_SCORE_MAP: Record<UniversityTier, number> = {
  S: 95.00,
  A: 85.00,
  B: 70.00,
  C: 55.00,
  D: 30.00,
};

/**
 * 将国内院校标签映射为统一层级
 * @param tag - 国内标签（985, 211, 双一流, 省重点一本, 普通一本, 普通本科）
 * @returns 统一层级 S/A/B/C/D
 */
export function mapDomesticTagToTier(tag: string | null | undefined): UniversityTier {
  if (!tag) return "D";
  return DOMESTIC_TAG_MAP[tag] ?? "D";
}

/**
 * 将 QS 世界排名映射为统一层级
 * @param rank - QS 排名数字
 * @returns 统一层级 S/A/B/C/D
 */
export function mapQsRankToTier(rank: number | null | undefined): UniversityTier {
  if (rank == null) return "D";
  if (rank <= 50) return "S";
  if (rank <= 100) return "A";
  if (rank <= 300) return "B";
  if (rank <= 500) return "C";
  return "D";
}

/**
 * 将统一层级转换为 educationScore 分数
 * @param tier - 统一层级 S/A/B/C/D
 * @returns 对应的 educationScore (0-100)
 */
export function tierToScore(tier: UniversityTier): number {
  return TIER_SCORE_MAP[tier];
}

/**
 * 从简历文本中提取院校名称（MVP 正则方式）
 * @description 支持以下模式：
 *   - 中文：「毕业于XX大学」「毕业于XX学院」「XX大学」
 *   - 英文：「University of XX」「XX University」「XX Institute of Technology」
 * @param text - 简历纯文本
 * @returns 提取到的院校名，未匹配则返回 null
 */
export function extractUniversityName(text: string): string | null {
  // 中文：毕业于XX大学/学院
  const cnGraduated = text.match(/毕业于([\u4e00-\u9fa5]{2,20}(?:大学|学院))/);
  if (cnGraduated) return cnGraduated[1];

  // 中文：XX大学（直接出现）
  const cnDirect = text.match(/([\u4e00-\u9fa5]{2,10}大学)/);
  if (cnDirect) return cnDirect[1];

  // 英文：University of XX
  const enUnivOf = text.match(/\b(University of [A-Z][\w\s]*?)(?:\s+with|\s*,|\s*\.|$)/);
  if (enUnivOf) return enUnivOf[1].trim();

  // 英文：XX University 或 XX Institute of Technology
  const enUnivSuffix = text.match(
    /\b((?:[A-Z][\w]*\s+)+(?:University|Institute of Technology))\b/,
  );
  if (enUnivSuffix) return enUnivSuffix[1].trim();

  return null;
}

/**
 * 从简历文本中提取 JLPT 日语能力等级
 * @description 匹配常见格式：N1/N2/N3/N4/N5，取最高（数字最小）的等级
 * @param text - 简历纯文本
 * @returns 提取到的 JLPT 等级（N1~N5），未匹配则返回 null
 */
export function extractJlptLevel(text: string): "N1" | "N2" | "N3" | "N4" | "N5" | null {
  // 匹配 JLPT N1~N5，含中日英常见写法
  // 例如：N1、JLPT N2、日本語能力試験N3、日语N2级
  const matches = text.matchAll(/(?:JLPT\s*|日本語能力試験\s*|日语能力考试\s*|日语\s*)?[Nn]([1-5])(?:\s*级|級)?/g);
  let highest: number | null = null;
  for (const m of matches) {
    const level = parseInt(m[1]);
    if (highest === null || level < highest) highest = level;
  }
  if (highest === null) return null;
  return `N${highest}` as "N1" | "N2" | "N3" | "N4" | "N5";
}

/**
 * 在数据库中根据院校名进行模糊匹配查询
 * @description 使用 PostgreSQL ILIKE 进行模糊搜索，匹配 name 或 aliases 字段
 * @param db - Drizzle 数据库实例
 * @param name - 待查询的院校名称
 * @returns 匹配到的院校记录或 null
 */
export async function lookupUniversity(
  db: any,
  name: string,
): Promise<{ name: string; tier: UniversityTier; country: string } | null> {
  const { universityTiers } = await import("../db/schema");
  const { ilike, sql } = await import("drizzle-orm");

  const [row] = await db
    .select({
      name: universityTiers.name,
      tier: universityTiers.tier,
      country: universityTiers.country,
    })
    .from(universityTiers)
    .where(ilike(universityTiers.name, `%${name}%`))
    .limit(1);

  if (row) return row as { name: string; tier: UniversityTier; country: string };

  // 尝试在 aliases 中搜索（使用 ANY）
  const [aliasRow] = await db
    .select({
      name: universityTiers.name,
      tier: universityTiers.tier,
      country: universityTiers.country,
    })
    .from(universityTiers)
    .where(sql`${name} ILIKE ANY(${universityTiers.aliases})`)
    .limit(1);

  return aliasRow
    ? (aliasRow as { name: string; tier: UniversityTier; country: string })
    : null;
}
