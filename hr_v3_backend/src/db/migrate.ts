/**
 * @file 数据库迁移执行脚本
 * @description 独立运行的脚本，用于执行 Drizzle ORM 生成的数据库迁移文件。
 *              迁移文件存放在项目根目录的 ./drizzle 文件夹下。
 *              通常在部署或数据库结构变更后通过命令行单独运行此脚本。
 */

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";

/**
 * 执行数据库迁移
 * @description 创建一个最大连接数为 1 的数据库客户端（避免迁移时的并发问题），
 *              读取 ./drizzle 目录下的迁移文件并依次执行，完成后关闭连接。
 */
async function runMigrations() {
  // 限制最大连接数为 1，确保迁移操作的顺序执行和数据一致性
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");

  // 迁移完成后关闭数据库连接，释放资源
  await client.end();
}

// 立即执行迁移，若失败则输出错误信息并以非零状态码退出
runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
