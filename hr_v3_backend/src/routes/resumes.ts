/**
 * @file 简历上传与处理路由
 * @description 提供简历文件上传 API，实现从文件上传到 AI 自动评分的完整流程。
 *              基础路径：/api/resumes
 *
 *              处理流程：
 *              1. parseResume()         — 本地解析 PDF/DOCX → 纯文本（无 API 调用）
 *              2. extractUniversityName + lookupUniversity — 正则提取院校，DB 查层级
 *              3. extractJlptLevel      — 正则提取 JLPT
 *              4. extractStructuredResume() + scoreResume()  — 并发调用 LLM（2 个请求）
 *              5. DB 事务写入           — 候选人 + 简历 + 评分
 *              6. 用 LLM 结构化信息回填候选人字段
 */

import Elysia from "elysia";
import { db } from "../db/index";
import { candidates, resumes, scores, positions } from "../db/schema";
import { eq } from "drizzle-orm";
import { parseResume } from "../services/resume-parser";
import { scoreResume } from "../services/ai-scorer";
import type { ScoringWeights } from "../services/ai-scorer";
import { extractUniversityName, lookupUniversity, tierToScore, extractJlptLevel } from "../services/university-lookup";
import { extractStructuredResume } from "../services/resume-extractor";
import type { SkillConfig } from "../lib/types";
import type { UniversityTier } from "../lib/types";
import { fileStorage } from "../lib/storage";
import { randomUUID } from "node:crypto";

export const resumesRoute = new Elysia({ prefix: "/api/resumes" })

  /**
   * POST /api/resumes/upload
   * 上传简历文件并执行自动评分（multipart/form-data）
   * 字段：file（文件）、positionId（目标职位）、name（候选人姓名，可选，LLM 会尝试从简历提取）
   */
  .post("/upload", async ({ body, set }) => {
    const b = body as any;
    const file: File | null = b.file ?? null;
    const positionId: string | null = b.positionId ?? null;
    const candidateName: string = b.name || "Unknown";

    // 参数校验
    if (!file) {
      set.status = 400;
      return { error: "No file uploaded" };
    }
    if (!positionId) {
      set.status = 400;
      return { error: "positionId is required" };
    }

    // 验证目标职位是否存在
    const [position] = await db
      .select()
      .from(positions)
      .where(eq(positions.id, positionId))
      .limit(1);
    if (!position) {
      set.status = 404;
      return { error: "Position not found" };
    }

    // ── Step 1: 本地解析简历（无 API 调用，免费）──────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseResume(buffer, file.name);

    // ── Step 2: 正则提取院校 + JLPT（免费）────────────────────────
    let university: string | null = null;
    let universityTier: UniversityTier | null = null;
    const extractedName = extractUniversityName(parsed.text);
    if (extractedName) {
      const uniResult = await lookupUniversity(db, extractedName);
      if (uniResult) {
        university = uniResult.name;
        universityTier = uniResult.tier as UniversityTier;
      }
    }
    const jlptLevelByRegex = extractJlptLevel(parsed.text);

    // ── Step 3: 并发调用 LLM（2 个请求：结构化提取 + AI 评分）─────
    const scoringWeights = (position.scoringWeights as ScoringWeights | null) ?? undefined;
    const [structuredInfo, score] = await Promise.all([
      extractStructuredResume(parsed.text),
      scoreResume(
        parsed.text,
        position.title,
        position.description ?? "",
        position.skillConfig as SkillConfig,
        position.locale ?? "zh",
        universityTier ?? "D",
        scoringWeights,
      ),
    ]);

    // LLM 提取的院校作为正则的兜底（正则优先）
    const finalUniversity = university ?? structuredInfo.university ?? null;
    // LLM 提取的 JLPT 作为正则的兜底（正则优先）
    const finalJlpt = jlptLevelByRegex ?? structuredInfo.jlptLevel ?? null;
    // 姓名：用户填写 > LLM 提取（仅当用户未填或填了 "Unknown" 时使用）
    const finalName = (candidateName && candidateName !== "Unknown")
      ? candidateName
      : (structuredInfo.name ?? candidateName);

    // ── Step 4: 预生成 candidateId，文件 I/O 不参与 DB 事务 ────────
    const candidateId = randomUUID();
    const filePath = await fileStorage.save(candidateId, buffer, parsed.mimeType);

    // ── Step 5: 事务写入候选人 + 简历 + 评分 ──────────────────────
    const { candidate, scoreRow } = await db.transaction(async (tx) => {
      const [candidate] = await tx
        .insert(candidates)
        .values({
          id: candidateId,
          positionId,
          name: finalName,
          status: "screening",
          // 联系方式（优先 LLM 提取）
          ...(structuredInfo.phone && { phone: structuredInfo.phone }),
          // 院校信息
          ...(finalUniversity && { university: finalUniversity }),
          ...(universityTier && { universityTier }),
          // JLPT
          ...(finalJlpt && { jlptLevel: finalJlpt }),
          // LLM 结构化字段
          ...(structuredInfo.age != null && { age: structuredInfo.age }),
          ...(structuredInfo.gender && { gender: structuredInfo.gender }),
          ...(structuredInfo.education && { educationLevel: structuredInfo.education }),
          ...(structuredInfo.major && { major: structuredInfo.major }),
          ...(structuredInfo.workYears != null && { workYears: structuredInfo.workYears }),
          ...(structuredInfo.relocationWilling != null && { relocationWilling: structuredInfo.relocationWilling }),
        })
        .returning();

      await tx.insert(resumes).values({
        candidateId: candidate.id,
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        rawText: parsed.text,
        source: "upload",
        filePath,
      });

      const [scoreRow] = await tx
        .insert(scores)
        .values({
          candidateId: candidate.id,
          positionId,
          ...score,
        })
        .returning();

      return { candidate, scoreRow };
    });

    set.status = 201;
    return {
      candidate,
      score: scoreRow,
      structuredInfo,
      resumeText: parsed.text.slice(0, 500) + "...",
    };
  });
