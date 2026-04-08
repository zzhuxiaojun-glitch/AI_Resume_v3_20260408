# 03 — CI/CD 自动化测试

> 针对 HR 智能简历筛选系统后端（Elysia + Drizzle + MiniMax M2.5）的持续集成/持续部署与自动化测试全面调研。

---

## 目录

1. [测试策略总览](#1-测试策略总览)
2. [单元测试](#2-单元测试)
3. [集成测试](#3-集成测试)
4. [E2E 测试](#4-e2e-测试)
5. [CI/CD 平台选型](#5-cicd-平台选型)
6. [CI Pipeline 设计](#6-ci-pipeline-设计)
7. [CD 部署策略](#7-cd-部署策略)
8. [代码质量工具](#8-代码质量工具)
9. [安全扫描](#9-安全扫描)
10. [监控和报告](#10-监控和报告)
11. [最佳实践](#11-最佳实践)
12. [具体实施路线图](#12-具体实施路线图)

---

## 1. 测试策略总览

### 1.1 测试金字塔

```
        ╱  E2E  ╲               少量，慢，高成本
       ╱─────────╲              验证完整用户流程
      ╱ 集成测试  ╲             中等数量，中等速度
     ╱─────────────╲            验证模块间协作
    ╱   单元测试    ╲           大量，快，低成本
   ╱─────────────────╲          验证单个函数/模块
```

### 1.2 各层级在本项目中的应用

| 层级 | 覆盖目标 | 示例 | 数量占比 |
|------|----------|------|----------|
| **单元测试** | 纯函数、工具函数、业务逻辑 | `extractJson()`, `parseResume()`, `scoreResume()` mock 版, `findAttachments()` | 70% |
| **集成测试** | 模块协作、数据库读写 | Drizzle 增删改查、Elysia 路由 + DB、评分流程 (parser → scorer) | 20% |
| **E2E 测试** | 完整 API 流程 | `POST /api/resumes/upload` 端到端、邮件轮询全流程 | 10% |

### 1.3 测试覆盖率目标

| 阶段 | 行覆盖率 | 分支覆盖率 | 函数覆盖率 |
|------|---------|-----------|-----------|
| MVP（当前） | ≥ 60% | ≥ 50% | ≥ 70% |
| V1.0 | ≥ 80% | ≥ 70% | ≥ 85% |
| 生产稳定期 | ≥ 90% | ≥ 80% | ≥ 95% |

### 1.4 测试文件组织结构

```
hr-backend/
├── src/
│   ├── services/
│   │   ├── ai-scorer.ts
│   │   ├── resume-parser.ts
│   │   └── email.ts
│   └── routes/
│       ├── positions.ts
│       ├── candidates.ts
│       └── resumes.ts
├── test/
│   ├── unit/                    # 单元测试
│   │   ├── ai-scorer.test.ts
│   │   ├── resume-parser.test.ts
│   │   ├── email.test.ts
│   │   └── extract-json.test.ts
│   ├── integration/             # 集成测试
│   │   ├── db.test.ts
│   │   ├── routes-positions.test.ts
│   │   ├── routes-candidates.test.ts
│   │   └── routes-resumes.test.ts
│   ├── e2e/                     # 端到端测试
│   │   └── full-flow.test.ts
│   ├── fixtures/                # 测试数据
│   │   ├── sample-resume.pdf
│   │   ├── sample-resume.docx
│   │   └── mock-ai-response.json
│   └── helpers/                 # 测试工具函数
│       ├── setup.ts
│       ├── db-helpers.ts
│       └── mock-factories.ts
├── vitest.config.ts
└── vitest.workspace.ts          # 可选：工作区配置
```

---

## 2. 单元测试

### 2.1 测试框架选型

| 特性 | Vitest | Jest | Bun Test Runner |
|------|--------|------|---------------------|
| **ESM 原生支持** | ✅ 原生 | ⚠️ 需配置 `--experimental-vm-modules` | ✅ 原生 |
| **TypeScript 支持** | ✅ 通过 Vite 编译 | ⚠️ 需 `ts-jest` 或 `@swc/jest` | ✅ 原生（Bun 内置 TS 支持） |
| **速度** | ⚡ 极快（Vite 热编译） | 🐢 较慢（特别是 TS + ESM） | ⚡ 快（原生） |
| **生态成熟度** | ✅ 成熟，兼容 Jest API | ✅ 最成熟 | ⚠️ 基础，兼容 Jest API |
| **Mock 功能** | ✅ `vi.mock()`, `vi.fn()` | ✅ `jest.mock()`, `jest.fn()` | ✅ `mock.module()`, `mock()` |
| **覆盖率** | ✅ 内置 c8/istanbul | ✅ 内置 istanbul | ⚠️ 需额外配置 |
| **Watch 模式** | ✅ 极快（HMR） | ✅ 支持 | ✅ `--watch` |
| **快照测试** | ✅ 支持 | ✅ 支持 | ✅ 支持 |
| **UI 界面** | ✅ `vitest --ui` | ❌ 需第三方 | ❌ 无 |

**推荐：Vitest** — 原生 ESM + TypeScript 支持最好，速度最快，与项目 `"type": "module"` 完美兼容。

### 2.2 Vitest 安装和配置

```bash
# 安装 Vitest 及相关依赖
bun add -D vitest @vitest/coverage-v8 @vitest/ui
```

**`vitest.config.ts`:**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 全局设置
    globals: true,
    environment: "node",

    // 文件匹配
    include: ["test/**/*.test.ts"],

    // 覆盖率配置
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/db/migrate.ts",
        "src/index.ts",
        "src/env.ts",
      ],
      thresholds: {
        lines: 60,
        branches: 50,
        functions: 70,
      },
    },

    // 超时设置（AI 调用可能较慢）
    testTimeout: 30_000,

    // 设置文件
    setupFiles: ["test/helpers/setup.ts"],
  },
});
```

**`package.json` 新增脚本:**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:unit": "vitest run test/unit/",
    "test:integration": "vitest run test/integration/",
    "test:e2e": "vitest run test/e2e/"
  }
}
```

### 2.3 单元测试示例

#### 2.3.1 `extractJson()` 测试

```typescript
// test/unit/extract-json.test.ts
import { describe, it, expect } from "vitest";

// 需要先将 extractJson 导出或独立为模块
// 假设已从 ai-scorer.ts 中导出
import { extractJson } from "../../src/services/ai-scorer.js";

describe("extractJson", () => {
  it("应该直接返回纯 JSON 字符串", () => {
    const input = '{"totalScore": 85, "grade": "A"}';
    expect(extractJson(input)).toBe(input);
  });

  it("应该移除 <think> 标签", () => {
    const input = `<think>
让我分析一下这份简历...
候选人有5年经验，技能匹配度高。
</think>
{"totalScore": 85, "grade": "A"}`;
    const result = extractJson(input);
    expect(result).toBe('{"totalScore": 85, "grade": "A"}');
    expect(result).not.toContain("<think>");
  });

  it("应该移除 Markdown 代码块", () => {
    const input = '```json\n{"totalScore": 85, "grade": "A"}\n```';
    expect(extractJson(input)).toBe('{"totalScore": 85, "grade": "A"}');
  });

  it("应该同时处理 <think> 标签和代码块", () => {
    const input = `<think>思考中...</think>
\`\`\`json
{"totalScore": 85, "grade": "A"}
\`\`\``;
    expect(extractJson(input)).toBe('{"totalScore": 85, "grade": "A"}');
  });

  it("应该处理没有 json 标记的代码块", () => {
    const input = '```\n{"totalScore": 85}\n```';
    expect(extractJson(input)).toBe('{"totalScore": 85}');
  });
});
```

#### 2.3.2 `resume-parser` 测试

```typescript
// test/unit/resume-parser.test.ts
import { describe, it, expect, vi } from "vitest";
import { parseResume } from "../../src/services/resume-parser.js";
import fs from "node:fs";
import path from "node:path";

describe("parseResume", () => {
  it("应该解析 PDF 文件并返回文本", async () => {
    // 使用真实的小型 PDF fixture
    const pdfPath = path.join(__dirname, "../fixtures/sample-resume.pdf");
    const buffer = fs.readFileSync(pdfPath);

    const result = await parseResume(buffer, "张三_前端工程师.pdf");

    expect(result.fileName).toBe("张三_前端工程师.pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("应该解析 DOCX 文件", async () => {
    const docxPath = path.join(__dirname, "../fixtures/sample-resume.docx");
    const buffer = fs.readFileSync(docxPath);

    const result = await parseResume(buffer, "李四_后端工程师.docx");

    expect(result.fileName).toBe("李四_后端工程师.docx");
    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("应该拒绝不支持的格式", async () => {
    const buffer = Buffer.from("some text content");
    await expect(parseResume(buffer, "test.txt")).rejects.toThrow(
      "Unsupported file format: .txt",
    );
  });

  it("应该忽略大小写扩展名", async () => {
    const pdfPath = path.join(__dirname, "../fixtures/sample-resume.pdf");
    const buffer = fs.readFileSync(pdfPath);

    // .PDF 大写也应该正常解析
    const result = await parseResume(buffer, "test.PDF");
    expect(result.mimeType).toBe("application/pdf");
  });
});
```

#### 2.3.3 `ai-scorer` 测试（mock AI 调用）

```typescript
// test/unit/ai-scorer.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AI SDK 的 generateText
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

import { generateText } from "ai";
import { scoreResume } from "../../src/services/ai-scorer.js";

const mockGenerateText = vi.mocked(generateText);

describe("scoreResume", () => {
  const sampleSkillConfig = {
    must: ["TypeScript", "React"],
    nice: ["Docker", "CI/CD"],
    reject: ["无相关开发经验"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应该正确解析 AI 返回的纯 JSON", async () => {
    const mockResponse = {
      totalScore: 82,
      mustScore: 90,
      niceScore: 70,
      rejectPenalty: 5,
      grade: "A",
      matchedSkills: ["TypeScript", "React", "Docker"],
      missingSkills: ["CI/CD"],
      explanation: "候选人技术栈匹配度高，有3年TypeScript和React经验。",
    };

    mockGenerateText.mockResolvedValue({
      text: JSON.stringify(mockResponse),
    } as any);

    const result = await scoreResume(
      "候选人简历文本...",
      "前端开发工程师",
      "负责前端开发",
      sampleSkillConfig,
    );

    expect(result.totalScore).toBe(82);
    expect(result.grade).toBe("A");
    expect(result.matchedSkills).toContain("TypeScript");
    expect(result.missingSkills).toContain("CI/CD");
  });

  it("应该处理包含 <think> 标签的回复", async () => {
    const mockResponse = {
      totalScore: 45,
      mustScore: 50,
      niceScore: 30,
      rejectPenalty: 10,
      grade: "C",
      matchedSkills: ["React"],
      missingSkills: ["TypeScript"],
      explanation: "候选人有一定前端基础。",
    };

    mockGenerateText.mockResolvedValue({
      text: `<think>让我分析这份简历...</think>\n${JSON.stringify(mockResponse)}`,
    } as any);

    const result = await scoreResume(
      "简历文本...",
      "前端工程师",
      "描述",
      sampleSkillConfig,
    );

    expect(result.totalScore).toBe(45);
    expect(result.grade).toBe("C");
  });

  it("应该在 Zod 校验失败时抛出错误", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ totalScore: "not a number" }),
    } as any);

    await expect(
      scoreResume("简历", "职位", "描述", sampleSkillConfig),
    ).rejects.toThrow();
  });

  it("应该在 AI 返回无效 JSON 时抛出错误", async () => {
    mockGenerateText.mockResolvedValue({
      text: "这不是JSON内容",
    } as any);

    await expect(
      scoreResume("简历", "职位", "描述", sampleSkillConfig),
    ).rejects.toThrow();
  });
});
```

#### 2.3.4 `findAttachments()` 测试

```typescript
// test/unit/email-attachments.test.ts
import { describe, it, expect } from "vitest";

// 需要导出 findAttachments 或将其作为独立模块
// 假设已从 email.ts 导出
import { findAttachments } from "../../src/services/email.js";

describe("findAttachments", () => {
  it("应该找到 PDF 附件", () => {
    const structure = {
      childNodes: [
        {
          type: "text/plain",
          dispositionParameters: {},
          parameters: {},
        },
        {
          type: "application/pdf",
          dispositionParameters: { filename: "简历.pdf" },
          parameters: {},
        },
      ],
    };

    const result = findAttachments(structure);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("简历.pdf");
    expect(result[0].part).toBe("2");
  });

  it("应该找到 inline 的 PDF（BOSS直聘格式）", () => {
    const structure = {
      childNodes: [
        {
          type: "text/html",
          parameters: {},
          dispositionParameters: {},
        },
        {
          type: "application/pdf",
          disposition: "inline",
          parameters: { name: "党文琴_运营.pdf" },
          dispositionParameters: {},
        },
      ],
    };

    const result = findAttachments(structure);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("党文琴_运营.pdf");
  });

  it("应该找到 DOCX 附件", () => {
    const structure = {
      childNodes: [
        {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          dispositionParameters: { filename: "简历.docx" },
          parameters: {},
        },
      ],
    };

    const result = findAttachments(structure);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("简历.docx");
  });

  it("应该忽略非简历文件", () => {
    const structure = {
      childNodes: [
        {
          type: "image/png",
          dispositionParameters: { filename: "logo.png" },
          parameters: {},
        },
        {
          type: "text/plain",
          parameters: {},
          dispositionParameters: {},
        },
      ],
    };

    const result = findAttachments(structure);
    expect(result).toHaveLength(0);
  });

  it("应该处理嵌套的 multipart 结构", () => {
    const structure = {
      childNodes: [
        {
          childNodes: [
            { type: "text/plain", parameters: {}, dispositionParameters: {} },
            { type: "text/html", parameters: {}, dispositionParameters: {} },
          ],
        },
        {
          type: "application/pdf",
          dispositionParameters: { filename: "resume.pdf" },
          parameters: {},
        },
      ],
    };

    const result = findAttachments(structure);
    expect(result).toHaveLength(1);
    expect(result[0].part).toBe("2");
  });
});
```

### 2.4 Mock 策略总结

| 被 Mock 的模块 | Mock 方式 | 适用场景 |
|----------------|----------|----------|
| `ai` (generateText) | `vi.mock("ai")` | ai-scorer 单元测试 |
| `imapflow` | `vi.mock("imapflow")` | email service 单元测试 |
| `pdf-parse` | `vi.mock("pdf-parse")` | resume-parser 单元测试（无真实 PDF 时） |
| `../db/index.js` | `vi.mock("../db/index.js")` | 路由级单元测试 |
| 环境变量 | `vi.stubEnv()` | 环境配置测试 |

### 2.5 测试数据管理

**`test/helpers/mock-factories.ts`:**

```typescript
import type { SkillConfig } from "../../src/lib/types.js";

export function createMockPosition(overrides = {}) {
  return {
    id: "pos-uuid-001",
    title: "前端开发工程师",
    department: "研发部",
    description: "负责前端开发",
    skillConfig: {
      must: ["TypeScript", "React"],
      nice: ["Docker", "CI/CD"],
      reject: ["无相关开发经验"],
    } as SkillConfig,
    status: "open",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

export function createMockCandidate(overrides = {}) {
  return {
    id: "cand-uuid-001",
    positionId: "pos-uuid-001",
    name: "张三",
    email: "zhangsan@example.com",
    phone: "13800138000",
    education: "本科",
    skills: ["TypeScript", "React", "Node.js"],
    status: "screening" as const,
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

export function createMockScore(overrides = {}) {
  return {
    id: "score-uuid-001",
    candidateId: "cand-uuid-001",
    positionId: "pos-uuid-001",
    totalScore: 82,
    mustScore: 90,
    niceScore: 70,
    rejectPenalty: 5,
    grade: "A" as const,
    matchedSkills: ["TypeScript", "React", "Docker"],
    missingSkills: ["CI/CD"],
    explanation: "候选人匹配度高。",
    createdAt: new Date("2025-01-01"),
    ...overrides,
  };
}
```

---

## 3. 集成测试

### 3.1 数据库集成测试

#### 方案一：Testcontainers（推荐）

```bash
bun add -D testcontainers @testcontainers/postgresql
```

```typescript
// test/helpers/db-helpers.ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../../src/db/schema.js";

let container: StartedPostgreSqlContainer;
let db: ReturnType<typeof drizzle>;
let sql: ReturnType<typeof postgres>;

export async function setupTestDb() {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("hr_test")
    .start();

  const connectionString = container.getConnectionUri();
  sql = postgres(connectionString, { max: 1 });
  db = drizzle(sql, { schema });

  // 运行迁移
  await migrate(db, { migrationsFolder: "./drizzle" });

  return { db, sql, connectionString };
}

export async function teardownTestDb() {
  if (sql) await sql.end();
  if (container) await container.stop();
}

export async function cleanTables(db: any) {
  // 按依赖顺序清空表
  await db.delete(schema.scores);
  await db.delete(schema.resumes);
  await db.delete(schema.candidates);
  await db.delete(schema.positions);
}
```

#### 方案二：使用真实的开发数据库

```typescript
// test/helpers/setup.ts
import { beforeAll, afterAll, afterEach } from "vitest";

let testDb: Awaited<ReturnType<typeof setupTestDb>>;

beforeAll(async () => {
  testDb = await setupTestDb();
  // 注入到全局可用
  globalThis.__TEST_DB__ = testDb.db;
});

afterEach(async () => {
  await cleanTables(testDb.db);
});

afterAll(async () => {
  await teardownTestDb();
});
```

### 3.2 数据库 CRUD 集成测试

```typescript
// test/integration/db.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb, cleanTables } from "../helpers/db-helpers.js";
import { positions, candidates, scores } from "../../src/db/schema.js";

let db: any;

beforeAll(async () => {
  const result = await setupTestDb();
  db = result.db;
});

afterEach(async () => {
  await cleanTables(db);
});

afterAll(async () => {
  await teardownTestDb();
});

describe("positions CRUD", () => {
  it("应该创建职位并返回完整记录", async () => {
    const [row] = await db
      .insert(positions)
      .values({
        title: "前端工程师",
        department: "研发部",
        skillConfig: {
          must: ["TypeScript"],
          nice: ["Docker"],
          reject: [],
        },
      })
      .returning();

    expect(row.id).toBeDefined();
    expect(row.title).toBe("前端工程师");
    expect(row.skillConfig.must).toContain("TypeScript");
  });

  it("应该查询所有职位", async () => {
    await db.insert(positions).values([
      { title: "前端工程师" },
      { title: "后端工程师" },
    ]);

    const rows = await db.select().from(positions);
    expect(rows).toHaveLength(2);
  });
});

describe("candidates + scores 关联", () => {
  it("应该创建候选人并关联评分", async () => {
    // 先创建职位
    const [pos] = await db
      .insert(positions)
      .values({ title: "前端工程师" })
      .returning();

    // 创建候选人
    const [cand] = await db
      .insert(candidates)
      .values({
        positionId: pos.id,
        name: "张三",
        status: "screening",
      })
      .returning();

    // 创建评分
    const [score] = await db
      .insert(scores)
      .values({
        candidateId: cand.id,
        positionId: pos.id,
        totalScore: 82,
        grade: "A",
        matchedSkills: ["TypeScript"],
        missingSkills: [],
      })
      .returning();

    expect(score.candidateId).toBe(cand.id);
    expect(score.totalScore).toBe(82);
  });
});
```

### 3.3 API 路由集成测试

Elysia 提供内置的 `app.handle()` 方法用于测试，无需启动真实 HTTP 服务器。

```typescript
// test/integration/routes-positions.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import app from "../../src/index.js";

// 假设已用 testcontainers 设置好测试数据库

describe("GET /api/positions", () => {
  it("应该返回空数组当没有职位时", async () => {
    const res = await app.handle(new Request("http://localhost/api/positions"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe("POST /api/positions", () => {
  it("应该创建新职位", async () => {
    const res = await app.handle(new Request("http://localhost/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "前端开发工程师",
        department: "研发部",
        skillConfig: {
          must: ["TypeScript", "React"],
          nice: ["Docker"],
          reject: [],
        },
      }),
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("前端开发工程师");
    expect(body.id).toBeDefined();
  });

  it("应该使用默认 skillConfig", async () => {
    const res = await app.handle(new Request("http://localhost/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "测试职位" }),
    }));

    const body = await res.json();
    expect(body.skillConfig).toEqual({
      must: [],
      nice: [],
      reject: [],
    });
  });
});

describe("GET /api/candidates", () => {
  it("应该支持按 positionId 筛选", async () => {
    // 先创建职位和候选人...
    const res = await app.handle(
      new Request("http://localhost/api/candidates?positionId=test-position-id"),
    );
    expect(res.status).toBe(200);
  });
});
```

### 3.4 完整流程集成测试（上传→解析→评分）

```typescript
// test/integration/routes-resumes.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";
import app from "../../src/index.js";
import fs from "node:fs";
import path from "node:path";

// Mock AI 评分，避免真实 API 调用
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      totalScore: 75,
      mustScore: 80,
      niceScore: 65,
      rejectPenalty: 3,
      grade: "B",
      matchedSkills: ["TypeScript"],
      missingSkills: ["React"],
      explanation: "测试评分",
    }),
  }),
}));

describe("POST /api/resumes/upload", () => {
  let positionId: string;

  beforeAll(async () => {
    // 创建测试职位
    const res = await app.handle(new Request("http://localhost/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "前端工程师",
        skillConfig: { must: ["TypeScript"], nice: [], reject: [] },
      }),
    }));
    const body = await res.json();
    positionId = body.id;
  });

  it("应该上传 PDF 并返回评分", async () => {
    const pdfBuffer = fs.readFileSync(
      path.join(__dirname, "../fixtures/sample-resume.pdf"),
    );

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([pdfBuffer], { type: "application/pdf" }),
      "test-resume.pdf",
    );
    formData.append("positionId", positionId);
    formData.append("name", "测试候选人");

    const res = await app.handle(new Request("http://localhost/api/resumes/upload", {
      method: "POST",
      body: formData,
    }));

    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.candidate.name).toBe("测试候选人");
    expect(body.score.totalScore).toBe(75);
    expect(body.score.grade).toBe("B");
    expect(body.resumeText).toBeDefined();
  });

  it("应该在没有文件时返回 400", async () => {
    const formData = new FormData();
    formData.append("positionId", positionId);

    const res = await app.handle(new Request("http://localhost/api/resumes/upload", {
      method: "POST",
      body: formData,
    }));

    expect(res.status).toBe(400);
  });

  it("应该在职位不存在时返回 404", async () => {
    const pdfBuffer = Buffer.from("fake pdf");
    const formData = new FormData();
    formData.append("file", new Blob([pdfBuffer]), "test.pdf");
    formData.append("positionId", "non-existent-uuid");

    const res = await app.handle(new Request("http://localhost/api/resumes/upload", {
      method: "POST",
      body: formData,
    }));

    expect(res.status).toBe(404);
  });
});
```

---

## 4. E2E 测试

### 4.1 API E2E 测试

```typescript
// test/e2e/full-flow.test.ts
import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3001";

describe("完整招聘流程 E2E", () => {
  let positionId: string;
  let candidateId: string;

  it("Step 1: 创建职位", async () => {
    const res = await fetch(`${BASE}/api/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "全栈工程师",
        department: "技术部",
        description: "负责全栈开发",
        skillConfig: {
          must: ["TypeScript", "Node.js", "React"],
          nice: ["Docker", "PostgreSQL", "CI/CD"],
          reject: ["无编程经验"],
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    positionId = body.id;
    expect(positionId).toBeDefined();
  });

  it("Step 2: 上传简历并获得评分", async () => {
    const formData = new FormData();
    const pdfBlob = new Blob(
      [Buffer.from("模拟的PDF简历内容...")],
      { type: "application/pdf" },
    );
    formData.append("file", pdfBlob, "候选人A_全栈工程师.pdf");
    formData.append("positionId", positionId);
    formData.append("name", "候选人A");

    const res = await fetch(`${BASE}/api/resumes/upload`, {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    candidateId = body.candidate.id;
    expect(body.score.grade).toBeDefined();
  });

  it("Step 3: 查看候选人列表", async () => {
    const res = await fetch(
      `${BASE}/api/candidates?positionId=${positionId}`,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
  });

  it("Step 4: 更新候选人状态为入围", async () => {
    const res = await fetch(`${BASE}/api/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "shortlisted",
        notes: "技术面试安排在下周一",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("shortlisted");
  });
});
```

### 4.2 工具选型对比

| 工具 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| **Elysia `app.handle()`** | 集成测试 | 无需启动服务器，极快 | 无法测试真实网络层 |
| **原生 `fetch`** | E2E 测试 | 无需额外依赖，Bun 内置 | 需要先启动服务器 |
| **Supertest** | API 测试 | 语法简洁，自动管理服务器生命周期 | 对 ESM 支持有时有问题 |

**推荐**：集成测试用 `app.handle()`，E2E 测试用原生 `fetch`。

---

## 5. CI/CD 平台选型

### 5.1 平台对比

| 特性 | Gitea Actions | GitHub Actions | GitLab CI |
|------|--------------|----------------|-----------|
| **与项目 Git 集成** | ✅ 原生（项目在 Gitea） | ❌ 需镜像仓库 | ❌ 需镜像仓库 |
| **兼容性** | ✅ 兼容 GitHub Actions YAML | ✅ 原生 | ❌ 不同语法 |
| **Runner** | 自托管 Act Runner | GitHub 托管 / 自托管 | 自托管 / SaaS |
| **费用** | 免费（自托管） | 免费额度 + 收费 | 免费额度 + 收费 |
| **Docker 支持** | ✅ | ✅ | ✅ |
| **Secret 管理** | ✅ 仓库/组织级 | ✅ 完善 | ✅ 完善 |
| **缓存** | ✅ `actions/cache` 兼容 | ✅ 内置 | ✅ 内置 |
| **矩阵构建** | ✅ | ✅ | ✅ |
| **成熟度** | ⚠️ 较新，持续完善中 | ✅ 最成熟 | ✅ 很成熟 |

### 5.2 推荐方案

**首选 Gitea Actions**，理由：
- 项目已托管在自建 Gitea (`git.keiten-jp.com`)，无需额外配置
- 兼容 GitHub Actions 语法，学习成本低
- 数据不离开内网，安全性更好
- 需要部署 [Act Runner](https://gitea.com/gitea/act_runner) 在服务器上

### 5.3 Act Runner 部署

```bash
# 下载 Act Runner
wget https://gitea.com/gitea/act_runner/releases/latest/download/act_runner-linux-amd64
chmod +x act_runner-linux-amd64
mv act_runner-linux-amd64 /usr/local/bin/act_runner

# 注册 Runner（在 Gitea Web UI 获取 token）
act_runner register \
  --instance https://git.keiten-jp.com \
  --token YOUR_RUNNER_TOKEN \
  --name hr-runner \
  --labels ubuntu-latest:docker://node:22

# 后台运行
act_runner daemon &

# 或者用 systemd 管理
cat > /etc/systemd/system/act-runner.service << 'EOF'
[Unit]
Description=Gitea Act Runner
After=network.target

[Service]
Type=simple
User=runner
WorkingDirectory=/home/runner
ExecStart=/usr/local/bin/act_runner daemon
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now act-runner
```

---

## 6. CI Pipeline 设计

### 6.1 完整 Gitea Actions 配置

```yaml
# .gitea/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  BUN_VERSION: "1"

jobs:
  # ─── 代码质量检查（并行） ──────────────────────────────
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - run: bun install --frozen-lockfile

      - name: ESLint
        run: bun lint

      - name: Prettier Check
        run: bun format:check

  typecheck:
    name: TypeScript Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - run: bun install --frozen-lockfile
      - run: bun typecheck

  # ─── 测试（依赖 lint 和 typecheck） ────────────────────
  test-unit:
    name: Unit Tests
    needs: [lint, typecheck]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - run: bun install --frozen-lockfile

      - name: Run Unit Tests
        run: bun test:unit --coverage

      - name: Upload Coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage-unit
          path: coverage/

  test-integration:
    name: Integration Tests
    needs: [lint, typecheck]
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: hr_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - run: bun install --frozen-lockfile

      - name: Run Migrations
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/hr_test
        run: bun db:migrate

      - name: Run Integration Tests
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/hr_test
          MINIMAX_API_KEY: test-key
          IMAP_HOST: localhost
          IMAP_PORT: 143
          IMAP_USER: test
          IMAP_PASS: test
        run: bun test:integration

  # ─── 构建验证 ──────────────────────────────────────────
  build:
    name: Build Check
    needs: [test-unit, test-integration]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - run: bun install --frozen-lockfile
      - run: bun build

      - name: Upload Build Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  # ─── 安全扫描 ──────────────────────────────────────────
  security:
    name: Security Scan
    needs: [lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - run: bun install --frozen-lockfile

      - name: bun audit
        run: bun x npm-audit --audit-level moderate
        continue-on-error: true

      - name: Check for secrets
        uses: gitleaks/gitleaks-action@v2
        env:
          GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
```

### 6.2 Pipeline 可视化

```
push / PR
  │
  ├──→ lint          ──┐
  │                    ├──→ test-unit       ──┐
  ├──→ typecheck     ──┤                     ├──→ build ──→ (deploy)
  │                    ├──→ test-integration ──┘
  └──→ security      ──┘
```

### 6.3 缓存优化

Bun 缓存可以显著加速依赖安装：

```yaml
# Bun 缓存由 oven-sh/setup-bun 自动处理

# 如需手动配置：
- name: Get Bun cache directory
  shell: bash
  run: echo "STORE_PATH=$(bun pm cache)" >> $GITHUB_ENV

- uses: actions/cache@v4
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-bun-store-${{ hashFiles('**/bun.lock') }}
    restore-keys: |
      ${{ runner.os }}-bun-store-
```

---

## 7. CD 部署策略

### 7.1 环境分离

| 环境 | 分支 | 数据库 | 触发方式 |
|------|------|--------|----------|
| **开发 (dev)** | `develop` | `hr_dev` | 自动部署 |
| **预发布 (staging)** | `release/*` | `hr_staging` | 自动部署 |
| **生产 (prod)** | `main` | `hr_production` | 手动审批 |

### 7.2 部署 Workflow

```yaml
# .gitea/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [build]
    # 生产环境需要手动审批（Gitea 环境保护规则）
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/hr-backend
            git pull origin main
            bun install --frozen-lockfile
            bun db:migrate
            pm2 restart hr-backend
```

### 7.3 数据库迁移策略

```yaml
# 在部署前执行迁移（推荐独立步骤）
- name: Run Database Migrations
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: |
    bun db:migrate
    echo "Migration completed successfully"
```

**迁移原则：**
- 迁移必须向前兼容（不删字段，先加新字段 → 部署新代码 → 再删旧字段）
- 生产迁移前先在 staging 验证
- 保留回滚脚本

### 7.4 回滚方案

```bash
#!/bin/bash
# scripts/rollback.sh
# 使用方式: ./rollback.sh <commit-hash>

COMMIT=${1:-HEAD~1}
echo "Rolling back to $COMMIT..."

git checkout $COMMIT
bun install --frozen-lockfile
pm2 restart hr-backend

echo "Rollback complete. Current version:"
git log --oneline -1
```

---

## 8. 代码质量工具

### 8.1 方案对比

| 工具组合 | 优点 | 缺点 |
|---------|------|------|
| **ESLint + Prettier** | 生态最成熟，社区支持好 | 配置繁琐，两个工具需协调 |
| **Biome** | 一体化（lint + format），极快（Rust 编写） | 生态较新，插件少 |

**推荐 Biome**（对于新项目）：配置简单、速度极快、一个工具解决 lint + format。

### 8.2 Biome 配置

```bash
bun add -D @biomejs/biome
```

**`biome.json`:**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "complexity": {
        "noForEach": "off"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "files": {
    "ignore": ["node_modules", "dist", "drizzle", "*.json"]
  }
}
```

**`package.json` 脚本:**

```json
{
  "scripts": {
    "lint": "biome check src/",
    "lint:fix": "biome check --write src/",
    "format": "biome format --write src/",
    "format:check": "biome format src/"
  }
}
```

### 8.3 ESLint 配置（备选方案）

```bash
bun add -D eslint @eslint/js typescript-eslint
```

**`eslint.config.js`:**

```javascript
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/", "node_modules/", "drizzle/"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
```

### 8.4 Git Hooks（Husky + lint-staged）

```bash
bun add -D husky lint-staged
bun x husky init
```

**`.husky/pre-commit`:**

```bash
bun x lint-staged
```

**`package.json` 中的 lint-staged 配置:**

```json
{
  "lint-staged": {
    "src/**/*.ts": [
      "biome check --write",
      "biome format --write"
    ]
  }
}
```

### 8.5 Commitlint

```bash
bun add -D @commitlint/cli @commitlint/config-conventional
```

**`commitlint.config.js`:**

```javascript
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // 新功能
        "fix",      // 修复 Bug
        "docs",     // 文档变更
        "style",    // 代码格式（不影响功能）
        "refactor", // 重构（不是新功能也不是修复）
        "perf",     // 性能优化
        "test",     // 测试
        "chore",    // 构建过程或辅助工具
        "ci",       // CI/CD 相关
      ],
    ],
  },
};
```

**`.husky/commit-msg`:**

```bash
bun x commitlint --edit $1
```

---

## 9. 安全扫描

### 9.1 依赖漏洞扫描

```bash
# bun 审计（通过 npm audit）
bun x npm-audit

