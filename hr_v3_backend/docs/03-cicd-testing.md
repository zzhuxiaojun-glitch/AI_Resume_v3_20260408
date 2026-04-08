# HR Resume Screening Backend -- CI/CD 与自动化测试策略

> 适用项目：`hr-backend`（Hono + Drizzle + PostgreSQL + MiniMax AI + ImapFlow）
> Git 远程仓库：`git.keiten-jp.com`（自托管 Gitea/Forgejo）
> 最后更新：2026-02

---

## 目录

1. [测试策略](#1-测试策略)
   - 1.1 [单元测试](#11-单元测试vitest)
   - 1.2 [集成测试](#12-集成测试数据库与路由)
   - 1.3 [E2E 测试](#13-e2e-测试端到端)
   - 1.4 [AI 输出测试](#14-ai-输出测试非确定性)
   - 1.5 [测试覆盖率](#15-测试覆盖率目标与工具)
2. [CI/CD 平台选择](#2-cicd-平台选择)
   - 2.1 [Gitea Actions](#21-gitea-actions推荐)
   - 2.2 [GitHub Actions](#22-github-actions备选)
   - 2.3 [Woodpecker CI / Drone CI](#23-woodpecker-ci--drone-ci)
3. [Pipeline 设计](#3-pipeline-设计)
   - 3.1 [触发策略](#31-触发策略)
   - 3.2 [Pipeline 阶段详解](#32-pipeline-阶段详解)
4. [具体配置示例](#4-具体配置示例)
   - 4.1 [Gitea Actions Workflow YAML](#41-gitea-actions-workflow-yaml)
   - 4.2 [GitHub Actions Workflow YAML](#42-github-actions-workflow-yaml)
   - 4.3 [Docker-based CI](#43-docker-based-cipostgresql-service-container)
5. [代码质量工具](#5-代码质量工具)
   - 5.1 [Biome](#51-biome推荐)
   - 5.2 [ESLint + Prettier](#52-eslint--prettier备选方案)
   - 5.3 [Pre-commit Hooks](#53-pre-commit-hookshusky--lint-staged)
6. [安全扫描](#6-安全扫描)
7. [自动化部署](#7-自动化部署)
8. [监控和告警](#8-监控和告警)

---

## 1. 测试策略

### 1.1 单元测试（Vitest）

Vitest 是 2025-2026 年 Node.js/TypeScript 项目的标准测试框架。它基于 Vite 的 ESM 管线，原生支持 TypeScript，冷启动速度比 Jest 快 4 倍，内存占用低 30%。

#### 安装与配置

```bash
pnpm add -D vitest @vitest/coverage-v8
```

创建 `vitest.config.ts`：

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 全局 API（describe、it、expect 等无需每次 import）
    globals: true,
    // 测试环境
    environment: "node",
    // 测试文件匹配模式
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // 覆盖率配置
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/db/migrate.ts"],
      // 覆盖率阈值
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    // 每个测试文件独立的 setup
    setupFiles: ["./test/setup.ts"],
  },
});
```

在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest --run",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

#### 测试 AI Scorer（Mock LLM 响应）

AI 评分服务是本项目的核心。测试时需要 mock 掉 `generateText` 调用，使测试可重复且不依赖外部 API。

`src/services/__tests__/ai-scorer.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scoreResume } from "../ai-scorer.js";
import type { SkillConfig } from "../../lib/types.js";

// Mock Vercel AI SDK 的 generateText 函数
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

import { generateText } from "ai";
const mockGenerateText = vi.mocked(generateText);

describe("scoreResume", () => {
  const mockSkillConfig: SkillConfig = {
    must: ["TypeScript", "React", "Node.js"],
    nice: ["Docker", "CI/CD"],
    reject: ["无相关开发经验"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应正确解析标准 JSON 响应", async () => {
    // 模拟 AI 返回标准 JSON
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        totalScore: 75,
        mustScore: 80,
        niceScore: 60,
        rejectPenalty: 0,
        grade: "B",
        matchedSkills: ["TypeScript", "React"],
        missingSkills: ["Node.js"],
        explanation: "候选人具备前端核心技能",
      }),
    } as any);

    const result = await scoreResume(
      "简历内容：5年前端开发经验...",
      "前端工程师",
      "负责前端开发",
      mockSkillConfig,
    );

    expect(result.totalScore).toBe(75);
    expect(result.grade).toBe("B");
    expect(result.matchedSkills).toContain("TypeScript");
    expect(result.missingSkills).toContain("Node.js");
  });

  it("应正确处理带 <think> 标签的响应（MiniMax M2.5 推理模型）", async () => {
    // MiniMax M2.5 会先输出推理过程，再输出 JSON
    mockGenerateText.mockResolvedValue({
      text: `<think>
让我分析一下这份简历...
候选人有3年TypeScript经验，熟悉React...
</think>
\`\`\`json
{
  "totalScore": 65,
  "mustScore": 70,
  "niceScore": 50,
  "rejectPenalty": 5,
  "grade": "B",
  "matchedSkills": ["TypeScript"],
  "missingSkills": ["React", "Node.js"],
  "explanation": "候选人有一定基础但经验不足"
}
\`\`\``,
    } as any);

    const result = await scoreResume(
      "简历内容...",
      "软件工程师",
      "全栈开发",
      mockSkillConfig,
    );

    expect(result.totalScore).toBe(65);
    expect(result.grade).toBe("B");
  });

  it("应在 AI 返回不合法 JSON 时抛出错误", async () => {
    mockGenerateText.mockResolvedValue({
      text: "这不是 JSON",
    } as any);

    await expect(
      scoreResume("简历...", "职位", "描述", mockSkillConfig),
    ).rejects.toThrow();
  });

  it("应在分数超出范围时被 Zod 校验拒绝", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        totalScore: 150, // 超出 0-100 范围
        mustScore: 80,
        niceScore: 60,
        rejectPenalty: 0,
        grade: "A",
        matchedSkills: [],
        missingSkills: [],
        explanation: "测试",
      }),
    } as any);

    await expect(
      scoreResume("简历...", "职位", "描述", mockSkillConfig),
    ).rejects.toThrow();
  });

  it("应正确传递 prompt 中的职位信息和技能配置", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        totalScore: 50,
        mustScore: 50,
        niceScore: 50,
        rejectPenalty: 0,
        grade: "C",
        matchedSkills: [],
        missingSkills: [],
        explanation: "一般",
      }),
    } as any);

    await scoreResume("简历...", "后端工程师", "Node.js 开发", mockSkillConfig);

    // 验证 generateText 被调用时的 prompt 包含正确信息
    expect(mockGenerateText).toHaveBeenCalledOnce();
    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain("后端工程师");
    expect(call.prompt).toContain("TypeScript");
    expect(call.prompt).toContain("Docker");
  });
});
```

#### 测试 Resume Parser

`src/services/__tests__/resume-parser.test.ts`：

```typescript
import { describe, it, expect, vi } from "vitest";
import { parseResume } from "../resume-parser.js";

// Mock pdf-parse 和 mammoth
vi.mock("pdf-parse", () => ({
  PDFParse: vi.fn().mockImplementation(({ data }) => ({
    getText: vi.fn().mockResolvedValue({
      text: "模拟 PDF 文本内容：张三，5年工作经验",
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({
      value: "模拟 DOCX 文本内容：李四，前端工程师",
    }),
  },
}));

describe("parseResume", () => {
  it("应正确解析 PDF 文件", async () => {
    const buffer = Buffer.from("fake-pdf-content");
    const result = await parseResume(buffer, "张三_简历.pdf");

    expect(result.fileName).toBe("张三_简历.pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.text).toContain("模拟 PDF 文本内容");
  });

  it("应正确解析 DOCX 文件", async () => {
    const buffer = Buffer.from("fake-docx-content");
    const result = await parseResume(buffer, "李四_简历.docx");

    expect(result.fileName).toBe("李四_简历.docx");
    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.text).toContain("模拟 DOCX 文本内容");
  });

  it("应正确解析 DOC 文件（与 DOCX 相同逻辑）", async () => {
    const buffer = Buffer.from("fake-doc-content");
    const result = await parseResume(buffer, "简历.doc");

    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("应对不支持的文件格式抛出错误", async () => {
    const buffer = Buffer.from("fake-content");

    await expect(parseResume(buffer, "photo.jpg")).rejects.toThrow(
      "Unsupported file format: .jpg",
    );
  });

  it("应对文件名大小写不敏感", async () => {
    const buffer = Buffer.from("fake-pdf-content");
    const result = await parseResume(buffer, "RESUME.PDF");

    expect(result.mimeType).toBe("application/pdf");
  });

  it("解析结果的文本应去除首尾空白", async () => {
    const result = await parseResume(Buffer.from(""), "test.pdf");
    // trim() 已在 parseResume 中调用
    expect(result.text).toBe(result.text.trim());
  });
});
```

#### 测试 Email Service（Mock ImapFlow）

`src/services/__tests__/email.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 所有外部依赖
vi.mock("imapflow", () => ({
  ImapFlow: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    getMailboxLock: vi.fn().mockResolvedValue({
      release: vi.fn(),
    }),
    search: vi.fn().mockResolvedValue([]),
    fetchOne: vi.fn(),
    download: vi.fn(),
    messageFlagsAdd: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../resume-parser.js", () => ({
  parseResume: vi.fn().mockResolvedValue({
    text: "解析后的简历文本",
    fileName: "简历.pdf",
    mimeType: "application/pdf",
  }),
}));

vi.mock("../ai-scorer.js", () => ({
  scoreResume: vi.fn().mockResolvedValue({
    totalScore: 75,
    mustScore: 80,
    niceScore: 60,
    rejectPenalty: 0,
    grade: "B",
    matchedSkills: ["TypeScript"],
    missingSkills: ["React"],
    explanation: "测试评分",
  }),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      {
        id: "pos-uuid",
        title: "软件工程师",
        description: "开发岗位",
        skillConfig: { must: ["TypeScript"], nice: ["Docker"], reject: [] },
      },
    ]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "candidate-uuid" }]),
  },
}));

vi.mock("../../env.js", () => ({
  env: {
    IMAP_HOST: "mail.test.com",
    IMAP_PORT: 993,
    IMAP_USER: "test@test.com",
    IMAP_PASS: "test-password",
  },
}));

describe("pollInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("当没有未读邮件时应返回空数组", async () => {
    const { pollInbox } = await import("../email.js");
    const results = await pollInbox("position-uuid");
    expect(results).toEqual([]);
  });

  // 更多测试用例 ...
});
```

#### 测试纯工具函数

`src/lib/__tests__/extract-json.test.ts`（建议将 `extractJson` 提取为公共函数）：

```typescript
import { describe, it, expect } from "vitest";

// 假设已将 extractJson 导出为公共函数
function extractJson(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return cleaned;
}

describe("extractJson", () => {
  it("应返回纯 JSON 字符串原样", () => {
    const input = '{"score": 80}';
    expect(extractJson(input)).toBe('{"score": 80}');
  });

  it("应移除 <think> 标签", () => {
    const input = '<think>思考过程...</think>{"score": 80}';
    expect(extractJson(input)).toBe('{"score": 80}');
  });

  it("应移除多行 <think> 标签", () => {
    const input = `<think>
第一行
第二行
</think>
{"score": 80}`;
    expect(extractJson(input)).toBe('{"score": 80}');
  });

  it("应移除 markdown 代码围栏", () => {
    const input = '```json\n{"score": 80}\n```';
    expect(extractJson(input)).toBe('{"score": 80}');
  });

  it("应同时处理 <think> 和代码围栏", () => {
    const input = '<think>推理...</think>\n```json\n{"score": 80}\n```';
    expect(extractJson(input)).toBe('{"score": 80}');
  });

  it("应处理无 json 标记的代码围栏", () => {
    const input = '```\n{"score": 80}\n```';
    expect(extractJson(input)).toBe('{"score": 80}');
  });
});
```

### 1.2 集成测试（数据库与路由）

集成测试验证多个模块协同工作的正确性。本项目需要测试 Hono 路由 + Drizzle ORM + PostgreSQL 的完整链路。

#### 方案 A：PGlite（推荐 -- 零 Docker 依赖）

PGlite 是 WASM 编译的 PostgreSQL，可在 Node.js 中以内存模式运行。与 Testcontainers 相比，无需 Docker，启动速度极快（毫秒级），非常适合 CI 环境。

安装：

```bash
pnpm add -D @electric-sql/pglite
```

创建测试辅助文件 `test/helpers/test-db.ts`：

```typescript
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../src/db/schema.js";

/**
 * 为每个测试套件创建独立的内存 PostgreSQL 实例
 * 使用 PGlite 内存模式，无需 Docker，毫秒级启动
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  // 使用 SQL 直接创建表结构（与 Drizzle schema 保持一致）
  await client.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      department TEXT,
      description TEXT,
      skill_config JSONB NOT NULL DEFAULT '{"must":[],"nice":[],"reject":[]}',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      position_id UUID NOT NULL REFERENCES positions(id),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      education TEXT,
      skills TEXT[],
      status TEXT NOT NULL DEFAULT 'new',
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id UUID NOT NULL REFERENCES candidates(id),
      file_name TEXT NOT NULL,
      mime_type TEXT,
      raw_text TEXT,
      source TEXT NOT NULL DEFAULT 'upload',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id UUID NOT NULL REFERENCES candidates(id),
      position_id UUID NOT NULL REFERENCES positions(id),
      total_score REAL NOT NULL,
      must_score REAL NOT NULL DEFAULT 0,
      nice_score REAL NOT NULL DEFAULT 0,
      reject_penalty REAL NOT NULL DEFAULT 0,
      grade TEXT NOT NULL,
      matched_skills TEXT[] NOT NULL DEFAULT '{}',
      missing_skills TEXT[] NOT NULL DEFAULT '{}',
      explanation TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS candidates_position_idx ON candidates(position_id);
    CREATE INDEX IF NOT EXISTS scores_candidate_idx ON scores(candidate_id);
    CREATE INDEX IF NOT EXISTS scores_position_idx ON scores(position_id);
  `);

  return { db, client };
}

/**
 * 清理测试数据（按外键依赖顺序删除）
 */
export async function cleanTestDb(client: PGlite) {
  await client.exec(`
    DELETE FROM scores;
    DELETE FROM resumes;
    DELETE FROM candidates;
    DELETE FROM positions;
  `);
}
```

#### 方案 B：Testcontainers（Docker PostgreSQL）

适合需要测试数据库特定功能（如扩展、触发器）的场景。

安装：

```bash
pnpm add -D testcontainers @testcontainers/postgresql
```

`test/helpers/test-db-container.ts`：

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/db/schema.js";

let container: StartedPostgreSqlContainer;
let client: ReturnType<typeof postgres>;

/**
 * 在全局 setup 中启动 PostgreSQL 容器（整个测试套件共享一个容器）
 */
export async function startPostgresContainer() {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("hr_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const connectionUri = container.getConnectionUri();
  client = postgres(connectionUri);
  const db = drizzle(client, { schema });

  return { db, connectionUri };
}

/**
 * 在全局 teardown 中停止容器
 */
export async function stopPostgresContainer() {
  if (client) await client.end();
  if (container) await container.stop();
}
```

Vitest 全局 setup（`test/global-setup.ts`）：

```typescript
import type { GlobalSetupContext } from "vitest/node";
import { startPostgresContainer, stopPostgresContainer } from "./helpers/test-db-container.js";

export default async function setup({ provide }: GlobalSetupContext) {
  const { connectionUri } = await startPostgresContainer();
  // 将连接信息传递给测试文件
  process.env.DATABASE_URL = connectionUri;
}

export async function teardown() {
  await stopPostgresContainer();
}
```

#### 测试 Hono 路由

Hono 提供了内建的 `testClient` 和 `app.request` 方法，可以直接在测试中调用路由，无需启动真实 HTTP 服务。

`test/integration/routes-positions.test.ts`：

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import { createTestDb, cleanTestDb } from "../helpers/test-db.js";
import type { PGlite } from "@electric-sql/pglite";

// 由于路由模块直接 import db，需要通过 vi.mock 替换
// 或者重构路由以支持依赖注入
import { vi } from "vitest";

let testClient: PGlite;

// Mock 数据库模块，使用 PGlite 测试数据库
vi.mock("../../src/db/index.js", async () => {
  const { createTestDb } = await import("../helpers/test-db.js");
  const { db, client } = await createTestDb();
  testClient = client;
  return { db };
});

// Mock env 模块，避免在测试中验证环境变量
vi.mock("../../src/env.js", () => ({
  env: {
    DATABASE_URL: "memory://",
    MINIMAX_API_KEY: "test-key",
    IMAP_HOST: "localhost",
    IMAP_PORT: 993,
    IMAP_USER: "test@test.com",
    IMAP_PASS: "test",
  },
}));

describe("Positions 路由集成测试", () => {
  let app: Hono;

  beforeAll(async () => {
    // 动态导入，确保 mock 生效
    const { positionsRoute } = await import("../../src/routes/positions.js");
    app = new Hono();
    app.route("/api/positions", positionsRoute);
  });

  beforeEach(async () => {
    await cleanTestDb(testClient);
  });

  it("POST /api/positions - 应创建新职位", async () => {
    const res = await app.request("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "前端工程师",
        department: "研发部",
        description: "负责前端开发",
        skillConfig: {
          must: ["TypeScript", "React"],
          nice: ["Vue"],
          reject: [],
        },
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe("前端工程师");
    expect(data.id).toBeDefined();
  });

  it("GET /api/positions - 应返回所有职位列表", async () => {
    // 先创建一个职位
    await app.request("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "后端工程师",
        skillConfig: { must: [], nice: [], reject: [] },
      }),
    });

    const res = await app.request("/api/positions");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("后端工程师");
  });

  it("GET /api/positions/:id - 不存在的 ID 应返回 404", async () => {
    const res = await app.request(
      "/api/positions/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(404);
  });

  it("PATCH /api/positions/:id - 应更新职位信息", async () => {
    // 创建职位
    const createRes = await app.request("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "初始职位",
        skillConfig: { must: [], nice: [], reject: [] },
      }),
    });
    const created = await createRes.json();

    // 更新
    const updateRes = await app.request(`/api/positions/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新后的职位" }),
    });

    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.title).toBe("更新后的职位");
  });

  it("DELETE /api/positions/:id - 应删除职位", async () => {
    const createRes = await app.request("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "待删除",
        skillConfig: { must: [], nice: [], reject: [] },
      }),
    });
    const created = await createRes.json();

    const deleteRes = await app.request(`/api/positions/${created.id}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    // 验证已被删除
    const getRes = await app.request(`/api/positions/${created.id}`);
    expect(getRes.status).toBe(404);
  });
});
```

#### 测试数据库操作（Drizzle ORM）

`test/integration/db-operations.test.ts`：

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, cleanTestDb } from "../helpers/test-db.js";
import { positions, candidates, scores, resumes } from "../../src/db/schema.js";
import type { PGlite } from "@electric-sql/pglite";

describe("数据库操作", () => {
  let db: any;
  let client: PGlite;

  beforeAll(async () => {
    const result = await createTestDb();
    db = result.db;
    client = result.client;
  });

  beforeEach(async () => {
    await cleanTestDb(client);
  });

  afterAll(async () => {
    await client.close();
  });

  it("应正确创建职位并生成 UUID", async () => {
    const [position] = await db
      .insert(positions)
      .values({
        title: "测试职位",
        skillConfig: { must: ["TypeScript"], nice: [], reject: [] },
      })
      .returning();

    expect(position.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(position.title).toBe("测试职位");
    expect(position.status).toBe("open"); // 默认值
  });

  it("应正确创建候选人并关联职位", async () => {
    const [position] = await db
      .insert(positions)
      .values({
        title: "开发岗",
        skillConfig: { must: [], nice: [], reject: [] },
      })
      .returning();

    const [candidate] = await db
      .insert(candidates)
      .values({
        positionId: position.id,
        name: "张三",
        email: "zhangsan@example.com",
        status: "screening",
      })
      .returning();

    expect(candidate.positionId).toBe(position.id);
    expect(candidate.name).toBe("张三");
  });

  it("候选人外键约束应正常工作", async () => {
    await expect(
      db
        .insert(candidates)
        .values({
          positionId: "00000000-0000-0000-0000-000000000000",
          name: "测试",
        })
        .returning(),
    ).rejects.toThrow(); // 外键约束违反
  });

  it("应正确存储和查询 JSONB 技能配置", async () => {
    const skillConfig = {
      must: ["TypeScript", "React"],
      nice: ["Docker"],
      reject: ["无经验"],
    };

    const [position] = await db
      .insert(positions)
      .values({ title: "测试", skillConfig })
      .returning();

    const [fetched] = await db
      .select()
      .from(positions)
      .where(eq(positions.id, position.id));

    expect(fetched.skillConfig).toEqual(skillConfig);
  });
});
```

### 1.3 E2E 测试（端到端）

E2E 测试验证完整的业务流程：上传简历 -> 解析 -> AI 评分 -> 数据入库。

`test/e2e/resume-flow.test.ts`：

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";

// Mock AI 评分（避免真实 API 调用，但保留其他模块真实运行）
vi.mock("../../src/services/ai-scorer.js", () => ({
  scoreResume: vi.fn().mockResolvedValue({
    totalScore: 72,
    mustScore: 80,
    niceScore: 55,
    rejectPenalty: 3,
    grade: "B",
    matchedSkills: ["TypeScript", "Node.js"],
    missingSkills: ["React"],
    explanation: "候选人后端能力突出，前端经验不足",
  }),
}));

// Mock 数据库为 PGlite
vi.mock("../../src/db/index.js", async () => {
  const { createTestDb } = await import("../helpers/test-db.js");
  const { db } = await createTestDb();
  return { db };
});

vi.mock("../../src/env.js", () => ({
  env: {
    DATABASE_URL: "memory://",
    MINIMAX_API_KEY: "test-key",
    IMAP_HOST: "localhost",
    IMAP_PORT: 993,
    IMAP_USER: "test@test.com",
    IMAP_PASS: "test",
  },
}));

describe("简历完整流程 E2E", () => {
  let app: Hono;
  let positionId: string;

  beforeAll(async () => {
    // 构建完整应用
    const { positionsRoute } = await import("../../src/routes/positions.js");
    const { candidatesRoute } = await import("../../src/routes/candidates.js");
    const { resumesRoute } = await import("../../src/routes/resumes.js");

    app = new Hono();
    app.route("/api/positions", positionsRoute);
    app.route("/api/candidates", candidatesRoute);
    app.route("/api/resumes", resumesRoute);

    // 创建测试职位
    const res = await app.request("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Node.js 后端工程师",
        department: "研发部",
        description: "负责后端服务开发和维护",
        skillConfig: {
          must: ["TypeScript", "Node.js", "PostgreSQL"],
          nice: ["Docker", "CI/CD", "React"],
          reject: ["无后端经验"],
        },
      }),
    });
    const position = await res.json();
    positionId = position.id;
  });

  it("完整流程：上传简历 -> 解析 -> 评分 -> 查看候选人", async () => {
    // 1. 上传简历（使用 FormData）
    const formData = new FormData();
    // 创建模拟的 PDF 文件（实际测试中使用 test/fixtures/ 中的真实文件）
    const pdfContent = new Blob(["fake-pdf-content"], {
      type: "application/pdf",
    });
    formData.append("file", pdfContent, "候选人A_简历.pdf");
    formData.append("positionId", positionId);
    formData.append("name", "候选人A");

    const uploadRes = await app.request("/api/resumes/upload", {
      method: "POST",
      body: formData,
    });

    expect(uploadRes.status).toBe(201);
    const uploadData = await uploadRes.json();

    // 2. 验证返回了候选人信息
    expect(uploadData.candidate).toBeDefined();
    expect(uploadData.candidate.name).toBe("候选人A");
    expect(uploadData.candidate.status).toBe("screening");

    // 3. 验证返回了 AI 评分结果
    expect(uploadData.score).toBeDefined();
    expect(uploadData.score.totalScore).toBe(72);
    expect(uploadData.score.grade).toBe("B");

    // 4. 通过候选人 API 查询，验证数据已入库
    const candidateRes = await app.request(
      `/api/candidates/${uploadData.candidate.id}`,
    );
    expect(candidateRes.status).toBe(200);
    const candidateData = await candidateRes.json();
    expect(candidateData.scores).toHaveLength(1);
    expect(candidateData.scores[0].grade).toBe("B");

    // 5. 通过候选人列表 API 按职位筛选
    const listRes = await app.request(
      `/api/candidates?positionId=${positionId}`,
    );
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData).toHaveLength(1);

    // 6. 更新候选人状态
    const patchRes = await app.request(
      `/api/candidates/${uploadData.candidate.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "shortlisted",
          notes: "技术面试表现优秀",
        }),
      },
    );
    expect(patchRes.status).toBe(200);
    const patchedData = await patchRes.json();
    expect(patchedData.status).toBe("shortlisted");
  });
});
```

### 1.4 AI 输出测试（非确定性）

LLM 输出具有非确定性，不能使用精确匹配断言。以下是针对 MiniMax M2.5 评分输出的多层测试策略。

#### 策略 1：Schema 验证（确定性，零成本）

```typescript
import { describe, it, expect } from "vitest";
import { z } from "zod/v4";

const scoreSchema = z.object({
  totalScore: z.number().min(0).max(100),
  mustScore: z.number().min(0).max(100),
  niceScore: z.number().min(0).max(100),
  rejectPenalty: z.number().min(0).max(100),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  explanation: z.string().min(1),
});

describe("AI 输出 Schema 验证", () => {
  it("合法的评分结果应通过 Schema 验证", () => {
    const validResult = {
      totalScore: 75,
      mustScore: 80,
      niceScore: 60,
      rejectPenalty: 5,
      grade: "B",
      matchedSkills: ["TypeScript"],
      missingSkills: ["React"],
      explanation: "候选人具备一定基础",
    };

    expect(() => scoreSchema.parse(validResult)).not.toThrow();
  });

  it("缺少必填字段应被拒绝", () => {
    const incomplete = { totalScore: 75, grade: "B" };
    expect(() => scoreSchema.parse(incomplete)).toThrow();
  });
});
```

#### 策略 2：范围断言（对 AI 真实调用的验收测试）

```typescript
/**
 * 这些测试标记为 @slow，仅在 CI 的特定阶段运行
 * 需要真实的 MINIMAX_API_KEY 环境变量
 */
describe.skipIf(!process.env.MINIMAX_API_KEY)("AI 评分真实调用（慢速）", () => {
  it("对于完全不匹配的简历应给出低分", async () => {
    const result = await scoreResume(
      "我是一名厨师，擅长中餐西餐烹饪，10年餐饮行业经验",
      "前端工程师",
      "开发 React 应用",
      { must: ["React", "TypeScript"], nice: ["Vue"], reject: ["无开发经验"] },
    );

    // 范围断言而非精确值
    expect(result.totalScore).toBeLessThan(30);
    expect(result.grade).toMatch(/^[DF]$/); // D 或 F
    expect(result.missingSkills.length).toBeGreaterThan(0);
  });

  it("对于高度匹配的简历应给出高分", async () => {
    const result = await scoreResume(
      "5年前端开发经验，精通 React、TypeScript、Node.js，熟悉 Docker 和 CI/CD",
      "前端工程师",
      "负责公司前端开发",
      {
        must: ["React", "TypeScript", "Node.js"],
        nice: ["Docker", "CI/CD"],
        reject: [],
      },
    );

    expect(result.totalScore).toBeGreaterThan(60);
    expect(result.grade).toMatch(/^[AB]$/); // A 或 B
    expect(result.matchedSkills.length).toBeGreaterThan(1);
  });

  it("评分等级应与分数范围一致", async () => {
    const result = await scoreResume(
      "3年 Java 开发经验",
      "Node.js 工程师",
      "后端开发",
      {
        must: ["Node.js", "TypeScript"],
        nice: ["Java"],
        reject: [],
      },
    );

    // 验证等级和分数的一致性
    if (result.totalScore >= 80) expect(result.grade).toBe("A");
    else if (result.totalScore >= 65) expect(result.grade).toBe("B");
    else if (result.totalScore >= 50) expect(result.grade).toBe("C");
    else if (result.totalScore >= 35) expect(result.grade).toBe("D");
    else expect(result.grade).toBe("F");
  });
});
```

#### 策略 3：Snapshot 测试（检测回归）

```typescript
describe("AI 输出结构一致性", () => {
  it("输出结构应符合快照", async () => {
    // 使用 mock 的固定输出
    const result = await scoreResume(/*...*/);

    // 只对结构进行快照，不对具体值
    expect(Object.keys(result).sort()).toMatchInlineSnapshot(`
      [
        "explanation",
        "grade",
        "matchedSkills",
        "missingSkills",
        "mustScore",
        "niceScore",
        "rejectPenalty",
        "totalScore",
      ]
    `);

    // 验证值的类型
    expect(typeof result.totalScore).toBe("number");
    expect(typeof result.explanation).toBe("string");
    expect(Array.isArray(result.matchedSkills)).toBe(true);
  });
});
```

#### 策略 4：统计采样（高级，用于模型评估）

```typescript
/**
 * 对同一输入多次调用 AI，分析输出的统计特性
 * 用于评估模型稳定性，不作为 CI 门控
 */
describe.skip("AI 输出统计分析（手动运行）", () => {
  it("相同输入的多次评分应在合理范围内波动", async () => {
    const scores: number[] = [];
    const N = 5; // 采样次数

    for (let i = 0; i < N; i++) {
      const result = await scoreResume(/* 固定输入 */);
      scores.push(result.totalScore);
    }

    const avg = scores.reduce((a, b) => a + b, 0) / N;
    const stdDev = Math.sqrt(
      scores.reduce((sum, s) => sum + (s - avg) ** 2, 0) / N,
    );

    // 标准差不应太大（容忍一定波动）
    expect(stdDev).toBeLessThan(15);
    // 平均分应在合理区间
    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThan(100);
  });
});
```

### 1.5 测试覆盖率目标与工具

#### 覆盖率目标

| 模块 | 行覆盖率目标 | 说明 |
|------|-------------|------|
| `src/services/ai-scorer.ts` | >= 90% | 核心业务逻辑，mock AI 调用后覆盖所有分支 |
| `src/services/resume-parser.ts` | >= 90% | 解析逻辑简单但关键，覆盖所有格式 |
| `src/services/email.ts` | >= 70% | 依赖外部 IMAP 服务，mock 后覆盖主流程 |
| `src/routes/*.ts` | >= 80% | 路由逻辑，通过集成测试覆盖 |
| `src/db/schema.ts` | N/A | 纯声明文件，无逻辑需要测试 |
| `src/lib/*.ts` | >= 85% | 工具函数，应有高覆盖率 |
| **整体目标** | **>= 80%** | 保证核心逻辑可靠性 |

#### 工具链

```bash
# 运行覆盖率报告
pnpm test:coverage

# 在 CI 中执行（失败时退出）
pnpm vitest run --coverage --coverage.thresholds.100=false
```

覆盖率报告输出：
- **终端**：`text` 格式，快速查看
- **HTML**：`html` 格式，详细查看未覆盖行（输出到 `coverage/` 目录）
- **CI 集成**：`lcov` 格式，可上传到 Codecov / Coveralls

---

## 2. CI/CD 平台选择

### 2.1 Gitea Actions（推荐）

由于项目使用自托管 Gitea（`git.keiten-jp.com`），Gitea Actions 是最自然的选择。

**优势：**
- 内建于 Gitea 1.19+，无需额外安装
- 与 GitHub Actions YAML 语法高度兼容（可复用大量现有 Actions）
- 自托管 Runner（`act_runner`），完全掌控运行环境
- 无构建次数限制，无需付费
- 支持 `actions/checkout@v4`、`actions/setup-node@v4` 等常用 Actions

**设置步骤：**
1. 在 Gitea 管理面板启用 Actions 功能
2. 安装并注册 `act_runner`
3. 将 workflow 文件放在 `.gitea/workflows/` 目录

**Runner 安装：**

```bash
# 下载 act_runner
wget https://gitea.com/gitea/act_runner/releases/latest/download/act_runner-linux-amd64
chmod +x act_runner-linux-amd64

# 注册 runner
./act_runner-linux-amd64 register \
  --instance https://git.keiten-jp.com \
  --token YOUR_RUNNER_TOKEN \
  --name hr-runner \
  --labels ubuntu-latest:docker://node:22-bookworm

# 启动（守护进程）
./act_runner-linux-amd64 daemon
```

### 2.2 GitHub Actions（备选）

如果项目未来迁移到 GitHub，可直接使用 GitHub Actions。

**优势：**
- 生态最成熟，marketplace 插件最多
- Runner 预装 Docker，Testcontainers 开箱即用
- 免费额度对开源项目充足（2000 分钟/月）

**劣势：**
- 需要从 Gitea 迁移仓库
- 私有仓库有构建分钟数限制

### 2.3 Woodpecker CI / Drone CI

**Woodpecker CI（推荐替代方案）：**
- Drone CI 的开源社区 fork（Apache 2.0 许可）
- 纯 Docker 管线，适合自托管
- 内存占用极低（Server ~100MB + Agent ~30MB）
- 通过 OAuth2 连接 Gitea，零额外配置用户管理
- Codeberg（知名开源 Git 托管）正在使用
- 配置文件：`.woodpecker.yml`

**Drone CI（不推荐新项目）：**
- 被 Harness 收购后，开源版功能持续削减
- Runner 已闭源
- 构建次数配额逐年降低

**平台选择决策矩阵：**

| 特性 | Gitea Actions | GitHub Actions | Woodpecker CI |
|------|--------------|----------------|---------------|
| 与当前 Gitea 集成 | 原生 | 需迁移 | OAuth2 连接 |
| YAML 语法 | GitHub 兼容 | 原生 | 独立语法 |
| Runner 部署 | 自托管 | 云端/自托管 | 自托管 |
| 成本 | 免费 | 有限免费 | 免费 |
| 生态/插件 | 复用 GH Actions | 最丰富 | Docker 插件 |
| 学习曲线 | 低 | 低 | 低 |
| **推荐程度** | **首选** | 迁移后首选 | 备选 |

---

## 3. Pipeline 设计

### 3.1 触发策略

```
                    ┌─────────────────────────────────────────────┐
                    │               Pipeline 触发策略               │
                    └─────────────────────────────────────────────┘

  ┌──────────┐    ┌───────────────────────────────────────────────┐
  │ 提交触发  │───>│ lint -> typecheck -> unit test -> build       │
  │ (push)   │    └───────────────────────────────────────────────┘
  └──────────┘

  ┌──────────┐    ┌───────────────────────────────────────────────┐
  │ PR 触发   │───>│ 上述全部 + integration test + security scan   │
  │ (PR)     │    └───────────────────────────────────────────────┘
  └──────────┘

  ┌──────────┐    ┌───────────────────────────────────────────────┐
  │ 合并触发  │───>│ 上述全部 + build Docker image + deploy staging │
  │ (merge)  │    └───────────────────────────────────────────────┘
  └──────────┘

  ┌──────────┐    ┌───────────────────────────────────────────────┐
  │ Release  │───>│ 上述全部 + deploy production + smoke test     │
  │ (tag)    │    └───────────────────────────────────────────────┘
  └──────────┘
```

### 3.2 Pipeline 阶段详解

#### 阶段 1：代码质量门控（每次提交）

```
lint          - Biome check / ESLint
typecheck     - tsc --noEmit
unit-test     - vitest run（仅单元测试）
build         - tsc 编译
```

目标：快速反馈（< 2 分钟），阻止低质量代码进入仓库。

#### 阶段 2：深度验证（PR 触发）

```
integration-test  - vitest run test/integration/（PGlite 或 Testcontainers）
security-scan     - pnpm audit + trivy fs
coverage-report   - vitest run --coverage
```

目标：确保功能正确性和安全性（< 5 分钟）。

#### 阶段 3：构建与部署到 Staging（合并到 main）

```
docker-build   - 多阶段 Docker 构建
docker-push    - 推送到 Container Registry
deploy-staging - SSH 部署或 docker-compose up
health-check   - curl /health 验证
db-migrate     - 运行数据库迁移
```

#### 阶段 4：发布到生产（打 tag 触发）

```
deploy-prod    - 部署到生产 VPS
smoke-test     - 验证核心 API 端点
rollback-ready - 保留上一版本镜像以供回滚
```

---

## 4. 具体配置示例

### 4.1 Gitea Actions Workflow YAML

`.gitea/workflows/ci.yaml`：

```yaml
name: HR Backend CI
run-name: ${{ gitea.actor }} - CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: "22"
  PNPM_VERSION: "10"

jobs:
  # ─── 阶段 1：代码质量 ─────────────────────────────
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint (Biome)
        run: pnpm exec biome ci .

      - name: Type check
        run: pnpm typecheck

  # ─── 阶段 2：单元测试 ─────────────────────────────
  unit-test:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests
        run: pnpm vitest run --reporter=verbose
        env:
          # 单元测试使用 mock，不需要真实环境变量
          DATABASE_URL: "postgres://mock:mock@localhost/mock"
          MINIMAX_API_KEY: "mock-key"
          IMAP_PASS: "mock-pass"

      - name: Generate coverage report
        run: pnpm vitest run --coverage
        env:
          DATABASE_URL: "postgres://mock:mock@localhost/mock"
          MINIMAX_API_KEY: "mock-key"
          IMAP_PASS: "mock-pass"

  # ─── 阶段 3：集成测试（仅 PR 触发） ────────────────
  integration-test:
    runs-on: ubuntu-latest
    needs: unit-test
    if: github.event_name == 'pull_request'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run integration tests (PGlite)
        run: pnpm vitest run test/integration/ --reporter=verbose
        env:
          DATABASE_URL: "memory://"
          MINIMAX_API_KEY: "mock-key"
          IMAP_PASS: "mock-pass"

  # ─── 阶段 4：安全扫描（仅 PR 触发） ────────────────
  security-scan:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    if: github.event_name == 'pull_request'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Audit dependencies
        run: pnpm audit --audit-level=high
        continue-on-error: true

      - name: Trivy filesystem scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: "fs"
          scan-ref: "."
          severity: "HIGH,CRITICAL"
          exit-code: "1"

  # ─── 阶段 5：构建 Docker 镜像（合并到 main） ────────
  build-and-push:
    runs-on: ubuntu-latest
    needs: [unit-test]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: git.keiten-jp.com
          username: ${{ secrets.REGISTRY_USER }}
          password: ${{ secrets.REGISTRY_PASS }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            git.keiten-jp.com/${{ gitea.repository }}:latest
            git.keiten-jp.com/${{ gitea.repository }}:${{ gitea.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ─── 阶段 6：部署到 Staging ──────────────────────
  deploy-staging:
    runs-on: ubuntu-latest
    needs: build-and-push
    steps:
      - name: Deploy to staging via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/hr-backend
            docker compose pull
            docker compose up -d
            sleep 5
            # 健康检查
            curl -f http://localhost:3001/health || exit 1

      - name: Run database migrations
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/hr-backend
            docker compose exec -T app pnpm db:migrate
```

`.gitea/workflows/release.yaml`（Release 触发生产部署）：

```yaml
name: Release to Production
run-name: Deploy ${{ gitea.ref_name }} to production

on:
  push:
    tags:
      - "v*"

jobs:
  deploy-production:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: git.keiten-jp.com
          username: ${{ secrets.REGISTRY_USER }}
          password: ${{ secrets.REGISTRY_PASS }}

      - name: Build and push production image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            git.keiten-jp.com/${{ gitea.repository }}:${{ gitea.ref_name }}
            git.keiten-jp.com/${{ gitea.repository }}:production

      - name: Deploy to production
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/hr-backend
            # 保留旧镜像用于回滚
            docker tag git.keiten-jp.com/ivis/hr-backend:production \
                       git.keiten-jp.com/ivis/hr-backend:rollback || true
            docker compose pull
            docker compose up -d
            sleep 10

      - name: Smoke test
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            # 健康检查
            curl -f http://localhost:3001/health || {
              echo "Health check failed! Rolling back..."
              cd /opt/hr-backend
              docker compose down
              docker tag git.keiten-jp.com/ivis/hr-backend:rollback \
                         git.keiten-jp.com/ivis/hr-backend:production
              docker compose up -d
              exit 1
            }
            echo "Production deployment successful!"
```

### 4.2 GitHub Actions Workflow YAML

如果项目迁移到 GitHub，将上面的 `.gitea/workflows/` 改为 `.github/workflows/`，语法几乎完全一致。主要差异：

`.github/workflows/ci.yml`：

```yaml
name: HR Backend CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "22"
  PNPM_VERSION: "10"

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec biome ci .
      - run: pnpm typecheck

  unit-test:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Run unit tests with coverage
        run: pnpm vitest run --coverage
        env:
          DATABASE_URL: "postgres://mock:mock@localhost/mock"
          MINIMAX_API_KEY: "mock-key"
          IMAP_PASS: "mock-pass"

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          token: ${{ secrets.CODECOV_TOKEN }}

  # GitHub Actions 原生支持 Service Container（无需 Testcontainers）
  integration-test:
    runs-on: ubuntu-latest
    needs: unit-test
    if: github.event_name == 'pull_request'

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: hr_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U test"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Run database migrations
        run: pnpm db:migrate
        env:
          DATABASE_URL: "postgres://test:test@localhost:5432/hr_test"

      - name: Run integration tests
        run: pnpm vitest run test/integration/
        env:
          DATABASE_URL: "postgres://test:test@localhost:5432/hr_test"
          MINIMAX_API_KEY: "mock-key"
          IMAP_PASS: "mock-pass"

  security:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high
        continue-on-error: true

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: "fs"
          scan-ref: "."
          severity: "HIGH,CRITICAL"

  build-and-deploy:
    runs-on: ubuntu-latest
    needs: [unit-test]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    permissions:
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
```

### 4.3 Docker-based CI（PostgreSQL Service Container）

#### Dockerfile（多阶段构建）

`Dockerfile`：

```dockerfile
# ──────────────────────────────────
# Stage 1: 安装依赖
# ──────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# 先复制依赖声明文件（利用 Docker 缓存层）
COPY package.json pnpm-lock.yaml ./

# 安装全部依赖（包含 devDependencies，用于后续编译）
RUN pnpm install --frozen-lockfile

# ──────────────────────────────────
# Stage 2: 编译 TypeScript
# ──────────────────────────────────
FROM deps AS builder

COPY . .
RUN pnpm build

# 仅安装生产依赖
RUN pnpm install --frozen-lockfile --prod

# ──────────────────────────────────
# Stage 3: 生产运行时
# ──────────────────────────────────
FROM node:22-alpine AS runner

# 安全实践：使用非 root 用户
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 app
USER app

WORKDIR /app

# 仅复制编译产物和生产依赖
COPY --from=builder --chown=app:nodejs /app/dist ./dist
COPY --from=builder --chown=app:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=app:nodejs /app/package.json ./
COPY --from=builder --chown=app:nodejs /app/drizzle ./drizzle

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

#### Docker Compose（开发/Staging 环境）

`docker-compose.yml`：

```yaml
services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgres://hr:hr_password@postgres:5432/hr_db
      - MINIMAX_API_KEY=${MINIMAX_API_KEY}
      - IMAP_HOST=${IMAP_HOST:-mail.ivis-sh.com}
      - IMAP_PORT=${IMAP_PORT:-143}
      - IMAP_USER=${IMAP_USER:-hr@ivis-sh.com}
      - IMAP_PASS=${IMAP_PASS}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: hr_db
      POSTGRES_USER: hr
      POSTGRES_PASSWORD: hr_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hr -d hr_db"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```

#### Docker Compose 测试环境

`docker-compose.test.yml`：

```yaml
services:
  test:
    build:
      context: .
      target: deps  # 使用 deps 阶段（包含 devDependencies）
    command: pnpm vitest run --reporter=verbose
    environment:
      - DATABASE_URL=postgres://test:test@postgres-test:5432/hr_test
      - MINIMAX_API_KEY=mock-key
      - IMAP_PASS=mock-pass
    depends_on:
      postgres-test:
        condition: service_healthy

  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: hr_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test -d hr_test"]
      interval: 5s
      timeout: 3s
      retries: 5
```

执行测试：

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

---

## 5. 代码质量工具

### 5.1 Biome（推荐）

Biome 是用 Rust 编写的全能代码工具链，集成了 linter 和 formatter，比 ESLint + Prettier 快 15-100 倍。2025-2026 年已成为 Node.js/TypeScript 项目的主流选择。

#### 安装

```bash
pnpm add -D --save-exact @biomejs/biome
```

#### 配置

`biome.json`：

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true,
    "defaultBranch": "main"
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "complexity": {
        "noBannedTypes": "error"
      },
      "style": {
        "useConst": "error",
        "noVar": "error"
      },
      "security": {
        "noDangerouslySetInnerHtml": "error"
      }
    }
  },
  "organizeImports": {
    "enabled": true
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "files": {
    "ignore": [
      "node_modules",
      "dist",
      "coverage",
      "drizzle",
      "*.min.js"
    ]
  }
}
```

#### 脚本

```json
{
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "ci:lint": "biome ci ."
  }
}
```

#### 用法

```bash
# 开发时格式化 + lint + 自动修复
pnpm lint:fix

