/**
 * @file 数据库表结构定义（Schema）
 * @description 使用 Drizzle ORM 定义 PostgreSQL 数据库中的所有表结构。
 *              包含六张表：
 *              - university_tiers（院校层级表）：存储国内外院校信息及统一层级分类
 *              - positions（职位表）：存储招聘岗位信息及 AI 评分所需的技能配置
 *              - candidates（候选人表）：存储应聘者基本信息及筛选状态
 *              - resumes（简历表）：存储简历文件元数据及解析后的文本内容
 *              - scores（评分表）：存储 AI 对候选人简历的评分结果
 *              - email_process_logs（邮件处理日志表）：用 Message-ID 做幂等去重，
 *                记录邮件分类结果和处理状态流转 (skipped→fetched→parsed→scored/error)
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  boolean,
  index,
} from "drizzle-orm/pg-core";

// ─── 院校层级表（UniversityTiers） ──────────────────────────────

/**
 * 院校层级表：存储国内外院校信息及其统一层级分类
 * 国内外院校映射到统一 S/A/B/C/D 五档体系
 */
export const universityTiers = pgTable(
  "university_tiers",
  {
    /** 主键，自动生成的 UUID */
    id: uuid().primaryKey().defaultRandom(),
    /** 院校名称（中文或英文） */
    name: text().notNull(),
    /** 院校别名/英文名（用于模糊匹配） */
    aliases: text().array().default([]),
    /** 国家/地区代码（CN=中国, JP=日本, US=美国, UK=英国 等） */
    country: text().notNull(),
    /** 国内标签：985, 211, 双一流, 省重点一本, 普通一本, 普通本科 */
    domesticTag: text(),
    /** QS 世界排名（国际院校） */
    qsRank: integer(),
    /** 统一层级档位：S/A/B/C/D */
    tier: text({ enum: ["S", "A", "B", "C", "D"] }).notNull(),
    /** 数据年份，用于追踪数据时效性 */
    updatedYear: integer().notNull().default(2025),
    /** 创建时间 */
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("university_tiers_name_idx").on(t.name)],
);

// ─── 职位表（Positions） ────────────────────────────────────────

/**
 * 职位表：存储招聘岗位的详细信息
 * 每个职位包含标题、部门、描述、技能配置和状态等字段
 */
export const positions = pgTable("positions", {
  /** 主键，自动生成的 UUID */
  id: uuid().primaryKey().defaultRandom(),
  /** 职位标题，如"前端开发工程师" */
  title: text().notNull(),
  /** 所属部门，如"研发部" */
  department: text(),
  /** 职位描述，包含岗位职责和要求等详细信息 */
  description: text(),
  /**
   * AI 评分所用的技能配置（JSONB 格式）
   * - must: 必须具备的技能列表
   * - nice: 加分项技能列表
   * - reject: 扣分项（不希望候选人具备的特征）
   */
  skillConfig: jsonb()
    .$type<{
      must: string[];
      nice: string[];
      reject: string[];
    }>()
    .notNull()
    .default({ must: [], nice: [], reject: [] }),
  /**
   * AI 评分权重配置（JSONB 格式），各项系数之和建议为 1.0
   * totalScore = mustScore×must + niceScore×nice + educationScore×education - rejectPenalty×reject
   * 默认值与旧版保持一致：must=0.5, nice=0.2, education=0.2, reject=0.1
   */
  scoringWeights: jsonb()
    .$type<{
      must: number;
      nice: number;
      education: number;
      reject: number;
    }>()
    .notNull()
    .default({ must: 0.5, nice: 0.2, education: 0.2, reject: 0.1 }),
  /** 职位状态：open（开放招聘）、closed（已关闭）、draft（草稿） */
  status: text({ enum: ["open", "closed", "draft"] })
    .notNull()
    .default("open"),
  /** AI 评分输出语言：zh（中文，默认）、ja（日语） */
  locale: text({ enum: ["zh", "ja"] })
    .notNull()
    .default("zh"),
  /** 创建时间 */
  createdAt: timestamp().notNull().defaultNow(),
  /** 最后更新时间 */
  updatedAt: timestamp().notNull().defaultNow(),
});

// ─── 候选人表（Candidates） ──────────────────────────────────────

/**
 * 候选人表：存储应聘者的基本信息和筛选状态
 * 通过 positionId 外键关联到对应的职位
 */
export const candidates = pgTable(
  "candidates",
  {
    /** 主键，自动生成的 UUID */
    id: uuid().primaryKey().defaultRandom(),
    /** 关联的职位 ID（外键），指向 positions 表 */
    positionId: uuid()
      .references(() => positions.id)
      .notNull(),
    /** 候选人姓名 */
    name: text().notNull(),
    /** 候选人邮箱地址 */
    email: text(),
    /** 候选人电话号码 */
    phone: text(),
    /** 学历信息 */
    education: text(),
    /** 毕业院校名称（从简历中提取或手动填写） */
    university: text(),
    /** 院校统一层级档位：S/A/B/C/D */
    universityTier: text({ enum: ["S", "A", "B", "C", "D"] }),
    /** 日语能力等级（JLPT）：N1/N2/N3/N4/N5，从简历中提取 */
    jlptLevel: text({ enum: ["N1", "N2", "N3", "N4", "N5"] }),
    /** 年龄（LLM 提取） */
    age: integer(),
    /** 性别（LLM 提取）：男/女/其他 */
    gender: text(),
    /** 最高学历（LLM 提取）：博士/硕士/本科/专科/高中/其他 */
    educationLevel: text(),
    /** 专业（LLM 提取） */
    major: text(),
    /** 工作年限（LLM 提取，应届=0） */
    workYears: integer(),
    /** 赴日/外地意向（LLM 提取）：true=愿意 / false=不愿意 / null=未提及 */
    relocationWilling: boolean(),
    /** 技能标签数组 */
    skills: text().array(),
    /**
     * 候选人筛选状态流转：
     * new（新建） -> screening（筛选中） -> shortlisted（入围）
     * -> interviewed（已面试） -> hired（已录用） / rejected（已淘汰）
     */
    status: text({
      enum: ["new", "screening", "shortlisted", "interviewed", "rejected", "hired"],
    })
      .notNull()
      .default("new"),
    /** HR 备注信息 */
    notes: text(),
    /** 创建时间 */
    createdAt: timestamp().notNull().defaultNow(),
    /** 最后更新时间 */
    updatedAt: timestamp().notNull().defaultNow(),
  },
  // 为 positionId 创建索引，加速按职位查询候选人的性能
  (t) => [index("candidates_position_idx").on(t.positionId)],
);