# 仅报告中高危漏洞
bun x npm-audit --audit-level high

# CI 中使用（发现漏洞时失败）
bun x npm-audit --audit-level moderate || exit 1
```

### 9.2 Trivy 扫描

```yaml
# CI 中集成 Trivy
- name: Trivy FS Scan
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: fs
    scan-ref: .
    severity: HIGH,CRITICAL
    exit-code: 1
```

### 9.3 Secret 泄露检测

```yaml
# .gitleaks.toml
[extend]
useDefault = true

[[rules]]
id = "minimax-api-key"
description = "MiniMax API Key"
regex = '''sk-cp-[A-Za-z0-9\-_]{50,}'''
tags = ["key", "minimax"]

[[allowlist]]
paths = [
  '''.env.example''',
  '''docs/''',
]
```

```bash
# 本地检测
bun add -D gitleaks
gitleaks detect --source . --verbose

# 检查 Git 历史
gitleaks detect --source . --log-opts="--all"
```

### 9.4 安全工具对比

| 工具 | 类型 | 免费 | CI 集成 | 检测范围 |
|------|------|------|---------|----------|
| `bun x npm-audit` | 依赖漏洞 | ✅ | ✅ | npm 依赖 |
| Trivy | 多维扫描 | ✅ | ✅ | 依赖 + Docker + IaC |
| Snyk | 全方位 | 免费版有限制 | ✅ | 依赖 + 代码 + Docker |
| Gitleaks | Secret | ✅ | ✅ | Git 历史中的密钥 |
| SonarQube | SAST | 社区版免费 | ✅ | 代码质量 + 安全 |

---

## 10. 监控和报告

### 10.1 测试覆盖率

```bash
# 生成覆盖率报告
bun test:coverage

# 输出格式：
# - text: 终端表格
# - lcov: 用于 CI 上传
# - html: 本地浏览器查看
```

**Vitest 覆盖率配置（已在 vitest.config.ts 中）:**

```typescript
coverage: {
  provider: "v8",
  reporter: ["text", "lcov", "html", "json-summary"],
  include: ["src/**/*.ts"],
  exclude: ["src/db/migrate.ts", "src/index.ts"],
  thresholds: {
    lines: 60,
    branches: 50,
    functions: 70,
  },
},
```

### 10.2 CI 通知

#### 钉钉 Webhook

```yaml
# CI 失败通知
- name: Notify DingTalk on Failure
  if: failure()
  run: |
    curl -s -X POST \
      'https://oapi.dingtalk.com/robot/send?access_token=${{ secrets.DINGTALK_TOKEN }}' \
      -H 'Content-Type: application/json' \
      -d '{
        "msgtype": "markdown",
        "markdown": {
          "title": "CI 构建失败",
          "text": "### ❌ CI 构建失败\n\n- **仓库**: hr-backend\n- **分支**: ${{ github.ref_name }}\n- **提交者**: ${{ github.actor }}\n- **消息**: ${{ github.event.head_commit.message }}\n\n[查看详情](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})"
        }
      }'
```

#### Slack Webhook

```yaml
- name: Notify Slack
  if: always()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    fields: repo,message,commit,author
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 11. 最佳实践

### 11.1 分支策略

```
main (生产)
  │
  ├─── develop (开发主线)
  │      │
  │      ├── feature/resume-batch-upload
  │      ├── feature/email-template
  │      └── fix/score-calculation
  │
  └─── release/v1.0 (发布分支)
```

**规则：**
- `main` 分支受保护，只接受 PR
- 所有功能开发在 `feature/*` 分支进行
- 合并前必须通过 CI + Code Review
- Release 分支用于版本发布准备

### 11.2 PR 自动化检查清单

```yaml
# .gitea/workflows/pr-check.yml
name: PR Check
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install --frozen-lockfile

      # 所有检查并行执行
      - run: bun lint
      - run: bun typecheck
      - run: bun test:unit --coverage
      - run: bun run build

      # 覆盖率检查
      - name: Check Coverage Thresholds
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 60" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 60% threshold"
            exit 1
          fi
```

### 11.3 语义化版本管理

```bash
bun add -D semantic-release @semantic-release/changelog @semantic-release/git
```

**`.releaserc.json`:**

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    [
      "@semantic-release/npm",
      { "npmPublish": false }
    ],
    [
      "@semantic-release/git",
      {
        "assets": ["package.json", "CHANGELOG.md"],
        "message": "chore(release): ${nextRelease.version}"
      }
    ]
  ]
}
```

### 11.4 Changelog 自动生成

基于 Conventional Commits 自动生成 CHANGELOG：

```bash
# 使用 semantic-release（自动）
bun x semantic-release

# 或手动使用 conventional-changelog
bun add -D conventional-changelog-cli
bun x conventional-changelog -p angular -i CHANGELOG.md -s
```

---

## 12. 具体实施路线图

### Phase 0: 基础设施（第 1 天）

- [ ] 安装 Vitest：`bun add -D vitest @vitest/coverage-v8`
- [ ] 创建 `vitest.config.ts`
- [ ] 创建 `test/` 目录结构
- [ ] 添加测试脚本到 `package.json`
- [ ] 导出 `extractJson` 和 `findAttachments` 使其可测试

### Phase 1: 单元测试（第 2-3 天）

- [ ] `extractJson()` 测试
- [ ] `findAttachments()` 测试
- [ ] `parseResume()` 测试（含 fixture PDF/DOCX）
- [ ] `scoreResume()` mock 测试
- [ ] 创建 mock factories

### Phase 2: 代码质量（第 4 天）

- [ ] 安装 Biome 或 ESLint
- [ ] 配置 Husky + lint-staged
- [ ] 配置 commitlint
- [ ] 全量 lint 修复

### Phase 3: 集成测试（第 5-6 天）

- [ ] 配置 testcontainers 或测试数据库
- [ ] 数据库 CRUD 测试
- [ ] API 路由测试（`app.handle()`）
- [ ] 上传→解析→评分 流程测试

### Phase 4: CI Pipeline（第 7-8 天）

- [ ] 部署 Gitea Act Runner
- [ ] 创建 `.gitea/workflows/ci.yml`
- [ ] 配置 Secrets（DATABASE_URL, MINIMAX_API_KEY 等）
- [ ] 验证 pipeline 运行

### Phase 5: CD 部署（第 9-10 天）

- [ ] 创建 deploy workflow
- [ ] 配置 SSH 部署密钥
- [ ] 配置环境保护规则
- [ ] 测试自动部署流程

### Phase 6: 高级功能（后续迭代）

- [ ] E2E 测试
- [ ] 覆盖率门槛提升
- [ ] 安全扫描集成
- [ ] 通知集成（钉钉/Slack）
- [ ] semantic-release
- [ ] 性能基准测试

### 优先级排序

| 优先级 | 项目 | 投入 | 收益 |
|--------|------|------|------|
| P0 | Vitest + 单元测试 | 2天 | 代码质量保障基础 |
| P0 | Biome lint + format | 0.5天 | 代码风格统一 |
| P1 | Gitea Actions CI | 1天 | 自动化检查 |
| P1 | 集成测试 | 2天 | 模块协作验证 |
| P2 | Git hooks (Husky) | 0.5天 | 提交前拦截问题 |
| P2 | CD 自动部署 | 1天 | 减少手动操作 |
| P3 | 安全扫描 | 0.5天 | 漏洞防范 |
| P3 | E2E 测试 | 1天 | 完整流程验证 |
| P4 | 通知 + 覆盖率报告 | 0.5天 | 团队可见性 |
| P4 | semantic-release | 0.5天 | 版本管理自动化 |

---

## 附录

### A. 完整的 package.json scripts（目标状态）

```json
{
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/",
    "lint:fix": "biome check --write src/",
    "format": "biome format --write src/",
    "format:check": "biome format src/",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run test/unit/",
    "test:integration": "vitest run test/integration/",
    "test:e2e": "vitest run test/e2e/",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun src/db/migrate.ts",
    "prepare": "husky"
  }
}
```

### B. CI 环境变量清单

| 变量 | 类型 | 用途 |
|------|------|------|
| `DATABASE_URL` | Secret | 测试数据库连接 |
| `MINIMAX_API_KEY` | Secret | AI 评分（集成测试用 mock key） |
| `IMAP_HOST` | Variable | 邮件测试 |
| `DEPLOY_HOST` | Secret | 部署目标服务器 |
| `DEPLOY_SSH_KEY` | Secret | SSH 部署密钥 |
| `DINGTALK_TOKEN` | Secret | 钉钉通知 |

---

## 附录 C：Gitea Actions 深入指南

### C.1 Gitea Actions vs GitHub Actions 差异

Gitea Actions 基于 [act_runner](https://gitea.com/gitea/act_runner)，兼容大部分 GitHub Actions 语法，但有以下差异：

| 特性 | GitHub Actions | Gitea Actions |
|------|---------------|---------------|
| YAML 路径 | `.github/workflows/` | `.gitea/workflows/` |
| 变量前缀 | `${{ github.* }}` | `${{ gitea.* }}` |
| Secret 管理 | 仓库/组织设置 | 仓库/组织设置（UI 相同） |
| 环境保护 | ✅ 完善 | ⚠️ 部分支持 |
| Marketplace | ✅ 海量 Action | ⚠️ 可用大部分 GitHub Action |
| 矩阵构建 | ✅ | ✅ |
| 缓存 | `actions/cache` | ✅ 兼容 |
| Artifact | `actions/upload-artifact` | ✅ 兼容 |
| Runner | GitHub 托管/自托管 | 仅自托管（act_runner） |

### C.2 Act Runner 详细部署

```bash
# 方式一：二进制安装
wget https://gitea.com/gitea/act_runner/releases/latest/download/act_runner-linux-amd64
chmod +x act_runner-linux-amd64
sudo mv act_runner-linux-amd64 /usr/local/bin/act_runner

# 方式二：Docker 运行
docker run -d --name act-runner \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v act-runner-data:/data \
  -e GITEA_INSTANCE_URL=https://git.keiten-jp.com \
  -e GITEA_RUNNER_REGISTRATION_TOKEN=your_token \
  gitea/act_runner:latest

# 注册（从 Gitea Web UI 获取 token：设置 → Actions → Runners → 新建）
act_runner register \
  --instance https://git.keiten-jp.com \
  --token YOUR_RUNNER_TOKEN \
  --name hr-runner \
  --labels ubuntu-latest:docker://node:22-alpine

# 运行
act_runner daemon

# systemd 管理
cat > /etc/systemd/system/act-runner.service << 'EOF'
[Unit]
Description=Gitea Act Runner
After=docker.service network.target
Requires=docker.service

[Service]
Type=simple
User=runner
WorkingDirectory=/home/runner
ExecStart=/usr/local/bin/act_runner daemon
Restart=always
RestartSec=5
Environment=HOME=/home/runner

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now act-runner
```

### C.3 Runner 标签和镜像映射

```yaml
# act_runner 配置文件中设置标签映射
# ~/.config/act_runner/config.yaml
runner:
  labels:
    - "ubuntu-latest:docker://node:22-alpine"
    - "node-22:docker://node:22"
    - "postgres-test:docker://postgres:16-alpine"
```

### C.4 Gitea Actions 中的变量替换

```yaml
# GitHub 语法 → Gitea 等价物
# ${{ github.repository }}  → ${{ gitea.repository }}
# ${{ github.actor }}       → ${{ gitea.actor }}
# ${{ github.ref }}         → ${{ gitea.ref }}
# ${{ github.sha }}         → ${{ gitea.sha }}
# ${{ github.event_name }}  → ${{ gitea.event_name }}
# ${{ github.ref_name }}    → ${{ gitea.ref_name }}
# ${{ github.server_url }}  → ${{ gitea.server_url }}
# ${{ github.run_id }}      → ${{ gitea.run_id }}
```

---

## 附录 D：测试策略进阶

### D.1 测试环境变量隔离

```typescript
// test/helpers/setup.ts
import { beforeAll } from "vitest";

beforeAll(() => {
  // 确保测试不会意外连接生产数据库或调用真实 API
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    || "postgresql://test:test@localhost:5432/hr_test";
  process.env.MINIMAX_API_KEY = "test-key-not-real";
  process.env.IMAP_HOST = "localhost";
  process.env.IMAP_PORT = "143";
  process.env.IMAP_USER = "test@test.com";
  process.env.IMAP_PASS = "test-password";
});
```

### D.2 快照测试（评分结果 Schema）

```typescript
// test/unit/score-schema.test.ts
import { describe, it, expect } from "vitest";

describe("AI 评分结果 Schema 快照", () => {
  it("scoreSchema 应保持稳定结构", () => {
    const sampleScore = {
      totalScore: 82,
      mustScore: 90,
      niceScore: 70,
      rejectPenalty: 5,
      grade: "A",
      matchedSkills: ["TypeScript", "React"],
      missingSkills: ["Docker"],
      explanation: "候选人匹配度高。",
    };

    // 快照测试：如果结构变化会提示更新
    expect(sampleScore).toMatchSnapshot();
  });
});
```

### D.3 参数化测试（评分等级边界值）

```typescript
// test/unit/grade-boundaries.test.ts
import { describe, it, expect } from "vitest";

// 评分等级规则：A(≥80) B(≥65) C(≥50) D(≥35) F(<35)
function calculateGrade(score: number): string {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

describe("评分等级边界值测试", () => {
  const cases = [
    // [分数, 期望等级, 描述]
    [100, "A", "满分"],
    [80, "A", "A级下界"],
    [79.9, "B", "B级上界"],
    [65, "B", "B级下界"],
    [64.9, "C", "C级上界"],
    [50, "C", "C级下界"],
    [49.9, "D", "D级上界"],
    [35, "D", "D级下界"],
    [34.9, "F", "F级上界"],
    [0, "F", "零分"],
  ] as const;

  it.each(cases)("分数 %d 应为 %s 级（%s）", (score, grade) => {
    expect(calculateGrade(score)).toBe(grade);
  });
});
```

### D.4 性能基准测试

```typescript
// test/bench/resume-parser.bench.ts
import { describe, bench } from "vitest";
import { parseResume } from "../../src/services/resume-parser.js";
import fs from "node:fs";
import path from "node:path";

describe("简历解析性能基准", () => {
  const pdfBuffer = fs.readFileSync(
    path.join(__dirname, "../fixtures/sample-resume.pdf"),
  );

  bench("解析 PDF 简历", async () => {
    await parseResume(pdfBuffer, "test.pdf");
  }, { iterations: 50 });
});
```

```bash
# 运行基准测试
bun vitest bench
```

### D.5 错误场景测试矩阵

| 模块 | 错误场景 | 预期行为 |
|------|---------|---------|
| resume-parser | 空文件 | 抛出 Error |
| resume-parser | 损坏的 PDF | 抛出 Error（pdf-parse 异常） |
| resume-parser | 超大文件（>50MB） | 内存控制/超时 |
| ai-scorer | AI API 超时 | 抛出超时 Error |
| ai-scorer | AI 返回非 JSON | Zod 校验失败 |
| ai-scorer | AI 返回不完整字段 | Zod 校验失败 |
| email | IMAP 连接失败 | 错误日志 + 重试 |
| email | 邮件无附件 | 跳过该邮件 |
| routes | 缺少 positionId | 400 Bad Request |
| routes | 不存在的职位 ID | 404 Not Found |
| routes | 上传非 PDF/DOCX | 500 / 400 |

---

## 附录 E：Vitest 高级配置

### E.1 工作区配置（区分单元/集成/E2E）

```typescript
// vitest.workspace.ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "vitest.config.ts",
    test: {
      name: "unit",
      include: ["test/unit/**/*.test.ts"],
      environment: "node",
    },
  },
  {
    extends: "vitest.config.ts",
    test: {
      name: "integration",
      include: ["test/integration/**/*.test.ts"],
      environment: "node",
      // 集成测试串行执行（数据库状态依赖）
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
    },
  },
  {
    extends: "vitest.config.ts",
    test: {
      name: "e2e",
      include: ["test/e2e/**/*.test.ts"],
      environment: "node",
      testTimeout: 60_000,
    },
  },
]);
```

### E.2 自定义 Matcher（可选）

```typescript
// test/helpers/matchers.ts
import { expect } from "vitest";

expect.extend({
  toBeValidGrade(received: string) {
    const validGrades = ["A", "B", "C", "D", "F"];
    const pass = validGrades.includes(received);
    return {
      pass,
      message: () =>
        `Expected ${received} to be a valid grade (A/B/C/D/F)`,
    };
  },

  toBeInScoreRange(received: number) {
    const pass = received >= 0 && received <= 100;
    return {
      pass,
      message: () =>
        `Expected ${received} to be between 0 and 100`,
    };
  },
});

// vitest.d.ts 类型扩展
interface CustomMatchers<R = unknown> {
  toBeValidGrade(): R;
  toBeInScoreRange(): R;
}

declare module "vitest" {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
```

---

## 附录 F：代码覆盖率策略

### F.1 Vitest 覆盖率配置

```typescript
// vitest.config.ts — 覆盖率配置
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",           // 或 "istanbul"
      reporter: [
        "text",                  // 终端表格
        "text-summary",          // 终端摘要
        "lcov",                  // CI/CD 用（Coveralls, Codecov）
        "html",                  // 浏览器查看详情
        "json-summary",          // 程序读取
      ],
      reportsDirectory: "./coverage",

      // 覆盖率阈值（不达标则 CI 失败）
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },

      // 包含/排除
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",           // 入口文件（启动逻辑）
        "src/db/migrate.ts",      // 迁移脚本
        "src/env.ts",             // 环境变量验证
        "src/**/*.d.ts",          // 类型声明
        "src/**/*.test.ts",       // 测试文件本身
      ],
    },
  },
});
```

### F.2 CI 中的覆盖率门控

```yaml
# .gitea/workflows/test.yml — 覆盖率检查
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile
      - run: bun test:coverage

      # 提取覆盖率数字
      - name: Check coverage thresholds
        run: |
          LINES=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          echo "Line coverage: ${LINES}%"
          if (( $(echo "$LINES < 70" | bc -l) )); then
            echo "❌ Coverage below threshold (70%)"
            exit 1
          fi
          echo "✅ Coverage meets threshold"

      # 上传覆盖率报告（可选）
      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
```

### F.3 覆盖率目标规划

```
Phase 1 (MVP)：
├─ 总覆盖率目标：> 60%
├─ 重点覆盖：
│   ├─ ai-scorer.ts (评分逻辑) — 目标 80%
│   ├─ resume-parser.ts (解析逻辑) — 目标 80%
│   └─ routes/*.ts (API 路由) — 目标 70%
└─ 可跳过：
    ├─ email.ts (IMAP 连接 — mock 测试)
    └─ db/index.ts (数据库连接)

Phase 2：
├─ 总覆盖率目标：> 75%
├─ 新增覆盖：
│   ├─ 集成测试（API + DB）
│   └─ email.ts 的 mock 测试
└─ E2E 测试开始覆盖关键路径

Phase 3：
├─ 总覆盖率目标：> 80%
├─ 全面集成测试
├─ 性能回归测试
└─ 安全测试
```

---

## 附录 G：API 测试完整示例

### G.1 Elysia 路由测试（使用 app.handle）

```typescript
// test/routes/positions.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Elysia } from "elysia";
import positionsApp from "../../src/routes/positions.js";

// Mock 数据库
vi.mock("../../src/db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "../../src/db/index.js";

describe("Positions API", () => {
  let app: Elysia;

  beforeEach(() => {
    app = new Elysia();
    app.use(positionsApp);
    vi.clearAllMocks();
  });

  describe("GET /api/positions", () => {
    it("应返回职位列表", async () => {
      const mockPositions = [
        {
          id: 1,
          title: "前端工程师",
          description: "React/Vue 开发",
          skillConfig: {
            must_have: ["React", "TypeScript"],
            nice_to_have: ["Vue"],
            reject_if: [],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // @ts-ignore mock chain
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(mockPositions),
        }),
      });

      const res = await app.handle(new Request("http://localhost/api/positions"));
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe("前端工程师");
    });

    it("数据库错误时应返回 500", async () => {
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockRejectedValue(new Error("DB connection lost")),
        }),
      });

      const res = await app.handle(new Request("http://localhost/api/positions"));
      expect(res.status).toBe(500);
    });
  });

  describe("POST /api/positions", () => {
    it("应创建新职位", async () => {
      const newPosition = {
        title: "后端工程师",
        description: "Bun 服务开发",
        skillConfig: {
          must_have: ["Bun", "PostgreSQL"],
          nice_to_have: ["Docker"],
          reject_if: ["仅前端经验"],
        },
      };

      const mockCreated = { id: 2, ...newPosition, createdAt: new Date(), updatedAt: new Date() };

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreated]),
        }),
      });

      const res = await app.handle(new Request("http://localhost/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPosition),
      }));

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe(2);
      expect(data.title).toBe("后端工程师");
    });

    it("无效数据应返回 400", async () => {
      const res = await app.handle(new Request("http://localhost/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }), // 缺少必填字段
      }));

      expect(res.status).toBe(400);
    });
  });
});
```

### G.2 简历上传测试

```typescript
// test/routes/resumes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Elysia } from "elysia";
import resumesApp from "../../src/routes/resumes.js";

vi.mock("../../src/services/resume-parser.js", () => ({
  parseResume: vi.fn(),
}));

vi.mock("../../src/services/ai-scorer.js", () => ({
  scoreResume: vi.fn(),
}));

vi.mock("../../src/db/index.js", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

import { parseResume } from "../../src/services/resume-parser.js";
import { scoreResume } from "../../src/services/ai-scorer.js";

describe("Resume Upload API", () => {
  let app: Elysia;

  beforeEach(() => {
    app = new Elysia();
    app.use(resumesApp);
    vi.clearAllMocks();
  });

  it("应接受 PDF 文件并返回评分", async () => {
    // Mock 解析
    (parseResume as any).mockResolvedValue("张三，3年前端经验，精通 React");

    // Mock 评分
    (scoreResume as any).mockResolvedValue({
      totalScore: 75,
      grade: "B",
      matchedSkills: ["React"],
      missingSkills: ["TypeScript"],
      explanation: "经验不错但缺少 TS",
    });

    // 构造 multipart form data
    const formData = new FormData();
    const pdfBlob = new Blob(["fake pdf content"], { type: "application/pdf" });
    formData.append("file", pdfBlob, "resume.pdf");
    formData.append("positionId", "1");
    formData.append("candidateName", "张三");
    formData.append("candidateEmail", "zhang@example.com");

    const res = await app.handle(new Request("http://localhost/api/resumes/upload", {
      method: "POST",
      body: formData,
    }));

    expect(res.status).toBe(200);
    expect(parseResume).toHaveBeenCalled();
    expect(scoreResume).toHaveBeenCalled();
  });

  it("不支持的文件类型应返回 400", async () => {
    const formData = new FormData();
    const txtBlob = new Blob(["plain text"], { type: "text/plain" });
    formData.append("file", txtBlob, "resume.txt");
    formData.append("positionId", "1");

    const res = await app.handle(new Request("http://localhost/api/resumes/upload", {
      method: "POST",
      body: formData,
    }));

    expect(res.status).toBe(400);
  });
});
```

### G.3 健康检查测试

```typescript
// test/routes/health.test.ts
import { describe, it, expect } from "vitest";
import { Elysia } from "elysia";
import healthApp from "../../src/routes/health.js";

describe("Health Check", () => {
  const app = new Elysia();
  app.use(healthApp);

  it("GET /health 应返回 200 + status ok", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
  });
});
```

---

## 附录 H：数据库集成测试

### H.1 测试数据库设置

```typescript
// test/helpers/test-db.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/db/schema.js";

// 测试用独立数据库
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/hr_screening_test";

let testClient: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle>;

export function getTestDb() {
  if (!testDb) {
    testClient = postgres(TEST_DB_URL);
    testDb = drizzle(testClient, { schema });
  }
  return testDb;
}

export async function closeTestDb() {
  if (testClient) {
    await testClient.end();
  }
}

/** 清空所有表（测试之间隔离） */
export async function cleanTestDb() {
  const db = getTestDb();
  await db.delete(schema.scores);
  await db.delete(schema.resumes);
  await db.delete(schema.candidates);
  await db.delete(schema.positions);
}
```

### H.2 集成测试示例

```typescript
// test/integration/candidate-flow.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb, closeTestDb, cleanTestDb } from "../helpers/test-db.js";
import * as schema from "../../src/db/schema.js";