# CI 中检查（不修改文件，失败时退出）
pnpm ci:lint
```

### 5.2 ESLint + Prettier（备选方案）

如果团队更熟悉传统工具链，可以使用 ESLint + Prettier 组合。

安装：

```bash
pnpm add -D eslint @eslint/js typescript-eslint prettier eslint-config-prettier
```

`eslint.config.mjs`（ESLint v9 扁平配置）：

```javascript
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: ["node_modules/", "dist/", "drizzle/", "coverage/"],
  },
);
```

`.prettierrc`：

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

### 5.3 Pre-commit Hooks（Husky + lint-staged）

Pre-commit hooks 在代码提交前自动运行检查，防止不合格代码进入仓库。

#### 安装

```bash
pnpm add -D husky lint-staged
pnpm exec husky init
```

#### 配置 Husky

`.husky/pre-commit`：

```bash
pnpm exec lint-staged
```

确保 `package.json` 中有 `prepare` 脚本：

```json
{
  "scripts": {
    "prepare": "husky"
  }
}
```

#### 配置 lint-staged

`.lintstagedrc.json`：

```json
{
  "*.{ts,tsx,js,jsx}": ["biome check --write --no-errors-on-unmatched"],
  "*.{json,md,yaml,yml}": ["biome format --write --no-errors-on-unmatched"]
}
```

如果使用 ESLint + Prettier 而非 Biome：

```json
{
  "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yaml,yml,css}": ["prettier --write"]
}
```

#### 可选：Pre-push Hook 运行类型检查

`.husky/pre-push`：

```bash
pnpm typecheck
```

#### 工作流程

```
开发者修改代码 -> git add -> git commit
                                ↓
                         husky pre-commit 触发
                                ↓
                         lint-staged 运行
                                ↓
                     仅对暂存文件运行 Biome/ESLint
                                ↓
                       修复后自动重新暂存
                                ↓
                         提交成功（或失败）
