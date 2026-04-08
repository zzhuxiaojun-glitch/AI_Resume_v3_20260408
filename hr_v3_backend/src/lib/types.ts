/**
 * @file 公共类型定义
 * @description 定义整个应用中共享的 TypeScript 接口（Interface）类型。
 *              包含技能配置、AI 评分结果、简历解析结果等核心数据结构。
 */

/**
 * 技能配置接口
 * @description 定义职位的 AI 评分技能规则，用于指导 AI 模型如何评估候选人
 */
export interface SkillConfig {
  /** 必须具备的技能列表，缺失会严重影响评分 */
  must: string[];
  /** 加分项技能列表，具备可以提高评分 */
  nice: string[];
  /** 扣分项列表，匹配到这些特征会降低评分 */
  reject: string[];
}

/**
 * AI 评分结果接口
 * @description AI 模型对候选人简历评分后返回的完整结果结构
 */
export interface ScoreResult {
  /** 综合总分（0.00-100.00，保留两位小数），由 mustScore、niceScore、educationScore、rejectPenalty 加权计算 */
  totalScore: number;
  /** "必须具备"技能的匹配得分（0.00-100.00，保留两位小数） */
  mustScore: number;
  /** "加分项"技能的匹配得分（0.00-100.00，保留两位小数） */
  niceScore: number;
  /** 学历/院校评分（0.00-100.00，保留两位小数），基于院校层级 S/A/B/C/D 映射 */
  educationScore: number;
  /** "扣分项"的惩罚分值（0.00-100.00，保留两位小数，越高表示命中越多不良特征） */
  rejectPenalty: number;
  /** 综合评级，根据 totalScore 映射：A(>=80.00)、B(>=65.00)、C(>=50.00)、D(>=35.00)、F(<35.00) */
  grade: "A" | "B" | "C" | "D" | "F";
  /** 候选人匹配到的技能列表 */
  matchedSkills: string[];
  /** 候选人缺少的技能列表 */
  missingSkills: string[];
  /** AI 生成的评价说明（根据职位 locale 输出中文或日语），简要描述候选人的优劣势 */
  explanation: string;
}

/** 院校统一层级档位 */
export type UniversityTier = "S" | "A" | "B" | "C" | "D";

/**
 * 简历解析结果接口
 * @description 简历文件经过解析器处理后返回的结构化数据
 */
export interface ParsedResume {
  /** 从简历文件中提取的纯文本内容 */
  text: string;
  /** 原始文件名 */
  fileName: string;
  /** 文件的 MIME 类型，如 "application/pdf" */
  mimeType: string;
}
