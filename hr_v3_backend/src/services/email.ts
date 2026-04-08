/**
 * @file 邮件收取与简历自动处理服务（两阶段并发架构）
 * @description 通过 IMAP 协议连接邮箱服务器，轮询收件箱中的未读邮件。
 *
 *              ── Phase 1: IMAP 快速扫描（串行，受 IMAP 连接限制） ──
 *              1. IMAP 搜索未读邮件
 *              2. DB 去重 — email_process_logs.messageId 幂等检查
 *              3. 附件识别 — findAttachments() 递归 MIME 树
 *              4. 邮件分类 — classifyEmail() 三层规则（零 LLM 成本）
 *              5. 附件下载 — 流式读取为 Buffer
 *              6. 简历解析 — parseResume() PDF/DOCX→纯文本
 *              7. 院校查询 — extractUniversityName + lookupUniversity
 *              8. 候选人入库 — INSERT candidates + resumes（AI 前）
 *              9. WS 推送 — candidate:new
 *             10. 标记已读 — IMAP \Seen
 *             11. 收集待评分任务
 *
 *              ── Phase 2: AI 并发评分（IMAP 已释放，10 路并发） ──
 *             12. AI 评分 — scoreResume() MiniMax M2.7（10 路并发）
 *             13. 评分入库 — INSERT scores（AI 后）
 *             14. WS 推送 — candidate:scored
 *             15. WS 推送 — inbox:summary（批次摘要）
 *
 *              每步状态变化记录到 email_process_logs：
 *              fetched → parsed → scored（或 error）
 */

import { ImapFlow } from "imapflow";
import { env } from "../env";
import { parseResume } from "./resume-parser";
import { scoreResume } from "./ai-scorer";
import { db } from "../db/index";
import { candidates, resumes, scores, positions, emailProcessLogs } from "../db/schema";
import { eq } from "drizzle-orm";
import type { SkillConfig } from "../lib/types";
import type { UniversityTier } from "../lib/types";
import { eventBus } from "../lib/event-bus";
import type { ServerEvent } from "../lib/ws-types";
import { extractUniversityName, lookupUniversity, extractJlptLevel } from "./university-lookup";
import { extractStructuredResume } from "./resume-extractor";
import type { ScoringWeights } from "./ai-scorer";
import { classifyEmail } from "./email-classifier";
import { fileStorage } from "../lib/storage";

/** AI 评分并发数 — 10 路并发平衡速度与 API 限流 */
const SCORING_CONCURRENCY = 10;

/** Phase 2 评分任务描述 */
interface ScoringTask {
  candidateId: string;
  cleanText: string;
  positionId: string;
  positionTitle: string;
  positionDescription: string;
  skillConfig: SkillConfig;
  locale: string;
  universityTier: UniversityTier;
  scoringWeights: ScoringWeights | undefined;
  senderName: string;
  messageId: string;
}

/**
 * 创建 IMAP 邮件客户端实例
 * @description 使用环境变量中的邮箱配置创建 ImapFlow 客户端。
 *              当端口为 993 时自动启用 SSL 安全连接；
 *              TLS 配置中禁用证书验证（rejectUnauthorized: false）以兼容自签名证书。
 * @returns {ImapFlow} 配置好的 IMAP 客户端实例
 */
function createImapClient() {
  return new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    // 端口 993 是 IMAPS（加密）标准端口
    secure: env.IMAP_PORT === 993,
    // 允许自签名证书，避免企业内网邮箱连接失败
    tls: { rejectUnauthorized: false },
    auth: {
      user: env.IMAP_USER,
      pass: env.IMAP_PASS,
    },
    // 禁用 ImapFlow 内置日志，避免过多输出
    logger: false,
  });
}

/**
 * 轮询收件箱，自动处理含简历附件的未读邮件（两阶段并发架构）
 *
 * @description
 *   Phase 1（串行，IMAP 连接内）：
 *   - 搜索所有未读邮件 → 分类/去重/下载/解析 → 候选人入库 → 收集待评分任务
 *   - 完成后立即释放 IMAP 连接
 *
 *   Phase 2（并发，IMAP 已释放）：
 *   - 10 路并发调用 AI 评分 → 评分入库 → WS 推送
 *   - 单个评分失败不影响其他候选人
 *
 * @param defaultPositionId - 默认关联的职位 ID，新创建的候选人会归入该职位
 * @returns {Promise<string[]>} 本次处理新创建的候选人 ID 列表
 */