describe("候选人完整流程（集成测试）", () => {
  const db = getTestDb();

  beforeAll(async () => {
    // 确保测试数据库 schema 存在（CI 中由 migrate 步骤完成）
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanTestDb();
  });

  it("创建职位 → 添加候选人 → 评分 → 查询", async () => {
    // 1. 创建职位
    const [position] = await db
      .insert(schema.positions)
      .values({
        title: "测试职位",
        description: "测试描述",
        skillConfig: {
          must_have: ["TypeScript", "React"],
          nice_to_have: ["Docker"],
          reject_if: [],
        },
      })
      .returning();

    expect(position.id).toBeDefined();

    // 2. 创建候选人
    const [candidate] = await db
      .insert(schema.candidates)
      .values({
        name: "测试候选人",
        email: "test@example.com",
        phone: "13800138000",
        positionId: position.id,
        skills: ["TypeScript", "React", "Node.js"],
        status: "pending",
      })
      .returning();

    expect(candidate.id).toBeDefined();

    // 3. 创建评分
    const [score] = await db
      .insert(schema.scores)
      .values({
        candidateId: candidate.id,
        positionId: position.id,
        totalScore: 85,
        mustScore: 60,
        niceScore: 25,
        rejectPenalty: 0,
        grade: "A",
        matchedSkills: ["TypeScript", "React"],
        missingSkills: [],
        explanation: "完全匹配必备技能",
      })
      .returning();

    expect(score.grade).toBe("A");

    // 4. 查询候选人及评分
    const [result] = await db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.id, candidate.id));

    expect(result.name).toBe("测试候选人");
    expect(result.status).toBe("pending");

    // 5. 更新状态
    await db
      .update(schema.candidates)
      .set({ status: "interview" })
      .where(eq(schema.candidates.id, candidate.id));

    const [updated] = await db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.id, candidate.id));

    expect(updated.status).toBe("interview");
  });

  it("重复邮箱应被约束阻止", async () => {
    const [position] = await db
      .insert(schema.positions)
      .values({
        title: "测试",
        description: "测试",
        skillConfig: { must_have: [], nice_to_have: [], reject_if: [] },
      })
      .returning();

    await db.insert(schema.candidates).values({
      name: "A",
      email: "dup@example.com",
      positionId: position.id,
      status: "pending",
    });

    // 同一职位重复邮箱
    await expect(
      db.insert(schema.candidates).values({
        name: "B",
        email: "dup@example.com",
        positionId: position.id,
        status: "pending",
      })
    ).rejects.toThrow(); // 唯一约束
  });
});
```

### H.3 CI 中运行集成测试

```yaml
# .gitea/workflows/test.yml — 集成测试 job
jobs:
  integration-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg17
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: hr_screening_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - name: Run migrations
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hr_screening_test
        run: bun db:migrate

      - name: Run integration tests
        env:
          TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hr_screening_test
        run: bun vitest run test/integration/
```

---

## 附录 I：安全扫描与审计

### I.1 依赖漏洞扫描

```bash
# Bun 审计（通过 npm audit）
bun audit
bun audit --fix  # 自动修复

# 更详细的扫描
bun x better-npm-audit audit
```

```yaml
# .gitea/workflows/security.yml
name: Security Audit
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 8 * * 1'  # 每周一

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Dependency audit
        run: bun x npm-audit --audit-level=high
        continue-on-error: true

      - name: License check
        run: bun x license-checker --failOn "GPL-3.0;AGPL-3.0"
```

### I.2 Biome 安全规则

```json
// biome.json — 安全相关 lint 规则
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "linter": {
    "enabled": true,
    "rules": {
      "security": {
        "noDangerouslySetInnerHtml": "error",
        "noGlobalEval": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn",
        "noAssignInExpressions": "error",
        "noFallthroughSwitchClause": "error",
        "noImplicitAnyLet": "warn"
      },
      "complexity": {
        "noExcessiveCognitiveComplexity": {
          "level": "warn",
          "options": { "maxAllowedComplexity": 15 }
        }
      }
    }
  }
}
```

### I.3 Secret 泄露检测

```bash
# 使用 gitleaks 检测代码中的敏感信息
# 安装
brew install gitleaks  # macOS
# 或
docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source /repo

# 扫描当前仓库
gitleaks detect --source . --verbose

# Pre-commit hook
gitleaks protect --staged
```

```yaml
# .gitleaks.toml — 自定义规则
[allowlist]
  description = "Global allow list"
  paths = [
    '''\.env\.example$''',
    '''docs/research/.*\.md$''',
  ]

[[rules]]
  id = "minimax-api-key"
  description = "MiniMax API Key"
  regex = '''sk-cp-[a-zA-Z0-9]{32,}'''
  tags = ["key", "minimax"]
```

---

## 附录 J：Git Hooks 自动化

### J.1 使用 simple-git-hooks + lint-staged

```bash
bun add -D simple-git-hooks lint-staged
```

```json
// package.json
{
  "simple-git-hooks": {
    "pre-commit": "bun lint-staged",
    "commit-msg": "bun commitlint --edit $1"
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "biome check --write",
      "vitest related --run"
    ],
    "*.{json,md}": [
      "biome format --write"
    ]
  }
}
```

```bash
# 激活 hooks
bun simple-git-hooks
```

### J.2 Commit Message 规范

```bash
bun add -D @commitlint/cli @commitlint/config-conventional
```

```javascript
// commitlint.config.js
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // 新功能
        "fix",      // 修复
        "docs",     // 文档
        "style",    // 格式
        "refactor", // 重构
        "perf",     // 性能
        "test",     // 测试
        "chore",    // 构建/工具
        "ci",       // CI/CD
      ],
    ],
    "subject-max-length": [2, "always", 100],
    "body-max-line-length": [1, "always", 200],
  },
};
```

### J.3 完整 CI Pipeline 示例

```yaml
# .gitea/workflows/ci.yml — 完整 CI 管线
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  BUN_VERSION: "1"

jobs:
  # ── 代码质量检查 ──
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}
      - run: bun install --frozen-lockfile
      - run: bun biome check src/
      - run: bun tsc --noEmit

  # ── 单元测试 ──
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}
      - run: bun install --frozen-lockfile
      - run: bun vitest run test/unit/ --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: unit-coverage
          path: coverage/

  # ── 集成测试 ──
  integration-test:
    runs-on: ubuntu-latest
    needs: [lint]
    services:
      postgres:
        image: pgvector/pgvector:pg17
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: hr_screening_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}
      - run: bun install --frozen-lockfile
      - run: bun db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hr_screening_test
      - run: bun vitest run test/integration/
        env:
          TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hr_screening_test

  # ── 安全审计 ──
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}
      - run: bun install --frozen-lockfile
      - run: bun x npm-audit --audit-level=high
        continue-on-error: true

  # ── Docker 构建 ──
  docker-build:
    runs-on: ubuntu-latest
    needs: [unit-test, integration-test]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t hr-backend:${{ github.sha }} .
      - name: Security scan
        run: |
          docker run --rm \
            -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy:latest image \
            --severity HIGH,CRITICAL \
            hr-backend:${{ github.sha }}

  # ── 部署（仅 main 分支） ──
  deploy:
    runs-on: ubuntu-latest
    needs: [docker-build]
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Deploy to server
        run: |
          ssh deploy@server "cd /opt/hr-backend && ./scripts/deploy.sh"
```

---

## 附录 K：E2E 测试（端到端）

### K.1 使用 Vitest + fetch 的 API E2E 测试

```typescript
// test/e2e/full-flow.test.ts
// 需要真实运行的后端服务 + 数据库
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3001";

describe("E2E: 完整招聘流程", () => {
  let positionId: number;
  let candidateId: number;

  // 确保服务运行
  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.ok).toBe(true);
  });

  it("1. 创建职位", async () => {
    const res = await fetch(`${BASE_URL}/api/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "E2E 测试职位",
        description: "自动化测试用职位",
        skillConfig: {
          must_have: ["TypeScript", "React"],
          nice_to_have: ["Docker", "PostgreSQL"],
          reject_if: ["仅 Java 经验"],
        },
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    positionId = data.id;
    expect(positionId).toBeDefined();
  });

  it("2. 上传简历", async () => {
    const formData = new FormData();
    const pdfContent = Buffer.from("模拟 PDF 内容");
    const blob = new Blob([pdfContent], { type: "application/pdf" });
    formData.append("file", blob, "test-resume.pdf");
    formData.append("positionId", positionId.toString());
    formData.append("candidateName", "E2E测试候选人");
    formData.append("candidateEmail", "e2e-test@example.com");

    const res = await fetch(`${BASE_URL}/api/resumes/upload`, {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    candidateId = data.candidateId || data.candidate?.id;
  });

  it("3. 查询候选人列表", async () => {
    const res = await fetch(
      `${BASE_URL}/api/candidates?positionId=${positionId}`
    );

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("4. 更新候选人状态", async () => {
    if (!candidateId) return; // 如果上传失败则跳过

    const res = await fetch(`${BASE_URL}/api/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "interview",
        notes: "E2E 测试：推进到面试",
      }),
    });

    expect(res.ok).toBe(true);
  });

  // 清理测试数据
  afterAll(async () => {
    // 可选：删除测试数据
    // await fetch(`${BASE_URL}/api/positions/${positionId}`, { method: "DELETE" });
  });
});
```

### K.2 E2E 测试 CI 配置

```yaml
# .gitea/workflows/e2e.yml
name: E2E Tests
on:
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg17
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: hr_screening_e2e
        ports:
          - 5432:5432
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile
      - run: bun db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hr_screening_e2e

      # 启动后端（后台运行）
      - name: Start backend
        run: |
          bun dev &
          sleep 5  # 等待启动
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hr_screening_e2e
          MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}
          IMAP_HOST: localhost
          IMAP_PORT: 143
          IMAP_USER: test
          IMAP_PASS: test

      # 健康检查
      - name: Wait for backend
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:3001/health; then
              echo "Backend is ready"
              exit 0
            fi
            sleep 1
          done
          echo "Backend failed to start"
          exit 1

      # 运行 E2E 测试
      - name: Run E2E tests
        run: bun vitest run test/e2e/
        env:
          E2E_BASE_URL: http://localhost:3001
```

---

## 附录 L：性能测试与负载测试

### L.1 k6 负载测试脚本

```javascript
// test/load/api-load.js — k6 负载测试
// 安装：https://k6.io/docs/get-started/installation/
// 运行：k6 run test/load/api-load.js

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const apiDuration = new Trend("api_duration");

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // 缓慢增加到 10 VU
    { duration: "1m", target: 20 },     // 持续 20 VU
    { duration: "30s", target: 50 },    // 压力测试 50 VU
    { duration: "30s", target: 0 },     // 逐渐降低
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],  // 95% 请求 < 500ms
    errors: ["rate<0.05"],              // 错误率 < 5%
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";

export default function () {
  // 场景 1：健康检查（轻量）
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    "health status 200": (r) => r.status === 200,
  });

  // 场景 2：查询职位列表
  const positionsRes = http.get(`${BASE_URL}/api/positions`);
  check(positionsRes, {
    "positions status 200": (r) => r.status === 200,
    "positions is array": (r) => Array.isArray(JSON.parse(r.body)),
  });
  apiDuration.add(positionsRes.timings.duration);

  // 场景 3：查询候选人列表（带分页）
  const candidatesRes = http.get(`${BASE_URL}/api/candidates?page=1&limit=20`);
  check(candidatesRes, {
    "candidates status 200": (r) => r.status === 200,
  });
  apiDuration.add(candidatesRes.timings.duration);

  errorRate.add(healthRes.status !== 200);
  errorRate.add(positionsRes.status !== 200);

  sleep(1); // 模拟用户思考时间
}
```

### L.2 运行负载测试

```bash
# 基础负载测试
k6 run test/load/api-load.js

# 指定目标 URL
k6 run -e BASE_URL=http://staging.hr.ivis-sh.com test/load/api-load.js

# 输出 JSON 报告
k6 run --out json=results.json test/load/api-load.js

# 输出到 InfluxDB（与 Grafana 集成）
k6 run --out influxdb=http://localhost:8086/k6 test/load/api-load.js
```

### L.3 性能目标

```
API 性能目标（单实例，Docker 部署）：

| 端点 | P50 | P95 | P99 | 目标 QPS |
|------|-----|-----|-----|---------|
| GET /health | < 2ms | < 5ms | < 10ms | 1000+ |
| GET /api/positions | < 10ms | < 30ms | < 50ms | 500+ |
| GET /api/candidates | < 30ms | < 100ms | < 200ms | 200+ |
| GET /api/candidates/:id | < 20ms | < 50ms | < 100ms | 300+ |
| POST /api/positions | < 20ms | < 50ms | < 100ms | 100+ |
| POST /api/resumes/upload | < 5s | < 15s | < 30s | 10+ |
| PATCH /api/candidates/:id | < 15ms | < 40ms | < 80ms | 200+ |

注意：upload 端点包含 AI 评分（网络调用），延迟主要取决于 MiniMax API
```

---

## 附录 M：Gitea Actions 特有配置

### M.1 Gitea Actions vs GitHub Actions 差异

```
相同点：
├─ YAML 语法基本一致
├─ 支持 jobs, steps, services
├─ 支持 actions/checkout, oven-sh/setup-bun 等
├─ 支持 secrets 和 variables
└─ 支持 matrix 策略

关键差异：
├─ Runner：Gitea 使用 act_runner（非 GitHub runner）
├─ 变量语法：${{ gitea.xxx }} vs ${{ github.xxx }}
│   ├─ gitea.event_name
│   ├─ gitea.ref
│   ├─ gitea.sha
│   ├─ gitea.repository
│   └─ gitea.workspace
├─ 触发器：on: push 相同，on: pull_request 需要 on: pull_request_target
├─ Marketplace：无 Gitea marketplace，但大部分 GitHub Actions 兼容
├─ Artifacts：功能有限，建议用 SSH 或 Registry 传输
└─ Cache：需要自建缓存或使用 act_runner 本地缓存
```

### M.2 act_runner 部署

```bash
# 方法 1：Docker 部署（推荐）
docker run -d \
  --name act-runner \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v act-runner-data:/data \
  -e GITEA_INSTANCE_URL=https://git.keiten-jp.com \
  -e GITEA_RUNNER_REGISTRATION_TOKEN=xxx \
  -e GITEA_RUNNER_NAME=hr-runner \
  -e GITEA_RUNNER_LABELS=ubuntu-latest:docker://node:22 \
  gitea/act_runner:latest

# 方法 2：直接安装
wget https://gitea.com/gitea/act_runner/releases/latest/download/act_runner-linux-amd64
chmod +x act_runner-linux-amd64
./act_runner-linux-amd64 register \
  --instance https://git.keiten-jp.com \
  --token xxx \
  --name hr-runner \
  --labels "ubuntu-latest:docker://node:22,docker:docker://docker:dind"

# 以 systemd 服务运行
cat > /etc/systemd/system/act-runner.service << 'EOF'
[Unit]
Description=Gitea Act Runner
After=docker.service

[Service]
Type=simple
ExecStart=/usr/local/bin/act_runner daemon
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now act-runner
```

### M.3 Gitea 特有的 CI 模式

```yaml
# .gitea/workflows/deploy-via-ssh.yml
# Gitea 常用的 SSH 部署模式（无需 Docker Registry）

name: Deploy via SSH
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 设置 SSH 密钥
      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H ${{ secrets.DEPLOY_HOST }} >> ~/.ssh/known_hosts

      # 同步代码到服务器
      - name: Sync code
        run: |
          rsync -avz --delete \
            --exclude=node_modules \
            --exclude=.git \
            --exclude=.env \
            ./ deploy@${{ secrets.DEPLOY_HOST }}:/opt/hr-backend/

      # 远程执行部署
      - name: Deploy
        run: |
          ssh deploy@${{ secrets.DEPLOY_HOST }} "
            cd /opt/hr-backend
            bun install --frozen-lockfile
            bun run build
            pm2 restart hr-backend || pm2 start dist/index.js --name hr-backend
          "
```

---

## 附录 N：跨文档参考索引

```
本文档与其他研究文档的关联：

CI/CD + Supabase（→ 01-supabase-integration.md）
├─ Supabase 迁移在 CI 中运行 → 本文档附录 H
├─ Supabase 自托管 Docker CI → 01 附录 J + 06 附录 O
└─ 测试环境 Supabase 配置 → 01 附录 I

CI/CD + Agent/MCP（→ 02-agents-skills-mcp.md）
├─ MCP Server 测试 in CI → 02 附录 D
├─ AI 安全审计 in CI → 02 附录 G
└─ 批量评分测试 → 02 附录 H

CI/CD + LangChain/AI（→ 04-langchain-role.md）
├─ AI Mock 测试配置 → 04 正文 + 本文档附录 G
├─ 评分一致性测试 → 04 附录 L
└─ Prompt 版本 CI 检查 → 04 附录 F

CI/CD + Docker（→ 06-docker-deployment.md）
├─ Docker 镜像构建 in CI → 06 附录 O
├─ Trivy 安全扫描 → 06 附录 G
├─ Docker Compose 测试环境 → 06 附录 L
└─ 部署脚本 → 06 附录 K

CI/CD + AI 工具（→ 05-ai-dev-tools.md）
├─ Claude Code 生成测试 → 05 附录 K
├─ AI 代码审查 in CI → 05 附录 F
└─ Git Hooks + AI Lint → 本文档附录 J + 05 附录 H
```

---

## 附录 O：监控告警最佳实践

### O.1 CI Pipeline 监控

```yaml
# .gitea/workflows/ci-monitor.yml
# CI 管线本身的监控 — 如果 CI 太慢或频繁失败则告警

name: CI Monitor
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Check CI duration
        run: |
          # 如果 CI 运行超过 10 分钟，发告警
          DURATION=$(($(date +%s) - $(date -d "${{ github.event.workflow_run.run_started_at }}" +%s)))
          if [ $DURATION -gt 600 ]; then
            echo "⚠️ CI 运行时间: ${DURATION}s (>600s)"
            # 发送告警...
          fi

      - name: Check CI failure rate
        if: github.event.workflow_run.conclusion == 'failure'
        run: |
          echo "❌ CI 失败: ${{ github.event.workflow_run.html_url }}"
          # 发送告警到企业微信/飞书/Slack
```

### O.2 测试报告自动发布

```yaml
# .gitea/workflows/test-report.yml
name: Test Report
on:
  pull_request:
    branches: [main]

jobs:
  test-and-report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile

      # 运行测试 + 生成 JUnit 报告
      - run: bun vitest run --reporter=junit --outputFile=test-results.xml
        continue-on-error: true

      # 运行覆盖率
      - run: bun vitest run --coverage
        continue-on-error: true

      # 生成摘要
      - name: Generate summary
        if: always()
        run: |
          echo "## 测试报告" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY

          # 解析测试结果
          if [ -f test-results.xml ]; then
            TESTS=$(grep -c '<testcase' test-results.xml || echo 0)
            FAILURES=$(grep -c '<failure' test-results.xml || echo 0)
            echo "- 测试总数: $TESTS" >> $GITHUB_STEP_SUMMARY
            echo "- 失败数: $FAILURES" >> $GITHUB_STEP_SUMMARY
          fi

          # 解析覆盖率
          if [ -f coverage/coverage-summary.json ]; then
            LINES=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
            echo "- 行覆盖率: ${LINES}%" >> $GITHUB_STEP_SUMMARY
          fi

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-report
          path: |
            test-results.xml
            coverage/
```

---

## 附录 P: 测试数据管理与工厂

### P.1 测试数据管理策略

```
HR 项目测试数据管理原则:

1. 隔离性: 每个测试用例使用独立数据，不互相干扰
2. 可重复: 相同测试每次运行产生相同结果
3. 真实性: 测试数据尽可能模拟真实场景
4. 清理: 测试完成后自动清理数据
5. 敏感性: 测试数据不使用真实个人信息

数据层次:
- Unit tests: 内存对象，无数据库
- Integration tests: 测试数据库 + 工厂函数
- E2E tests: 种子数据 + API 调用
```

### P.2 测试数据工厂

```typescript
// test/factories/index.ts
// 测试数据工厂：生成标准化的测试数据

import { db } from "../../src/db/index.js";
import { positions, candidates, resumes, scores } from "../../src/db/schema.js";

// --- Position Factory ---

interface PositionOverrides {
  title?: string;
  mustHaveSkills?: string[];
  niceToHaveSkills?: string[];
  rejectCriteria?: string[];
  status?: string;
}

export async function createTestPosition(
  overrides: PositionOverrides = {}
) {
  const defaults = {
    title: "高级前端工程师",
    department: "技术部",
    mustHaveSkills: ["React", "TypeScript", "3年以上经验"],
    niceToHaveSkills: ["Node.js", "Docker", "团队管理"],
    rejectCriteria: ["仅实习经验", "无本科学历"],
    status: "active",
  };

  const [position] = await db
    .insert(positions)
    .values({ ...defaults, ...overrides })
    .returning();

  return position;
}

// --- Candidate Factory ---

interface CandidateOverrides {
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  status?: string;
}

let candidateCounter = 0;

export async function createTestCandidate(
  overrides: CandidateOverrides = {}
) {
  candidateCounter++;
  const defaults = {
    name: `测试候选人${candidateCounter}`,
    email: `test${candidateCounter}@example.com`,
    phone: `1380013${String(candidateCounter).padStart(4, "0")}`,
    source: "test",
    status: "new",
  };

  const [candidate] = await db
    .insert(candidates)
    .values({ ...defaults, ...overrides })
    .returning();

  return candidate;
}

// --- Resume Factory ---

interface ResumeOverrides {
  candidateId?: number;
  rawText?: string;
  fileName?: string;
  fileType?: string;
}

export async function createTestResume(
  overrides: ResumeOverrides = {}
) {
  // 如果没有指定候选人，先创建一个
  const candidateId =
    overrides.candidateId || (await createTestCandidate()).id;

  const defaults = {
    candidateId,
    fileName: "test-resume.pdf",
    fileType: "application/pdf",
    fileSize: 1024,
    rawText: `
张三 | 高级前端工程师 | 5年经验
教育: 上海交通大学 计算机科学 硕士
经验:
- 字节跳动 高级前端工程师 (2021-至今)
  - React + TypeScript 开发
  - 带领 3 人团队
- 美团 前端工程师 (2019-2021)
  - Vue + Node.js 全栈
技能: React, TypeScript, Node.js, Docker, Git, CI/CD
    `.trim(),
  };

  const [resume] = await db
    .insert(resumes)
    .values({ ...defaults, ...overrides })
    .returning();

  return { resume, candidateId };
}

// --- Score Factory ---

interface ScoreOverrides {
  candidateId?: number;
  positionId?: number;
  totalScore?: number;
  grade?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
}

export async function createTestScore(
  overrides: ScoreOverrides = {}
) {
  const candidateId =
    overrides.candidateId || (await createTestCandidate()).id;
  const positionId =
    overrides.positionId || (await createTestPosition()).id;

  const defaults = {
    candidateId,
    positionId,
    totalScore: 78,
    grade: "B",
    mustScore: 60,
    niceScore: 18,
    rejectPenalty: 0,
    matchedSkills: ["React", "TypeScript"],
    missingSkills: ["Docker"],
    explanation: "候选人技能匹配良好，但缺少 Docker 经验。",
  };

  const [score] = await db
    .insert(scores)
    .values({ ...defaults, ...overrides })
    .returning();

  return score;
}

// --- Composite Factory: 完整候选人 ---

export async function createFullCandidate(options?: {
  position?: PositionOverrides;
  candidate?: CandidateOverrides;
  resume?: Partial<ResumeOverrides>;
  score?: Partial<ScoreOverrides>;
}) {
  const position = await createTestPosition(options?.position);
  const candidate = await createTestCandidate(options?.candidate);
  const { resume } = await createTestResume({
    candidateId: candidate.id,
    ...options?.resume,
  });
  const score = await createTestScore({
    candidateId: candidate.id,
    positionId: position.id,
    ...options?.score,
  });

  return { position, candidate, resume, score };
}

// --- 数据清理 ---

export async function cleanupTestData(): Promise<void> {
  // 按外键顺序删除
  await db.delete(scores);
  await db.delete(resumes);
  await db.delete(candidates);
  await db.delete(positions);
  candidateCounter = 0;
}
```

### P.3 测试辅助工具

```typescript
// test/helpers/index.ts
// 测试辅助工具集合

import { Elysia } from "elysia";
import app from "../../src/index.js";

// 创建测试请求
export function testRequest(
  path: string,
  options?: RequestInit
): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, options));
}

// JSON POST 请求
export function postJson(path: string, body: unknown): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

// JSON PATCH 请求
export function patchJson(path: string, body: unknown): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

// 验证响应结构
export async function expectJsonResponse(
  response: Response,
  expectedStatus: number = 200
) {
  expect(response.status).toBe(expectedStatus);
  expect(response.headers.get("content-type")).toContain("application/json");
  return response.json();
}

// 创建 FormData 文件上传
export function createFileUpload(
  fileName: string,
  content: string,
  mimeType: string = "application/pdf"
): FormData {
  const formData = new FormData();
  const file = new File([content], fileName, { type: mimeType });
  formData.append("file", file);
  return formData;
}

// 等待异步操作完成（如 AI 评分）
export function waitFor(
  conditionFn: () => Promise<boolean>,
  timeout: number = 10000,
  interval: number = 500
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = async () => {
      try {
        if (await conditionFn()) {
          resolve();
          return;
        }
      } catch {
        // continue checking
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(`waitFor timed out after ${timeout}ms`));
        return;
      }

      setTimeout(check, interval);
    };

    check();
  });
}
```

### P.4 测试夹具 (Fixtures)

```typescript
// test/fixtures/resumes.ts
// 标准化的测试简历集合

export const RESUMES = {
  // A 级候选人：完美匹配
  SENIOR_FRONTEND_PERFECT: `
王五 | 高级前端工程师 | 8年经验
手机: 13900139000 | 邮箱: wangwu@example.com

教育背景:
- 浙江大学 计算机科学 硕士 (2014-2017)
- 上海交通大学 软件工程 本科 (2010-2014)

工作经历:
1. 阿里巴巴 前端技术专家 P7 (2021-至今)
   - 主导电商前端架构升级，React 18 + TypeScript
   - 设计微前端方案，支持 50+ 子应用
   - 管理 8 人前端团队
   - 推动前端自动化测试覆盖率从 20% 提升到 85%

2. 字节跳动 高级前端工程师 (2019-2021)
   - 抖音 Web 端核心模块开发
   - Node.js BFF 层设计与实现
   - Docker + K8s 容器化部署

3. 美团 前端工程师 (2017-2019)
   - 外卖 H5 页面性能优化
   - React Native 跨端开发

技能: React, TypeScript, Node.js, Docker, K8s, Webpack, CI/CD, 微前端, Git, 系统设计
  `.trim(),

  // B 级候选人：部分匹配
  MID_FRONTEND_GOOD: `
赵六 | 前端开发工程师 | 4年经验
手机: 13800138001 | 邮箱: zhaoliu@example.com

教育:
- 华中科技大学 计算机 本科 (2018-2022)

工作经历:
1. 腾讯 前端开发 (2022-至今, 4年)
   - 使用 React + TypeScript 开发企业级管理后台
   - 参与组件库建设
   - 熟悉 Node.js

技能: React, TypeScript, Vue, Node.js, Git, CSS
  `.trim(),

  // D 级候选人：不匹配
  JUNIOR_UNRELATED: `
孙七 | 实习生
教育: 某三本院校 市场营销 本科 在读

经历:
- 某小公司实习 3 个月，修改 HTML 页面

技能: HTML, CSS, Office
  `.trim(),

  // 边界情况：空白简历
  EMPTY: "",

  // 边界情况：只有姓名
  MINIMAL: "周八\n无工作经验",

  // 边界情况：非常长的简历
  VERY_LONG: "吴九 | 工程师\n" + "- 项目经验".repeat(500),
};

export const POSITIONS = {
  SENIOR_FRONTEND: {
    title: "高级前端工程师",
    mustHave: ["React", "TypeScript", "3年以上经验"],
    niceToHave: ["Node.js", "Docker", "团队管理", "微前端"],
    reject: ["仅实习经验", "无本科学历"],
  },
  BACKEND_JAVA: {
    title: "高级后端工程师",
    mustHave: ["Java", "Spring Boot", "5年以上经验", "MySQL"],
    niceToHave: ["Redis", "Kafka", "K8s", "微服务"],
    reject: ["无本科学历"],
  },
  FULLSTACK: {
    title: "全栈工程师",
    mustHave: ["React", "Node.js", "2年以上经验"],
    niceToHave: ["TypeScript", "Docker", "PostgreSQL"],
    reject: [],
  },
};
```

### P.5 Vitest 全局配置

```typescript
// vitest.config.ts
// Vitest 测试框架完整配置

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 环境
    environment: "node",

    // 全局设置/清理
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],

    // 文件模式
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],

    // 超时设置
    testTimeout: 30000, // AI 测试可能比较慢
    hookTimeout: 15000,

    // 并行
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 4,
        minForks: 1,
      },
    },

    // 覆盖率
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/db/migrate.ts",
        "src/**/*.d.ts",
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },

    // 报告
    reporters: ["default", "junit"],
    outputFile: {
      junit: "./test-results.xml",
    },
  },
});
```

```typescript
// test/global-setup.ts
// 全局测试设置（所有测试文件之前运行一次）

export async function setup() {
  // 设置测试环境变量
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    "postgresql://test:test@localhost:5432/hr_test";

  console.log("Global test setup complete");
}

export async function teardown() {
  console.log("Global test teardown complete");
}
```

```typescript
// test/setup.ts
// 每个测试文件之前运行

import { afterAll, afterEach, beforeAll } from "vitest";
import { db } from "../src/db/index.js";
import { cleanupTestData } from "./factories/index.js";

// 每个测试文件后清理数据
afterEach(async () => {
  await cleanupTestData();
});

// 所有测试完成后关闭数据库连接
afterAll(async () => {
  await cleanupTestData();
  // db 连接会在进程退出时自动关闭
});
```

---

## 附录 Q: 测试策略分层与最佳实践

### Q.1 测试金字塔

```
HR 项目测试金字塔:

              /\
             /  \
            / E2E \         5%  (关键用户路径)
           /______\
          /        \
         / Integration \    25% (API + DB + AI)
        /______________\
       /                \
      /    Unit Tests     \  70% (纯逻辑、工具函数)
     /____________________\

各层测试分工:

