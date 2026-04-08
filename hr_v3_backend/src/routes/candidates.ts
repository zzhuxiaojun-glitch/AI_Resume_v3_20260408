/**
 * @file 候选人管理路由
 * @description 提供候选人（Candidate）的查询和更新 API。
 *              基础路径：/api/candidates
 */

import Elysia from "elysia";
import { db } from "../db/index";
import { candidates, scores } from "../db/schema";
import { eq, desc, or, ilike, count, sql } from "drizzle-orm";

export const candidatesRoute = new Elysia({ prefix: "/api/candidates" })

  /**
   * GET /api/candidates
   * 获取候选人列表，支持多维度筛选，按 totalScore 降序
   */
  .get("/", async ({ query }) => {
    const { positionId, status, grade, universityTier, jlptLevel } = query as Record<string, string | undefined>;

    let q = db
      .select({
        id: candidates.id,
        positionId: candidates.positionId,
        name: candidates.name,
        email: candidates.email,
        phone: candidates.phone,
        education: candidates.education,
        university: candidates.university,
        universityTier: candidates.universityTier,
        jlptLevel: candidates.jlptLevel,
        skills: candidates.skills,
        status: candidates.status,
        notes: candidates.notes,
        createdAt: candidates.createdAt,
        totalScore: scores.totalScore,
        educationScore: scores.educationScore,
        grade: scores.grade,
      })
      .from(candidates)
      .leftJoin(scores, eq(candidates.id, scores.candidateId))
      .orderBy(desc(scores.totalScore))
      .$dynamic();

    const conditions = [];
    if (positionId) conditions.push(eq(candidates.positionId, positionId));
    if (status) conditions.push(eq(candidates.status, status as any));
    if (grade) conditions.push(eq(scores.grade, grade as any));
    if (universityTier) conditions.push(eq(candidates.universityTier, universityTier as any));
    if (jlptLevel) conditions.push(eq(candidates.jlptLevel, jlptLevel as any));

    for (const cond of conditions) {
      q = q.where(cond);
    }

    const rows = await q;
    return rows;
  })

  /**
   * GET /api/candidates/:id
   * 获取单个候选人详情 + 所有评分记录
   */
  .get("/:id", async ({ params, set }) => {
    const [candidate] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, params.id))
      .limit(1);
    if (!candidate) {
      set.status = 404;
      return { error: "Candidate not found" };
    }

    const scoreRows = await db
      .select()
      .from(scores)
      .where(eq(scores.candidateId, params.id));

    return { ...candidate, scores: scoreRows };
  })

  /**
   * GET /api/candidates/stats
   * 候选人聚合统计：按评级、状态、院校层级、JLPT 等级分组计数
   */
  .get("/stats", async () => {
    const [total] = await db.select({ count: count() }).from(candidates);

    const byGrade = await db
      .select({ grade: scores.grade, count: count() })
      .from(scores)
      .groupBy(scores.grade);

    const byStatus = await db
      .select({ status: candidates.status, count: count() })
      .from(candidates)
      .groupBy(candidates.status);

    const byUniversityTier = await db
      .select({ tier: candidates.universityTier, count: count() })
      .from(candidates)
      .groupBy(candidates.universityTier);

    const byJlptLevel = await db
      .select({ level: candidates.jlptLevel, count: count() })
      .from(candidates)
      .where(sql`${candidates.jlptLevel} IS NOT NULL`)
      .groupBy(candidates.jlptLevel);

    return {
      total: Number(total?.count ?? 0),
      byGrade: Object.fromEntries(byGrade.map((r) => [r.grade ?? "unscored", Number(r.count)])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)])),
      byUniversityTier: Object.fromEntries(byUniversityTier.map((r) => [r.tier ?? "unknown", Number(r.count)])),
      byJlptLevel: Object.fromEntries(byJlptLevel.map((r) => [r.level!, Number(r.count)])),
    };
  })

  /**
   * GET /api/candidates/export
   * 导出候选人列表为 CSV（支持与列表相同的筛选参数）
   */
  .get("/export", async ({ query, set }) => {
    const { positionId, status, grade, universityTier, jlptLevel } = query as Record<string, string | undefined>;

    let q = db
      .select({
        id: candidates.id,
        name: candidates.name,
        email: candidates.email,
        phone: candidates.phone,
        university: candidates.university,
        universityTier: candidates.universityTier,
        jlptLevel: candidates.jlptLevel,
        education: candidates.education,
        status: candidates.status,
        notes: candidates.notes,
        createdAt: candidates.createdAt,
        totalScore: scores.totalScore,
        grade: scores.grade,
      })
      .from(candidates)
      .leftJoin(scores, eq(candidates.id, scores.candidateId))
      .orderBy(desc(scores.totalScore))
      .$dynamic();

    const conditions = [];
    if (positionId) conditions.push(eq(candidates.positionId, positionId));
    if (status) conditions.push(eq(candidates.status, status as any));
    if (grade) conditions.push(eq(scores.grade, grade as any));
    if (universityTier) conditions.push(eq(candidates.universityTier, universityTier as any));
    if (jlptLevel) conditions.push(eq(candidates.jlptLevel, jlptLevel as any));
    for (const cond of conditions) q = q.where(cond);

    const rows = await q;

    const header = "ID,名前,メール,電話,大学,層,日本語,学歴,ステータス,スコア,評価,登録日,備考";
    const csvRows = rows.map((r) =>
      [
        r.id,
        `"${(r.name ?? "").replace(/"/g, '""')}"`,
        r.email ?? "",
        r.phone ?? "",
        `"${(r.university ?? "").replace(/"/g, '""')}"`,
        r.universityTier ?? "",
        r.jlptLevel ?? "",
        r.education ?? "",
        r.status,
        r.totalScore?.toFixed(2) ?? "",
        r.grade ?? "",
        r.createdAt ? new Date(r.createdAt).toISOString().split("T")[0] : "",
        `"${(r.notes ?? "").replace(/"/g, '""')}"`,
      ].join(","),
    );

    set.headers["Content-Type"] = "text/csv; charset=utf-8";
    set.headers["Content-Disposition"] = `attachment; filename="candidates_${new Date().toISOString().split("T")[0]}.csv"`;
    return "\uFEFF" + [header, ...csvRows].join("\n");
  })

  /**
   * GET /api/candidates/search?q=xxx
   * 按姓名或邮箱模糊查询候选人，返回学校信息和 JLPT 等级
   * 参数：q（必填，关键字），limit（可选，默认20）
   */
  .get("/search", async ({ query }) => {
    const q = (query as Record<string, string>).q ?? "";
    const limit = Math.min(parseInt((query as Record<string, string>).limit ?? "20") || 20, 100);

    if (!q.trim()) return [];

    const rows = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        email: candidates.email,
        university: candidates.university,
        universityTier: candidates.universityTier,
        jlptLevel: candidates.jlptLevel,
        status: candidates.status,
        createdAt: candidates.createdAt,
      })
      .from(candidates)
      .where(
        or(
          ilike(candidates.name, `%${q}%`),
          ilike(candidates.email, `%${q}%`),
        ),
      )
      .orderBy(desc(candidates.createdAt))
      .limit(limit);

    return rows;
  })

  /**
   * PATCH /api/candidates/:id
   * 部分更新候选人信息（状态、备注、联系方式）
   */
  .patch("/:id", async ({ params, body, set }) => {
    const b = body as any;
    const [row] = await db
      .update(candidates)
      .set({
        ...(b.status && { status: b.status }),
        ...(b.notes !== undefined && { notes: b.notes }),
        ...(b.phone && { phone: b.phone }),
        ...(b.email && { email: b.email }),
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, params.id))
      .returning();
    if (!row) {
      set.status = 404;
      return { error: "Candidate not found" };
    }
    return row;
  });
