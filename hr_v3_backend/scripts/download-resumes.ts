/**
 * 回填脚本：为已入库但缺少原件的邮件简历重新下载附件
 *
 * 查询 resumes WHERE filePath IS NULL AND source='email'，
 * LEFT JOIN email_process_logs 获取 imapUid，
 * 通过 IMAP 重新下载附件并保存到文件存储。
 *
 * IMAP 连接不稳定时自动重连，最多重试 3 次。
 *
 * 用法：bun scripts/download-resumes.ts
 */

import { ImapFlow } from "imapflow";
import { db } from "../src/db/index";
import { resumes, emailProcessLogs, candidates } from "../src/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { env } from "../src/env";
import { fileStorage } from "../src/lib/storage";
import { findAttachments } from "../src/services/email";

// ImapFlow 连接断开时内部 Promise 会 reject，兜底防崩溃
process.on("unhandledRejection", (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Connection not available") || msg.includes("Socket timeout")) {
    console.log(`  [兜底] ${msg}`);
    return;
  }
  console.error("unhandledRejection:", err);
  process.exit(1);
});

const MAX_RETRIES = 50;
/** 每下载一个附件后等待的毫秒数，避免服务器断连 */
const DOWNLOAD_DELAY_MS = 2000;
/** 重连间隔（毫秒） */
const RECONNECT_DELAY_MS = 10_000;

function createImapClient() {
  return new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: env.IMAP_PORT === 993,
    tls: { rejectUnauthorized: false },
    auth: {
      user: env.IMAP_USER,
      pass: env.IMAP_PASS,
    },
    logger: false,
  });
}

interface DownloadRow {
  resumeId: string;
  candidateId: string;
  fileName: string;
  mimeType: string | null;
  imapUid: number | null;
}

/**
 * 用一个 IMAP 连接处理一批记录，返回成功/失败数和剩余未处理列表
 */
async function processBatch(rows: DownloadRow[]): Promise<{
  success: number;
  failed: number;
  remaining: DownloadRow[];
}> {
  const client = createImapClient();

  // 捕获 ImapFlow 的 error 事件，防止 unhandled error 崩溃
  let connectionLost = false;
  client.on("error", (err: Error) => {
    connectionLost = true;
    console.log(`  IMAP error 事件: ${err.message}`);
  });

  await client.connect();

  let success = 0;
  let failed = 0;
  let i = 0;

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      for (; i < rows.length; i++) {
        if (connectionLost) break;

        const row = rows[i];
        const uid = String(row.imapUid);

        // 获取邮件结构
        const fetchResult = await client.fetchOne(uid, {
          bodyStructure: true,
        });
        if (!fetchResult?.bodyStructure) {
          console.log(`  UID ${uid} 无法获取结构，跳过`);
          failed++;
          continue;
        }

        const attachments = findAttachments(fetchResult.bodyStructure);
        const att =
          attachments.find((a) => a.filename === row.fileName) ??
          attachments[0];
        if (!att) {
          console.log(`  UID ${uid} 无附件，跳过`);
          failed++;
          continue;
        }

        // 下载附件
        const { content } = await client.download(uid, att.part);
        const chunks: Buffer[] = [];
        for await (const chunk of content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);

        // 保存到文件存储
        const filePath = await fileStorage.save(
          row.candidateId,
          buffer,
          row.mimeType ?? "application/pdf",
        );

        // 更新数据库
        await db
          .update(resumes)
          .set({ filePath })
          .where(eq(resumes.id, row.resumeId));

        success++;
        if (success % 20 === 0) {
          console.log(`  已下载 ${success} 个...`);
        }

        // 每个文件下完等一下，降低服务器压力
        await new Promise((r) => setTimeout(r, DOWNLOAD_DELAY_MS));
      }
    } finally {
      try { lock.release(); } catch { /* 连接已断 */ }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  连接中断 (已处理 ${i}/${rows.length}): ${msg}`);
  }

  // 安全断开
  try {
    await client.logout();
  } catch {
    // 连接已断，忽略
  }

  // 返回未处理的部分
  const processed = success + failed;
  const remaining = rows.slice(processed);
  return { success, failed, remaining };
}

async function main() {
  // 查询缺少原件的邮件简历
  const pending = await db
    .select({
      resumeId: resumes.id,
      candidateId: resumes.candidateId,
      fileName: resumes.fileName,
      mimeType: resumes.mimeType,
      imapUid: emailProcessLogs.imapUid,
    })
    .from(resumes)
    .innerJoin(candidates, eq(candidates.id, resumes.candidateId))
    .leftJoin(
      emailProcessLogs,
      eq(emailProcessLogs.candidateId, resumes.candidateId),
    )
    .where(and(isNull(resumes.filePath), eq(resumes.source, "email")));

  console.log(`找到 ${pending.length} 个缺少原件的邮件简历`);

  // 过滤出有 imapUid 的记录
  let remaining: DownloadRow[] = pending.filter(
    (r): r is DownloadRow & { imapUid: number } => r.imapUid != null,
  );
  const skipped = pending.length - remaining.length;
  if (skipped > 0) {
    console.log(`跳过 ${skipped} 个无 imapUid 的记录（无法重新下载）`);
  }

  if (remaining.length === 0) {
    console.log("无可下载的简历，退出");
    process.exit(0);
  }

  console.log(`开始下载 ${remaining.length} 个简历...`);

  let totalSuccess = 0;
  let totalFailed = 0;
  let attempt = 0;

  while (remaining.length > 0 && attempt < MAX_RETRIES) {
    attempt++;
    if (attempt > 1) {
      console.log(`\n--- 第 ${attempt} 次重连 (剩余 ${remaining.length} 个) ---`);
      // 等待再重连，避免被邮件服务器限流
      await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
    }

    let result: Awaited<ReturnType<typeof processBatch>>;
    try {
      result = await processBatch(remaining);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  连接失败: ${msg}`);
      continue;
    }
    totalSuccess += result.success;
    totalFailed += result.failed;
    remaining = result.remaining;

    console.log(
      `本轮: ${result.success} 成功, ${result.failed} 失败, ${remaining.length} 剩余`,
    );

    // 如果本轮 0 成功，说明 IMAP 可能完全不可用
    if (result.success === 0 && remaining.length > 0) {
      console.log("本轮无进展，停止重试");
      break;
    }
  }

  console.log(`\n完成: ${totalSuccess} 成功, ${totalFailed} 失败, ${remaining.length} 未处理`);
  process.exit(0);
}

main();