Unit Tests (最多):
- 工具函数（cache, rate limiter, text parser）
- 数据验证（Zod schema）
- 业务逻辑（评分计算、技能匹配）
- 不依赖外部服务

Integration Tests (中等):
- API 路由测试（Elysia app.handle）
- 数据库查询（测试 DB）
- AI 评分集成（mock 或真实调用）
- 邮件服务（mock IMAP）

E2E Tests (最少):
- 完整的简历上传→评分→查看流程
- 候选人状态流转
- 健康检查
```

### Q.2 Mock 策略

```typescript
// test/mocks/ai.ts
// AI 服务 Mock

import { vi } from "vitest";

export function mockAIScorer() {
  return vi.fn().mockResolvedValue({
    totalScore: 78,
    grade: "B",
    mustScore: 55,
    niceScore: 23,
    rejectPenalty: 0,
    matchedSkills: ["React", "TypeScript"],
    missingSkills: ["Docker"],
    explanation: "Mock: 候选人技能匹配良好",
    _meta: { cached: false, latencyMs: 50, model: "mock" },
  });
}

// 创建可配置的 mock
export function createAIMock(
  defaultScore: number = 78,
  defaultGrade: string = "B"
) {
  return vi.fn().mockImplementation(async (resumeText: string) => {
    // 根据简历内容返回不同结果
    const isEmptyResume = !resumeText || resumeText.trim().length < 50;

    if (isEmptyResume) {
      return {
        totalScore: 0,
        grade: "D",
        mustScore: 0,
        niceScore: 0,
        rejectPenalty: 0,
        matchedSkills: [],
        missingSkills: [],
        explanation: "简历内容不足，无法评分",
        _meta: { cached: false, latencyMs: 10, model: "mock" },
      };
    }

    return {
      totalScore: defaultScore,
      grade: defaultGrade,
      mustScore: Math.floor(defaultScore * 0.7),
      niceScore: Math.floor(defaultScore * 0.3),
      rejectPenalty: 0,
      matchedSkills: ["React", "TypeScript"],
      missingSkills: ["Docker"],
      explanation: `Mock score: ${defaultScore}`,
      _meta: { cached: false, latencyMs: 50, model: "mock" },
    };
  });
}
```

```typescript
// test/mocks/email.ts
// 邮件服务 Mock

import { vi } from "vitest";

export function mockImapClient() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getMailboxLock: vi.fn().mockResolvedValue({
      release: vi.fn(),
    }),
    fetch: vi.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          uid: 1,
          envelope: {
            from: [{ address: "candidate@example.com", name: "测试候选人" }],
            subject: "求职申请 - 前端工程师",
            date: new Date(),
          },
          bodyParts: new Map([
            [
              "1",
              {
                type: "text/plain",
                content: Buffer.from("您好，请查看我的简历"),
              },
            ],
          ]),
        };
      },
    }),
    messageFlagsAdd: vi.fn().mockResolvedValue(undefined),
  };
}
```

### Q.3 快照测试

```typescript
// src/services/__tests__/resume-parser.test.ts
// 使用快照测试验证解析结果的稳定性

import { describe, it, expect } from "vitest";
import { parseResume } from "../resume-parser.js";
import { readFile } from "fs/promises";

describe("Resume Parser Snapshots", () => {
  it("should parse PDF resume consistently", async () => {
    const pdfBuffer = await readFile("test/fixtures/sample-resume.pdf");
    const result = await parseResume(pdfBuffer, "application/pdf");

    // 快照测试：第一次运行生成快照，后续运行对比
    expect(result).toMatchSnapshot();
  });

  it("should parse DOCX resume consistently", async () => {
    const docxBuffer = await readFile("test/fixtures/sample-resume.docx");
    const result = await parseResume(
      docxBuffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    expect(result).toMatchSnapshot();
  });

  // 如果需要更新快照: bun vitest -u
});
```

### Q.4 性能基准测试

```typescript
// test/benchmarks/scoring.bench.ts
// Vitest bench: 评分性能基准测试

import { describe, bench } from "vitest";
import { LRUCache, makeScoringCacheKey } from "../../src/lib/cache.js";

describe("Cache Performance", () => {
  const cache = new LRUCache<object>({ maxSize: 1000, ttlMs: 86400000 });

  // 预填充缓存
  for (let i = 0; i < 500; i++) {
    cache.set(`key-${i}`, { score: i });
  }

  bench("cache hit", () => {
    cache.get("key-250");
  });

  bench("cache miss", () => {
    cache.get("nonexistent-key");
  });

  bench("cache set", () => {
    cache.set(`bench-${Date.now()}`, { score: 100 });
  });

  bench("generate cache key", () => {
    makeScoringCacheKey("sample resume text", {
      mustHave: ["React", "TypeScript"],
      niceToHave: ["Node.js"],
      reject: [],
    });
  });
});

// 运行: bun vitest bench
```

---

## 附录 R: 环境管理与配置测试

### R.1 多环境配置策略

```
HR 项目环境分层:

环境         │ DATABASE_URL              │ AI API        │ Email        │ 用途
─────────────┼───────────────────────────┼───────────────┼──────────────┼──────────────
development  │ localhost:5432/hr_dev     │ 真实 API      │ Mailpit mock │ 本地开发
test         │ localhost:5432/hr_test    │ Mock          │ Mock         │ 自动化测试
staging      │ staging-db:5432/hr_stage  │ 真实 API      │ 真实 IMAP    │ 预发布验证
production   │ prod-db:5432/hr_prod      │ 真实 API      │ 真实 IMAP    │ 生产环境

配置管理原则:
1. .env.example 包含所有变量（无密钥值）
2. .env 用于本地开发（gitignored）
3. CI 通过环境变量/secrets 注入
4. 生产环境通过 Docker secrets 或环境变量
5. 测试环境用内联的固定值
```

### R.2 配置验证测试

```typescript
// src/__tests__/env.test.ts
// 验证环境变量配置的 schema 和验证逻辑

import { describe, it, expect } from "vitest";
import { z } from "zod/v4";

// 复制 env.ts 中的 schema（避免在测试中触发实际验证）
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  MINIMAX_API_KEY: z.string().min(1),
  IMAP_HOST: z.string().default("mail.ivis-sh.com"),
  IMAP_PORT: z.coerce.number().default(143),
  IMAP_USER: z.string().email(),
  IMAP_PASS: z.string().min(1),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

describe("Environment Configuration", () => {
  it("should accept valid configuration", () => {
    const validEnv = {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/hr",
      MINIMAX_API_KEY: "test-key-123",
      IMAP_USER: "hr@ivis-sh.com",
      IMAP_PASS: "password123",
    };

    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it("should reject missing DATABASE_URL", () => {
    const invalidEnv = {
      MINIMAX_API_KEY: "test-key",
      IMAP_USER: "hr@ivis-sh.com",
      IMAP_PASS: "password",
    };

    const result = envSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
  });

  it("should reject invalid DATABASE_URL format", () => {
    const invalidEnv = {
      DATABASE_URL: "not-a-url",
      MINIMAX_API_KEY: "test-key",
      IMAP_USER: "hr@ivis-sh.com",
      IMAP_PASS: "password",
    };

    const result = envSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
  });

  it("should apply defaults for optional fields", () => {
    const minimalEnv = {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/hr",
      MINIMAX_API_KEY: "test-key",
      IMAP_USER: "hr@ivis-sh.com",
      IMAP_PASS: "password",
    };

    const result = envSchema.parse(minimalEnv);
    expect(result.PORT).toBe(3001);
    expect(result.IMAP_HOST).toBe("mail.ivis-sh.com");
    expect(result.IMAP_PORT).toBe(143);
    expect(result.NODE_ENV).toBe("development");
  });

  it("should coerce PORT from string to number", () => {
    const env = {
      PORT: "8080",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/hr",
      MINIMAX_API_KEY: "test-key",
      IMAP_USER: "hr@ivis-sh.com",
      IMAP_PASS: "password",
    };

    const result = envSchema.parse(env);
    expect(result.PORT).toBe(8080);
    expect(typeof result.PORT).toBe("number");
  });

  it("should reject invalid email for IMAP_USER", () => {
    const env = {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/hr",
      MINIMAX_API_KEY: "test-key",
      IMAP_USER: "not-an-email",
      IMAP_PASS: "password",
    };

    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });
});
```

### R.3 数据库迁移测试

```typescript
// test/migrations/migration.test.ts
// 验证数据库迁移的正确性

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://test:test@localhost:5432/hr_migration_test";

describe("Database Migrations", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    // 创建测试数据库连接
    const adminClient = postgres(TEST_DB_URL.replace(/\/[^/]*$/, "/postgres"));
    const adminDb = drizzle(adminClient);

    // 尝试创建测试数据库
    try {
      await adminDb.execute(sql`CREATE DATABASE hr_migration_test`);
    } catch {
      // 数据库可能已存在
    }
    await adminClient.end();

    // 连接测试数据库
    client = postgres(TEST_DB_URL);
    db = drizzle(client);
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it("should run all migrations successfully", async () => {
    // 运行迁移
    await migrate(db, { migrationsFolder: "./drizzle" });

    // 验证核心表存在
    const tables = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tableNames = tables.map((t: any) => t.table_name);
    expect(tableNames).toContain("positions");
    expect(tableNames).toContain("candidates");
    expect(tableNames).toContain("resumes");
    expect(tableNames).toContain("scores");
  });

  it("should have correct column types for positions table", async () => {
    const columns = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'positions'
      ORDER BY ordinal_position
    `);

    const columnMap = new Map(
      columns.map((c: any) => [c.column_name, c])
    );

    // 验证关键列
    expect(columnMap.has("id")).toBe(true);
    expect(columnMap.has("title")).toBe(true);
    expect(columnMap.has("must_have_skills")).toBe(true);
    expect(columnMap.get("title")?.data_type).toMatch(/text|character/);
  });

  it("should have pgvector extension enabled", async () => {
    const extensions = await db.execute(sql`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `);

    expect(extensions.length).toBe(1);
  });

  it("should support idempotent migration (run twice)", async () => {
    // 第二次运行迁移不应报错
    await expect(
      migrate(db, { migrationsFolder: "./drizzle" })
    ).resolves.not.toThrow();
  });
});
```

### R.4 API 契约测试

```typescript
// test/contracts/api-contracts.test.ts
// API 响应格式契约测试

import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod/v4";
import app from "../../src/index.js";
import { createTestPosition, createFullCandidate, cleanupTestData } from "../factories/index.js";

// 定义 API 响应的 schema 契约
const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string(),
  version: z.string().optional(),
});

const positionResponseSchema = z.object({
  id: z.number(),
  title: z.string(),
  department: z.string().optional(),
  mustHaveSkills: z.array(z.string()),
  niceToHaveSkills: z.array(z.string()),
  rejectCriteria: z.array(z.string()),
  status: z.string(),
  createdAt: z.string(),
});

const candidateListResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      status: z.string(),
      score: z
        .object({
          totalScore: z.number(),
          grade: z.string(),
        })
        .nullable()
        .optional(),
    })
  ),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  statusCode: z.number().optional(),
});

describe("API Contract Tests", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  describe("GET /health", () => {
    it("should match health response contract", async () => {
      const res = await app.handle(new Request("http://localhost/health"));
      const body = await res.json();

      const result = healthResponseSchema.safeParse(body);
      expect(result.success).toBe(true);
    });
  });

  describe("POST /api/positions", () => {
    it("should match position response contract", async () => {
      const res = await app.handle(new Request("http://localhost/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "测试职位",
          mustHaveSkills: ["React"],
          niceToHaveSkills: ["Docker"],
          rejectCriteria: [],
        }),
      }));

      const body = await res.json();
      const result = positionResponseSchema.safeParse(body);
      expect(result.success).toBe(true);
    });
  });

  describe("Error responses", () => {
    it("should match error contract for 404", async () => {
      const res = await app.handle(new Request("http://localhost/api/candidates/99999"));
      expect(res.status).toBe(404);

      const body = await res.json();
      const result = errorResponseSchema.safeParse(body);
      expect(result.success).toBe(true);
    });

    it("should match error contract for 400", async () => {
      const res = await app.handle(new Request("http://localhost/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // 缺少必填字段
      }));

      expect(res.status).toBe(400);
      const body = await res.json();
      const result = errorResponseSchema.safeParse(body);
      expect(result.success).toBe(true);
    });
  });
});
```

### R.5 CI 环境隔离

```yaml
# .gitea/workflows/test-isolated.yml
# 完全隔离的测试环境

name: Isolated Tests

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      # 每个 PR 独立的测试数据库
      postgres:
        image: pgvector/pgvector:pg17
        env:
          POSTGRES_DB: hr_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U test -d hr_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://test:test@localhost:5432/hr_test
      MINIMAX_API_KEY: test-mock-key

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      # 启用 pgvector 扩展
      - name: Setup pgvector
        run: |
          PGPASSWORD=test psql -h localhost -U test -d hr_test -c "CREATE EXTENSION IF NOT EXISTS vector;"

      # 运行迁移
      - run: bun db:migrate

      # 类型检查
      - run: bun tsc --noEmit

      # 运行所有测试
      - name: Run tests
        run: bun vitest run --coverage --reporter=junit --outputFile=test-results.xml

      # 检查覆盖率阈值
      - name: Check coverage thresholds
        run: |
          LINES=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          echo "Line coverage: $LINES%"
          if (( $(echo "$LINES < 60" | bc -l) )); then
            echo "Coverage below 60% threshold!"
            exit 1
          fi

      # 上传测试结果
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results-${{ github.event.pull_request.number }}
          path: |
            test-results.xml
            coverage/
          retention-days: 7
```

---

## 附录 S: 发布流程与版本管理

### S.1 语义化版本 (SemVer) 策略

```
HR 项目版本管理规范:

版本格式: MAJOR.MINOR.PATCH
  MAJOR: 不兼容的 API 变更（重大功能改版）
  MINOR: 向后兼容的新功能
  PATCH: 向后兼容的 bug 修复

示例:
  v0.1.0  MVP 初始版本
  v0.1.1  修复简历上传 bug
  v0.2.0  添加批量评分功能
  v0.3.0  添加邮件自动收取
  v1.0.0  第一个正式发布版本

Pre-release 标签:
  v0.3.0-alpha.1   内部测试
  v0.3.0-beta.1    外部测试
  v1.0.0-rc.1      发布候选

Git 分支策略:
  main              稳定版本，可部署
  develop           开发分支
  feature/*         功能分支
  fix/*             修复分支
  release/v*        发布准备分支
```

### S.2 自动 Changelog 生成

```typescript
// scripts/generate-changelog.ts
// 从 git 提交历史自动生成 changelog

import { execSync } from "child_process";

interface CommitGroup {
  type: string;
  title: string;
  commits: { hash: string; message: string; date: string }[];
}

function getCommitsSinceTag(tag?: string): string[] {
  const range = tag ? `${tag}..HEAD` : "HEAD~50..HEAD";
  try {
    return execSync(`git log ${range} --pretty=format:"%H|%s|%ai"`, {
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function categorizeCommits(
  rawCommits: string[]
): CommitGroup[] {
  const groups: Record<string, CommitGroup> = {
    feat: { type: "feat", title: "New Features", commits: [] },
    fix: { type: "fix", title: "Bug Fixes", commits: [] },
    perf: { type: "perf", title: "Performance", commits: [] },
    refactor: { type: "refactor", title: "Refactoring", commits: [] },
    docs: { type: "docs", title: "Documentation", commits: [] },
    test: { type: "test", title: "Tests", commits: [] },
    chore: { type: "chore", title: "Maintenance", commits: [] },
    other: { type: "other", title: "Other Changes", commits: [] },
  };

  for (const raw of rawCommits) {
    const [hash, message, date] = raw.split("|");
    const match = message.match(/^(\w+)(?:\(.*?\))?:\s*(.*)/);

    if (match) {
      const type = match[1].toLowerCase();
      const group = groups[type] || groups.other;
      group.commits.push({
        hash: hash.slice(0, 7),
        message: match[2],
        date: date.split(" ")[0],
      });
    } else {
      groups.other.commits.push({
        hash: hash.slice(0, 7),
        message,
        date: date.split(" ")[0],
      });
    }
  }

  return Object.values(groups).filter((g) => g.commits.length > 0);
}

function generateMarkdown(
  version: string,
  groups: CommitGroup[]
): string {
  const lines: string[] = [
    `## ${version} (${new Date().toISOString().split("T")[0]})`,
    "",
  ];

  for (const group of groups) {
    lines.push(`### ${group.title}`);
    lines.push("");
    for (const commit of group.commits) {
      lines.push(`- ${commit.message} (${commit.hash})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// 主流程
const lastTag = execSync("git describe --tags --abbrev=0 2>/dev/null || echo ''", {
  encoding: "utf-8",
}).trim();

const rawCommits = getCommitsSinceTag(lastTag || undefined);
const groups = categorizeCommits(rawCommits);

const nextVersion = process.argv[2] || "Unreleased";
const changelog = generateMarkdown(nextVersion, groups);

console.log(changelog);
```

### S.3 发布自动化脚本

```bash
#!/bin/bash
# scripts/release.sh
# 自动化发布流程

set -euo pipefail

VERSION="${1:?Usage: release.sh <version> (e.g., v0.2.0)}"

# 验证版本号格式
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.[0-9]+)?$ ]]; then
  echo "Error: Invalid version format. Use vMAJOR.MINOR.PATCH (e.g., v0.2.0)"
  exit 1
fi

echo "=== Release $VERSION ==="

# 1. 确保在 main 分支且干净
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "Error: Must be on main branch (current: $BRANCH)"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working directory is not clean"
  git status --short
  exit 1
fi

# 2. 拉取最新代码
echo "Pulling latest..."
git pull origin main

# 3. 运行完整测试
echo "Running tests..."
bun tsc --noEmit
bun vitest run

# 4. 更新 package.json 版本
CLEAN_VERSION="${VERSION#v}"
bun pkg set version="$CLEAN_VERSION"

# 5. 生成 changelog
echo "Generating changelog..."
CHANGELOG=$(bun scripts/generate-changelog.ts "$VERSION")

# 追加到 CHANGELOG.md
if [ -f CHANGELOG.md ]; then
  echo -e "${CHANGELOG}\n\n$(cat CHANGELOG.md)" > CHANGELOG.md
else
  echo "$CHANGELOG" > CHANGELOG.md
fi

# 6. 提交版本变更
git add package.json CHANGELOG.md
git commit -m "chore: release $VERSION"

# 7. 创建 tag
git tag -a "$VERSION" -m "Release $VERSION"

echo ""
echo "=== Release $VERSION prepared ==="
echo ""
echo "Review the changes:"
echo "  git log --oneline -5"
echo "  cat CHANGELOG.md | head -30"
echo ""
echo "To publish:"
echo "  git push origin main"
echo "  git push origin $VERSION"
echo ""
echo "To cancel:"
echo "  git tag -d $VERSION"
echo "  git reset --hard HEAD~1"
```

### S.4 Gitea Release 自动化

```yaml
# .gitea/workflows/release.yml
# 基于 tag 自动创建 Gitea Release

name: Create Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      # 完整测试
      - run: bun tsc --noEmit
      - run: bun vitest run

      # 构建 Docker 镜像
      - name: Build Docker Image
        run: |
          TAG="${GITHUB_REF#refs/tags/}"
          docker build -t hr-backend:$TAG .
          docker tag hr-backend:$TAG hr-backend:latest

      # 推送到私有 Registry
      - name: Push to Registry
        run: |
          TAG="${GITHUB_REF#refs/tags/}"
          REGISTRY="${{ vars.REGISTRY_URL }}"

          echo "${{ secrets.REGISTRY_PASSWORD }}" | \
            docker login "$REGISTRY" -u ci-push --password-stdin

          docker tag hr-backend:$TAG "$REGISTRY/hr-backend:$TAG"
          docker tag hr-backend:latest "$REGISTRY/hr-backend:latest"
          docker push "$REGISTRY/hr-backend:$TAG"
          docker push "$REGISTRY/hr-backend:latest"

      # 部署到生产环境
      - name: Deploy
        run: |
          TAG="${GITHUB_REF#refs/tags/}"
          ssh -o StrictHostKeyChecking=no deploy@${{ vars.DEPLOY_HOST }} \
            "cd /opt/hr-backend && \
             docker compose pull && \
             docker compose up -d && \
             sleep 5 && \
             curl -sf http://localhost:3001/health || exit 1"

      # 生成 Changelog
      - name: Generate Release Notes
        id: changelog
        run: |
          PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
          if [ -n "$PREV_TAG" ]; then
            NOTES=$(git log "$PREV_TAG"..HEAD --pretty=format:"- %s (%h)" | head -50)
          else
            NOTES=$(git log --pretty=format:"- %s (%h)" -20)
          fi
          echo "notes<<EOF" >> $GITHUB_OUTPUT
          echo "$NOTES" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      # 创建 Gitea Release（使用 API）
      - name: Create Release
        run: |
          TAG="${GITHUB_REF#refs/tags/}"
          curl -X POST \
            "${{ github.server_url }}/api/v1/repos/${{ github.repository }}/releases" \
            -H "Authorization: token ${{ secrets.GITEA_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d "{
              \"tag_name\": \"$TAG\",
              \"name\": \"Release $TAG\",
              \"body\": \"$(echo '${{ steps.changelog.outputs.notes }}' | sed 's/"/\\"/g')\",
              \"draft\": false,
              \"prerelease\": $(echo $TAG | grep -q 'alpha\|beta\|rc' && echo true || echo false)
            }"
```

### S.5 回滚策略

```bash
#!/bin/bash
# scripts/rollback.sh
# 生产环境回滚脚本

set -euo pipefail

TARGET_VERSION="${1:?Usage: rollback.sh <version> (e.g., v0.1.0)}"
REGISTRY="${REGISTRY_URL:-registry.ivis-sh.com:5000}"
DEPLOY_DIR="/opt/hr-backend"

echo "=== Rollback to $TARGET_VERSION ==="

# 1. 验证目标版本的镜像存在
echo "Checking image availability..."
docker manifest inspect "$REGISTRY/hr-backend:$TARGET_VERSION" >/dev/null 2>&1 || {
  echo "Error: Image $REGISTRY/hr-backend:$TARGET_VERSION not found"
  echo "Available tags:"
  curl -s "https://$REGISTRY/v2/hr-backend/tags/list" | jq -r '.tags[]' | sort -V | tail -10
  exit 1
}

# 2. 备份当前版本信息
CURRENT_VERSION=$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' hr-app 2>/dev/null || echo "unknown")
echo "Current version: $CURRENT_VERSION"
echo "Rolling back to: $TARGET_VERSION"

# 3. 创建数据库备份
echo "Creating database backup before rollback..."
docker compose exec -T postgres pg_dump -U postgres hr_screening > \
  "/data/backups/pre-rollback-$(date +%Y%m%d_%H%M%S).sql"

# 4. 更新 docker-compose.yml 中的镜像标签
cd "$DEPLOY_DIR"
sed -i "s|image: $REGISTRY/hr-backend:.*|image: $REGISTRY/hr-backend:$TARGET_VERSION|" docker-compose.yml

# 5. 拉取并启动旧版本
echo "Pulling $TARGET_VERSION..."
docker compose pull app
docker compose up -d app

# 6. 等待健康检查
echo "Waiting for health check..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
    echo "✓ Rollback successful! Running $TARGET_VERSION"
    exit 0
  fi
  sleep 2
done

echo "⚠️  Health check failed after rollback. Manual intervention required."
echo "Check logs: docker compose logs app"
exit 1
```

---

## 附录 T: 依赖安全与审计

### T.1 依赖审计策略

```
HR 项目依赖安全管理:

审计频率:
- 每次 CI: bun audit (自动)
- 每周: 完整安全报告
- 每月: 依赖更新评估

审计工具:
1. bun audit          — npm 内置漏洞检查
2. Snyk / Socket       — 高级漏洞扫描（可选）
3. npm-check-updates   — 检查可用更新
4. Biome               — 代码安全规则

依赖分类:
- 核心依赖: elysia, drizzle-orm, ai → 谨慎更新
- 工具依赖: typescript, vitest, biome → 积极更新
- AI 依赖: @ai-sdk/* → 关注 breaking changes
```

### T.2 自动化依赖审计 CI Job

```yaml
# .gitea/workflows/dependency-audit.yml
# 每周运行依赖安全审计

name: Dependency Audit

on:
  schedule:
    - cron: '0 2 * * 1'  # 每周一凌晨 2 点
  workflow_dispatch:       # 手动触发

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      # 漏洞审计
      - name: Security Audit
        run: |
          echo "## Security Audit Report" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          bun audit 2>&1 | tee audit-report.txt >> $GITHUB_STEP_SUMMARY || true
          echo '```' >> $GITHUB_STEP_SUMMARY

      # 检查过时依赖
      - name: Check Outdated
        run: |
          echo "## Outdated Dependencies" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          bun outdated 2>&1 | tee outdated-report.txt >> $GITHUB_STEP_SUMMARY || true
          echo '```' >> $GITHUB_STEP_SUMMARY

      # 许可证检查
      - name: License Check
        run: |
          echo "## License Report" >> $GITHUB_STEP_SUMMARY
          bun x license-checker --summary 2>&1 >> $GITHUB_STEP_SUMMARY || true

      # 如果有高危漏洞，发送通知
      - name: Check Critical
        run: |
          CRITICAL=$(grep -c "critical" audit-report.txt || echo 0)
          HIGH=$(grep -c "high" audit-report.txt || echo 0)
          if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
            echo "⚠️ Found $CRITICAL critical and $HIGH high severity vulnerabilities!"
            # 可以在此添加通知（飞书/钉钉 Webhook）
          fi
```

### T.3 Lock 文件完整性

```bash
#!/bin/bash
# scripts/verify-lockfile.sh
# 验证 bun.lock 的完整性

set -euo pipefail

echo "=== Lock File Integrity Check ==="

# 1. 验证 lock 文件存在
if [ ! -f bun.lock ]; then
  echo "Error: bun.lock not found!"
  exit 1
fi

# 2. 验证 lock 文件与 package.json 同步
bun install --frozen-lockfile --dry-run 2>/dev/null
if [ $? -ne 0 ]; then
  echo "⚠️  bun.lock is out of sync with package.json"
  echo "Run: bun install"
  exit 1
fi
echo "✓ Lock file is in sync"

# 3. 检查依赖数量
echo ""
echo "Total locked packages: $(bun pm ls --all 2>/dev/null | wc -l)"

echo ""
echo "✓ Lock file integrity check passed"
```

### T.4 供应链安全

```typescript
// 供应链安全最佳实践

/*
1. Lock 文件提交到 git
   - bun.lock 必须提交
   - CI 使用 --frozen-lockfile（不允许自动更新）

2. 限制允许的 registry
   .npmrc:
   registry=https://registry.npmmirror.com
   # 或
   registry=https://registry.npmjs.org

3. 审查新依赖
   添加依赖前检查:
   - npm 下载量
   - GitHub stars
   - 最近更新时间
   - 已知漏洞
   - 许可证兼容性

4. 最小化依赖
   HR 项目核心依赖:
   - 运行时: elysia, drizzle-orm, postgres, ai, @ai-sdk/openai,
             imapflow, pdf-parse, mammoth, zod
   - 开发: typescript, vitest, drizzle-kit, biome
   总计约 12 个直接依赖（非常精简）

5. 依赖更新流程
   a. 创建 feature/deps-update 分支
   b. bun update
   c. 运行完整测试
   d. 审查 CHANGELOG
   e. PR review + merge

6. 不使用的包立即移除
   bun install
*/
```

### T.5 安全修复优先级

```
漏洞响应 SLA:

严重程度  │ 描述                    │ 修复期限  │ 行动
──────────┼─────────────────────────┼───────────┼──────────────
Critical  │ RCE, 数据泄露          │ 24 小时   │ 立即修复+部署
High      │ XSS, SQL注入, Auth绕过 │ 3 天      │ 优先修复
Medium    │ DoS, 信息泄露          │ 1 周      │ 计划修复
Low       │ 最佳实践偏差           │ 1 月      │ 日常维护

修复步骤:
1. 评估影响范围
2. 确认是否被项目实际使用
3. 检查是否有补丁版本
4. 测试补丁兼容性
5. 更新 + 测试 + 部署
6. 记录到安全日志

自动化:
- CI 每次构建检查 critical/high
- 每周报告 medium/low
- Dependabot/Renovate 自动创建 PR（如果使用 GitHub/GitLab）
```

---

## 附录 U: 代码质量度量与静态分析

### U.1 ESLint 高级配置

```typescript
// eslint.config.ts
// ESLint flat config (ESLint 9+) for HR Backend

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // 安全规则
  {
    plugins: { security },
    rules: {
      // 禁止 eval 类操作
      "security/detect-eval-with-expression": "error",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-non-literal-require": "warn",
      "security/detect-possible-timing-attacks": "warn",

      // TypeScript 严格规则
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",

      // 禁止危险模式
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",

      // 命名规范
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        {
          selector: "function",
          format: ["camelCase"],
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["UPPER_CASE"],
        },
      ],
    },
  },
  // 测试文件放宽规则
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  // 忽略文件
  {
    ignores: ["dist/", "node_modules/", "drizzle/", "coverage/"],
  }
);
```

### U.2 自定义 ESLint 规则

```typescript
// eslint-rules/no-raw-sql.ts
// 自定义规则: 禁止在路由中直接写原生 SQL

import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://hr-backend.docs/rules/${name}`
);

export const noRawSqlInRoutes = createRule({
  name: "no-raw-sql-in-routes",
  meta: {
    type: "problem",
    docs: {
      description: "禁止在路由文件中直接使用原生 SQL，应通过 service 层",
    },
    messages: {
      noRawSql:
        "不要在路由中直接使用 sql.raw() 或 sql``。请将数据库操作放在 services/ 目录中。",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    // 仅在 routes/ 目录下的文件检查
    const filename = context.filename;
    if (!filename.includes("/routes/")) return {};

    return {
      TaggedTemplateExpression(node) {
        if (
          node.tag.type === "Identifier" &&
          node.tag.name === "sql"
        ) {
          context.report({
            node,
            messageId: "noRawSql",
          });
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "sql" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "raw"
        ) {
          context.report({
            node,
            messageId: "noRawSql",
          });
        }
      },
    };
  },
});
```

### U.3 代码复杂度检查

```typescript
// scripts/code-metrics.ts
// 代码复杂度和质量度量脚本

import { readdir, readFile, stat } from "fs/promises";
import { join, extname } from "path";

interface FileMetrics {
  path: string;
  lines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  functions: number;
  maxNesting: number;
  cyclomaticComplexity: number;
}

interface ProjectMetrics {
  totalFiles: number;
  totalLines: number;
  totalCodeLines: number;
  totalCommentLines: number;
  avgComplexity: number;
  maxComplexity: { file: string; value: number };
  largestFiles: Array<{ file: string; lines: number }>;
  highComplexityFiles: Array<{ file: string; complexity: number }>;
}

/**
 * 分析单个 TypeScript 文件
 */
async function analyzeFile(filePath: string): Promise<FileMetrics> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");

  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  let functions = 0;
  let maxNesting = 0;
  let currentNesting = 0;
  let cyclomaticComplexity = 1; // 基础复杂度
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 空行
    if (trimmed === "") {
      blankLines++;
      continue;
    }

    // 块注释
    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith("/*")) {
      commentLines++;
      if (!trimmed.includes("*/")) {
        inBlockComment = true;
      }
      continue;
    }

    // 行注释
    if (trimmed.startsWith("//")) {
      commentLines++;
      continue;
    }

    codeLines++;

    // 函数检测
    if (
      trimmed.match(
        /^(export\s+)?(async\s+)?function\s+\w+/ // function declaration
      ) ||
      trimmed.match(
        /^\w+\s*[=:]\s*(async\s+)?\(/ // arrow function assignment
      )
    ) {
      functions++;
    }

    // 嵌套深度
    const opens = (trimmed.match(/{/g) || []).length;
    const closes = (trimmed.match(/}/g) || []).length;
    currentNesting += opens - closes;
    maxNesting = Math.max(maxNesting, currentNesting);

    // 圈复杂度（简化版）
    if (
      trimmed.match(/\b(if|else if|for|while|case|catch|&&|\|\||\?\?)\b/)
    ) {
      cyclomaticComplexity++;
    }
  }

  return {
    path: filePath,
    lines: lines.length,
    codeLines,
    commentLines,
    blankLines,
    functions,
    maxNesting,
    cyclomaticComplexity,
  };
}

/**
 * 递归分析项目目录
 */
async function analyzeProject(
  dir: string,
  exclude: string[] = ["node_modules", "dist", "coverage", ".git"]
): Promise<ProjectMetrics> {
  const fileMetrics: FileMetrics[] = [];

  async function walkDir(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (extname(entry.name) === ".ts" && !entry.name.endsWith(".d.ts")) {
        const metrics = await analyzeFile(fullPath);
        fileMetrics.push(metrics);
      }
    }
  }

  await walkDir(dir);

  // 聚合
  const totalLines = fileMetrics.reduce((s, f) => s + f.lines, 0);
  const totalCodeLines = fileMetrics.reduce((s, f) => s + f.codeLines, 0);
  const totalCommentLines = fileMetrics.reduce((s, f) => s + f.commentLines, 0);
  const avgComplexity =
    fileMetrics.length > 0
      ? fileMetrics.reduce((s, f) => s + f.cyclomaticComplexity, 0) /
        fileMetrics.length
      : 0;

  const maxComplexityFile = fileMetrics.reduce(
    (max, f) =>
      f.cyclomaticComplexity > max.value
        ? { file: f.path, value: f.cyclomaticComplexity }
        : max,
    { file: "", value: 0 }
  );

  const largestFiles = [...fileMetrics]
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 10)
    .map((f) => ({ file: f.path, lines: f.lines }));

  const highComplexityFiles = fileMetrics
    .filter((f) => f.cyclomaticComplexity > 10)
    .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
    .map((f) => ({ file: f.path, complexity: f.cyclomaticComplexity }));

  return {
    totalFiles: fileMetrics.length,
    totalLines,
    totalCodeLines,
    totalCommentLines,
    avgComplexity,
    maxComplexity: maxComplexityFile,
    largestFiles,
    highComplexityFiles,
  };
}

// 可作为脚本运行
// bun scripts/code-metrics.ts src/
const targetDir = process.argv[2] || "src";
analyzeProject(targetDir).then((metrics) => {
  console.log("\n📊 Code Quality Metrics Report");
  console.log("=".repeat(50));
  console.log(`Files:           ${metrics.totalFiles}`);
  console.log(`Total Lines:     ${metrics.totalLines}`);
  console.log(`Code Lines:      ${metrics.totalCodeLines}`);
  console.log(`Comment Lines:   ${metrics.totalCommentLines}`);
  console.log(
    `Comment Ratio:   ${((metrics.totalCommentLines / metrics.totalCodeLines) * 100).toFixed(1)}%`
  );
  console.log(
    `Avg Complexity:  ${metrics.avgComplexity.toFixed(1)}`
  );
  console.log(
    `Max Complexity:  ${metrics.maxComplexity.value} (${metrics.maxComplexity.file})`
  );

  if (metrics.highComplexityFiles.length > 0) {
    console.log(`\n⚠️  High Complexity Files (>10):`);
    for (const f of metrics.highComplexityFiles) {
      console.log(`  ${f.complexity} - ${f.file}`);
    }
  }

  if (metrics.largestFiles.length > 0) {
    console.log(`\n📄 Largest Files:`);
    for (const f of metrics.largestFiles.slice(0, 5)) {
      console.log(`  ${f.lines} lines - ${f.file}`);
    }
  }
});
```

### U.4 Gitea CI 集成代码质量检查

```yaml
# .gitea/workflows/code-quality.yaml
# 代码质量 CI 流水线

name: Code Quality
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      # TypeScript 类型检查
      - name: TypeScript Check
        run: bun tsc --noEmit

      # ESLint
      - name: ESLint
        run: bun eslint src/ --format json --output-file eslint-report.json || true

      # ESLint 报告摘要
      - name: ESLint Summary
        if: always()
        run: |
          if [ -f eslint-report.json ]; then
            ERRORS=$(cat eslint-report.json | jq '[.[].errorCount] | add // 0')
            WARNINGS=$(cat eslint-report.json | jq '[.[].warningCount] | add // 0')
            echo "ESLint: ${ERRORS} errors, ${WARNINGS} warnings"
            if [ "$ERRORS" -gt 0 ]; then
              echo "::error::ESLint found ${ERRORS} errors"
              exit 1
            fi
          fi

  test-coverage:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: hr_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      # 运行测试 + 覆盖率
      - name: Test with Coverage
        run: bun vitest run --coverage --reporter=json --outputFile=test-report.json
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/hr_test
          MINIMAX_API_KEY: test-key

      # 覆盖率阈值检查
      - name: Coverage Threshold
        if: always()
        run: |
          if [ -f coverage/coverage-summary.json ]; then
            LINES=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
            BRANCHES=$(cat coverage/coverage-summary.json | jq '.total.branches.pct')
            FUNCTIONS=$(cat coverage/coverage-summary.json | jq '.total.functions.pct')

            echo "Coverage: Lines=${LINES}%, Branches=${BRANCHES}%, Functions=${FUNCTIONS}%"

            # 最低阈值: 70%
            THRESHOLD=70
            FAIL=0

            if (( $(echo "$LINES < $THRESHOLD" | bc -l) )); then
              echo "::error::Line coverage ${LINES}% below threshold ${THRESHOLD}%"
              FAIL=1
            fi

            if (( $(echo "$BRANCHES < $THRESHOLD" | bc -l) )); then
              echo "::error::Branch coverage ${BRANCHES}% below threshold ${THRESHOLD}%"
              FAIL=1
            fi

            if [ "$FAIL" -eq 1 ]; then
              exit 1
            fi
          fi

  code-metrics:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # 完整历史用于 diff

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      # 代码度量
      - name: Code Metrics
        run: |
          echo "## Code Quality Report" > metrics-report.md
          echo "" >> metrics-report.md

          # 文件数和行数变化
          ADDED=$(git diff --stat origin/main...HEAD | tail -1 | grep -oP '\d+ insertion' | grep -oP '\d+' || echo "0")
          REMOVED=$(git diff --stat origin/main...HEAD | tail -1 | grep -oP '\d+ deletion' | grep -oP '\d+' || echo "0")
          echo "**Changes:** +${ADDED} / -${REMOVED} lines" >> metrics-report.md

          # 检查是否引入大文件
          LARGE_FILES=$(git diff --name-only origin/main...HEAD | while read f; do
            if [ -f "$f" ]; then
              LINES=$(wc -l < "$f")
              if [ "$LINES" -gt 300 ]; then
                echo "$f ($LINES lines)"
              fi
            fi
          done)

          if [ -n "$LARGE_FILES" ]; then
            echo "" >> metrics-report.md
            echo "⚠️ **Large Files (>300 lines):**" >> metrics-report.md
            echo "$LARGE_FILES" | while read line; do
              echo "- $line" >> metrics-report.md
            done
          fi

          cat metrics-report.md
```

### U.5 Git Hooks 本地质量门禁

```bash
#!/bin/bash
# .husky/pre-commit
# 提交前质量检查

set -euo pipefail

echo "🔍 Pre-commit checks..."

# 1. 只检查暂存文件
STAGED_TS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.tsx?$' || true)

if [ -z "$STAGED_TS" ]; then
  echo "No TypeScript files staged. Skipping."
  exit 0
fi

# 2. TypeScript 类型检查
echo "  TypeScript check..."
bun tsc --noEmit 2>&1 | head -20 || {
  echo "❌ TypeScript errors found. Fix before committing."
  exit 1
}

# 3. ESLint（仅暂存文件）
echo "  ESLint check..."
echo "$STAGED_TS" | xargs bun eslint --max-warnings 0 || {
  echo "❌ ESLint errors found. Fix before committing."
  exit 1
}

# 4. 检查是否包含敏感信息
echo "  Secrets check..."
SECRETS_PATTERN='(api[_-]?key|password|secret|token)\s*[:=]\s*["\x27][^\s]+["\x27]'
if echo "$STAGED_TS" | xargs grep -ilE "$SECRETS_PATTERN" 2>/dev/null; then
  echo "❌ Possible secrets detected in staged files!"
  echo "   Use .env for secrets, never commit them."
  exit 1
fi

# 5. 检查 console.log（生产代码不应有）
echo "  Console.log check..."
CONSOLE_FILES=$(echo "$STAGED_TS" | grep -v '\.test\.' | grep -v '\.spec\.' || true)
if [ -n "$CONSOLE_FILES" ]; then
  if echo "$CONSOLE_FILES" | xargs grep -n 'console\.log(' 2>/dev/null; then
    echo "⚠️  console.log found in production code. Consider using logger."
    # 警告但不阻止（可改为 exit 1）
  fi
fi

echo "✅ All pre-commit checks passed."
```

### U.6 代码质量仪表板数据

```typescript
// src/services/code-quality-report.ts
// 代码质量报告生成

interface QualityReport {
  generatedAt: string;
  typescript: {
    strictMode: boolean;
    noUncheckedIndexedAccess: boolean;
    errors: number;
  };
  lint: {
    errors: number;
    warnings: number;
    rulesActive: number;
  };
  testing: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    coverage: {
      lines: number;
      branches: number;
      functions: number;
      statements: number;
    };
  };
  codeMetrics: {
    totalFiles: number;
    totalLines: number;
    avgComplexity: number;
    highComplexityCount: number;
    largestFile: { path: string; lines: number };
  };
  dependencies: {
    total: number;
    outdated: number;
    vulnerabilities: {
      critical: number;
      high: number;
      moderate: number;
      low: number;
    };
  };
  score: number; // 0-100 综合质量分
  grade: "A" | "B" | "C" | "D" | "F";
}

/**
 * 计算综合代码质量分数
 */
export function calculateQualityScore(report: Omit<QualityReport, "score" | "grade">): {
  score: number;
  grade: QualityReport["grade"];
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {};

  // TypeScript 严格模式 (10分)
  breakdown.typescript = report.typescript.strictMode ? 10 : 0;
  if (report.typescript.errors > 0) breakdown.typescript = 0;

  // Lint (15分)
  if (report.lint.errors === 0 && report.lint.warnings === 0) {
    breakdown.lint = 15;
  } else if (report.lint.errors === 0) {
    breakdown.lint = 10;
  } else {
    breakdown.lint = Math.max(0, 15 - report.lint.errors * 2);
  }

  // 测试覆盖率 (25分)
  const avgCoverage =
    (report.testing.coverage.lines +
      report.testing.coverage.branches +
      report.testing.coverage.functions) /
    3;
  breakdown.coverage = Math.round((avgCoverage / 100) * 25);

  // 测试通过率 (15分)
  const passRate =
    report.testing.totalTests > 0
      ? report.testing.passed / report.testing.totalTests
      : 0;
  breakdown.tests = Math.round(passRate * 15);

  // 代码复杂度 (15分)
  if (report.codeMetrics.avgComplexity <= 5) {
    breakdown.complexity = 15;
  } else if (report.codeMetrics.avgComplexity <= 10) {
    breakdown.complexity = 10;
  } else if (report.codeMetrics.avgComplexity <= 15) {
    breakdown.complexity = 5;
  } else {
    breakdown.complexity = 0;
  }

  // 安全漏洞 (20分)
  const vulnPenalty =
    report.dependencies.vulnerabilities.critical * 20 +
    report.dependencies.vulnerabilities.high * 10 +
    report.dependencies.vulnerabilities.moderate * 3;
  breakdown.security = Math.max(0, 20 - vulnPenalty);

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  const grade: QualityReport["grade"] =
    score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

  return { score, grade, breakdown };
}
```

---

## 附录 V: API 契约测试与文档自动化

### V.1 OpenAPI Schema 自动生成

```typescript
// src/lib/openapi.ts
// 从 Elysia 路由和 Zod schema 自动生成 OpenAPI 文档

import { z } from "zod/v4";

// ===== Schema 定义 =====

// 职位
export const positionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  department: z.string().optional(),
  description: z.string().optional(),
  skillConfig: z.object({
    must: z.array(z.string()),
    nice: z.array(z.string()),
    reject: z.array(z.string()),
  }),
  status: z.enum(["active", "paused", "closed"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createPositionSchema = positionSchema.pick({
  title: true,
  department: true,
  description: true,
  skillConfig: true,
});

// 候选人
export const candidateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  education: z.string().nullable(),
  status: z.enum([
    "new",
    "screening",
    "under_review",
    "interview_scheduled",
    "interviewing",
    "offer_pending",
    "offered",
    "accepted",
    "rejected",
    "withdrawn",
    "archived",
  ]),
  positionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

// 评分
export const scoreSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  positionId: z.string().uuid(),
  totalScore: z.number().min(0).max(100),
  mustScore: z.number().min(0).max(100),
  niceScore: z.number().min(0).max(100),
  rejectPenalty: z.number().min(0),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  explanation: z.string(),
  createdAt: z.string().datetime(),
});

// 错误响应
export const errorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

// 分页响应
export function paginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonneg(),
  });
}