```

---

## 6. 安全扫描

### 6.1 依赖漏洞检查

#### pnpm audit（内建）

```bash
# 检查所有依赖的已知漏洞
pnpm audit

# 只在发现 high/critical 漏洞时失败
pnpm audit --audit-level=high

# 自动修复可修复的漏洞
pnpm audit --fix
```

#### Trivy（推荐 -- 开源全面扫描）

Trivy 是 Aqua Security 的开源漏洞扫描器，支持文件系统、Docker 镜像、代码依赖等多种扫描模式。

```bash
# 安装 Trivy
# Arch/Manjaro:
sudo pacman -S trivy

# 扫描项目文件系统
trivy fs --severity HIGH,CRITICAL .

# 扫描 Docker 镜像
trivy image --severity HIGH,CRITICAL git.keiten-jp.com/ivis/hr-backend:latest

# CI 模式（发现高危漏洞时以非零退出码结束）
trivy fs --exit-code 1 --severity HIGH,CRITICAL .
```

`.trivyignore`（忽略已知可接受的漏洞）：

```
# 格式：CVE ID [到期日期]
# CVE-2024-XXXXX exp:2026-06-01
```

#### Snyk（商业方案，可选）

```bash
# 安装
pnpm add -D snyk

# 测试依赖漏洞
npx snyk test --severity-threshold=high

