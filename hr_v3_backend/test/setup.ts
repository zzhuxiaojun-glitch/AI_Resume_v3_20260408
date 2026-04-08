/**
 * @file 测试全局 mock 配置（通过 bunfig.toml preload 加载）
 * @description mock 掉 DB、AI 服务、简历解析器，让路由测试只关注 HTTP 层逻辑
 */

import { mock } from "bun:test";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");

/* ── 固定返回数据 ─────────────────────────────────────────── */

export const FAKE_POSITION = {
  id: "pos-1",
  title: "软件工程师",
  department: "研发部",
  description: "全栈开发",
  skillConfig: { must: ["TypeScript"], nice: ["Docker"], reject: [] },
  scoringWeights: { must: 0.5, nice: 0.2, education: 0.2, reject: 0.1 },
  status: "open",
  locale: "zh",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

export const FAKE_CANDIDATE = {
  id: "cand-1",
  positionId: "pos-1",
  name: "张三",
  email: "zhang@test.com",
  phone: null,
  education: null,
  university: null,
  universityTier: null,
  skills: null,
  status: "screening",
  notes: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

export const FAKE_SCORE = {
  id: "score-1",
  candidateId: "cand-1",
  positionId: "pos-1",
  totalScore: 75.50,
  mustScore: 80.25,
  niceScore: 60.00,
  rejectPenalty: 0.00,
  educationScore: 0.00,
  grade: "B" as const,
  matchedSkills: ["TypeScript"],
  missingSkills: ["Docker"],
  explanation: "匹配度较高",
  createdAt: new Date("2026-01-01"),
};

export const FAKE_UNIVERSITY = {
  id: "univ-1",
  name: "清华大学",
  aliases: ["Tsinghua University"],
  country: "CN",
  domesticTag: "985",
  qsRank: 20,
  tier: "S" as const,
  updatedYear: 2025,
  createdAt: new Date("2026-01-01"),
};

/* ── Mock DB (chainable Drizzle query builder) ────────────── */

/**
 * 创建可链式调用且可 await 的 Drizzle mock
 * - 任何方法调用（.from(), .where(), .returning() 等）返回新的 chainable
 * - await 时解析为 finalValue
 */
function chainable(finalValue: any): any {
  const proxy: any = new Proxy(() => {}, {
    get(_target, prop) {
      // 让 await 正常工作
      if (prop === "then") {
        return (onFulfilled: any, onRejected: any) =>
          Promise.resolve(finalValue).then(onFulfilled, onRejected);
      }
      if (prop === "catch") {
        return (onRejected: any) => Promise.resolve(finalValue).catch(onRejected);
      }
      // Symbol 属性
      if (typeof prop === "symbol") return undefined;
      // 任何其他属性调用返回新的 chainable
      return (..._args: any[]) => chainable(finalValue);
    },
    apply() {
      return chainable(finalValue);
    },
  });
  return proxy;
}

export const mockDb = {
  select: (..._args: any[]) => chainable([FAKE_POSITION]),
  insert: (..._args: any[]) => chainable([FAKE_CANDIDATE]),
  update: (..._args: any[]) => chainable([FAKE_CANDIDATE]),
  delete: (..._args: any[]) => chainable([FAKE_POSITION]),
  transaction: async (fn: (tx: any) => Promise<any>) => fn(mockDb),
};

/* ── Register mocks ───────────────────────────────────────── */

mock.module(resolve(ROOT, "src/env"), () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    MINIMAX_API_KEY: "test-key",
    IMAP_HOST: "localhost",
    IMAP_PORT: 993,
    IMAP_USER: "test@test.com",
    IMAP_PASS: "test",
    SMTP_HOST: "localhost",
    SMTP_PORT: 587,
    SMTP_USER: "test@test.com",
    SMTP_PASS: "test",
    STORAGE_DIR: "/tmp/test-storage",
  },
}));

mock.module(resolve(ROOT, "src/db/index"), () => ({
  db: mockDb,
}));

mock.module(resolve(ROOT, "src/lib/storage"), () => ({
  fileStorage: {
    save: async (candidateId: string, _buffer: Buffer, mimeType: string) => {
      const ext = mimeType === "application/pdf" ? "pdf" : "docx";
      return `resumes/${candidateId}.${ext}`;
    },
    exists: async () => false,
  },
}));

mock.module(resolve(ROOT, "src/services/ai-scorer"), () => ({
  scoreResume: async () => ({
    totalScore: 75.50,
    mustScore: 80.25,
    niceScore: 60.00,
    rejectPenalty: 0.00,
    educationScore: 0.00,
    grade: "B",
    matchedSkills: ["TypeScript"],
    missingSkills: ["Docker"],
    explanation: "匹配度较高",
  }),
}));

mock.module(resolve(ROOT, "src/services/resume-parser"), () => ({
  parseResume: async () => ({
    text: "张三的简历内容，TypeScript 经验丰富",
    fileName: "resume.pdf",
    mimeType: "application/pdf",
  }),
}));

mock.module(resolve(ROOT, "src/services/resume-extractor"), () => ({
  extractStructuredResume: async () => ({
    name: null,
    phone: null,
    age: null,
    gender: null,
    education: null,
    major: null,
    university: null,
    jlptLevel: null,
    workYears: null,
    relocationWilling: null,
  }),
}));

/* ── Mock email service (pollInbox) ───────────────────────── */

export let mockPollInboxResult: string[] = ["cand-1"];
export let mockPollInboxError: Error | null = null;

export function setMockPollInbox(result: string[], error?: Error) {
  mockPollInboxResult = result;
  mockPollInboxError = error ?? null;
}

mock.module(resolve(ROOT, "src/services/email"), () => ({
  pollInbox: async () => {
    if (mockPollInboxError) throw mockPollInboxError;
    return mockPollInboxResult;
  },
}));

/* ── Mock email-classifier ───────────────────────────────── */

mock.module(resolve(ROOT, "src/services/email-classifier"), () => ({
  classifyEmail: () => ({ isResume: "yes", reason: "test_default" }),
}));

/* ── Mock event-bus (prevent real events in tests) ────────── */

import { EventBus } from "../src/lib/event-bus";
export const mockEventBus = new EventBus();

mock.module(resolve(ROOT, "src/lib/event-bus"), () => ({
  EventBus,
  eventBus: mockEventBus,
}));

/* ── Mock university-lookup (DB query) ────────────────────── */

mock.module(resolve(ROOT, "src/services/university-lookup"), () => ({
  mapDomesticTagToTier: (tag: string | null) => {
    const map: Record<string, string> = { "985": "S", "211": "A", "双一流": "A", "省重点一本": "B", "普通一本": "C", "普通本科": "D" };
    return (tag && map[tag]) ?? "D";
  },
  mapQsRankToTier: (rank: number | null) => {
    if (rank == null) return "D";
    if (rank <= 50) return "S";
    if (rank <= 100) return "A";
    if (rank <= 300) return "B";
    if (rank <= 500) return "C";
    return "D";
  },
  tierToScore: (tier: string) => {
    const map: Record<string, number> = { S: 95, A: 85, B: 70, C: 55, D: 30 };
    return map[tier] ?? 30;
  },
  extractUniversityName: () => null,
  lookupUniversity: async () => null,
  extractJlptLevel: (_text: string) => null,
}));