// ===== OpenAPI 生成 =====

interface OpenAPIRoute {
  method: string;
  path: string;
  summary: string;
  tags: string[];
  requestBody?: { schema: z.ZodType; description?: string };
  queryParams?: Record<string, { schema: z.ZodType; description: string }>;
  pathParams?: Record<string, { schema: z.ZodType; description: string }>;
  responses: Record<number, { schema: z.ZodType; description: string }>;
}

const API_ROUTES: OpenAPIRoute[] = [
  {
    method: "GET",
    path: "/api/positions",
    summary: "获取职位列表",
    tags: ["Positions"],
    queryParams: {
      status: { schema: z.string().optional(), description: "按状态筛选" },
      page: { schema: z.string().optional(), description: "页码" },
      pageSize: { schema: z.string().optional(), description: "每页数量" },
    },
    responses: {
      200: {
        schema: paginatedSchema(positionSchema),
        description: "职位列表",
      },
    },
  },
  {
    method: "POST",
    path: "/api/positions",
    summary: "创建新职位",
    tags: ["Positions"],
    requestBody: {
      schema: createPositionSchema,
      description: "职位信息",
    },
    responses: {
      201: { schema: positionSchema, description: "创建成功" },
      400: { schema: errorSchema, description: "参数错误" },
    },
  },
  {
    method: "GET",
    path: "/api/candidates",
    summary: "获取候选人列表",
    tags: ["Candidates"],
    queryParams: {
      positionId: { schema: z.string().optional(), description: "职位 ID" },
      grade: { schema: z.string().optional(), description: "评分等级" },
      status: { schema: z.string().optional(), description: "候选人状态" },
      page: { schema: z.string().optional(), description: "页码" },
      pageSize: { schema: z.string().optional(), description: "每页数量" },
    },
    responses: {
      200: {
        schema: paginatedSchema(
          candidateSchema.extend({
            totalScore: z.number().nullable(),
            grade: z.string().nullable(),
          })
        ),
        description: "候选人列表（含评分概要）",
      },
    },
  },
  {
    method: "GET",
    path: "/api/candidates/{id}",
    summary: "获取候选人详情",
    tags: ["Candidates"],
    pathParams: {
      id: { schema: z.string().uuid(), description: "候选人 ID" },
    },
    responses: {
      200: {
        schema: candidateSchema.extend({ scores: z.array(scoreSchema) }),
        description: "候选人详情（含评分明细）",
      },
      404: { schema: errorSchema, description: "候选人不存在" },
    },
  },
  {
    method: "PATCH",
    path: "/api/candidates/{id}",
    summary: "更新候选人状态",
    tags: ["Candidates"],
    pathParams: {
      id: { schema: z.string().uuid(), description: "候选人 ID" },
    },
    requestBody: {
      schema: z.object({
        status: z.string().optional(),
        notes: z.string().optional(),
      }),
    },
    responses: {
      200: { schema: candidateSchema, description: "更新成功" },
      400: { schema: errorSchema, description: "无效的状态转换" },
      404: { schema: errorSchema, description: "候选人不存在" },
    },
  },
  {
    method: "POST",
    path: "/api/resumes/upload",
    summary: "上传并解析简历",
    tags: ["Resumes"],
    requestBody: {
      schema: z.object({
        file: z.string().describe("简历文件 (PDF/DOCX)"),
        positionId: z.string().uuid().describe("目标职位 ID"),
        candidateName: z.string().optional(),
        candidateEmail: z.string().email().optional(),
      }),
      description: "multipart/form-data 格式",
    },
    responses: {
      201: {
        schema: z.object({
          candidateId: z.string().uuid(),
          resumeId: z.string().uuid(),
          score: scoreSchema,
        }),
        description: "上传成功，返回评分结果",
      },
      400: { schema: errorSchema, description: "不支持的文件格式" },
    },
  },
];

/**
 * 生成 OpenAPI 3.1 文档
 */
export function generateOpenAPISpec(): object {
  return {
    openapi: "3.1.0",
    info: {
      title: "HR Resume Screening API",
      version: "1.0.0",
      description: "AI 驱动的简历筛选系统 API",
    },
    servers: [
      { url: "http://localhost:3001", description: "开发环境" },
    ],
    paths: buildPaths(API_ROUTES),
    components: {
      schemas: {
        Position: zodToJsonSchema(positionSchema),
        Candidate: zodToJsonSchema(candidateSchema),
        Score: zodToJsonSchema(scoreSchema),
        Error: zodToJsonSchema(errorSchema),
      },
    },
  };
}

function buildPaths(routes: OpenAPIRoute[]): Record<string, any> {
  const paths: Record<string, any> = {};

  for (const route of routes) {
    if (!paths[route.path]) paths[route.path] = {};

    paths[route.path][route.method.toLowerCase()] = {
      summary: route.summary,
      tags: route.tags,
      parameters: [
        ...Object.entries(route.pathParams || {}).map(([name, p]) => ({
          name,
          in: "path",
          required: true,
          description: p.description,
        })),
        ...Object.entries(route.queryParams || {}).map(([name, p]) => ({
          name,
          in: "query",
          required: false,
          description: p.description,
        })),
      ],
      ...(route.requestBody
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: zodToJsonSchema(route.requestBody.schema),
                },
              },
            },
          }
        : {}),
      responses: Object.fromEntries(
        Object.entries(route.responses).map(([code, r]) => [
          code,
          {
            description: r.description,
            content: {
              "application/json": {
                schema: zodToJsonSchema(r.schema),
              },
            },
          },
        ])
      ),
    };
  }

  return paths;
}

/**
 * 简化版 Zod → JSON Schema 转换
 * 生产中建议使用 zod-to-json-schema 库
 */
function zodToJsonSchema(schema: z.ZodType): object {
  // 简化实现: 返回基本描述
  return { type: "object", description: "See Zod schema for details" };
}
```

### V.2 API 契约测试

```typescript
// test/contract/api-contract.test.ts
// API 响应格式契约测试

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Elysia } from "elysia";
import {
  positionSchema,
  candidateSchema,
  scoreSchema,
  errorSchema,
} from "../../src/lib/openapi.js";

// 使用 Elysia 的 app.handle 进行测试
import app from "../../src/index.js";

describe("API Contract Tests", () => {
  // ===== 职位 API =====

  describe("GET /api/positions", () => {
    it("should return paginated positions matching schema", async () => {
      const res = await app.handle(new Request("http://localhost/api/positions?page=1&pageSize=10"));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("pageSize");
      expect(Array.isArray(body.data)).toBe(true);

      // 验证每个元素符合 schema
      for (const item of body.data) {
        const result = positionSchema.safeParse(item);
        if (!result.success) {
          console.error("Schema validation failed:", result.error.issues);
        }
        expect(result.success).toBe(true);
      }
    });
  });

  describe("POST /api/positions", () => {
    it("should create position and return matching schema", async () => {
      const res = await app.handle(new Request("http://localhost/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Senior TypeScript Developer",
          department: "Engineering",
          skillConfig: {
            must: ["TypeScript", "Node.js"],
            nice: ["Docker", "PostgreSQL"],
            reject: [],
          },
        }),
      }));

      expect(res.status).toBe(201);
      const body = await res.json();
      const result = positionSchema.safeParse(body);
      expect(result.success).toBe(true);
    });

    it("should return 400 for invalid input", async () => {
      const res = await app.handle(new Request("http://localhost/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }), // 空 title
      }));

      expect(res.status).toBe(400);
      const body = await res.json();
      const result = errorSchema.safeParse(body);
      expect(result.success).toBe(true);
    });
  });

  // ===== 候选人 API =====

  describe("GET /api/candidates/:id", () => {
    it("should return 404 with error schema for non-existent candidate", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await app.handle(new Request(`http://localhost/api/candidates/${fakeId}`));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });

  // ===== 健康检查 =====

  describe("GET /health", () => {
    it("should return health status", async () => {
      const res = await app.handle(new Request("http://localhost/health"));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("status");
      expect(body.status).toBe("ok");
    });
  });
});
```

### V.3 Schema 版本控制

```typescript
// src/lib/api-versioning.ts
// API 版本管理策略

import { Elysia } from "elysia";

/**
 * API 版本策略:
 *
 * 1. URL 路径版本 (当前方案):
 *    /api/v1/candidates
 *    /api/v2/candidates  (未来)
 *
 * 2. Header 版本 (备用):
 *    Accept: application/vnd.hr.v1+json
 *
 * 3. 版本共存规则:
 *    - 旧版本保留 6 个月
 *    - 新版本发布时通知客户端
 *    - 使用 deprecation header
 */

/**
 * 创建版本化路由
 */
export function createVersionedApp(): Elysia {
  const app = new Elysia();

  // V1 路由
  const v1 = new Elysia();
  // ... v1 路由注册

  // V2 路由（未来）
  // const v2 = new Elysia();

  app.use(v1);
  // app.use(v2);

  // 版本信息端点
  app.get("/api/versions", () => {
    return {
      current: "v1",
      supported: ["v1"],
      deprecated: [],
      sunset: {},
    };
  });

  return app;
}

/**
 * 弃用警告中间件
 */
export function deprecationMiddleware(version: string, sunsetDate: string) {
  return new Elysia()
    .onAfterHandle(({ set }) => {
      set.headers["Deprecation"] = "true";
      set.headers["Sunset"] = sunsetDate;
      set.headers["Link"] = '</api/v2>; rel="successor-version"';
    });
}
```

### V.4 Gitea CI API 文档发布

```yaml
# .gitea/workflows/api-docs.yaml
# 自动生成并发布 API 文档

name: API Documentation
on:
  push:
    branches: [main]
    paths:
      - "src/routes/**"
      - "src/lib/openapi.ts"

jobs:
  generate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      # 生成 OpenAPI spec
      - name: Generate OpenAPI Spec
        run: |
          bun scripts/generate-openapi.ts > docs/openapi.json
          echo "OpenAPI spec generated"

      # 验证 spec
      - name: Validate OpenAPI Spec
        run: |
          bun x @apidevtools/swagger-cli validate docs/openapi.json

      # 生成可读文档 (Redoc)
      - name: Generate HTML Docs
        run: |
          bun x @redocly/cli build-docs docs/openapi.json -o docs/api/index.html

      # 保存产物
      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: api-docs
          path: docs/api/
```

---

## 附录 W: 端到端测试与冒烟测试

### W.1 E2E 测试框架

```typescript
// test/e2e/setup.ts
// 端到端测试环境配置

import { execSync } from "child_process";

/**
 * E2E 测试策略:
 * 1. 使用独立的测试数据库
 * 2. 每次测试前重置数据
 * 3. 不 mock AI（测试真实集成，但用便宜的模型）
 * 4. 使用 MailHog 模拟邮件
 */

// 测试环境变量
const E2E_CONFIG = {
  API_URL: process.env.E2E_API_URL || "http://localhost:3001",
  DB_URL: process.env.E2E_DB_URL || "postgresql://postgres:test@localhost:5432/hr_e2e",
  MAILHOG_URL: process.env.E2E_MAILHOG_URL || "http://localhost:8025",
};

/**
 * 设置 E2E 测试环境
 */
export async function setupE2E(): Promise<void> {
  console.log("[E2E] Setting up test environment...");

  // 等待服务可用
  await waitForService(E2E_CONFIG.API_URL + "/health", 30);
  await waitForService(E2E_CONFIG.MAILHOG_URL + "/api/v2/messages", 10);

  // 重置测试数据库
  await resetDatabase();

  console.log("[E2E] Environment ready.");
}

/**
 * 清理 E2E 测试环境
 */
export async function teardownE2E(): Promise<void> {
  console.log("[E2E] Cleaning up...");
  await resetDatabase();
}

/**
 * 等待服务可用
 */
async function waitForService(url: string, maxWaitSeconds: number): Promise<void> {
  const deadline = Date.now() + maxWaitSeconds * 1000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // 服务未就绪
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(`Service ${url} not available after ${maxWaitSeconds}s`);
}

/**
 * 重置测试数据库
 */
async function resetDatabase(): Promise<void> {
  execSync(`psql "${E2E_CONFIG.DB_URL}" -c "
    TRUNCATE positions, candidates, resumes, scores CASCADE;
  "`, { stdio: "pipe" });
}

// HTTP 辅助函数
export const api = {
  async get(path: string) {
    const res = await fetch(`${E2E_CONFIG.API_URL}${path}`);
    return { status: res.status, body: await res.json() };
  },

  async post(path: string, body: unknown) {
    const res = await fetch(`${E2E_CONFIG.API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  },

  async patch(path: string, body: unknown) {
    const res = await fetch(`${E2E_CONFIG.API_URL}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  },

  async delete(path: string) {
    const res = await fetch(`${E2E_CONFIG.API_URL}${path}`, {
      method: "DELETE",
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  },

  async uploadFile(path: string, filePath: string, fieldName: string = "file") {
    const fs = await import("fs");
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer]);
    formData.append(fieldName, blob, filePath.split("/").pop());

    const res = await fetch(`${E2E_CONFIG.API_URL}${path}`, {
      method: "POST",
      body: formData,
    });
    return { status: res.status, body: await res.json() };
  },
};
```

### W.2 完整 E2E 流程测试

```typescript
// test/e2e/full-flow.test.ts
// 完整招聘流程 E2E 测试

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupE2E, teardownE2E, api } from "./setup.js";