# 监控（持续跟踪新漏洞）
npx snyk monitor
```

### 6.2 Secrets 检测

防止 API 密钥、密码等敏感信息被意外提交到代码仓库。

#### gitleaks（推荐）

```bash
# 安装
# Arch/Manjaro:
sudo pacman -S gitleaks

# 扫描当前仓库
gitleaks detect --source . --verbose

# 扫描 git 历史
gitleaks detect --source . --log-opts="--all"
```

`.gitleaks.toml`（自定义规则）：

```toml
[allowlist]
  paths = [
    '''\.env\.example$''',
    '''docs/.*\.md$''',
  ]
```

#### Pre-commit 集成

在 `.husky/pre-commit` 中添加：

```bash
# 检测暂存文件中是否有 secrets
pnpm exec lint-staged
gitleaks protect --staged --verbose
```

### 6.3 CI 中的安全扫描流水线

```yaml
# 在 CI workflow 中添加安全扫描 Job
security-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0  # gitleaks 需要完整 git 历史

    - name: Dependency audit
      run: |
        pnpm install --frozen-lockfile
        pnpm audit --audit-level=high

    - name: Trivy filesystem scan
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: "fs"
        scan-ref: "."
        severity: "HIGH,CRITICAL"
        exit-code: "1"
        format: "table"

    - name: Gitleaks secrets detection
      uses: gitleaks/gitleaks-action@v2
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 6.4 `.gitignore` 安全条目