export async function pollInbox(defaultPositionId: string) {
  // ══════════════════════════════════════════════════════════════
  // Phase 1: IMAP 快速扫描 — 分类/下载/解析/入库（无 AI 调用）
  // ══════════════════════════════════════════════════════════════
  const scoringTasks: ScoringTask[] = [];
  const results: string[] = [];
  let position: typeof positions.$inferSelect;

  const client = createImapClient();
  await client.connect();

  try {
    // 预加载职位信息（整个批次共用）
    const [pos] = await db
      .select()
      .from(positions)
      .where(eq(positions.id, defaultPositionId))
      .limit(1);
    if (!pos) return [];
    position = pos;

    const lock = await client.getMailboxLock("INBOX");
    try {
      const searchResult = await client.search({ seen: false });
      if (!searchResult || !Array.isArray(searchResult) || !searchResult.length)
        return [];

      console.log(`[Phase 1] 发现 ${searchResult.length} 封未读邮件，开始快速扫描...`);
      let scannedCount = 0;

      for (const uid of searchResult) {
        scannedCount++;
        if (scannedCount % 100 === 0) {
          console.log(`[Phase 1] 已扫描 ${scannedCount}/${searchResult.length}...`);
        }

        const fetchResult = await client.fetchOne(String(uid), {
          envelope: true,
          bodyStructure: true,
        });

        if (!fetchResult || typeof fetchResult !== "object") continue;
        const msg = fetchResult;
        if (!msg.envelope || !msg.bodyStructure) continue;

        const senderName =
          msg.envelope.from?.[0]?.name ??
          msg.envelope.from?.[0]?.address ??
          "Unknown";
        const senderEmail = msg.envelope.from?.[0]?.address ?? undefined;
        const subject = msg.envelope.subject ?? "";
        const messageId = msg.envelope.messageId ?? "";

        // ── 去重检查：已处理过的邮件直接跳过 ──
        if (messageId) {
          const [existing] = await db
            .select()
            .from(emailProcessLogs)
            .where(eq(emailProcessLogs.messageId, messageId))
            .limit(1);
          if (existing && existing.status === "scored") {
            await client.messageFlagsAdd(String(uid), ["\\Seen"]);
            continue;
          }
        }

        const attachments = findAttachments(msg.bodyStructure);

        // ── 分类 ──
        const classification = classifyEmail(
          senderEmail ?? "",
          subject,
          attachments.length > 0,
        );

        // 非简历邮件：记录 skipped，标记已读
        if (classification.isResume === "no") {
          if (messageId) {
            await db
              .insert(emailProcessLogs)
              .values({
                messageId,
                imapUid: uid,
                senderEmail: senderEmail ?? null,
                subject,
                classification: "not_resume",
                classificationReason: classification.reason,
                status: "skipped",
                hasResumeAttachment: attachments.length > 0,
                processedAt: new Date(),
              })
              .onConflictDoNothing();
          }
          await client.messageFlagsAdd(String(uid), ["\\Seen"]);
          continue;
        }

        // 无附件：即使分类为 yes/uncertain，无附件也无法提取简历
        if (attachments.length === 0) {
          if (messageId) {
            await db
              .insert(emailProcessLogs)
              .values({
                messageId,
                imapUid: uid,
                senderEmail: senderEmail ?? null,
                subject,
                classification: classification.isResume === "yes" ? "resume" : "uncertain",
                classificationReason: classification.reason,
                status: "skipped",
                hasResumeAttachment: false,
              })
              .onConflictDoNothing();
          }
          await client.messageFlagsAdd(String(uid), ["\\Seen"]);
          continue;
        }

        // ── 记录 fetched 状态 ──
        if (messageId) {
          await db
            .insert(emailProcessLogs)
            .values({
              messageId,
              imapUid: uid,
              senderEmail: senderEmail ?? null,
              subject,
              classification: classification.isResume === "yes" ? "resume" : "uncertain",
              classificationReason: classification.reason,
              status: "fetched",
              hasResumeAttachment: true,
            })
            .onConflictDoNothing();
        }

        // ── 下载 + 解析 + 入库（不含 AI 评分） ──
        for (const att of attachments) {
          try {
            const { content } = await client.download(String(uid), att.part);
            const chunks: Buffer[] = [];
            for await (const chunk of content) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const buffer = Buffer.concat(chunks);

            const parsed = await parseResume(buffer, att.filename);
            // 兜底清除 null bytes — PostgreSQL text 类型不支持 \0
            const cleanText = parsed.text.replace(/\0/g, "");

            // 从简历文本中提取院校名并查询层级
            let university: string | null = null;
            let universityTier: UniversityTier | null = null;
            const extractedName = extractUniversityName(cleanText);
            if (extractedName) {
              const uniResult = await lookupUniversity(db, extractedName);
              if (uniResult) {
                university = uniResult.name;
                universityTier = uniResult.tier as UniversityTier;
              }
            }

            // 从简历文本中提取 JLPT 日语能力等级
            const jlptLevel = extractJlptLevel(cleanText);

            // 候选人 + 简历入库（无 AI）
            const [candidate] = await db
              .insert(candidates)
              .values({
                positionId: defaultPositionId,
                name: senderName,
                email: senderEmail,
                status: "screening",
                ...(university && { university }),
                ...(universityTier && { universityTier }),
                ...(jlptLevel && { jlptLevel }),
              })
              .returning();

            // 保存简历原件到文件存储
            const filePath = await fileStorage.save(candidate.id, buffer, parsed.mimeType);

            await db.insert(resumes).values({
              candidateId: candidate.id,
              fileName: att.filename,
              mimeType: parsed.mimeType,
              rawText: cleanText,
              source: "email",
              filePath,
            });

            // 更新状态：parsed
            if (messageId) {
              await db
                .update(emailProcessLogs)
                .set({ status: "parsed" })
                .where(eq(emailProcessLogs.messageId, messageId));
            }

            // WS 推送：新候选人已创建
            eventBus.emit({
              type: "candidate:new",
              candidateId: candidate.id,
              name: senderName,
              email: senderEmail,
              positionId: defaultPositionId,
              positionTitle: position.title,
              source: "email",
              timestamp: new Date().toISOString(),
            });

            results.push(candidate.id);

            // 收集 Phase 2 评分任务
            scoringTasks.push({
              candidateId: candidate.id,
              cleanText,
              positionId: defaultPositionId,
              positionTitle: position.title,
              positionDescription: position.description ?? "",
              skillConfig: position.skillConfig as SkillConfig,
              locale: position.locale ?? "zh",
              universityTier: universityTier ?? "D",
              scoringWeights: (position.scoringWeights as ScoringWeights | null) ?? undefined,
              senderName,
              messageId,
            });
          } catch (err) {
            if (messageId) {
              const errMsg = err instanceof Error ? err.message : String(err);
              await db
                .update(emailProcessLogs)
                .set({ status: "error", error: errMsg.replace(/\0/g, "") })
                .where(eq(emailProcessLogs.messageId, messageId));
            }
          }
        }

        // 标记已读
        await client.messageFlagsAdd(String(uid), ["\\Seen"]);
      }

      console.log(
        `[Phase 1] 扫描完成: ${searchResult.length} 封邮件, ${results.length} 个候选人待评分`,
      );
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  // ══════════════════════════════════════════════════════════════
  // Phase 2: AI 并发评分（IMAP 已释放，10 路并发）
  // ══════════════════════════════════════════════════════════════
  if (scoringTasks.length === 0) return results;

  console.log(
    `[Phase 2] 开始 AI 评分: ${scoringTasks.length} 个候选人, ${SCORING_CONCURRENCY} 路并发...`,
  );

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const topCandidates: Array<{
    candidateId: string;
    name: string;
    grade: string;
    totalScore: number;
  }> = [];
  let scoredCount = 0;

  // 按 SCORING_CONCURRENCY 分批并发
  for (let i = 0; i < scoringTasks.length; i += SCORING_CONCURRENCY) {
    const batch = scoringTasks.slice(i, i + SCORING_CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (task) => {
        try {
          // 评分与结构化提取并发执行（2 个 LLM 请求同时发出）
          const [score, structuredInfo] = await Promise.all([
            scoreResume(
              task.cleanText,
              task.positionTitle,
              task.positionDescription,
              task.skillConfig,
              task.locale,
              task.universityTier,
              task.scoringWeights,
            ),
            extractStructuredResume(task.cleanText),
          ]);

          await db.insert(scores).values({
            candidateId: task.candidateId,
            positionId: task.positionId,
            ...score,
          });

          // 回填 LLM 结构化字段到候选人记录（电话/年龄/性别/专业/工作年限/赴日意向）
          await db
            .update(candidates)
            .set({
              ...(structuredInfo.phone && { phone: structuredInfo.phone }),
              ...(structuredInfo.age != null && { age: structuredInfo.age }),
              ...(structuredInfo.gender && { gender: structuredInfo.gender }),
              ...(structuredInfo.education && { educationLevel: structuredInfo.education }),
              ...(structuredInfo.major && { major: structuredInfo.major }),
              ...(structuredInfo.workYears != null && { workYears: structuredInfo.workYears }),
              ...(structuredInfo.relocationWilling != null && { relocationWilling: structuredInfo.relocationWilling }),
              // JLPT：LLM 兜底（若正则未提取到才写入）
              ...(structuredInfo.jlptLevel && { jlptLevel: structuredInfo.jlptLevel }),
            })
            .where(eq(candidates.id, task.candidateId));

          if (task.messageId) {
            await db
              .update(emailProcessLogs)
              .set({
                status: "scored",
                candidateId: task.candidateId,
                processedAt: new Date(),
              })
              .where(eq(emailProcessLogs.messageId, task.messageId));
          }

          eventBus.emit({
            type: "candidate:scored",
            candidateId: task.candidateId,
            name: task.senderName,
            positionId: task.positionId,
            totalScore: score.totalScore,
            grade: score.grade,
            matchedSkills: score.matchedSkills,
            educationScore: score.educationScore,
            timestamp: new Date().toISOString(),
          });

          return { task, score };
        } catch (err) {
          if (task.messageId) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await db
              .update(emailProcessLogs)
              .set({ status: "error", error: errMsg.replace(/\0/g, "") })
              .where(eq(emailProcessLogs.messageId, task.messageId));
          }
          throw err;
        }
      }),
    );

    // 统计本批结果
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        const { task, score } = result.value;
        scoredCount++;
        gradeDistribution[score.grade]++;
        topCandidates.push({
          candidateId: task.candidateId,
          name: task.senderName,
          grade: score.grade,
          totalScore: score.totalScore,
        });
      }
    }

    console.log(
      `[Phase 2] 已评分 ${Math.min(i + SCORING_CONCURRENCY, scoringTasks.length)}/${scoringTasks.length}...`,
    );
  }

  // 批次摘要
  if (scoredCount > 0) {
    topCandidates.sort((a, b) => b.totalScore - a.totalScore);
    eventBus.emit({
      type: "inbox:summary",
      totalProcessed: scoredCount,
      gradeDistribution,
      topCandidates: topCandidates.slice(0, 5),
      timestamp: new Date().toISOString(),
    });
  }

  console.log(
    `[Phase 2] 评分完成: ${scoredCount} 成功, ${scoringTasks.length - scoredCount} 失败`,
  );

  return results;
}

