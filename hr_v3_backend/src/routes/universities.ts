/**
 * @file 院校数据 REST API
 * @description 提供院校层级信息的查询接口，支持列表、模糊搜索和统计。
 *              基础路径：/api/universities
 */

import Elysia from "elysia";
import { db } from "../db/index";
import { universityTiers } from "../db/schema";
import { eq, ilike, sql, count } from "drizzle-orm";

export const universitiesRoute = new Elysia({ prefix: "/api/universities" })

  /**
   * GET /api/universities
   * 获取院校列表，支持 ?country= 和 ?tier= 筛选
   */
  .get("/", async ({ query }) => {
    const { country, tier } = query as Record<string, string | undefined>;

    let q = db
      .select()
      .from(universityTiers)
      .$dynamic();

    const conditions = [];
    if (country) conditions.push(eq(universityTiers.country, country));
    if (tier) conditions.push(eq(universityTiers.tier, tier as any));

    for (const cond of conditions) {
      q = q.where(cond);
    }

    return await q;
  })

  /**
   * GET /api/universities/stats
   * 院校统计信息（total / byTier / byCountry）
   */
  .get("/stats", async () => {
    const rows = await db
      .select({
        tier: universityTiers.tier,
        country: universityTiers.country,
        count: count(),
      })
      .from(universityTiers)
      .groupBy(universityTiers.tier, universityTiers.country);

    let total = 0;
    const byTier: Record<string, number> = {};
    const byCountry: Record<string, number> = {};

    for (const row of rows) {
      const c = Number(row.count);
      total += c;
      byTier[row.tier] = (byTier[row.tier] ?? 0) + c;
      byCountry[row.country] = (byCountry[row.country] ?? 0) + c;
    }

    return { total, byTier, byCountry };
  })

  /**
   * GET /api/universities/lookup?name=清华
   * 院校模糊搜索，返回匹配的院校及层级
   */
  .get("/lookup", async ({ query, set }) => {
    const name = (query as Record<string, string | undefined>).name;

    if (!name) {
      set.status = 400;
      return { error: "name parameter is required" };
    }

    const [row] = await db
      .select()
      .from(universityTiers)
      .where(ilike(universityTiers.name, `%${name}%`))
      .limit(1);

    if (!row) {
      set.status = 404;
      return { error: "University not found" };
    }

    return row;
  });