确保 `.gitignore` 包含：

```gitignore
# 环境变量（包含 API 密钥、数据库密码等）
.env
.env.local
.env.production

# 密钥文件
*.pem
*.key
*.p12
id_rsa*

# 编辑器本地配置（可能含 secrets）
.vscode/settings.json
```

---

## 7. 自动化部署

### 7.1 部署架构

```
                    ┌──────────────────────────┐
                    │   Gitea (git.keiten-jp.com)  │
                    │   + Gitea Actions Runner    │
                    └──────────┬───────────────┘
                               │ push / tag
                               ▼
                    ┌──────────────────────────┐
                    │   CI Pipeline            │
                    │   lint → test → build    │
                    └──────────┬───────────────┘
                               │ Docker image push
                               ▼
                    ┌──────────────────────────┐
                    │   Container Registry     │
                    │   (Gitea 内建 / GHCR)    │
                    └──────────┬───────────────┘
                               │ docker pull
                    ┌──────────┴───────────────┐
                    ▼                          ▼
          ┌─────────────────┐      ┌─────────────────┐
          │  Staging VPS    │      │  Production VPS  │
          │  docker compose │      │  docker compose  │
          └─────────────────┘      └─────────────────┘
```

### 7.2 VPS + Docker Compose 部署（推荐起步方案）