/**
 * 附件信息接口
 * @description 描述邮件中一个附件的位置和文件名
 */
interface AttachmentInfo {
  /** 附件在邮件 MIME 结构中的部分编号（如 "1.2"），用于下载指定附件 */
  part: string;
  /** 附件的原始文件名 */
  filename: string;
}

/**
 * 递归查找邮件体结构中的简历附件
 * @description 递归遍历邮件的 MIME 树结构，查找所有文件名以 .pdf、.doc 或 .docx
 *              结尾的附件。兼容不同邮件客户端的附件声明方式（包括 BOSS 直聘等平台
 *              将 PDF 附件标记为 "inline" 而非 "attachment" 的情况）。
 * @param structure - 邮件体的 MIME 结构对象（bodyStructure）
 * @param prefix - 当前节点在 MIME 树中的路径前缀，用于构建附件编号
 * @returns {AttachmentInfo[]} 找到的所有简历附件信息列表
 */
export function findAttachments(structure: any, prefix = ""): AttachmentInfo[] {
  const results: AttachmentInfo[] = [];

  if (structure.childNodes) {
    // 当前节点是多部分（multipart）结构，递归遍历所有子节点
    for (let i = 0; i < structure.childNodes.length; i++) {
      // 构建 MIME 部分编号：顶层为 "1"、"2"，嵌套层为 "1.1"、"1.2" 等
      const part = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      results.push(...findAttachments(structure.childNodes[i], part));
    }
  } else {
    // 叶子节点（具体的内容部分），尝试提取文件名
    const filename =
      structure.dispositionParameters?.filename ??
      structure.parameters?.name ??
      "";

    // 通过文件扩展名匹配简历文件，不依赖 Content-Disposition 头
    // 因为部分平台（如 BOSS 直聘）将 PDF 附件标记为 "inline" 而非 "attachment"
    if (/\.(pdf|docx?)$/i.test(filename)) {
      const part = prefix || "1";
      results.push({ part, filename });
    }
  }

  return results;
}