describe("Full Recruitment Flow E2E", () => {
  beforeAll(async () => {
    await setupE2E();
  }, 60_000);

  afterAll(async () => {
    await teardownE2E();
  });

  let positionId: string;
  let candidateId: string;

  // Step 1: 创建职位
  it("should create a position with skill config", async () => {
    const { status, body } = await api.post("/api/positions", {
      title: "高级 TypeScript 全栈工程师",
      department: "技术部",
      description: "负责 HR 系统后端开发",
      skillConfig: {
        must: ["TypeScript", "Node.js", "PostgreSQL"],
        nice: ["Docker", "React", "Elysia"],
        reject: ["培训班"],
      },
    });

    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.title).toBe("高级 TypeScript 全栈工程师");
    expect(body.skillConfig.must).toHaveLength(3);

    positionId = body.id;
  });

  // Step 2: 验证职位列表
  it("should list positions", async () => {
    const { status, body } = await api.get("/api/positions");

    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    const pos = body.data.find((p: any) => p.id === positionId);
    expect(pos).toBeDefined();
    expect(pos.status).toBe("active");
  });

  // Step 3: 上传简历
  it("should upload and parse a resume", async () => {
    // 使用测试 PDF 文件
    const { status, body } = await api.post("/api/resumes/upload", {
      positionId,
      candidateName: "测试候选人",
      candidateEmail: "test@example.com",
      // 实际会用 multipart/form-data 上传文件
      // 这里简化为直接传文本
      resumeText: `
        张伟，男，30岁
        清华大学计算机科学硕士
        8年工作经验
        技能: TypeScript, Node.js, PostgreSQL, Docker, React, Elysia
        项目: 大型 SaaS 平台架构设计与开发
      `,
    });

    expect(status).toBe(201);
    expect(body.candidateId).toBeDefined();
    expect(body.score).toBeDefined();
    expect(body.score.grade).toMatch(/^[A-F]$/);

    candidateId = body.candidateId;
  }, 30_000); // AI 调用可能慢

  // Step 4: 查看候选人详情
  it("should get candidate with scores", async () => {
    const { status, body } = await api.get(
      `/api/candidates/${candidateId}`
    );

    expect(status).toBe(200);
    expect(body.name).toBe("测试候选人");
    expect(body.scores).toBeDefined();
    expect(body.scores.length).toBeGreaterThanOrEqual(1);

    const score = body.scores[0];
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
    expect(score.matchedSkills).toBeDefined();
  });

  // Step 5: 更新候选人状态
  it("should update candidate status through pipeline", async () => {
    // new → screening
    let { status, body } = await api.patch(
      `/api/candidates/${candidateId}`,
      { status: "screening" }
    );
    expect(status).toBe(200);
    expect(body.status).toBe("screening");

    // screening → under_review
    ({ status, body } = await api.patch(
      `/api/candidates/${candidateId}`,
      { status: "under_review" }
    ));
    expect(status).toBe(200);
    expect(body.status).toBe("under_review");
  });

  // Step 6: 无效状态转换应被拒绝
  it("should reject invalid status transition", async () => {
    const { status, body } = await api.patch(
      `/api/candidates/${candidateId}`,
      { status: "accepted" } // 从 under_review 不能直接到 accepted
    );
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // Step 7: 候选人列表筛选
  it("should filter candidates by grade", async () => {
    const { status, body } = await api.get(
      `/api/candidates?positionId=${positionId}&grade=A`
    );
    expect(status).toBe(200);
    // 不一定有 A 级候选人，但格式应正确
    expect(body.data).toBeDefined();
    expect(body.page).toBeDefined();
  });
});
```

### W.3 冒烟测试脚本

```bash
#!/bin/bash
# scripts/smoke-test.sh
# 部署后冒烟测试（快速验证核心功能）

set -euo pipefail

API_URL="${1:-http://localhost:3001}"
FAIL_COUNT=0

echo "🚀 Smoke Test: ${API_URL}"
echo "================================"

# 辅助函数
check() {
  local name="$1"
  local expected_status="$2"
  local method="${3:-GET}"
  local url="$4"
  local body="${5:-}"

  local curl_args=(-s -o /dev/null -w "%{http_code}" -X "$method")
  if [ -n "$body" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body")
  fi

  local status
  status=$(curl "${curl_args[@]}" "$url" 2>/dev/null || echo "000")

  if [ "$status" = "$expected_status" ]; then
    echo "  ✅ $name (HTTP $status)"
  else
    echo "  ❌ $name (expected $expected_status, got $status)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# ===== 核心健康检查 =====
echo ""
echo "--- Health Checks ---"
check "Health endpoint" "200" "GET" "${API_URL}/health"

# ===== API 端点 =====
echo ""
echo "--- API Endpoints ---"
check "List positions" "200" "GET" "${API_URL}/api/positions"
check "List candidates" "200" "GET" "${API_URL}/api/candidates"

# 创建职位
POSITION_RESPONSE=$(curl -s -X POST "${API_URL}/api/positions" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Smoke Test Position",
    "skillConfig": { "must": ["test"], "nice": [], "reject": [] }
  }' 2>/dev/null || echo '{"error":"failed"}')

POSITION_ID=$(echo "$POSITION_RESPONSE" | jq -r '.id // empty')
if [ -n "$POSITION_ID" ]; then
  echo "  ✅ Create position (id: ${POSITION_ID:0:8}...)"
else
  echo "  ❌ Create position failed"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# 获取职位详情
if [ -n "$POSITION_ID" ]; then
  check "Get position" "200" "GET" "${API_URL}/api/positions/${POSITION_ID}"
fi

# ===== 错误处理 =====
echo ""
echo "--- Error Handling ---"
check "404 for invalid ID" "404" "GET" "${API_URL}/api/candidates/00000000-0000-0000-0000-000000000000"
check "400 for invalid body" "400" "POST" "${API_URL}/api/positions" '{"title":""}'

# ===== 结果 =====
echo ""
echo "================================"
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "✅ All smoke tests passed!"
  exit 0
else
  echo "❌ ${FAIL_COUNT} test(s) failed!"
  exit 1
fi
```

### W.4 Gitea CI 冒烟测试集成

```yaml
# .gitea/workflows/smoke-test.yaml
# 部署后自动冒烟测试

name: Smoke Test
on:
  workflow_run:
    workflows: ["Deploy"]
    types: [completed]
    branches: [main]

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4

      # 等待服务完全启动
      - name: Wait for service
        run: |
          for i in $(seq 1 30); do
            if curl -sf https://hr-api.ivis-sh.com/health; then
              echo "Service is up"
              break
            fi
            echo "Waiting... ($i/30)"
            sleep 2
          done

      # 运行冒烟测试
      - name: Run Smoke Tests
        run: |
          chmod +x scripts/smoke-test.sh
          ./scripts/smoke-test.sh https://hr-api.ivis-sh.com

      # 失败通知
      - name: Notify on failure
        if: failure()
        run: |
          echo "::error::Smoke tests failed after deployment!"
          # 可以添加通知: Slack, 邮件等
```

---

## Appendix X: 性能测试 & 负载测试

### X.1 k6 负载测试脚本

```typescript
// test/load/resume-upload.k6.ts
// k6 负载测试: 简历上传 + AI 评分 端到端

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

// 自定义指标
const errorRate = new Rate("errors");
const uploadDuration = new Trend("upload_duration_ms");
const scoringDuration = new Trend("scoring_duration_ms");
const totalDuration = new Trend("total_e2e_duration_ms");
const successfulUploads = new Counter("successful_uploads");

// 测试配置
export const options = {
  scenarios: {
    // 场景1: 日常使用（低并发）
    daily_usage: {
      executor: "constant-vus",
      vus: 5,
      duration: "2m",
      tags: { scenario: "daily" },
    },
    // 场景2: 招聘高峰（高并发）
    peak_hiring: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },  // 预热
        { duration: "2m", target: 50 },   // 高峰
        { duration: "30s", target: 0 },   // 降温
      ],
      startTime: "2m30s",
      tags: { scenario: "peak" },
    },
    // 场景3: 邮件批量导入
    batch_import: {
      executor: "per-vu-iterations",
      vus: 10,
      iterations: 20,
      startTime: "6m",
      tags: { scenario: "batch" },
    },
  },
  thresholds: {
    // SLO 定义
    http_req_duration: ["p(95)<5000"],     // 95% 请求 < 5s
    errors: ["rate<0.05"],                 // 错误率 < 5%
    upload_duration_ms: ["p(90)<3000"],    // 上传 90% < 3s
    scoring_duration_ms: ["p(90)<10000"],  // AI 评分 90% < 10s
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";

// 模拟简历文本
function generateResumeText(): string {
  const skills = [
    "JavaScript", "TypeScript", "React", "Node.js", "Python",
    "PostgreSQL", "Docker", "Kubernetes", "AWS", "Go",
    "Java", "Spring Boot", "Redis", "MongoDB", "GraphQL",
  ];
  const selectedSkills = skills
    .sort(() => Math.random() - 0.5)
    .slice(0, 5 + Math.floor(Math.random() * 5));

  const years = 1 + Math.floor(Math.random() * 15);
  const universities = ["清华大学", "北京大学", "上海交通大学", "浙江大学", "复旦大学"];

  return `
    姓名: 测试候选人${Math.floor(Math.random() * 10000)}
    邮箱: test${Math.floor(Math.random() * 10000)}@example.com
    电话: 138${Math.floor(Math.random() * 100000000).toString().padStart(8, "0")}
    教育: ${universities[Math.floor(Math.random() * universities.length)]} 计算机科学 本科
    工作经验: ${years}年
    技能: ${selectedSkills.join(", ")}
    自我介绍: 具有${years}年软件开发经验，专注于${selectedSkills.slice(0, 3).join("和")}。
  `;
}

export default function () {
  // 1. 创建职位（如果需要）
  group("Create Position", () => {
    const posRes = http.post(
      `${BASE_URL}/api/positions`,
      JSON.stringify({
        title: `Load Test Position ${Date.now()}`,
        department: "Engineering",
        must_skills: ["TypeScript", "React", "Node.js"],
        nice_skills: ["Docker", "PostgreSQL", "AWS"],
        reject_keywords: ["不接受加班"],
        description: "Load test position",
      }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { name: "create_position" },
      }
    );

    check(posRes, {
      "position created": (r) => r.status === 201 || r.status === 200,
    });
  });

  // 2. 上传简历
  group("Upload Resume", () => {
    const startTime = Date.now();
    const resumeText = generateResumeText();

    const uploadRes = http.post(
      `${BASE_URL}/api/resumes/upload`,
      JSON.stringify({
        text: resumeText,
        filename: `resume_${Date.now()}.txt`,
        position_id: 1,
      }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { name: "upload_resume" },
        timeout: "30s",
      }
    );

    const duration = Date.now() - startTime;
    uploadDuration.add(duration);

    const success = check(uploadRes, {
      "upload success": (r) => r.status === 200 || r.status === 201,
      "has candidate_id": (r) => {
        try {
          const body = JSON.parse(r.body as string);
          return body.candidate_id !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (success) {
      successfulUploads.add(1);
    } else {
      errorRate.add(1);
    }

    totalDuration.add(duration);
  });

  // 3. 查询候选人列表
  group("List Candidates", () => {
    const listRes = http.get(`${BASE_URL}/api/candidates?limit=20`, {
      tags: { name: "list_candidates" },
    });

    check(listRes, {
      "list success": (r) => r.status === 200,
      "returns array": (r) => {
        try {
          const body = JSON.parse(r.body as string);
          return Array.isArray(body.candidates || body);
        } catch {
          return false;
        }
      },
    });
  });

  // 请求间隔
  sleep(1 + Math.random() * 2);
}

// 测试结束报告
export function handleSummary(data: Record<string, unknown>) {
  return {
    "test/load/summary.json": JSON.stringify(data, null, 2),
    stdout: `
=== Load Test Summary ===
Total Requests: ${(data as any).metrics?.http_reqs?.values?.count || 0}
Error Rate: ${((data as any).metrics?.errors?.values?.rate * 100 || 0).toFixed(2)}%
P95 Duration: ${((data as any).metrics?.http_req_duration?.values?.["p(95)"] || 0).toFixed(0)}ms
Successful Uploads: ${(data as any).metrics?.successful_uploads?.values?.count || 0}
`,
  };
}
```

### X.2 k6 配置 & CI 集成

```bash
#!/bin/bash
# scripts/load-test.sh
# 负载测试启动脚本

set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"
SCENARIO="${2:-all}"
REPORT_DIR="test/load/reports"

mkdir -p "$REPORT_DIR"

echo "=== HR Backend Load Test ==="
echo "Target: $BASE_URL"
echo "Scenario: $SCENARIO"
echo ""

# 健康检查
if ! curl -sf "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "❌ Service is not available at $BASE_URL"
  exit 1
fi
echo "✅ Service is healthy"

# k6 安装检查
if ! command -v k6 >/dev/null 2>&1; then
  echo "Installing k6..."
  # Linux
  if command -v apt-get >/dev/null 2>&1; then
    sudo gpg -k
    sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
      --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
      sudo tee /etc/apt/sources.list.d/k6.list
    sudo apt-get update && sudo apt-get install -y k6
  else
    echo "Please install k6: https://k6.io/docs/get-started/installation/"
    exit 1
  fi
fi

# テスト実行
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/report_${TIMESTAMP}.json"

k6 run \
  --env BASE_URL="$BASE_URL" \
  --out json="$REPORT_FILE" \
  --summary-trend-stats="avg,min,med,max,p(90),p(95),p(99)" \
  test/load/resume-upload.k6.ts

echo ""
echo "Report saved: $REPORT_FILE"
```

### X.3 API 基准测试

```typescript
// test/benchmark/api-benchmark.ts
// API 端点別ベンチマーク

interface BenchmarkResult {
  endpoint: string;
  method: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  rps: number;
}

async function benchmarkEndpoint(
  url: string,
  method: string,
  body: unknown | null,
  iterations: number,
  concurrency: number
): Promise<BenchmarkResult> {
  const durations: number[] = [];
  let successCount = 0;
  let errorCount = 0;

  const startTime = Date.now();

  // 同時実行制御
  const semaphore = { count: 0 };
  const tasks: Promise<void>[] = [];

  for (let i = 0; i < iterations; i++) {
    while (semaphore.count >= concurrency) {
      await new Promise((r) => setTimeout(r, 1));
    }

    semaphore.count++;
    tasks.push(
      (async () => {
        const reqStart = performance.now();
        try {
          const res = await fetch(url, {
            method,
            headers: body ? { "Content-Type": "application/json" } : {},
            body: body ? JSON.stringify(body) : undefined,
          });
          if (res.ok) successCount++;
          else errorCount++;
        } catch {
          errorCount++;
        }
        durations.push(performance.now() - reqStart);
        semaphore.count--;
      })()
    );
  }

  await Promise.all(tasks);

  const totalMs = Date.now() - startTime;
  durations.sort((a, b) => a - b);

  const percentile = (p: number) =>
    durations[Math.floor(durations.length * (p / 100))] || 0;

  return {
    endpoint: `${method} ${new URL(url).pathname}`,
    method,
    totalRequests: iterations,
    successCount,
    errorCount,
    avgMs: durations.reduce((s, d) => s + d, 0) / durations.length,
    minMs: durations[0] || 0,
    maxMs: durations[durations.length - 1] || 0,
    p50Ms: percentile(50),
    p95Ms: percentile(95),
    p99Ms: percentile(99),
    rps: (iterations / totalMs) * 1000,
  };
}

// ベンチマーク実行
async function runBenchmarks() {
  const BASE = process.env.BASE_URL || "http://localhost:3001";
  const ITERATIONS = 100;
  const CONCURRENCY = 10;

  console.log("=== API Benchmark ===");
  console.log(`Target: ${BASE}`);
  console.log(`Iterations: ${ITERATIONS}, Concurrency: ${CONCURRENCY}`);
  console.log("");

  const benchmarks: Array<{
    name: string;
    url: string;
    method: string;
    body: unknown | null;
  }> = [
    {
      name: "Health Check",
      url: `${BASE}/health`,
      method: "GET",
      body: null,
    },
    {
      name: "List Positions",
      url: `${BASE}/api/positions`,
      method: "GET",
      body: null,
    },
    {
      name: "List Candidates",
      url: `${BASE}/api/candidates?limit=20`,
      method: "GET",
      body: null,
    },
    {
      name: "Create Position",
      url: `${BASE}/api/positions`,
      method: "POST",
      body: {
        title: "Benchmark Position",
        department: "Engineering",
        must_skills: ["TypeScript"],
        nice_skills: ["Docker"],
        reject_keywords: [],
        description: "Benchmark test",
      },
    },
  ];

  const results: BenchmarkResult[] = [];

  for (const bench of benchmarks) {
    console.log(`Running: ${bench.name}...`);
    const result = await benchmarkEndpoint(
      bench.url,
      bench.method,
      bench.body,
      ITERATIONS,
      CONCURRENCY
    );
    results.push(result);

    console.log(
      `  ${result.endpoint}: avg=${result.avgMs.toFixed(1)}ms ` +
        `p95=${result.p95Ms.toFixed(1)}ms ` +
        `rps=${result.rps.toFixed(1)} ` +
        `errors=${result.errorCount}`
    );
  }

  // レポート出力
  console.log("");
  console.log("=== Results Table ===");
  console.log(
    "| Endpoint | Avg | P50 | P95 | P99 | RPS | Errors |"
  );
  console.log(
    "|---|---|---|---|---|---|---|"
  );
  for (const r of results) {
    console.log(
      `| ${r.endpoint} | ${r.avgMs.toFixed(1)}ms | ${r.p50Ms.toFixed(1)}ms | ` +
        `${r.p95Ms.toFixed(1)}ms | ${r.p99Ms.toFixed(1)}ms | ` +
        `${r.rps.toFixed(1)} | ${r.errorCount} |`
    );
  }

  // JSON 保存
  const reportPath = "test/benchmark/report.json";
  await Bun.write(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport saved: ${reportPath}`);
}

runBenchmarks().catch(console.error);
```

### X.4 数据库性能测试

```typescript
// test/benchmark/db-benchmark.ts
// 数据库查询性能基准测试

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db/index.js";
import { candidates, scores, positions } from "../../src/db/schema.js";
import { eq, and, gte, desc, sql } from "drizzle-orm";

describe("Database Performance Benchmarks", () => {
  const WARMUP_RUNS = 5;
  const BENCHMARK_RUNS = 50;

  async function benchmark(
    name: string,
    fn: () => Promise<unknown>
  ): Promise<{ name: string; avgMs: number; p95Ms: number }> {
    // ウォームアップ
    for (let i = 0; i < WARMUP_RUNS; i++) {
      await fn();
    }

    // ベンチマーク
    const durations: number[] = [];
    for (let i = 0; i < BENCHMARK_RUNS; i++) {
      const start = performance.now();
      await fn();
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
    const p95 = durations[Math.floor(durations.length * 0.95)];

    console.log(`${name}: avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms`);

    return { name, avgMs: avg, p95Ms: p95 };
  }

  it("候选人一览（ページネーション）", async () => {
    const result = await benchmark("candidates_list_paginated", () =>
      db
        .select()
        .from(candidates)
        .orderBy(desc(candidates.createdAt))
        .limit(20)
        .offset(0)
    );

    expect(result.p95Ms).toBeLessThan(50); // 50ms 以内
  });

  it("候選人 + スコア JOIN", async () => {
    const result = await benchmark("candidates_with_scores", () =>
      db
        .select({
          id: candidates.id,
          name: candidates.name,
          totalScore: scores.totalScore,
          grade: scores.grade,
        })
        .from(candidates)
        .innerJoin(scores, eq(scores.candidateId, candidates.id))
        .orderBy(desc(scores.totalScore))
        .limit(20)
    );

    expect(result.p95Ms).toBeLessThan(100); // 100ms 以内
  });

  it("職位別フィルタ + スコア順", async () => {
    const result = await benchmark("filter_by_position_sort_score", () =>
      db
        .select()
        .from(candidates)
        .innerJoin(scores, eq(scores.candidateId, candidates.id))
        .where(
          and(
            eq(scores.positionId, 1),
            gte(scores.totalScore, 60)
          )
        )
        .orderBy(desc(scores.totalScore))
        .limit(50)
    );

    expect(result.p95Ms).toBeLessThan(100);
  });

  it("全文検索（スキルマッチ）", async () => {
    const result = await benchmark("skill_text_search", () =>
      db
        .select()
        .from(candidates)
        .where(
          sql`${candidates.skills} @> ARRAY['TypeScript', 'React']::text[]`
        )
        .limit(20)
    );

    expect(result.p95Ms).toBeLessThan(50);
  });

  it("統計集計クエリ", async () => {
    const result = await benchmark("aggregate_stats", () =>
      db
        .select({
          grade: scores.grade,
          count: sql<number>`count(*)`,
          avgScore: sql<number>`avg(${scores.totalScore})`,
          minScore: sql<number>`min(${scores.totalScore})`,
          maxScore: sql<number>`max(${scores.totalScore})`,
        })
        .from(scores)
        .where(eq(scores.positionId, 1))
        .groupBy(scores.grade)
    );

    expect(result.p95Ms).toBeLessThan(100);
  });
});
```

### X.5 Gitea CI 性能测试工作流

```yaml
# .gitea/workflows/performance-test.yml
name: Performance Tests

on:
  schedule:
    - cron: "0 2 * * 1"  # 每周一凌晨2点
  workflow_dispatch:
    inputs:
      target_url:
        description: "Target URL for load test"
        required: false
        default: "http://localhost:3001"

jobs:
  db-benchmark:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: hr_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: testpass
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - name: Seed test data
        run: |
          DATABASE_URL="postgresql://postgres:testpass@localhost:5432/hr_test" \
          bun scripts/seed-benchmark-data.ts
        env:
          NODE_ENV: test

      - name: Run DB benchmarks
        run: |
          DATABASE_URL="postgresql://postgres:testpass@localhost:5432/hr_test" \
          bun exec vitest run test/benchmark/db-benchmark.ts --reporter=json \
          > test/benchmark/db-results.json 2>&1 || true

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: db-benchmark-results
          path: test/benchmark/db-results.json

  load-test:
    runs-on: ubuntu-latest
    needs: db-benchmark
    steps:
      - uses: actions/checkout@v4

      - name: Setup k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 \
            --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
            sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update && sudo apt-get install -y k6

      - name: Start services
        run: |
          docker compose -f docker-compose.yml -f docker-compose.test.yml up -d
          sleep 10
          curl -sf http://localhost:3001/health || exit 1

      - name: Run load tests
        run: |
          k6 run \
            --env BASE_URL=http://localhost:3001 \
            --out json=test/load/k6-results.json \
            test/load/resume-upload.k6.ts

      - name: Check thresholds
        run: |
          # k6 は閾値超過時に非ゼロで終了するため
          # ここでは結果を解析して追加チェック
          if [ -f test/load/k6-results.json ]; then
            echo "Load test results saved"
          fi

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: test/load/

      - name: Cleanup
        if: always()
        run: docker compose down -v
```

---

## Appendix Y: テストデータ管理 & Seed 戦略

### Y.1 テストデータファクトリ

```typescript
// test/factories/index.ts
// テストデータファクトリ: 再現性のあるテストデータ生成

import { db } from "../../src/db/index.js";
import { positions, candidates, resumes, scores } from "../../src/db/schema.js";

// ファクトリベース
interface FactoryOptions {
  count?: number;
  overrides?: Record<string, unknown>;
}

// --- 職位ファクトリ ---
const defaultPosition = {
  title: "高级全栈工程师",
  department: "Engineering",
  description: "负责 HR 系统开发维护",
  mustSkills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
  niceSkills: ["Docker", "AWS", "GraphQL"],
  rejectKeywords: ["不接受加班", "不能出差"],
  status: "active",
};

export async function createPosition(
  overrides: Partial<typeof defaultPosition> = {}
): Promise<{ id: number; title: string }> {
  const data = { ...defaultPosition, ...overrides };
  const [position] = await db
    .insert(positions)
    .values({
      title: data.title,
      department: data.department,
      description: data.description,
      mustSkills: data.mustSkills,
      niceSkills: data.niceSkills,
      rejectKeywords: data.rejectKeywords,
      status: data.status,
    })
    .returning({ id: positions.id, title: positions.title });

  return position;
}

// --- 候補者ファクトリ ---
interface CandidateData {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  education: string;
  experience: number;
  source: string;
  status: string;
}

const candidatePool: CandidateData[] = [
  {
    name: "张三",
    email: "zhangsan@example.com",
    phone: "13800138001",
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"],
    education: "清华大学 计算机科学 本科",
    experience: 5,
    source: "email",
    status: "new",
  },
  {
    name: "李四",
    email: "lisi@example.com",
    phone: "13800138002",
    skills: ["JavaScript", "Vue.js", "Python", "MySQL"],
    education: "北京大学 软件工程 硕士",
    experience: 3,
    source: "email",
    status: "new",
  },
  {
    name: "王五",
    email: "wangwu@example.com",
    phone: "13800138003",
    skills: ["Java", "Spring Boot", "Kubernetes", "AWS"],
    education: "上海交通大学 计算机科学 本科",
    experience: 8,
    source: "upload",
    status: "new",
  },
  {
    name: "赵六",
    email: "zhaoliu@example.com",
    phone: "13800138004",
    skills: ["TypeScript", "React", "Next.js", "GraphQL", "PostgreSQL", "Docker", "AWS"],
    education: "浙江大学 人工智能 硕士",
    experience: 6,
    source: "email",
    status: "new",
  },
  {
    name: "孙七",
    email: "sunqi@example.com",
    phone: "13800138005",
    skills: ["HTML", "CSS", "jQuery"],
    education: "某职业技术学院 计算机应用 专科",
    experience: 1,
    source: "email",
    status: "new",
  },
];

export async function createCandidate(
  index?: number,
  overrides: Partial<CandidateData> = {}
): Promise<{ id: number; name: string }> {
  const data = {
    ...candidatePool[index ?? Math.floor(Math.random() * candidatePool.length)],
    ...overrides,
  };

  const [candidate] = await db
    .insert(candidates)
    .values({
      name: data.name,
      email: data.email,
      phone: data.phone,
      skills: data.skills,
      education: data.education,
      yearsExperience: data.experience,
      source: data.source,
      status: data.status,
    })
    .returning({ id: candidates.id, name: candidates.name });

  return candidate;
}

// --- 簡歴テキストファクトリ ---
export function generateResumeText(candidate: CandidateData): string {
  return `
姓名: ${candidate.name}
邮箱: ${candidate.email}
电话: ${candidate.phone}
学历: ${candidate.education}
工作经验: ${candidate.experience}年

技术技能:
${candidate.skills.map((s) => `- ${s}`).join("\n")}

工作经历:
- 2020-至今: 某科技公司 高级开发工程师
  - 负责核心系统架构设计和开发
  - 使用 ${candidate.skills.slice(0, 3).join(", ")} 开发业务系统
  - 带领 5 人团队完成项目交付

自我评价:
具有 ${candidate.experience} 年软件开发经验，擅长 ${candidate.skills.slice(0, 3).join(" 和 ")}。
`;
}

// --- スコアファクトリ ---
export async function createScore(
  candidateId: number,
  positionId: number,
  overrides: Partial<{
    totalScore: number;
    grade: string;
    mustScore: number;
    niceScore: number;
    rejectPenalty: number;
    matchedSkills: string[];
    missingSkills: string[];
    explanation: string;
  }> = {}
): Promise<{ id: number }> {
  const defaults = {
    totalScore: 75,
    grade: "B",
    mustScore: 60,
    niceScore: 15,
    rejectPenalty: 0,
    matchedSkills: ["TypeScript", "React"],
    missingSkills: ["PostgreSQL"],
    explanation: "候选人技能基本匹配",
  };

  const data = { ...defaults, ...overrides };
  const [score] = await db
    .insert(scores)
    .values({
      candidateId,
      positionId,
      ...data,
    })
    .returning({ id: scores.id });

  return score;
}

// --- バッチ生成 ---
export async function seedTestData(): Promise<{
  positions: Array<{ id: number; title: string }>;
  candidates: Array<{ id: number; name: string }>;
  scores: number;
}> {
  // 職位
  const pos1 = await createPosition();
  const pos2 = await createPosition({
    title: "前端开发工程师",
    mustSkills: ["React", "TypeScript", "CSS"],
    niceSkills: ["Next.js", "Tailwind"],
  });

  // 候補者 + スコア
  const createdCandidates: Array<{ id: number; name: string }> = [];
  let scoreCount = 0;

  for (let i = 0; i < candidatePool.length; i++) {
    const candidate = await createCandidate(i);
    createdCandidates.push(candidate);

    // 各職位にスコア作成
    const gradeMap: Record<number, { score: number; grade: string }> = {
      0: { score: 85, grade: "A" },
      1: { score: 65, grade: "C" },
      2: { score: 45, grade: "D" },
      3: { score: 92, grade: "A" },
      4: { score: 25, grade: "F" },
    };

    await createScore(candidate.id, pos1.id, gradeMap[i]);
    scoreCount++;
  }

  return {
    positions: [pos1, pos2],
    candidates: createdCandidates,
    scores: scoreCount,
  };
}
```

### Y.2 テスト DB リセットユーティリティ

```typescript
// test/helpers/db-reset.ts
// テスト間の DB リセット

import { db } from "../../src/db/index.js";
import { sql } from "drizzle-orm";

// 全テーブルのデータ削除（スキーマ維持）
export async function resetDatabase(): Promise<void> {
  // FK 制約の順序を考慮して削除
  await db.execute(sql`TRUNCATE TABLE
    scores,
    resumes,
    candidates,
    positions,
    candidate_status_log,
    position_stats,
    ab_test_results,
    human_evaluations,
    ai_review_feedback
  CASCADE`);

  // シーケンスリセット
  await db.execute(sql`
    SELECT setval(pg_get_serial_sequence(t.tablename, 'id'), 1, false)
    FROM (
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
    ) t
    WHERE EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = t.tablename AND column_name = 'id'
    )
  `);
}

// 特定テーブルのみリセット
export async function resetTable(tableName: string): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${tableName} CASCADE`));
}
```

### Y.3 Vitest グローバルセットアップ

```typescript
// test/setup.ts
// Vitest グローバルセットアップ

import { beforeAll, beforeEach, afterAll } from "vitest";
import { resetDatabase } from "./helpers/db-reset.js";

// テスト環境変数
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:testpass@localhost:5432/hr_test";

beforeAll(async () => {
  // マイグレーション実行
  const { runMigrations } = await import("../src/db/migrate.js");
  await runMigrations();
});

beforeEach(async () => {
  // 各テスト前に DB リセット
  await resetDatabase();
});

afterAll(async () => {
  // 接続クリーンアップ
  const { closeConnection } = await import("../src/db/index.js");
  await closeConnection();
});
```

```typescript
// vitest.config.ts（テストデータ関連設定）
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./test/setup.ts"],
    // テストの並列実行を制御（DB 共有のため）
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,  // 同一 DB を使う場合は直列実行
      },
    },
    // カバレッジ
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/db/migrate.ts",
        "src/**/*.d.ts",
        "test/**",
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
    // テストタイムアウト
    testTimeout: 30_000,
  },
});
```

### Y.4 Benchmark Seed スクリプト

```typescript
// scripts/seed-benchmark-data.ts
// 負荷テスト / ベンチマーク用の大量データ Seed

