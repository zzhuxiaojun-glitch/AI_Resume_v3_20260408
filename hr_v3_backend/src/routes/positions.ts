/**
 * @file 职位管理路由
 * @description 提供职位（Position）的完整 CRUD RESTful API。
 *              基础路径：/api/positions
 */

import Elysia from "elysia";
import { db } from "../db/index";
import { positions } from "../db/schema";
import { eq } from "drizzle-orm";

export const positionsRoute = new Elysia({ prefix: "/api/positions" })

  /**
   * GET /api/positions
   * 获取所有职位列表，按创建时间升序排列
   */
  .get("/", async () => {
    const rows = await db.select().from(positions).orderBy(positions.createdAt);
    return rows;
  })

  /**
   * GET /api/positions/:id
   * 根据 ID 获取单个职位的详细信息
   */
  .get("/:id", async ({ params, set }) => {
    const [row] = await db
      .select()
      .from(positions)
      .where(eq(positions.id, params.id))
      .limit(1);
    if (!row) {
      set.status = 404;
      return { error: "Position not found" };
    }
    return row;
  })

  /**
   * POST /api/positions
   * 创建一个新的招聘职位
   */
  .post("/", async ({ body, set }) => {
    const b = body as any;
    const [row] = await db
      .insert(positions)
      .values({
        title: b.title,
        department: b.department,
        description: b.description,
        skillConfig: b.skillConfig ?? { must: [], nice: [], reject: [] },
        status: b.status ?? "open",
        locale: b.locale ?? "zh",
      })
      .returning();
    set.status = 201;
    return row;
  })

  /**
   * PATCH /api/positions/:id
   * 部分更新指定职位的信息
   */
  .patch("/:id", async ({ params, body, set }) => {
    const b = body as any;
    const [row] = await db
      .update(positions)
      .set({
        ...b,
        updatedAt: new Date(),
      })
      .where(eq(positions.id, params.id))
      .returning();
    if (!row) {
      set.status = 404;
      return { error: "Position not found" };
    }
    return row;
  })

  /**
   * DELETE /api/positions/:id
   * 删除指定的职位（硬删除）
   */
  .delete("/:id", async ({ params, set }) => {
    const [row] = await db
      .delete(positions)
      .where(eq(positions.id, params.id))
      .returning();
    if (!row) {
      set.status = 404;
      return { error: "Position not found" };
    }
    return { deleted: true };
  });