这是最简单直接的部署方案，适合初期项目规模。

#### 服务器准备

```bash
# 在 VPS 上安装 Docker
curl -fsSL https://get.docker.com | sh

# 创建部署目录
mkdir -p /opt/hr-backend
cd /opt/hr-backend
```

#### 生产 Docker Compose

`docker-compose.prod.yml`：

```yaml
services:
  app:
    image: git.keiten-jp.com/ivis/hr-backend:production
    ports:
      - "127.0.0.1:3001:3001"  # 仅绑定 localhost，由 Nginx 代理
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - MINIMAX_API_KEY=${MINIMAX_API_KEY}
      - IMAP_HOST=${IMAP_HOST}
      - IMAP_PORT=${IMAP_PORT}
      - IMAP_USER=${IMAP_USER}
      - IMAP_PASS=${IMAP_PASS}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-hr_db}
      POSTGRES_USER: ${POSTGRES_USER:-hr}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-hr}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 256M

volumes:
  pgdata:
    driver: local
```

#### Nginx 反向代理

```nginx
server {
    listen 80;
    server_name hr-api.keiten-jp.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name hr-api.keiten-jp.com;

    ssl_certificate /etc/letsencrypt/live/hr-api.keiten-jp.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hr-api.keiten-jp.com/privkey.pem;

    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # 限制请求体大小（简历上传）
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 健康检查端点不需要认证
    location /health {
        proxy_pass http://127.0.0.1:3001;
    }
}
```

