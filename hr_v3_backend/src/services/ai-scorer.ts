/**
 * @file AI 简历评分服务
 * @description 调用 MiniMax AI 大语言模型，根据职位要求对候选人简历进行智能评分。
 *              核心流程：构造提示词（Prompt） -> 调用 AI 生成评分 -> 解析并校验返回结果。
 *              评分维度包括必备技能匹配度、加分项匹配度、扣分项惩罚，最终输出综合评级。
 */

import { generateText } from "ai";
import { z } from "zod/v4";
import { model } from "../lib/ai";
import type { SkillConfig, ScoreResult } from "../lib/types";

/**
 * 将数值四舍五入到两位小数
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * AI 评分结果的 Zod 校验模式
 * 确保 AI 返回的 JSON 数据格式正确、数值在合理范围内
 * 所有分数通过 transform 强制保留两位小数
 */
const scoreSchema = z.object({
  totalScore: z.number().min(0).max(100).transform(round2),
  mustScore: z.number().min(0).max(100).transform(round2),
  niceScore: z.number().min(0).max(100).transform(round2),
  rejectPenalty: z.number().min(0).max(100).transform(round2),
  educationScore: z.number().min(0).max(100).transform(round2).default(0),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  explanation: z.string(),
});

/**
 * 从 AI 模型的原始回复中提取纯 JSON 字符串
 * @description 部分模型会在回复中包含 <think> 思考标签或 Markdown 代码块包裹，
 *              此函数负责清除这些多余内容，只保留有效的 JSON 字符串。
 * @param text - AI 模型的原始回复文本
 * @returns 清理后的纯 JSON 字符串
 */
function extractJson(text: string): string {
  // 移除 <think>...</think> 思考过程标签（某些模型会输出推理过程）
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  // 移除 Markdown 代码块包裹（如 ```json ... ```）
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return cleaned;
}

/**
 * 根据 locale 获取 AI 评分输出语言指令
 * @param locale - 语言代码（"zh" | "ja"），默认 "zh"
 * @returns 对应语言的 AI 输出指令字符串
 */
function getLocaleInstruction(locale: string): string {
  switch (locale) {
    case "ja":
      return "日本語で評価を出力してください。";
    default:
      return "请用中文输出评价。";
  }
}

/**
 * 根据 locale 获取 explanation 字段的标签说明
 * @param locale - 语言代码（"zh" | "ja"），默认 "zh"
 * @returns 对应语言的 explanation 标签
 */
function getExplanationLabel(locale: string): string {
  switch (locale) {
    case "ja":
      return "評価（日本語、100文字以内）";
    default:
      return "中文评价，100字以内";
  }
}

/**
 * 根据 locale 获取提示词的系统角色描述
 * @param locale - 语言代码（"zh" | "ja"），默认 "zh"
 * @returns 对应语言的角色描述
 */
function getRoleDescription(locale: string): string {
  switch (locale) {
    case "ja":
      return "あなたはベテランの人事採用の専門家です。以下の求人条件と履歴書に基づき、候補者を評価してください。";
    default:
      return "你是一位资深HR招聘专家。请根据以下职位要求和简历内容，对候选人进行评分。";
  }
}

/**
 * 使用 AI 模型对候选人简历进行评分
 * @description 将职位信息和简历内容组合成结构化提示词，发送给 AI 模型进行分析评估，
 *              然后解析 AI 返回的 JSON 结果并通过 Zod 模式进行类型校验。
 *              根据 locale 参数切换提示词语言（zh=中文, ja=日语）。
 * @param resumeText - 简历的纯文本内容
 * @param jobTitle - 目标职位标题
 * @param jobDescription - 目标职位的详细描述
 * @param skillConfig - 职位的技能配置（必备技能、加分项、扣分项）
 * @param locale - AI 输出语言代码（"zh" 或 "ja"），默认 "zh"
 * @returns {Promise<ScoreResult>} 经过校验的评分结果对象
 */
/** 评分权重配置，各项系数之和建议为 1.0 */
export interface ScoringWeights {
  must: number;
  nice: number;
  education: number;
  reject: number;
}

/** 默认权重（向后兼容） */
const DEFAULT_WEIGHTS: ScoringWeights = { must: 0.5, nice: 0.2, education: 0.2, reject: 0.1 };

export async function scoreResume(
  resumeText: string,
  jobTitle: string,
  jobDescription: string,
  skillConfig: SkillConfig,
  locale: string = "zh",
  universityTier: string = "D",
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): Promise<ScoreResult> {
  const roleDesc = getRoleDescription(locale);
  const localeInst = getLocaleInstruction(locale);
  const explanationLabel = getExplanationLabel(locale);
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  // 调用 AI 模型生成评分，根据 locale 切换提示词语言
  const { text } = await generateText({
    model,
    prompt: `${roleDesc}

${localeInst}

## 職位 / 职位: ${jobTitle}

## 職位説明 / 职位描述:
${jobDescription || "無 / 无"}

## スキル要件 / 技能要求:
- 必須 (must): ${skillConfig.must.join(", ") || "無 / 无"}
- 優遇 (nice): ${skillConfig.nice.join(", ") || "無 / 无"}
- 減点 (reject): ${skillConfig.reject.join(", ") || "無 / 无"}

## 履歴書 / 简历内容:
${resumeText}

## 採点ルール / 评分规则:
1. mustScore: (0.00-100.00)
2. niceScore: (0.00-100.00)
3. rejectPenalty: (0.00-100.00)
4. educationScore: pre-calculated = ${
      { S: 95, A: 85, B: 70, C: 55, D: 30 }[universityTier as "S" | "A" | "B" | "C" | "D"] ?? 30
    } (university tier: ${universityTier})
5. totalScore: = mustScore * ${w.must} + niceScore * ${w.nice} + educationScore * ${w.education} - rejectPenalty * ${w.reject}
6. grade: A(>=80.00), B(>=65.00), C(>=50.00), D(>=35.00), F(<35.00)
7. matchedSkills: []
8. missingSkills: []
9. explanation: ${explanationLabel}

JSON only.`,
  });

  // 从 AI 回复中提取纯 JSON，移除可能存在的思考标签和代码块
  const json = extractJson(text);
  // 解析 JSON 字符串为对象
  const parsed = JSON.parse(json);
  // 使用 Zod 校验数据格式和数值范围，确保结果符合预期结构
  return scoreSchema.parse(parsed);
}
