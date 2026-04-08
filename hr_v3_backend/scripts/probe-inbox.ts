/**
 * 探测收件箱：列出最近 20 封邮件的基本信息
 * 用途：了解邮箱中邮件的实际内容，判断哪些是简历投递
 * 运行：bun scripts/probe-inbox.ts
 */

import { ImapFlow } from "imapflow";

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
  await client.connect();
  console.log("Connected to IMAP server\n");

  const lock = await client.getMailboxLock("INBOX");
  try {
    // 获取邮箱状态
    const status = await client.status("INBOX", {
      messages: true,
      unseen: true,
    });
    console.log(
      `邮箱总邮件: ${status.messages}, 未读: ${status.unseen}\n`,
    );

    // 搜索所有邮件，取最新 20 封
    const allUids = await client.search({ all: true });
    const latest20 = allUids.slice(-20);

    console.log(`扫描最新 ${latest20.length} 封邮件:\n`);
    console.log("=".repeat(100));

    for (const uid of latest20) {
      const msg = await client.fetchOne(String(uid), {
        envelope: true,
        bodyStructure: true,
      });

      if (!msg?.envelope) continue;

      const from = msg.envelope.from?.[0];
      const senderName = from?.name ?? "N/A";
      const senderEmail = from?.address ?? "N/A";
      const subject = msg.envelope.subject ?? "(无主题)";
      const date = msg.envelope.date
        ? new Date(msg.envelope.date).toLocaleString("zh-CN")
        : "N/A";

      // 查找附件
      const attachments = findAttachments(msg.bodyStructure);
      const resumeAttachments = attachments.filter((a) =>
        /\.(pdf|docx?)$/i.test(a.filename),
      );
      const otherAttachments = attachments.filter(
        (a) => !/\.(pdf|docx?)$/i.test(a.filename),
      );

      // 判断是否可能是简历投递
      const isResume = resumeAttachments.length > 0;

      console.log(`UID: ${uid} | ${date}`);
      console.log(`  发件人: ${senderName} <${senderEmail}>`);
      console.log(`  主题: ${subject}`);
      console.log(
        `  简历附件: ${resumeAttachments.length > 0 ? resumeAttachments.map((a) => a.filename).join(", ") : "无"}`,
      );
      if (otherAttachments.length > 0) {
        console.log(
          `  其他附件: ${otherAttachments.map((a) => a.filename).join(", ")}`,
        );
      }
      console.log(`  判断: ${isResume ? "📄 简历投递" : "📧 非简历邮件"}`);
      console.log("-".repeat(100));
    }
  } finally {
    lock.release();
  }

  await client.logout();
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
      const part = prefix || "1";
      results.push({ part, filename });
    }
  }
  return results;
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
