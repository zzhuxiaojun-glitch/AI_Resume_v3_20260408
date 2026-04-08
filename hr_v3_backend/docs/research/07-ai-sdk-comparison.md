# AI SDK 框架选型与最佳实践

> 文档版本：2026-02-27
> 适用项目：HR 智能简历筛选后端（Bun + Elysia + Drizzle + PostgreSQL + MiniMax AI + Vercel AI SDK）

---

## 目录

1. [背景与选型动机](#1-背景与选型动机)
2. [主流 AI SDK 框架概览](#2-主流-ai-sdk-框架概览)
3. [五大框架横向对比](#3-五大框架横向对比)
4. [选型结论：为什么是 Vercel AI SDK](#4-选型结论为什么是-vercel-ai-sdk)
5. [当前项目实现分析](#5-当前项目实现分析)
6. [最佳实践与模式](#6-最佳实践与模式)
7. [Multi-Agent 演进路线](#7-multi-agent-演进路线)
8. [MCP 集成路线](#8-mcp-集成路线)
9. [Skills 体系设计](#9-skills-体系设计)
10. [分阶段实施计划](#10-分阶段实施计划)

---

## 1. 背景与选型动机

### 1.1 项目现状

本 HR 智能简历筛选后端已完成以下 AI 能力：

| 已实现功能 | 技术方案 |
|-----------|---------|
| 简历 AI 评分 | Vercel AI SDK `generateText` + MiniMax M2.5 |
| PDF/DOCX 简历解析 | pdf-parse + mammoth |
| 邮件简历自动采集 | ImapFlow IMAP 轮询 |
| 结构化输出校验 | Zod Schema 验证 |

### 1.2 未来需求

项目将逐步扩展以下能力，需要验证当前技术选型能否支撑：

- **Multi-Agent**：多个 Agent 协作完成招聘全流程（收简历 → 解析 → 评分 → 面试安排 → 通知）
- **MCP（Model Context Protocol）**：标准化连接外部工具/数据源（邮箱、数据库、日历）
- **Skills**：可复用的原子能力单元（评分、解析、邮件发送等），供不同 Agent 调用

### 1.3 选型原则

| 原则 | 说明 |
|------|------|
| **轻量优先** | 匹配 Bun + Elysia 的轻量技术风格，拒绝过度抽象 |
| **TypeScript 原生** | 一等 TS 类型支持，与项目 strict 模式一致 |
| **Provider 无关** | 可灵活切换 LLM 提供商（MiniMax / Claude / GPT / Gemini） |
| **渐进式复杂度** | 简单场景不引入复杂框架，需要时再按需扩展 |
| **MCP 就绪** | 框架需原生支持或易于集成 MCP 协议 |

---

## 2. 主流 AI SDK 框架概览

### 2.1 Vercel AI SDK

| 属性 | 详情 |
|------|------|
| GitHub | [vercel/ai](https://github.com/vercel/ai) — 22.1k stars |
| 定位 | TypeScript AI 应用工具包 |
| 核心模块 | AI SDK Core（生成/流式/工具调用）+ AI SDK UI（React/Vue/Svelte hooks） |
| 当前版本 | `ai@6.x`，`@ai-sdk/openai@3.x` |

**核心能力：**

```typescript
// 统一的 Provider 接口 — 换模型只需换一行
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, generateObject, streamText } from "ai";

// 文本生成
const { text } = await generateText({ model, prompt: "..." });

// 结构化输出（带 Zod schema 校验）
const { object } = await generateObject({ model, schema: mySchema, prompt: "..." });

// 流式输出
const { textStream } = streamText({ model, prompt: "..." });

// Agent 工具循环
const { text } = await generateText({
  model,
  tools: { searchDB, sendEmail, parseResume },
  maxSteps: 10, // 自动循环直到完成
});
```

**MCP 支持：**

```typescript
import { experimental_createMCPClient } from "ai";

const client = await experimental_createMCPClient({
  transport: { type: "sse", url: "http://localhost:8080/mcp" },
});
const tools = await client.tools(); // 自动发现 MCP Server 暴露的工具
```

### 2.2 LangChain.js

| 属性 | 详情 |
|------|------|
| GitHub | [langchain-ai/langchainjs](https://github.com/langchain-ai/langchainjs) — 17k stars |
| 定位 | 通用 LLM 应用框架 |
| 核心模块 | LCEL 链式调用 + LangGraph 图编排 + LangSmith 可观测性 |
| 当前版本 | `langchain@1.2.x`，`@langchain/core@1.1.x` |

**核心能力：**

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";

// LCEL 管道链
const chain = prompt | model | outputParser;
const result = await chain.invoke({ input: "..." });

// ReAct Agent
import { createReactAgent } from "langchain/agents";
const agent = createReactAgent({ llm: model, tools: [searchTool, calcTool] });

// LangGraph 图工作流
import { StateGraph } from "@langchain/langgraph";
const graph = new StateGraph(stateSchema)
  .addNode("parse", parseNode)
  .addNode("score", scoreNode)
  .addEdge("parse", "score");
```

**优势：** 生态最丰富，200+ 集成，LangGraph 图编排能力强，LangSmith 监控

**劣势：** 抽象层多，学习曲线陡，包体积大，TS 类型推导不如 Vercel AI SDK 严格

### 2.3 LlamaIndex.TS

| 属性 | 详情 |
|------|------|
| GitHub | [run-llama/LlamaIndexTS](https://github.com/run-llama/LlamaIndexTS) — 3.1k stars |
| 定位 | 数据连接 + RAG（检索增强生成）框架 |
| 核心模块 | 文档加载器 + 索引引擎 + 查询引擎 + Agent |
| 当前版本 | `llamaindex@0.x` |

**核心能力：**

```typescript
import { VectorStoreIndex, SimpleDirectoryReader } from "llamaindex";

// 文档索引
const documents = await new SimpleDirectoryReader().loadData("./resumes");
const index = await VectorStoreIndex.fromDocuments(documents);

// 语义查询
const queryEngine = index.asQueryEngine();
const response = await queryEngine.query("找到有 5 年 React 经验的候选人");
```

**优势：** RAG 领域最强，文档加载/切片/索引一站式解决

**劣势：** 偏重数据检索场景，通用 Agent/工具调用能力一般，社区相对较小

### 2.4 Mastra

| 属性 | 详情 |
|------|------|
| GitHub | [mastra-ai/mastra](https://github.com/mastra-ai/mastra) — 21.5k stars |
| 定位 | 全栈 AI Agent 框架（Gatsby 团队出品） |
| 核心模块 | Agent + 图工作流引擎 + Human-in-the-Loop + MCP Server |
| 当前版本 | 活跃开发中 |

**核心能力：**

```typescript
import { Mastra } from "@mastra/core";

// Agent 定义
const recruiter = new Agent({
  name: "recruiter",
  model: openai("gpt-4o"),
  tools: { searchDB, parseResume, scoreResume },
  instructions: "你是一位资深 HR 招聘专家...",
});

// 图工作流
const workflow = new Workflow("hiring-pipeline")
  .then(parseResumeStep)
  .branch({
    if: ({ score }) => score >= 80,
    then: scheduleInterviewStep,
    else: rejectStep,
  })
  .parallel([notifyCandidateStep, notifyManagerStep]);

// Human-in-the-loop
workflow.suspend("awaiting_approval"); // 暂停等待人工审批
```

**优势：** 内置图工作流引擎（`.then()/.branch()/.parallel()`），原生 Human-in-the-loop，MCP Server 支持

**劣势：** 框架较新，生态尚不成熟，API 可能频繁变动，与 Bun 兼容性未经充分验证

### 2.5 CopilotKit

| 属性 | 详情 |
|------|------|
| GitHub | [CopilotKit/CopilotKit](https://github.com/CopilotKit/CopilotKit) — 29.1k stars |
| 定位 | AI Copilot UI 嵌入框架 |
| 核心模块 | Chat UI + Generative UI + Shared State + Human-in-the-Loop |
| 当前版本 | 活跃开发中 |

**核心能力：**

```tsx
import { CopilotKit, CopilotSidebar } from "@copilotkit/react";

// 一行代码嵌入 Copilot 聊天窗口
<CopilotKit runtimeUrl="/api/copilot">
  <CopilotSidebar>
    <YourApp />
  </CopilotSidebar>
</CopilotKit>

// 后端 Agent 可以渲染 UI 组件
// 共享状态让 Agent 读写应用数据
```

**优势：** 开箱即用的 Chat UI + Generative UI，嵌入现有应用极其简单

**劣势：** 重度绑定 React 前端，后端能力弱，不适合纯后端 Agent 编排

---

## 3. 五大框架横向对比

### 3.1 核心能力对比

| 能力维度 | Vercel AI SDK | LangChain.js | LlamaIndex.TS | Mastra | CopilotKit |
|---------|:---:|:---:|:---:|:---:|:---:|
| **文本生成** | ★★★ | ★★★ | ★★☆ | ★★★ | ★★☆ |
| **结构化输出** | ★★★ | ★★☆ | ★★☆ | ★★☆ | ★☆☆ |
| **流式响应** | ★★★ | ★★☆ | ★★☆ | ★★☆ | ★★★ |
| **工具调用** | ★★★ | ★★★ | ★★☆ | ★★★ | ★★☆ |
| **Agent Loop** | ★★☆ | ★★★ | ★★☆ | ★★★ | ★★☆ |
| **Multi-Agent** | ★★☆ | ★★★ | ★☆☆ | ★★★ | ★★☆ |
| **RAG / 向量检索** | ★☆☆ | ★★☆ | ★★★ | ★☆☆ | ★☆☆ |
| **图工作流** | ☆☆☆ | ★★★ | ☆☆☆ | ★★★ | ☆☆☆ |
| **MCP 支持** | ★★☆ | ★★☆ | ★☆☆ | ★★☆ | ★☆☆ |
| **UI 组件** | ★★☆ | ☆☆☆ | ☆☆☆ | ☆☆☆ | ★★★ |
| **Human-in-the-Loop** | ★☆☆ | ★★☆ | ☆☆☆ | ★★★ | ★★★ |
| **可观测性** | ★☆☆ | ★★★ | ★☆☆ | ★★☆ | ★☆☆ |

### 3.2 工程特性对比

| 特性 | Vercel AI SDK | LangChain.js | LlamaIndex.TS | Mastra | CopilotKit |
|------|:---:|:---:|:---:|:---:|:---:|
| **TypeScript 类型安全** | ★★★ | ★★☆ | ★★☆ | ★★☆ | ★★☆ |
| **包体积（min）** | ~50KB | ~500KB+ | ~300KB | ~200KB | ~150KB |
| **依赖数量** | 少 | 多 | 中 | 中 | 中 |
| **Bun 兼容性** | ★★★ | ★★☆ | ★★☆ | ★★☆ | ★★☆ |
| **学习曲线** | 低 | 高 | 中 | 中 | 低 |
| **API 稳定性** | ★★★ | ★★☆ | ★★☆ | ★☆☆ | ★★☆ |
| **Provider 数量** | 20+ | 40+ | 10+ | 40+ | 依赖底层 SDK |
| **文档质量** | ★★★ | ★★☆ | ★★☆ | ★★☆ | ★★☆ |

### 3.3 项目匹配度评分

基于本项目技术栈（Bun + Elysia + Drizzle + PostgreSQL）和需求（Multi-Agent + MCP + Skills）：

| 评估维度（权重） | Vercel AI SDK | LangChain.js | LlamaIndex.TS | Mastra | CopilotKit |
|----------------|:---:|:---:|:---:|:---:|:---:|
| 技术栈匹配（25%） | 10 | 6 | 7 | 7 | 4 |
| 当前需求覆盖（20%） | 10 | 8 | 6 | 8 | 3 |
| 未来扩展性（25%） | 8 | 9 | 5 | 9 | 5 |
| 迁移成本（15%） | 10 | 3 | 4 | 4 | 3 |
| 社区与生态（15%） | 8 | 9 | 5 | 7 | 7 |
| **加权总分** | **9.2** | **7.1** | **5.5** | **7.2** | **4.4** |

---

## 4. 选型结论：为什么是 Vercel AI SDK

### 4.1 最终结论

**继续使用 Vercel AI SDK 作为核心 AI 层**，不做框架迁移。理由如下：

### 4.2 决策依据

#### 已有投资，迁移成本为零

项目已基于 `ai@6.0.101` + `@ai-sdk/openai@3.0.34` 实现了完整的评分管线：
- `src/lib/ai.ts` — MiniMax 模型客户端
- `src/services/ai-scorer.ts` — 评分服务（generateText + Zod 校验）

换框架意味着重写这些已验证的代码，风险高、收益低。

#### 轻量哲学一致

| 本项目选型 | 同领域"重"方案 | 选择理由 |
|-----------|--------------|---------|
| Bun | Node.js | 更快的启动和运行速度 |
| Elysia | Express/Fastify | 类型安全 + 极简 API |
| Drizzle | Prisma/TypeORM | 零代码生成 + 轻量 |
| **Vercel AI SDK** | **LangChain** | **最小抽象 + 最大灵活性** |

整个技术栈都遵循"轻量优先"，Vercel AI SDK 是自然延续。

#### MCP 原生支持

Vercel AI SDK 已内置 MCP Client（`@ai-sdk/mcp`），可直接连接 MCP Server：

```typescript
import { experimental_createMCPClient } from "ai";

// STDIO Transport（开发环境）
const emailMcp = await experimental_createMCPClient({
  transport: { type: "stdio", command: "bun", args: ["./mcp-servers/email.ts"] },
});

// HTTP Transport（生产环境）
const dbMcp = await experimental_createMCPClient({
  transport: { type: "sse", url: "https://mcp-db.internal.ivis-sh.com/mcp" },
});

// MCP 工具直接注入 Agent
const { text } = await generateText({
  model,
  tools: { ...emailMcp.tools(), ...dbMcp.tools() },
  maxSteps: 10,
});
```

#### Multi-Agent 可实现

虽然 Vercel AI SDK 没有内置 Multi-Agent 编排器，但通过组合 `generateText` + `tools` + 自定义编排函数即可实现：

```typescript
// 轻量 Multi-Agent：不需要框架，用函数组合
async function hiringPipeline(resumeBuffer: Buffer, positionId: string) {
  // Agent 1: 解析
  const parsed = await parserAgent.run(resumeBuffer);

  // Agent 2: 评分
  const score = await scorerAgent.run(parsed.text, positionId);

  // Agent 3: 决策（根据分数决定下一步）
  if (score.grade === "A" || score.grade === "B") {
    await schedulerAgent.run(parsed.candidateInfo, positionId);
  }
}
```

这种方式比引入重框架更可控，出问题更容易调试。

#### Provider 灵活性

以后换模型（MiniMax → Claude / GPT / Gemini），只需换 provider 包，业务代码零修改：

```typescript
// 当前：MiniMax
import { createOpenAI } from "@ai-sdk/openai";
const minimax = createOpenAI({ baseURL: "https://api.minimaxi.com/v1", apiKey });
const model = minimax.chat("MiniMax-M2.5");

// 未来：切换到 Claude
import { createAnthropic } from "@ai-sdk/anthropic";
const anthropic = createAnthropic({ apiKey });
const model = anthropic("claude-sonnet-4-20250514");

// 业务代码不变
const { text } = await generateText({ model, prompt: "..." });
```

### 4.3 什么时候需要引入其他框架

| 触发条件 | 引入方案 | 说明 |
|---------|---------|------|
| 需要语义简历搜索（"找有 React 经验的人"） | pgvector + 自建 embedding 管线 | 不需要 LlamaIndex，pgvector 够用 |
| 工作流超过 5 步且有复杂分支/并行 | 考虑 Mastra 的图引擎 | 先用函数编排，遇到瓶颈再引入 |
| 需要 Agent 执行轨迹可视化和调试 | LangSmith 或 Mastra observability | 作为补充，不替换 AI SDK |
| 前端需要嵌入 AI 聊天窗口 | CopilotKit | 前端层面引入，不影响后端 |
| 需要跨语言 Agent 编排 | 考虑 LangGraph | 当前纯 TS 不需要 |

---

## 5. 当前项目实现分析

### 5.1 架构总览

```
┌──────────────────────────────────────────────────┐
│                  Elysia HTTP Server               │
│                  (src/index.ts)                    │
├──────────────────────────────────────────────────┤
│              Routes Layer (src/routes/)            │
│  health.ts │ positions.ts │ candidates.ts │ resumes.ts
├──────────────────────────────────────────────────┤
│            Services Layer (src/services/)          │
│  ai-scorer.ts   │   resume-parser.ts   │  email.ts │
├──────────────────────────────────────────────────┤
│               AI Layer (src/lib/)                  │
│  ai.ts (Vercel AI SDK + MiniMax M2.5)             │
│  types.ts (SkillConfig, ScoreResult, ParsedResume) │
├──────────────────────────────────────────────────┤
│              Data Layer (src/db/)                  │
│  schema.ts (positions, candidates, resumes, scores)│
│  Drizzle ORM + PostgreSQL                         │
└──────────────────────────────────────────────────┘
```

### 5.2 AI 调用链路

```
POST /api/resumes/upload
  │
  ├─ 1. resume-parser.ts: parseResume(buffer, fileName)
  │     └─ pdf-parse / mammoth → 纯文本
  │
  ├─ 2. db: INSERT candidates + resumes
  │
  ├─ 3. ai-scorer.ts: scoreResume(text, title, desc, config)
  │     ├─ 构造中文 Prompt
  │     ├─ generateText({ model, prompt })
  │     ├─ extractJson(text)  ← 处理 <think> 标签
  │     └─ scoreSchema.parse(json)  ← Zod 校验
  │
  └─ 4. db: INSERT scores
```

### 5.3 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| `generateText` vs `generateObject` | `generateText` | MiniMax M2.5 返回 `<think>` 标签，`generateObject` 无法解析 |
| JSON 提取方式 | 正则清理 + `JSON.parse` | 兼容多种模型输出格式（带/不带思考过程） |
| Schema 校验 | Zod v4 | 与 Elysia 的 body 校验统一，运行时类型安全 |
| 模型接口 | OpenAI 兼容适配器 | MiniMax 兼容 OpenAI `/chat/completions` 协议 |

---

## 6. 最佳实践与模式

### 6.1 Provider 抽象模式

将模型配置集中在 `src/lib/ai.ts`，业务层不直接依赖具体 Provider：

```typescript
// src/lib/ai.ts — 当前实现（已遵循此模式）
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";

const minimax = createOpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: "https://api.minimaxi.com/v1",
});

export const model: LanguageModelV3 = minimax.chat("MiniMax-M2.5");
```

**最佳实践：** 业务代码只 import `model`，永远不直接 import Provider 包。换模型时只改这一个文件。

### 6.2 结构化输出模式

当前使用 `generateText` + 手动 JSON 解析。建议在模型支持时迁移到 `generateObject`：

```typescript
// 当前模式（适用于带 <think> 输出的模型）
const { text } = await generateText({ model, prompt });
const json = extractJson(text);
const result = scoreSchema.parse(JSON.parse(json));

// 理想模式（当模型支持 structured output 时）
const { object } = await generateObject({
  model,
  schema: scoreSchema,
  prompt,
});
// object 已经是类型安全的，不需要手动解析
```

**建议：** 保留当前 `extractJson` 模式作为 fallback，在 `ai.ts` 中添加 `structuredModel` 导出供支持该功能的模型使用。

### 6.3 错误处理模式

```typescript
// 推荐：为 AI 调用添加分层错误处理
export async function scoreResume(/* ... */): Promise<ScoreResult> {
  try {
    const { text } = await generateText({ model, prompt });
    const json = extractJson(text);
    const parsed = JSON.parse(json);
    return scoreSchema.parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      // AI 返回了无效 JSON
      throw new Error(`AI 返回格式错误: ${error.message}`);
    }
    if (error instanceof z.ZodError) {
      // JSON 格式正确但数值/结构不符合 schema
      throw new Error(`AI 返回数据校验失败: ${error.message}`);
    }
    // 网络/API 错误
    throw error;
  }
}
```

### 6.4 Prompt 管理模式

随着 Prompt 数量增长，建议将 Prompt 模板从业务代码中抽离：

```typescript
// src/lib/prompts.ts — 集中管理 Prompt 模板
export const PROMPTS = {
  scoreResume: (params: {
    jobTitle: string;
    jobDescription: string;
    skillConfig: SkillConfig;
    resumeText: string;
  }) => `你是一位资深HR招聘专家...`,

  // 未来扩展
  extractResumeFields: (resumeText: string) => `...`,
  generateInterviewQuestions: (candidate: string, position: string) => `...`,
} as const;
```

**好处：** Prompt 版本管理更清晰，方便 A/B 测试不同 Prompt 效果。

### 6.5 Multi-Model 评分模式

未来可能用多个模型交叉评分以提高准确性：

```typescript
// src/lib/ai.ts — 多模型配置
export const models = {
  minimax: minimax.chat("MiniMax-M2.5"),
  // 未来添加
  // claude: anthropic("claude-sonnet-4-20250514"),
  // gpt4o: openai("gpt-4o"),
} as const;

export const defaultModel = models.minimax;

// src/services/ai-scorer.ts — 多模型评分
export async function scoreResumeMultiModel(/* ... */): Promise<ScoreResult> {
  const results = await Promise.all([
    scoreResume(text, title, desc, config, models.minimax),
    scoreResume(text, title, desc, config, models.claude),
  ]);

  // 取平均分或加权融合
  return mergeScores(results);
}
```

---

## 7. Multi-Agent 演进路线

### 7.1 从函数到 Agent 的渐进演进

项目不需要一步到位引入复杂的 Agent 框架。推荐分三步演进：

#### 阶段一：函数编排（当前）

```
收邮件 → 解析简历 → AI评分 → 写入数据库
```

每一步是一个普通函数调用，由路由 handler 或定时任务顺序执行。

#### 阶段二：工具循环 Agent

```typescript
// 单 Agent + 多工具，由 AI 自主决定调用顺序
const { text } = await generateText({
  model,
  system: "你是 HR 简历处理助手。根据用户请求，使用可用工具完成任务。",
  prompt: "处理今天收到的所有邮件简历，评分后入库。",
  tools: {
    fetchEmails: tool({
      description: "获取未处理的邮件简历",
      parameters: z.object({}),
      execute: async () => fetchUnprocessedEmails(),
    }),
    parseResume: tool({
      description: "解析简历文件提取文本",
      parameters: z.object({ emailId: z.string() }),
      execute: async ({ emailId }) => parseResumeFromEmail(emailId),
    }),
    scoreResume: tool({
      description: "对简历进行 AI 评分",
      parameters: z.object({ candidateId: z.string(), positionId: z.string() }),
      execute: async ({ candidateId, positionId }) => scoreCandidate(candidateId, positionId),
    }),
  },
  maxSteps: 20,
});
```

#### 阶段三：Multi-Agent 协作

```typescript
// 多个专职 Agent，各自负责不同领域
const agents = {
  collector: createAgent({
    name: "邮件采集 Agent",
    tools: { fetchEmails, downloadAttachment },
  }),
  parser: createAgent({
    name: "简历解析 Agent",
    tools: { parseResume, extractFields },
  }),
  scorer: createAgent({
    name: "评分 Agent",
    tools: { scoreResume, compareWithHistory },
  }),
  scheduler: createAgent({
    name: "面试调度 Agent",
    tools: { checkCalendar, sendInvitation, bookMeetingRoom },
  }),
};

// 编排函数
async function hiringPipeline(trigger: "email" | "upload") {
  const emails = await agents.collector.run("检查新邮件并下载附件");
  for (const email of emails) {
    const parsed = await agents.parser.run(`解析简历: ${email.attachment}`);
    const score = await agents.scorer.run(`评估候选人: ${parsed.name}`);
    if (score.grade <= "B") {
      await agents.scheduler.run(`为 ${parsed.name} 安排面试`);
    }
  }
}
```

### 7.2 Agent 辅助函数

```typescript
// src/lib/agent.ts — 轻量 Agent 工厂（基于 Vercel AI SDK）
import { generateText, type Tool } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";

interface AgentConfig {
  name: string;
  model: LanguageModelV3;
  system: string;
  tools: Record<string, Tool>;
  maxSteps?: number;
}

export function createAgent(config: AgentConfig) {
  return {
    name: config.name,
    async run(prompt: string) {
      const { text, steps } = await generateText({
        model: config.model,
        system: config.system,
        prompt,
        tools: config.tools,
        maxSteps: config.maxSteps ?? 10,
      });
      return { text, stepsUsed: steps.length };
    },
  };
}
```

不需要引入任何新依赖，纯粹是对 `generateText` 的薄封装。

---

## 8. MCP 集成路线

### 8.1 MCP Server 规划

基于项目现有能力，规划以下 MCP Server：

| MCP Server | 暴露的 Tools | 暴露的 Resources | 优先级 |
|-----------|-------------|-----------------|-------|
| **hr-email-server** | `fetch_emails`, `send_email`, `mark_read` | 邮件列表、附件内容 | P0 |
| **hr-database-server** | `query_candidates`, `update_status`, `search_positions` | 候选人列表、职位列表 | P0 |
| **hr-resume-server** | `parse_resume`, `extract_fields` | 简历原文 | P1 |
| **hr-calendar-server** | `check_availability`, `book_slot` | 面试官日程 | P2 |

### 8.2 MCP Server 实现示例

```typescript
// mcp-servers/email-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "hr-email-server",
  version: "1.0.0",
});

// 暴露工具
server.tool(
  "fetch_unread_emails",
  "获取未读的简历邮件",
  { folder: z.string().default("INBOX") },
  async ({ folder }) => {
    // 复用现有 email.ts 逻辑
    const emails = await fetchEmails(folder);
    return { content: [{ type: "text", text: JSON.stringify(emails) }] };
  },
);

// 暴露资源
server.resource(
  "email-attachments",
  "email://attachments/{emailId}",
  async (uri) => {
    const emailId = uri.pathname.split("/").pop();
    const attachment = await getAttachment(emailId);
    return { contents: [{ uri, mimeType: attachment.mimeType, blob: attachment.data }] };
  },
);

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 8.3 MCP Client 集成

```typescript
// src/lib/mcp.ts — MCP Client 管理
import { experimental_createMCPClient } from "ai";

export async function createMCPClients() {
  const emailClient = await experimental_createMCPClient({
    transport: {
      type: "stdio",
      command: "bun",
      args: ["./mcp-servers/email-server.ts"],
    },
  });

  const dbClient = await experimental_createMCPClient({
    transport: {
      type: "stdio",
      command: "bun",
      args: ["./mcp-servers/database-server.ts"],
    },
  });

  return {
    tools: { ...emailClient.tools(), ...dbClient.tools() },
    cleanup: async () => {
      await emailClient.close();
      await dbClient.close();
    },
  };
}
```

---

## 9. Skills 体系设计

### 9.1 Skill 定义规范

每个 Skill 是一个标准的 Vercel AI SDK `tool`，遵循统一接口：

```typescript
// src/skills/types.ts
import { tool } from "ai";
import { z } from "zod";

// Skill = Vercel AI SDK tool 的语义化包装
export type Skill = ReturnType<typeof tool>;
```

### 9.2 现有代码重构为 Skills

```typescript
// src/skills/parse-resume.ts
import { tool } from "ai";
import { z } from "zod";
import { parseResume as _parseResume } from "../services/resume-parser";

export const parseResumeSkill = tool({
  description: "解析 PDF 或 DOCX 格式的简历文件，提取纯文本内容",
  parameters: z.object({
    fileName: z.string().describe("文件名，用于判断文件类型"),
    fileBase64: z.string().describe("文件内容的 Base64 编码"),
  }),
  execute: async ({ fileName, fileBase64 }) => {
    const buffer = Buffer.from(fileBase64, "base64");
    const result = await _parseResume(buffer, fileName);
    return result.text;
  },
});
```

```typescript
// src/skills/score-resume.ts
import { tool } from "ai";
import { z } from "zod";
import { scoreResume as _scoreResume } from "../services/ai-scorer";

export const scoreResumeSkill = tool({
  description: "根据职位要求对候选人简历进行 AI 智能评分",
  parameters: z.object({
    resumeText: z.string().describe("简历纯文本"),
    jobTitle: z.string().describe("职位标题"),
    jobDescription: z.string().describe("职位描述"),
    skillConfig: z.object({
      must: z.array(z.string()),
      nice: z.array(z.string()),
      reject: z.array(z.string()),
    }).describe("技能配置"),
  }),
  execute: async ({ resumeText, jobTitle, jobDescription, skillConfig }) => {
    return _scoreResume(resumeText, jobTitle, jobDescription, skillConfig);
  },
});
```

```typescript
// src/skills/index.ts — Skill 注册表
export { parseResumeSkill } from "./parse-resume";
export { scoreResumeSkill } from "./score-resume";
// 未来扩展
// export { sendEmailSkill } from "./send-email";
// export { searchCandidatesSkill } from "./search-candidates";
// export { scheduleInterviewSkill } from "./schedule-interview";

// 便捷导出：所有 Skills 合集
import * as skills from "./index";
export const allSkills = skills;
```

### 9.3 Skills + Agent + MCP 协作

```
┌─────────────────────────────────────────────┐
│              HR Hiring Agent                 │
│     generateText({ tools, maxSteps: 20 })   │
├─────────────────────────────────────────────┤
│                                             │
│  Local Skills          MCP Tools            │
│  ┌──────────────┐     ┌──────────────┐     │
│  │ parseResume  │     │ fetch_emails │     │
│  │ scoreResume  │     │ send_email   │     │
│  │ extractFields│     │ query_db     │     │
│  └──────────────┘     │ check_calendar│     │
│                       └──────────────┘     │
│                                             │
│  合并为统一的 tools 对象传入 Agent：          │
│  tools = { ...localSkills, ...mcpTools }    │
└─────────────────────────────────────────────┘
```

---

## 10. 分阶段实施计划

### Phase 1: 巩固基础（当前 → 近期）

| 任务 | 说明 | 依赖 |
|------|------|------|
| Prompt 模板抽离 | 创建 `src/lib/prompts.ts`，从 `ai-scorer.ts` 抽离 | 无 |
| 错误处理增强 | AI 调用添加分层 try-catch | 无 |
| 多模型配置 | `src/lib/ai.ts` 支持多模型注册 | 无 |
| 简历字段提取 | 新增 `extractResumeFields` 服务 | Prompt 模板 |

### Phase 2: Skills 化重构

| 任务 | 说明 | 依赖 |
|------|------|------|
| 创建 `src/skills/` 目录 | 定义 Skill 类型规范 | 无 |
| 现有服务包装为 Skills | `parseResume` → `parseResumeSkill` 等 | Skills 目录 |
| 单 Agent 工具循环 | 实现第一个 Agent（邮件简历处理） | Skills |

### Phase 3: MCP 集成

| 任务 | 说明 | 依赖 |
|------|------|------|
| `hr-email-server` MCP Server | 暴露邮件操作工具 | 现有 email.ts |
| `hr-database-server` MCP Server | 暴露候选人查询工具 | 现有 db/schema.ts |
| MCP Client 管理 | 创建 `src/lib/mcp.ts` | MCP Servers |
| Agent 接入 MCP 工具 | 合并 local Skills + MCP tools | MCP Client |

### Phase 4: Multi-Agent

| 任务 | 说明 | 依赖 |
|------|------|------|
| Agent 工厂函数 | 创建 `src/lib/agent.ts` | Phase 2 |
| 专职 Agent 定义 | Collector / Parser / Scorer / Scheduler | Agent 工厂 |
| Pipeline 编排 | 实现 `hiringPipeline` 编排函数 | 所有 Agent |
| Human-in-the-Loop | 关键决策点暂停等待人工确认 | Pipeline |

### 演进时间线

```
Phase 1           Phase 2          Phase 3          Phase 4
巩固基础          Skills 化         MCP 集成        Multi-Agent
──────────────►──────────────►──────────────►──────────────►

  Prompt 抽离       Skills 定义       Email MCP        Agent 工厂
  错误处理          服务包装          DB MCP           专职 Agent
  多模型配置        单 Agent          Client 管理      Pipeline
  字段提取                           工具合并         HITL
```

---

## 附录

### A. 参考链接

| 资源 | 链接 |
|------|------|
| Vercel AI SDK 文档 | https://ai-sdk.dev/docs |
| Vercel AI SDK GitHub | https://github.com/vercel/ai |
| MCP 规范 | https://modelcontextprotocol.io |
| MCP TypeScript SDK | https://github.com/modelcontextprotocol/typescript-sdk |
| LangChain.js | https://github.com/langchain-ai/langchainjs |
| LlamaIndex.TS | https://github.com/run-llama/LlamaIndexTS |
| Mastra | https://github.com/mastra-ai/mastra |
| CopilotKit | https://github.com/CopilotKit/CopilotKit |

### B. 相关项目文档

| 文档 | 说明 |
|------|------|
| [02-agents-skills-mcp.md](./02-agents-skills-mcp.md) | Agent/Skill/MCP 概念详解与实施路线图 |
| [04-langchain-role.md](./04-langchain-role.md) | LangChain 在本项目中的角色评估 |
| [05-ai-dev-tools.md](./05-ai-dev-tools.md) | AI 开发工具对比分析 |