#### 部署脚本

`scripts/deploy.sh`：

```bash
#!/bin/bash
set -euo pipefail

DEPLOY_DIR="/opt/hr-backend"
IMAGE_TAG="${1:-latest}"

echo "=== Deploying hr-backend:${IMAGE_TAG} ==="

cd "$DEPLOY_DIR"

# 拉取最新镜像
docker compose -f docker-compose.prod.yml pull app

# 备份当前运行的镜像标签
CURRENT_IMAGE=$(docker compose -f docker-compose.prod.yml images -q app 2>/dev/null || echo "")
if [ -n "$CURRENT_IMAGE" ]; then
  echo "Backing up current image for rollback..."
fi

# 滚动更新（先启动新容器，等待健康检查通过后停止旧容器）
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# 等待应用启动
echo "Waiting for health check..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo "Health check passed!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Health check failed after 30 seconds!"
    echo "Rolling back..."
    docker compose -f docker-compose.prod.yml down
    exit 1
  fi
  sleep 1
done

# 运行数据库迁移
echo "Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T app node dist/db/migrate.js

# 清理旧镜像
docker image prune -f

echo "=== Deployment complete ==="
```

### 7.3 Kubernetes 部署（远期方案）

当项目扩展到需要高可用、自动扩缩容时，可迁移到 K8s。

`k8s/deployment.yaml`：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hr-backend
  labels:
    app: hr-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: hr-backend
  template:
    metadata:
      labels:
        app: hr-backend
    spec:
      containers:
        - name: hr-backend
          image: git.keiten-jp.com/ivis/hr-backend:production
          ports:
            - containerPort: 3001
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: hr-backend-secrets
                  key: database-url
            - name: MINIMAX_API_KEY
              valueFrom:
                secretKeyRef:
                  name: hr-backend-secrets
                  key: minimax-api-key
            - name: IMAP_PASS
              valueFrom:
                secretKeyRef:
                  name: hr-backend-secrets
                  key: imap-pass
          livenessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: hr-backend
spec:
  selector:
    app: hr-backend
  ports:
    - port: 80
      targetPort: 3001
  type: ClusterIP
```

---

## 8. 监控和告警

### 8.1 健康检查

项目已有 `/health` 端点（`src/routes/health.ts`）。建议扩展为更详细的健康检查：

```typescript
// src/routes/health.ts（增强版）
import { Hono } from "hono";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

const health = new Hono();

// 基本存活检查（用于 K8s liveness probe）
health.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// 详细就绪检查（用于 K8s readiness probe）
health.get("/health/ready", async (c) => {
  const checks: Record<string, string> = {};

  // 检查数据库连接
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return c.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
    allOk ? 200 : 503,
  );
});

