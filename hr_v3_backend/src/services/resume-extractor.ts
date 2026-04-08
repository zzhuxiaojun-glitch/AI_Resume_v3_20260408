/**
 * @file LLM 结构化简历信息提取服务
 * @description 在 parseResume()（文本提取）之后，调用 DeepSeek 对简历纯文本做结构化解析，
 *              提取候选人基本信息字段。与 ai-scorer.ts 并行执行，不影响评分流程。
 *
 *              提取字段：
 *              - name        姓名
 *              - phone       手机号
 *              - age         年龄（整数）
 *              - gender      性别（男/女/其他）
 *              - education   最高学历（本科/硕士/博士/专科/高中/其他）
 *              - major       专业
 *              - university  毕业院校（作为正则提取的兜底备用）
 *              - jlptLevel   日语能力等级（N1~N5，作为正则提取的兜底备用）
 *              - workYears   工作年限（整数，应届=0）
 *              - relocationWilling  赴日/外地意向（true/false/null=未提及）
 */

import { generateText } from "ai";
import { z } from "zod/v4";
import { model } from "../lib/ai";

// ── 返回类型 ────────────────────────────────────────────────────

export interface StructuredResumeInfo {
  /** 姓名，无法提取时为 null */
  name: string | null;
  /** 手机号（保留原始格式） */
  phone: string | null;
  /** 年龄（整数），无法提取时为 null */
  age: number | null;
  /** 性别：男 / 女 / 其他 / null */
  gender: string | null;
  /** 最高学历：本科 / 硕士 / 博士 / 专科 / 高中 / 其他 / null */
  education: string | null;
  /** 专业名称 */
  major: string | null;
  /** 毕业院校名（从文本中提取，用于补充正则未匹配的情况） */
  university: string | null;
  /** JLPT 等级：N1~N5，补充正则兜底 */
  jlptLevel: "N1" | "N2" | "N3" | "N4" | "N5" | null;
  /** 工作年限（整数，应届=0） */
  workYears: number | null;
  /** 赴日 / 外地意向：true=愿意 / false=不愿意 / null=未提及 */
  relocationWilling: boolean | null;
}

// ── Zod 校验 ────────────────────────────────────────────────────

const extractionSchema = z.object({
  name: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  age: z.number().int().min(16).max(80).nullable().default(null),
  gender: z.enum(["男", "女", "其他"]).nullable().default(null),
  education: z.enum(["博士", "硕士", "本科", "专科", "高中", "其他"]).nullable().default(null),
  major: z.string().nullable().default(null),
  university: z.string().nullable().default(null),
  jlptLevel: z.enum(["N1", "N2", "N3", "N4", "N5"]).nullable().default(null),
  workYears: z.number().int().min(0).nullable().default(null),
  relocationWilling: z.boolean().nullable().default(null),
});

// ── 提取函数 ────────────────────────────────────────────────────

/**
 * 调用 LLM 从简历纯文本中提取结构化候选人信息
 * @param resumeText - 经 parseResume() 提取的简历纯文本
 * @returns 结构化信息对象，所有字段均可为 null（无法提取时）
 */
export async function extractStructuredResume(resumeText: string): Promise<StructuredResumeInfo> {
  // 仅取前 3000 字符以节省 token，简历关键信息通常在开头
  const text = resumeText.slice(0, 3000);

  const { text: raw } = await generateText({
    model,
    prompt: `从以下简历文本中提取候选人信息，以 JSON 格式返回，字段无法确定时用 null。

简历文本：
${text}

请提取以下字段，只返回 JSON，不要任何说明：
{
  "name": "姓名（字符串）",
  "phone": "手机号（字符串，保留原格式）",
  "age": 年龄整数 或 null,
  "gender": "男" 或 "女" 或 "其他" 或 null,
  "education": "最高学历（博士/硕士/本科/专科/高中/其他）或 null",
  "major": "专业名称 或 null",
  "university": "最终毕业院校全称 或 null",
  "jlptLevel": "JLPT等级（N1/N2/N3/N4/N5）或 null",
  "workYears": 工作年限整数（应届=0）或 null,
  "relocationWilling": true（明确表示愿意赴日/外地）或 false（明确不愿意）或 null（未提及）
}`,
  });

  try {
    // 去除 <think> 标签和 markdown 代码块
    let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) cleaned = fence[1].trim();

    const parsed = JSON.parse(cleaned);
    return extractionSchema.parse(parsed) as StructuredResumeInfo;
  } catch {
    // LLM 返回格式异常时，返回全 null 对象，不影响主流程
    return {
      name: null, phone: null, age: null, gender: null,
      education: null, major: null, university: null,
      jlptLevel: null, workYears: null, relocationWilling: null,
    };
  }
}