// ─── 简历表（Resumes） ─────────────────────────────────────────

/**
 * 简历表：存储简历文件的元信息以及解析后的纯文本内容
 * 通过 candidateId 外键关联到对应的候选人
 */
export const resumes = pgTable("resumes", {
  /** 主键，自动生成的 UUID */
  id: uuid().primaryKey().defaultRandom(),
  /** 关联的候选人 ID（外键），指向 candidates 表 */
  candidateId: uuid()
    .references(() => candidates.id)
    .notNull(),
  /** 简历文件名，如"张三_前端工程师.pdf" */
  fileName: text().notNull(),
  /** 文件 MIME 类型，如"application/pdf" */
  mimeType: text(),
  /** 从简历文件中提取的纯文本内容，用于 AI 评分 */
  rawText: text(),
  /** 原始文件在存储层的相对路径（如 "resumes/{candidateId}.pdf"），nullable 向后兼容 */
  filePath: text(),
  /** 简历来源：upload（手动上传）或 email（邮件自动抓取） */
  source: text({ enum: ["upload", "email"] })
    .notNull()
    .default("upload"),
  /** 创建时间 */
  createdAt: timestamp().notNull().defaultNow(),
});

// ─── 评分表（Scores） ──────────────────────────────────────────

/**
 * AI 评分结果表：存储 AI 模型对候选人简历的评分详情
 * 同时关联候选人和职位，支持同一候选人针对不同职位的多次评分
 */
export const scores = pgTable(
  "scores",
  {
    /** 主键，自动生成的 UUID */
    id: uuid().primaryKey().defaultRandom(),
    /** 关联的候选人 ID（外键） */
    candidateId: uuid()
      .references(() => candidates.id)
      .notNull(),
    /** 关联的职位 ID（外键） */
    positionId: uuid()
      .references(() => positions.id)
      .notNull(),
    /** 综合总分（0.00-100.00，保留两位小数），由各分项加权计算得出 */
    totalScore: real().notNull(),
    /** "必须具备"技能的匹配得分（0.00-100.00，保留两位小数） */
    mustScore: real().notNull().default(0),
    /** "加分项"技能的匹配得分（0.00-100.00，保留两位小数） */
    niceScore: real().notNull().default(0),
    /** "扣分项"的惩罚分数（0.00-100.00，保留两位小数，越高表示匹配到越多不良特征） */
    rejectPenalty: real().notNull().default(0),
    /** 学历/院校评分（0.00-100.00，保留两位小数），基于院校层级 S/A/B/C/D 映射 */
    educationScore: real().notNull().default(0),
    /** 综合评级：A(>=80.00)、B(>=65.00)、C(>=50.00)、D(>=35.00)、F(<35.00) */
    grade: text({ enum: ["A", "B", "C", "D", "F"] }).notNull(),
    /** 候选人匹配到的技能列表 */
    matchedSkills: text().array().notNull().default([]),
    /** 候选人缺少的技能列表 */
    missingSkills: text().array().notNull().default([]),
    /** AI 给出的中文评价说明 */
    explanation: text(),
    /** 评分时间 */
    createdAt: timestamp().notNull().defaultNow(),
  },
  // 为 candidateId 和 positionId 分别创建索引，加速关联查询
  (t) => [
    index("scores_candidate_idx").on(t.candidateId),
    index("scores_position_idx").on(t.positionId),
  ],
);

// ─── 邮件处理日志表（EmailProcessLogs） ─────────────────────────

/**
 * 邮件处理日志表：用 RFC 2822 Message-ID 做幂等去重，记录邮件分类和处理状态
 */
export const emailProcessLogs = pgTable(
  "email_process_logs",
  {
    /** 主键，自动生成的 UUID */
    id: uuid().primaryKey().defaultRandom(),
    /** RFC 2822 Message-ID，用于幂等去重 */
    messageId: text().notNull().unique(),
    /** IMAP UID (当次连接内有效) */
    imapUid: integer(),
    /** 发件人邮箱 */
    senderEmail: text(),
    /** 邮件主题 */
    subject: text(),
    /** 分类结果 */
    classification: text({ enum: ["resume", "not_resume", "uncertain"] }).notNull(),
    /** 分类原因 */
    classificationReason: text(),
    /** 处理状态 */
    status: text({ enum: ["skipped", "fetched", "parsed", "scored", "error"] }).notNull(),
    /** 是否有简历附件 */
    hasResumeAttachment: boolean().notNull().default(false),
    /** 关联的候选人 ID (处理成功后填入) */
    candidateId: uuid().references(() => candidates.id),
    /** 错误信息 */
    error: text(),
    /** 处理完成时间 */
    processedAt: timestamp(),
    /** 创建时间 */
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("email_process_logs_message_id_idx").on(t.messageId),
    index("email_process_logs_status_idx").on(t.status),
  ],
);
