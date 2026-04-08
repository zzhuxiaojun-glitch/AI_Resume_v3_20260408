/**
 * @file 数据库连接初始化模块
 * @description 使用 postgres.js 驱动创建 PostgreSQL 连接，并通过 Drizzle ORM 初始化数据库实例。
 *              导出的 db 对象是整个应用的数据库操作入口，包含完整的表结构（Schema）映射。
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

/** 使用环境变量中的连接字符串创建 PostgreSQL 客户端 */
const client = postgres(env.DATABASE_URL);

/**
 * Drizzle ORM 数据库实例
 * 绑定了完整的表结构定义（Schema），支持类型安全的查询操作
 */
export const db = drizzle(client, { schema });