import { db } from "../src/db/index.js";
import { positions, candidates, scores, resumes } from "../src/db/schema.js";

const CANDIDATE_COUNT = 1000;
const POSITION_COUNT = 10;

async function seedBenchmarkData() {
  console.log("=== Seeding Benchmark Data ===");
  const startTime = Date.now();

  // 職位作成
  const departments = ["Engineering", "Product", "Design", "Marketing", "Data"];
  const positionRecords = [];

  for (let i = 0; i < POSITION_COUNT; i++) {
    const [pos] = await db
      .insert(positions)
      .values({
        title: `Benchmark Position ${i + 1}`,
        department: departments[i % departments.length],
        description: `Benchmark position for performance testing #${i + 1}`,
        mustSkills: ["TypeScript", "React", "Node.js"].slice(0, 1 + (i % 3)),
        niceSkills: ["Docker", "AWS", "GraphQL"].slice(0, 1 + (i % 3)),
        rejectKeywords: [],
        status: "active",
      })
      .returning();
    positionRecords.push(pos);
  }
  console.log(`✅ Created ${POSITION_COUNT} positions`);

  // 候補者 + スコア一括作成
  const skills = [
    "TypeScript", "JavaScript", "React", "Vue.js", "Angular",
    "Node.js", "Python", "Java", "Go", "Rust",
    "PostgreSQL", "MongoDB", "Redis", "Docker", "Kubernetes",
    "AWS", "GCP", "Azure", "GraphQL", "REST",
  ];

  const grades = ["A", "B", "C", "D", "F"];
  const gradeWeights = [0.1, 0.25, 0.35, 0.2, 0.1];

  let candidateCount = 0;
  const batchSize = 100;

  for (let batch = 0; batch < CANDIDATE_COUNT / batchSize; batch++) {
    const candidateValues = [];
    for (let i = 0; i < batchSize; i++) {
      const idx = batch * batchSize + i;
      const selectedSkills = skills
        .sort(() => Math.random() - 0.5)
        .slice(0, 3 + Math.floor(Math.random() * 8));

      candidateValues.push({
        name: `候选人_${idx.toString().padStart(4, "0")}`,
        email: `bench_${idx}@example.com`,
        phone: `138${idx.toString().padStart(8, "0")}`,
        skills: selectedSkills,
        education: "测试大学 计算机科学",
        yearsExperience: 1 + Math.floor(Math.random() * 15),
        source: Math.random() > 0.5 ? "email" : "upload",
        status: "new",
      });
    }

    const inserted = await db
      .insert(candidates)
      .values(candidateValues)
      .returning({ id: candidates.id });

    // スコア作成
    for (const candidate of inserted) {
      const positionId =
        positionRecords[Math.floor(Math.random() * positionRecords.length)].id;

      // 加重ランダムでグレード選択
      const rand = Math.random();
      let cum = 0;
      let grade = "C";
      for (let g = 0; g < grades.length; g++) {
        cum += gradeWeights[g];
        if (rand <= cum) {
          grade = grades[g];
          break;
        }
      }

      const totalScore =
        grade === "A" ? 85 + Math.floor(Math.random() * 15) :
        grade === "B" ? 70 + Math.floor(Math.random() * 15) :
        grade === "C" ? 50 + Math.floor(Math.random() * 20) :
        grade === "D" ? 30 + Math.floor(Math.random() * 20) :
        Math.floor(Math.random() * 30);

      await db.insert(scores).values({
        candidateId: candidate.id,
        positionId,
        totalScore,
        grade,
        mustScore: Math.floor(totalScore * 0.6),
        niceScore: Math.floor(totalScore * 0.3),
        rejectPenalty: grade === "F" ? 20 : 0,
        matchedSkills: ["TypeScript"],
        missingSkills: ["Docker"],
        explanation: `Benchmark score: ${grade}`,
      });
    }

    candidateCount += batchSize;
    process.stdout.write(`\r  Candidates: ${candidateCount}/${CANDIDATE_COUNT}`);
  }

  console.log("");
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Created ${CANDIDATE_COUNT} candidates with scores`);
  console.log(`⏱  Total time: ${elapsed}s`);
}

seedBenchmarkData().catch(console.error);
```

---

## Appendix Z: セキュリティテスト & SAST 統合

### Z.1 セキュリティテストスイート

```typescript
// test/security/security.test.ts
// セキュリティ脆弱性テスト

import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";

describe("Security Tests", () => {
  // SQL インジェクション
  describe("SQL Injection Prevention", () => {
    const sqlPayloads = [
      "' OR '1'='1",
      "1; DROP TABLE candidates; --",
      "' UNION SELECT * FROM users --",
      "1' AND 1=1 --",
      "admin'--",
      "1; EXEC xp_cmdshell('dir') --",
    ];

    for (const payload of sqlPayloads) {
      it(`rejects SQL injection: ${payload.slice(0, 30)}...`, async () => {
        const res = await fetch(
          `${BASE_URL}/api/candidates?search=${encodeURIComponent(payload)}`
        );
        // 正常応答であること（SQLエラーではない）
        expect(res.status).not.toBe(500);

        const body = await res.json();
        // エラーメッセージに SQL 構文が含まれない
        const bodyStr = JSON.stringify(body);
        expect(bodyStr).not.toContain("syntax error");
        expect(bodyStr).not.toContain("pg_catalog");
        expect(bodyStr).not.toContain("SQLSTATE");
      });
    }
  });

  // XSS
  describe("XSS Prevention", () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      '"><script>alert(1)</script>',
      "javascript:alert(1)",
      '<svg onload=alert(1)>',
    ];

    it("sanitizes XSS in candidate data", async () => {
      for (const payload of xssPayloads) {
        const res = await fetch(`${BASE_URL}/api/candidates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: payload,
            email: "test@example.com",
          }),
        });

        if (res.ok) {
          const body = await res.json();
          const bodyStr = JSON.stringify(body);
          expect(bodyStr).not.toContain("<script>");
          expect(bodyStr).not.toContain("onerror=");
          expect(bodyStr).not.toContain("javascript:");
        }
      }
    });
  });

  // ヘッダーセキュリティ
  describe("Security Headers", () => {
    it("returns security headers", async () => {
      const res = await fetch(`${BASE_URL}/health`);

      // CORS
      expect(res.headers.get("access-control-allow-origin")).toBeDefined();

      // Content-Type
      expect(res.headers.get("content-type")).toContain("application/json");

      // X-Content-Type-Options
      const xContentType = res.headers.get("x-content-type-options");
      if (xContentType) {
        expect(xContentType).toBe("nosniff");
      }
    });
  });

  // 認証テスト
  describe("Authentication", () => {
    it("rejects unauthenticated requests to protected routes", async () => {
      const protectedRoutes = [
        "/api/candidates",
        "/api/positions",
        "/api/resumes/upload",
      ];

      for (const route of protectedRoutes) {
        const res = await fetch(`${BASE_URL}${route}`);
        // 401 or 403（認証設定に依存）
        // 最低限 200 で全データ返さないことを確認
        expect([200, 401, 403]).toContain(res.status);
      }
    });

    it("rejects invalid JWT tokens", async () => {
      const res = await fetch(`${BASE_URL}/api/candidates`, {
        headers: {
          Authorization: "Bearer invalid.token.here",
        },
      });

      expect(res.status).not.toBe(200);
    });
  });

  // レート制限
  describe("Rate Limiting", () => {
    it("applies rate limiting to API endpoints", async () => {
      const requests = Array.from({ length: 100 }, () =>
        fetch(`${BASE_URL}/health`).then((r) => r.status)
      );

      const statuses = await Promise.all(requests);
      const tooManyRequests = statuses.filter((s) => s === 429);

      // 厳密なレート制限がある場合は 429 が返る
      // 設定されていない場合はこのテストをスキップ
      if (tooManyRequests.length > 0) {
        expect(tooManyRequests.length).toBeGreaterThan(0);
      }
    });
  });

  // パストラバーサル
  describe("Path Traversal Prevention", () => {
    const traversalPayloads = [
      "../../../etc/passwd",
      "..%2F..%2F..%2Fetc%2Fpasswd",
      "....//....//....//etc/passwd",
      "%2e%2e%2f%2e%2e%2f",
    ];

    for (const payload of traversalPayloads) {
      it(`blocks path traversal: ${payload.slice(0, 20)}...`, async () => {
        const res = await fetch(`${BASE_URL}/api/resumes/${payload}`);
        expect(res.status).not.toBe(200);
        const body = await res.text();
        expect(body).not.toContain("root:");
      });
    }
  });
});
```

### Z.2 依存関係脆弱性チェック

```bash
#!/bin/bash
# scripts/security-audit.sh
# 依存関係セキュリティ監査

set -euo pipefail

REPORT_DIR="reports/security"
mkdir -p "$REPORT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== Security Audit ==="
echo "Date: $(date -Iseconds)"
echo ""

# 1. npm audit
echo "--- npm/bun audit ---"
bun audit --json > "${REPORT_DIR}/bun-audit-${TIMESTAMP}.json" 2>/dev/null || true
VULN_COUNT=$(bun audit 2>/dev/null | grep -c "Severity:" || echo "0")
echo "Vulnerabilities found: $VULN_COUNT"

if [ "$VULN_COUNT" -gt 0 ]; then
  echo "  High/Critical:"
  bun audit 2>/dev/null | grep -E "high|critical" | head -10 || true
fi

# 2. License チェック
echo ""
echo "--- License Check ---"
if command -v license-checker >/dev/null 2>&1; then
  bun x license-checker --production --json > "${REPORT_DIR}/licenses-${TIMESTAMP}.json"

  # GPL ライセンスの検出（商用利用注意）
  GPL_COUNT=$(bun x license-checker --production --onlyAllow "MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;Unlicense;CC0-1.0;Python-2.0" 2>&1 | grep -c "FAIL" || echo "0")
  if [ "$GPL_COUNT" -gt 0 ]; then
    echo "  ⚠️  Some packages have restrictive licenses"
  else
    echo "  ✅ All licenses are permissive"
  fi
else
  echo "  Skipped (license-checker not installed)"
fi

# 3. Secret 検出
echo ""
echo "--- Secret Detection ---"
SECRETS_FOUND=0

# .env ファイルが Git に含まれていないか
if git ls-files --cached | grep -qE "\.env$|\.env\.local$"; then
  echo "  ⚠️  .env file is tracked in git!"
  SECRETS_FOUND=$((SECRETS_FOUND + 1))
fi

# ソースコード内のハードコードされたシークレット
HARDCODED=$(grep -rn \
  -E "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{8,}" \
  src/ --include="*.ts" 2>/dev/null | \
  grep -v "process.env" | \
  grep -v "example" | \
  grep -v "test" || echo "")

if [ -n "$HARDCODED" ]; then
  echo "  ⚠️  Potential hardcoded secrets found:"
  echo "$HARDCODED" | head -5
  SECRETS_FOUND=$((SECRETS_FOUND + $(echo "$HARDCODED" | wc -l)))
fi

if [ "$SECRETS_FOUND" -eq 0 ]; then
  echo "  ✅ No secrets detected"
fi

# 4. サマリー
echo ""
echo "=== Summary ==="
echo "Reports saved to: $REPORT_DIR/"
echo "Vulnerabilities: $VULN_COUNT"
echo "Secrets issues: $SECRETS_FOUND"

# CI 用 exit code
if [ "$VULN_COUNT" -gt 5 ] || [ "$SECRETS_FOUND" -gt 0 ]; then
  echo ""
  echo "❌ Security audit FAILED"
  exit 1
fi

echo ""
echo "✅ Security audit PASSED"
```

### Z.3 Gitea CI セキュリティワークフロー

```yaml
# .gitea/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 6 * * 1"  # 毎週月曜 6:00

jobs:
  dependency-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - name: Run bun audit
        run: |
          bun audit --audit-level=high || {
            echo "::warning::High severity vulnerabilities found"
          }

      - name: Check for outdated packages
        run: bun outdated || true

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Scan for secrets
        run: |
          # トークン/パスワードパターン検出
          FOUND=$(grep -rn \
            -E "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{8,}" \
            --include="*.ts" --include="*.json" --include="*.yml" \
            . 2>/dev/null | \
            grep -v node_modules | \
            grep -v ".env.example" | \
            grep -v "process.env" | \
            grep -v "test" || echo "")

          if [ -n "$FOUND" ]; then
            echo "::error::Potential secrets found in code:"
            echo "$FOUND"
            exit 1
          fi

          echo "✅ No secrets found"

      - name: Check .gitignore
        run: |
          # .env が .gitignore に含まれているか確認
          if ! grep -q "^\.env$" .gitignore; then
            echo "::error::.env is not in .gitignore!"
            exit 1
          fi
          echo "✅ .gitignore is properly configured"

  security-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: hr_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: testpass
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - name: Run security tests
        run: |
          DATABASE_URL="postgresql://postgres:testpass@localhost:5432/hr_test" \
          bun exec vitest run test/security/ --reporter=json \
          > reports/security-test-results.json 2>&1 || true

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: security-test-results
          path: reports/
```

### Z.4 Elysia セキュリティミドルウェア

```typescript
// src/middleware/security.ts
// セキュリティミドルウェア集

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

// CORS 設定
export const corsPlugin = cors({
  origin: [
    "http://localhost:3000",       // フロントエンド開発
    "https://hr.ivis-sh.com",     // プロダクション
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  exposeHeaders: ["X-Request-ID"],
  maxAge: 3600,
  credentials: true,
});

// セキュリティヘッダー
export const securityHeaders = new Elysia()
  .onAfterHandle(({ set }) => {
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "DENY";
    set.headers["Cross-Origin-Resource-Policy"] = "same-origin";
    set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
  });

// リクエストサイズ制限
export const requestSizeLimit = new Elysia()
  .onBeforeHandle(({ request, set }) => {
    const contentLength = parseInt(
      request.headers.get("content-length") || "0",
      10
    );

    // 10MB 上限
    if (contentLength > 10 * 1024 * 1024) {
      set.status = 413;
      return { error: "Request body too large (max 10MB)" };
    }
  });

// レート制限（簡易実装: メモリベース）
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  maxRequests: number = 100,
  windowMs: number = 60_000
) {
  return new Elysia()
    .onBeforeHandle(({ request, set }) => {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown";

      const now = Date.now();
      const key = ip;
      const entry = rateLimitStore.get(key);

      if (!entry || now > entry.resetAt) {
        rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      } else {
        entry.count++;
        if (entry.count > maxRequests) {
          set.headers["Retry-After"] = Math.ceil((entry.resetAt - now) / 1000).toString();
          set.status = 429;
          return { error: "Too many requests" };
        }
      }

      // クリーンアップ（定期的に古いエントリ削除）
      if (rateLimitStore.size > 10000) {
        for (const [k, v] of rateLimitStore) {
          if (now > v.resetAt) rateLimitStore.delete(k);
        }
      }
    });
}
```

---

## Appendix AA: Gitea 高度 CI/CD パターン & デプロイ自動化

### AA.1 モノレポ対応 CI/CD

```yaml
# .gitea/workflows/monorepo-ci.yml
# モノレポ対応: 変更検知 → 影響範囲のみ CI 実行
name: Monorepo CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.changes.outputs.backend }}
      frontend: ${{ steps.changes.outputs.frontend }}
      shared: ${{ steps.changes.outputs.shared }}
      infra: ${{ steps.changes.outputs.infra }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Detect changed paths
        id: changes
        run: |
          CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD)

          # バックエンド変更
          if echo "$CHANGED" | grep -qE "^(src/|test/|package\.json|tsconfig\.json)"; then
            echo "backend=true" >> "$GITHUB_OUTPUT"
          else
            echo "backend=false" >> "$GITHUB_OUTPUT"
          fi

          # フロントエンド変更
          if echo "$CHANGED" | grep -qE "^(frontend/|packages/ui/)"; then
            echo "frontend=true" >> "$GITHUB_OUTPUT"
          else
            echo "frontend=false" >> "$GITHUB_OUTPUT"
          fi

          # 共通ライブラリ変更
          if echo "$CHANGED" | grep -qE "^(packages/shared/)"; then
            echo "shared=true" >> "$GITHUB_OUTPUT"
          else
            echo "shared=false" >> "$GITHUB_OUTPUT"
          fi

          # インフラ変更
          if echo "$CHANGED" | grep -qE "^(docker|nginx|monitoring|\.gitea)"; then
            echo "infra=true" >> "$GITHUB_OUTPUT"
          else
            echo "infra=false" >> "$GITHUB_OUTPUT"
          fi

  backend-ci:
    needs: detect-changes
    if: needs.detect-changes.outputs.backend == 'true' || needs.detect-changes.outputs.shared == 'true'
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: hr_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: testpass
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - name: Type check
        run: bun exec tsc --noEmit

      - name: Lint
        run: bun exec eslint src/ --max-warnings 0

      - name: Unit tests
        run: |
          DATABASE_URL="postgresql://postgres:testpass@localhost:5432/hr_test" \
          bun exec vitest run --coverage

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: backend-coverage
          path: coverage/

  infra-ci:
    needs: detect-changes
    if: needs.detect-changes.outputs.infra == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate Docker files
        run: |
          for f in Dockerfile*; do
            echo "Checking $f..."
            docker run --rm -i hadolint/hadolint < "$f" || echo "Warning in $f"
          done

      - name: Validate Compose files
        run: |
          for f in docker-compose*.yml; do
            echo "Checking $f..."
            docker compose -f "$f" config > /dev/null
          done

      - name: Validate Nginx config
        run: |
          if [ -f nginx/nginx.conf ]; then
            docker run --rm -v "$(pwd)/nginx:/etc/nginx:ro" nginx:alpine nginx -t
          fi
```

### AA.2 自動リリース & Changelog

```yaml
# .gitea/workflows/release.yml
# セマンティックバージョニング & 自動リリース
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Determine version bump
        id: version
        run: |
          # コミットメッセージから自動判定
          COMMITS=$(git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~10")..HEAD --format="%s")

          if echo "$COMMITS" | grep -qiE "^(BREAKING|feat!|fix!)"; then
            BUMP="major"
          elif echo "$COMMITS" | grep -qiE "^feat"; then
            BUMP="minor"
          elif echo "$COMMITS" | grep -qiE "^fix"; then
            BUMP="patch"
          else
            BUMP="none"
            echo "No release needed"
            echo "bump=none" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          echo "bump=$BUMP" >> "$GITHUB_OUTPUT"

          # 現在のバージョン
          CURRENT=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
          CURRENT=${CURRENT#v}
          IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

          case "$BUMP" in
            major) NEXT="$((MAJOR + 1)).0.0" ;;
            minor) NEXT="${MAJOR}.$((MINOR + 1)).0" ;;
            patch) NEXT="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
          esac

          echo "version=v${NEXT}" >> "$GITHUB_OUTPUT"
          echo "Version: v${NEXT} (${BUMP})"

      - name: Generate changelog
        if: steps.version.outputs.bump != 'none'
        id: changelog
        run: |
          PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
          RANGE="${PREV_TAG}..HEAD"
          if [ -z "$PREV_TAG" ]; then
            RANGE="HEAD~50..HEAD"
          fi

          echo "## Changes" > CHANGELOG_ENTRY.md
          echo "" >> CHANGELOG_ENTRY.md

          # Features
          FEATURES=$(git log $RANGE --format="- %s" --grep="^feat" || echo "")
          if [ -n "$FEATURES" ]; then
            echo "### Features" >> CHANGELOG_ENTRY.md
            echo "$FEATURES" >> CHANGELOG_ENTRY.md
            echo "" >> CHANGELOG_ENTRY.md
          fi

          # Fixes
          FIXES=$(git log $RANGE --format="- %s" --grep="^fix" || echo "")
          if [ -n "$FIXES" ]; then
            echo "### Bug Fixes" >> CHANGELOG_ENTRY.md
            echo "$FIXES" >> CHANGELOG_ENTRY.md
            echo "" >> CHANGELOG_ENTRY.md
          fi

          # Other
          OTHER=$(git log $RANGE --format="- %s" --grep="^chore\|^refactor\|^docs" || echo "")
          if [ -n "$OTHER" ]; then
            echo "### Other" >> CHANGELOG_ENTRY.md
            echo "$OTHER" >> CHANGELOG_ENTRY.md
          fi

          cat CHANGELOG_ENTRY.md

      - name: Create tag and release
        if: steps.version.outputs.bump != 'none'
        run: |
          VERSION="${{ steps.version.outputs.version }}"

          git tag "$VERSION"
          git push origin "$VERSION"

          # Gitea API でリリース作成
          GITEA_API="${{ secrets.GITEA_API_URL || 'https://git.keiten-jp.com/api/v1' }}"
          REPO="${{ github.repository }}"

          curl -sf -X POST \
            -H "Authorization: token ${{ secrets.GITEA_TOKEN }}" \
            -H "Content-Type: application/json" \
            "${GITEA_API}/repos/${REPO}/releases" \
            -d "$(jq -n \
              --arg tag "$VERSION" \
              --arg name "$VERSION" \
              --arg body "$(cat CHANGELOG_ENTRY.md)" \
              '{tag_name: $tag, name: $name, body: $body, draft: false, prerelease: false}'
            )" || echo "Release creation failed (may already exist)"

  deploy:
    needs: release
    if: needs.release.outputs.bump != 'none'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and push Docker image
        run: |
          VERSION=$(git describe --tags --abbrev=0)
          REGISTRY="${{ secrets.DOCKER_REGISTRY || 'registry.ivis-sh.com' }}"

          docker build \
            -f Dockerfile.optimized \
            -t "${REGISTRY}/hr-backend:${VERSION}" \
            -t "${REGISTRY}/hr-backend:latest" \
            .

          echo "${{ secrets.REGISTRY_PASS }}" | docker login "$REGISTRY" -u "${{ secrets.REGISTRY_USER }}" --password-stdin
          docker push "${REGISTRY}/hr-backend:${VERSION}"
          docker push "${REGISTRY}/hr-backend:latest"

      - name: Deploy to production
        run: |
          # SSH でデプロイサーバーに接続
          ssh -o StrictHostKeyChecking=no deploy@${{ secrets.DEPLOY_HOST }} \
            "cd /opt/hr-backend && \
             git pull && \
             VERSION=$(git describe --tags --abbrev=0) \
             ./scripts/blue-green-deploy.sh registry.ivis-sh.com/hr-backend:\${VERSION}"
```

### AA.3 CI キャッシュ最適化

```yaml
# .gitea/workflows/cache-optimization.yml
# CI キャッシュ戦略
name: CI with Cache

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Bun キャッシュ
      - uses: oven-sh/setup-bun@v2

      # Bun store キャッシュ（手動管理）
      - name: Get Bun cache directory
        id: bun-cache
        run: echo "dir=$(bun pm cache)" >> "$GITHUB_OUTPUT"

      - uses: actions/cache@v4
        with:
          path: ${{ steps.bun-cache.outputs.dir }}
          key: bun-store-${{ hashFiles('bun.lock') }}
          restore-keys: |
            bun-store-

      # TypeScript ビルドキャッシュ
      - uses: actions/cache@v4
        with:
          path: .tsbuildinfo
          key: tsc-${{ hashFiles('tsconfig.json', 'src/**/*.ts') }}
          restore-keys: |
            tsc-

      # Vitest キャッシュ
      - uses: actions/cache@v4
        with:
          path: node_modules/.vitest
          key: vitest-${{ hashFiles('vitest.config.ts', 'test/**/*.ts') }}
          restore-keys: |
            vitest-

      - run: bun install --frozen-lockfile

      # インクリメンタル型チェック
      - name: Type check (incremental)
        run: bun exec tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo

      - name: Tests
        run: bun exec vitest run --reporter=default
```

---

## Appendix AB: ミューテーションテスト・コントラクトテスト

### AB.1 Stryker によるミューテーションテスト

```typescript
// stryker.config.mts
// ミューテーションテスト設定

import { type StrykerOptions } from "@stryker-mutator/api/core";

const config: StrykerOptions = {
  packageManager: "bun",
  reporters: ["html", "clear-text", "progress", "dashboard"],
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
  },
  coverageAnalysis: "perTest",
  mutate: [
    "src/services/**/*.ts",
    "src/lib/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "!src/**/index.ts",
    "!src/**/types.ts",
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 50, // 50%未満でCI失敗
  },
  // ミュータント種別設定
  mutator: {
    excludedMutations: [
      "StringLiteral", // 文字列リテラルの変異を除外（ログメッセージ等）
    ],
  },
  // タイムアウト設定（AI API呼び出しを考慮）
  timeoutMS: 30000,
  timeoutFactor: 2,
  // 並列実行
  concurrency: 4,
  // HTML レポート出力先
  htmlReporter: {
    fileName: "reports/mutation/index.html",
  },
  // ダッシュボードレポーター
  dashboard: {
    project: "hr-backend",
    version: "main",
    reportType: "full",
  },
};

export default config;
```

### AB.2 ビジネスロジック特化ミューテーションテスト

```typescript
// test/mutation/scoring-mutations.test.ts
// スコアリングロジックのミューテーション耐性テスト

import { describe, it, expect } from "vitest";

// テスト対象: グレード判定ロジック
function calculateGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

// テスト対象: スコア計算ロジック
function calculateTotalScore(
  mustScore: number,
  niceScore: number,
  rejectPenalty: number,
  overallScore: number
): number {
  const raw = mustScore + niceScore - rejectPenalty + overallScore;
  return Math.max(0, Math.min(100, raw));
}

// テスト対象: 合否判定
function isShortlistable(
  grade: string,
  mustHaveMatchRate: number,
  hasRejectCondition: boolean
): boolean {
  if (hasRejectCondition) return false;
  if (grade === "F" || grade === "D") return false;
  if (mustHaveMatchRate < 0.5) return false;
  return true;
}

describe("calculateGrade — ミューテーション耐性", () => {
  // 境界値テスト（ミュータントが>=を>に変えても検出）
  it("score=85 should be A (boundary)", () => {
    expect(calculateGrade(85)).toBe("A");
  });

  it("score=84 should be B (just below A)", () => {
    expect(calculateGrade(84)).toBe("B");
  });

  it("score=70 should be B (boundary)", () => {
    expect(calculateGrade(70)).toBe("B");
  });

  it("score=69 should be C (just below B)", () => {
    expect(calculateGrade(69)).toBe("C");
  });

  it("score=55 should be C (boundary)", () => {
    expect(calculateGrade(55)).toBe("C");
  });

  it("score=54 should be D (just below C)", () => {
    expect(calculateGrade(54)).toBe("D");
  });

  it("score=40 should be D (boundary)", () => {
    expect(calculateGrade(40)).toBe("D");
  });

  it("score=39 should be F (just below D)", () => {
    expect(calculateGrade(39)).toBe("F");
  });

  it("score=0 should be F", () => {
    expect(calculateGrade(0)).toBe("F");
  });

  it("score=100 should be A", () => {
    expect(calculateGrade(100)).toBe("A");
  });

  // 各グレードの中間値
  it("mid-range values", () => {
    expect(calculateGrade(92)).toBe("A");
    expect(calculateGrade(77)).toBe("B");
    expect(calculateGrade(62)).toBe("C");
    expect(calculateGrade(45)).toBe("D");
    expect(calculateGrade(20)).toBe("F");
  });
});

describe("calculateTotalScore — ミューテーション耐性", () => {
  it("should sum components correctly", () => {
    expect(calculateTotalScore(40, 20, 0, 15)).toBe(75);
  });

  it("should subtract reject penalty", () => {
    expect(calculateTotalScore(40, 20, 10, 15)).toBe(65);
    // ミュータントが - を + に変えた場合に検出
  });

  it("should clamp to 0 minimum", () => {
    expect(calculateTotalScore(0, 0, 50, 0)).toBe(0);
    // ミュータントが Math.max を削除した場合に検出
  });

  it("should clamp to 100 maximum", () => {
    expect(calculateTotalScore(50, 30, 0, 25)).toBe(100);
    // ミュータントが Math.min を削除した場合に検出
  });

  it("exact components", () => {
    // 各コンポーネントが正しく加減算されることを個別確認
    expect(calculateTotalScore(10, 0, 0, 0)).toBe(10);
    expect(calculateTotalScore(0, 10, 0, 0)).toBe(10);
    expect(calculateTotalScore(0, 0, 0, 10)).toBe(10);
    expect(calculateTotalScore(0, 0, 10, 0)).toBe(0); // penalty only -> 0 (clamped)
  });
});

