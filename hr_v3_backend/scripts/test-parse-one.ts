/**
 * 测试：下载一封简历PDF并解析内容
 * 运行：bun scripts/test-parse-one.ts
 */

import { ImapFlow } from "imapflow";
import { parseResume } from "../src/services/resume-parser";

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
  const lock = await client.getMailboxLock("INBOX");

  try {
    // 取 UID 4333（石江的简历）作为测试
    const uid = "4333";
    const msg = await client.fetchOne(uid, {
      envelope: true,
      bodyStructure: true,
    });

    console.log(`主题: ${msg.envelope?.subject}`);
    console.log(`Body Structure:`, JSON.stringify(msg.bodyStructure, null, 2).slice(0, 500));

    // 找附件
    const attachments = findAttachments(msg.bodyStructure);
    console.log(`\n找到附件: ${attachments.length}`);

    for (const att of attachments) {
      console.log(`\n下载: ${att.filename} (part: ${att.part})`);
      const { content } = await client.download(uid, att.part);
      const chunks: Buffer[] = [];
      for await (const chunk of content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      console.log(`文件大小: ${buffer.length} bytes`);

      if (/\.(pdf|docx?)$/i.test(att.filename)) {
        const parsed = await parseResume(buffer, att.filename);
        console.log(`\nMIME: ${parsed.mimeType}`);
        console.log(`解析文本长度: ${parsed.text.length} 字符`);
        console.log(`\n=== 简历内容（前2000字符）===\n`);
        console.log(parsed.text.slice(0, 2000));
        console.log(`\n=== END ===`);
      }
    }
  } finally {
    lock.release();
  }

  await client.logout();
}

interface AttInfo { part: string; filename: string; }

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
      structure.parameters?.name ?? "";
    if (filename) {
      results.push({ part: prefix || "1", filename });
    }
  }
  return results;
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
