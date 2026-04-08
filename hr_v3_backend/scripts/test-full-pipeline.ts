/**
 * 完整测试：抓取最新20封简历邮件，解析PDF，AI评分，存入数据库
 * 运行：bun scripts/test-full-pipeline.ts
 */

import { ImapFlow } from "imapflow";
import { parseResume } from "../src/services/resume-parser";
import { scoreResume } from "../src/services/ai-scorer";
import { db } from "../src/db/index";
import { candidates, resumes, scores, positions } from "../src/db/schema";
import { eq } from "drizzle-orm";
import type { SkillConfig } from "../src/lib/types";

const client = new ImapFlow({
  host: process.env.IMAP_HOST || "mail.ivis-sh.com",
  port: Number(process.env.IMAP_PORT) || 143,
  secure: Number(process.env.IMAP_PORT) === 993,
  tls: { rejectUnauthorized: false },
  auth: {
    user: process.env.IMAP_USER || "hr@ivis-sh.com",
    pass: process.env.IMAP_PASS || "",
  },
  logger: false,
});

async function main() {
  // 1. 创建（或复用）测试职位
  let [position] = await db
    .select()
    .from(positions)
    .where(eq(positions.title, "软件开发工程师"))
    .limit(1);

  if (!position) {
    [position] = await db
      .insert(positions)
      .values({
        title: "软件开发工程师",
        department: "研发部",
        description:
          "负责公司产品后端/前端开发，参与系统架构设计，编写高质量代码",
        skillConfig: {
          must: [
            "Java",
            "TypeScript",
            "SQL",
            "Spring Boot",
            "React",
            "计算机相关专业",
          ],
          nice: [
            "Docker",
            "Kubernetes",
            "微服务",
            "CI/CD",
            "Python",
            "Go",
            "云原生",
          ],
          reject: [
            "无编程经验",
            "培训机构简历造假",
            "工作经历空白超过2年",
          ],
        },
        status: "open",
      })
      .returning();
    console.log(`创建测试职位: ${position.id}`);
  } else {
    console.log(`复用已有职位: ${position.id}`);
  }

  const skillConfig = position.skillConfig as SkillConfig;

  // 2. 连接 IMAP
  await client.connect();
  console.log("已连接 IMAP\n");

  const lock = await client.getMailboxLock("INBOX");
  try {
    // 搜索所有邮件取最新20封（有简历附件的）
    const allUids = await client.search({ all: true });
    // 倒序取最新的，跳过最后一封（UID 4334 是非简历服务提醒）
    const candidates20 = allUids.slice(-21, -1); // UIDs 4315-4333

    console.log(`处理 ${candidates20.length} 封邮件\n`);

    let processed = 0;
    let failed = 0;

    for (const uid of candidates20) {
      const msg = await client.fetchOne(String(uid), {
        envelope: true,
        bodyStructure: true,
      });

      if (!msg?.envelope || !msg?.bodyStructure) continue;

      const senderName =
        msg.envelope.from?.[0]?.name ??
        msg.envelope.from?.[0]?.address ??
        "Unknown";
      const senderEmail = msg.envelope.from?.[0]?.address ?? undefined;
      const subject = msg.envelope.subject ?? "(无主题)";

      // 从主题中提取候选人姓名（BOSS直聘格式: "姓名 | ..."）
      const nameMatch = subject.match(/^(.+?)\s*\|/);
      const candidateName = nameMatch ? nameMatch[1].trim() : senderName;

      const attachments = findAttachments(msg.bodyStructure);
      const resumeFiles = attachments.filter((a) =>
        /\.(pdf|docx?)$/i.test(a.filename),
      );

      if (resumeFiles.length === 0) {
        console.log(`[${uid}] ⏭ 跳过 (无简历附件): ${subject}`);
        continue;
      }

      for (const att of resumeFiles) {
        try {
          // 下载
          const { content } = await client.download(String(uid), att.part);
          const chunks: Buffer[] = [];
          for await (const chunk of content) {
            chunks.push(
              Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
            );
          }
          const buffer = Buffer.concat(chunks);

          // 解析
          const parsed = await parseResume(buffer, att.filename);
          console.log(
            `[${uid}] 📄 ${candidateName} - ${att.filename} (${parsed.text.length}字)`,
          );

          // 创建候选人
          const [candidate] = await db
            .insert(candidates)
            .values({
              positionId: position.id,
              name: candidateName,
              email: senderEmail,
              status: "screening",
            })
            .returning();

          // 保存简历
          await db.insert(resumes).values({
            candidateId: candidate.id,
            fileName: att.filename,
            mimeType: parsed.mimeType,
            rawText: parsed.text,
            source: "email",
          });

          // AI 评分
          console.log(`  ⏳ AI 评分中...`);
          const score = await scoreResume(
            parsed.text,
            position.title,
            position.description ?? "",
            skillConfig,
          );

          await db.insert(scores).values({
            candidateId: candidate.id,
            positionId: position.id,
            ...score,
          });

          console.log(
            `  ✅ ${score.grade}级 (${score.totalScore}分) - ${score.explanation.slice(0, 80)}`,
          );
          console.log(
            `     匹配: [${score.matchedSkills.join(", ")}]`,
          );
          console.log(
            `     缺失: [${score.missingSkills.join(", ")}]`,
          );
          console.log("");
          processed++;
        } catch (err: any) {
          console.log(
            `  ❌ 处理失败: ${err.message?.slice(0, 100)}`,
          );
          failed++;
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`处理完成: ${processed} 成功, ${failed} 失败`);
  } finally {
    lock.release();
  }

  await client.logout();

  // 3. 输出数据库统计
  const allCandidates = await db.select().from(candidates);
  const allScores = await db.select().from(scores);
  console.log(`\n数据库统计:`);
  console.log(`  候选人: ${allCandidates.length}`);
  console.log(`  评分记录: ${allScores.length}`);

  const gradeCount: Record<string, number> = {};
  for (const s of allScores) {
    gradeCount[s.grade] = (gradeCount[s.grade] || 0) + 1;
  }
  console.log(`  评级分布: ${JSON.stringify(gradeCount)}`);

  process.exit(0);
}

interface AttInfo {
  part: string;
  filename: string;
}

function findAttachments(structure: any, prefix = ""): AttInfo[] {
  const results: AttInfo[] = [];
  if (structure.childNodes) {
    for (let i = 0; i < structure.childNodes.length; i++) {
      const part = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      results.push(...findAttachments(structure.childNodes[i], part));
    }
  } else {
    const filename =
      structure.dispositionParameters?.filename ??
      structure.parameters?.name ??
      "";
    if (filename) {
      results.push({ part: prefix || "1", filename });
    }
  }
  return results;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