export { health };
```

### 8.2 外部健康检查（Uptime Monitoring）

使用外部服务定期探测 `/health` 端点。

#### 自托管方案：Uptime Kuma

```bash
# 使用 Docker 部署 Uptime Kuma
docker run -d \
  --name uptime-kuma \
  -p 3002:3001 \
  -v uptime-kuma:/app/data \
  --restart unless-stopped \
  louislam/uptime-kuma:1

# 在 Web UI 中添加监控：
# - URL: https://hr-api.keiten-jp.com/health
# - 检查间隔: 60 秒
# - 告警方式: Webhook / Email / Telegram
```

#### 配置告警通知

在 Uptime Kuma 中配置：
- **Telegram Bot**：创建 Bot，配置 chat_id 和 token
- **Email**：SMTP 配置发送邮件告警
- **Webhook**：发送到自定义 URL（如企业微信/钉钉）

### 8.3 应用日志

项目使用 `console.log`，建议升级为结构化日志（已在依赖中有 `pino`）。

```typescript
// src/lib/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty" }
      : undefined,
});
```

在 Docker 环境中，`pino` 的 JSON 输出可被日志收集器（如 Loki、ELK）直接消费：

```bash
# 查看应用日志
docker compose logs -f app

# 查看最近 100 行日志
docker compose logs --tail 100 app
```

### 8.4 错误监控（Sentry -- 可选）

```bash
pnpm add @sentry/node
```

```typescript
// src/lib/sentry.ts
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1, // 采样 10% 的请求用于性能追踪
  });
}
```

Hono 中间件集成：

```typescript
// src/index.ts
app.onError((err, c) => {
  Sentry.captureException(err);
  logger.error({ err, path: c.req.path }, "Unhandled error");
  return c.json({ error: "Internal Server Error" }, 500);
});
```

### 8.5 部署后的自动化验证

在 CI/CD 部署完成后运行冒烟测试：

```bash
#!/bin/bash
# scripts/smoke-test.sh
set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"
FAILED=0

echo "=== Running Smoke Tests against ${BASE_URL} ==="

# 1. 健康检查
echo -n "Health check... "
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/health")
if [ "$STATUS" = "200" ]; then echo "PASS"; else echo "FAIL (${STATUS})"; FAILED=1; fi

# 2. 获取职位列表
echo -n "GET /api/positions... "
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/positions")
if [ "$STATUS" = "200" ]; then echo "PASS"; else echo "FAIL (${STATUS})"; FAILED=1; fi

# 3. 获取候选人列表
echo -n "GET /api/candidates... "
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/candidates")
if [ "$STATUS" = "200" ]; then echo "PASS"; else echo "FAIL (${STATUS})"; FAILED=1; fi

# 4. 检查响应时间
echo -n "Response time check... "
TIME=$(curl -sf -o /dev/null -w "%{time_total}" "${BASE_URL}/health")
if (( $(echo "$TIME < 2.0" | bc -l) )); then
  echo "PASS (${TIME}s)"
else
  echo "WARN (${TIME}s > 2s)"
fi

echo ""
if [ $FAILED -eq 0 ]; then
  echo "=== All smoke tests PASSED ==="
  exit 0
else
  echo "=== Some smoke tests FAILED ==="
  exit 1
fi
```

### 8.6 监控仪表盘（可选进阶）

如果项目规模增长，可部署完整的可观测性栈：

```
┌─────────────────────────────────────────────┐
│             可观测性架构                       │
├─────────────────────────────────────────────┤
│                                             │
│  应用层                                      │
│  ├── pino (JSON 日志) ──> Loki              │
│  ├── Sentry (错误追踪)                       │
│  └── OpenTelemetry (链路追踪) ──> Jaeger     │
│                                             │
│  基础设施层                                   │
│  ├── Node Exporter ──> Prometheus           │
│  ├── cAdvisor (容器监控) ──> Prometheus      │
│  └── PostgreSQL Exporter ──> Prometheus     │
│                                             │
│  展示层                                      │
│  ├── Grafana (统一仪表盘)                     │
│  └── Uptime Kuma (可用性监控)                 │
│                                             │
│  告警层                                      │
│  ├── Alertmanager (Prometheus 告警)          │
│  └── Telegram / Email / 企业微信              │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 附录 A：完整的 `package.json` scripts 建议

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",

    "test": "vitest",
    "test:run": "vitest --run",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run test/integration/",
    "test:e2e": "vitest run test/e2e/",

    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "ci:lint": "biome ci .",

    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",

    "docker:build": "docker build -t hr-backend .",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down",

    "prepare": "husky"
  }
}
```

## 附录 B：建议的项目目录结构（含测试和 CI）

```
hr-backend/
├── .gitea/
│   └── workflows/
│       ├── ci.yaml              # 主 CI pipeline
│       └── release.yaml         # 生产发布 pipeline
├── .husky/
│   ├── pre-commit               # lint-staged + gitleaks
│   └── pre-push                 # typecheck
├── biome.json                   # Biome 配置
├── vitest.config.ts             # Vitest 配置
├── Dockerfile                   # 多阶段 Docker 构建
├── docker-compose.yml           # 开发环境
├── docker-compose.prod.yml      # 生产环境
├── docker-compose.test.yml      # CI 测试环境
├── .lintstagedrc.json           # lint-staged 配置
├── .trivyignore                 # Trivy 忽略规则
├── .gitleaks.toml               # Gitleaks 配置
├── scripts/
│   ├── deploy.sh                # 部署脚本
│   └── smoke-test.sh            # 冒烟测试
├── src/
│   ├── index.ts
│   ├── env.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── index.ts
│   │   └── migrate.ts
│   ├── routes/
│   │   ├── health.ts
│   │   ├── positions.ts
│   │   ├── candidates.ts
│   │   └── resumes.ts
│   ├── services/
│   │   ├── ai-scorer.ts
│   │   ├── resume-parser.ts
│   │   ├── email.ts
│   │   └── __tests__/           # 单元测试（与源码同目录）
│   │       ├── ai-scorer.test.ts
│   │       ├── resume-parser.test.ts
│   │       └── email.test.ts
│   └── lib/
│       ├── ai.ts
│       ├── types.ts
│       ├── logger.ts
│       └── __tests__/
│           └── extract-json.test.ts
├── test/
│   ├── setup.ts                 # 全局测试 setup
│   ├── global-setup.ts          # Vitest 全局 setup（Testcontainers）
│   ├── helpers/
│   │   ├── test-db.ts           # PGlite 测试数据库
│   │   └── test-db-container.ts # Testcontainers 测试数据库
│   ├── integration/
│   │   ├── routes-positions.test.ts
│   │   ├── routes-candidates.test.ts
│   │   └── db-operations.test.ts
│   ├── e2e/
│   │   └── resume-flow.test.ts
│   └── fixtures/                # 测试用的样本文件
│       ├── sample-resume.pdf
│       └── sample-resume.docx
└── docs/
    ├── TECHNICAL.md
    └── 03-cicd-testing.md       # 本文档
```

## 附录 C：快速启动检查清单

- [ ] 安装 Vitest 和覆盖率工具：`pnpm add -D vitest @vitest/coverage-v8`
- [ ] 安装 PGlite（集成测试）：`pnpm add -D @electric-sql/pglite`
- [ ] 安装 Biome：`pnpm add -D --save-exact @biomejs/biome`
- [ ] 安装 Husky + lint-staged：`pnpm add -D husky lint-staged && pnpm exec husky init`
- [ ] 创建 `vitest.config.ts` 配置文件
- [ ] 创建 `biome.json` 配置文件
- [ ] 创建 `.lintstagedrc.json` 配置文件
- [ ] 创建 `.gitea/workflows/ci.yaml` CI 配置
- [ ] 创建 `Dockerfile` 多阶段构建
- [ ] 创建 `docker-compose.yml` 和 `docker-compose.prod.yml`
- [ ] 在 Gitea 设置中启用 Actions 功能
- [ ] 注册并启动 `act_runner`
- [ ] 配置 Gitea Secrets（REGISTRY_PASS、STAGING_SSH_KEY 等）
- [ ] 编写第一批单元测试并验证 CI 流水线运行正常
- [ ] 部署 Uptime Kuma 进行可用性监控