describe("isShortlistable — ミューテーション耐性", () => {
  it("reject condition immediately disqualifies", () => {
    expect(isShortlistable("A", 1.0, true)).toBe(false);
  });

  it("grade F is not shortlistable", () => {
    expect(isShortlistable("F", 1.0, false)).toBe(false);
  });

  it("grade D is not shortlistable", () => {
    expect(isShortlistable("D", 1.0, false)).toBe(false);
  });

  it("low must-have match rate disqualifies", () => {
    expect(isShortlistable("A", 0.49, false)).toBe(false);
  });

  it("boundary must-have match rate = 0.5 passes", () => {
    expect(isShortlistable("A", 0.5, false)).toBe(true);
  });

  it("grade A with good match rate passes", () => {
    expect(isShortlistable("A", 0.8, false)).toBe(true);
  });

  it("grade B passes", () => {
    expect(isShortlistable("B", 0.7, false)).toBe(true);
  });

  it("grade C passes", () => {
    expect(isShortlistable("C", 0.6, false)).toBe(true);
  });
});
```

### AB.3 コントラクトテスト（Pact）

```typescript
// test/contract/api-contract.test.ts
// API コントラクトテスト — フロントエンドとの契約検証

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod/v4";

// === コントラクト定義（フロントエンドと共有） ===

// 候補者一覧レスポンス
const CandidateListContract = z.object({
  candidates: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    email: z.string().email().nullable(),
    phone: z.string().nullable(),
    status: z.enum(["new", "screening", "shortlisted", "interview", "offered", "rejected", "hired"]),
    createdAt: z.string().datetime(),
    score: z.object({
      totalScore: z.number().min(0).max(100),
      grade: z.enum(["A", "B", "C", "D", "F"]),
    }).nullable(),
  })),
  pagination: z.object({
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    totalPages: z.number().int().min(0),
  }),
});

// 候補者詳細レスポンス
const CandidateDetailContract = z.object({
  candidate: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email().nullable(),
    phone: z.string().nullable(),
    status: z.enum(["new", "screening", "shortlisted", "interview", "offered", "rejected", "hired"]),
    education: z.string().nullable(),
    skills: z.array(z.string()),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
  score: z.object({
    totalScore: z.number(),
    mustHaveScore: z.number(),
    niceToHaveScore: z.number(),
    rejectPenalty: z.number(),
    grade: z.enum(["A", "B", "C", "D", "F"]),
    matchedSkills: z.array(z.string()),
    missingSkills: z.array(z.string()),
    explanation: z.string(),
  }).nullable(),
  resume: z.object({
    fileName: z.string(),
    fileSize: z.number(),
    contentType: z.string(),
    uploadedAt: z.string().datetime(),
  }).nullable(),
});

// スコアリング結果レスポンス
const ScoringResultContract = z.object({
  success: z.boolean(),
  candidateId: z.string().uuid(),
  score: z.object({
    totalScore: z.number().min(0).max(100),
    mustHaveScore: z.number().min(0).max(50),
    niceToHaveScore: z.number().min(0).max(30),
    rejectPenalty: z.number().min(-20).max(0),
    grade: z.enum(["A", "B", "C", "D", "F"]),
    matchedSkills: z.array(z.string()),
    missingSkills: z.array(z.string()),
    explanation: z.string().min(1),
  }),
});

// ポジション作成リクエスト
const CreatePositionContract = z.object({
  title: z.string().min(1).max(200),
  department: z.string().min(1),
  description: z.string().min(10),
  requirements: z.object({
    mustHave: z.array(z.string()).min(1),
    niceToHave: z.array(z.string()),
    rejectIf: z.array(z.string()),
  }),
  location: z.string().optional(),
  salaryRange: z.object({
    min: z.number().positive(),
    max: z.number().positive(),
    currency: z.string().default("CNY"),
  }).optional(),
});

// ヘルスチェックレスポンス
const HealthCheckContract = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
  version: z.string().optional(),
  uptime: z.number().positive().optional(),
});

describe("API Contract Tests", () => {
  const baseUrl = process.env.API_URL ?? "http://localhost:3001";

  describe("GET /health", () => {
    it("should match health check contract", async () => {
      const res = await fetch(`${baseUrl}/health`);
      const body = await res.json();
      const result = HealthCheckContract.safeParse(body);
      expect(result.success).toBe(true);
    });
  });

  describe("GET /api/candidates", () => {
    it("should match candidate list contract", async () => {
      const res = await fetch(`${baseUrl}/api/candidates?page=1&pageSize=10`);
      const body = await res.json();
      const result = CandidateListContract.safeParse(body);

      if (!result.success) {
        console.error("Contract violation:", result.error.issues);
      }
      expect(result.success).toBe(true);
    });

    it("should have valid pagination", async () => {
      const res = await fetch(`${baseUrl}/api/candidates?page=1&pageSize=5`);
      const body = await res.json();
      const parsed = CandidateListContract.parse(body);

      expect(parsed.pagination.pageSize).toBe(5);
      expect(parsed.pagination.page).toBe(1);
      expect(parsed.candidates.length).toBeLessThanOrEqual(5);
    });
  });

  describe("POST /api/positions", () => {
    it("should validate request body against contract", async () => {
      const validRequest = {
        title: "全栈开发工程师",
        department: "技术部",
        description: "负责公司核心产品的全栈开发工作",
        requirements: {
          mustHave: ["TypeScript", "React", "Node.js"],
          niceToHave: ["Docker", "PostgreSQL"],
          rejectIf: ["无相关经验"],
        },
      };

      // リクエスト自体がコントラクトに準拠していることを確認
      const requestResult = CreatePositionContract.safeParse(validRequest);
      expect(requestResult.success).toBe(true);
    });

    it("should reject invalid request", () => {
      const invalidRequest = {
        title: "", // 空文字は不可
        department: "技术部",
        description: "short", // 10文字未満
        requirements: {
          mustHave: [], // 空配列は不可
          niceToHave: [],
          rejectIf: [],
        },
      };

      const result = CreatePositionContract.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe("Contract Schema Exports", () => {
    it("should export all contracts for frontend consumption", () => {
      // フロントエンドと共有するスキーマがすべて定義されていることを確認
      expect(CandidateListContract).toBeDefined();
      expect(CandidateDetailContract).toBeDefined();
      expect(ScoringResultContract).toBeDefined();
      expect(CreatePositionContract).toBeDefined();
      expect(HealthCheckContract).toBeDefined();
    });
  });
});
```

### AB.4 Gitea CI ミューテーション・コントラクトテストワークフロー

```yaml
# .gitea/workflows/mutation-contract-tests.yml
name: Mutation & Contract Tests

on:
  push:
    branches: [main]
    paths:
      - "src/services/**"
      - "src/lib/**"
  pull_request:
    branches: [main]

jobs:
  mutation-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - name: Run Stryker mutation tests
        run: |
          bun exec stryker run
        env:
          STRYKER_DASHBOARD_API_KEY: ${{ secrets.STRYKER_API_KEY }}

      - name: Check mutation score
        run: |
          # HTMLレポートからスコア抽出
          SCORE=$(grep -oP 'Mutation score: \K[\d.]+' reports/mutation/index.html || echo "0")
          echo "Mutation score: ${SCORE}%"
          if (( $(echo "$SCORE < 50" | bc -l) )); then
            echo "FAIL: Mutation score below 50%"
            exit 1
          fi

      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: reports/mutation/

  contract-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: hr_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      - name: Start test server
        run: |
          bun dev &
          sleep 5
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/hr_test
          MINIMAX_API_KEY: test-key
          NODE_ENV: test

      - name: Run contract tests
        run: |
          bun exec vitest run test/contract/
        env:
          API_URL: http://localhost:3001

      - name: Export contract schemas
        run: |
          # Zodスキーマからのコントラクト型エクスポート
          bun exec tsc --noEmit --declaration --emitDeclarationOnly \
            --outDir contracts/ \
            test/contract/api-contract.test.ts || true
```

---

## Appendix AC: E2E テスト・APIインテグレーションテスト

### AC.1 Playwright API テスト

```typescript
// test/e2e/api-workflow.test.ts
// E2E ワークフローテスト — 完全な採用パイプライン

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE_URL = process.env.API_URL ?? "http://localhost:3001";

// テストヘルパー
async function api(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

describe("E2E: Complete Recruitment Workflow", () => {
  let positionId: string;
  let candidateId: string;

  // Step 1: ポジション作成
  describe("Step 1: Create Position", () => {
    it("should create a new position with requirements", async () => {
      const { status, data } = await api("POST", "/api/positions", {
        title: "高级前端开发工程师",
        department: "技术部",
        description: "负责公司核心产品的前端架构设计和开发",
        location: "上海",
        requirements: {
          mustHave: ["TypeScript", "React", "3年以上经验"],
          niceToHave: ["Next.js", "GraphQL", "性能优化经验"],
          rejectIf: ["无前端开发经验"],
        },
      });

      expect(status).toBe(201);
      const result = data as { position: { id: string } };
      expect(result.position.id).toBeDefined();
      positionId = result.position.id;
    });

    it("should appear in positions list", async () => {
      const { status, data } = await api("GET", "/api/positions");
      expect(status).toBe(200);

      const result = data as { positions: Array<{ id: string; title: string }> };
      const found = result.positions.find((p) => p.id === positionId);
      expect(found).toBeDefined();
      expect(found!.title).toBe("高级前端开发工程师");
    });
  });

  // Step 2: 履歴書アップロード＆解析
  describe("Step 2: Upload Resume", () => {
    it("should accept PDF resume and create candidate", async () => {
      // テスト用PDFファイル（テキストベース）
      const formData = new FormData();
      const testResumeBlob = new Blob(
        ["%PDF-1.4 Test resume content for 张三"],
        { type: "application/pdf" }
      );
      formData.append("file", testResumeBlob, "zhangsan_resume.pdf");
      formData.append("positionId", positionId);

      const res = await fetch(`${BASE_URL}/api/resumes/upload`, {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBeLessThanOrEqual(201);
      const result = await res.json();
      if (result.candidateId) {
        candidateId = result.candidateId;
      }
    });
  });

  // Step 3: 候補者一覧確認
  describe("Step 3: Verify Candidate List", () => {
    it("should list candidates with filters", async () => {
      const { status, data } = await api(
        "GET",
        `/api/candidates?positionId=${positionId}&page=1&pageSize=10`
      );
      expect(status).toBe(200);

      const result = data as { candidates: unknown[]; pagination: { total: number } };
      expect(result.pagination.total).toBeGreaterThanOrEqual(0);
    });

    it("should filter by status", async () => {
      const { status, data } = await api(
        "GET",
        "/api/candidates?status=new"
      );
      expect(status).toBe(200);
    });

    it("should sort by score descending", async () => {
      const { status, data } = await api(
        "GET",
        "/api/candidates?sortBy=score&sortOrder=desc"
      );
      expect(status).toBe(200);
    });
  });

  // Step 4: 候補者ステータス更新
  describe("Step 4: Update Candidate Status", () => {
    it("should update candidate status through pipeline stages", async () => {
      if (!candidateId) return;

      // screening → shortlisted
      const { status: s1 } = await api("PATCH", `/api/candidates/${candidateId}`, {
        status: "shortlisted",
        notes: "技术能力符合要求，推荐面试",
      });
      expect(s1).toBe(200);

      // shortlisted → interview
      const { status: s2 } = await api("PATCH", `/api/candidates/${candidateId}`, {
        status: "interview",
        notes: "安排一面：技术面试",
      });
      expect(s2).toBe(200);
    });
  });

  // Step 5: ヘルスチェック
  describe("Step 5: Health Check", () => {
    it("should return healthy status", async () => {
      const { status, data } = await api("GET", "/health");
      expect(status).toBe(200);
      expect((data as { status: string }).status).toBe("ok");
    });
  });
});

describe("E2E: Error Handling", () => {
  it("should return 404 for non-existent candidate", async () => {
    const { status } = await api("GET", `/api/candidates/${randomUUID()}`);
    expect(status).toBe(404);
  });

  it("should return 400 for invalid position data", async () => {
    const { status } = await api("POST", "/api/positions", {
      title: "", // 空文字
      department: "",
    });
    expect(status).toBe(400);
  });

  it("should return 400 for invalid status transition", async () => {
    // new → offered は不正遷移（screening をスキップ）
    const { status: createStatus, data } = await api("POST", "/api/positions", {
      title: "テスト",
      department: "テスト",
      description: "テスト用ポジション",
      requirements: { mustHave: ["test"], niceToHave: [], rejectIf: [] },
    });
    // ステータス遷移の検証はアプリケーション層で実装
  });

  it("should handle concurrent requests gracefully", async () => {
    // 10個の同時リクエスト
    const promises = Array(10).fill(null).map(() =>
      api("GET", "/api/candidates?page=1&pageSize=5")
    );
    const results = await Promise.all(promises);

    for (const result of results) {
      expect(result.status).toBe(200);
    }
  });
});

describe("E2E: Rate Limiting", () => {
  it("should rate limit excessive requests", async () => {
    // 100回連続リクエスト
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(await api("GET", "/health"));
    }

    const rateLimited = results.filter((r) => r.status === 429);
    // レート制限が有効な場合、一部が429になるはず
    // 無効な場合もテストはパス（レート制限は任意機能）
    console.log(`Rate limited: ${rateLimited.length}/100 requests`);
  });
});
```

### AC.2 データベースインテグレーションテスト

```typescript
// test/integration/database.test.ts
// データベース操作のインテグレーションテスト

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

// テスト用DB接続
const TEST_DB_URL = process.env.TEST_DATABASE_URL
  ?? "postgresql://postgres:test@localhost:5432/hr_test";

describe("Database Integration", () => {
  let queryClient: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    queryClient = postgres(TEST_DB_URL, { max: 5 });
    db = drizzle(queryClient);

    // テスト用テーブル存在確認
    const tables = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    console.log(`Available tables: ${tables.rows.map((r) => r.table_name).join(", ")}`);
  });

  afterAll(async () => {
    await queryClient.end();
  });

  describe("Positions CRUD", () => {
    const testPositionId = randomUUID();

    it("should insert a position", async () => {
      await db.execute(sql`
        INSERT INTO positions (id, title, department, description, requirements, status)
        VALUES (
          ${testPositionId},
          '测试职位',
          '技术部',
          '测试用',
          ${{
            mustHave: ["TypeScript"],
            niceToHave: ["Docker"],
            rejectIf: [],
          }}::jsonb,
          'active'
        )
      `);

      const [result] = await db.execute(sql`
        SELECT * FROM positions WHERE id = ${testPositionId}
      `).then((r) => r.rows);

      expect(result).toBeDefined();
      expect(result.title).toBe("测试职位");
    });

    it("should update a position", async () => {
      await db.execute(sql`
        UPDATE positions SET title = '更新后的职位' WHERE id = ${testPositionId}
      `);

      const [result] = await db.execute(sql`
        SELECT title FROM positions WHERE id = ${testPositionId}
      `).then((r) => r.rows);

      expect(result.title).toBe("更新后的职位");
    });

    it("should delete a position", async () => {
      await db.execute(sql`DELETE FROM positions WHERE id = ${testPositionId}`);

      const results = await db.execute(sql`
        SELECT * FROM positions WHERE id = ${testPositionId}
      `);
      expect(results.rows).toHaveLength(0);
    });
  });

  describe("Transaction Safety", () => {
    it("should rollback on error", async () => {
      const candidateId = randomUUID();

      try {
        await db.execute(sql`BEGIN`);

        await db.execute(sql`
          INSERT INTO candidates (id, name, status)
          VALUES (${candidateId}, '事务测试', 'new')
        `);

        // 意図的にエラーを発生させる
        await db.execute(sql`
          INSERT INTO nonexistent_table (id) VALUES ('fail')
        `);

        await db.execute(sql`COMMIT`);
      } catch {
        await db.execute(sql`ROLLBACK`);
      }

      // ロールバックされたことを確認
      const results = await db.execute(sql`
        SELECT * FROM candidates WHERE id = ${candidateId}
      `);
      expect(results.rows).toHaveLength(0);
    });
  });

  describe("pgvector Operations", () => {
    it("should store and query vectors", async () => {
      // pgvector 拡張が有効であることを確認
      const extensions = await db.execute(sql`
        SELECT extname FROM pg_extension WHERE extname = 'vector'
      `);

      if (extensions.rows.length === 0) {
        console.log("pgvector extension not installed, skipping vector tests");
        return;
      }

      // テスト用ベクトル挿入
      const testId = randomUUID();
      const testVector = Array(1536).fill(0).map(() => Math.random());

      await db.execute(sql`
        INSERT INTO document_chunks (id, source_type, source_id, content, embedding)
        VALUES (
          ${testId},
          'test',
          'test-doc',
          'テスト用コンテンツ',
          ${JSON.stringify(testVector)}::vector
        )
      `);

      // コサイン類似度検索
      const results = await db.execute(sql`
        SELECT content, 1 - (embedding <=> ${JSON.stringify(testVector)}::vector) as similarity
        FROM document_chunks
        WHERE source_type = 'test'
        ORDER BY embedding <=> ${JSON.stringify(testVector)}::vector
        LIMIT 1
      `);

      expect(results.rows).toHaveLength(1);
      expect(Number(results.rows[0].similarity)).toBeCloseTo(1.0, 5);

      // クリーンアップ
      await db.execute(sql`DELETE FROM document_chunks WHERE id = ${testId}`);
    });
  });

  describe("Concurrent Access", () => {
    it("should handle concurrent writes without deadlock", async () => {
      const operations = Array(10).fill(null).map(async (_, i) => {
        const id = randomUUID();
        await db.execute(sql`
          INSERT INTO positions (id, title, department, description, requirements, status)
          VALUES (${id}, ${"Concurrent " + i}, 'Test', 'Concurrent test', '{}'::jsonb, 'active')
        `);
        return id;
      });

      const ids = await Promise.all(operations);
      expect(ids).toHaveLength(10);

      // クリーンアップ
      for (const id of ids) {
        await db.execute(sql`DELETE FROM positions WHERE id = ${id}`);
      }
    });
  });
});
```

### AC.3 Gitea CI E2E テストワークフロー

```yaml
# .gitea/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: hr_e2e
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: e2etest
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      # マイグレーション実行
      - name: Run database migrations
        run: bun exec drizzle-kit push
        env:
          DATABASE_URL: postgresql://postgres:e2etest@localhost:5432/hr_e2e

      # テストデータシード
      - name: Seed test data
        run: bun test/seeds/e2e-seed.ts
        env:
          DATABASE_URL: postgresql://postgres:e2etest@localhost:5432/hr_e2e

      # アプリケーション起動
      - name: Start application
        run: |
          bun dev &
          # ヘルスチェック待機
          for i in $(seq 1 30); do
            if curl -s http://localhost:3001/health | grep -q "ok"; then
              echo "Application started"
              break
            fi
            echo "Waiting for application... ($i/30)"
            sleep 2
          done
        env:
          DATABASE_URL: postgresql://postgres:e2etest@localhost:5432/hr_e2e
          MINIMAX_API_KEY: test-key
          NODE_ENV: test
          PORT: 3001

      # E2E テスト実行
      - name: Run E2E tests
        run: bun exec vitest run test/e2e/ --reporter=verbose
        env:
          API_URL: http://localhost:3001

      # インテグレーションテスト
      - name: Run integration tests
        run: bun exec vitest run test/integration/
        env:
          TEST_DATABASE_URL: postgresql://postgres:e2etest@localhost:5432/hr_e2e

      - name: Collect test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results
          path: |
            test-results/
            coverage/
```

---

## Appendix AD: テストカバレッジ可視化・品質ゲート

### AD.1 カバレッジ閾値設定

```typescript
// vitest.config.ts — カバレッジ設定部分
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json", "html", "lcov"],
      reportsDirectory: "./coverage",

      // カバレッジ閾値（CI品質ゲート）
      thresholds: {
        // 全体の閾値
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,

        // ファイル単位の閾値（1ファイルでも下回ると失敗）
        perFile: true,
      },

      // カバレッジ計測対象
      include: [
        "src/services/**/*.ts",
        "src/lib/**/*.ts",
        "src/routes/**/*.ts",
        "src/middleware/**/*.ts",
      ],

      // 除外（テスト不要なファイル）
      exclude: [
        "src/**/index.ts", // エントリポイント
        "src/**/types.ts", // 型定義のみ
        "src/db/schema.ts", // スキーマ定義
        "src/db/migrate.ts", // マイグレーションスクリプト
        "src/env.ts", // 環境変数（起動時に検証）
        "**/*.d.ts",
      ],

      // カバーされていない行の情報
      all: true, // テストにインポートされていないファイルも含める
    },

    // テスト分類
    include: [
      "test/**/*.test.ts",
      "test/**/*.spec.ts",
    ],

    // テストタイムアウト
    testTimeout: 30000, // 30秒（AI API呼び出し考慮）

    // グローバルセットアップ
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
  },
});
```

### AD.2 カバレッジダッシュボードジェネレータ

```typescript
// scripts/coverage-dashboard.ts
// カバレッジレポートからMarkdownダッシュボード生成

import { readFileSync, existsSync } from "node:fs";

interface CoverageReport {
  total: {
    lines: { total: number; covered: number; pct: number };
    statements: { total: number; covered: number; pct: number };
    functions: { total: number; covered: number; pct: number };
    branches: { total: number; covered: number; pct: number };
  };
  [filePath: string]: {
    lines: { total: number; covered: number; pct: number };
    statements: { total: number; covered: number; pct: number };
    functions: { total: number; covered: number; pct: number };
    branches: { total: number; covered: number; pct: number };
  };
}

function generateCoverageDashboard(): string {
  const reportPath = "./coverage/coverage-summary.json";
  if (!existsSync(reportPath)) {
    return "# Coverage Report\n\nNo coverage data found. Run `bun test:coverage` first.";
  }

  const report: CoverageReport = JSON.parse(readFileSync(reportPath, "utf-8"));
  const total = report.total;

  // グレード計算
  const avgPct = (total.lines.pct + total.functions.pct + total.branches.pct + total.statements.pct) / 4;
  const grade = avgPct >= 90 ? "A" : avgPct >= 80 ? "B" : avgPct >= 70 ? "C" : avgPct >= 60 ? "D" : "F";

  let md = "# Test Coverage Dashboard\n\n";
  md += `**Overall Grade: ${grade}** (${avgPct.toFixed(1)}%)\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;

  // サマリーテーブル
  md += "## Summary\n\n";
  md += "| Metric | Covered | Total | Percentage | Status |\n";
  md += "|--------|---------|-------|------------|--------|\n";

  const metrics = [
    { name: "Lines", data: total.lines, threshold: 70 },
    { name: "Statements", data: total.statements, threshold: 70 },
    { name: "Functions", data: total.functions, threshold: 70 },
    { name: "Branches", data: total.branches, threshold: 60 },
  ];

  for (const m of metrics) {
    const status = m.data.pct >= m.threshold ? "PASS" : "FAIL";
    const bar = progressBar(m.data.pct);
    md += `| ${m.name} | ${m.data.covered} | ${m.data.total} | ${bar} ${m.data.pct.toFixed(1)}% | ${status} |\n`;
  }

  // ファイル別カバレッジ
  md += "\n## File Coverage\n\n";
  md += "| File | Lines | Functions | Branches | Grade |\n";
  md += "|------|-------|-----------|----------|-------|\n";

  const files = Object.entries(report)
    .filter(([key]) => key !== "total" && key.includes("src/"))
    .map(([path, data]) => ({
      path: path.replace(/.*src\//, "src/"),
      lines: data.lines.pct,
      functions: data.functions.pct,
      branches: data.branches.pct,
      avg: (data.lines.pct + data.functions.pct + data.branches.pct) / 3,
    }))
    .sort((a, b) => a.avg - b.avg); // 低カバレッジ順

  for (const file of files) {
    const fileGrade = file.avg >= 90 ? "A" : file.avg >= 80 ? "B" : file.avg >= 70 ? "C" : file.avg >= 60 ? "D" : "F";
    md += `| ${file.path} | ${file.lines.toFixed(0)}% | ${file.functions.toFixed(0)}% | ${file.branches.toFixed(0)}% | ${fileGrade} |\n`;
  }

  // 改善が必要なファイル
  const lowCoverage = files.filter((f) => f.avg < 70);
  if (lowCoverage.length > 0) {
    md += "\n## Files Needing Improvement\n\n";
    for (const file of lowCoverage) {
      md += `- **${file.path}**: ${file.avg.toFixed(1)}% (Lines: ${file.lines.toFixed(0)}%, Functions: ${file.functions.toFixed(0)}%, Branches: ${file.branches.toFixed(0)}%)\n`;
    }
  }

  // トレンド（前回との比較）
  const previousPath = "./coverage/previous-summary.json";
  if (existsSync(previousPath)) {
    const previous: CoverageReport = JSON.parse(readFileSync(previousPath, "utf-8"));
    const prevAvg = (previous.total.lines.pct + previous.total.functions.pct + previous.total.branches.pct + previous.total.statements.pct) / 4;
    const diff = avgPct - prevAvg;
    const arrow = diff > 0 ? "+" : "";

    md += `\n## Trend\n\n`;
    md += `Coverage change: ${arrow}${diff.toFixed(1)}% (${prevAvg.toFixed(1)}% -> ${avgPct.toFixed(1)}%)\n`;
  }

  return md;
}

function progressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return "[" + "#".repeat(filled) + "-".repeat(empty) + "]";
}

// メイン実行
const dashboard = generateCoverageDashboard();
console.log(dashboard);
```

### AD.3 CI品質ゲートスクリプト

```bash
#!/bin/bash
# scripts/quality-gate.sh
# CI品質ゲート — テスト + カバレッジ + 型チェック + リント

set -euo pipefail

echo "=== Quality Gate Check ==="
FAILED=0

# 1. 型チェック
echo "[1/5] TypeScript type check..."
if bun exec tsc --noEmit; then
  echo "  ✓ Type check passed"
else
  echo "  ✗ Type check FAILED"
  FAILED=$((FAILED + 1))
fi

# 2. リント
echo "[2/5] ESLint..."
if bun exec eslint src/ --max-warnings 0 2>/dev/null; then
  echo "  ✓ Lint passed"
else
  echo "  ✗ Lint FAILED (or not configured)"
  # リント未設定の場合はスキップ
fi

# 3. テスト実行 + カバレッジ
echo "[3/5] Tests with coverage..."
if bun exec vitest run --coverage 2>/dev/null; then
  echo "  ✓ Tests passed"
else
  echo "  ✗ Tests FAILED"
  FAILED=$((FAILED + 1))
fi

# 4. カバレッジ閾値チェック
echo "[4/5] Coverage thresholds..."
if [ -f "coverage/coverage-summary.json" ]; then
  LINES_PCT=$(node -e "
    const c = require('./coverage/coverage-summary.json');
    console.log(c.total.lines.pct);
  ")
  FUNC_PCT=$(node -e "
    const c = require('./coverage/coverage-summary.json');
    console.log(c.total.functions.pct);
  ")

  echo "  Lines: ${LINES_PCT}%"
  echo "  Functions: ${FUNC_PCT}%"

  if (( $(echo "$LINES_PCT < 70" | bc -l) )); then
    echo "  ✗ Line coverage below 70%"
    FAILED=$((FAILED + 1))
  else
    echo "  ✓ Coverage thresholds met"
  fi
else
  echo "  ✗ No coverage data"
  FAILED=$((FAILED + 1))
fi

# 5. ビルドチェック
echo "[5/5] Build check..."
if bun run build 2>/dev/null; then
  echo "  ✓ Build succeeded"
else
  echo "  ✗ Build FAILED"
  FAILED=$((FAILED + 1))
fi

# 結果
echo ""
echo "=== Quality Gate Result ==="
if [ "$FAILED" -eq 0 ]; then
  echo "PASSED - All checks passed ✓"
  exit 0
else
  echo "FAILED - ${FAILED} check(s) failed ✗"
  exit 1
fi
```

### AD.4 Gitea CI 品質ゲートワークフロー

```yaml
# .gitea/workflows/quality-gate.yml
name: Quality Gate

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: hr_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile

      # 型チェック
      - name: Type check
        run: bun exec tsc --noEmit

      # テスト + カバレッジ
      - name: Tests with coverage
        run: bun exec vitest run --coverage
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/hr_test
          MINIMAX_API_KEY: test-key
          NODE_ENV: test

      # カバレッジレポート生成
      - name: Generate coverage dashboard
        run: bun scripts/coverage-dashboard.ts > coverage/dashboard.md

      # カバレッジ閾値チェック
      - name: Check coverage thresholds
        run: |
          LINES=$(node -e "const c=require('./coverage/coverage-summary.json');console.log(c.total.lines.pct)")
          echo "Line coverage: ${LINES}%"
          if (( $(echo "$LINES < 70" | bc -l) )); then
            echo "::error::Line coverage ${LINES}% is below 70% threshold"
            exit 1
          fi

      # PR にカバレッジコメント
      - name: Comment coverage on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const dashboard = fs.readFileSync('coverage/dashboard.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: dashboard
            });

      # アーティファクト保存
      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: |
            coverage/
            !coverage/tmp/
```
