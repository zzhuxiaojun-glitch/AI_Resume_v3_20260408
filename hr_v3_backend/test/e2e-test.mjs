import { ImapFlow } from "imapflow";
import { PDFParse } from "pdf-parse";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod/v4";

// --- 1. Setup MiniMax ---
const minimax = createOpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: "https://api.minimaxi.com/v1",
  compatibility: "compatible",
});
const model = minimax.chat("MiniMax-M2.5");

// --- 2. Connect IMAP, download PDF ---
const client = new ImapFlow({
  host: process.env.IMAP_HOST,
  port: Number(process.env.IMAP_PORT),
  secure: false,
  tls: { rejectUnauthorized: false },
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
  logger: false,
});

await client.connect();
console.log("1/4 IMAP connected");

const lock = await client.getMailboxLock("INBOX");
let resumeText = "";
let fileName = "";

try {
  const uid = 4325; // 悠雨 | 6年 软件工程师
  const msg = await client.fetchOne(String(uid), { envelope: true, bodyStructure: true });
  console.log(`2/4 Email: ${msg.envelope.subject}\n`);

  // Find PDF part
  const pdfPart = findPdf(msg.bodyStructure, "");
  if (!pdfPart) throw new Error("No PDF found");

  fileName = pdfPart.filename;
  console.log(`    Downloading: ${fileName}`);
  const { content } = await client.download(String(uid), pdfPart.part);
  const chunks = [];
  for await (const chunk of content) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buf = Buffer.concat(chunks);
  console.log(`    PDF size: ${buf.length} bytes`);

  // Parse PDF
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  resumeText = result.text;
  await parser.destroy();
  console.log(`3/4 PDF parsed: ${resumeText.length} chars\n`);
  console.log("--- Resume Preview ---");
  console.log(resumeText.slice(0, 800));
  console.log("---\n");
} finally {
  lock.release();
  await client.logout();
}

// --- 3. AI Scoring ---
console.log("4/4 Calling MiniMax M2.5 for scoring...\n");

const scoreSchema = z.object({
  totalScore: z.number().min(0).max(100),
  mustScore: z.number().min(0).max(100),
  niceScore: z.number().min(0).max(100),
  rejectPenalty: z.number().min(0).max(100),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  explanation: z.string(),
});

function extractJson(text) {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return cleaned;
}

const { text } = await generateText({
  model,
  prompt: `你是一位资深HR招聘专家。请根据以下职位要求和简历内容，对候选人进行评分。

## 职位: 软件工程师

## 职位描述:
负责公司软件产品的开发和维护，参与需求分析、系统设计和编码实现。

## 技能要求:
- 必须具备 (must): TypeScript, React, Node.js, PostgreSQL
- 加分项 (nice): Docker, CI/CD, 微服务架构, Python
- 扣分项 (reject): 无相关开发经验, 频繁跳槽(2年内换3份以上工作)

## 简历内容:
${resumeText}

## 评分规则:
1. mustScore: 候选人匹配"必须具备"技能的程度 (0.00-100.00，保留两位小数)
2. niceScore: 候选人匹配"加分项"技能的程度 (0.00-100.00，保留两位小数)
3. rejectPenalty: 候选人命中"扣分项"的扣分 (0.00-100.00，保留两位小数，越高越差)
4. totalScore: 综合分数 = mustScore * 0.6 + niceScore * 0.3 - rejectPenalty * 0.1 (保留两位小数)
5. grade: A(>=80.00), B(>=65.00), C(>=50.00), D(>=35.00), F(<35.00)
6. matchedSkills: 候选人匹配到的技能列表
7. missingSkills: 候选人缺少的技能列表
8. explanation: 中文评价，100字以内

请只返回JSON，不要其他内容。`,
});

const score = JSON.parse(extractJson(text));

console.log("=== AI Scoring Result ===");
console.log(JSON.stringify(score, null, 2));
console.log("\nDone");

// --- helper ---
function findPdf(node, prefix) {
  if (node.childNodes) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const part = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      const found = findPdf(node.childNodes[i], part);
      if (found) return found;
    }
  } else {
    const filename = node.dispositionParameters?.filename || node.parameters?.name || "";
    if (/\.pdf$/i.test(filename)) {
      return { part: prefix || "1", filename };
    }
  }
  return null;
}
