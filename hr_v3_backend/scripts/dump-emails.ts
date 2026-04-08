/**
 * 抓取最近 10 封简历邮件的结构化数据（不入库、不评分）
 * 用法: bun scripts/dump-emails.ts
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
    pass: process.env.IMAP_PASS!,
  },
  logger: false,
});

interface AttachmentInfo {
  part: string;
  filename: string;
}

function findAttachments(structure: any, prefix = ""): AttachmentInfo[] {
  const results: AttachmentInfo[] = [];
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
    if (/\.(pdf|docx?)$/i.test(filename)) {
      results.push({ part: prefix || "1", filename });
    }
  }
  return results;
}

await client.connect();
console.log("IMAP connected");

const lock = await client.getMailboxLock("INBOX");
const results: any[] = [];

try {
  // 搜索所有未读邮件，取最后 10 封
  const allUids = await client.search({ seen: false });
  if (!allUids?.length) {
    console.log("No unseen emails found");
    process.exit(0);
  }

  console.log(`Found ${allUids.length} unseen emails, taking last 10...`);
  const uids = allUids.slice(-10);

  for (const uid of uids) {
    const msg = await client.fetchOne(String(uid), {
      envelope: true,
      bodyStructure: true,
    });

    if (!msg?.envelope || !msg?.bodyStructure) continue;

    const envelope = msg.envelope;
    const senderName = envelope.from?.[0]?.name ?? "Unknown";
    const senderEmail = envelope.from?.[0]?.address ?? "Unknown";
    const subject = envelope.subject ?? "(no subject)";
    const date = envelope.date?.toISOString() ?? "Unknown";

    const attachments = findAttachments(msg.bodyStructure);

    const emailData: any = {
      uid,
      date,
      subject,
      senderName,
      senderEmail,
      attachmentCount: attachments.length,
      attachments: [],
    };

    for (const att of attachments) {
      console.log(`  Downloading: ${att.filename} (uid=${uid})`);

      try {
        const { content } = await client.download(String(uid), att.part);
        const chunks: Buffer[] = [];
        for await (const chunk of content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const parsed = await parseResume(buffer, att.filename);

        emailData.attachments.push({
          filename: att.filename,
          mimeType: parsed.mimeType,
          sizeBytes: buffer.length,
          textLength: parsed.text.length,
          textPreview: parsed.text.slice(0, 500),
          fullText: parsed.text,
        });
      } catch (err: any) {
        emailData.attachments.push({
          filename: att.filename,
          error: err.message,
        });
      }
    }

    results.push(emailData);
    console.log(
      `[${results.length}/10] uid=${uid} | ${senderName} | ${subject.slice(0, 40)} | ${attachments.length} attachments`,
    );
  }
} finally {
  lock.release();
  await client.logout();
}

const outPath = "scripts/email-dump.json";
await Bun.write(outPath, JSON.stringify(results, null, 2));
console.log(`\nDone! ${results.length} emails saved to ${outPath}`);
