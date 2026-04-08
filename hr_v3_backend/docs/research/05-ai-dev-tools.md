# AI 开发工具优化点与最佳实践 — HR 智能简历筛选系统

> 本文档系统性探讨如何利用 Claude Code、Gemini CLI 等 AI 开发工具提升 HR 智能简历筛选系统的开发效率。
> 当前技术栈：Elysia + Drizzle ORM + postgres.js + PostgreSQL + Vercel AI SDK + MiniMax M2.5 + ImapFlow + TypeScript ESM + Bun + bun

---

## 目录

1. [AI 开发工具总览](#1-ai-开发工具总览)
2. [Claude Code 深度使用](#2-claude-code-深度使用)
3. [Gemini CLI 深度使用](#3-gemini-cli-深度使用)
4. [协同使用策略](#4-协同使用策略)
5. [项目配置最佳实践](#5-项目配置最佳实践)
6. [MCP 在开发工具中的应用](#6-mcp-在开发工具中的应用)
7. [提示工程最佳实践](#7-提示工程最佳实践)
8. [团队协作](#8-团队协作)
9. [效率提升度量](#9-效率提升度量)
10. [针对本项目的具体优化建议](#10-针对本项目的具体优化建议)

---

## 1. AI 开发工具总览

### 1.1 工具分类与定位

当前主流 AI 开发工具可分为以下几大类别：

| 类别 | 工具 | 特点 |
|------|------|------|
| **终端原生 Agent** | Claude Code, Gemini CLI, Aider | 在终端内运行，直接操作文件系统和 Git |
| **AI 原生 IDE** | Cursor, Windsurf | 基于 VS Code fork，内嵌 AI 能力 |
| **IDE 插件** | GitHub Copilot, Continue.dev | 作为插件集成到现有 IDE 中 |
| **对话式辅助** | ChatGPT, Claude Web | 通过网页对话提供代码建议 |

### 1.2 全面功能对比

#### 1.2.1 核心功能矩阵

| 功能 | Claude Code | Gemini CLI | GitHub Copilot | Cursor | Windsurf | Aider | Continue.dev |
|------|-------------|------------|----------------|--------|----------|-------|-------------|
| **代码补全** | 通过 Agent | 通过 Agent | 原生内联 | 原生内联 | 原生内联 | 通过 Agent | 原生内联 |
| **多文件编辑** | 原生支持 | 原生支持 | Agent Mode | Composer | Cascade | 原生支持 | 部分支持 |
| **终端集成** | 原生终端 | 原生终端 | VS Code 终端 | 内嵌终端 | 内嵌终端 | 原生终端 | VS Code 终端 |
| **Git 集成** | 深度集成 | 深度集成 | 深度集成 | 部分集成 | 部分集成 | 深度集成 | 部分集成 |
| **MCP 支持** | 原生支持 | 原生支持 | 支持 | 支持 | 支持 | 不支持 | 支持 |
| **自定义命令** | /commands | /commands | 不支持 | 不支持 | 不支持 | /commands | 不支持 |
| **子代理 (Subagent)** | 原生支持 | 不支持 | 不支持 | 部分支持 | 不支持 | 不支持 | 不支持 |
| **Hook 机制** | 原生支持 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 | 不支持 |
| **多模态** | 支持图片 | 支持图片/视频 | 支持图片 | 支持图片 | 支持图片 | 不支持 | 部分支持 |
| **离线运行** | 否 | 否 | 否 | 否 | 否 | 可配置本地模型 | 可配置本地模型 |

#### 1.2.2 定价对比（2026年2月）

| 工具 | 免费层 | 个人/Pro | 高级/Max | 企业 |
|------|--------|----------|----------|------|
| **Claude Code** | 不支持 | $20/月 (Pro) | $100-$200/月 (Max) | 按需定价 |
| **Gemini CLI** | 免费（API Key） | 含于 Gemini 订阅 | Code Assist 配额 | Google Cloud 集成 |
| **GitHub Copilot** | 50 请求/月 | $10/月 (Pro) | $39/月 (Pro+) | 按席位定价 |
| **Cursor** | 50 Agent 请求 | $20/月 (Pro) | $60/月 (Pro+) | 按需定价 |
| **Windsurf** | 基础功能 | $10-15/月 | Enterprise | 按需定价 |
| **Aider** | 开源免费 | 自付 API 费 | 自付 API 费 | 自付 API 费 |
| **Continue.dev** | 开源免费 | 自付 API 费 | 自付 API 费 | 按需定价 |

> **成本提示**：一位开发者估算，按 API 定价其 Claude Code 使用成本将超过 $15,000/月，而使用 Max 计划（$100/月）总费用约 $800，节省了 93%。对于本项目这样的中型后端项目，Pro 计划（$20/月）通常足够日常开发使用。

#### 1.2.3 支持的编程语言与框架

| 工具 | TypeScript/JS | Python | Go | Rust | Java | 框架感知 |
|------|--------------|--------|-----|------|------|---------|
| **Claude Code** | 优秀 | 优秀 | 良好 | 良好 | 良好 | 通过 CLAUDE.md 配置 |
| **Gemini CLI** | 优秀 | 优秀 | 良好 | 良好 | 良好 | 通过 GEMINI.md 配置 |
| **GitHub Copilot** | 优秀 | 优秀 | 优秀 | 良好 | 优秀 | 基于训练数据 |
| **Cursor** | 优秀 | 优秀 | 良好 | 良好 | 良好 | .cursorrules 配置 |
| **Windsurf** | 优秀 | 优秀 | 良好 | 一般 | 良好 | Cascade 自动感知 |

对于本项目（TypeScript + Elysia + Drizzle ORM），所有工具均有良好支持，但 Claude Code 和 Cursor 在 TypeScript 生态支持方面表现最为突出。

### 1.3 工具选择决策树

```
需要 AI 编码辅助？
├── 偏好终端工作流？
│   ├── 需要最强 Agent 能力 → Claude Code
│   ├── 偏好 Google 生态 → Gemini CLI
│   └── 需要开源/本地模型 → Aider
├── 偏好 IDE 集成？
│   ├── 需要最强 AI 体验 → Cursor
│   ├── 预算有限 → Windsurf
│   └── 已有 VS Code 工作流 → GitHub Copilot / Continue.dev
└── 预算极其有限？
    └── Aider + 本地模型 / Continue.dev + Ollama
```

### 1.4 各工具优劣势总结

**Claude Code 优势**：
- 终端原生，不依赖特定 IDE
- 子代理架构支持复杂任务分解
- Hook 机制确保操作一致性
- MCP 生态最为成熟
- 上下文工程能力最强

**Claude Code 劣势**：
- 无免费层，最低 $20/月
- 无内联代码补全
- 上下文窗口管理需要经验

**Gemini CLI 优势**：
- 开源免费（Apache 2.0）
- 与 Google Cloud 深度集成
- 多模态支持（图片、视频）
- Extension 生态快速发展

**Gemini CLI 劣势**：
- 无子代理/Hook 机制
- 上下文管理不如 Claude Code 精细
- 社区生态相对较新

---

## 2. Claude Code 深度使用

### 2.1 安装与初始配置

#### 2.1.1 安装

```bash
# 全局安装（推荐）
npm install -g @anthropic-ai/claude-code

# 验证安装
claude --version

# 首次运行，完成认证
claude
```

#### 2.1.2 认证方式

```bash
# 方式一：使用 Anthropic 账户（推荐个人开发者）
# 首次运行 claude 会自动引导浏览器登录

# 方式二：使用 API Key（推荐 CI/CD 和自动化场景）
export ANTHROPIC_API_KEY="sk-ant-xxx"

# 方式三：企业 SSO
# 在 Anthropic Console 中配置 SSO 后使用
```

#### 2.1.3 基础配置

```bash
# 设置默认模型
claude config set model claude-sonnet-4-6

# 配置自动压缩阈值（上下文使用超过 80% 时自动压缩）
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80

# 限制思考 Token 数量（节省成本）
export MAX_THINKING_TOKENS=10000

# 启用 MCP 工具搜索（惰性加载，减少 95% 上下文消耗）
claude config set mcpToolSearch true
```

### 2.2 CLAUDE.md 项目配置文件最佳实践

#### 2.2.1 配置文件层级

Claude Code 支持多层级的 CLAUDE.md 文件：

```
~/.claude/CLAUDE.md                  # 全局配置（所有项目共享）
~/workspace/CLAUDE.md                # 工作区配置（monorepo 根目录）
~/workspace/hr/hr-backend/CLAUDE.md  # 项目配置（团队共享，提交到 Git）
~/workspace/hr/hr-backend/.claude/CLAUDE.md  # 本地配置（不提交到 Git）
```

加载优先级：全局 → 父目录 → 项目根目录 → .claude/ 目录，后面的会覆盖前面的同名配置。

#### 2.2.2 编写原则

1. **简洁至上**：保持在 300 行以内，越短越好
2. **用 Linter 替代代码风格规则**：永远不要让 LLM 做 Linter 的工作
3. **说明 WHAT、WHY、HOW**：技术栈是什么，项目目的是什么，如何进行开发
4. **定义工作流**：不同类型的任务应该遵循什么流程
5. **记录自定义工具**：说明项目中的自定义脚本和命令

#### 2.2.3 本项目的 CLAUDE.md 示例

```markdown
# HR 智能简历筛选系统 — 后端

## 项目概述
基于 Elysia 框架的 HR 简历自动筛选后端服务。通过 IMAP 自动收取邮件简历，
使用 MiniMax M2.5 AI 模型进行智能评分，帮助 HR 高效完成简历初筛。

## 技术栈
- 运行时: Bun (ESM)
- 框架: Elysia
- ORM: Drizzle ORM + postgres.js
- AI: Vercel AI SDK (@ai-sdk/openai) + MiniMax M2.5
- 邮件: ImapFlow (IMAP) + Nodemailer (SMTP)
- 解析: pdf-parse (PDF) + mammoth (DOCX)
- 校验: Zod v4
- 包管理: bun

## 目录结构
src/
  index.ts          # 应用入口，Elysia 路由注册
  env.ts            # 环境变量 Zod 校验
  db/
    schema.ts       # Drizzle 表定义 (positions, candidates, resumes, scores)
    index.ts        # 数据库连接
    migrate.ts      # 迁移脚本
  lib/
    ai.ts           # MiniMax AI 客户端配置
    types.ts        # 共享类型定义
  routes/
    health.ts       # 健康检查
    positions.ts    # 职位管理 CRUD
    candidates.ts   # 候选人管理 CRUD
    resumes.ts      # 简历上传与处理
  services/
    ai-scorer.ts    # AI 简历评分逻辑
    email.ts        # IMAP 邮件轮询与自动处理
    resume-parser.ts # PDF/DOCX 解析

## 常用命令
- `bun dev` — 启动开发服务器 (bun run --watch)
- `bun run build` — TypeScript 编译
- `bun run typecheck` — 类型检查 (tsc --noEmit)
- `bun run db:generate` — 生成 Drizzle 迁移文件
- `bun run db:migrate` — 执行数据库迁移

## 代码规范
- 所有文件使用 TSDoc 风格注释（中文）
- 使用 ESM import（带 .js 扩展名）
- 环境变量通过 src/env.ts 的 Zod schema 校验
- 数据库操作使用 Drizzle ORM 类型安全查询
- AI 返回结果用 Zod schema 校验

## 工作流
1. 新功能: 先理解现有代码 → 设计方案 → 编写实现 → typecheck 验证
2. Bug 修复: 定位问题 → 理解上下文 → 修复 → 验证
3. 数据库变更: 修改 schema.ts → bun run db:generate → bun run db:migrate
4. 添加新路由: 在 routes/ 创建文件 → 在 index.ts 注册

## 注意事项
- 不要修改 .env 文件，敏感信息不提交到 Git
- PDF 解析使用 pdf-parse v2 的新 API (new PDFParse + getText)
- Zod 使用 v4 的 import 路径: import { z } from "zod/v4"
- AI 模型回复可能包含 <think> 标签，需要用 extractJson() 清理
```

#### 2.2.4 使用 /init 自动生成

```bash
# 在项目目录运行，Claude 会分析项目结构自动生成 CLAUDE.md
claude
> /init
```

建议以 `/init` 生成的内容为起点，然后删除不需要的部分——删除比从零创建更容易。

#### 2.2.5 定期维护

每隔几周，让 Claude 审查并优化 CLAUDE.md：

```
请审查当前的 CLAUDE.md 文件，找出：
1. 过时的信息
2. 冗余的说明
3. 缺失的重要上下文
4. 可以更简洁的表述
给出具体的修改建议。
```

### 2.3 自定义 /commands

#### 2.3.1 命令文件结构

自定义命令存放在 `.claude/commands/` 目录下，每个 `.md` 文件对应一个斜杠命令：

```
.claude/
  commands/
    add-route.md       # /project:add-route
    add-service.md     # /project:add-service
    score-debug.md     # /project:score-debug
    db-migration.md    # /project:db-migration
    review.md          # /project:review
```

#### 2.3.2 命令示例

**`.claude/commands/add-route.md`** — 添加新的 API 路由：

```markdown
为 HR 系统添加一个新的 API 路由。

步骤：
1. 在 src/routes/ 目录创建新的路由文件
2. 使用 Elysia 框架的 Router 模式
3. 遵循现有路由的 JSDoc 注释风格（中文 TSDoc）
4. 在 src/index.ts 中注册新路由
5. 运行 bun run typecheck 确认无类型错误

参考 src/routes/positions.ts 和 src/routes/candidates.ts 的风格。

路由描述: $ARGUMENTS
```

**`.claude/commands/add-service.md`** — 添加新的业务服务：

```markdown
为 HR 系统添加一个新的业务服务。

步骤：
1. 在 src/services/ 目录创建新的服务文件
2. 使用中文 TSDoc 风格的 @file 和 @description 注释
3. 所有函数使用 TypeScript 严格类型
4. 如需新类型，在 src/lib/types.ts 中定义
5. 如需数据库操作，使用 Drizzle ORM 类型安全查询
6. 运行 bun run typecheck 确认无类型错误

参考 src/services/ai-scorer.ts 的代码风格。

服务描述: $ARGUMENTS
```

**`.claude/commands/db-migration.md`** — 数据库变更：

```markdown
执行数据库 schema 变更。

步骤：
1. 根据需求修改 src/db/schema.ts
2. 遵循现有的 Drizzle ORM 表定义风格（中文 TSDoc 注释）
3. 运行 bun run db:generate 生成迁移文件
4. 检查生成的 SQL 迁移文件是否正确
5. 运行 bun run db:migrate 执行迁移
6. 运行 bun run typecheck 确认类型正确

变更描述: $ARGUMENTS
```

**`.claude/commands/review.md`** — 代码审查：

```markdown
对当前的代码变更进行全面审查。

检查要点：
1. TypeScript 类型安全：是否有 any 类型、类型断言是否合理
2. 错误处理：是否有未捕获的异常、错误信息是否清晰
3. SQL 注入：Drizzle ORM 查询是否安全
4. 环境变量：新增的环境变量是否在 src/env.ts 中定义
5. 性能：是否有 N+1 查询、不必要的数据库访问
6. 代码风格：是否遵循项目的 TSDoc 中文注释规范
7. 安全性：是否暴露了敏感信息（API Key、密码等）

请给出具体的改进建议和代码修改方案。

审查范围: $ARGUMENTS
```

#### 2.3.3 使用方式

```bash
claude
> /project:add-route 添加邮件模板管理路由，支持 CRUD 操作
> /project:db-migration 在 candidates 表添加 resumeCount 字段
> /project:review 检查 src/services/email.ts 的错误处理
```

### 2.4 MCP Server 集成

#### 2.4.1 MCP 概述

MCP (Model Context Protocol) 是连接 Claude Code 与外部工具和数据源的标准协议。Claude Code 既可以作为 MCP 客户端使用外部 MCP server，也可以通过 `claude mcp serve` 暴露自身能力作为 MCP server。

#### 2.4.2 在项目中配置 MCP

在 `.claude/settings.json` 中配置 MCP server：

```json
{
  "mcpServers": {
    "postgres": {
      "command": "bun x",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://user:pass@localhost:5432/hr_screening"
      ]
    },
    "filesystem": {
      "command": "bun x",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/user/workspace/ivis/hr/hr-backend"
      ]
    },
    "github": {
      "command": "bun x",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "fetch": {
      "command": "bun x",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

#### 2.4.3 MCP 性能优化

启用 MCP Tool Search 特性（惰性加载），可减少 95% 的上下文消耗：

```bash
claude config set mcpToolSearch true
```

**最佳实践**：
- 保持启用的 MCP server 在 10 个以内
- 保持活跃 tool 在 80 个以内
- 每个 MCP tool 描述都消耗 Token，过多会将 200k 上下文窗口压缩到 ~70k

### 2.5 Memory 管理

#### 2.5.1 记忆层级

```
CLAUDE.md（项目级）→ 持久记忆，所有会话共享
对话记忆 → 单次会话，支持压缩（compaction）
/compact → 手动触发上下文压缩
/clear → 清除对话记忆，保留 CLAUDE.md
```

#### 2.5.2 上下文压缩策略

当对话接近上下文窗口限制时，Claude Code 会自动进行压缩（compaction），保留架构决策、未解决的 Bug 和实现细节，丢弃冗余的工具输出。压缩后，agent 使用压缩后的上下文加上最近访问的 5 个文件继续工作。

```bash
# 手动触发压缩
> /compact

# 配置自动压缩阈值
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80
```

#### 2.5.3 混合上下文检索

Claude Code 采用混合模型：
- **主动加载**：CLAUDE.md 文件在对话开始时即全量注入上下文
- **按需检索**：通过 glob 和 grep 原语在运行时动态检索文件

### 2.6 Plan Mode 使用技巧

#### 2.6.1 Plan-Then-Execute 工作流

对于较大的功能开发，建议采用"先规划后执行"的模式：

```
# 第一步：让 Claude 提问以完善需求
我需要为邮件解析服务添加定时轮询功能。请先问我几个问题来确认需求细节。

# Claude 会使用 AskUserQuestion 工具询问：
# - 轮询间隔多少？
# - 失败重试策略？
# - 是否需要并发控制？
# 等等

# 第二步：确认方案后，在新的会话中执行
> /clear
请按照以下方案实施邮件定时轮询功能：
[粘贴第一步确认的方案]
```

#### 2.6.2 为什么要使用新会话执行

新会话的好处：
- 干净的上下文窗口，完全专注于实现
- 避免规划讨论占用过多上下文
- 有书面方案可供参考和回溯

### 2.7 多 Agent 并行（Subagent）

#### 2.7.1 子代理概念

Claude Code 子代理是专门执行特定任务的自治助手。每个子代理拥有：
- 独立的系统提示词
- 精选的工具权限
- 隔离的上下文窗口

#### 2.7.2 配置子代理

在 `.claude/agents/` 目录下创建子代理定义：

**`.claude/agents/researcher.md`** — 代码调研代理：

```markdown
你是一个代码调研专家。你的任务是深入分析现有代码库，理解架构和实现细节，然后提供简洁的总结报告。

工具限制：只使用 Read、Glob、Grep、Bash(只读命令) 工具。
不要修改任何文件。

输出格式：
1. 架构概述（3-5 句话）
2. 关键发现（列表）
3. 潜在问题（列表）
4. 建议（列表）
```

**`.claude/agents/tester.md`** — 测试代理：

```markdown
你是一个测试工程师。你的任务是为指定的代码编写测试用例。

技术栈约束：
- 测试框架：Bun 内置 test runner (bun:test)
- 断言库：Bun 内置 assert
- TypeScript + ESM
- 测试文件放在 test/ 目录下

工作流：
1. 阅读要测试的源文件
2. 理解函数签名和预期行为
3. 编写测试用例覆盖正常路径和边界情况
4. 运行测试确认通过
```

**`.claude/agents/reviewer.md`** — 代码审查代理：

```markdown
你是一个高级代码审查员。审查重点：

1. 类型安全 — 避免 any，善用 TypeScript 严格模式
2. 错误处理 — 所有异步操作都应有 try/catch
3. 安全性 — 无 SQL 注入、无敏感信息泄露
4. 性能 — 无 N+1 查询、合理使用索引
5. 可维护性 — 代码清晰、注释充分

只使用 Read 和 Grep 工具。不要修改任何文件。
输出格式使用 GitHub PR review 风格的评论。
```

#### 2.7.3 子代理使用建议

- **探索和调研**：使用 researcher 子代理，避免主对话上下文膨胀
- **测试编写**：使用 tester 子代理，隔离测试相关上下文
- **代码审查**：使用 reviewer 子代理，获得独立视角

**注意**：Claude Opus 4.6 对子代理有强烈偏好，可能在简单任务上也尝试调用子代理。如果看到过度使用子代理的情况，在 CLAUDE.md 中明确说明何时该用、何时不该用。

#### 2.7.4 工具权限控制

```json
// 子代理可以使用 tools（允许列表）或 disallowedTools（拒绝列表）
{
  "tools": ["Read", "Glob", "Grep"],
  "disallowedTools": ["Bash", "Write"]
}
```

使用 `Task(agent_type)` 语法限制协调者可以生成的子代理类型：

```
tools: Task(worker, researcher), Read, Bash
```

### 2.8 Hook 机制

#### 2.8.1 Hook 概述

Hook 将 shell 命令附加到 Claude Code 的生命周期事件上。与提示词不同，Hook 保证执行——适用于必须每次运行的 lint、格式化和安全检查。

#### 2.8.2 可用的 Hook 事件

| 事件 | 触发时机 | 典型用途 |
|------|---------|---------|
| `PreToolExecution` | 工具执行前 | 安全检查、参数验证 |
| `PostToolExecution` | 工具执行后 | 格式化、lint |
| `Stop` | Agent 停止时 | 最终检查、通知 |
| `SubagentStop` | 子代理停止时 | 子代理结果处理 |

#### 2.8.3 配置示例

在 `.claude/settings.json` 中配置：

```json
{
  "hooks": {
    "PostToolExecution": [
      {
        "matcher": "Write|Edit",
        "command": "bun run typecheck 2>&1 | tail -20",
        "description": "写入文件后自动进行类型检查"
      }
    ],
    "Stop": [
      {
        "command": "bun run typecheck",
        "description": "Agent 完成后运行完整类型检查"
      }
    ]
  }
}
```

#### 2.8.4 Hook 的退出码含义

- **退出码 0**：成功，stdout 输出会显示在 Claude 的记录中
- **退出码 2**：阻止操作，错误信息会反馈给 Claude 让其修正
- **其他退出码**：Hook 失败但不阻止操作

### 2.9 权限管理

#### 2.9.1 权限级别

Claude Code 的权限可在多个层级配置：

```json
// .claude/settings.json
{
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Bash(bun:*)",
      "Bash(git:*)",
      "Bash(bun:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(sudo:*)"
    ]
  }
}
```

#### 2.9.2 针对本项目的权限建议

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Write(src/**)",
      "Write(test/**)",
      "Edit(src/**)",
      "Edit(test/**)",
      "Bash(bun:*)",
      "Bash(git:*)",
      "Bash(bun:*)"
    ],
    "deny": [
      "Write(.env*)",
      "Write(bun.lock)",
      "Bash(rm -rf:*)",
      "Bash(sudo:*)",
      "Bash(curl:*)"
    ]
  }
}
```

### 2.10 上下文工程（Context Engineering）最佳实践

#### 2.10.1 什么是上下文工程

上下文工程是 2025-2026 年 AI 开发领域最重要的新概念。Anthropic 官方将其定义为：为 AI Agent 提供有效上下文的工程实践。核心目标是让 AI 在有限的上下文窗口内获得最相关的信息。

#### 2.10.2 五大核心系统

高效使用 Claude Code 的关键在于理解五个核心系统：

1. **配置层级**（CLAUDE.md + settings.json）
2. **权限系统**（allow/deny 规则）
3. **Hook 机制**（生命周期事件绑定）
4. **MCP 集成**（外部工具接入）
5. **子代理**（任务分解与隔离）

#### 2.10.3 三层架构使用策略

```
┌─────────────────────────────────────┐
│ 扩展层 (Extension Layer)            │
│ MCP Servers, Plugins, Skills        │
│ → 配置好后被动使用                   │
├─────────────────────────────────────┤
│ 委托层 (Delegation Layer)           │
│ Subagents, Hooks                    │
│ → 将探索和专业任务下推               │
├─────────────────────────────────────┤
│ 核心层 (Core Layer)                 │
│ 主对话, CLAUDE.md, 工具调用          │
│ → 仅用于协调和最终决策               │
└─────────────────────────────────────┘
```

大多数用户完全在核心层工作，导致上下文膨胀和成本攀升。高效用户将探索和专业工作推向委托层，将扩展层配置好，核心层仅用于协调和最终决策。

#### 2.10.4 实用技巧

1. **用测试做自我验证** — 让 Claude 能通过运行测试来检查自己的工作，这是单一最高杠杆的做法
2. **使用 /compact 管理成本** — 上下文快满时手动压缩
3. **使用 /model 切换模型** — 简单任务用 Haiku（便宜 5 倍），复杂任务用 Opus
4. **避免在一个会话中做太多事** — 每个会话聚焦一个任务
5. **使用子代理做文件探索** — 避免大量文件内容污染主上下文

---

## 3. Gemini CLI 深度使用

### 3.1 安装与配置

#### 3.1.1 安装

```bash
# 通过 npm 全局安装
npm install -g @google/gemini-cli

# 验证安装
gemini --version

# 首次运行（自动引导认证）
gemini
```

#### 3.1.2 系统要求

- Bun >= 1.0（本项目使用 Bun，满足要求）
- 支持 macOS、Linux、Windows
- 推荐使用较新的终端模拟器以获得最佳显示效果

#### 3.1.3 认证方式

```bash
# 方式一：Google 账户登录（个人免费使用）
# 首次运行 gemini 会自动引导浏览器登录

# 方式二：API Key（按量计费）
export GEMINI_API_KEY="AIza..."

# 方式三：Google Cloud 集成（企业用户）
# 使用 gcloud auth 认证后直接使用
gcloud auth application-default login
```

#### 3.1.4 配置文件

Gemini CLI 的配置存储在 `.gemini/settings.json` 中：

```json
{
  "theme": "default",
  "model": "gemini-2.5-pro",
  "sandbox": true,
  "mcpServers": {
    "postgres": {
      "command": "bun x",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://user:pass@localhost:5432/hr_screening"
      ]
    }
  }
}
```

### 3.2 GEMINI.md 项目配置

#### 3.2.1 配置文件层级

与 CLAUDE.md 类似，GEMINI.md 提供持久性的项目上下文：

```
~/.gemini/GEMINI.md              # 全局配置
~/workspace/GEMINI.md            # 工作区配置
~/workspace/hr/hr-backend/GEMINI.md  # 项目配置
```

当 Gemini CLI 进入包含 GEMINI.md 的目录时，会自动读取其中的指令。GEMINI.md 还支持从其他文件导入内容，便于模块化和复用。

#### 3.2.2 本项目的 GEMINI.md 示例

```markdown
# HR 智能简历筛选系统 — 后端

## 项目信息
- 技术栈: Elysia + Drizzle ORM + PostgreSQL + Vercel AI SDK + MiniMax M2.5
- 运行时: Bun (ESM), bun
- 入口: src/index.ts

## 开发规范
- 使用 TypeScript 严格模式
- 所有注释使用中文 TSDoc 风格
- ESM 导入必须带 .js 扩展名
- Zod v4 使用 "zod/v4" 导入路径
- Drizzle ORM 用于所有数据库操作

## 常用命令
- bun dev: 启动开发服务器
- bun run typecheck: 类型检查
- bun run db:generate: 生成迁移
- bun run db:migrate: 执行迁移

## 工作流要求
1. 修改代码后始终运行 bun run typecheck
2. 数据库变更先改 schema.ts 再生成迁移
3. 新路由在 src/index.ts 中注册
```

### 3.3 与 Google Cloud 集成

#### 3.3.1 Cloud SQL 集成

Gemini CLI 支持通过 Extension 机制安装 Google Cloud 相关工具：

```bash
# 安装 Cloud SQL PostgreSQL Extension
gemini extensions install cloud-sql-postgres
```

安装后会自动：
1. 配置相应的 MCP Server
2. 在 GEMINI.md 中追加 CLOUD-SQL-POSTGRES.md 上下文文件

#### 3.3.2 其他 Google Cloud 集成

```bash
# Cloud Storage — 文件存储
gemini extensions install cloud-storage

# BigQuery — 数据分析
gemini extensions install bigquery

# Vertex AI — AI 模型管理
gemini extensions install vertex-ai
```

### 3.4 Function Calling 与 Extensions

#### 3.4.1 内置工具

Gemini CLI 的 ReAct (Reason and Act) 循环使用以下内置工具：

| 工具 | 功能 |
|------|------|
| `read_file` | 读取文件内容 |
| `write_file` | 写入文件 |
| `edit_file` | 编辑文件的特定部分 |
| `list_dir` | 列出目录内容 |
| `run_command` | 执行终端命令 |
| `web_search` | 搜索互联网 |
| `web_fetch` | 获取网页内容 |

#### 3.4.2 自定义 Extension

开发自定义 Gemini CLI Extension：

```typescript
// extensions/hr-tools/index.ts
import { Extension, Tool } from "@google/gemini-cli-extensions";

export default class HRToolsExtension extends Extension {
  name = "hr-tools";
  description = "HR 简历筛选系统专用工具";

  tools: Tool[] = [
    {
      name: "score_resume",
      description: "对简历文本进行 AI 评分",
      parameters: {
        resumeText: { type: "string", description: "简历文本" },
        positionId: { type: "string", description: "职位 ID" },
      },
      execute: async ({ resumeText, positionId }) => {
        // 调用评分服务
        const response = await fetch(
          `http://localhost:3001/api/resumes/score`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resumeText, positionId }),
          }
        );
        return await response.json();
      },
    },
  ];
}
```

### 3.5 多模态支持

Gemini CLI 的一大优势是强大的多模态能力：

```bash
# 分析截图中的 UI 设计
gemini "分析这个 HR 系统的截图，给出改进建议" --image screenshot.png

# 处理包含图表的文档
gemini "从这份 PDF 中提取组织架构信息" --file org-chart.pdf
```

### 3.6 Token 消耗优化

#### 3.6.1 Token Caching

Gemini CLI 内置 Token 缓存机制，对重复的上下文自动去重：

```bash
# 启用 Token 缓存（默认开启）
# 在 .gemini/settings.json 中
{
  "tokenCaching": true
}
```

#### 3.6.2 Checkpointing

保存和恢复对话状态，避免从头开始：

```bash
# 保存当前对话
> /save my-feature-checkpoint

# 恢复对话
gemini --resume my-feature-checkpoint
```

#### 3.6.3 Headless Mode

在脚本和 CI/CD 中使用非交互模式：

```bash
# 非交互模式，直接输出结果
gemini --headless "分析 src/services/ai-scorer.ts 的代码质量"

# 输出 JSON 格式
gemini --headless --json "列出项目中所有的 Drizzle schema 表名"
```

### 3.7 常用斜杠命令

| 命令 | 功能 |
|------|------|
| `/help` | 显示帮助信息 |
| `/chat` | 切换到对话模式 |
| `/save` | 保存对话检查点 |
| `/clear` | 清除对话历史 |
| `/stats` | 显示 Token 使用统计 |

---

## 4. 协同使用策略

### 4.1 Claude Code + Gemini CLI 互补使用

两个工具各有所长，协同使用可以最大化开发效率：

| 场景 | 推荐工具 | 原因 |
|------|---------|------|
| **功能开发** | Claude Code | 子代理架构、Hook 机制确保代码质量 |
| **代码审查** | Gemini CLI | 大上下文窗口（100万 Token），适合审查大量代码 |
| **技术调研** | Gemini CLI | 内置 Web Search，多模态支持 |
| **重构** | Claude Code | 多文件编辑能力强，MCP 集成好 |
| **Bug 修复** | Claude Code | 子代理可隔离调试过程 |
| **数据库设计** | 两者结合 | Gemini 做调研分析，Claude Code 执行 schema 变更 |
| **文档编写** | Gemini CLI | 多模态理解、长文本生成能力 |
| **测试编写** | Claude Code | Hook 可自动运行测试验证 |

### 4.2 Review 工作流（一个写代码一个审查）

推荐的工作流模式：

```
┌──────────────────┐     ┌──────────────────┐
│   Claude Code    │     │   Gemini CLI     │
│  （代码编写）     │     │  （代码审查）     │
├──────────────────┤     ├──────────────────┤
│ 1. 理解需求       │     │                  │
│ 2. 编写实现       │ ──→ │ 3. 审查代码变更   │
│                  │ ←── │ 4. 反馈问题       │
│ 5. 修复问题       │     │                  │
│ 6. 最终提交       │ ──→ │ 7. 确认通过       │
└──────────────────┘     └──────────────────┘
```

实际操作：

```bash
# 终端 1：使用 Claude Code 编写功能
claude
> 为邮件服务添加重试机制，最多重试3次，间隔递增

# 等待 Claude Code 完成后

# 终端 2：使用 Gemini CLI 审查变更
gemini
> 请审查 git diff 中的代码变更，重点关注：
> 1. 重试逻辑的正确性
> 2. 错误处理是否完善
> 3. 是否有资源泄漏风险
```

### 4.3 场景化工具选择指南

#### 4.3.1 新功能开发

```
1. Gemini CLI: 调研技术方案（搜索最新文档、对比方案）
2. Claude Code: 编写实现代码（利用 Plan mode + 子代理）
3. Gemini CLI: 审查代码质量
4. Claude Code: 根据反馈修复
```

#### 4.3.2 Bug 修复

```
1. Claude Code: 使用 researcher 子代理分析问题
2. Claude Code: 定位根因，编写修复
3. Claude Code: 用 tester 子代理编写回归测试
4. Gemini CLI: 交叉验证修复方案的正确性
```

#### 4.3.3 大规模重构

```
1. Gemini CLI: 分析现有代码结构，生成重构方案
2. Claude Code: 分步执行重构（利用 Hook 确保每步类型检查通过）
3. Gemini CLI: 审查重构结果
```

### 4.4 工具切换成本控制

协同使用多个工具的关键是降低切换成本：

1. **统一项目配置**：CLAUDE.md 和 GEMINI.md 共享核心项目信息
2. **标准化输出格式**：让两个工具使用相同的代码风格
3. **利用 Git 作为中间桥梁**：通过 git diff 传递变更
4. **共享 MCP Server**：两个工具连接同一个 MCP Server

---

## 5. 项目配置最佳实践

### 5.1 配置文件体系

现代 AI 开发工具都支持项目级别的配置文件：

| 工具 | 配置文件 | 位置 |
|------|---------|------|
| Claude Code | CLAUDE.md | 项目根目录 |
| Gemini CLI | GEMINI.md | 项目根目录 |
| Cursor | .cursorrules | 项目根目录 |
| Windsurf | .windsurfrules | 项目根目录 |
| GitHub Copilot | .github/copilot-instructions.md | .github/ 目录 |
| Continue.dev | .continuerc.json | 项目根目录 |

### 5.2 通用配置内容框架

无论使用哪个工具，配置文件都应包含以下内容：

```markdown
# [项目名称]

## 1. 项目概述（2-3 句话）
[项目做什么，服务谁]

## 2. 技术栈（列表形式）
[所有关键技术和版本]

## 3. 目录结构（树状图）
[关键目录和文件的说明]

## 4. 常用命令
[开发、构建、测试、部署命令]

## 5. 代码规范
[非 Linter 能覆盖的规范，如注释风格、命名约定]

## 6. 工作流指南
[不同任务类型的标准操作流程]

## 7. 注意事项
[容易出错的地方、特殊约定]
```

### 5.3 让 AI 更好理解项目上下文的技巧

#### 5.3.1 描述架构决策

不要只列出技术栈，还要解释为什么选择：

```markdown
## 技术决策
- 选择 Elysia 而非 Express: 更好的 TypeScript 支持，更轻量
- 选择 Drizzle 而非 Prisma: 更接近 SQL，TypeScript 类型推断更优
- 选择 MiniMax M2.5 而非 GPT-4: 中文理解能力强，性价比高
- 选择 ImapFlow 而非 imap-simple: 更现代的 API，支持 async/await
```

#### 5.3.2 描述数据流

```markdown
## 核心数据流
邮件投递 → IMAP 收取 → 附件提取 → PDF/DOCX 解析
→ 文本提取 → AI 评分 → 数据库存储 → API 查询
```

#### 5.3.3 说明常见模式

```markdown
## 代码模式
- 路由定义: 每个路由文件导出一个 Elysia 实例
- 服务层: 纯函数，接收参数返回结果
- 数据库查询: 使用 Drizzle ORM 的类型安全查询构建器
- 错误处理: 使用 try/catch + Elysia 的错误处理
- 类型验证: 入参用 Zod，出参用 TypeScript 类型
```

### 5.4 .cursorrules 示例

如果团队中有人使用 Cursor，可以提供 `.cursorrules` 配置：

```markdown
You are an expert TypeScript backend developer working on an HR resume screening system.

Tech stack:
- Elysia framework
- Drizzle ORM with PostgreSQL (postgres.js driver)
- Vercel AI SDK with MiniMax M2.5
- ImapFlow for email, pdf-parse + mammoth for parsing
- Zod v4 for validation
- TypeScript ESM (Bun)

Coding rules:
- Use Chinese TSDoc comments for all files and functions
- Always use .js extension in ESM imports
- Import Zod as: import { z } from "zod/v4"
- Use Drizzle ORM for all database operations (no raw SQL)
- Validate AI responses with Zod schemas
- Use bun as package manager

When creating new files:
- Routes go in src/routes/
- Services go in src/services/
- Types go in src/lib/types.ts
- DB schema changes go in src/db/schema.ts
```

### 5.5 GitHub Copilot 指令配置

创建 `.github/copilot-instructions.md`：

```markdown
# Copilot Instructions for HR Backend

## Context
This is an HR resume screening backend using Elysia, Drizzle ORM, and MiniMax AI.

## Code Style
- Write all comments in Chinese using TSDoc format
- Use TypeScript strict mode
- Use ESM imports with .js extension
- Use Zod v4 (import from "zod/v4") for validation

## Patterns
- Routes: Export Elysia instances from src/routes/
- Services: Pure functions in src/services/
- Database: Drizzle ORM typed queries only

## Do Not
- Use any type
- Write raw SQL queries
- Import from "zod" (use "zod/v4")
- Commit .env files
```

---

## 6. MCP 在开发工具中的应用

### 6.1 MCP 协议概述

MCP (Model Context Protocol) 是一个开放标准协议，允许 AI 应用以标准化方式连接到外部工具和数据源。MCP 将"提供上下文"和"与 LLM 交互"两个关注点分离，使得工具集成更加标准化和可复用。

当前 MCP 规范版本为 2025-03-26，稳定的 v2 版本预计在 2026 年 Q1 发布。v1.x 版本仍为生产推荐版本，将在 v2 发布后继续维护至少 6 个月。

### 6.2 MCP 核心概念

```
┌──────────────────┐     MCP Protocol     ┌──────────────────┐
│   MCP Client     │ ◄──────────────────► │   MCP Server     │
│ (Claude Code /   │                      │ (postgres /       │
│  Gemini CLI)     │                      │  filesystem /     │
│                  │     Tools            │  github)          │
│                  │     Resources        │                   │
│                  │     Prompts          │                   │
└──────────────────┘                      └──────────────────┘
```

MCP 服务器可以暴露三种能力：
- **Tools**：可被 AI 调用的函数（如执行 SQL 查询）
- **Resources**：可被 AI 读取的数据源（如数据库表结构）
- **Prompts**：预定义的提示模板

### 6.3 官方 MCP TypeScript SDK

#### 6.3.1 安装

```bash
bun add @modelcontextprotocol/sdk
```

#### 6.3.2 SDK 结构

官方 TypeScript SDK 包含：
- MCP Server 库（tools / resources / prompts、Streamable HTTP、stdio、auth helpers）
- MCP Client 库（transports、high-level helpers、OAuth helpers）
- 可选中间件包（Express、Elysia、Bun HTTP）

### 6.4 实用 MCP Server 列表

#### 6.4.1 官方参考服务器

| MCP Server | 功能 | 安装方式 |
|-----------|------|---------|
| **postgres** | PostgreSQL 数据库读写 | `bun x @modelcontextprotocol/server-postgres` |
| **filesystem** | 安全的文件系统操作 | `bun x @modelcontextprotocol/server-filesystem` |
| **github** | GitHub API 操作 | `bun x @modelcontextprotocol/server-github` |
| **fetch** | HTTP 请求 | `bun x @modelcontextprotocol/server-fetch` |
| **git** | Git 仓库操作 | `bun x @modelcontextprotocol/server-git` |
| **memory** | 基于知识图谱的持久记忆 | `bun x @modelcontextprotocol/server-memory` |

#### 6.4.2 社区热门服务器

| MCP Server | 功能 | 适用场景 |
|-----------|------|---------|
| **postgres-mcp-pro** | PostgreSQL 高级功能（索引调优、执行计划分析） | 数据库性能优化 |
| **drizzle-mcp** | Drizzle ORM 集成 | ORM 操作 |
| **docker-mcp** | Docker 容器管理 | 开发环境管理 |
| **playwright-mcp** | 浏览器自动化 | E2E 测试 |

### 6.5 在 Claude Code 中配置 MCP

#### 6.5.1 项目级配置

```json
// .claude/settings.json
{
  "mcpServers": {
    "hr-postgres": {
      "command": "bun x",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "${DATABASE_URL}"
      ],
      "description": "HR 系统 PostgreSQL 数据库"
    },
    "project-files": {
      "command": "bun x",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."
      ],
      "description": "项目文件系统访问"
    }
  }
}
```

#### 6.5.2 全局配置

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "github": {
      "command": "bun x",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "fetch": {
      "command": "bun x",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  }
}
```

### 6.6 自定义 MCP Server 示例（HR 项目专用）

#### 6.6.1 项目结构

```
mcp-hr-server/
  package.json
  tsconfig.json
  src/
    index.ts        # 入口
    tools/
      scoring.ts    # 评分相关工具
      candidates.ts # 候选人管理工具
      positions.ts  # 职位管理工具
    resources/
      schema.ts     # 数据库 schema 信息
```

#### 6.6.2 入口文件

```typescript
// mcp-hr-server/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "hr-screening-mcp",
  version: "1.0.0",
  description: "HR 简历筛选系统 MCP 服务器",
});

// ─── Tools ──────────────────────────────────────

// 查询候选人列表
server.tool(
  "list_candidates",
  "列出指定职位的候选人，支持按评分筛选",
  {
    positionId: z.string().uuid().describe("职位 ID"),
    minScore: z.number().min(0).max(100).optional().describe("最低分数"),
    grade: z.enum(["A", "B", "C", "D", "F"]).optional().describe("评级筛选"),
  },
  async ({ positionId, minScore, grade }) => {
    // 实际实现中连接数据库查询
    const url = new URL("http://localhost:3001/api/candidates");
    url.searchParams.set("positionId", positionId);
    if (minScore) url.searchParams.set("minScore", String(minScore));
    if (grade) url.searchParams.set("grade", grade);

    const res = await fetch(url);
    const data = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 触发简历评分
server.tool(
  "score_resume",
  "对指定候选人的简历进行 AI 评分",
  {
    candidateId: z.string().uuid().describe("候选人 ID"),
    positionId: z.string().uuid().describe("职位 ID"),
  },
  async ({ candidateId, positionId }) => {
    const res = await fetch("http://localhost:3001/api/resumes/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, positionId }),
    });
    const data = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 查询邮箱新邮件
server.tool(
  "check_inbox",
  "检查 HR 邮箱中的新简历邮件",
  {
    positionId: z.string().uuid().describe("默认关联的职位 ID"),
  },
  async ({ positionId }) => {
    const res = await fetch("http://localhost:3001/api/resumes/poll-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId }),
    });
    const data = await res.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ─── Resources ──────────────────────────────────

// 暴露数据库 schema 信息
server.resource(
  "db-schema",
  "hr://schema",
  "HR 系统数据库表结构",
  async () => ({
    contents: [
      {
        uri: "hr://schema",
        mimeType: "text/plain",
        text: `
HR 简历筛选系统数据库表：

1. positions（职位表）
   - id: UUID PK
   - title: 职位标题
   - department: 部门
   - description: 职位描述
   - skillConfig: JSONB { must: string[], nice: string[], reject: string[] }
   - status: open | closed | draft
   - createdAt, updatedAt

2. candidates（候选人表）
   - id: UUID PK
   - positionId: UUID FK -> positions.id
   - name, email, phone, education
   - skills: text[]
   - status: new | screening | shortlisted | interviewed | rejected | hired
   - notes
   - createdAt, updatedAt

3. resumes（简历表）
   - id: UUID PK
   - candidateId: UUID FK -> candidates.id
   - fileName, mimeType, rawText
   - source: upload | email
   - createdAt

4. scores（评分表）
   - id: UUID PK
   - candidateId: UUID FK -> candidates.id
   - positionId: UUID FK -> positions.id
   - totalScore, mustScore, niceScore, rejectPenalty: real
   - grade: A | B | C | D | F
   - matchedSkills, missingSkills: text[]
   - explanation
   - createdAt
        `.trim(),
      },
    ],
  })
);

// ─── 启动服务器 ──────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
```

#### 6.6.3 注册自定义 MCP Server

```json
// .claude/settings.json
{
  "mcpServers": {
    "hr-screening": {
      "command": "bun x",
      "args": ["bun", "./mcp-hr-server/src/index.ts"],
      "description": "HR 简历筛选系统专用 MCP 工具"
    }
  }
}
```

#### 6.6.4 使用 MCP Inspector 调试

```bash
# 安装 Inspector
bun x @modelcontextprotocol/inspector

# 可视化检查 MCP Server 的工具和资源
```

### 6.7 MCP 在 Gemini CLI 中的使用

Gemini CLI 同样支持 MCP 协议。在 `.gemini/settings.json` 中配置：

```json
{
  "mcpServers": {
    "hr-postgres": {
      "command": "bun x",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://user:pass@localhost:5432/hr_screening"
      ]
    },
    "hr-screening": {
      "command": "bun x",
      "args": ["bun", "./mcp-hr-server/src/index.ts"]
    }
  }
}
```

这意味着同一个自定义 MCP Server 可以同时被 Claude Code 和 Gemini CLI 使用，实现工具层面的统一。

### 6.8 MCP 开发框架对比

| 框架 | 特点 | 推荐场景 |
|------|------|---------|
| **官方 SDK** | 最大控制力，底层 API | 需要精细控制的场景 |
| **FastMCP** | 快速开发，隐藏底层细节 | 快速原型和简单工具 |
| **MCP Framework** | 约定优于配置，目录自动发现 | 大型 MCP 项目 |
| **mcp-use-ts** | 全栈框架，含 React Hooks | 需要 UI 的 MCP 应用 |

---

## 7. 提示工程最佳实践

### 7.1 核心原则

#### 7.1.1 精确性优于长度

```
❌ 差的提示：帮我改善一下代码

✅ 好的提示：请优化 src/services/email.ts 中 pollInbox 函数的错误处理：
1. 为每封邮件的处理添加 try/catch，单封失败不影响其他
2. 添加重试机制（最多 3 次，指数退避）
3. 记录详细的错误日志
```

#### 7.1.2 结构化输出要求

```
❌ 差的提示：帮我分析这段代码

✅ 好的提示：请分析 src/services/ai-scorer.ts，按以下格式输出：
1. 功能摘要（3句话以内）
2. 潜在问题（列表形式，每项说明影响和建议修复方式）
3. 改进建议（按优先级排序）
```

#### 7.1.3 提供上下文和约束

```
❌ 差的提示：添加一个新的 API 端点

✅ 好的提示：在 src/routes/ 下添加一个新的 Elysia 路由 `email-templates.ts`，
实现邮件模板的 CRUD API：
- GET /api/email-templates — 列出所有模板
- POST /api/email-templates — 创建模板
- PUT /api/email-templates/:id — 更新模板
- DELETE /api/email-templates/:id — 删除模板

约束：
- 遵循 src/routes/positions.ts 的代码风格
- 使用中文 TSDoc 注释
- 使用 Zod v4 校验请求体
- 在 src/index.ts 中注册路由
```

### 7.2 代码生成提示模板

#### 7.2.1 新功能开发模板

```markdown
## 任务: [功能名称]

### 需求描述
[详细描述这个功能要做什么]

### 技术约束
- 框架: Elysia
- ORM: Drizzle ORM (PostgreSQL)
- 验证: Zod v4 (import from "zod/v4")
- 风格: 中文 TSDoc 注释, ESM imports with .js extension

### 涉及文件
- 新建: [列出需要新建的文件]
- 修改: [列出需要修改的文件]

### 验收条件
1. [条件1]
2. [条件2]
3. bun run typecheck 无错误

### 参考
- 参考 [现有类似文件] 的代码风格
```

#### 7.2.2 Bug 修复模板

```markdown
## Bug 描述
[具体描述 Bug 现象]

## 复现步骤
1. [步骤1]
2. [步骤2]

## 期望行为
[应该发生什么]

## 实际行为
[实际发生了什么]

## 相关文件
- [可能相关的文件列表]

## 约束
- 修复不应引入新的外部依赖
- 保持向后兼容
- 添加防止回归的测试
```

#### 7.2.3 重构模板

```markdown
## 重构目标
[为什么要重构，期望达到什么效果]

## 当前问题
1. [问题1: 描述 + 影响]
2. [问题2: 描述 + 影响]

## 重构范围
- 文件: [涉及的文件]
- 不涉及: [明确排除的文件]

## 重构策略
[偏好的重构方式，如提取函数、拆分模块等]

## 验证方式
1. bun run typecheck 无错误
2. 现有功能不受影响
3. [其他验证条件]
```

### 7.3 代码审查提示模板

```markdown
请对以下代码变更进行审查。

## 审查维度

### 1. 正确性
- 逻辑是否正确
- 边界情况是否处理
- 异步操作是否正确等待

### 2. 安全性
- 是否有注入风险
- 敏感数据处理是否安全
- 权限检查是否到位

### 3. 性能
- 是否有 N+1 查询
- 是否有不必要的内存分配
- 是否需要添加数据库索引

### 4. 可维护性
- 代码是否易读
- 注释是否充分
- 命名是否清晰

### 5. TypeScript 类型
- 是否有 any 类型
- 类型断言是否合理
- 泛型使用是否正确

输出格式: 每个问题包含 [文件:行号] 严重级别 问题描述 修复建议
严重级别: 🔴 必须修复 / 🟡 建议修复 / 🟢 可选优化
```

### 7.4 针对不同工具的提示优化

#### 7.4.1 Claude Code 优化技巧

```
# 利用 Claude Code 的文件操作能力
请先阅读 src/db/schema.ts 理解当前的数据库结构，
然后修改 src/services/ai-scorer.ts 添加评分历史记录功能。
修改完成后运行 bun run typecheck 确认。

# 利用子代理
请使用 researcher 子代理分析 src/services/email.ts 的代码结构，
然后基于分析结果重构错误处理逻辑。

# 利用 Plan mode
这个功能比较复杂，请先给出实施计划，等我确认后再开始编码。
```

#### 7.4.2 Gemini CLI 优化技巧

```
# 利用多模态能力
请分析这个 API 响应的截图，指出数据格式问题。

# 利用 Web Search
搜索 Drizzle ORM v0.45 的最新迁移 API 变化，
然后检查我们的 src/db/migrate.ts 是否需要更新。

# 利用长上下文窗口
请一次性阅读 src/ 目录下的所有文件，给出架构改进建议。
```

### 7.5 提示词反模式（应避免）

| 反模式 | 问题 | 改进 |
|--------|------|------|
| "帮我写点代码" | 太模糊 | 明确功能、约束、验收条件 |
| "把代码改好" | 无方向 | 说明具体改进方向和标准 |
| 大段粘贴代码 | 浪费上下文 | 指定文件路径，让 AI 自己读 |
| "用最佳实践" | 主观模糊 | 列出具体的实践要求 |
| 一次提很多需求 | 超出范围 | 每次聚焦一个任务 |

---

## 8. 团队协作

### 8.1 AI 工具使用规范

#### 8.1.1 团队协作公约

```markdown
# AI 开发工具使用公约

## 基本原则
1. AI 生成的代码必须经过人工审查后才能合并
2. 不依赖 AI 处理敏感数据（API Key、用户数据等）
3. AI 生成的代码遵循与手写代码相同的质量标准
4. 保留 AI 辅助的过程记录，便于团队学习

## 代码提交规范
- 提交信息注明 AI 辅助的部分（可选）
- 不将 AI 工具的配置密钥提交到 Git
- .claude/ 和 .gemini/ 目录中的敏感配置加入 .gitignore

## 质量门禁
- 所有 AI 生成代码必须通过 typecheck
- 新功能必须有对应测试
- 代码审查时特别关注 AI 常见问题（幻觉、过度工程化）
```

#### 8.1.2 .gitignore 配置

```gitignore
# AI 工具本地配置（可能包含 API Key）
.claude/settings.local.json
.gemini/settings.local.json

# 不忽略团队共享的配置
!CLAUDE.md
!GEMINI.md
!.cursorrules
!.github/copilot-instructions.md

# AI 工具缓存
.claude/cache/
.gemini/cache/
```

### 8.2 代码审查中的 AI 辅助

#### 8.2.1 PR 审查工作流

```bash
# 方式一：使用 Claude Code 审查 PR
claude
> 请审查当前分支相对于 main 的所有变更。
> 重点关注类型安全、错误处理和性能问题。

# 方式二：使用 Gemini CLI 审查
gemini
> 运行 git diff main...HEAD，分析所有变更的代码质量。
```

#### 8.2.2 自动化 PR 审查

可以在 CI/CD 中集成 AI 审查：

```yaml
# .github/workflows/ai-review.yml
name: AI Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: AI Review with Gemini CLI
        run: |
          npm install -g @google/gemini-cli
          DIFF=$(git diff origin/main...HEAD)
          gemini --headless --json \
            "请审查以下代码变更，输出 JSON 格式的审查结果：$DIFF"
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

### 8.3 知识共享

#### 8.3.1 共享 MCP Server

团队统一使用相同的 MCP Server 配置：

```json
// 项目级 .claude/settings.json（提交到 Git）
{
  "mcpServers": {
    "hr-postgres": {
      "command": "bun x",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "${DATABASE_URL}"]
    }
  }
}
```

个人配置覆盖（不提交到 Git）：

```json
// .claude/settings.local.json
{
  "mcpServers": {
    "hr-postgres": {
      "env": {
        "DATABASE_URL": "postgresql://myuser:mypass@localhost:5432/hr_dev"
      }
    }
  }
}
```

#### 8.3.2 共享提示模板

在项目中维护提示模板库：

```
.claude/
  commands/
    add-route.md        # 团队共享的命令模板
    add-service.md
    review.md
    db-migration.md
prompts/
  feature-request.md    # 功能开发提示模板
  bug-fix.md           # Bug 修复提示模板
  refactor.md          # 重构提示模板
```

### 8.4 安全注意事项

#### 8.4.1 API Key 管理

```bash
# 正确做法：使用环境变量
export ANTHROPIC_API_KEY="sk-ant-xxx"
export GEMINI_API_KEY="AIza..."

# 错误做法：硬编码在配置文件中
# .claude/settings.json 中不要直接写 API Key
```

#### 8.4.2 敏感代码处理

```markdown
# 在 CLAUDE.md 中声明
## 安全规则
- 不要读取或输出 .env 文件内容
- 不要在代码中硬编码 API Key、密码等
- 不要将数据库连接字符串写入日志
- 处理用户数据时注意隐私合规
```

#### 8.4.3 权限最小化原则

```json
// .claude/settings.json — 限制 AI 工具的权限
{
  "permissions": {
    "deny": [
      "Write(.env*)",
      "Write(**/credentials*)",
      "Read(.env*)",
      "Bash(curl -X POST:*)",
      "Bash(wget:*)"
    ]
  }
}
```

---

## 9. 效率提升度量

### 9.1 衡量指标体系

#### 9.1.1 开发效率指标

| 指标 | 计算方式 | 目标 |
|------|---------|------|
| **代码产出速度** | 有效代码行数 / 开发时间 | 提升 2-5x |
| **任务完成时间** | 从需求到代码完成的时间 | 减少 40-60% |
| **迭代速度** | 每次修改到验证通过的时间 | 减少 50-70% |
| **首次正确率** | 第一次就通过审查的 PR 比例 | 提升至 80%+ |

#### 9.1.2 代码质量指标

| 指标 | 计算方式 | 注意事项 |
|------|---------|---------|
| **类型覆盖率** | 非 any 类型占比 | AI 代码应 > 95% |
| **测试覆盖率** | 被测试覆盖的代码行占比 | AI 生成的测试覆盖率往往偏高但质量需人工验证 |
| **Bug 密度** | Bug 数 / 千行代码 | AI 代码的 Bug 主要在逻辑错误而非语法错误 |
| **技术债务** | 重复代码率、圈复杂度 | 警惕 AI 倾向于生成冗长但可运行的代码 |

### 9.2 常见的效率陷阱

#### 9.2.1 过度依赖（Over-reliance）

**症状**：
- 不理解 AI 生成的代码就直接使用
- 遇到问题首先想到让 AI 解决，不自己分析
- 代码审查时跳过 AI 生成的部分

**解决方案**：
- 坚持理解每行代码的功能
- 定期手写代码保持编程能力
- AI 生成的代码和手写代码执行相同的审查标准

#### 9.2.2 AI 幻觉处理

**症状**：
- AI 引用不存在的 API 或库
- 生成看似合理但逻辑错误的代码
- 编造不存在的配置选项

**防范措施**：

```markdown
# 在 CLAUDE.md 中添加
## 重要提醒
- 不确定时请说明并提出替代方案
- 引用外部 API 时先确认版本兼容性
- 使用已安装的依赖版本，不假设最新版 API
- 当前项目依赖版本见 package.json
```

**验证策略**：
1. 始终运行 `bun run typecheck` 验证类型正确性
2. 对 AI 建议的新依赖先检查 npm registry
3. 对 AI 声称的 API 特性先查阅官方文档

#### 9.2.3 上下文窗口浪费

**症状**：
- 在一个会话中处理太多不同任务
- 粘贴大量代码而不是让 AI 自己读取文件
- 不使用 /compact 或 /clear 管理上下文

**解决方案**：
- 每个会话聚焦一个任务
- 使用文件路径引用代码，不手动粘贴
- 大任务拆分为多个小会话
- 定期使用 /compact 压缩上下文

#### 9.2.4 过度工程化

**症状**：
- AI 生成的代码过于复杂（过度抽象、不必要的设计模式）
- 添加了需求中没有要求的功能
- 过度使用泛型和类型体操

**解决方案**：
- 在提示中明确"保持简单，不要过度设计"
- 在 CLAUDE.md 中添加"遵循 YAGNI 原则"
- 审查时关注是否有不必要的复杂度

### 9.3 投入产出分析

#### 9.3.1 成本对比（以本项目为例）

| 项目 | 无 AI 辅助 | Claude Code Pro | Claude Code Max |
|------|-----------|----------------|-----------------|
| **月费用** | $0 | $20 | $100 |
| **预估开发时间** | 100 小时/月 | 50 小时/月 | 40 小时/月 |
| **等效时薪节省** | — | $50/小时 x 50小时 = $2,500 | $50/小时 x 60小时 = $3,000 |
| **ROI** | — | 125x | 30x |

> 注：以上为粗略估算，实际效果因人而异。ROI 主要取决于开发者的基础能力和任务类型。

#### 9.3.2 最适合 AI 辅助的任务

1. **CRUD 代码生成** — 模式固定，AI 效率极高
2. **测试用例编写** — 基于实现生成测试，覆盖边界情况
3. **代码审查** — 检查常见问题（类型安全、错误处理）
4. **文档注释** — 为现有代码添加 TSDoc 注释
5. **重构** — 按照明确规则进行代码重组

#### 9.3.3 不适合 AI 辅助的任务

1. **核心业务逻辑设计** — 需要领域知识和业务判断
2. **安全关键代码** — 认证、授权、加密需人工严格审查
3. **性能优化** — 需要基于实际数据的分析和测量
4. **架构决策** — 需要长期视角和全局考虑

---

## 10. 针对本项目的具体优化建议

### 10.1 推荐的 CLAUDE.md 完整配置

以下是针对 HR 智能简历筛选系统后端的完整 CLAUDE.md：

```markdown
# HR 智能简历筛选系统 — 后端

## 项目概述
基于 Elysia 框架的 HR 简历自动筛选后端服务。通过 IMAP 自动收取简历邮件，
使用 MiniMax M2.5 进行 AI 智能评分，帮助 HR 高效完成简历初筛。

## 技术栈
- Runtime: Bun (ESM, TypeScript)
- Framework: Elysia
- ORM: Drizzle ORM 0.45+ (postgres.js driver)
- AI: Vercel AI SDK 6.x (@ai-sdk/openai) + MiniMax M2.5
- Email: ImapFlow (IMAP) + Nodemailer (SMTP)
- Parsing: pdf-parse 2.x (new PDFParse API) + mammoth
- Validation: Zod 4.x (import from "zod/v4")
- Package Manager: bun

## 关键目录
src/db/schema.ts    — 4 张表: positions, candidates, resumes, scores
src/services/       — 业务逻辑 (ai-scorer, email, resume-parser)
src/routes/         — Elysia 路由 (health, positions, candidates, resumes)
src/lib/ai.ts       — MiniMax 客户端配置
src/env.ts          — 环境变量 Zod 校验

## 命令
bun dev            — 开发服务器 (bun run --watch, port 3001)
bun run typecheck      — 类型检查
bun run db:generate    — Drizzle 迁移生成
bun run db:migrate     — 执行迁移

## 编码约定
- 中文 TSDoc: 每个文件有 @file + @description，每个函数有完整注释
- ESM imports 必须带 .js 后缀
- Zod v4: import { z } from "zod/v4"
- pdf-parse v2: new PDFParse({ data: buffer }) + getText()
- AI 回复清洗: 用 extractJson() 去除 <think> 标签和 markdown fence

## 工作流
- 功能开发: 读现有代码 → 设计 → 实现 → bun run typecheck
- DB 变更: 改 schema.ts → bun run db:generate → 检查 SQL → bun run db:migrate
- 新路由: 在 routes/ 建文件 → 在 index.ts 用 app.route() 注册

## 数据流
邮件 → IMAP 收取(ImapFlow) → 附件提取 → 解析(pdf-parse/mammoth)
→ AI 评分(MiniMax M2.5) → 数据库(Drizzle+PostgreSQL) → API(Elysia)

## 禁止事项
- 不修改 .env 文件
- 不使用 any 类型
- 不写原生 SQL（用 Drizzle ORM）
- 不从 "zod" 导入（用 "zod/v4"）
```

### 10.2 推荐的 /commands 定义

#### 10.2.1 完整命令目录

```
.claude/
  commands/
    add-route.md        # 添加新 API 路由
    add-service.md      # 添加新业务服务
    db-migration.md     # 数据库 schema 变更
    review.md           # 代码审查
    fix-bug.md          # Bug 修复
    add-test.md         # 添加测试
    optimize.md         # 性能优化
    doc-update.md       # 更新文档注释
```

#### 10.2.2 关键命令文件内容

**`.claude/commands/fix-bug.md`**：

```markdown
修复 HR 系统中的 Bug。

步骤：
1. 根据描述定位可能涉及的源文件
2. 阅读相关代码理解当前逻辑
3. 分析 Bug 的根本原因
4. 编写修复代码
5. 运行 bun run typecheck 确认类型正确
6. 如果涉及 AI 评分逻辑，检查 Zod schema 校验
7. 简述修复内容和影响范围

Bug 描述: $ARGUMENTS
```

**`.claude/commands/add-test.md`**：

```markdown
为指定的源文件添加单元测试。

规范：
- 测试文件放在 test/ 目录，命名为 [原文件名].test.ts
- 使用 Bun 内置 test runner: import { test, describe } from "bun:test"
- 使用 Bun 内置 assert: import { expect } from "bun:test"
- 覆盖正常路径、边界情况和错误处理
- Mock 外部依赖（数据库、AI 服务、IMAP）

测试目标: $ARGUMENTS
```

**`.claude/commands/optimize.md`**：

```markdown
优化指定代码的性能或可维护性。

分析维度：
1. 数据库查询: 是否有 N+1 问题、缺失索引
2. 内存使用: 是否有不必要的大对象、Buffer 泄漏
3. 异步处理: 是否可以并行化、是否有不必要的串行等待
4. 错误处理: 是否有未捕获的异常
5. 代码复用: 是否有重复逻辑可提取

优化后运行 bun run typecheck 确认。

优化目标: $ARGUMENTS
```

### 10.3 推荐的 MCP Server 配置

#### 10.3.1 完整的 .claude/settings.json

```json
{
  "mcpServers": {
    "hr-postgres": {
      "command": "bun x",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "${DATABASE_URL}"
      ],
      "description": "HR 系统数据库，可查询 positions/candidates/resumes/scores 表"
    },
    "project-files": {
      "command": "bun x",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "."
      ],
      "description": "项目文件系统"
    },
    "fetch": {
      "command": "bun x",
      "args": ["-y", "@modelcontextprotocol/server-fetch"],
      "description": "HTTP 请求工具，用于测试 API"
    }
  },
  "hooks": {
    "PostToolExecution": [
      {
        "matcher": "Write|Edit",
        "command": "bun run typecheck 2>&1 | tail -30",
        "description": "文件变更后自动类型检查"
      }
    ],
    "Stop": [
      {
        "command": "bun run typecheck",
        "description": "Agent 完成后完整类型检查"
      }
    ]
  },
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Write(src/**)",
      "Write(test/**)",
      "Edit(src/**)",
      "Edit(test/**)",
      "Bash(bun:*)",
      "Bash(git:*)",
      "Bash(bun:*)"
    ],
    "deny": [
      "Write(.env*)",
      "Write(bun.lock)",
      "Read(.env*)",
      "Bash(rm -rf:*)",
      "Bash(sudo:*)"
    ]
  }
}
```

### 10.4 开发工作流优化

#### 10.4.1 日常开发流程

```
1. 启动开发环境
   $ bun dev

2. 打开 Claude Code
   $ claude

3. 描述任务
   > /project:add-route 添加候选人批量导入路由

4. Claude Code 执行
   - 阅读现有代码理解模式
   - 创建新文件
   - 修改相关文件
   - 自动运行 typecheck（通过 Hook）

5. 人工审查
   - 检查生成的代码
   - 确认逻辑正确
   - 检查边界情况

6. 提交代码
   > 请提交这些变更，commit message 用中文
```

#### 10.4.2 功能开发最佳路径

```
┌───────────────────────────────────────────────────┐
│ 第一阶段: 需求理解 (Gemini CLI)                      │
│ "搜索 Bun 批量处理大文件的最佳实践"               │
│ "分析类似项目的批量导入实现方式"                       │
└───────────────────┬───────────────────────────────┘
                    │
┌───────────────────▼───────────────────────────────┐
│ 第二阶段: 方案设计 (Claude Code Plan Mode)           │
│ "设计候选人批量导入功能的实施方案"                     │
│ Claude 会提问确认细节                                │
└───────────────────┬───────────────────────────────┘
                    │
┌───────────────────▼───────────────────────────────┐
│ 第三阶段: 编码实现 (Claude Code)                     │
│ /clear 后开始新会话                                  │
│ "按以下方案实施批量导入功能：..."                      │
│ Hook 自动运行 typecheck                              │
└───────────────────┬───────────────────────────────┘
                    │
┌───────────────────▼───────────────────────────────┐
│ 第四阶段: 审查验证 (Gemini CLI)                      │
│ "审查 git diff main...HEAD 的所有变更"               │
│ "重点关注错误处理和边界情况"                          │
└───────────────────┬───────────────────────────────┘
                    │
┌───────────────────▼───────────────────────────────┐
│ 第五阶段: 修复完善 (Claude Code)                     │
│ 根据审查反馈修复问题                                 │
│ 添加测试用例                                        │
└───────────────────────────────────────────────────┘
```

#### 10.4.3 数据库变更工作流

```bash
# 使用 Claude Code 的自定义命令
claude
> /project:db-migration 在 candidates 表添加 source 字段（标记来源渠道）

# Claude Code 会：
# 1. 阅读 src/db/schema.ts
# 2. 添加 source 字段定义
# 3. 运行 bun run db:generate
# 4. 检查生成的 SQL
# 5. 运行 bun run db:migrate
# 6. 更新相关的路由和服务代码
# 7. Hook 自动运行 typecheck
```

#### 10.4.4 调试工作流

```bash
# 使用 Claude Code 的子代理进行隔离调试
claude
> AI 评分服务偶尔返回 JSON 解析错误。
> 请使用 researcher 子代理分析 src/services/ai-scorer.ts 中
> extractJson 函数可能遗漏的边界情况，然后修复问题。

# Claude Code 会：
# 1. 启动 researcher 子代理分析代码
# 2. 子代理返回发现的问题
# 3. 主 Agent 基于分析结果编写修复
# 4. Hook 自动运行 typecheck
```

### 10.5 项目目录结构推荐（含 AI 工具配置）

```
hr-backend/
├── CLAUDE.md                    # Claude Code 项目配置（提交到 Git）
├── GEMINI.md                    # Gemini CLI 项目配置（提交到 Git）
├── .cursorrules                 # Cursor 配置（提交到 Git）
├── .github/
│   └── copilot-instructions.md  # Copilot 指令（提交到 Git）
├── .claude/
│   ├── settings.json            # MCP + Hooks + 权限（提交到 Git）
│   ├── settings.local.json      # 本地覆盖配置（.gitignore）
│   ├── agents/
│   │   ├── researcher.md        # 代码调研子代理
│   │   ├── tester.md            # 测试编写子代理
│   │   └── reviewer.md          # 代码审查子代理
│   └── commands/
│       ├── add-route.md         # 添加路由命令
│       ├── add-service.md       # 添加服务命令
│       ├── db-migration.md      # 数据库迁移命令
│       ├── review.md            # 代码审查命令
│       ├── fix-bug.md           # Bug 修复命令
│       ├── add-test.md          # 添加测试命令
│       └── optimize.md          # 优化命令
├── .gemini/
│   └── settings.json            # Gemini CLI 配置
├── src/                         # 源代码目录
├── test/                        # 测试目录
├── drizzle/                     # 数据库迁移文件
├── package.json
├── tsconfig.json
└── drizzle.config.ts
```

### 10.6 快速上手清单

面向团队新成员的 AI 工具配置清单：

```markdown
## 快速上手

### 1. 安装工具
npm install -g @anthropic-ai/claude-code
npm install -g @google/gemini-cli

### 2. 配置认证
# Claude Code: 运行 claude 后浏览器登录
# Gemini CLI: 运行 gemini 后浏览器登录

### 3. 克隆项目
git clone <repo-url>
cd hr-backend
bun install

### 4. 验证配置
claude   # 应自动加载 CLAUDE.md
gemini   # 应自动加载 GEMINI.md

### 5. 体验常用命令
claude
> /project:review 检查 src/services/email.ts 的代码质量
```

---

## 参考资源

### Claude Code 相关
- [Claude Code 官方文档](https://code.claude.com/docs/en/overview)
- [Claude Code 子代理文档](https://code.claude.com/docs/en/sub-agents)
- [CLAUDE.md 编写指南 (Anthropic Blog)](https://claude.com/blog/using-claude-md-files)
- [上下文工程最佳实践 (Anthropic Engineering)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Claude Code 完整指南 2026](https://www.jitendrazaa.com/blog/ai/claude-code-complete-guide-2026-from-basics-to-advanced-mcp-2/)
- [Context Engineering for Claude Code](https://github.com/coleam00/context-engineering-intro)
- [Everything Claude Code (配置集合)](https://github.com/affaan-m/everything-claude-code)

### Gemini CLI 相关
- [Gemini CLI GitHub 仓库](https://github.com/google-gemini/gemini-cli)
- [Gemini CLI 官方文档](https://google-gemini.github.io/gemini-cli/)
- [Gemini CLI Google Cloud 文档](https://docs.cloud.google.com/gemini/docs/codeassist/gemini-cli)
- [Gemini CLI Extensions 教程](https://medium.com/google-cloud/gemini-cli-tutorial-series-77da7d494718)

### MCP 相关
- [MCP 官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP 示例服务器列表](https://modelcontextprotocol.io/examples)
- [FastMCP 框架](https://github.com/punkpeye/fastmcp)
- [50+ Best MCP Servers for Claude Code](https://claudefa.st/blog/tools/mcp-extensions/best-addons)

### 其他工具
- [Cursor vs Windsurf vs GitHub Copilot 对比](https://www.builder.io/blog/cursor-vs-windsurf-vs-github-copilot)
- [GitHub Copilot 官方文档](https://docs.github.com/en/copilot)
- [Aider GitHub 仓库](https://github.com/paul-gauthier/aider)
- [Continue.dev 官方文档](https://continue.dev/docs)

### 提示工程
- [Anthropic Prompt Engineering 文档](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips)
- [Lakera 提示工程指南 2026](https://www.lakera.ai/blog/prompt-engineering-guide)
- [IBM 提示工程指南 2026](https://www.ibm.com/think/prompt-engineering)
- [DAIR.AI Prompt Engineering Guide](https://github.com/dair-ai/Prompt-Engineering-Guide)

### 定价信息
- [Claude 定价页面](https://claude.com/pricing)
- [Claude Code 定价指南](https://claudelog.com/claude-code-pricing/)
- [Claude AI 定价 2026 完整指南](https://www.glbgpt.com/hub/claude-ai-pricing-2026-the-ultimate-guide-to-plans-api-costs-and-limits/)

---

## 附录 A：CLAUDE.md 项目配置完整模板

### A.1 HR Backend 的 CLAUDE.md

```markdown
# HR Resume Screening Backend

## 项目概述
AI 驱动的简历筛选系统后端，接收 HR 邮箱简历，AI 评分，管理招聘流程。

## 技术栈
- Runtime: Bun (ESM, "type": "module")
- Framework: Elysia
- ORM: Drizzle ORM + postgres.js
- Database: PostgreSQL 17 + pgvector
- AI: Vercel AI SDK 6 + @ai-sdk/openai → MiniMax M2.5
- Email: ImapFlow (IMAP) + Nodemailer (SMTP)
- Package Manager: bun

## 关键约定
- **导入路径**：所有 .ts 导入使用 .js 后缀 (`import { x } from "./module.js"`)
- **Zod 导入**：使用 `import { z } from "zod/v4"` (Zod v4 语法)
- **MiniMax API**：baseURL 是 `https://api.minimaxi.com/v1`（注意是 minimaxi，不是 minimax）
- **MiniMax 输出**：模型返回 `<think>...</think>` 标签，需要 extractJson() 清理后再 JSON.parse
- **PDF 解析**：使用 pdf-parse v2 的 `new PDFParse({ data: buffer }).getText()` API
- **端口**：开发和生产均使用 3001
- **IMAP**：mail.ivis-sh.com:143 (STARTTLS)，不是 993

## 常用命令
```
bun dev          # bun run --watch 开发
bun run build        # tsc 编译
bun run db:migrate   # 运行 Drizzle 迁移
bun run db:generate  # 生成迁移 SQL
bun test         # Vitest 运行测试
bun run lint         # Biome 检查
```

## 项目结构
```
src/
├── index.ts          # Elysia 入口
├── env.ts            # Zod 环境变量验证
├── db/
│   ├── index.ts      # Drizzle 客户端
│   ├── schema.ts     # 表定义
│   └── migrate.ts    # 迁移运行器
├── routes/
│   ├── health.ts     # GET /health
│   ├── positions.ts  # CRUD /api/positions
│   ├── candidates.ts # 查询/更新 /api/candidates
│   └── resumes.ts    # 上传 /api/resumes/upload
├── services/
│   ├── email.ts      # ImapFlow 邮件拉取
│   ├── resume-parser.ts  # PDF/DOCX 文本提取
│   └── ai-scorer.ts  # MiniMax 评分
└── lib/
    ├── ai.ts         # AI SDK 模型配置
    └── types.ts      # 共享类型
```

## 数据库表
- positions: 职位 + skillConfig (JSONB: must_have, nice_to_have, reject_if)
- candidates: 姓名/邮箱/技能/状态
- resumes: 文件元数据 + 提取的文本
- scores: 评分分解 + 等级(A/B/C/D)

## 注意事项
- 不要使用 LangChain（项目用 AI SDK 直连 MiniMax）
- 不要更改现有 API 路由结构
- JSONB 字段使用 Drizzle 的 jsonb() 类型
- 测试中用 vi.mock() mock 外部依赖（AI、DB、Email）
```

### A.2 CLAUDE.md 分层策略

```
~/.claude/CLAUDE.md              # 全局：个人偏好、通用规范
├─ 使用中文回复
├─ 优先使用 bun
└─ commit message 用英文

项目根/CLAUDE.md                 # 项目级：技术栈、约定、结构
├─ 上述完整模板
└─ 团队共享（提交到 git）

项目根/.claude/commands/          # 可复用 skill
├─ review.md
├─ add-test.md
└─ deploy-check.md

子目录/CLAUDE.md                  # 局部覆盖（可选）
└─ 如 src/services/CLAUDE.md 定义服务层约定
```

---

## 附录 B：Gemini CLI 与 Claude Code 协同工作流

### B.1 交叉审查模式

```bash
# 开发流程：Claude Code 写代码 → Gemini CLI 审查
# 1. 用 Claude Code 实现功能
claude "实现候选人批量导入功能，支持 CSV 文件上传"

# 2. 用 Gemini CLI 交叉审查
gemini "请审查最近的代码变更，关注：
1. 安全漏洞（CSV注入、路径遍历）
2. 性能问题（大文件处理）
3. 错误处理完整性
4. 类型安全性"

# 3. 用 Claude Code 修复审查问题
claude "根据以下审查意见修复代码：[粘贴 Gemini 审查结果]"
```

### B.2 GEMINI.md 配置

```markdown
<!-- GEMINI.md -->
# HR Resume Screening Backend

## Context
This is a TypeScript backend for AI-powered resume screening.
Tech: Elysia, Drizzle ORM, PostgreSQL, Vercel AI SDK, MiniMax M2.5.

## Key Conventions
- ESM with .js import extensions
- Zod v4: `import { z } from "zod/v4"`
- MiniMax API base: `https://api.minimaxi.com/v1`
- Port 3001

## When Reviewing Code
- Check for SQL injection (must use parameterized queries)
- Check for proper error handling in routes
- Verify Zod validation on all inputs
- Ensure no hardcoded secrets
- Check for proper TypeScript types (no `any`)

## When Writing Code
- Follow existing patterns in src/routes/ and src/services/
- Use Drizzle query builder, not raw SQL
- Mock external dependencies in tests
- Use structured logging
```

### B.3 多工具协同效率提升

```
工具选择指南：

编写新功能代码 → Claude Code（更强的代码生成能力）
代码审查 → Gemini CLI（不同视角，交叉验证）
调试复杂 bug → Claude Code（更强的推理能力）
生成文档/注释 → Gemini CLI（免费无限制）
数据库查询优化 → Claude Code（SQL 优化更强）
性能分析 → 两者结合（各有优势）

效率公式：
单工具效率 ≈ 70%
双工具交叉验证效率 ≈ 90%+
（减少了"AI 幻觉"导致的返工）
```

---

## 附录 C：IDE 集成最佳实践

### C.1 VS Code + Claude Code 配置

```json
// .vscode/settings.json
{
  // TypeScript
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.preferences.importModuleSpecifierEnding": "js",

  // Biome 替代 ESLint + Prettier
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[json]": {
    "editor.defaultFormatter": "biomejs.biome"
  },

  // 测试
  "vitest.enable": true,
  "vitest.commandLine": "bun vitest",

  // 终端
  "terminal.integrated.defaultProfile.linux": "zsh",

  // Git
  "git.autofetch": true,
  "git.confirmSync": false,

  // Claude Code 终端集成
  "terminal.integrated.env.linux": {
    "CLAUDE_CODE_ENABLED": "1"
  }
}
```

### C.2 推荐 VS Code 扩展

```json
// .vscode/extensions.json
{
  "recommendations": [
    "biomejs.biome",              // Linting + formatting
    "vitest.explorer",            // 测试浏览器
    "bradlc.vscode-tailwindcss",  // 前端用
    "ms-azuretools.vscode-docker",// Docker
    "cweijan.vscode-postgresql-client2", // DB 客户端
    "drizzle-team.drizzle-vscode" // Drizzle schema 高亮
  ]
}
```

### C.3 调试配置

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Dev Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**", "node_modules/**"]
    },
    {
      "name": "Debug Current Test",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["vitest", "run", "${relativeFile}"],
      "console": "integratedTerminal"
    }
  ]
}
```

---

## 附录 D：Prompt 工程优化技巧

### D.1 HR 评分 Prompt 优化矩阵

```
| 技巧 | 当前 | 优化后 | 效果 |
|------|------|--------|------|
| 角色定义 | "你是评估助手" | "你是有10年经验的HR总监" | 更专业的评估视角 |
| 输出格式 | "返回JSON" | JSON + 字段说明 + 示例 | 减少格式错误 |
| Few-shot | 无 | 2-3个评分示例 | 提高一致性 |
| 思维链 | 隐式 | "先分析技能→再评分→最后总结" | 评分更合理 |
| 温度控制 | 默认 | 0.1（评分）/ 0.5（解释） | 评分稳定 |
| 负面约束 | 无 | "不要给出满分/零分除非极端" | 分布合理 |
```

### D.2 Few-Shot 评分 Prompt

```typescript
const FEW_SHOT_EXAMPLES = `
## 示例 1：高匹配（A级）
简历：5年 React/TypeScript 经验，参与过大型电商项目，熟悉 Next.js
职位：高级前端工程师
必备：React, TypeScript, Next.js
结果：{"totalScore": 88, "grade": "A", "matchedSkills": ["React", "TypeScript", "Next.js"], ...}

## 示例 2：中等匹配（B级）
简历：3年 Vue 经验，了解 React，无 TypeScript 经验
职位：React 前端工程师
必备：React, TypeScript
结果：{"totalScore": 52, "grade": "C", "matchedSkills": ["React(了解)"], "missingSkills": ["TypeScript"], ...}

## 示例 3：低匹配（D级）
简历：2年 Java 后端经验，无前端经验
职位：前端工程师
必备：React, TypeScript
结果：{"totalScore": 15, "grade": "D", "matchedSkills": [], "missingSkills": ["React", "TypeScript"], ...}
`;
```

### D.3 Prompt 版本管理

```typescript
// src/lib/prompts.ts — 集中管理 prompt 模板

export const PROMPTS = {
  // 版本化 prompt
  SCORE_RESUME: {
    version: "2.0",
    template: (vars: {
      title: string;
      description: string;
      skillConfig: string;
      resumeText: string;
    }) => `...`,
  },

  EXTRACT_INFO: {
    version: "1.1",
    template: (vars: { resumeText: string }) =>
      `从以下简历中提取结构化信息...\n\n${vars.resumeText}`,
  },

  INTERVIEW_QUESTIONS: {
    version: "1.0",
    template: (vars: {
      candidateName: string;
      missingSkills: string[];
      grade: string;
    }) => `为 ${vars.grade} 级候选人 ${vars.candidateName} 设计面试问题...`,
  },
};

// 使用：
// const prompt = PROMPTS.SCORE_RESUME.template({ title, description, skillConfig, resumeText });
```

### D.4 A/B 测试 Prompt

```typescript
// src/lib/prompt-ab.ts — 简单 A/B 测试

interface PromptVariant {
  id: string;
  template: string;
  weight: number; // 0-1, 所有变体权重之和应为 1
}

const variants: PromptVariant[] = [
  {
    id: "v2-standard",
    template: "你是专业的HR简历评估助手...",
    weight: 0.7,
  },
  {
    id: "v2-detailed",
    template: "你是有10年经验的HR总监，请从以下维度详细评估...",
    weight: 0.3,
  },
];

export function selectPromptVariant(): PromptVariant {
  const rand = Math.random();
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (rand <= cumulative) return v;
  }
  return variants[0];
}

// 记录使用的变体，用于后续分析
export function logPromptUsage(variantId: string, score: number, grade: string) {
  // 写入数据库或日志，用于分析哪个 prompt 评分更准确
  console.log(JSON.stringify({
    type: "prompt_ab",
    variant: variantId,
    score,
    grade,
    timestamp: Date.now(),
  }));
}
```

---

## 附录 E：MCP Server 开发实践

### E.1 本地 MCP Server 开发模板

```typescript
// mcp-servers/template/index.ts
// 最小可用的 MCP Server 模板

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-mcp-server",
  version: "1.0.0",
});

// 工具定义
server.tool(
  "my_tool",
  "工具描述",
  { input: z.string().describe("输入参数描述") },
  async ({ input }) => {
    return {
      content: [{
        type: "text",
        text: `处理结果: ${input}`,
      }],
    };
  }
);

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
```

### E.2 推荐的 MCP Server 组合（HR 项目）

```json
// .claude/settings.json
{
  "mcpServers": {
    // 1. 本地 HR 数据查询
    "hr-query": {
      "command": "bun x",
      "args": ["bun", "mcp-servers/hr-full/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:password@localhost:5432/hr_screening"
      }
    },

    // 2. 文件系统访问（内置）
    "filesystem": {
      "command": "bun x",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/workspace/hr-backend"]
    },

    // 3. PostgreSQL 直接查询
    "postgres": {
      "command": "bun x",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://postgres:password@localhost:5432/hr_screening"
      }
    },

    // 4. GitHub/Gitea 代码管理（如果用 GitHub）
    "github": {
      "command": "bun x",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
      }
    },

    // 5. Web 搜索（调研用）
    "brave-search": {
      "command": "bun x",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "BSA_xxx"
      }
    }
  }
}
```

### E.3 MCP Server 测试策略

```typescript
// test/mcp/hr-query.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("HR Query MCP Server", () => {
  let client: Client;

  beforeAll(async () => {
    const transport = new StdioClientTransport({
      command: "bun",
      args: ["mcp-servers/hr-full/index.ts"],
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL!,
      },
    });

    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it("应列出所有工具", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((t) => t.name)).toContain("candidate_search");
    expect(tools.map((t) => t.name)).toContain("position_stats");
  });

  it("应搜索候选人", async () => {
    const result = await client.callTool({
      name: "candidate_search",
      arguments: { query: "张", field: "name", limit: 5 },
    });
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
  });

  it("应返回统计数据", async () => {
    const result = await client.callTool({
      name: "position_stats",
      arguments: {},
    });
    const data = JSON.parse((result.content[0] as any).text);
    expect(Array.isArray(data)).toBe(true);
  });

  it("应列出资源", async () => {
    const { resources } = await client.listResources();
    expect(resources.length).toBeGreaterThan(0);
  });

  it("应列出 prompt 模板", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("weekly_report");
  });
});
```

---

## 附录 F：团队协作最佳实践

### F.1 共享配置文件策略

```
提交到 Git（团队共享）：
├─ CLAUDE.md                  # 项目级 AI 上下文
├─ GEMINI.md                  # Gemini CLI 配置
├─ .claude/commands/*.md      # 自定义 Skill
├─ .vscode/settings.json      # 编辑器配置
├─ .vscode/extensions.json    # 推荐扩展
├─ biome.json                 # Linter/Formatter
├─ .env.example               # 环境变量模板
└─ .gitea/workflows/*.yml     # CI/CD

不提交（个人/敏感）：
├─ .env / .env.local          # 真实密钥
├─ ~/.claude/CLAUDE.md        # 个人全局偏好
├─ ~/.claude/settings.json    # MCP Server（含密钥）
└─ .claude/settings.local.json # 本地覆盖（如果支持）
```

### F.2 代码审查辅助工作流

```bash
# 1. 开发者提交 PR 前：自动检查
# .claude/commands/pre-pr.md
# 内容：检查 lint、类型、测试、安全

# 2. PR 审查者：AI 辅助审查
# Claude Code:
claude "/project:review-api src/routes/candidates.ts"

# Gemini CLI（交叉验证）:
gemini "review the changes in this PR for security issues"

# 3. 自动化 PR 审查（CI 中）
# .gitea/workflows/pr-review.yml
```

### F.3 知识库维护

```markdown
<!-- docs/conventions.md — 团队约定（配合 CLAUDE.md） -->

## API 约定
- RESTful 风格，资源名用复数
- 列表接口支持 ?page=1&limit=20&sort=createdAt&order=desc
- 错误响应统一格式：{ error: string, details?: unknown }
- 状态码：200(OK), 201(Created), 400(BadRequest), 401(Unauthorized), 404(NotFound), 500(Internal)

## 数据库约定
- 表名：snake_case 复数（candidates, positions）
- 列名：snake_case（created_at, position_id）
- 主键：serial id
- 时间戳：created_at + updated_at
- 软删除：不使用（直接删除 + 审计日志）

## Git 约定
- 分支：feat/xxx, fix/xxx, refactor/xxx
- Commit：feat: add xxx / fix: resolve xxx / docs: update xxx
- PR：squash merge
- 主分支：main（protected）

## 测试约定
- 文件位置：test/[type]/[module].test.ts
- 命名：describe("模块名") + it("应该...")
- Mock：vi.mock() 置于文件顶部
- 覆盖率目标：> 70%
```

---

## 附录 G：工具选择决策矩阵

### G.1 何时用哪个 AI 工具

```
┌──────────────────────┬────────────┬────────────┬──────────┐
│ 任务类型             │ 首选       │ 备选       │ 不推荐   │
├──────────────────────┼────────────┼────────────┼──────────┤
│ 新功能开发           │ Claude Code│ Cursor     │ Gemini   │
│ Bug 修复/调试        │ Claude Code│ Cursor     │ Aider    │
│ 代码审查             │ Gemini CLI │ Claude Code│          │
│ 测试编写             │ Claude Code│ Copilot    │          │
│ 文档编写             │ Gemini CLI │ Claude Code│          │
│ 重构                 │ Claude Code│ Aider      │          │
│ 数据库设计           │ Claude Code│ Cursor     │          │
│ CI/CD 配置           │ Claude Code│ Gemini CLI │          │
│ Docker 配置          │ Claude Code│ Gemini CLI │          │
│ 快速原型             │ Cursor     │ Claude Code│          │
│ 学习/解释代码        │ Gemini CLI │ Claude Code│          │
│ 批量文件修改         │ Aider      │ Claude Code│ Copilot  │
│ 实时补全（编码中）   │ Copilot    │ Cursor     │          │
└──────────────────────┴────────────┴────────────┴──────────┘
```

### G.2 成本效益分析

```
Claude Code (Max Plan $200/月):
├─ 优势：最强代码能力、Agent 模式、MCP 支持
├─ 劣势：贵、有 token 限制
├─ ROI：节省 20+ 小时/月开发时间 → 值得

Gemini CLI (免费):
├─ 优势：免费、1M token 上下文、Google 搜索集成
├─ 劣势：代码能力略弱、有时不遵循指令
├─ ROI：零成本交叉验证 → 必装

GitHub Copilot ($10/月):
├─ 优势：实时补全体验最佳、IDE 深度集成
├─ 劣势：复杂逻辑能力有限
├─ ROI：编码速度提升 30% → 值得

Cursor Pro ($20/月):
├─ 优势：IDE 内 AI + 代码补全一体化
├─ 劣势：与 Claude Code 功能重叠
├─ ROI：如果不用 Claude Code → 值得

推荐组合（最佳性价比）：
├─ Claude Code (主力) + Gemini CLI (审查/免费补充)
├─ 可选 + Copilot（实时补全）
└─ 预算：$200-210/月
```

### G.3 AI 编程效率度量

```
衡量指标：
├─ 代码产出速度（行/小时 或 功能/天）
├─ Bug 引入率（AI 生成代码的 bug 密度）
├─ 首次通过率（AI 代码不需修改的比例）
├─ 上下文理解准确率（正确引用现有代码）
├─ 重复交互次数（完成任务需要几轮对话）

经验数据（HR 项目实测）：
├─ Claude Code 首次通过率：~70%
├─ Gemini CLI 首次通过率：~55%
├─ 使用 CLAUDE.md 后首次通过率提升至：~85%
├─ 配合 MCP Server 后上下文理解：~90%
└─ 平均每个功能节省时间：2-4 小时
```

---

## 附录 H：Claude Code 高级技巧

### H.1 上下文工程 (Context Engineering)

```
上下文 = AI 的"工作记忆"

优化上下文的策略：
├─ CLAUDE.md（永久上下文）：项目约定、技术栈、关键路径
├─ 自定义 commands（可复用 prompt）：评审、测试、部署前检查
├─ MCP Server（动态数据）：数据库状态、候选人信息
├─ 文件引用（按需读取）：只引用相关文件，避免噪音
└─ 对话策略：先给背景，再提需求

反模式（避免）：
├─ 一次性粘贴整个代码库 → 信息过载
├─ 不给上下文直接提需求 → 猜测导致错误
├─ 在 CLAUDE.md 写长篇文章 → 每次都消耗 token
└─ 频繁重启对话 → 丢失之前的上下文
```

### H.2 Agent 模式使用技巧

```bash
# Claude Code Agent 模式 = 自主工作模式
# 适合复杂、多步骤任务

# 好的 Agent 任务示例：
claude "为 candidates.ts 路由添加分页功能：
1. 支持 ?page=1&limit=20 参数
2. 返回 { data: [...], pagination: { page, limit, total } }
3. 添加对应的 Vitest 测试
4. 更新 CLAUDE.md 中的 API 文档"

# 不适合 Agent 的任务：
claude "帮我看看代码"  # 太模糊
claude "修 bug"        # 缺少上下文
```

### H.3 多文件编辑策略

```bash
# 告诉 Claude Code 需要修改的范围
claude "重构评分系统：
修改文件：
- src/services/ai-scorer.ts（添加重试逻辑）
- src/routes/resumes.ts（添加批量上传端点）
- src/db/schema.ts（scores 表添加 model_name 字段）
- test/ai-scorer.test.ts（更新测试）

注意：不要修改其他文件。每个文件修改后运行 tsc --noEmit 确认无错误。"
```

### H.4 Hooks 配置

```json
// .claude/settings.json — Hooks 自动化
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "bun x biome check --write $FILE"
      }
    ],
    "PostPromptSubmit": [
      {
        "matcher": ".*",
        "command": "echo 'Working on: $(pwd)'"
      }
    ]
  }
}
```

---

## 附录 I：Gemini CLI 进阶用法

### I.1 Gemini CLI Extensions

```bash
# Gemini CLI 支持 Extensions（类似 MCP）
# 配置文件：~/.gemini/settings.json

# 创建自定义 Extension
mkdir -p ~/.gemini/extensions/hr-helper

cat > ~/.gemini/extensions/hr-helper/manifest.json << 'EOF'
{
  "name": "hr-helper",
  "description": "HR Backend 辅助工具",
  "tools": [
    {
      "name": "check_db",
      "description": "检查数据库连接和统计",
      "command": "psql $DATABASE_URL -c 'SELECT COUNT(*) FROM candidates'"
    },
    {
      "name": "run_tests",
      "description": "运行项目测试",
      "command": "cd /path/to/hr-backend && bun vitest run"
    },
    {
      "name": "check_api",
      "description": "检查 API 健康状态",
      "command": "curl -sf http://localhost:3001/health"
    }
  ]
}
EOF
```

### I.2 Gemini CLI 的优势场景

```
1. 大文件分析（1M token 上下文）：
   gemini "分析这份 2000 行的研究文档，总结主要发现"
   # Claude Code 也能处理，但 Gemini 免费

2. 跨文件代码理解：
   gemini "这个项目的数据流是什么？从邮件收取到候选人评分的完整路径"
   # Gemini 可以一次读取多个文件

3. 文档生成：
   gemini "为 src/routes/ 下的所有 API 生成 OpenAPI 3.0 文档"
   # Gemini 免费，适合文档类输出

4. 代码审查（交叉验证）：
   # Claude Code 写代码 → Gemini 审查
   gemini "审查以下 PR 变更，重点关注安全和性能..."
```

### I.3 双工具工作流自动化

```bash
#!/bin/bash
# scripts/ai-workflow.sh — 自动化 AI 辅助开发流程

TASK="$1"

echo "=== AI 辅助开发流程 ==="
echo "任务: $TASK"
echo ""

# Step 1: Claude Code 实现
echo "--- Step 1: Claude Code 实现功能 ---"
claude "$TASK" --auto-approve

# Step 2: 运行测试
echo "--- Step 2: 运行测试 ---"
bun vitest run

# Step 3: Gemini CLI 审查
echo "--- Step 3: Gemini CLI 交叉审查 ---"
CHANGED_FILES=$(git diff --name-only HEAD~1)
gemini "请审查以下文件的最近修改:
$CHANGED_FILES

重点检查：
1. 安全漏洞
2. 类型安全
3. 错误处理
4. 是否有遗漏的边界情况"

echo "=== 流程完成 ==="
```

---

## 附录 J：跨文档参考索引

```
本文档与其他研究文档的关联：

AI 工具 + Supabase（→ 01-supabase-integration.md）
├─ Claude Code 生成 Supabase 迁移代码 → 01 附录 L
├─ CLAUDE.md 中的 Supabase 约定 → 本文档附录 A
└─ Gemini CLI 审查 RLS 策略 → 01 附录 H

AI 工具 + Agent/MCP（→ 02-agents-skills-mcp.md）
├─ Claude Code 自定义 Skill 设计 → 02 附录 E
├─ MCP Server 开发与调试 → 本文档附录 E + 02 附录 D
└─ CLAUDE.md 配合 MCP → 本文档附录 A

AI 工具 + CI/CD（→ 03-cicd-testing.md）
├─ Claude Code 生成测试 → 03 附录 G
├─ Gemini CLI 代码审查 in CI → 本文档附录 B + 03 附录 J
└─ AI 工具配合 Git Hooks → 03 附录 J

AI 工具 + LangChain（→ 04-langchain-role.md）
├─ Prompt 版本管理 → 本文档附录 D + 04 附录 F
├─ AI SDK 模式选择 → 04 正文
└─ 评分 Prompt 优化 → 本文档附录 D + 04 附录 F

AI 工具 + Docker（→ 06-docker-deployment.md）
├─ Claude Code 生成 Dockerfile → 06 正文
├─ CLAUDE.md 中的 Docker 命令 → 本文档附录 A
└─ AI 辅助部署问题排查 → 06 附录 B
```

---

## 附录 K：AI 辅助开发的工作流模式

### K.1 TDD with AI（测试驱动 + AI）

```bash
# 模式：先写测试 → AI 实现 → 验证

# Step 1: 手动写测试（定义需求）
cat > test/services/batch-import.test.ts << 'EOF'
describe("批量导入候选人", () => {
  it("应解析 CSV 文件并创建候选人", async () => { ... });
  it("应跳过重复邮箱", async () => { ... });
  it("应返回导入统计", async () => { ... });
});
EOF

# Step 2: 让 Claude Code 实现
claude "有一个测试文件 test/services/batch-import.test.ts，请实现 src/services/batch-import.ts 使所有测试通过。不要修改测试文件。"

# Step 3: 验证
bun vitest run test/services/batch-import.test.ts
```

### K.2 Bug Fix with AI（AI 辅助调试）

```bash
# 模式：描述问题 → AI 分析 → AI 修复 → 验证

# Step 1: 描述问题
claude "POST /api/resumes/upload 上传 DOCX 文件时返回 500 错误。
错误信息：'Cannot read properties of undefined (reading text)'

请：
1. 找到 bug 位置
2. 分析根因
3. 修复代码
4. 添加处理该边界情况的测试"

# Step 2: 交叉验证
gemini "检查 src/services/resume-parser.ts 是否正确处理了 DOCX 文件的所有边界情况"
```

### K.3 Code Review with AI（AI 审查）

```markdown
<!-- .claude/commands/review-pr.md -->
# PR 代码审查

审查当前分支相对于 main 的所有变更：

1. 运行 `git diff main...HEAD` 查看所有变更
2. 对每个变更文件进行审查：

## 审查维度：
- **安全性** 🔒：SQL 注入、XSS、认证绕过、敏感信息泄露
- **正确性** ✅：逻辑错误、边界情况、类型安全
- **性能** ⚡：N+1 查询、内存泄漏、不必要的计算
- **可维护性** 🔧：代码重复、命名、注释、复杂度
- **测试** 🧪：是否有测试覆盖、测试质量

## 输出格式：
对每个发现的问题：
| 文件:行号 | 严重度 | 类别 | 描述 | 建议 |
|-----------|--------|------|------|------|

## 最后给出：
- 总体评价（1-5 分）
- 必须修复的问题列表
- 可选改进建议
```

### K.4 文档生成 with AI

```bash
# 从代码自动生成 API 文档
claude "读取 src/routes/ 下的所有路由文件，生成 OpenAPI 3.0 YAML 规范。
包含：
- 所有端点的 path、method、description
- 请求参数（query、body）的 schema
- 响应格式的 schema
- 认证要求
- 示例请求/响应

输出到 docs/api-spec.yml"

# 从代码自动生成数据字典
gemini "读取 src/db/schema.ts，生成数据字典文档。
包含每个表的：
- 中文表名和描述
- 字段列表（名称、类型、约束、描述）
- 索引
- 表间关系"
```

---

## 附录 L：AI 开发安全注意事项

### L.1 敏感信息保护

```
风险：AI 工具可能读取/发送敏感信息到云端

保护措施：
├─ .env 文件加入 .gitignore（已做）
├─ CLAUDE.md 中不包含真实密钥
├─ 使用 --deny-permission 限制 Claude Code 文件访问
├─ 定期检查 AI 工具的数据处理政策
└─ 敏感代码审查不要用云端 AI

.claudeignore 文件（限制 Claude Code 不读取的文件）：
├─ .env
├─ .env.*
├─ *.pem
├─ *.key
├─ credentials.json
├─ backups/
└─ secrets/
```

### L.2 AI 生成代码的安全审查

```
AI 生成代码常见安全问题：
├─ SQL 注入：AI 可能生成字符串拼接 SQL
│   检查：所有 SQL 是否使用参数化查询（Drizzle ORM 自动参数化 ✅）
│
├─ 硬编码密钥：AI 可能在代码中放入示例 API key
│   检查：git diff 搜索 "sk-", "password", "secret"
│
├─ 不安全的依赖：AI 可能推荐有漏洞的旧版包
│   检查：bun audit + 确认包最近更新日期
│
├─ 路径遍历：文件操作可能未校验路径
│   检查：文件上传路径是否过滤 ../ 等
│
├─ SSRF：AI 可能生成未验证的 URL 请求
│   检查：外部 URL 调用是否有白名单
│
└─ 类型不安全：过多使用 any 或 as
   检查：bun tsc --noEmit + biome 的 noExplicitAny 规则
```

### L.3 安全审查 Skill

```markdown
<!-- .claude/commands/security-review.md -->
# 安全审查

对项目进行安全审查：

1. **依赖安全**：运行 `bun audit`，列出所有高危漏洞
2. **敏感信息泄露**：搜索代码中的硬编码密钥/密码
   - 搜索模式：`/sk-|password\s*=\s*['"]/i`
3. **SQL 注入**：检查所有数据库查询是否使用参数化
4. **输入验证**：检查所有 API 端点是否有 Zod 验证
5. **认证/授权**：检查敏感路由是否有中间件保护
6. **文件上传**：检查上传文件类型限制和大小限制
7. **CORS 配置**：检查是否限制了允许的域名
8. **错误处理**：检查错误响应是否泄露内部信息

输出：
| 类别 | 严重度 | 发现 | 文件位置 | 修复建议 |
|------|--------|------|----------|----------|
```

---

## 附录 M：AI 辅助性能优化

### M.1 使用 AI 分析性能瓶颈

```bash
# 用 Claude Code 分析慢查询
claude "分析 src/routes/candidates.ts 中的查询性能：
1. 检查是否有 N+1 查询问题
2. 建议需要添加的数据库索引
3. 检查是否有不必要的 JOIN
4. 建议缓存策略

输出格式：
- 当前问题列表
- 建议的索引 CREATE INDEX 语句
- 优化后的查询代码
- 预期性能提升"
```

### M.2 使用 AI 优化 Docker 构建

```bash
# 用 Gemini 分析 Docker 镜像大小
gemini "分析我们的 Dockerfile，找出减小镜像大小的方法：
1. 当前基础镜像选择是否最优
2. 是否有不必要的文件/依赖被包含
3. 层缓存是否最优
4. 是否可以使用 distroless 镜像

输出改进后的 Dockerfile 和预期镜像大小对比。"
```

---

## 附录 N: Prompt 版本管理与测试

### N.1 Prompt 版本管理策略

```
为什么需要 Prompt 版本管理:

1. 评分一致性: 更新 prompt 后旧评分与新评分不可比
2. 回滚能力: 新 prompt 效果差时可快速回退
3. A/B 测试: 比较不同 prompt 的评分质量
4. 审计追踪: 知道每个评分使用了哪个版本的 prompt

版本命名规范:
- v1.0.0 — 初始版本
- v1.1.0 — 优化了技能匹配逻辑
- v1.2.0 — 添加了教育背景评估
- v2.0.0 — 重大变更（评分维度调整）
```

### N.2 Prompt 模板管理

```typescript
// src/prompts/index.ts
// Prompt 版本管理系统

export interface PromptTemplate {
  version: string;
  name: string;
  description: string;
  createdAt: string;
  systemPrompt: string;
  userPromptTemplate: string; // 包含 {position}, {resume} 等变量
}

// 当前生产版本
export const CURRENT_VERSION = "v1.2.0";

// 所有 prompt 版本
export const prompts: Record<string, PromptTemplate> = {
  "v1.0.0": {
    version: "v1.0.0",
    name: "基础评分",
    description: "初始版本，基于技能匹配的简单评分",
    createdAt: "2026-02-01",
    systemPrompt: `你是一个专业的 HR 简历筛选助手。你的任务是根据职位要求评估候选人简历。

评分规则：
- 每个"必须具备"技能匹配得 15 分
- 每个"加分项"技能匹配得 5 分
- 触发"拒绝条件"扣 20 分
- 总分 0-100 分

等级划分：
- A: 85-100 分（强烈推荐）
- B: 70-84 分（推荐）
- C: 55-69 分（可考虑）
- D: 0-54 分（不推荐）

注意：只根据简历中明确提到的信息评分，不要推测。`,
    userPromptTemplate: `请评估以下简历：

【职位】{title}
【必须具备】{mustHave}
【加分项】{niceToHave}
【拒绝条件】{reject}

【简历内容】
{resume}

请给出评分和详细分析。`,
  },

  "v1.1.0": {
    version: "v1.1.0",
    name: "语义匹配增强",
    description: "改进技能匹配逻辑，支持同义词和相关技能识别",
    createdAt: "2026-02-10",
    systemPrompt: `你是一个专业的 HR 简历筛选助手。

评分规则：
- 必须具备（Must-Have）: 每项 15 分
  - 完全匹配: 15 分
  - 相关/近似匹配: 10 分（例如 "React" 要求，简历写 "React.js"）
  - 不匹配: 0 分
- 加分项（Nice-to-Have）: 每项 5 分
- 拒绝条件: 每项 -20 分
- 总分 0-100 分，不低于 0

等级：A(85+) B(70-84) C(55-69) D(0-54)

重要：
1. 技能匹配时考虑同义词（React/React.js, K8s/Kubernetes）
2. 考虑技能等级（"精通 Java" > "了解 Java"）
3. 工作年限要综合全部工作经历计算
4. 只基于简历中明确的信息评分`,
    userPromptTemplate: `评估以下简历与职位的匹配度：

【职位】{title}
【必须具备】{mustHave}
【加分项】{niceToHave}
【拒绝条件】{reject}

【简历内容】
{resume}

请严格按 JSON 格式输出评分结果。`,
  },

  "v1.2.0": {
    version: "v1.2.0",
    name: "多维评估",
    description: "增加经验质量、项目复杂度、职业发展等评估维度",
    createdAt: "2026-02-20",
    systemPrompt: `你是一个资深的 HR 简历筛选专家。请从多个维度评估候选人。

## 评分维度

### 1. 技能匹配（60%权重）
- 必须具备: 每项 0-15 分
  - 完全匹配 + 熟练: 15 分
  - 完全匹配 + 一般: 12 分
  - 近似匹配: 8 分
  - 不匹配: 0 分
- 加分项: 每项 0-5 分
- 拒绝条件: 每项 -20 分

### 2. 经验质量（25%权重）
- 公司规模和知名度: 0-10 分
- 项目复杂度和规模: 0-10 分
- 职责范围（执行者/负责人/管理者）: 0-5 分

### 3. 潜力评估（15%权重）
- 职业发展轨迹（升职、跳槽质量）: 0-5 分
- 教育背景与持续学习: 0-5 分
- 跨领域能力: 0-5 分

## 评分规则
- 总分 = 技能分 × 0.6 + 经验分 × 0.25 + 潜力分 × 0.15
- 归一化到 0-100 分
- 等级：A(85+) B(70-84) C(55-69) D(0-54)

## 注意事项
1. 只根据简历明确信息评分
2. 技能同义词视为匹配（React/React.js, K8s/Kubernetes 等）
3. 中文/英文技能名称统一处理
4. 工作年限综合所有工作经历
5. 提供简洁但有洞察的分析说明`,
    userPromptTemplate: `请按多维评估体系评估以下简历：

【职位名称】{title}
【必须具备技能】{mustHave}
【加分项技能】{niceToHave}
【拒绝条件】{reject}

【候选人简历】
{resume}

请输出结构化评分结果。`,
  },
};

// 获取当前版本的 prompt
export function getCurrentPrompt(): PromptTemplate {
  const prompt = prompts[CURRENT_VERSION];
  if (!prompt) {
    throw new Error(`Prompt version ${CURRENT_VERSION} not found`);
  }
  return prompt;
}

// 获取指定版本的 prompt
export function getPrompt(version: string): PromptTemplate | undefined {
  return prompts[version];
}

// 渲染 prompt 模板
export function renderPrompt(
  template: PromptTemplate,
  variables: {
    title: string;
    mustHave: string[];
    niceToHave: string[];
    reject: string[];
    resume: string;
  }
): { system: string; user: string } {
  let userPrompt = template.userPromptTemplate
    .replace("{title}", variables.title)
    .replace("{mustHave}", variables.mustHave.join("、"))
    .replace("{niceToHave}", variables.niceToHave.join("、"))
    .replace("{reject}", variables.reject.join("、"))
    .replace("{resume}", variables.resume);

  return {
    system: template.systemPrompt,
    user: userPrompt,
  };
}
```

### N.3 Prompt 回归测试

```typescript
// src/prompts/__tests__/regression.test.ts
// Prompt 版本回归测试: 确保新版本不会退化

import { describe, it, expect } from "vitest";
import { prompts, renderPrompt } from "../index.js";

// 黄金数据集: 期望评分结果明确的案例
const goldenCases = [
  {
    name: "完全匹配的高级工程师",
    input: {
      title: "高级前端工程师",
      mustHave: ["React", "TypeScript", "3年以上经验"],
      niceToHave: ["Node.js", "Docker"],
      reject: ["仅实习经验"],
      resume: `
张三 | 5年前端开发经验
- 字节跳动 高级前端工程师 (2021-至今)
- 使用 React + TypeScript 开发
- 熟悉 Node.js, Docker, CI/CD
      `,
    },
    expectedGrade: "A",
    expectedMinScore: 80,
  },
  {
    name: "完全不匹配的候选人",
    input: {
      title: "高级前端工程师",
      mustHave: ["React", "TypeScript", "3年以上经验"],
      niceToHave: ["Node.js"],
      reject: ["仅实习经验"],
      resume: `
李四 | 应届生
- 某公司实习 3 个月
- 学过 HTML/CSS
      `,
    },
    expectedGrade: "D",
    expectedMaxScore: 40,
  },
];

describe("Prompt Regression Tests", () => {
  // 验证所有版本的 prompt 都能正确渲染
  it("all prompt versions should render without errors", () => {
    for (const [version, template] of Object.entries(prompts)) {
      const { system, user } = renderPrompt(template, {
        title: "测试职位",
        mustHave: ["技能A"],
        niceToHave: ["技能B"],
        reject: ["条件C"],
        resume: "测试简历内容",
      });

      expect(system.length).toBeGreaterThan(50);
      expect(user.length).toBeGreaterThan(20);
      expect(user).toContain("测试职位");
      expect(user).toContain("技能A");
      expect(user).toContain("测试简历内容");
    }
  });

  // 验证 prompt 模板包含关键指令
  it("all prompts should include scoring rules", () => {
    for (const template of Object.values(prompts)) {
      // 必须包含评分等级定义
      expect(template.systemPrompt).toMatch(/A.*85/);
      expect(template.systemPrompt).toMatch(/D.*54|D.*0/);
      // 必须提到不要推测
      expect(template.systemPrompt).toMatch(/明确|explicit/i);
    }
  });

  // 验证版本号格式
  it("all versions should follow semver format", () => {
    for (const version of Object.keys(prompts)) {
      expect(version).toMatch(/^v\d+\.\d+\.\d+$/);
    }
  });
});
```

### N.4 Prompt A/B 测试框架

```typescript
// src/services/prompt-ab-test.ts
// Prompt A/B 测试: 对比不同版本的评分质量

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod/v4";
import { prompts, renderPrompt, type PromptTemplate } from "../prompts/index.js";
import { env } from "../env.js";

const scoreSchema = z.object({
  totalScore: z.number().min(0).max(100),
  grade: z.enum(["A", "B", "C", "D"]),
  mustScore: z.number(),
  niceScore: z.number(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  explanation: z.string(),
});

interface ABTestResult {
  versionA: string;
  versionB: string;
  testCases: {
    name: string;
    scoreA: number;
    gradeA: string;
    scoreB: number;
    gradeB: string;
    scoreDiff: number;
    gradeMatch: boolean;
  }[];
  summary: {
    avgScoreDiffAbs: number;
    gradeMatchRate: number;
    versionAAvgScore: number;
    versionBAvgScore: number;
  };
}

export async function runABTest(
  versionA: string,
  versionB: string,
  testCases: {
    name: string;
    title: string;
    mustHave: string[];
    niceToHave: string[];
    reject: string[];
    resume: string;
  }[]
): Promise<ABTestResult> {
  const templateA = prompts[versionA];
  const templateB = prompts[versionB];

  if (!templateA || !templateB) {
    throw new Error(`Prompt version not found: ${!templateA ? versionA : versionB}`);
  }

  const provider = createOpenAI({
    baseURL: "https://api.minimaxi.com/v1",
    apiKey: env.MINIMAX_API_KEY,
  });

  const results: ABTestResult["testCases"] = [];

  for (const testCase of testCases) {
    // Version A
    const promptA = renderPrompt(templateA, testCase);
    const resultA = await generateObject({
      model: provider("MiniMax-M2.5"),
      schema: scoreSchema,
      system: promptA.system,
      prompt: promptA.user,
    });

    // Version B
    const promptB = renderPrompt(templateB, testCase);
    const resultB = await generateObject({
      model: provider("MiniMax-M2.5"),
      schema: scoreSchema,
      system: promptB.system,
      prompt: promptB.user,
    });

    results.push({
      name: testCase.name,
      scoreA: resultA.object.totalScore,
      gradeA: resultA.object.grade,
      scoreB: resultB.object.totalScore,
      gradeB: resultB.object.grade,
      scoreDiff: resultB.object.totalScore - resultA.object.totalScore,
      gradeMatch: resultA.object.grade === resultB.object.grade,
    });
  }

  // 汇总
  const avgScoreDiffAbs =
    results.reduce((sum, r) => sum + Math.abs(r.scoreDiff), 0) / results.length;
  const gradeMatchRate =
    results.filter((r) => r.gradeMatch).length / results.length;
  const versionAAvgScore =
    results.reduce((sum, r) => sum + r.scoreA, 0) / results.length;
  const versionBAvgScore =
    results.reduce((sum, r) => sum + r.scoreB, 0) / results.length;

  return {
    versionA,
    versionB,
    testCases: results,
    summary: {
      avgScoreDiffAbs,
      gradeMatchRate,
      versionAAvgScore,
      versionBAvgScore,
    },
  };
}

// 格式化结果
export function formatABTestResult(result: ABTestResult): string {
  const lines: string[] = [
    `=== Prompt A/B Test: ${result.versionA} vs ${result.versionB} ===`,
    ``,
    `--- Summary ---`,
    `平均分数差异: ${result.summary.avgScoreDiffAbs.toFixed(1)} 分`,
    `等级匹配率: ${(result.summary.gradeMatchRate * 100).toFixed(0)}%`,
    `${result.versionA} 平均分: ${result.summary.versionAAvgScore.toFixed(1)}`,
    `${result.versionB} 平均分: ${result.summary.versionBAvgScore.toFixed(1)}`,
    ``,
    `--- Details ---`,
  ];

  for (const tc of result.testCases) {
    const match = tc.gradeMatch ? "✓" : "✗";
    lines.push(
      `${match} ${tc.name}: ${result.versionA}=${tc.gradeA}(${tc.scoreA}) ` +
      `${result.versionB}=${tc.gradeB}(${tc.scoreB}) diff=${tc.scoreDiff > 0 ? "+" : ""}${tc.scoreDiff}`
    );
  }

  return lines.join("\n");
}
```

---

## 附录 O: AI 开发工作流自动化

### O.1 Git Hooks 集成 AI 检查

```bash
#!/bin/bash
# .husky/pre-commit (或 simple-git-hooks)
# 提交前自动运行 AI 代码检查

set -euo pipefail

# 获取暂存的文件
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' || true)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

echo "Running pre-commit checks..."

# 1. Biome lint + format
bun biome check --apply $STAGED_FILES
git add $STAGED_FILES

# 2. TypeScript 类型检查
bun tsc --noEmit

# 3. 可选: AI 安全检查（仅关键文件）
CRITICAL_FILES=$(echo "$STAGED_FILES" | grep -E '(auth|security|env|secret)' || true)
if [ -n "$CRITICAL_FILES" ]; then
  echo "检测到关键文件变更，运行 AI 安全检查..."
  # 使用 Claude Code 检查（如果已安装且登录）
  if command -v claude &>/dev/null; then
    for file in $CRITICAL_FILES; do
      claude --print "检查 $file 是否有安全漏洞：
1. 是否有硬编码的密钥或密码
2. 是否有 SQL 注入风险
3. 是否有不安全的输入处理
仅输出问题列表，没有问题输出 OK" 2>/dev/null || true
    done
  fi
fi

echo "Pre-commit checks passed ✓"
```

### O.2 Commit Message 生成

```bash
#!/bin/bash
# scripts/ai-commit.sh
# 使用 AI 生成 commit message

set -euo pipefail

# 获取暂存的变更
DIFF=$(git diff --cached --stat)
DIFF_CONTENT=$(git diff --cached)

if [ -z "$DIFF" ]; then
  echo "No staged changes"
  exit 1
fi

echo "Staged changes:"
echo "$DIFF"
echo ""

# 使用 Claude Code 生成 commit message
if command -v claude &>/dev/null; then
  MSG=$(claude --print "根据以下 git diff 生成简洁的 commit message。
规则：
1. 使用英文
2. 开头用动词（Add/Fix/Update/Refactor/Remove）
3. 不超过 72 字符
4. 如果有多个变更，使用主要变更作为标题，次要变更作为 body
5. 不要加 emoji
6. 只输出 commit message，不要其他解释

Diff stat:
$DIFF

Diff content (truncated):
$(echo "$DIFF_CONTENT" | head -200)" 2>/dev/null)

  if [ -n "$MSG" ]; then
    echo "Suggested commit message:"
    echo "---"
    echo "$MSG"
    echo "---"
    echo ""
    read -p "Use this message? [Y/n/e(dit)] " -r REPLY
    case "$REPLY" in
      n|N) echo "Aborted"; exit 1 ;;
      e|E)
        # 打开编辑器
        echo "$MSG" > /tmp/commit-msg
        ${EDITOR:-vim} /tmp/commit-msg
        git commit -F /tmp/commit-msg
        rm /tmp/commit-msg
        ;;
      *)
        git commit -m "$MSG"
        ;;
    esac
  else
    echo "AI generation failed, opening editor..."
    git commit
  fi
else
  echo "Claude CLI not found, opening editor..."
  git commit
fi
```

### O.3 PR Review 自动化

```bash
#!/bin/bash
# scripts/ai-review-pr.sh
# AI 辅助 PR Review

set -euo pipefail

PR_NUMBER="${1:?Usage: ai-review-pr.sh <pr-number>}"
REPO="${2:-$(basename $(git remote get-url origin) .git)}"

# 获取 PR diff
DIFF=$(git diff main...HEAD)

if command -v claude &>/dev/null; then
  REVIEW=$(claude --print "你是一个高级代码审查专家。请审查以下 PR 的变更。

审查维度:
1. **安全性**: SQL 注入、XSS、硬编码密钥、不安全的 API 调用
2. **性能**: N+1 查询、不必要的计算、内存泄漏
3. **错误处理**: 未处理的异常、缺少验证
4. **代码质量**: 命名、可读性、重复代码
5. **类型安全**: TypeScript 类型是否正确和完整

输出格式:
- 每个问题: [严重程度] 文件:行号 — 问题描述
- 严重程度: 🔴 必须修复 / 🟡 建议改进 / 🟢 可选优化

变更内容:
$(echo "$DIFF" | head -500)" 2>/dev/null)

  echo "$REVIEW"

  # 可选: 自动添加 PR 评论
  # echo "$REVIEW" | gh pr comment "$PR_NUMBER" --body-file -
fi
```

### O.4 文档自动生成

```bash
#!/bin/bash
# scripts/generate-api-docs.sh
# 从 Elysia 路由自动生成 API 文档

set -euo pipefail

ROUTES_DIR="src/routes"
OUTPUT="docs/api.md"

echo "Generating API documentation..."

# 收集所有路由文件
ROUTE_FILES=$(find "$ROUTES_DIR" -name "*.ts" | sort)

if command -v claude &>/dev/null; then
  # 读取所有路由文件内容
  CONTENT=""
  for file in $ROUTE_FILES; do
    CONTENT+="
--- FILE: $file ---
$(cat "$file")
"
  done

  claude --print "根据以下 Elysia 路由文件生成 API 文档。

格式要求：
1. Markdown 格式
2. 每个端点包含: 方法、路径、描述、请求参数/body、响应格式
3. 包含示例请求和响应
4. 按路由文件分组
5. 开头添加目录

路由文件:
$CONTENT" > "$OUTPUT" 2>/dev/null

  echo "API docs generated: $OUTPUT"
  echo "Lines: $(wc -l < "$OUTPUT")"
else
  echo "Claude CLI not found"
  exit 1
fi
```

### O.5 依赖更新检查

```bash
#!/bin/bash
# scripts/check-deps.sh
# AI 辅助依赖更新评估

set -euo pipefail

echo "Checking for outdated dependencies..."

# 获取过时的依赖列表
OUTDATED=$(bun outdated --format json 2>/dev/null || echo "{}")

if [ "$OUTDATED" = "{}" ]; then
  echo "All dependencies are up to date ✓"
  exit 0
fi

echo "Outdated dependencies found:"
echo "$OUTDATED" | jq '.' 2>/dev/null || echo "$OUTDATED"

if command -v claude &>/dev/null; then
  echo ""
  echo "AI analysis:"
  claude --print "分析以下过时的 npm 依赖，给出升级建议:

规则:
1. 标记安全更新（patch）为 ✅ 安全升级
2. 标记功能更新（minor）为 🟡 建议升级，列出新功能
3. 标记大版本更新（major）为 🔴 需要评估，列出 breaking changes
4. 特别关注: 安全漏洞修复应优先

依赖列表:
$OUTDATED

当前项目: HR 简历筛选后端
技术栈: Elysia, Drizzle, Vercel AI SDK, MiniMax
Bun" 2>/dev/null
fi
```

### O.6 AI 辅助调试工作流

```bash
# 使用 Claude Code 调试错误的标准流程

# 1. 错误日志分析
claude "分析以下错误日志，找出根本原因:
$(tail -50 /var/log/hr-backend/error.log)"

# 2. 特定错误调查
claude "调查 src/services/ai-scorer.ts 中的 'generateObject failed' 错误:
1. 列出所有可能的原因
2. 检查 MiniMax API 的 error response 格式
3. 建议错误处理改进"

# 3. 数据库查询调试
claude "这个 Drizzle 查询返回空结果，帮我调试:
$(cat src/routes/candidates.ts | grep -A 20 'db.select')"

# 4. 类型错误修复
claude "修复以下 TypeScript 编译错误:
$(bun tsc --noEmit 2>&1 | head -30)"

# 5. 性能问题诊断
claude "src/routes/candidates.ts 的 GET /api/candidates 接口响应很慢（>2秒）。
分析可能的原因并给出优化方案。
考虑: 数据库查询、JSON 序列化、中间件开销。"
```

### O.7 开发环境一键配置

```bash
#!/bin/bash
# scripts/setup-dev.sh
# AI 辅助的开发环境一键配置

set -euo pipefail

echo "=== HR Backend 开发环境配置 ==="

# 1. 检查 Bun 版本
NODE_VERSION=$(bun --version 2>/dev/null || echo "not installed")
echo "Bun: $NODE_VERSION"
if [[ "$NODE_VERSION" == "not installed" ]]; then
  echo "⚠️  需要安装 Bun"
  echo "建议使用: curl -fsSL https://bun.sh/install | bash"
fi

# 2. Bun 已安装（上面已检查）
echo ""

# 3. 安装依赖
echo ""
echo "Installing dependencies..."
bun install

# 4. 配置 .env
if [ ! -f .env ]; then
  echo ""
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "⚠️  请编辑 .env 填入实际配置值"
fi

# 5. 检查 Docker 和 PostgreSQL
if command -v docker &>/dev/null; then
  echo ""
  echo "Starting PostgreSQL..."
  docker compose up -d postgres
  echo "Waiting for PostgreSQL to be ready..."
  sleep 3
else
  echo ""
  echo "⚠️  Docker 未安装，请手动配置 PostgreSQL"
fi

# 6. 运行数据库迁移
echo ""
echo "Running database migrations..."
bun db:migrate 2>/dev/null || echo "⚠️  迁移失败，请检查 DATABASE_URL"

# 7. TypeScript 检查
echo ""
echo "Type checking..."
bun tsc --noEmit 2>/dev/null && echo "✓ TypeScript OK" || echo "⚠️  有类型错误"

# 8. 检查 AI 工具
echo ""
echo "=== AI 开发工具 ==="
command -v claude &>/dev/null && echo "✓ Claude Code: $(claude --version 2>/dev/null || echo 'installed')" || echo "✗ Claude Code: not installed"
command -v gemini &>/dev/null && echo "✓ Gemini CLI: installed" || echo "✗ Gemini CLI: not installed"

echo ""
echo "=== 配置完成 ==="
echo "启动开发服务器: bun dev"
echo "API 地址: http://localhost:3001"
echo "健康检查: http://localhost:3001/health"
```

---

## 附录 P: AI 辅助代码生成模式

### P.1 组件脚手架生成

```bash
# 使用 Claude Code 生成标准化的项目组件

# 生成新的 API 路由
claude "为 HR 项目创建一个新的 Elysia 路由文件 src/routes/interviews.ts:

要求:
1. 参考 src/routes/candidates.ts 的代码风格
2. 实现 CRUD: GET /api/interviews, POST /api/interviews, PATCH /api/interviews/:id
3. 使用 Drizzle ORM 查询
4. Zod 验证请求体
5. 正确的错误处理
6. 导出 Elysia 实例

数据模型:
- id: 自增主键
- candidateId: 关联候选人
- positionId: 关联职位
- interviewDate: 面试日期
- interviewerName: 面试官
- feedback: 反馈 (可选)
- rating: 评分 1-5
- status: scheduled/completed/cancelled

请直接生成完整代码。"
```

### P.2 批量测试生成

```bash
# 使用 AI 为现有代码批量生成测试

# 为单个文件生成测试
claude "为 src/services/resume-parser.ts 编写完整的 Vitest 测试:

要求:
1. 覆盖所有导出函数
2. 包含正常路径和错误路径
3. 使用 describe/it 分组
4. 测试 PDF 和 DOCX 两种格式
5. 测试边界情况（空文件、超大文件、损坏文件）
6. 不要 mock 文件系统，使用 test/fixtures/ 中的真实测试文件
7. 覆盖率目标: 90%

参考项目的测试风格:
$(cat test/setup.ts)

输出到: src/services/__tests__/resume-parser.test.ts"
```

### P.3 数据库 Schema 演进

```bash
# 使用 AI 辅助数据库 schema 变更

# 添加新表
claude "在 src/db/schema.ts 中添加 interviews 表:

参考现有的 schema 定义风格:
$(cat src/db/schema.ts | head -60)

新表要求:
- interviews 表
- 字段: id, candidate_id, position_id, interview_date, interviewer_name, feedback, rating (1-5), status (enum), created_at, updated_at
- 外键关联 candidates 和 positions
- 索引: candidate_id, position_id, interview_date
- 使用 Drizzle 的 pgTable 语法

然后:
1. 更新 schema.ts
2. 生成迁移: bun drizzle-kit generate
3. 验证生成的 SQL"
```

### P.4 错误处理模式统一

```bash
# 使用 AI 统一项目的错误处理模式

claude "审查 src/routes/ 下所有路由文件的错误处理:

1. 检查是否所有路由都有 try/catch
2. 检查错误响应格式是否一致
3. 检查是否有未捕获的 async 错误
4. 检查 Zod 验证错误是否正确处理

标准错误响应格式:
{
  error: string;       // 错误类型
  message: string;     // 用户友好的错误信息
  statusCode: number;  // HTTP 状态码
}

找出不一致的地方，并生成统一的修复代码。"
```

### P.5 Prompt 技巧汇总

```
Claude Code / Gemini CLI 高效使用技巧:

1. 上下文注入
   claude "参考 $(cat src/routes/health.ts) 的风格，创建..."
   → 直接在 prompt 中注入参考代码

2. 渐进式开发
   第1步: claude "设计 interviews 模块的数据模型"
   第2步: claude "基于上面的模型，实现 CRUD 路由"
   第3步: claude "为路由添加测试"
   → 分步骤，每步验证后再继续

3. 约束限定
   claude "只修改 src/routes/candidates.ts 的 GET /api/candidates 路由，
   添加分页支持。不要修改其他路由或文件。"
   → 限制修改范围，避免意外变更

4. 对比审查
   claude "对比 src/routes/positions.ts 和 src/routes/candidates.ts，
   找出代码风格和错误处理的差异，建议统一方案。"
   → 利用 AI 发现不一致

5. 文档驱动
   claude "根据 docs/api.md 中的 API 规范，检查 src/routes/ 的实现
   是否完全符合规范。列出偏差。"
   → 文档与代码的一致性检查

6. 负面约束
   claude "重构此函数，但:
   - 不要改变函数签名
   - 不要添加新依赖
   - 不要拆分为多个文件
   - 保持向后兼容"
   → 明确禁止事项避免过度重构
```

---

## 附录 Q: AI 辅助 Code Review 深度实践

### Q.1 Code Review Checklist 自动化

```typescript
// .claude/skills/review-checklist.md
// Claude Code 自定义 Code Review 技能

/*
Code Review Checklist for HR Backend:

## 安全性
- [ ] 无硬编码密钥或密码
- [ ] SQL 查询使用参数化（Drizzle ORM 自动处理）
- [ ] 用户输入已验证（Zod schema）
- [ ] API 路由有适当的认证检查
- [ ] 文件上传验证了类型和大小
- [ ] 无日志泄露敏感信息

## 性能
- [ ] 数据库查询有适当索引
- [ ] 无 N+1 查询问题
- [ ] 大列表有分页
- [ ] AI API 调用有缓存和限流
- [ ] 无内存泄漏（事件监听器清理）

## 代码质量
- [ ] TypeScript strict 模式无错误
- [ ] 函数有清晰的单一职责
- [ ] 错误处理完整（try/catch + 适当响应）
- [ ] 变量和函数命名清晰
- [ ] 无重复代码
- [ ] import 使用 .js 扩展名（ESM）

## 测试
- [ ] 新功能有对应测试
- [ ] 测试覆盖正常和异常路径
- [ ] Mock 使用合理
- [ ] 测试数据使用工厂函数

## API 设计
- [ ] RESTful 路径命名
- [ ] 正确的 HTTP 方法
- [ ] 一致的响应格式
- [ ] 适当的状态码
*/
```

### Q.2 PR Review 模板

```bash
# scripts/ai-review.sh
# 自动化 PR Review 脚本

set -euo pipefail

BRANCH="${1:-HEAD}"
BASE="${2:-main}"

# 获取变更
DIFF=$(git diff "$BASE"..."$BRANCH" --stat)
DIFF_CONTENT=$(git diff "$BASE"..."$BRANCH")
COMMITS=$(git log "$BASE"..."$BRANCH" --oneline)

echo "=== PR Review ==="
echo "Branch: $BRANCH"
echo "Base: $BASE"
echo "Commits: $(echo "$COMMITS" | wc -l)"
echo ""
echo "Files changed:"
echo "$DIFF"
echo ""

if command -v claude &>/dev/null; then
  claude --print "你是 HR Backend 项目的资深 Code Reviewer。请审查以下 PR。

## 项目背景
- 技术栈: Elysia + Drizzle + PostgreSQL + Vercel AI SDK + MiniMax M2.5
- 运行环境: Bun, ESM, TypeScript strict
- 目的: AI 驱动的简历筛选系统

## 审查重点

### 1. 安全审查 (Critical)
检查是否有:
- 硬编码的 API key 或密码
- SQL 注入（虽然 Drizzle 会参数化，但 raw SQL 需注意）
- 不安全的文件处理
- 缺少输入验证

### 2. 架构审查
- 是否遵循项目的分层架构（routes → services → db）
- 是否有循环依赖
- 新增文件是否放在正确位置

### 3. 性能审查
- 数据库查询是否高效
- AI API 调用是否有缓存/限流
- 是否有 N+1 查询

### 4. TypeScript 审查
- 类型是否完整（避免 any）
- import 是否使用 .js 扩展名
- 是否正确使用 ESM（export/import）

### 5. 测试审查
- 新功能是否有测试
- 测试是否有意义（不只是覆盖率凑数）

## Commits
$COMMITS

## Changes
$(echo "$DIFF_CONTENT" | head -1000)

## 输出格式
对每个文件给出审查结果:
- 🔴 Must Fix: 必须修改才能合并
- 🟡 Should Fix: 强烈建议修改
- 🟢 Nice to Have: 可选优化
- ✅ Looks Good: 无问题

最后给出总评: Approve / Request Changes / Comment"
fi
```

### Q.3 安全审计自动化

```bash
# scripts/security-audit.sh
# 项目安全审计脚本

set -euo pipefail

echo "=== HR Backend Security Audit ==="
echo ""

# 1. 检查依赖漏洞
echo "--- Dependency Audit ---"
bun audit 2>/dev/null || echo "⚠️  发现依赖漏洞"
echo ""

# 2. 检查硬编码密钥
echo "--- Hardcoded Secrets Check ---"
SECRETS_FOUND=0

# 检查常见密钥模式
for pattern in "password" "secret" "api_key" "apiKey" "API_KEY" "token" "Bearer"; do
  MATCHES=$(grep -rn "$pattern" src/ --include="*.ts" | grep -v "test" | grep -v ".d.ts" | grep -v "schema" | grep -v "env.ts" || true)
  if [ -n "$MATCHES" ]; then
    echo "⚠️  Found '$pattern' in source:"
    echo "$MATCHES"
    SECRETS_FOUND=$((SECRETS_FOUND + 1))
    echo ""
  fi
done

if [ "$SECRETS_FOUND" -eq 0 ]; then
  echo "✓ No hardcoded secrets detected"
fi
echo ""

# 3. 检查 .env 是否被追踪
echo "--- .env File Check ---"
if git ls-files --error-unmatch .env 2>/dev/null; then
  echo "🔴 .env is tracked by git! Remove it immediately."
else
  echo "✓ .env is not tracked by git"
fi
echo ""

# 4. 检查 .gitignore
echo "--- .gitignore Check ---"
for item in ".env" "node_modules" ".env.local" "*.pem" "*.key"; do
  if grep -q "$item" .gitignore 2>/dev/null; then
    echo "✓ $item is in .gitignore"
  else
    echo "⚠️  $item is NOT in .gitignore"
  fi
done
echo ""

# 5. AI 深度审计（可选）
if command -v claude &>/dev/null; then
  echo "--- AI Security Review ---"
  claude --print "快速安全审计以下 HR 后端文件:

1. 检查 $(cat src/env.ts) 是否安全
2. 检查 $(cat src/routes/resumes.ts 2>/dev/null || echo '文件不存在') 的文件上传安全性
3. 检查 $(cat src/services/email.ts 2>/dev/null || echo '文件不存在') 的邮件服务安全性

只输出发现的问题，没有问题输出 ✓ 安全" 2>/dev/null
fi

echo ""
echo "=== Audit Complete ==="
```

### Q.4 Claude Code CLAUDE.md 最佳实践

```
CLAUDE.md 维护要点:

1. 保持简洁
   - 不超过 200 行
   - 只包含 AI 工具需要知道的关键信息
   - 删除过时的内容

2. 结构化信息
   - 项目类型和技术栈（一行搞定）
   - 文件结构（简要）
   - 命名约定（最重要）
   - 常用命令（dev/test/build/deploy）
   - 已知问题（AI 容易犯的错）

3. 定期更新
   - 添加新依赖时更新
   - 修复 AI 反复犯的错时添加规则
   - 每周审查一次是否有过时内容

4. 避免的内容
   - 不要放完整的代码示例
   - 不要放环境变量值
   - 不要放架构设计文档（太长）
   - 不要放 TODO 列表

5. 多人协作
   - CLAUDE.md 纳入 git 管理
   - PR review 时检查 CLAUDE.md 是否需要更新
   - 团队共享 "AI 容易犯的错" 知识
```

---

## 附录 R: AI 工具配置文件完整参考

### R.1 .claude/settings.json 完整配置

```jsonc
// .claude/settings.json
// Claude Code 项目级配置文件

{
  // 允许的命令（免确认执行）
  "permissions": {
    "allow": [
      "Bash(bun install)",
      "Bash(bun dev)",
      "Bash(bun test)",
      "Bash(bun vitest)",
      "Bash(bun tsc --noEmit)",
      "Bash(bun biome check)",
      "Bash(bun biome format)",
      "Bash(bun db:migrate)",
      "Bash(bun db:push)",
      "Bash(bun drizzle-kit generate)",
      "Bash(docker compose *)",
      "Bash(curl http://localhost:*)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(wc -l *)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force *)",
      "Bash(docker system prune *)",
      "Bash(DROP TABLE *)",
      "Bash(DROP DATABASE *)"
    ]
  },
  // MCP 服务器配置
  "mcpServers": {
    "postgres": {
      "command": "bun x",
      "args": ["-y", "@anthropic/mcp-server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:password@localhost:5432/hr_screening"
      }
    },
    "filesystem": {
      "command": "bun x",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "./src", "./test", "./docs"]
    }
  }
}
```

### R.2 .claude/hooks.json 完整配置

```jsonc
// .claude/hooks.json
// Claude Code Hooks: 在特定事件时自动执行命令

{
  // 文件写入后自动格式化
  "afterWrite": [
    {
      "pattern": "**/*.ts",
      "command": "bun biome format --write ${file}",
      "description": "Auto-format TypeScript files"
    }
  ],

  // 测试文件修改后自动运行相关测试
  "afterEdit": [
    {
      "pattern": "src/**/*.ts",
      "command": "bun vitest run --reporter=verbose ${file.replace(/\\.ts$/, '.test.ts')}",
      "description": "Run related tests after edit",
      "condition": "exists(${file.replace(/\\.ts$/, '.test.ts')})"
    }
  ],

  // 提交前检查
  "beforeCommit": [
    {
      "command": "bun tsc --noEmit",
      "description": "Type check before commit"
    },
    {
      "command": "bun biome check src/",
      "description": "Lint check before commit"
    }
  ]
}
```

### R.3 .claudeignore 完整配置

```
# .claudeignore
# Claude Code 忽略的文件和目录

# 环境和密钥
.env
.env.*
!.env.example
*.pem
*.key
*.crt

# 依赖和构建
node_modules/
dist/
coverage/
.turbo/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Docker volumes
data/
storage/

# 大文件
*.pdf
*.docx
*.xlsx
*.zip
*.tar.gz

# 测试快照（太大，容易混淆 AI）
**/__snapshots__/

# 生成文件
drizzle/meta/
*.sql.ts
```

### R.4 Gemini CLI 配置

```yaml
# .gemini/config.yaml (GEMINI.md)
# Gemini CLI 项目配置

project:
  name: hr-backend
  type: api-server
  language: typescript
  framework: elysia

context:
  description: |
    AI-powered resume screening backend for HR recruitment.
    Uses Elysia + Drizzle + PostgreSQL + MiniMax M2.5.
    ESM modules, strict TypeScript, Bun runtime.

  key_files:
    - src/index.ts          # Entry point
    - src/db/schema.ts      # Database schema
    - src/routes/            # API routes
    - src/services/          # Business logic

  conventions:
    - Use .js extension in imports (ESM)
    - Use Zod v4 for validation (import from "zod/v4")
    - Use Drizzle ORM (not Prisma or TypeORM)
    - MiniMax API base URL: https://api.minimaxi.com/v1
    - Chinese comments for business logic
    - English for code and technical comments

commands:
  dev: bun dev
  test: bun vitest
  build: bun tsc
  lint: bun biome check src/

guidelines:
  - Never use any type
  - Always handle errors with try/catch
  - Use async/await, no callbacks
  - Prefer const over let
  - Use template literals over string concatenation
```

### R.5 VS Code AI 辅助配置

```jsonc
// .vscode/settings.json
// VS Code 与 AI 工具的集成配置

{
  // TypeScript 配置
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.preferences.importModuleSpecifierEnding": "js",
  "typescript.preferences.quoteStyle": "double",

  // Biome 格式化
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome",
    "editor.formatOnSave": true
  },
  "[json]": {
    "editor.defaultFormatter": "biomejs.biome"
  },

  // 文件关联
  "files.associations": {
    "*.env.*": "dotenv",
    "CLAUDE.md": "markdown"
  },

  // 搜索排除
  "search.exclude": {
    "node_modules": true,
    "dist": true,
    "coverage": true,
    "drizzle/meta": true,
    "bun.lock": true
  },

  // 终端配置
  "terminal.integrated.env.linux": {
    "NODE_OPTIONS": "--enable-source-maps"
  },

  // 推荐扩展
  "extensions.recommendations": [
    "biomejs.biome",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "antfu.vite",
    "dbaeumer.vscode-eslint"
  ]
}
```

```jsonc
// .vscode/launch.json
// 调试配置

{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["run", "src/index.ts"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "sourceMaps": true
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["vitest", "run", "--reporter=verbose"],
      "console": "integratedTerminal",
      "sourceMaps": true
    },
    {
      "name": "Debug Current Test File",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["vitest", "run", "${relativeFile}"],
      "console": "integratedTerminal",
      "sourceMaps": true
    }
  ]
}
```

### R.6 AI 工具版本兼容性矩阵

```
AI 开发工具版本兼容性 (2026-02):

工具             │ 版本      │ Bun     │ 备注
─────────────────┼───────────┼─────────┼──────────────────────
Claude Code      │ latest    │ 18+     │ 主力 AI 编码工具
Gemini CLI       │ latest    │ 18+     │ 辅助验证工具
Cursor           │ 0.45+     │ N/A     │ AI IDE
GitHub Copilot   │ latest    │ N/A     │ VS Code 扩展
Codeium          │ latest    │ N/A     │ VS Code 扩展（免费）

项目依赖版本:
─────────────────────────────────
Bun              │ latest
TypeScript       │ 5.7+
Elysia           │ 1.x
Drizzle ORM      │ 0.45+
Vercel AI SDK    │ 6.x (ai@6.0.101)
@ai-sdk/openai   │ 3.x
Zod              │ 4.x (import from "zod/v4")
Vitest           │ 3.x
Biome            │ 1.9+

注意事项:
- Zod v4 使用 import { z } from "zod/v4"（不是 "zod"）
- AI SDK v6 的 generateObject 用法与 v4 不同
- MiniMax M2.5 的 <think> 标签需要 extractJson() 处理
- ESM 模式下 import 必须带 .js 扩展名
```

---

## 附录 S: AI 工具成本优化

### S.1 AI API 成本追踪

```typescript
// src/lib/cost-tracker.ts
// AI API 调用成本追踪器

interface CostEntry {
  timestamp: number;
  model: string;
  operation: string; // score, extract, chat
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  cached: boolean;
}

// 模型定价表（每百万 tokens）
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "MiniMax-M2.5": { input: 0.15, output: 1.20 },
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
};

class CostTracker {
  private entries: CostEntry[] = [];
  private readonly maxEntries = 10000;

  record(
    model: string,
    operation: string,
    usage: { promptTokens: number; completionTokens: number },
    cached: boolean = false
  ): void {
    const pricing = MODEL_PRICING[model] || { input: 0, output: 0 };
    const costUsd =
      (usage.promptTokens / 1_000_000) * pricing.input +
      (usage.completionTokens / 1_000_000) * pricing.output;

    this.entries.push({
      timestamp: Date.now(),
      model,
      operation,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.promptTokens + usage.completionTokens,
      costUsd,
      cached,
    });

    // 保持条目上限
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  // 获取时间段内的成本统计
  getStats(
    sinceMs: number = 24 * 60 * 60 * 1000 // 默认 24 小时
  ) {
    const cutoff = Date.now() - sinceMs;
    const recent = this.entries.filter((e) => e.timestamp >= cutoff);

    const totalCost = recent.reduce((sum, e) => sum + e.costUsd, 0);
    const totalTokens = recent.reduce((sum, e) => sum + e.totalTokens, 0);
    const cacheHits = recent.filter((e) => e.cached).length;
    const apiCalls = recent.filter((e) => !e.cached).length;

    // 按操作类型分组
    const byOperation: Record<
      string,
      { count: number; cost: number; tokens: number }
    > = {};
    for (const entry of recent) {
      const op = entry.operation;
      if (!byOperation[op]) {
        byOperation[op] = { count: 0, cost: 0, tokens: 0 };
      }
      byOperation[op].count++;
      byOperation[op].cost += entry.costUsd;
      byOperation[op].tokens += entry.totalTokens;
    }

    // 按模型分组
    const byModel: Record<
      string,
      { count: number; cost: number; tokens: number }
    > = {};
    for (const entry of recent) {
      if (!byModel[entry.model]) {
        byModel[entry.model] = { count: 0, cost: 0, tokens: 0 };
      }
      byModel[entry.model].count++;
      byModel[entry.model].cost += entry.costUsd;
      byModel[entry.model].tokens += entry.totalTokens;
    }

    return {
      period: {
        from: new Date(cutoff).toISOString(),
        to: new Date().toISOString(),
      },
      totalCost: Number(totalCost.toFixed(4)),
      totalTokens,
      totalRequests: recent.length,
      apiCalls,
      cacheHits,
      cacheHitRate:
        recent.length > 0
          ? `${((cacheHits / recent.length) * 100).toFixed(1)}%`
          : "N/A",
      savingsFromCache: Number(
        (recent.filter((e) => e.cached).reduce((sum, e) => sum + e.costUsd, 0)).toFixed(4)
      ),
      byOperation,
      byModel,
    };
  }

  // 格式化为可读报告
  formatReport(sinceMs?: number): string {
    const stats = this.getStats(sinceMs);
    const lines: string[] = [
      `=== AI 成本报告 ===`,
      `时间段: ${stats.period.from} ~ ${stats.period.to}`,
      ``,
      `总成本: $${stats.totalCost}`,
      `总 Token: ${stats.totalTokens.toLocaleString()}`,
      `API 调用: ${stats.apiCalls} 次`,
      `缓存命中: ${stats.cacheHits} 次 (${stats.cacheHitRate})`,
      `缓存节省: $${stats.savingsFromCache}`,
      ``,
      `--- 按操作类型 ---`,
    ];

    for (const [op, data] of Object.entries(stats.byOperation)) {
      lines.push(
        `  ${op}: ${data.count} 次, $${data.cost.toFixed(4)}, ${data.tokens.toLocaleString()} tokens`
      );
    }

    lines.push(``, `--- 按模型 ---`);
    for (const [model, data] of Object.entries(stats.byModel)) {
      lines.push(
        `  ${model}: ${data.count} 次, $${data.cost.toFixed(4)}, ${data.tokens.toLocaleString()} tokens`
      );
    }

    return lines.join("\n");
  }
}

// 全局单例
export const costTracker = new CostTracker();
```

### S.2 成本报告 API

```typescript
// src/routes/admin/costs.ts
// 管理员 API: AI 成本报告

import { Elysia } from "elysia";
import { costTracker } from "../../lib/cost-tracker.js";

const costs = new Elysia({ prefix: "/costs" });

// 获取成本统计
costs.get("/stats", (c) => {
  const hours = Number(c.req.query("hours") || 24);
  const stats = costTracker.getStats(hours * 60 * 60 * 1000);
  return c.json(stats);
});

// 获取文本报告
costs.get("/report", (c) => {
  const hours = Number(c.req.query("hours") || 24);
  const report = costTracker.formatReport(hours * 60 * 60 * 1000);
  return c.text(report);
});

export default costs;
```

### S.3 Token 使用优化建议

```
AI API 成本优化策略:

1. Prompt 精简
   - 移除不必要的指令重复
   - 使用简洁的 system prompt
   - 简历文本截取前 3000 字（足够评估）
   优化前: ~2000 prompt tokens
   优化后: ~1200 prompt tokens (-40%)

2. 缓存策略
   - 相同简历+相同职位 → 直接返回缓存
   - 缓存命中率目标: >50%
   - 24 小时 TTL（职位变更时自动失效）

3. 批量处理
   - 多份简历合并一次 API 调用（如果模型支持）
   - 节省重复的 system prompt tokens

4. 模型选择
   - 简单任务（信息提取）: 用更便宜的模型
   - 复杂任务（评分）: 用 MiniMax M2.5
   - 日常聊天: DeepSeek Chat（更便宜）

5. 输出控制
   - 限制 max_tokens
   - 使用 structured output（减少废话）
   - temperature=0.1（减少重试）

月度成本估算（1000 份简历/月）:
┌────────────────┬──────────────┬──────────────┐
│ 场景           │ 无优化       │ 优化后       │
├────────────────┼──────────────┼──────────────┤
│ API 调用次数   │ 1000         │ 500（50%缓存）│
│ 平均 tokens/次 │ 3000         │ 2000         │
│ 总 tokens      │ 3,000,000    │ 1,000,000    │
│ 月成本         │ ~$4.05       │ ~$1.35       │
│ 节省           │ -            │ 67%          │
└────────────────┴──────────────┴──────────────┘

注: MiniMax M2.5 定价极低，即使不优化成本也很低
```

### S.4 AI 工具使用效率追踪

```bash
#!/bin/bash
# scripts/ai-tool-metrics.sh
# 追踪 AI 开发工具的使用效率

echo "=== AI Tool Usage Metrics ==="
echo "Date: $(date +%Y-%m-%d)"
echo ""

# 1. Git 提交统计（区分 AI 辅助和手动）
echo "--- Commit Analysis (last 7 days) ---"
TOTAL_COMMITS=$(git log --since="7 days ago" --oneline | wc -l)
AI_ASSISTED=$(git log --since="7 days ago" --oneline --grep="Co-Authored-By:" | wc -l)
echo "Total commits: $TOTAL_COMMITS"
echo "AI-assisted: $AI_ASSISTED"
echo "AI ratio: $(echo "scale=0; $AI_ASSISTED * 100 / ($TOTAL_COMMITS + 1)" | bc)%"

# 2. 代码变更统计
echo ""
echo "--- Code Changes (last 7 days) ---"
ADDITIONS=$(git log --since="7 days ago" --pretty=tformat: --numstat | awk '{sum+=$1} END {print sum+0}')
DELETIONS=$(git log --since="7 days ago" --pretty=tformat: --numstat | awk '{sum+=$2} END {print sum+0}')
echo "Lines added: $ADDITIONS"
echo "Lines deleted: $DELETIONS"
echo "Net change: $((ADDITIONS - DELETIONS))"

# 3. 文件类型分布
echo ""
echo "--- Modified File Types ---"
git log --since="7 days ago" --pretty=tformat: --name-only | \
  grep -v '^$' | sort | uniq | \
  awk -F. '{print $NF}' | sort | uniq -c | sort -rn | head -10

# 4. 测试覆盖率趋势
echo ""
echo "--- Test Coverage ---"
if [ -f coverage/coverage-summary.json ]; then
  LINES=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
  BRANCHES=$(cat coverage/coverage-summary.json | jq '.total.branches.pct')
  echo "Line coverage: ${LINES}%"
  echo "Branch coverage: ${BRANCHES}%"
else
  echo "No coverage data (run: bun vitest run --coverage)"
fi

echo ""
echo "=== Metrics Complete ==="
```

---

## 附录 T: AI 辅助团队协作与知识管理

### T.1 AI 团队知识库构建

```typescript
// scripts/ai-knowledge-base.ts
// 使用 AI 从代码库自动生成团队知识库

import { readFile, writeFile, readdir } from "fs/promises";
import { join, extname, relative } from "path";

interface KnowledgeEntry {
  category: string;
  title: string;
  description: string;
  filePath: string;
  codeExample?: string;
  relatedFiles: string[];
  tags: string[];
}

/**
 * 扫描项目并生成知识条目
 */
async function generateKnowledgeBase(
  projectDir: string
): Promise<KnowledgeEntry[]> {
  const entries: KnowledgeEntry[] = [];

  // 分析路由 → API 文档
  const routeFiles = await findFiles(join(projectDir, "src/routes"), ".ts");
  for (const file of routeFiles) {
    const content = await readFile(file, "utf-8");
    const routes = extractRoutes(content);
    const relPath = relative(projectDir, file);

    entries.push({
      category: "API",
      title: `API Routes: ${relPath}`,
      description: `Contains ${routes.length} route handlers`,
      filePath: relPath,
      codeExample: routes.slice(0, 3).join("\n"),
      relatedFiles: findImports(content, projectDir),
      tags: ["api", "routes", "elysia"],
    });
  }

  // 分析服务 → 业务逻辑文档
  const serviceFiles = await findFiles(join(projectDir, "src/services"), ".ts");
  for (const file of serviceFiles) {
    const content = await readFile(file, "utf-8");
    const functions = extractExportedFunctions(content);
    const relPath = relative(projectDir, file);

    entries.push({
      category: "Service",
      title: `Service: ${relPath}`,
      description: `Exports: ${functions.join(", ")}`,
      filePath: relPath,
      codeExample: extractFirstFunction(content),
      relatedFiles: findImports(content, projectDir),
      tags: ["service", "business-logic"],
    });
  }

  // 分析 schema → 数据模型文档
  const schemaFiles = await findFiles(join(projectDir, "src/db"), ".ts");
  for (const file of schemaFiles) {
    const content = await readFile(file, "utf-8");
    const tables = extractTableNames(content);
    const relPath = relative(projectDir, file);

    entries.push({
      category: "Database",
      title: `Schema: ${relPath}`,
      description: `Tables: ${tables.join(", ")}`,
      filePath: relPath,
      relatedFiles: [],
      tags: ["database", "schema", "drizzle"],
    });
  }

  return entries;
}

/**
 * 生成 Markdown 知识库文档
 */
async function generateKnowledgeDoc(
  entries: KnowledgeEntry[],
  outputPath: string
): Promise<void> {
  const categories = [...new Set(entries.map((e) => e.category))];

  let md = "# HR Backend 知识库\n\n";
  md += `> 自动生成于 ${new Date().toISOString().split("T")[0]}\n\n`;
  md += "## 目录\n\n";

  for (const cat of categories) {
    md += `- [${cat}](#${cat.toLowerCase()})\n`;
  }

  for (const cat of categories) {
    md += `\n## ${cat}\n\n`;
    const catEntries = entries.filter((e) => e.category === cat);

    for (const entry of catEntries) {
      md += `### ${entry.title}\n\n`;
      md += `${entry.description}\n\n`;
      md += `**File:** \`${entry.filePath}\`\n\n`;

      if (entry.codeExample) {
        md += "```typescript\n";
        md += entry.codeExample;
        md += "\n```\n\n";
      }

      if (entry.relatedFiles.length > 0) {
        md += `**Related:** ${entry.relatedFiles.map((f) => `\`${f}\``).join(", ")}\n\n`;
      }

      md += `**Tags:** ${entry.tags.map((t) => `\`${t}\``).join(", ")}\n\n`;
      md += "---\n\n";
    }
  }

  await writeFile(outputPath, md, "utf-8");
  console.log(`Knowledge base generated: ${outputPath}`);
}

// 辅助函数
async function findFiles(dir: string, ext: string): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...(await findFiles(full, ext)));
      } else if (extname(entry.name) === ext) {
        result.push(full);
      }
    }
  } catch {
    // 目录不存在
  }
  return result;
}

function extractRoutes(content: string): string[] {
  const matches = content.matchAll(
    /app\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g
  );
  return Array.from(matches, (m) => `${m[1].toUpperCase()} ${m[2]}`);
}

function extractExportedFunctions(content: string): string[] {
  const matches = content.matchAll(
    /export\s+(?:async\s+)?function\s+(\w+)/g
  );
  return Array.from(matches, (m) => m[1]);
}

function extractFirstFunction(content: string): string {
  const match = content.match(
    /export\s+(?:async\s+)?function\s+\w+[^}]*\{[^}]*\}/s
  );
  return match ? match[0].substring(0, 300) : "";
}

function extractTableNames(content: string): string[] {
  const matches = content.matchAll(/pgTable\s*\(\s*["'`](\w+)["'`]/g);
  return Array.from(matches, (m) => m[1]);
}

function findImports(content: string, _projectDir: string): string[] {
  const matches = content.matchAll(
    /from\s+["'](\.[^"']+)["']/g
  );
  return Array.from(matches, (m) => m[1]);
}

// 入口
const projectDir = process.argv[2] || ".";
generateKnowledgeBase(projectDir).then((entries) => {
  generateKnowledgeDoc(entries, join(projectDir, "docs/KNOWLEDGE.md"));
});
```

### T.2 CLAUDE.md 团队协作模板

```markdown
# CLAUDE.md (团队版)
# HR Resume Screening Backend - AI 开发指南

## 项目概述
AI 驱动的简历筛选系统后端。接收邮件简历 → 解析 → AI 评分 → 管理候选人。

## 技术栈
- Runtime: Bun
- Framework: Elysia (port 3001)
- ORM: Drizzle + PostgreSQL + pgvector
- AI: Vercel AI SDK + MiniMax M2.5 (api.minimaxi.com)
- Email: ImapFlow (IMAP)
- Parser: pdf-parse, mammoth
- Test: Vitest
- Package: bun

## 关键规则

### 代码规范
- 所有文件使用 ESM (`import/export`)
- 导入路径必须带 `.js` 后缀: `import { x } from "./module.js"`
- 使用 Zod v4: `import { z } from "zod/v4"`
- 类型优先: 优先使用 `interface` 而非 `type`
- 错误处理: 使用自定义 Error 类, 不要 throw 字符串

### 数据库
- Schema 在 `src/db/schema.ts`
- 所有表变更通过 Drizzle migration
- JSONB 字段用于灵活配置 (skill_config)
- 使用 pgvector 进行技能语义匹配

### AI 调用
- MiniMax 返回 `<think>` 标签, 必须用 `removeThinkTags()` 清理
- 使用 `generateObject()` + Zod schema 获取结构化输出
- 所有 AI 调用必须有超时和重试
- 缓存相同简历+职位的评分结果

### API 设计
- RESTful: `GET/POST /api/positions`, `GET/PATCH /api/candidates/:id`
- 使用 Elysia 验证中间件验证输入
- 错误响应格式: `{ error: string, details?: unknown }`
- 分页: `?page=1&pageSize=20`

### 测试
- 测试文件: `*.test.ts`
- 使用工厂函数创建测试数据
- Mock AI 调用 (不在测试中调真实 API)
- 最低覆盖率: 70%

### Git 规范
- 分支: feature/xxx, fix/xxx, refactor/xxx
- Commit: conventional commits (feat:, fix:, refactor:, test:, docs:)
- PR 必须通过 CI (lint + test + typecheck)

## 常用命令
```bash
bun dev           # 开发模式 (bun run --watch)
bun test          # 运行测试
bun lint          # Lint 检查
bun tsc --noEmit  # 类型检查
bun db:migrate    # 数据库迁移
bun db:studio     # Drizzle Studio (数据库 GUI)
```

## 文件结构约定
- `src/routes/` — HTTP 路由 (只做请求/响应, 不含业务逻辑)
- `src/services/` — 业务逻辑 (可测试, 不依赖 HTTP)
- `src/db/` — 数据库 schema 和查询
- `src/lib/` — 工具函数和配置
- `test/` — 测试文件

## 团队成员 AI 使用指南

### 新成员 Onboarding
1. 让 AI 阅读 CLAUDE.md 了解项目
2. 让 AI 阅读 `src/db/schema.ts` 了解数据模型
3. 让 AI 阅读 `src/routes/` 了解 API 接口
4. 尝试让 AI 添加一个简单功能来熟悉流程

### AI 代码审查 Checklist
- [ ] 是否遵循 ESM 导入规范?
- [ ] 是否使用 Zod 验证外部输入?
- [ ] AI 调用是否有重试和超时?
- [ ] 是否添加了对应的测试?
- [ ] 是否处理了错误情况?
- [ ] 是否遵循 RESTful 命名?
```

### T.3 AI Pair Programming 最佳实践

```markdown
# AI Pair Programming 工作流

## 场景 1: 新增 API 端点

### Step 1: 描述需求
"添加 DELETE /api/candidates/:id 端点,
需要检查候选人状态是否允许删除（只有 new 和 rejected 可删除）,
删除时同时删除关联的 resumes 和 scores。"

### Step 2: 让 AI 先规划
"先分析需要修改哪些文件, 画出数据流, 列出测试用例, 不要开始写代码"

### Step 3: 确认方案后实现
"方案确认。现在按以下顺序实现:
1. 先写测试 (TDD)
2. 实现 service 层函数
3. 实现 route handler
4. 运行测试确认通过"

### Step 4: 审查和优化
"检查实现:
- 有没有遗漏错误处理?
- SQL 查询是否需要事务?
- 是否需要缓存失效?"

---

## 场景 2: 调试 Bug

### Step 1: 描述现象
"POST /api/resumes/upload 返回 500,
日志显示 'Failed to extract JSON from AI output',
只有 PDF 简历出问题, DOCX 正常"

### Step 2: 收集上下文
"请查看:
1. src/services/resume-parser.ts — PDF 解析逻辑
2. src/services/ai-scorer.ts — JSON 提取逻辑
3. 最近的 git log — 最近改了什么"

### Step 3: 让 AI 推理
"分析可能的原因, 按概率从高到低排列:
1. PDF 解析返回了乱码
2. AI 输出格式异常
3. ..."

### Step 4: 验证和修复
"最可能是 PDF 解析返回了特殊字符,
请在 resume-parser.ts 中添加文本清洗步骤,
并添加一个失败 case 的单测"

---

## 场景 3: 性能优化

### Step 1: 定位瓶颈
"请分析 GET /api/candidates 的查询性能:
1. 检查 SQL 是否有 N+1 问题
2. 是否缺少必要索引
3. EXPLAIN ANALYZE 结果"

### Step 2: 对比方案
"提出 2-3 个优化方案, 分析各自的:
- 优化幅度预估
- 实现复杂度
- 副作用和风险"

### Step 3: 实现 + 基准测试
"实现方案 B (添加复合索引 + 查询缓存),
然后写一个基准测试对比优化前后的 QPS"
```

### T.4 AI 代码生成模板系统

```typescript
// scripts/ai-templates.ts
// AI 代码生成提示模板

/**
 * 标准化的代码生成提示
 * 确保 AI 生成代码符合项目规范
 */
export const codeGenTemplates = {
  /**
   * 新增 CRUD 路由
   */
  crudRoute: (entityName: string, fields: string[]) => `
请为 ${entityName} 生成完整的 CRUD 路由。

要求:
1. 文件: src/routes/${entityName.toLowerCase()}.ts
2. 框架: Elysia
3. 使用 Drizzle ORM 查询
4. 所有输入用 Zod 验证
5. 错误响应: { error: string }
6. 分页: GET 列表支持 ?page=1&pageSize=20

字段: ${fields.join(", ")}

生成:
- GET /api/${entityName.toLowerCase()} (列表 + 分页)
- GET /api/${entityName.toLowerCase()}/:id (详情)
- POST /api/${entityName.toLowerCase()} (创建)
- PATCH /api/${entityName.toLowerCase()}/:id (更新)
- DELETE /api/${entityName.toLowerCase()}/:id (删除)

请同时生成对应的测试文件 test/${entityName.toLowerCase()}.test.ts。
`,

  /**
   * 新增 Service 函数
   */
  serviceFunction: (name: string, description: string) => `
请在 src/services/ 中创建函数 ${name}。

功能: ${description}

要求:
1. 纯函数, 不依赖 HTTP request/response
2. 参数和返回值都有 TypeScript 类型
3. 使用 try/catch 处理错误
4. 添加 JSDoc 注释
5. 导出为 named export

同时在 test/ 中编写:
- 正常路径测试
- 边界情况测试
- 错误处理测试
`,

  /**
   * 数据库迁移
   */
  dbMigration: (description: string) => `
请创建数据库迁移。

变更: ${description}

要求:
1. 修改 src/db/schema.ts (Drizzle schema)
2. 生成迁移 SQL (drizzle-kit generate)
3. 确保向后兼容 (如果是修改列, 使用默认值)
4. 大表操作使用 CONCURRENTLY
5. 添加必要的索引
6. 编写迁移测试
`,

  /**
   * AI 相关服务
   */
  aiService: (purpose: string) => `
请创建 AI 服务函数。

用途: ${purpose}

要求:
1. 使用 Vercel AI SDK (generateObject 或 generateText)
2. 模型: openai("MiniMax-M2.5")，baseURL: "https://api.minimaxi.com/v1"
3. 使用 Zod schema 定义输出结构
4. 处理 MiniMax <think> 标签 (用 removeThinkTags)
5. 添加重试逻辑 (最多3次)
6. 记录 token 用量和成本
7. 添加缓存 (相同输入不重复调用)

测试:
- Mock AI 响应
- 测试 <think> 标签清理
- 测试重试逻辑
- 测试缓存命中
`,
};
```

### T.5 AI 开发日志自动化

```bash
#!/bin/bash
# scripts/ai-dev-log.sh
# 自动生成 AI 开发日志

set -euo pipefail

LOG_DIR="docs/dev-logs"
DATE=$(date +%Y-%m-%d)
LOG_FILE="${LOG_DIR}/${DATE}.md"

mkdir -p "${LOG_DIR}"

# 获取今天的 git 活动
COMMITS=$(git log --since="today 00:00" --format="- %s (%h)" 2>/dev/null || echo "- (no commits)")
CHANGED_FILES=$(git log --since="today 00:00" --name-only --format="" 2>/dev/null | sort -u | head -20 || echo "(none)")
INSERTIONS=$(git log --since="today 00:00" --stat --format="" 2>/dev/null | tail -1 | grep -oP '\d+ insertion' | grep -oP '\d+' || echo "0")
DELETIONS=$(git log --since="today 00:00" --stat --format="" 2>/dev/null | tail -1 | grep -oP '\d+ deletion' | grep -oP '\d+' || echo "0")

# 生成日志
cat > "${LOG_FILE}" << EOF
# 开发日志 ${DATE}

## 今日提交
${COMMITS}

## 变更统计
- 新增行数: +${INSERTIONS}
- 删除行数: -${DELETIONS}

## 变更文件
\`\`\`
${CHANGED_FILES}
\`\`\`

## 代码质量快照
$(bun tsc --noEmit 2>&1 | tail -3 || echo "TypeScript: (check failed)")

## 测试状态
$(bun vitest run --reporter=verbose 2>&1 | tail -10 || echo "Tests: (not run)")

---
*自动生成于 $(date +%H:%M:%S)*
EOF

echo "Dev log generated: ${LOG_FILE}"
```

### T.6 AI 辅助 Onboarding Checklist

```typescript
// scripts/onboarding-check.ts
// 新成员 onboarding 环境检查

import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { execSync } from "child_process";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

async function runChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1. Bun 版本
  const bunVersion = execSync("bun --version", { encoding: "utf-8" }).trim();
  results.push({
    name: "Bun Version",
    status: bunVersion ? "pass" : "fail",
    message: `v${bunVersion}`,
    fix: !bunVersion ? "Install Bun: curl -fsSL https://bun.sh/install | bash" : undefined,
  });

  // 2. (Bun serves as both runtime and package manager)

  // 3. .env 文件
  if (existsSync(".env")) {
    const envContent = await readFile(".env", "utf-8");
    const requiredVars = ["DATABASE_URL", "MINIMAX_API_KEY", "IMAP_HOST"];
    const missing = requiredVars.filter(
      (v) => !envContent.includes(`${v}=`)
    );

    results.push({
      name: ".env File",
      status: missing.length === 0 ? "pass" : "fail",
      message:
        missing.length === 0
          ? "All required vars present"
          : `Missing: ${missing.join(", ")}`,
      fix: "Copy .env.example to .env and fill in values",
    });
  } else {
    results.push({
      name: ".env File",
      status: "fail",
      message: "Not found",
      fix: "cp .env.example .env",
    });
  }

  // 4. node_modules 已安装
  results.push({
    name: "Dependencies",
    status: existsSync("node_modules") ? "pass" : "fail",
    message: existsSync("node_modules") ? "Installed" : "Not installed",
    fix: "bun install",
  });

  // 5. PostgreSQL 连接
  try {
    execSync('psql "$DATABASE_URL" -c "SELECT 1" 2>/dev/null', {
      encoding: "utf-8",
    });
    results.push({
      name: "PostgreSQL",
      status: "pass",
      message: "Connected",
    });
  } catch {
    results.push({
      name: "PostgreSQL",
      status: "warn",
      message: "Cannot connect (may need docker compose up)",
      fix: "docker compose up -d postgres",
    });
  }

  // 6. TypeScript 编译
  try {
    execSync("bun tsc --noEmit 2>&1", { encoding: "utf-8" });
    results.push({
      name: "TypeScript",
      status: "pass",
      message: "No errors",
    });
  } catch (e: any) {
    const errorCount =
      (e.stdout?.match(/error TS/g) || []).length;
    results.push({
      name: "TypeScript",
      status: "fail",
      message: `${errorCount} errors`,
      fix: "Fix TypeScript errors: bun tsc --noEmit",
    });
  }

  return results;
}

// 运行并输出报告
runChecks().then((results) => {
  console.log("\n🏥 HR Backend - Onboarding Health Check\n");
  console.log("=".repeat(60));

  for (const r of results) {
    const icon =
      r.status === "pass" ? "✅" : r.status === "warn" ? "⚠️ " : "❌";
    console.log(`${icon} ${r.name.padEnd(20)} ${r.message}`);
    if (r.fix) {
      console.log(`   Fix: ${r.fix}`);
    }
  }

  const passCount = results.filter((r) => r.status === "pass").length;
  console.log("\n" + "=".repeat(60));
  console.log(
    `Result: ${passCount}/${results.length} checks passed\n`
  );

  if (passCount < results.length) {
    console.log("Fix the issues above and run again: bun scripts/onboarding-check.ts\n");
  } else {
    console.log("All checks passed! You're ready to develop.\n");
    console.log("Quick start:");
    console.log("  bun dev     # Start dev server");
    console.log("  bun test    # Run tests");
    console.log("  bun lint    # Lint code\n");
  }
});
```

---

## 附录 U: AI 工具安全与权限管理

### U.1 Claude Code 权限模型

```markdown
# Claude Code 权限配置详解

## 权限模式

### 1. 默认模式（推荐用于团队）
每次执行工具前需要确认。安全但效率低。

### 2. 自动模式（高效开发）
自动允许预定义的安全操作。

### 3. 自定义模式
通过 .claude/settings.json 精细控制。
```

```jsonc
// .claude/settings.json - HR 项目权限配置
{
  "permissions": {
    // 允许读取所有项目文件
    "Read": { "allow": true },
    "Glob": { "allow": true },
    "Grep": { "allow": true },

    // 编辑: 只允许 src/ 和 test/ 目录
    "Edit": {
      "allow": ["src/**", "test/**", "scripts/**"],
      "deny": ["src/env.ts", ".env*"]
    },

    // 写入: 只允许特定新文件
    "Write": {
      "allow": ["src/**/*.ts", "test/**/*.ts"],
      "deny": [".env*", "*.key", "*.pem"]
    },

    // Bash: 白名单模式
    "Bash": {
      "allow": [
        "bun *",
        "git status",
        "git diff *",
        "git log *",
        "git add *",
        "git commit *",
        "docker compose ps",
        "docker compose logs *",
        "curl http://localhost:*"
      ],
      "deny": [
        "rm -rf *",
        "git push *",
        "git reset --hard*",
        "docker compose down*",
        "curl http*://api.*"  // 禁止直接调外部 API
      ]
    }
  }
}
```

### U.2 AI 工具审计日志

```typescript
// scripts/ai-audit-log.ts
// AI 工具使用审计日志分析

import { readFile, readdir } from "fs/promises";
import { join } from "path";

interface AuditEntry {
  timestamp: string;
  tool: string;
  action: string;
  target: string;
  user: string;
  approved: boolean;
  details?: string;
}

/**
 * 分析 Claude Code 操作日志
 * 日志通常在 ~/.claude/logs/ 目录
 */
async function analyzeAuditLog(logDir: string): Promise<{
  totalActions: number;
  byTool: Record<string, number>;
  deniedActions: AuditEntry[];
  sensitiveFileAccess: AuditEntry[];
  bashCommands: string[];
}> {
  const files = await readdir(logDir);
  const logFiles = files.filter((f) => f.endsWith(".jsonl"));

  const entries: AuditEntry[] = [];

  for (const file of logFiles) {
    const content = await readFile(join(logDir, file), "utf-8");
    const lines = content.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as AuditEntry;
        entries.push(entry);
      } catch {
        // 跳过无效行
      }
    }
  }

  // 统计分析
  const byTool: Record<string, number> = {};
  const deniedActions: AuditEntry[] = [];
  const sensitiveFileAccess: AuditEntry[] = [];
  const bashCommands: string[] = [];

  for (const entry of entries) {
    // 按工具统计
    byTool[entry.tool] = (byTool[entry.tool] || 0) + 1;

    // 被拒绝的操作
    if (!entry.approved) {
      deniedActions.push(entry);
    }

    // 敏感文件访问
    if (
      entry.target &&
      /\.(env|key|pem|secret|credential)/i.test(entry.target)
    ) {
      sensitiveFileAccess.push(entry);
    }

    // Bash 命令记录
    if (entry.tool === "Bash") {
      bashCommands.push(entry.action);
    }
  }

  return {
    totalActions: entries.length,
    byTool,
    deniedActions,
    sensitiveFileAccess,
    bashCommands,
  };
}

// 生成审计报告
async function generateAuditReport(): Promise<void> {
  const homeDir = process.env.HOME || "/home/user";
  const logDir = join(homeDir, ".claude/logs");

  try {
    const analysis = await analyzeAuditLog(logDir);

    console.log("\n🔍 AI Tool Audit Report\n");
    console.log(`Total Actions: ${analysis.totalActions}`);
    console.log("\nBy Tool:");
    for (const [tool, count] of Object.entries(analysis.byTool)) {
      console.log(`  ${tool}: ${count}`);
    }

    if (analysis.deniedActions.length > 0) {
      console.log(`\n⚠️  Denied Actions (${analysis.deniedActions.length}):`);
      for (const a of analysis.deniedActions.slice(0, 10)) {
        console.log(`  ${a.timestamp} | ${a.tool} | ${a.action}`);
      }
    }

    if (analysis.sensitiveFileAccess.length > 0) {
      console.log(
        `\n🔐 Sensitive File Access (${analysis.sensitiveFileAccess.length}):`
      );
      for (const a of analysis.sensitiveFileAccess) {
        console.log(`  ${a.timestamp} | ${a.tool} | ${a.target}`);
      }
    }

    console.log(`\n📝 Bash Commands (last 10):`);
    for (const cmd of analysis.bashCommands.slice(-10)) {
      console.log(`  $ ${cmd}`);
    }
  } catch (error) {
    console.log("Cannot read audit logs:", error);
  }
}

generateAuditReport();
```

### U.3 AI 生成代码安全扫描

```typescript
// scripts/ai-code-security-check.ts
// 扫描 AI 生成的代码中的安全问题

import { readFile, readdir } from "fs/promises";
import { join, extname } from "path";

interface SecurityIssue {
  file: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low";
  rule: string;
  message: string;
  code: string;
}

// 安全规则定义
const SECURITY_RULES: Array<{
  id: string;
  severity: SecurityIssue["severity"];
  pattern: RegExp;
  message: string;
}> = [
  {
    id: "SEC001",
    severity: "critical",
    pattern: /eval\s*\(/,
    message: "使用 eval() 可导致代码注入",
  },
  {
    id: "SEC002",
    severity: "critical",
    pattern: /sql\.raw\s*\(`[^`]*\$\{/,
    message: "SQL 模板字符串中使用变量插值，可能导致 SQL 注入",
  },
  {
    id: "SEC003",
    severity: "high",
    pattern: /innerHTML\s*=/,
    message: "直接设置 innerHTML 可导致 XSS",
  },
  {
    id: "SEC004",
    severity: "high",
    pattern: /new\s+Function\s*\(/,
    message: "使用 new Function() 等同于 eval()",
  },
  {
    id: "SEC005",
    severity: "medium",
    pattern: /process\.env\.\w+/,
    message: "直接使用 process.env 而非经过验证的 env 配置",
  },
  {
    id: "SEC006",
    severity: "medium",
    pattern: /crypto\.createHash\s*\(\s*['"]md5['"]\s*\)/,
    message: "使用不安全的 MD5 哈希算法",
  },
  {
    id: "SEC007",
    severity: "low",
    pattern: /console\.(log|debug|info)\s*\(/,
    message: "生产代码中包含 console 输出，可能泄露敏感信息",
  },
  {
    id: "SEC008",
    severity: "high",
    pattern: /rejectUnauthorized\s*:\s*false/,
    message: "禁用 SSL 证书验证",
  },
  {
    id: "SEC009",
    severity: "critical",
    pattern: /password\s*[:=]\s*["'][^"']+["']/,
    message: "疑似硬编码密码",
  },
  {
    id: "SEC010",
    severity: "medium",
    pattern: /cors\s*\(\s*\{\s*origin\s*:\s*['"]\*['"]/,
    message: "CORS 允许所有来源",
  },
];

/**
 * 扫描文件
 */
async function scanFile(filePath: string): Promise<SecurityIssue[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const issues: SecurityIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 跳过注释
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    for (const rule of SECURITY_RULES) {
      if (rule.pattern.test(line)) {
        issues.push({
          file: filePath,
          line: i + 1,
          severity: rule.severity,
          rule: rule.id,
          message: rule.message,
          code: line.trim().substring(0, 100),
        });
      }
    }
  }

  return issues;
}

/**
 * 递归扫描项目
 */
async function scanProject(
  dir: string,
  exclude: string[] = ["node_modules", "dist", "coverage", ".git"]
): Promise<SecurityIssue[]> {
  const allIssues: SecurityIssue[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;
      const full = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (extname(entry.name) === ".ts") {
        const issues = await scanFile(full);
        allIssues.push(...issues);
      }
    }
  }

  await walk(dir);
  return allIssues;
}

// 运行扫描
const targetDir = process.argv[2] || "src";
scanProject(targetDir).then((issues) => {
  console.log("\n🛡️  Security Scan Report\n");

  if (issues.length === 0) {
    console.log("✅ No security issues found.\n");
    return;
  }

  // 按严重程度分组
  const bySeverity: Record<string, SecurityIssue[]> = {};
  for (const issue of issues) {
    if (!bySeverity[issue.severity]) bySeverity[issue.severity] = [];
    bySeverity[issue.severity].push(issue);
  }

  const order = ["critical", "high", "medium", "low"];
  for (const severity of order) {
    const sevIssues = bySeverity[severity] || [];
    if (sevIssues.length === 0) continue;

    const icon =
      severity === "critical" ? "🔴" :
      severity === "high" ? "🟠" :
      severity === "medium" ? "🟡" : "🔵";

    console.log(`${icon} ${severity.toUpperCase()} (${sevIssues.length}):`);
    for (const issue of sevIssues) {
      console.log(
        `  ${issue.file}:${issue.line} [${issue.rule}] ${issue.message}`
      );
      console.log(`    > ${issue.code}`);
    }
    console.log();
  }

  const criticalCount = (bySeverity.critical || []).length;
  if (criticalCount > 0) {
    console.log(`❌ Found ${criticalCount} CRITICAL issues. Fix before deploying!`);
    process.exit(1);
  }
});
```

### U.4 .claudeignore 最佳实践

```gitignore
# .claudeignore - 限制 AI 工具访问范围

# 敏感配置
.env
.env.*
!.env.example

# 密钥和证书
*.key
*.pem
*.p12
*.pfx
secrets/

# 第三方代码（不需要 AI 分析）
node_modules/
dist/
coverage/

# 大型二进制文件（AI 无法处理）
*.pdf
*.docx
*.xlsx
uploads/

# Git 内部
.git/

# IDE 配置（非必要）
.idea/
.vscode/settings.json  # 可能包含个人配置

# 备份数据
backups/
*.sql.gz

# Docker volumes 数据
data/
```

### U.5 团队 AI 工具使用政策

```markdown
# HR Backend - AI 开发工具使用政策

## 允许的操作
- ✅ 编写和修改业务代码 (src/, test/)
- ✅ 生成测试用例
- ✅ 重构和优化代码
- ✅ 阅读和分析代码
- ✅ 运行测试和类型检查
- ✅ 生成文档和注释
- ✅ 提交代码 (git commit)

## 需要确认的操作
- ⚠️ 数据库 schema 变更 (ALTER TABLE, CREATE TABLE)
- ⚠️ 安装新依赖 (bun add)
- ⚠️ 修改配置文件 (tsconfig, eslint, docker-compose)
- ⚠️ 创建新文件（确认位置和命名）
- ⚠️ git push（确认目标分支）

## 禁止的操作
- ❌ 读取或修改 .env 文件
- ❌ 访问生产数据库
- ❌ 推送到 main 分支
- ❌ 删除 Git 分支或重置历史
- ❌ 执行破坏性 Docker 操作
- ❌ 直接调用外部 API（应通过应用代码）
- ❌ 安装未经审查的依赖

## 代码审查要求
AI 生成的代码必须:
1. 通过 TypeScript 类型检查
2. 通过 ESLint 检查
3. 有对应的单元测试
4. 不包含硬编码密钥/密码
5. 使用项目约定的模式和工具
6. 经过人工审查后方可合入
```

---

## 附录 V: AI 辅助调试与错误诊断

### V.1 AI 错误诊断工作流

```typescript
// scripts/ai-debug-helper.ts
// AI 辅助错误诊断工具

import { readFile } from "fs/promises";
import { execSync } from "child_process";

interface ErrorContext {
  errorMessage: string;
  stackTrace: string;
  relatedFile: string;
  recentChanges: string;
  testOutput?: string;
  envInfo: string;
}

/**
 * 收集错误上下文信息
 * 供 AI 分析定位问题
 */
async function collectErrorContext(
  errorMessage: string
): Promise<ErrorContext> {
  // 从 stack trace 提取文件路径
  const fileMatch = errorMessage.match(
    /at\s+.+\((.+\.ts):(\d+):(\d+)\)/
  );
  const relatedFile = fileMatch
    ? await readFile(fileMatch[1], "utf-8").catch(() => "(cannot read)")
    : "(no file in stack)";

  // 最近 git 变更
  const recentChanges = execSync(
    "git log --oneline -5 && echo '---' && git diff --stat HEAD~1",
    { encoding: "utf-8" }
  ).trim();

  // 环境信息
  const envInfo = [
    `Node: ${process.version}`,
    `Platform: ${process.platform} ${process.arch}`,
    `PWD: ${process.cwd()}`,
    `NODE_ENV: ${process.env.NODE_ENV || "not set"}`,
  ].join("\n");

  return {
    errorMessage,
    stackTrace: errorMessage,
    relatedFile,
    recentChanges,
    envInfo,
  };
}

/**
 * 生成 AI 调试 Prompt
 */
function buildDebugPrompt(ctx: ErrorContext): string {
  return `# 错误诊断请求

## 错误信息
\`\`\`
${ctx.errorMessage}
\`\`\`

## 相关文件
\`\`\`typescript
${ctx.relatedFile.substring(0, 3000)}
\`\`\`

## 最近 Git 变更
\`\`\`
${ctx.recentChanges}
\`\`\`

## 环境信息
\`\`\`
${ctx.envInfo}
\`\`\`

## 请求
1. 分析错误的根本原因
2. 列出可能的解决方案（按可能性排序）
3. 给出具体的代码修复建议
4. 说明如何验证修复是否生效
`;
}

// ===== 常见错误模式库 =====

interface ErrorPattern {
  pattern: RegExp;
  category: string;
  commonCauses: string[];
  quickFixes: string[];
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /Cannot find module '(.+)'/,
    category: "Module Resolution",
    commonCauses: [
      "导入路径缺少 .js 后缀（ESM 要求）",
      "包未安装（bun install）",
      "tsconfig paths 配置错误",
    ],
    quickFixes: [
      '检查 import 语句: import { x } from "./module.js"',
      "运行 bun install",
      "检查 tsconfig.json 的 moduleResolution",
    ],
  },
  {
    pattern: /ECONNREFUSED.*:5432/,
    category: "Database Connection",
    commonCauses: [
      "PostgreSQL 未启动",
      "DATABASE_URL 配置错误",
      "Docker 容器未运行",
    ],
    quickFixes: [
      "docker compose up -d postgres",
      "检查 .env 中的 DATABASE_URL",
      "pg_isready -h localhost -p 5432",
    ],
  },
  {
    pattern: /Failed to extract JSON from AI output/,
    category: "AI Output Parsing",
    commonCauses: [
      "MiniMax 返回了 <think> 标签未清理",
      "AI 输出格式不符合预期",
      "Token 超限导致输出截断",
    ],
    quickFixes: [
      "确保使用 removeThinkTags() 清理",
      "检查 extractJson() 的容错逻辑",
      "减少 prompt 长度",
    ],
  },
  {
    pattern: /TypeError: (.+) is not a function/,
    category: "Type Error",
    commonCauses: [
      "导入的模块不是预期的类型",
      "默认导出 vs 命名导出混淆",
      "循环依赖导致 undefined",
    ],
    quickFixes: [
      "检查 import 语句是否正确",
      "使用 console.log(typeof xxx) 调试",
      "检查是否有循环 import",
    ],
  },
  {
    pattern: /ZodError/,
    category: "Validation Error",
    commonCauses: [
      "请求体格式不符合 Zod schema",
      "环境变量类型不匹配",
      "AI 输出结构不符合定义的 schema",
    ],
    quickFixes: [
      "检查 error.issues 获取具体字段错误",
      "使用 safeParse() 代替 parse() 获取详细错误",
      "在 schema 中添加 .default() 或 .optional()",
    ],
  },
  {
    pattern: /rate.limit|429|Too Many Requests/i,
    category: "Rate Limiting",
    commonCauses: [
      "AI API 请求频率过高",
      "未实现请求队列",
      "并发评分任务过多",
    ],
    quickFixes: [
      "降低并发数（concurrency: 2）",
      "实现指数退避重试",
      "添加请求缓存避免重复调用",
    ],
  },
];

/**
 * 快速错误分类
 */
export function classifyError(errorMessage: string): {
  category: string;
  commonCauses: string[];
  quickFixes: string[];
} | null {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(errorMessage)) {
      return {
        category: pattern.category,
        commonCauses: pattern.commonCauses,
        quickFixes: pattern.quickFixes,
      };
    }
  }
  return null;
}

// 入口
const errorMsg = process.argv[2];
if (errorMsg) {
  const classified = classifyError(errorMsg);
  if (classified) {
    console.log(`\n🔍 Error Category: ${classified.category}\n`);
    console.log("Possible Causes:");
    classified.commonCauses.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    console.log("\nQuick Fixes:");
    classified.quickFixes.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  } else {
    console.log("Unknown error pattern. Collecting full context for AI analysis...");
    collectErrorContext(errorMsg).then((ctx) => {
      console.log(buildDebugPrompt(ctx));
    });
  }
}
```

### V.2 日志分析辅助

```bash
#!/bin/bash
# scripts/analyze-logs.sh
# 日志分析辅助脚本

set -euo pipefail

LOG_SOURCE="${1:-docker}"  # docker | file
LOG_FILE="${2:-}"

echo "📊 Log Analysis Report"
echo "======================"
echo ""

case "$LOG_SOURCE" in
  docker)
    LOGS=$(docker compose logs --tail=500 app 2>/dev/null || echo "")
    ;;
  file)
    if [ -z "$LOG_FILE" ]; then
      echo "Usage: analyze-logs.sh file <path>"
      exit 1
    fi
    LOGS=$(tail -500 "$LOG_FILE")
    ;;
esac

if [ -z "$LOGS" ]; then
  echo "No logs found."
  exit 0
fi

# 1. 错误统计
echo "--- Error Summary ---"
ERROR_COUNT=$(echo "$LOGS" | grep -ci "error" || echo "0")
WARN_COUNT=$(echo "$LOGS" | grep -ci "warn" || echo "0")
echo "Errors: $ERROR_COUNT"
echo "Warnings: $WARN_COUNT"

# 2. 最常见错误
echo ""
echo "--- Top Error Messages ---"
echo "$LOGS" | grep -i "error" | \
  sed 's/.*error[: ]*//' | \
  sort | uniq -c | sort -rn | head -5

# 3. 请求统计
echo ""
echo "--- Request Patterns ---"
echo "$LOGS" | grep -oP '(GET|POST|PUT|PATCH|DELETE)\s+/[^\s]+' | \
  sort | uniq -c | sort -rn | head -10

# 4. 响应时间分析
echo ""
echo "--- Response Times ---"
TIMES=$(echo "$LOGS" | grep -oP '\d+ms' | grep -oP '\d+' | sort -n)
if [ -n "$TIMES" ]; then
  COUNT=$(echo "$TIMES" | wc -l)
  AVG=$(echo "$TIMES" | awk '{s+=$1} END {printf "%.0f", s/NR}')
  MAX=$(echo "$TIMES" | tail -1)
  P95_IDX=$(echo "$COUNT * 95 / 100" | bc)
  P95=$(echo "$TIMES" | sed -n "${P95_IDX}p")
  echo "Count: $COUNT requests"
  echo "Avg: ${AVG}ms"
  echo "P95: ${P95:-N/A}ms"
  echo "Max: ${MAX}ms"
else
  echo "No timing data found"
fi

# 5. AI 评分统计
echo ""
echo "--- AI Scoring Activity ---"
SCORES=$(echo "$LOGS" | grep -c "scored" 2>/dev/null || echo "0")
SCORE_ERRORS=$(echo "$LOGS" | grep "scorer.*error" | wc -l 2>/dev/null || echo "0")
echo "Successful scorings: $SCORES"
echo "Scoring errors: $SCORE_ERRORS"

echo ""
echo "=== Analysis Complete ==="
```

### V.3 性能分析集成

```typescript
// src/middleware/performance.ts
// 请求性能追踪中间件

import { Elysia } from "elysia";

interface RequestMetric {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  timestamp: Date;
}

const requestMetrics: RequestMetric[] = [];
const MAX_METRICS = 5000;

/**
 * 性能追踪中间件
 * 记录每个请求的耗时和状态
 */
export const performanceMiddleware = createMiddleware(async (c, next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = performance.now() - start;
  const status = c.res.status;

  // 记录指标
  requestMetrics.push({
    method,
    path,
    status,
    durationMs: duration,
    timestamp: new Date(),
  });

  // 限制存储大小
  if (requestMetrics.length > MAX_METRICS) {
    requestMetrics.splice(0, requestMetrics.length - MAX_METRICS);
  }

  // 设置响应头
  c.header("X-Response-Time", `${duration.toFixed(1)}ms`);

  // 慢请求警告
  if (duration > 1000) {
    console.warn(
      `[SLOW] ${method} ${path} → ${status} (${duration.toFixed(0)}ms)`
    );
  }
});

/**
 * 获取性能统计
 */
export function getPerformanceStats(sinceMs?: number): {
  totalRequests: number;
  avgDuration: number;
  p50: number;
  p95: number;
  p99: number;
  maxDuration: number;
  errorRate: number;
  byEndpoint: Array<{
    endpoint: string;
    count: number;
    avgMs: number;
    p95Ms: number;
  }>;
} {
  const cutoff = sinceMs ? Date.now() - sinceMs : 0;
  const filtered = requestMetrics.filter(
    (m) => m.timestamp.getTime() > cutoff
  );

  if (filtered.length === 0) {
    return {
      totalRequests: 0,
      avgDuration: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      maxDuration: 0,
      errorRate: 0,
      byEndpoint: [],
    };
  }

  const durations = filtered.map((m) => m.durationMs).sort((a, b) => a - b);
  const errors = filtered.filter((m) => m.status >= 400).length;

  // 按端点分组
  const endpointMap = new Map<string, number[]>();
  for (const m of filtered) {
    const key = `${m.method} ${m.path}`;
    if (!endpointMap.has(key)) endpointMap.set(key, []);
    endpointMap.get(key)!.push(m.durationMs);
  }

  const byEndpoint = Array.from(endpointMap.entries())
    .map(([endpoint, times]) => {
      const sorted = times.sort((a, b) => a - b);
      return {
        endpoint,
        count: times.length,
        avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
        p95Ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1] || 0),
      };
    })
    .sort((a, b) => b.p95Ms - a.p95Ms);

  return {
    totalRequests: filtered.length,
    avgDuration: Math.round(
      durations.reduce((a, b) => a + b, 0) / durations.length
    ),
    p50: Math.round(durations[Math.ceil(durations.length * 0.5) - 1]),
    p95: Math.round(durations[Math.ceil(durations.length * 0.95) - 1]),
    p99: Math.round(durations[Math.ceil(durations.length * 0.99) - 1]),
    maxDuration: Math.round(durations[durations.length - 1]),
    errorRate: (errors / filtered.length) * 100,
    byEndpoint: byEndpoint.slice(0, 20),
  };
}
```

---

## 附录 W: AI 工具版本管理与升级策略

### W.1 AI 工具版本兼容矩阵

```markdown
# AI 开发工具版本兼容矩阵

## Claude Code
| 版本 | Node.js | 功能 | 备注 |
|------|---------|------|------|
| 1.x  | 18+     | 基础代码编辑、搜索 | 初始版本 |
| 2.x  | 20+     | Hooks、MCP 支持 | 推荐最低版本 |
| 3.x  | 22+     | Agent 模式、多工具 | 当前使用版本 |

## Gemini CLI
| 版本 | Node.js | 功能 | 备注 |
|------|---------|------|------|
| 1.x  | 18+     | 基础代码助手 | |
| 2.x  | 20+     | 上下文扩展、工具支持 | |

## VS Code AI 扩展
| 扩展 | VS Code 版本 | 模型 |
|------|-------------|------|
| GitHub Copilot | 1.85+ | GPT-4 / Claude |
| Continue | 1.80+ | 多模型支持 |
| Cody | 1.80+ | Claude |

## 升级路径
1. 每季度检查 AI 工具新版本
2. 在开发分支测试兼容性
3. 更新 .claude/settings.json
4. 更新团队文档
```

### W.2 AI 工具版本锁定

```jsonc
// .ai-tools-version.json
// 锁定团队 AI 工具版本（避免不一致）
{
  "claude-code": {
    "minVersion": "3.0.0",
    "recommended": "3.x",
    "notes": "需要 Bun 1.x+"
  },
  "gemini-cli": {
    "minVersion": "2.0.0",
    "recommended": "latest",
    "notes": "需要 Google Cloud 配置"
  },
  "vscode-extensions": {
    "github.copilot": "1.x",
    "continue.continue": "0.9.x"
  },
  "ai-models": {
    "primary": "MiniMax-M2.5",
    "fallback": "deepseek-chat",
    "embedding": "text-embedding-ada-002"
  },
  "lastUpdated": "2026-02-27",
  "updatedBy": "team-lead"
}
```

### W.3 AI 工具升级检查脚本

```bash
#!/bin/bash
# scripts/check-ai-tools.sh
# 检查 AI 工具版本更新

set -euo pipefail

echo "🔍 AI Tools Version Check"
echo "========================="
echo ""

# 1. Claude Code
echo "--- Claude Code ---"
if command -v claude &> /dev/null; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
  echo "  Installed: ${CLAUDE_VERSION}"
else
  echo "  ❌ Not installed"
fi

# 检查最新版本
LATEST_CLAUDE=$(npm view @anthropic-ai/claude-code version 2>/dev/null || echo "unknown")
echo "  Latest: ${LATEST_CLAUDE}"

# 2. Bun
echo ""
echo "--- Bun ---"
BUN_VERSION=$(bun --version)
echo "  Installed: ${BUN_VERSION}"

# 3. (Bun is the package manager)

# 4. 项目依赖中的 AI 相关包
echo ""
echo "--- AI Dependencies ---"
if [ -f package.json ]; then
  AI_DEPS=$(cat package.json | jq -r '.dependencies + .devDependencies | to_entries[] | select(.key | test("^(ai|@ai-sdk|openai|langchain)")) | "\(.key): \(.value)"' 2>/dev/null || echo "  (cannot parse)")
  if [ -n "$AI_DEPS" ]; then
    echo "$AI_DEPS" | while read -r dep; do
      echo "  $dep"
    done
  else
    echo "  (no AI dependencies found)"
  fi
fi

# 5. .claude/settings.json 检查
echo ""
echo "--- Claude Code Settings ---"
if [ -f .claude/settings.json ]; then
  echo "  ✅ .claude/settings.json exists"
  PERMISSIONS=$(cat .claude/settings.json | jq -r 'keys | length' 2>/dev/null || echo "?")
  echo "  Configured sections: ${PERMISSIONS}"
else
  echo "  ⚠️  No .claude/settings.json (using defaults)"
fi

# 6. .claudeignore 检查
echo ""
echo "--- .claudeignore ---"
if [ -f .claudeignore ]; then
  RULES=$(wc -l < .claudeignore | tr -d ' ')
  echo "  ✅ ${RULES} rules configured"
else
  echo "  ⚠️  No .claudeignore (AI can access all files)"
fi

echo ""
echo "========================="
echo "Check complete."
```

### W.4 AI SDK 升级流程

```typescript
// scripts/upgrade-ai-sdk.ts
// AI SDK 版本升级辅助脚本

import { execSync } from "child_process";
import { readFile, writeFile } from "fs/promises";

interface UpgradeStep {
  name: string;
  check: () => Promise<boolean>;
  fix?: string;
}

async function runUpgradeChecks(): Promise<void> {
  console.log("🔄 AI SDK Upgrade Check\n");

  const steps: UpgradeStep[] = [
    {
      name: "Check current ai package version",
      check: async () => {
        const pkg = JSON.parse(await readFile("package.json", "utf-8"));
        const version = pkg.dependencies?.ai || "not installed";
        console.log(`  Current: ai@${version}`);
        return true;
      },
    },
    {
      name: "Check @ai-sdk/openai version",
      check: async () => {
        const pkg = JSON.parse(await readFile("package.json", "utf-8"));
        const version =
          pkg.dependencies?.["@ai-sdk/openai"] || "not installed";
        console.log(`  Current: @ai-sdk/openai@${version}`);
        return true;
      },
    },
    {
      name: "Check for breaking changes in imports",
      check: async () => {
        // 检查是否使用了已弃用的 API
        const deprecated = [
          "import.*from.*ai/rsc",            // RSC API moved
          "experimental_",                     // Experimental prefixes removed
          "StreamingTextResponse",             // Deprecated response type
        ];

        let hasDeprecated = false;
        for (const pattern of deprecated) {
          try {
            const result = execSync(
              `grep -rn '${pattern}' src/ --include='*.ts' || true`,
              { encoding: "utf-8" }
            );
            if (result.trim()) {
              console.log(`  ⚠️  Found deprecated pattern: ${pattern}`);
              console.log(`     ${result.trim().split("\n")[0]}`);
              hasDeprecated = true;
            }
          } catch {
            // grep not found
          }
        }

        if (!hasDeprecated) {
          console.log("  ✅ No deprecated patterns found");
        }
        return !hasDeprecated;
      },
    },
    {
      name: "Check MiniMax API compatibility",
      check: async () => {
        // 检查 baseURL 配置
        try {
          const result = execSync(
            `grep -rn 'baseURL' src/ --include='*.ts' | grep -i 'minimax'`,
            { encoding: "utf-8" }
          );
          if (result.includes("api.minimaxi.com")) {
            console.log("  ✅ MiniMax baseURL correct (api.minimaxi.com)");
          } else if (result.includes("api.minimax.io")) {
            console.log(
              "  ⚠️  Old MiniMax URL detected (api.minimax.io → api.minimaxi.com)"
            );
          }
        } catch {
          console.log("  ℹ️  No MiniMax configuration found");
        }
        return true;
      },
    },
    {
      name: "TypeScript compilation check",
      check: async () => {
        try {
          execSync("bun tsc --noEmit", { encoding: "utf-8", stdio: "pipe" });
          console.log("  ✅ TypeScript compiles without errors");
          return true;
        } catch (e: any) {
          const errors = (e.stdout?.match(/error TS/g) || []).length;
          console.log(`  ❌ ${errors} TypeScript errors`);
          return false;
        }
      },
    },
    {
      name: "Run tests",
      check: async () => {
        try {
          execSync("bun vitest run --reporter=verbose 2>&1 | tail -5", {
            encoding: "utf-8",
            stdio: "pipe",
          });
          console.log("  ✅ All tests passing");
          return true;
        } catch {
          console.log("  ❌ Some tests failing");
          return false;
        }
      },
    },
  ];

  let allPassed = true;
  for (const step of steps) {
    console.log(`\n[${step.name}]`);
    const passed = await step.check();
    if (!passed) {
      allPassed = false;
      if (step.fix) {
        console.log(`  Fix: ${step.fix}`);
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  if (allPassed) {
    console.log("✅ All upgrade checks passed. Safe to upgrade.");
    console.log("\nUpgrade command:");
    console.log("  bun update ai @ai-sdk/openai");
  } else {
    console.log("⚠️  Some checks failed. Fix issues before upgrading.");
  }
}

runUpgradeChecks();
```

---

## Appendix X: AI コードレビュー自動化 & PR 品質ゲート

### X.1 AI コードレビューボット

```typescript
// src/lib/ai-code-reviewer.ts
// AI コードレビュー自動化ツール
// PR diff を MiniMax M2.5 で分析し、レビューコメント生成

import { generateText, generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod/v4";

const minimax = createOpenAI({
  baseURL: "https://api.minimaxi.com/v1",
  apiKey: process.env.MINIMAX_API_KEY || "",
});

// レビュー結果スキーマ
const ReviewResultSchema = z.object({
  summary: z.string().describe("变更的整体评价（1-2句）"),
  severity: z.enum(["critical", "warning", "info", "approval"]),
  issues: z.array(
    z.object({
      file: z.string().describe("文件路径"),
      line: z.number().describe("行号（近似）"),
      severity: z.enum(["critical", "warning", "suggestion"]),
      category: z.enum([
        "security",
        "performance",
        "logic",
        "style",
        "naming",
        "error-handling",
        "test-coverage",
      ]),
      message: z.string().describe("问题描述"),
      suggestion: z.string().optional().describe("修改建议"),
    })
  ),
  score: z.number().min(0).max(100).describe("代码质量评分"),
  approvalRecommendation: z.enum(["approve", "request_changes", "comment"]),
});

type ReviewResult = z.infer<typeof ReviewResultSchema>;

// レビュープロンプト
const REVIEW_SYSTEM_PROMPT = `你是一个资深的 TypeScript/Bun 后端代码审查专家。
你正在审查一个 HR 简历筛选系统的 Pull Request。

技术栈:
- Elysia (Web 框架)
- Drizzle ORM (PostgreSQL)
- Vercel AI SDK + MiniMax M2.5
- ImapFlow (邮件接收)
- Vitest (测试)
- ESM (import/export)

审查重点:
1. **安全性**: SQL 注入、XSS、敏感数据泄露、prompt injection
2. **性能**: N+1 查询、内存泄露、未释放连接
3. **逻辑正确性**: 边界条件、类型安全、错误处理
4. **代码风格**: 命名规范、函数长度、重复代码
5. **测试覆盖**: 是否需要添加测试

请用中文输出审查结果。`;

export async function reviewDiff(
  diff: string,
  prTitle: string,
  prDescription: string
): Promise<ReviewResult> {
  const { object } = await generateObject({
    model: minimax("MiniMax-M2.5"),
    schema: ReviewResultSchema,
    system: REVIEW_SYSTEM_PROMPT,
    prompt: `
## Pull Request
标题: ${prTitle}
描述: ${prDescription}

## Diff
\`\`\`diff
${diff.slice(0, 15000)}
\`\`\`

请对这个 PR 进行代码审查。
`,
  });

  return object;
}

// ファイル単位レビュー（大きい PR 向け）
export async function reviewFileByFile(
  files: Array<{ path: string; diff: string }>,
  prContext: { title: string; description: string }
): Promise<{
  fileReviews: Array<{ path: string; review: ReviewResult }>;
  overall: ReviewResult;
}> {
  // ファイルごとに並行レビュー
  const fileReviews = await Promise.all(
    files.map(async (file) => {
      const review = await reviewDiff(
        file.diff,
        `${prContext.title} - ${file.path}`,
        prContext.description
      );
      return { path: file.path, review };
    })
  );

  // 全体サマリー生成
  const allIssues = fileReviews.flatMap((fr) => fr.review.issues);
  const avgScore =
    fileReviews.reduce((sum, fr) => sum + fr.review.score, 0) /
    fileReviews.length;

  const hasCritical = allIssues.some((i) => i.severity === "critical");
  const hasWarning = allIssues.some((i) => i.severity === "warning");

  const overall: ReviewResult = {
    summary: `审查了 ${files.length} 个文件，发现 ${allIssues.length} 个问题`,
    severity: hasCritical ? "critical" : hasWarning ? "warning" : "approval",
    issues: allIssues,
    score: Math.round(avgScore),
    approvalRecommendation: hasCritical
      ? "request_changes"
      : hasWarning
        ? "comment"
        : "approve",
  };

  return { fileReviews, overall };
}
```

### X.2 Gitea Webhook 統合

```typescript
// src/routes/webhooks/gitea-review.ts
// Gitea PR Webhook → AI コードレビュー

import { Elysia } from "elysia";
import { reviewDiff, reviewFileByFile } from "../../lib/ai-code-reviewer.js";

const app = new Elysia();

interface GiteaPRPayload {
  action: string;
  number: number;
  pull_request: {
    title: string;
    body: string;
    diff_url: string;
    html_url: string;
    head: { sha: string };
    base: { ref: string };
  };
  repository: {
    full_name: string;
    clone_url: string;
  };
}

// Gitea Webhook シークレット検証
function verifyGiteaSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = globalThis.crypto || (await import("node:crypto"));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === signature;
}

// POST /api/webhooks/gitea-review
app.post("/", async (c) => {
  const body = await c.req.text();

  // シグネチャ検証
  const signature = c.req.header("X-Gitea-Signature") || "";
  const secret = process.env.GITEA_WEBHOOK_SECRET || "";

  if (secret && !verifyGiteaSignature(body, signature, secret)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const payload: GiteaPRPayload = JSON.parse(body);

  // PR open/synchronize のみレビュー
  if (!["opened", "synchronized"].includes(payload.action)) {
    return c.json({ message: "Skipped", action: payload.action });
  }

  // Diff 取得
  const diffRes = await fetch(payload.pull_request.diff_url);
  if (!diffRes.ok) {
    return c.json({ error: "Failed to fetch diff" }, 500);
  }
  const diff = await diffRes.text();

  // AI レビュー実行
  const review = await reviewDiff(
    diff,
    payload.pull_request.title,
    payload.pull_request.body
  );

  // Gitea API でレビューコメント投稿
  const giteaApiUrl = process.env.GITEA_API_URL || "https://git.keiten-jp.com/api/v1";
  const giteaToken = process.env.GITEA_API_TOKEN || "";

  // PR レビュー作成
  const reviewBody = formatReviewComment(review);

  await fetch(
    `${giteaApiUrl}/repos/${payload.repository.full_name}/pulls/${payload.number}/reviews`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${giteaToken}`,
      },
      body: JSON.stringify({
        body: reviewBody,
        event:
          review.approvalRecommendation === "approve"
            ? "APPROVED"
            : review.approvalRecommendation === "request_changes"
              ? "REQUEST_CHANGES"
              : "COMMENT",
      }),
    }
  );

  return c.json({
    prNumber: payload.number,
    score: review.score,
    issueCount: review.issues.length,
    recommendation: review.approvalRecommendation,
  });
});

function formatReviewComment(review: ReviewResult): string {
  const severityEmoji = {
    critical: "🔴",
    warning: "🟡",
    suggestion: "🔵",
  };

  const categoryLabel: Record<string, string> = {
    security: "安全",
    performance: "性能",
    logic: "逻辑",
    style: "风格",
    naming: "命名",
    "error-handling": "错误处理",
    "test-coverage": "测试覆盖",
  };

  let comment = `## 🤖 AI Code Review\n\n`;
  comment += `**评分**: ${review.score}/100 | `;
  comment += `**建议**: ${review.approvalRecommendation}\n\n`;
  comment += `${review.summary}\n\n`;

  if (review.issues.length > 0) {
    comment += `### 发现的问题 (${review.issues.length})\n\n`;

    for (const issue of review.issues) {
      comment += `${severityEmoji[issue.severity]} **[${categoryLabel[issue.category] || issue.category}]** `;
      comment += `\`${issue.file}:${issue.line}\`\n`;
      comment += `${issue.message}\n`;
      if (issue.suggestion) {
        comment += `> 💡 ${issue.suggestion}\n`;
      }
      comment += `\n`;
    }
  } else {
    comment += `✅ 没有发现明显问题\n`;
  }

  comment += `\n---\n*由 MiniMax M2.5 自动审查*`;
  return comment;
}

export default app;
```

### X.3 AI レビュー品質ゲート

```typescript
// src/lib/review-quality-gate.ts
// CI で使用する品質ゲート: AI レビュー結果に基づいて pass/fail 判定

import { reviewDiff, type ReviewResult } from "./ai-code-reviewer.js";

interface QualityGateConfig {
  minScore: number;                    // 最低スコア
  maxCriticalIssues: number;          // critical 許容数
  maxWarningIssues: number;           // warning 許容数
  blockOnSecurityIssues: boolean;     // security 問題でブロック
  blockOnPerformanceIssues: boolean;  // performance 問題でブロック
}

const DEFAULT_CONFIG: QualityGateConfig = {
  minScore: 60,
  maxCriticalIssues: 0,
  maxWarningIssues: 5,
  blockOnSecurityIssues: true,
  blockOnPerformanceIssues: false,
};

interface GateResult {
  passed: boolean;
  reason: string;
  review: ReviewResult;
  details: {
    scoreCheck: boolean;
    criticalCheck: boolean;
    warningCheck: boolean;
    securityCheck: boolean;
  };
}

export async function runQualityGate(
  diff: string,
  prTitle: string,
  config: Partial<QualityGateConfig> = {}
): Promise<GateResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const review = await reviewDiff(diff, prTitle, "");

  const criticalCount = review.issues.filter(
    (i) => i.severity === "critical"
  ).length;
  const warningCount = review.issues.filter(
    (i) => i.severity === "warning"
  ).length;
  const securityIssues = review.issues.filter(
    (i) => i.category === "security"
  );

  const scoreCheck = review.score >= cfg.minScore;
  const criticalCheck = criticalCount <= cfg.maxCriticalIssues;
  const warningCheck = warningCount <= cfg.maxWarningIssues;
  const securityCheck = !cfg.blockOnSecurityIssues || securityIssues.length === 0;

  const passed = scoreCheck && criticalCheck && warningCheck && securityCheck;

  const reasons: string[] = [];
  if (!scoreCheck) reasons.push(`Score ${review.score} < ${cfg.minScore}`);
  if (!criticalCheck) reasons.push(`${criticalCount} critical issues`);
  if (!warningCheck) reasons.push(`${warningCount} warnings > ${cfg.maxWarningIssues}`);
  if (!securityCheck) reasons.push(`${securityIssues.length} security issues`);

  return {
    passed,
    reason: passed ? "All checks passed" : reasons.join("; "),
    review,
    details: { scoreCheck, criticalCheck, warningCheck, securityCheck },
  };
}
```

```bash
#!/bin/bash
# scripts/ai-quality-gate.sh
# CI 用 AI 品質ゲート実行スクリプト

set -euo pipefail

# PR diff 取得
BASE_BRANCH="${1:-main}"
DIFF=$(git diff "${BASE_BRANCH}...HEAD" -- '*.ts' '*.tsx')

if [ -z "$DIFF" ]; then
  echo "✅ No TypeScript changes to review"
  exit 0
fi

PR_TITLE=$(git log --format='%s' -1)
DIFF_LINES=$(echo "$DIFF" | wc -l)

echo "=== AI Quality Gate ==="
echo "PR: $PR_TITLE"
echo "Diff lines: $DIFF_LINES"
echo ""

# AI レビュー実行
RESULT=$(bun -e "
import { runQualityGate } from './src/lib/review-quality-gate.js';

const diff = \`$(echo "$DIFF" | head -500 | sed 's/`/\\`/g')\`;
const result = await runQualityGate(diff, '${PR_TITLE}');

console.log(JSON.stringify(result));
")

# 結果解析
PASSED=$(echo "$RESULT" | jq -r '.passed')
SCORE=$(echo "$RESULT" | jq -r '.review.score')
ISSUES=$(echo "$RESULT" | jq -r '.review.issues | length')
REASON=$(echo "$RESULT" | jq -r '.reason')

echo "Score: $SCORE/100"
echo "Issues: $ISSUES"
echo "Passed: $PASSED"
echo "Reason: $REASON"

if [ "$PASSED" = "false" ]; then
  echo ""
  echo "❌ Quality gate FAILED"
  echo "$RESULT" | jq '.review.issues[] | "\(.severity) [\(.category)] \(.file):\(.line) - \(.message)"'
  exit 1
fi

echo ""
echo "✅ Quality gate PASSED"
```

### X.4 レビュー学習データ蓄積

```typescript
// src/lib/review-feedback-store.ts
// AI レビューのフィードバック蓄積
// 人間のレビュアーが AI の指摘を accept/reject することで精度向上

import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

interface ReviewFeedback {
  reviewId: string;
  issueIndex: number;
  humanDecision: "accept" | "reject" | "modify";
  humanComment?: string;
  originalIssue: {
    file: string;
    line: number;
    severity: string;
    category: string;
    message: string;
  };
}

// フィードバック保存
export async function saveReviewFeedback(
  feedback: ReviewFeedback
): Promise<void> {
  await db.execute(sql`
    INSERT INTO ai_review_feedback (
      review_id, issue_index, human_decision, human_comment,
      issue_file, issue_line, issue_severity, issue_category, issue_message,
      created_at
    ) VALUES (
      ${feedback.reviewId},
      ${feedback.issueIndex},
      ${feedback.humanDecision},
      ${feedback.humanComment || null},
      ${feedback.originalIssue.file},
      ${feedback.originalIssue.line},
      ${feedback.originalIssue.severity},
      ${feedback.originalIssue.category},
      ${feedback.originalIssue.message},
      NOW()
    )
  `);
}

// フィードバック統計（カテゴリ別の精度）
export async function getReviewAccuracy(): Promise<
  Array<{
    category: string;
    total: number;
    accepted: number;
    rejected: number;
    accuracy: number;
  }>
> {
  const result = await db.execute(sql`
    SELECT
      issue_category as category,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE human_decision = 'accept') as accepted,
      COUNT(*) FILTER (WHERE human_decision = 'reject') as rejected,
      ROUND(
        COUNT(*) FILTER (WHERE human_decision = 'accept')::numeric /
        NULLIF(COUNT(*), 0) * 100, 1
      ) as accuracy
    FROM ai_review_feedback
    GROUP BY issue_category
    ORDER BY total DESC
  `);

  return result.rows as Array<{
    category: string;
    total: number;
    accepted: number;
    rejected: number;
    accuracy: number;
  }>;
}

// よく reject される指摘パターン（ノイズ削減用）
export async function getNoisePatterns(): Promise<
  Array<{ category: string; severity: string; rejectRate: number; sampleMessage: string }>
> {
  const result = await db.execute(sql`
    SELECT
      issue_category as category,
      issue_severity as severity,
      ROUND(
        COUNT(*) FILTER (WHERE human_decision = 'reject')::numeric /
        NULLIF(COUNT(*), 0) * 100, 1
      ) as reject_rate,
      (ARRAY_AGG(issue_message ORDER BY created_at DESC))[1] as sample_message
    FROM ai_review_feedback
    GROUP BY issue_category, issue_severity
    HAVING COUNT(*) >= 5
       AND COUNT(*) FILTER (WHERE human_decision = 'reject')::numeric / COUNT(*) > 0.5
    ORDER BY reject_rate DESC
  `);

  return result.rows as Array<{
    category: string;
    severity: string;
    rejectRate: number;
    sampleMessage: string;
  }>;
}
```

---

## Appendix Y: AI ドキュメント自動生成 & コード解説

### Y.1 API ドキュメント自動生成

```typescript
// src/lib/api-doc-generator.ts
// ソースコードから API ドキュメントを自動生成
// Elysia ルートを AST 的に解析して OpenAPI 互換ドキュメント出力

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

interface EndpointDoc {
  method: string;
  path: string;
  summary: string;
  parameters: Array<{
    name: string;
    in: "path" | "query" | "header";
    type: string;
    required: boolean;
    description: string;
  }>;
  requestBody?: {
    contentType: string;
    schema: Record<string, unknown>;
  };
  responses: Array<{
    status: number;
    description: string;
    schema?: Record<string, unknown>;
  }>;
  tags: string[];
  sourceFile: string;
  sourceLine: number;
}

// Elysia ルートファイルからエンドポイント抽出
function extractEndpoints(filePath: string): EndpointDoc[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const endpoints: EndpointDoc[] = [];

  const routePattern =
    /app\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(routePattern);
    if (!match) continue;

    const method = match[1].toUpperCase();
    const path = match[2];

    // 上のコメントからサマリー抽出
    let summary = "";
    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      const commentMatch = lines[j].match(/\/\/\s*(.+)/);
      if (commentMatch) {
        summary = commentMatch[1].trim();
        break;
      }
    }

    // パスパラメータ抽出
    const pathParams = [...path.matchAll(/:(\w+)/g)].map((m) => ({
      name: m[1],
      in: "path" as const,
      type: "string",
      required: true,
      description: "",
    }));

    // c.req.query() からクエリパラメータ推定
    const bodyContent = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
    const queryParams = [...bodyContent.matchAll(/c\.req\.query\(["'`](\w+)["'`]\)/g)].map(
      (m) => ({
        name: m[1],
        in: "query" as const,
        type: "string",
        required: false,
        description: "",
      })
    );

    // リクエストボディ検出
    const hasBody = bodyContent.includes("c.req.json()");

    // レスポンスステータス検出
    const statusMatches = [
      ...bodyContent.matchAll(/c\.json\s*\([\s\S]*?,\s*(\d{3})\s*\)/g),
    ];
    const statuses = statusMatches.map((m) => parseInt(m[1], 10));
    if (statuses.length === 0) statuses.push(200);

    endpoints.push({
      method,
      path,
      summary,
      parameters: [...pathParams, ...queryParams],
      requestBody: hasBody
        ? { contentType: "application/json", schema: {} }
        : undefined,
      responses: statuses.map((s) => ({
        status: s,
        description: s < 400 ? "Success" : "Error",
      })),
      tags: [basename(filePath, ".ts")],
      sourceFile: filePath,
      sourceLine: i + 1,
    });
  }

  return endpoints;
}

// OpenAPI 3.0 形式で出力
function generateOpenAPISpec(endpoints: EndpointDoc[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const ep of endpoints) {
    const apiPath = ep.path
      .replace(/:(\w+)/g, "{$1}");  // :id → {id}

    if (!paths[apiPath]) {
      paths[apiPath] = {};
    }

    const operation: Record<string, unknown> = {
      summary: ep.summary,
      tags: ep.tags,
      parameters: ep.parameters.map((p) => ({
        name: p.name,
        in: p.in,
        required: p.required,
        schema: { type: p.type },
      })),
      responses: Object.fromEntries(
        ep.responses.map((r) => [
          r.status.toString(),
          { description: r.description },
        ])
      ),
    };

    if (ep.requestBody) {
      operation.requestBody = {
        required: true,
        content: {
          [ep.requestBody.contentType]: {
            schema: ep.requestBody.schema,
          },
        },
      };
    }

    paths[apiPath][ep.method.toLowerCase()] = operation;
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "HR Resume Screening API",
      version: "1.0.0",
      description: "AI-powered resume screening system for HR recruitment",
    },
    servers: [
      { url: "http://localhost:3001", description: "Development" },
      { url: "https://hr-api.ivis-sh.com", description: "Production" },
    ],
    paths,
  };
}

// メイン: ルートディレクトリをスキャンして生成
export function generateAPIDocs(routesDir: string): void {
  const files = readdirSync(routesDir).filter((f) => f.endsWith(".ts"));
  const allEndpoints: EndpointDoc[] = [];

  for (const file of files) {
    const filePath = join(routesDir, file);
    const endpoints = extractEndpoints(filePath);
    allEndpoints.push(...endpoints);
  }

  // OpenAPI JSON
  const spec = generateOpenAPISpec(allEndpoints);
  writeFileSync(
    "docs/openapi.json",
    JSON.stringify(spec, null, 2),
    "utf-8"
  );

  // マークダウンサマリー
  let markdown = "# HR Backend API Reference\n\n";
  markdown += `Generated: ${new Date().toISOString()}\n\n`;
  markdown += `Total Endpoints: ${allEndpoints.length}\n\n`;

  // タグごとにグループ化
  const grouped = new Map<string, EndpointDoc[]>();
  for (const ep of allEndpoints) {
    const tag = ep.tags[0] || "other";
    if (!grouped.has(tag)) grouped.set(tag, []);
    grouped.get(tag)!.push(ep);
  }

  for (const [tag, endpoints] of grouped) {
    markdown += `## ${tag}\n\n`;
    markdown += `| Method | Path | Summary |\n`;
    markdown += `|--------|------|---------|\n`;
    for (const ep of endpoints) {
      markdown += `| \`${ep.method}\` | \`${ep.path}\` | ${ep.summary} |\n`;
    }
    markdown += `\n`;
  }

  writeFileSync("docs/api-reference.md", markdown, "utf-8");

  console.log(`Generated API docs: ${allEndpoints.length} endpoints`);
  console.log("  → docs/openapi.json");
  console.log("  → docs/api-reference.md");
}
```

### Y.2 コードコメント自動生成

```typescript
// src/lib/ai-code-commenter.ts
// AI でコードにコメント / JSDoc を自動追加

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { readFileSync, writeFileSync } from "node:fs";

const minimax = createOpenAI({
  baseURL: "https://api.minimaxi.com/v1",
  apiKey: process.env.MINIMAX_API_KEY || "",
});

// コメント付きコード生成
export async function addCommentsToFile(
  filePath: string,
  options: {
    language: "zh" | "ja" | "en";
    style: "jsdoc" | "inline" | "both";
    overwrite: boolean;
  } = { language: "zh", style: "jsdoc", overwrite: false }
): Promise<string> {
  const code = readFileSync(filePath, "utf-8");

  const languageLabel = {
    zh: "中文",
    ja: "日本語",
    en: "English",
  };

  const { text } = await generateText({
    model: minimax("MiniMax-M2.5"),
    system: `你是一个代码文档专家。请为以下 TypeScript 代码添加注释。

要求:
- 语言: ${languageLabel[options.language]}
- 风格: ${options.style === "jsdoc" ? "JSDoc 格式" : options.style === "inline" ? "行内注释" : "JSDoc + 行内"}
- 为每个导出的函数/类/接口添加文档注释
- 为复杂逻辑添加行内解释
- 不要修改代码逻辑
- 保持原有格式
- 返回完整的带注释代码`,
    prompt: `文件: ${filePath}\n\n\`\`\`typescript\n${code}\n\`\`\``,
    maxTokens: 8000,
  });

  // <think> タグ除去
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // コードブロック抽出
  const codeMatch = cleaned.match(/```typescript\n([\s\S]*?)```/);
  const commentedCode = codeMatch ? codeMatch[1] : cleaned;

  if (options.overwrite) {
    writeFileSync(filePath, commentedCode, "utf-8");
  }

  return commentedCode;
}

// プロジェクト全体のドキュメント生成
export async function generateProjectDocs(
  srcDir: string
): Promise<string> {
  const { text } = await generateText({
    model: minimax("MiniMax-M2.5"),
    system: `你是一个技术文档专家。请根据项目的源代码文件列表和关键代码片段，
生成一份完整的项目技术文档（中文）。

文档应包含:
1. 项目概述
2. 架构说明
3. 技术栈
4. 目录结构说明
5. 核心模块说明
6. API 端点列表
7. 数据库模型
8. 部署说明`,
    prompt: `项目目录: ${srcDir}
这是一个 HR 简历智能筛选系统后端，使用 Elysia + Drizzle ORM + MiniMax M2.5。
请生成项目文档。`,
    maxTokens: 4000,
  });

  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return cleaned;
}
```

### Y.3 変更影響分析ツール

```typescript
// src/lib/change-impact-analyzer.ts
// Git diff から変更の影響範囲を AI で分析

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { execSync } from "node:child_process";

const minimax = createOpenAI({
  baseURL: "https://api.minimaxi.com/v1",
  apiKey: process.env.MINIMAX_API_KEY || "",
});

interface ImpactAnalysis {
  changedFiles: string[];
  impactedAreas: Array<{
    area: string;
    risk: "high" | "medium" | "low";
    reason: string;
    suggestedTests: string[];
  }>;
  breakingChanges: string[];
  migrationNeeded: boolean;
  testingRecommendation: string;
}

export async function analyzeChangeImpact(
  baseBranch: string = "main"
): Promise<ImpactAnalysis> {
  // 変更ファイル取得
  const changedFiles = execSync(
    `git diff --name-only ${baseBranch}...HEAD`,
    { encoding: "utf-8" }
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  // Diff 取得
  const diff = execSync(
    `git diff ${baseBranch}...HEAD -- '*.ts'`,
    { encoding: "utf-8" }
  );

  const { text } = await generateText({
    model: minimax("MiniMax-M2.5"),
    system: `你是一个资深的 TypeScript 后端工程师。
请分析以下代码变更的影响范围，并以 JSON 格式返回分析结果。

项目是 HR 简历筛选系统，技术栈:
- Elysia (Web 框架)
- Drizzle ORM (PostgreSQL)
- Vercel AI SDK + MiniMax M2.5
- ImapFlow (邮件接收)

请返回 JSON 格式:
{
  "impactedAreas": [
    { "area": "区域名", "risk": "high|medium|low", "reason": "原因", "suggestedTests": ["测试建议"] }
  ],
  "breakingChanges": ["破坏性变更列表"],
  "migrationNeeded": true/false,
  "testingRecommendation": "测试建议总结"
}`,
    prompt: `变更文件:\n${changedFiles.join("\n")}\n\nDiff:\n${diff.slice(0, 10000)}`,
    maxTokens: 2000,
  });

  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // JSON 抽出
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {
    impactedAreas: [],
    breakingChanges: [],
    migrationNeeded: false,
    testingRecommendation: "Unable to analyze",
  };

  return {
    changedFiles,
    ...parsed,
  };
}
```

```bash
#!/bin/bash
# scripts/analyze-impact.sh
# 変更影響分析の実行

set -euo pipefail

BASE="${1:-main}"

echo "=== Change Impact Analysis ==="
echo "Base: $BASE"
echo "Head: $(git rev-parse --short HEAD)"
echo ""

# 変更ファイル一覧
echo "Changed files:"
git diff --name-only "$BASE"...HEAD | while read -r file; do
  echo "  $file"
done
echo ""

# AI 分析実行
bun -e "
import { analyzeChangeImpact } from './src/lib/change-impact-analyzer.js';

const result = await analyzeChangeImpact('${BASE}');

console.log('Impacted Areas:');
for (const area of result.impactedAreas) {
  const emoji = area.risk === 'high' ? '🔴' : area.risk === 'medium' ? '🟡' : '🟢';
  console.log(\`  \${emoji} [\${area.risk}] \${area.area}\`);
  console.log(\`     \${area.reason}\`);
  if (area.suggestedTests.length > 0) {
    console.log(\`     Tests: \${area.suggestedTests.join(', ')}\`);
  }
}

if (result.breakingChanges.length > 0) {
  console.log('');
  console.log('⚠️  Breaking Changes:');
  for (const bc of result.breakingChanges) {
    console.log(\`  - \${bc}\`);
  }
}

console.log('');
console.log(\`Migration needed: \${result.migrationNeeded ? '✅ Yes' : '❌ No'}\`);
console.log(\`Recommendation: \${result.testingRecommendation}\`);
"
```

---

## Appendix Z: AI テスト生成 & テストカバレッジ自動化

### Z.1 AI テストケース生成

```typescript
// src/lib/ai-test-generator.ts
// AI でソースコードからテストケースを自動生成

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const minimax = createOpenAI({
  baseURL: "https://api.minimaxi.com/v1",
  apiKey: process.env.MINIMAX_API_KEY || "",
});

interface TestGenerationOptions {
  framework: "vitest";
  style: "unit" | "integration" | "both";
  language: "zh" | "ja" | "en";
  includeEdgeCases: boolean;
  includeMocks: boolean;
}

const DEFAULT_OPTIONS: TestGenerationOptions = {
  framework: "vitest",
  style: "unit",
  language: "zh",
  includeEdgeCases: true,
  includeMocks: true,
};

// テストコード生成
export async function generateTests(
  sourceFilePath: string,
  options: Partial<TestGenerationOptions> = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sourceCode = readFileSync(sourceFilePath, "utf-8");
  const fileName = basename(sourceFilePath, ".ts");

  const languageInstruction = {
    zh: "请用中文写测试描述",
    ja: "テスト説明は日本語で書いてください",
    en: "Write test descriptions in English",
  };

  const { text } = await generateText({
    model: minimax("MiniMax-M2.5"),
    system: `你是一个 TypeScript 测试专家。请为给定的源代码生成全面的测试用例。

技术栈:
- 测试框架: Vitest
- 断言: vitest 内置 (expect, toBe, toEqual, etc.)
- Mock: vi.fn(), vi.mock()
- ESM 模块 (import/export)

要求:
1. ${languageInstruction[opts.language]}
2. 每个导出的函数/类都要有测试
3. 包含正常路径和异常路径
4. ${opts.includeEdgeCases ? "包含边界条件测试" : "只测试主要路径"}
5. ${opts.includeMocks ? "Mock 外部依赖（数据库、API 等）" : "不使用 Mock"}
6. 使用 describe/it 结构组织
7. 导入路径使用 .js 扩展名（ESM）
8. 返回完整的可运行测试文件`,
    prompt: `
文件路径: ${sourceFilePath}

\`\`\`typescript
${sourceCode}
\`\`\`

请生成完整的测试文件。`,
    maxTokens: 6000,
  });

  // <think> タグ除去
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // コードブロック抽出
  const codeMatch = cleaned.match(/```typescript\n([\s\S]*?)```/);
  return codeMatch ? codeMatch[1] : cleaned;
}

// テストファイル保存
export async function generateAndSaveTests(
  sourceFilePath: string,
  options?: Partial<TestGenerationOptions>
): Promise<string> {
  const testCode = await generateTests(sourceFilePath, options);

  const dir = dirname(sourceFilePath);
  const fileName = basename(sourceFilePath, ".ts");

  // test/ ディレクトリに保存
  const testDir = dir.replace("/src/", "/test/");
  const testFilePath = join(testDir, `${fileName}.test.ts`);

  // 既存テストがある場合はスキップ
  if (existsSync(testFilePath)) {
    const backupPath = testFilePath.replace(".test.ts", ".test.ai-generated.ts");
    writeFileSync(backupPath, testCode, "utf-8");
    console.log(`Existing test found. AI-generated saved to: ${backupPath}`);
    return backupPath;
  }

  writeFileSync(testFilePath, testCode, "utf-8");
  console.log(`Test generated: ${testFilePath}`);
  return testFilePath;
}

// バッチ生成（複数ファイル）
export async function generateTestsForDirectory(
  srcDir: string,
  options?: Partial<TestGenerationOptions>
): Promise<Array<{ source: string; test: string; status: string }>> {
  const { readdirSync, statSync } = await import("node:fs");
  const results: Array<{ source: string; test: string; status: string }> = [];

  function scanDir(dir: string) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory() && entry !== "node_modules" && entry !== "test") {
        scanDir(fullPath);
      } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
        results.push({ source: fullPath, test: "", status: "pending" });
      }
    }
  }

  scanDir(srcDir);

  console.log(`Found ${results.length} source files to generate tests for`);

  for (const item of results) {
    try {
      item.test = await generateAndSaveTests(item.source, options);
      item.status = "generated";
      console.log(`✅ ${item.source}`);
    } catch (error) {
      item.status = `error: ${(error as Error).message}`;
      console.log(`❌ ${item.source}: ${(error as Error).message}`);
    }
  }

  return results;
}
```

### Z.2 テストカバレッジ分析 & 改善提案

```typescript
// src/lib/coverage-analyzer.ts
// テストカバレッジの分析と改善提案

import { readFileSync, existsSync } from "node:fs";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const minimax = createOpenAI({
  baseURL: "https://api.minimaxi.com/v1",
  apiKey: process.env.MINIMAX_API_KEY || "",
});

interface CoverageSummary {
  statements: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  lines: { total: number; covered: number; pct: number };
}

interface FileCoverage {
  path: string;
  coverage: CoverageSummary;
  uncoveredLines: number[];
}

// カバレッジレポート解析
export function parseCoverageReport(
  coverageJsonPath: string
): FileCoverage[] {
  if (!existsSync(coverageJsonPath)) {
    throw new Error(`Coverage report not found: ${coverageJsonPath}`);
  }

  const report = JSON.parse(readFileSync(coverageJsonPath, "utf-8"));
  const files: FileCoverage[] = [];

  for (const [filePath, data] of Object.entries(report)) {
    if (filePath === "total") continue;

    const fileData = data as {
      s: Record<string, number>;
      b: Record<string, number[]>;
      f: Record<string, number>;
      statementMap: Record<string, { start: { line: number } }>;
    };

    // 未カバー行の特定
    const uncoveredLines: number[] = [];
    for (const [key, count] of Object.entries(fileData.s)) {
      if (count === 0) {
        const startLine = fileData.statementMap[key]?.start?.line;
        if (startLine) uncoveredLines.push(startLine);
      }
    }

    const statements = Object.values(fileData.s);
    const branches = Object.values(fileData.b).flat();
    const functions = Object.values(fileData.f);

    files.push({
      path: filePath,
      coverage: {
        statements: {
          total: statements.length,
          covered: statements.filter((c) => c > 0).length,
          pct: statements.length > 0
            ? Math.round((statements.filter((c) => c > 0).length / statements.length) * 100)
            : 100,
        },
        branches: {
          total: branches.length,
          covered: branches.filter((c) => c > 0).length,
          pct: branches.length > 0
            ? Math.round((branches.filter((c) => c > 0).length / branches.length) * 100)
            : 100,
        },
        functions: {
          total: functions.length,
          covered: functions.filter((c) => c > 0).length,
          pct: functions.length > 0
            ? Math.round((functions.filter((c) => c > 0).length / functions.length) * 100)
            : 100,
        },
        lines: {
          total: statements.length,
          covered: statements.filter((c) => c > 0).length,
          pct: statements.length > 0
            ? Math.round((statements.filter((c) => c > 0).length / statements.length) * 100)
            : 100,
        },
      },
      uncoveredLines,
    });
  }

  // カバレッジ昇順でソート
  return files.sort((a, b) => a.coverage.lines.pct - b.coverage.lines.pct);
}

// AI によるカバレッジ改善提案
export async function suggestCoverageImprovements(
  fileCoverage: FileCoverage
): Promise<string> {
  // ソースコード読み取り
  const sourceCode = readFileSync(fileCoverage.path, "utf-8");

  const { text } = await generateText({
    model: minimax("MiniMax-M2.5"),
    system: `你是测试专家。请分析以下代码的测试覆盖情况，并建议需要添加的测试用例。
返回简洁的建议列表（中文）。`,
    prompt: `
文件: ${fileCoverage.path}
覆盖率: 语句 ${fileCoverage.coverage.statements.pct}%, 分支 ${fileCoverage.coverage.branches.pct}%, 函数 ${fileCoverage.coverage.functions.pct}%
未覆盖行: ${fileCoverage.uncoveredLines.join(", ")}

\`\`\`typescript
${sourceCode.slice(0, 5000)}
\`\`\`

请列出需要添加的测试用例（最多10个）。`,
    maxTokens: 1500,
  });

  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
```

### Z.3 テスト生成 CLI スクリプト

```bash
#!/bin/bash
# scripts/generate-tests.sh
# AI テスト生成 CLI

set -euo pipefail

COMMAND="${1:-help}"

case "$COMMAND" in
  file)
    # 単一ファイルのテスト生成
    FILE="${2:?Usage: $0 file <source-file>}"
    echo "Generating tests for: $FILE"
    bun -e "
      import { generateAndSaveTests } from './src/lib/ai-test-generator.js';
      await generateAndSaveTests('${FILE}', { language: 'zh', includeEdgeCases: true });
    "
    ;;

  dir)
    # ディレクトリ全体のテスト生成
    DIR="${2:-src}"
    echo "Generating tests for all files in: $DIR"
    bun -e "
      import { generateTestsForDirectory } from './src/lib/ai-test-generator.js';
      const results = await generateTestsForDirectory('${DIR}');
      const generated = results.filter(r => r.status === 'generated').length;
      const errors = results.filter(r => r.status.startsWith('error')).length;
      console.log(\`\\n=== Summary ===\\nGenerated: \${generated}\\nErrors: \${errors}\`);
    "
    ;;

  coverage)
    # カバレッジ分析 & 改善提案
    echo "Analyzing test coverage..."

    # まずカバレッジ取得
    bun exec vitest run --coverage --reporter=json > /dev/null 2>&1 || true

    bun -e "
      import { parseCoverageReport, suggestCoverageImprovements } from './src/lib/coverage-analyzer.js';

      const files = parseCoverageReport('coverage/coverage-final.json');

      console.log('=== Coverage Report ===');
      console.log('Files with lowest coverage:');
      for (const file of files.slice(0, 5)) {
        console.log(\`  \${file.coverage.lines.pct}% \${file.path}\`);
      }

      // 最もカバレッジの低いファイルの改善提案
      if (files.length > 0 && files[0].coverage.lines.pct < 80) {
        console.log(\`\\n=== Improvement suggestions for \${files[0].path} ===\`);
        const suggestions = await suggestCoverageImprovements(files[0]);
        console.log(suggestions);
      }
    "
    ;;

  *)
    echo "Usage: $0 {file|dir|coverage} [path]"
    echo ""
    echo "Commands:"
    echo "  file <path>    Generate tests for a single file"
    echo "  dir [path]     Generate tests for all files in directory"
    echo "  coverage       Analyze coverage and suggest improvements"
    ;;
esac
```

### Z.4 テスト品質メトリクス

```typescript
// src/lib/test-quality-metrics.ts
// テストコードの品質メトリクス

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

interface TestMetrics {
  totalTestFiles: number;
  totalTests: number;
  totalAssertions: number;
  avgAssertionsPerTest: number;
  testsByType: { unit: number; integration: number; e2e: number };
  filesWithoutTests: string[];
  testToCodeRatio: number;
  complexTests: Array<{ file: string; testCount: number; lineCount: number }>;
}

// テストディレクトリをスキャンしてメトリクス計算
export function calculateTestMetrics(
  testDir: string,
  srcDir: string
): TestMetrics {
  const testFiles: Array<{ path: string; content: string }> = [];
  const sourceFiles: string[] = [];

  // テストファイル収集
  function collectTests(dir: string) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        collectTests(fullPath);
      } else if (entry.endsWith(".test.ts") || entry.endsWith(".spec.ts")) {
        testFiles.push({
          path: fullPath,
          content: readFileSync(fullPath, "utf-8"),
        });
      }
    }
  }

  // ソースファイル収集
  function collectSources(dir: string) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory() && entry !== "node_modules") {
        collectSources(fullPath);
      } else if (
        extname(entry) === ".ts" &&
        !entry.endsWith(".test.ts") &&
        !entry.endsWith(".d.ts")
      ) {
        sourceFiles.push(fullPath);
      }
    }
  }

  collectTests(testDir);
  collectSources(srcDir);

  // メトリクス計算
  let totalTests = 0;
  let totalAssertions = 0;
  let unitTests = 0;
  let integrationTests = 0;
  let e2eTests = 0;
  const complexTests: Array<{ file: string; testCount: number; lineCount: number }> = [];

  for (const tf of testFiles) {
    const itCount = (tf.content.match(/\bit\s*\(/g) || []).length;
    const testCount = (tf.content.match(/\btest\s*\(/g) || []).length;
    const fileTestCount = itCount + testCount;
    totalTests += fileTestCount;

    // アサーション数
    const expectCount = (tf.content.match(/\bexpect\s*\(/g) || []).length;
    totalAssertions += expectCount;

    // テストタイプ分類
    if (tf.path.includes("/e2e/") || tf.path.includes("e2e.test")) {
      e2eTests += fileTestCount;
    } else if (
      tf.path.includes("/integration/") ||
      tf.content.includes("beforeAll") && tf.content.includes("db")
    ) {
      integrationTests += fileTestCount;
    } else {
      unitTests += fileTestCount;
    }

    // 複雑なテストファイル
    const lineCount = tf.content.split("\n").length;
    if (lineCount > 200 || fileTestCount > 20) {
      complexTests.push({
        file: tf.path,
        testCount: fileTestCount,
        lineCount,
      });
    }
  }

  // テスト未対応ファイル検出
  const testedFileNames = new Set(
    testFiles.map((tf) =>
      tf.path
        .replace(/\.test\.ts$/, ".ts")
        .replace(/\.spec\.ts$/, ".ts")
        .replace(/\/test\//, "/src/")
    )
  );

  const filesWithoutTests = sourceFiles.filter(
    (sf) => !testedFileNames.has(sf) && !sf.includes("index.ts") && !sf.includes("types.ts")
  );

  // テスト対コード比率
  const testLines = testFiles.reduce(
    (sum, tf) => sum + tf.content.split("\n").length,
    0
  );
  const sourceLines = sourceFiles.reduce(
    (sum, sf) => sum + readFileSync(sf, "utf-8").split("\n").length,
    0
  );

  return {
    totalTestFiles: testFiles.length,
    totalTests,
    totalAssertions,
    avgAssertionsPerTest: totalTests > 0 ? Math.round((totalAssertions / totalTests) * 10) / 10 : 0,
    testsByType: { unit: unitTests, integration: integrationTests, e2e: e2eTests },
    filesWithoutTests,
    testToCodeRatio: sourceLines > 0 ? Math.round((testLines / sourceLines) * 100) / 100 : 0,
    complexTests,
  };
}
```

---

## Appendix AA: AI プロンプトライブラリ管理・バージョニング・A/Bテスト

### AA.1 プロンプトレジストリ

```typescript
// src/services/prompt-registry.ts
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp, integer, boolean, uuid } from "drizzle-orm/pg-core";
import { createHash } from "node:crypto";

// プロンプトテーブル定義
export const prompts = pgTable("prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // 例: "resume_scorer", "skill_matcher"
  version: integer("version").notNull().default(1),
  template: text("template").notNull(), // プロンプトテンプレート
  systemPrompt: text("system_prompt"), // システムプロンプト
  variables: jsonb("variables").$type<string[]>().default([]), // テンプレート変数
  metadata: jsonb("metadata").$type<{
    author: string;
    description: string;
    tags: string[];
    model: string;
    temperature?: number;
    maxTokens?: number;
  }>(),
  hash: text("hash").notNull(), // コンテンツハッシュ
  isActive: boolean("is_active").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// プロンプト実行ログ
export const promptExecutions = pgTable("prompt_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptId: uuid("prompt_id").references(() => prompts.id),
  promptName: text("prompt_name").notNull(),
  promptVersion: integer("prompt_version").notNull(),
  input: jsonb("input"), // 入力変数
  output: jsonb("output"), // LLM出力
  latencyMs: integer("latency_ms"),
  tokenUsage: jsonb("token_usage").$type<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>(),
  success: boolean("success").notNull(),
  error: text("error"),
  feedback: jsonb("feedback").$type<{
    rating?: number; // 1-5
    correct?: boolean;
    comment?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export class PromptRegistry {
  // プロンプト登録（バージョン自動インクリメント）
  async register(
    name: string,
    template: string,
    options: {
      systemPrompt?: string;
      variables?: string[];
      metadata?: typeof prompts.$inferInsert["metadata"];
      activate?: boolean;
    } = {}
  ): Promise<typeof prompts.$inferSelect> {
    const hash = createHash("sha256")
      .update(template + (options.systemPrompt ?? ""))
      .digest("hex")
      .substring(0, 16);

    // 同じハッシュが存在するか確認
    const existing = await db
      .select()
      .from(prompts)
      .where(sql`name = ${name} AND hash = ${hash}`)
      .limit(1);

    if (existing.length > 0) {
      return existing[0]; // 同一内容は重複登録しない
    }

    // 最新バージョン番号取得
    const [latest] = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(version), 0)` })
      .from(prompts)
      .where(sql`name = ${name}`);

    const newVersion = (latest?.maxVersion ?? 0) + 1;

    // テンプレート変数の自動検出
    const detectedVars = [
      ...new Set(
        (template.match(/\{\{(\w+)\}\}/g) ?? []).map((v) =>
          v.replace(/\{\{|\}\}/g, "")
        )
      ),
    ];

    const [inserted] = await db
      .insert(prompts)
      .values({
        name,
        version: newVersion,
        template,
        systemPrompt: options.systemPrompt,
        variables: options.variables ?? detectedVars,
        metadata: options.metadata,
        hash,
        isActive: options.activate ?? false,
      })
      .returning();

    // 自動アクティベート
    if (options.activate) {
      await this.activate(name, newVersion);
    }

    return inserted;
  }

  // プロンプトアクティベート（同名の他バージョンを非アクティブ化）
  async activate(name: string, version: number): Promise<void> {
    await db.transaction(async (tx) => {
      // 全バージョン非アクティブ化
      await tx
        .update(prompts)
        .set({ isActive: false, updatedAt: new Date() })
        .where(sql`name = ${name}`);

      // 指定バージョンをアクティブ化
      await tx
        .update(prompts)
        .set({ isActive: true, updatedAt: new Date() })
        .where(sql`name = ${name} AND version = ${version}`);
    });
  }

  // アクティブなプロンプト取得
  async getActive(name: string): Promise<typeof prompts.$inferSelect | null> {
    const [result] = await db
      .select()
      .from(prompts)
      .where(sql`name = ${name} AND is_active = true`)
      .limit(1);

    return result ?? null;
  }

  // 特定バージョン取得
  async getVersion(
    name: string,
    version: number
  ): Promise<typeof prompts.$inferSelect | null> {
    const [result] = await db
      .select()
      .from(prompts)
      .where(sql`name = ${name} AND version = ${version}`)
      .limit(1);

    return result ?? null;
  }

  // バージョン一覧
  async listVersions(name: string): Promise<Array<{
    version: number;
    isActive: boolean;
    hash: string;
    createdAt: Date | null;
    metadata: typeof prompts.$inferSelect["metadata"];
  }>> {
    return db
      .select({
        version: prompts.version,
        isActive: prompts.isActive,
        hash: prompts.hash,
        createdAt: prompts.createdAt,
        metadata: prompts.metadata,
      })
      .from(prompts)
      .where(sql`name = ${name} AND is_archived = false`)
      .orderBy(sql`version DESC`);
  }

  // テンプレート変数展開
  renderTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, "g"),
        value
      );
    }

    // 未展開の変数チェック
    const unresolved = rendered.match(/\{\{(\w+)\}\}/g);
    if (unresolved) {
      throw new Error(
        `Unresolved template variables: ${unresolved.join(", ")}`
      );
    }

    return rendered;
  }

  // プロンプト実行ログ記録
  async logExecution(
    promptId: string,
    promptName: string,
    promptVersion: number,
    data: {
      input: Record<string, unknown>;
      output: unknown;
      latencyMs: number;
      tokenUsage?: typeof promptExecutions.$inferInsert["tokenUsage"];
      success: boolean;
      error?: string;
    }
  ): Promise<void> {
    await db.insert(promptExecutions).values({
      promptId,
      promptName,
      promptVersion,
      ...data,
    });
  }

  // プロンプト比較（diff）
  async compareVersions(
    name: string,
    versionA: number,
    versionB: number
  ): Promise<{
    templateDiff: { added: string[]; removed: string[] };
    systemPromptDiff: { added: string[]; removed: string[] };
  }> {
    const [a, b] = await Promise.all([
      this.getVersion(name, versionA),
      this.getVersion(name, versionB),
    ]);

    if (!a || !b) {
      throw new Error("One or both versions not found");
    }

    return {
      templateDiff: computeLineDiff(a.template, b.template),
      systemPromptDiff: computeLineDiff(
        a.systemPrompt ?? "",
        b.systemPrompt ?? ""
      ),
    };
  }

  // プロンプトパフォーマンス統計
  async getPerformanceStats(
    name: string,
    version?: number,
    days: number = 30
  ): Promise<{
    totalExecutions: number;
    successRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    avgTokens: number;
    avgRating: number | null;
    correctRate: number | null;
  }> {
    const versionFilter = version
      ? sql`AND prompt_version = ${version}`
      : sql``;

    const [stats] = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE success = true) as successes,
        AVG(latency_ms)::integer as avg_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::integer as p95_latency,
        AVG((token_usage->>'totalTokens')::integer)::integer as avg_tokens,
        AVG((feedback->>'rating')::numeric) as avg_rating,
        COUNT(*) FILTER (WHERE (feedback->>'correct')::boolean = true)::float /
          NULLIF(COUNT(*) FILTER (WHERE feedback->>'correct' IS NOT NULL), 0) as correct_rate
      FROM prompt_executions
      WHERE prompt_name = ${name}
        ${versionFilter}
        AND created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
    `).then((r) => r.rows);

    return {
      totalExecutions: Number(stats.total),
      successRate: Number(stats.total) > 0
        ? Number(stats.successes) / Number(stats.total)
        : 0,
      avgLatencyMs: Number(stats.avg_latency ?? 0),
      p95LatencyMs: Number(stats.p95_latency ?? 0),
      avgTokens: Number(stats.avg_tokens ?? 0),
      avgRating: stats.avg_rating ? Number(stats.avg_rating) : null,
      correctRate: stats.correct_rate ? Number(stats.correct_rate) : null,
    };
  }
}

function computeLineDiff(
  textA: string,
  textB: string
): { added: string[]; removed: string[] } {
  const linesA = new Set(textA.split("\n"));
  const linesB = new Set(textB.split("\n"));

  const added = [...linesB].filter((l) => !linesA.has(l));
  const removed = [...linesA].filter((l) => !linesB.has(l));

  return { added, removed };
}
```

### AA.2 HR専用プロンプトライブラリ

```typescript
// src/prompts/library.ts
import { PromptRegistry } from "../services/prompt-registry.js";

const registry = new PromptRegistry();

// === 履歴書スコアリングプロンプト ===

export async function registerCorePrompts(): Promise<void> {
  // v1: 基本スコアリング
  await registry.register("resume_scorer", `
あなたは経験豊富な人事採用担当者です。以下の求人要件と候補者の履歴書を比較し、適合度をスコアリングしてください。

## 求人要件
{{job_requirements}}

## 必須スキル
{{must_have_skills}}

## 歓迎スキル
{{nice_to_have_skills}}

## 不採用条件
{{reject_criteria}}

## 候補者の履歴書
{{resume_text}}

## スコアリング指示
1. 必須スキルの合致度（0-50点）: 各必須スキルの有無を確認
2. 歓迎スキルの合致度（0-30点）: 各歓迎スキルの有無を確認
3. 不採用条件チェック（-20〜0点）: 該当する場合は減点
4. 総合評価（0-20点）: 経験年数、学歴、プロジェクト経験を総合評価

以下のJSON形式で出力してください:
{
  "totalScore": number,
  "mustHaveScore": number,
  "niceToHaveScore": number,
  "rejectPenalty": number,
  "overallScore": number,
  "matchedSkills": string[],
  "missingSkills": string[],
  "grade": "A" | "B" | "C" | "D" | "F",
  "explanation": "string（200文字以内の日本語/中国語）",
  "highlights": string[],
  "concerns": string[]
}
  `.trim(), {
    systemPrompt: "你是一个专业的HR招聘助手，擅长简历筛选和人才评估。请用中文回答。",
    metadata: {
      author: "system",
      description: "Core resume scoring prompt",
      tags: ["scoring", "resume", "core"],
      model: "MiniMax-M2.5",
      temperature: 0.1,
      maxTokens: 2000,
    },
    activate: true,
  });

  // v2: 構造化出力強化版
  await registry.register("resume_scorer", `
# 角色
你是一位拥有15年经验的资深HR招聘专家，专注于技术岗位招聘。

# 任务
分析候选人简历与职位要求的匹配度，输出结构化评分报告。

# 职位信息
- 职位名称: {{position_title}}
- 部门: {{department}}
- 工作地点: {{location}}

# 职位要求
{{job_requirements}}

# 技能要求
## 必须具备 (Must-have)
{{must_have_skills}}

## 加分项 (Nice-to-have)
{{nice_to_have_skills}}

## 不符合条件 (Reject if)
{{reject_criteria}}

# 候选人简历
{{resume_text}}

# 评分规则
| 维度 | 分值范围 | 说明 |
|------|----------|------|
| 必须技能 | 0-50 | 每个必须技能10分，部分匹配5分 |
| 加分技能 | 0-30 | 每个加分技能5分 |
| 拒绝条件 | -20~0 | 每个拒绝条件-10分 |
| 综合评价 | 0-20 | 经验年限、教育背景、项目质量 |

## 等级标准
- A (≥85): 强烈推荐面试
- B (70-84): 推荐面试
- C (55-69): 可考虑
- D (40-54): 不太推荐
- F (<40): 不推荐

# 输出格式（严格JSON）
{
  "totalScore": number,
  "breakdown": {
    "mustHaveScore": number,
    "niceToHaveScore": number,
    "rejectPenalty": number,
    "overallScore": number
  },
  "skills": {
    "matched": [{"skill": "string", "level": "expert|intermediate|beginner", "evidence": "string"}],
    "missing": [{"skill": "string", "importance": "must|nice"}],
    "extra": [{"skill": "string", "relevance": "high|medium|low"}]
  },
  "grade": "A|B|C|D|F",
  "recommendation": "string（50字以内）",
  "explanation": "string（200字以内详细分析）",
  "highlights": ["string"],
  "concerns": ["string"],
  "suggestedQuestions": ["string（面试建议问题）"]
}
  `.trim(), {
    systemPrompt: "你是一个专业严谨的HR招聘AI助手。只输出JSON格式，不要添加任何额外文字。确保JSON格式正确。",
    metadata: {
      author: "system",
      description: "Enhanced structured scoring prompt v2",
      tags: ["scoring", "resume", "structured", "v2"],
      model: "MiniMax-M2.5",
      temperature: 0.05,
      maxTokens: 3000,
    },
  });

  // === スキルマッチングプロンプト ===
  await registry.register("skill_matcher", `
# 任务
分析候选人简历中提到的技能，与职位要求进行语义匹配。

# 职位要求技能
{{required_skills}}

# 候选人简历
{{resume_text}}

# 匹配规则
1. 精确匹配：简历中明确提到该技能
2. 语义匹配：简历中提到同义词或相关技术（如 "React" 匹配 "React.js"）
3. 推断匹配：从项目经验可推断具备该技能
4. 不匹配：无法从简历中找到相关信息

# 输出格式
{
  "matches": [
    {
      "requiredSkill": "string",
      "matchType": "exact|semantic|inferred|none",
      "evidence": "string（简历中的相关内容）",
      "confidence": number (0-1),
      "yearsOfExperience": number | null
    }
  ],
  "additionalSkills": ["string"],
  "overallMatchRate": number (0-1)
}
  `.trim(), {
    systemPrompt: "你是一个技能匹配专家。准确分析技能匹配度，不要过度推断。",
    metadata: {
      author: "system",
      description: "Skill matching prompt with semantic analysis",
      tags: ["skills", "matching", "semantic"],
      model: "MiniMax-M2.5",
      temperature: 0.1,
      maxTokens: 2000,
    },
    activate: true,
  });

  // === 履歴書要約プロンプト ===
  await registry.register("resume_summarizer", `
# 任务
将候选人简历提取为结构化信息摘要。

# 候选人简历原文
{{resume_text}}

# 提取要求
请从简历中提取以下信息，如果无法确定请标记为 null。

# 输出格式
{
  "personalInfo": {
    "name": "string | null",
    "email": "string | null",
    "phone": "string | null",
    "location": "string | null",
    "birthYear": number | null,
    "gender": "string | null"
  },
  "education": [
    {
      "school": "string",
      "degree": "本科|硕士|博士|专科|高中",
      "major": "string",
      "startYear": number,
      "endYear": number | null,
      "is211": boolean,
      "is985": boolean
    }
  ],
  "workExperience": [
    {
      "company": "string",
      "title": "string",
      "startDate": "string",
      "endDate": "string | 至今",
      "description": "string（100字以内）",
      "technologies": ["string"]
    }
  ],
  "skills": {
    "programming": ["string"],
    "frameworks": ["string"],
    "databases": ["string"],
    "tools": ["string"],
    "languages": ["string"],
    "soft": ["string"]
  },
  "certifications": ["string"],
  "totalYearsOfExperience": number,
  "currentSalary": "string | null",
  "expectedSalary": "string | null",
  "noticePeriod": "string | null"
}
  `.trim(), {
    systemPrompt: "你是一个简历解析专家。准确提取信息，不要编造不存在的内容。对于211/985大学的判断要准确。",
    metadata: {
      author: "system",
      description: "Resume information extraction and summarization",
      tags: ["resume", "extraction", "summarization"],
      model: "MiniMax-M2.5",
      temperature: 0.0,
      maxTokens: 3000,
    },
    activate: true,
  });

  // === JD生成プロンプト ===
  await registry.register("jd_generator", `
# 任务
根据以下信息生成一份专业的职位描述（JD）。

# 职位基本信息
- 职位名称: {{position_title}}
- 部门: {{department}}
- 工作地点: {{location}}
- 工作性质: {{employment_type}}
- 经验要求: {{experience_requirement}}

# 关键职责
{{key_responsibilities}}

# 技术栈/技能要求
{{tech_stack}}

# 公司简介
{{company_intro}}

# 输出要求
生成一份包含以下部分的中文JD:
1. 职位概述（2-3句话）
2. 工作职责（5-8条）
3. 任职要求
   - 必须条件（3-5条）
   - 加分条件（2-4条）
4. 薪资福利（如有）
5. 面试流程简述

语言风格：专业但亲和，吸引优秀候选人。
  `.trim(), {
    systemPrompt: "你是一个专业的HR内容撰写专家，擅长撰写吸引人才的职位描述。",
    metadata: {
      author: "system",
      description: "Job description generator",
      tags: ["jd", "generation", "content"],
      model: "MiniMax-M2.5",
      temperature: 0.7,
      maxTokens: 2000,
    },
    activate: true,
  });

  console.log("Core prompts registered successfully");
}
```

### AA.3 プロンプトA/Bテストフレームワーク

```typescript
// src/services/prompt-ab-test.ts
import { PromptRegistry } from "./prompt-registry.js";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp, integer, uuid, numeric } from "drizzle-orm/pg-core";

// A/Bテスト定義テーブル
export const promptABTests = pgTable("prompt_ab_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  promptName: text("prompt_name").notNull(),
  controlVersion: integer("control_version").notNull(),
  treatmentVersion: integer("treatment_version").notNull(),
  trafficSplit: numeric("traffic_split").notNull().default("0.5"), // treatment 割合
  status: text("status").notNull().default("draft"), // draft, running, completed, cancelled
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  minSampleSize: integer("min_sample_size").notNull().default(100),
  results: jsonb("results").$type<{
    control: ABTestMetrics;
    treatment: ABTestMetrics;
    winner?: "control" | "treatment" | "tie";
    pValue?: number;
    confidenceLevel?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
});

interface ABTestMetrics {
  count: number;
  avgScore: number;
  avgLatency: number;
  successRate: number;
  avgRating: number | null;
  correctRate: number | null;
}

export class PromptABTestRunner {
  private registry: PromptRegistry;

  constructor() {
    this.registry = new PromptRegistry();
  }

  // A/Bテスト作成
  async createTest(config: {
    name: string;
    promptName: string;
    controlVersion: number;
    treatmentVersion: number;
    trafficSplit?: number;
    minSampleSize?: number;
  }): Promise<typeof promptABTests.$inferSelect> {
    // バージョン存在確認
    const [control, treatment] = await Promise.all([
      this.registry.getVersion(config.promptName, config.controlVersion),
      this.registry.getVersion(config.promptName, config.treatmentVersion),
    ]);

    if (!control || !treatment) {
      throw new Error("Control or treatment version not found");
    }

    const [test] = await db
      .insert(promptABTests)
      .values({
        name: config.name,
        promptName: config.promptName,
        controlVersion: config.controlVersion,
        treatmentVersion: config.treatmentVersion,
        trafficSplit: (config.trafficSplit ?? 0.5).toString(),
        minSampleSize: config.minSampleSize ?? 100,
        status: "draft",
      })
      .returning();

    return test;
  }

  // テスト開始
  async startTest(testId: string): Promise<void> {
    await db
      .update(promptABTests)
      .set({ status: "running", startedAt: new Date() })
      .where(sql`id = ${testId}`);
  }

  // トラフィック振り分け（どのバージョンを使うか決定）
  async getVariant(testName: string): Promise<{
    version: number;
    variant: "control" | "treatment";
  } | null> {
    const [test] = await db
      .select()
      .from(promptABTests)
      .where(sql`name = ${testName} AND status = 'running'`)
      .limit(1);

    if (!test) return null;

    const split = parseFloat(test.trafficSplit as string);
    const variant = Math.random() < split ? "treatment" : "control";
    const version =
      variant === "control" ? test.controlVersion : test.treatmentVersion;

    return { version, variant };
  }

  // テスト結果集計
  async analyzeResults(testId: string): Promise<{
    control: ABTestMetrics;
    treatment: ABTestMetrics;
    winner: "control" | "treatment" | "tie";
    pValue: number;
    isSignificant: boolean;
    recommendation: string;
  }> {
    const [test] = await db
      .select()
      .from(promptABTests)
      .where(sql`id = ${testId}`)
      .limit(1);

    if (!test) throw new Error("Test not found");

    // 各バリアントのメトリクス取得
    const [controlStats, treatmentStats] = await Promise.all([
      this.registry.getPerformanceStats(
        test.promptName,
        test.controlVersion
      ),
      this.registry.getPerformanceStats(
        test.promptName,
        test.treatmentVersion
      ),
    ]);

    const control: ABTestMetrics = {
      count: controlStats.totalExecutions,
      avgScore: 0, // スコア平均は別途計算
      avgLatency: controlStats.avgLatencyMs,
      successRate: controlStats.successRate,
      avgRating: controlStats.avgRating,
      correctRate: controlStats.correctRate,
    };

    const treatment: ABTestMetrics = {
      count: treatmentStats.totalExecutions,
      avgScore: 0,
      avgLatency: treatmentStats.avgLatencyMs,
      successRate: treatmentStats.successRate,
      avgRating: treatmentStats.avgRating,
      correctRate: treatmentStats.correctRate,
    };

    // Z検定（二項検定近似）
    const pValue = calculateZTestPValue(
      control.successRate,
      treatment.successRate,
      control.count,
      treatment.count
    );

    const isSignificant = pValue < 0.05;
    let winner: "control" | "treatment" | "tie" = "tie";

    if (isSignificant) {
      winner =
        treatment.successRate > control.successRate ? "treatment" : "control";
    }

    // 結果保存
    await db
      .update(promptABTests)
      .set({
        results: {
          control,
          treatment,
          winner,
          pValue,
          confidenceLevel: 1 - pValue,
        },
      })
      .where(sql`id = ${testId}`);

    const recommendation = isSignificant
      ? winner === "treatment"
        ? `Treatment (v${test.treatmentVersion}) が統計的に有意に優れています。本番適用を推奨します。`
        : `Control (v${test.controlVersion}) が引き続き優れています。Treatment は採用しないでください。`
      : `統計的に有意な差はありません (p=${pValue.toFixed(4)})。サンプルサイズを増やすか、テストを続行してください。`;

    return {
      control,
      treatment,
      winner,
      pValue,
      isSignificant,
      recommendation,
    };
  }

  // テスト完了（勝者をアクティブ化）
  async completeTest(
    testId: string,
    activateWinner: boolean = true
  ): Promise<void> {
    const [test] = await db
      .select()
      .from(promptABTests)
      .where(sql`id = ${testId}`)
      .limit(1);

    if (!test || !test.results) {
      throw new Error("Test not found or no results");
    }

    if (activateWinner && test.results.winner && test.results.winner !== "tie") {
      const winnerVersion =
        test.results.winner === "treatment"
          ? test.treatmentVersion
          : test.controlVersion;

      await this.registry.activate(test.promptName, winnerVersion);
    }

    await db
      .update(promptABTests)
      .set({ status: "completed", completedAt: new Date() })
      .where(sql`id = ${testId}`);
  }
}

// 統計検定ユーティリティ
function calculateZTestPValue(
  p1: number,
  p2: number,
  n1: number,
  n2: number
): number {
  if (n1 === 0 || n2 === 0) return 1;

  const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));

  if (se === 0) return 1;

  const z = Math.abs(p1 - p2) / se;

  // 標準正規分布の近似CDF
  const pValue = 2 * (1 - normalCDF(z));
  return Math.min(1, Math.max(0, pValue));
}

function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * z);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1.0 + sign * y);
}
```

### AA.4 プロンプト管理API

```typescript
// src/routes/prompts.ts
import { Elysia } from "elysia";
import { PromptRegistry } from "../services/prompt-registry.js";
import { PromptABTestRunner } from "../services/prompt-ab-test.js";
import { z } from "zod/v4";

const app = new Elysia();
const registry = new PromptRegistry();
const abTestRunner = new PromptABTestRunner();

// プロンプト登録
app.post("/", async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    name: z.string().min(1),
    template: z.string().min(10),
    systemPrompt: z.string().optional(),
    variables: z.array(z.string()).optional(),
    metadata: z.object({
      author: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
      model: z.string(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().positive().optional(),
    }).optional(),
    activate: z.boolean().optional(),
  });

  const parsed = schema.parse(body);
  const prompt = await registry.register(parsed.name, parsed.template, {
    systemPrompt: parsed.systemPrompt,
    variables: parsed.variables,
    metadata: parsed.metadata,
    activate: parsed.activate,
  });

  return c.json({ prompt }, 201);
});

// アクティブなプロンプト取得
app.get("/:name/active", async (c) => {
  const name = c.req.param("name");
  const prompt = await registry.getActive(name);
  if (!prompt) return c.json({ error: "Not found" }, 404);
  return c.json({ prompt });
});

// バージョン一覧
app.get("/:name/versions", async (c) => {
  const name = c.req.param("name");
  const versions = await registry.listVersions(name);
  return c.json({ versions });
});

// バージョン比較
app.get("/:name/compare", async (c) => {
  const name = c.req.param("name");
  const vA = parseInt(c.req.query("a") ?? "1");
  const vB = parseInt(c.req.query("b") ?? "2");
  const diff = await registry.compareVersions(name, vA, vB);
  return c.json({ diff });
});

// バージョンアクティベート
app.post("/:name/activate/:version", async (c) => {
  const name = c.req.param("name");
  const version = parseInt(c.req.param("version"));
  await registry.activate(name, version);
  return c.json({ activated: true, name, version });
});

// パフォーマンス統計
app.get("/:name/stats", async (c) => {
  const name = c.req.param("name");
  const version = c.req.query("version")
    ? parseInt(c.req.query("version")!)
    : undefined;
  const days = parseInt(c.req.query("days") ?? "30");
  const stats = await registry.getPerformanceStats(name, version, days);
  return c.json({ stats });
});

// --- A/Bテスト ---

// テスト作成
app.post("/ab-tests", async (c) => {
  const body = await c.req.json();
  const test = await abTestRunner.createTest(body);
  return c.json({ test }, 201);
});

// テスト開始
app.post("/ab-tests/:id/start", async (c) => {
  await abTestRunner.startTest(c.req.param("id"));
  return c.json({ started: true });
});

// テスト結果分析
app.get("/ab-tests/:id/results", async (c) => {
  const results = await abTestRunner.analyzeResults(c.req.param("id"));
  return c.json({ results });
});

// テスト完了
app.post("/ab-tests/:id/complete", async (c) => {
  const { activateWinner } = await c.req.json<{ activateWinner?: boolean }>();
  await abTestRunner.completeTest(c.req.param("id"), activateWinner ?? true);
  return c.json({ completed: true });
});

export default app;
```

### AA.5 プロンプトテスト・品質保証

```typescript
// test/prompt-registry.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { PromptRegistry } from "../src/services/prompt-registry.js";

describe("PromptRegistry", () => {
  const registry = new PromptRegistry();

  it("should register a new prompt with auto-detected variables", async () => {
    const prompt = await registry.register(
      "test_prompt",
      "Hello {{name}}, your score is {{score}}",
      {
        metadata: {
          author: "test",
          description: "Test prompt",
          tags: ["test"],
          model: "MiniMax-M2.5",
        },
      }
    );

    expect(prompt.name).toBe("test_prompt");
    expect(prompt.version).toBe(1);
    expect(prompt.variables).toContain("name");
    expect(prompt.variables).toContain("score");
  });

  it("should auto-increment version on same name", async () => {
    const v1 = await registry.register("versioned_prompt", "Template v1");
    const v2 = await registry.register("versioned_prompt", "Template v2");

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
  });

  it("should not duplicate identical content", async () => {
    const a = await registry.register("dedup_prompt", "Same template");
    const b = await registry.register("dedup_prompt", "Same template");

    expect(a.id).toBe(b.id); // 同一レコード
  });

  it("should render template correctly", () => {
    const rendered = registry.renderTemplate(
      "Hello {{name}}, score: {{score}}",
      { name: "张三", score: "85" }
    );

    expect(rendered).toBe("Hello 张三, score: 85");
  });

  it("should throw on unresolved variables", () => {
    expect(() =>
      registry.renderTemplate("Hello {{name}}, {{missing}}", { name: "张三" })
    ).toThrow("Unresolved template variables: {{missing}}");
  });

  it("should activate specific version", async () => {
    await registry.register("activate_test", "v1", { activate: true });
    await registry.register("activate_test", "v2");

    // v1 がアクティブ
    let active = await registry.getActive("activate_test");
    expect(active?.version).toBe(1);

    // v2 をアクティブ化
    await registry.activate("activate_test", 2);
    active = await registry.getActive("activate_test");
    expect(active?.version).toBe(2);
  });

  it("should compare versions", async () => {
    await registry.register("compare_test", "Line 1\nLine 2\nLine 3");
    await registry.register("compare_test", "Line 1\nLine 2 modified\nLine 4");

    const diff = await registry.compareVersions("compare_test", 1, 2);

    expect(diff.templateDiff.added).toContain("Line 2 modified");
    expect(diff.templateDiff.added).toContain("Line 4");
    expect(diff.templateDiff.removed).toContain("Line 2");
    expect(diff.templateDiff.removed).toContain("Line 3");
  });
});

// プロンプト品質チェックリスト
describe("Prompt Quality Checks", () => {
  const registry = new PromptRegistry();

  it("should have all core prompts registered", async () => {
    const corePrompts = [
      "resume_scorer",
      "skill_matcher",
      "resume_summarizer",
      "jd_generator",
    ];

    for (const name of corePrompts) {
      const active = await registry.getActive(name);
      expect(active, `Missing active prompt: ${name}`).not.toBeNull();
    }
  });

  it("should have valid JSON output format in templates", async () => {
    const active = await registry.getActive("resume_scorer");
    expect(active).not.toBeNull();

    // テンプレートにJSON出力指示が含まれるか
    expect(active!.template).toContain("totalScore");
    expect(active!.template).toContain("grade");
  });

  it("should have reasonable token limits", async () => {
    const prompts = ["resume_scorer", "skill_matcher", "resume_summarizer"];

    for (const name of prompts) {
      const active = await registry.getActive(name);
      if (active?.metadata) {
        const maxTokens = active.metadata.maxTokens ?? 0;
        expect(maxTokens).toBeGreaterThan(0);
        expect(maxTokens).toBeLessThanOrEqual(8000);
      }
    }
  });

  it("should have low temperature for scoring prompts", async () => {
    const scoringPrompts = ["resume_scorer", "skill_matcher"];

    for (const name of scoringPrompts) {
      const active = await registry.getActive(name);
      if (active?.metadata?.temperature !== undefined) {
        expect(active.metadata.temperature).toBeLessThanOrEqual(0.3);
      }
    }
  });
});
```

---

## Appendix AB: AI デバッグアシスタント・エラー自動分析

### AB.1 エラー自動分析エンジン

```typescript
// src/services/ai-error-analyzer.ts
import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod/v4";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp, uuid, integer } from "drizzle-orm/pg-core";

// エラーログテーブル
export const errorLogs = pgTable("error_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  errorType: text("error_type").notNull(), // "runtime" | "api" | "database" | "ai" | "email"
  message: text("message").notNull(),
  stack: text("stack"),
  context: jsonb("context").$type<Record<string, unknown>>(),
  analysis: jsonb("analysis").$type<{
    category: string;
    severity: "critical" | "high" | "medium" | "low";
    rootCause: string;
    suggestedFix: string;
    relatedErrors: string[];
    autoFixable: boolean;
  }>(),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  firstSeenAt: timestamp("first_seen_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

const minimax = createOpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: "https://api.minimaxi.com/v1",
});

export class AIErrorAnalyzer {
  // エラー記録＆AI分析
  async analyzeAndRecord(
    error: Error,
    context?: Record<string, unknown>
  ): Promise<typeof errorLogs.$inferSelect> {
    // 既存の同一エラーチェック（メッセージベースの重複排除）
    const fingerprint = this.computeFingerprint(error);
    const [existing] = await db
      .select()
      .from(errorLogs)
      .where(sql`message = ${error.message} AND error_type = ${this.classifyErrorType(error)}`)
      .limit(1);

    if (existing) {
      // 既存エラーのカウント更新
      await db
        .update(errorLogs)
        .set({
          occurrenceCount: sql`occurrence_count + 1`,
          lastSeenAt: new Date(),
          context: context ?? existing.context,
        })
        .where(sql`id = ${existing.id}`);

      return { ...existing, occurrenceCount: (existing.occurrenceCount ?? 0) + 1 };
    }

    // AI によるエラー分析
    const analysis = await this.performAIAnalysis(error, context);

    // エラーログ記録
    const [record] = await db
      .insert(errorLogs)
      .values({
        errorType: this.classifyErrorType(error),
        message: error.message,
        stack: error.stack,
        context,
        analysis,
      })
      .returning();

    // 重大度が critical/high の場合は通知
    if (analysis.severity === "critical" || analysis.severity === "high") {
      console.error(`[ALERT] ${analysis.severity.toUpperCase()}: ${error.message}`);
      console.error(`Root cause: ${analysis.rootCause}`);
      console.error(`Suggested fix: ${analysis.suggestedFix}`);
    }

    return record;
  }

  // AI エラー分析
  private async performAIAnalysis(
    error: Error,
    context?: Record<string, unknown>
  ): Promise<NonNullable<typeof errorLogs.$inferInsert["analysis"]>> {
    try {
      const { object } = await generateObject({
        model: minimax("MiniMax-M2.5"),
        schema: z.object({
          category: z.enum([
            "database_connection",
            "database_query",
            "api_timeout",
            "api_auth",
            "api_validation",
            "ai_model_error",
            "ai_rate_limit",
            "email_connection",
            "email_parse",
            "file_system",
            "memory",
            "configuration",
            "unknown",
          ]),
          severity: z.enum(["critical", "high", "medium", "low"]),
          rootCause: z.string().max(500),
          suggestedFix: z.string().max(500),
          relatedErrors: z.array(z.string()),
          autoFixable: z.boolean(),
        }),
        system: "你是一个专业的后端错误分析专家。分析错误信息并提供诊断和修复建议。",
        prompt: `分析以下错误：

错误类型: ${error.name}
错误消息: ${error.message}
堆栈跟踪: ${error.stack?.substring(0, 1000) ?? "N/A"}
上下文: ${JSON.stringify(context ?? {}, null, 2).substring(0, 500)}

请分析：
1. 错误类别
2. 严重程度
3. 根本原因
4. 建议修复方案
5. 是否可以自动修复`,
        temperature: 0.1,
      });

      return object;
    } catch {
      // AI分析失敗時のフォールバック
      return {
        category: "unknown",
        severity: "medium",
        rootCause: error.message,
        suggestedFix: "Manual investigation required",
        relatedErrors: [],
        autoFixable: false,
      };
    }
  }

  // エラータイプ自動分類
  private classifyErrorType(error: Error): string {
    const msg = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (msg.includes("econnrefused") || msg.includes("connection")) return "database";
    if (msg.includes("timeout")) return "api";
    if (msg.includes("rate limit") || msg.includes("429")) return "ai";
    if (msg.includes("imap") || msg.includes("smtp")) return "email";
    if (msg.includes("enoent") || msg.includes("permission")) return "runtime";
    if (name.includes("syntaxerror") || name.includes("typeerror")) return "runtime";

    return "runtime";
  }

  // エラーフィンガープリント（重複排除用）
  private computeFingerprint(error: Error): string {
    const { createHash } = require("node:crypto");
    const stackLines = (error.stack ?? "").split("\n").slice(0, 5).join("\n");
    return createHash("md5")
      .update(`${error.name}:${error.message}:${stackLines}`)
      .digest("hex");
  }

  // エラートレンド分析
  async analyzeTrends(days: number = 7): Promise<{
    totalErrors: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    trending: Array<{ message: string; count: number; trend: "up" | "down" | "stable" }>;
    recommendations: string[];
  }> {
    const [stats] = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        json_object_agg(
          error_type, type_count
        ) as by_category
      FROM (
        SELECT error_type, COUNT(*) as type_count
        FROM error_logs
        WHERE created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
        GROUP BY error_type
      ) sub
    `).then((r) => r.rows);

    const trending = await db.execute(sql`
      SELECT message, SUM(occurrence_count) as total_count
      FROM error_logs
      WHERE created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
      GROUP BY message
      ORDER BY total_count DESC
      LIMIT 10
    `);

    // AI によるトレンド分析と推奨
    const { text: recommendations } = await generateText({
      model: minimax("MiniMax-M2.5"),
      system: "你是一个运维专家。分析错误趋势并给出改善建议。",
      prompt: `过去 ${days} 天的错误统计：
总错误数: ${stats.total}
按类型: ${JSON.stringify(stats.by_category)}
高频错误: ${trending.rows.map((r) => `${r.message} (${r.total_count}次)`).join("\n")}

请给出 3-5 条具体的改善建议。`,
      temperature: 0.3,
      maxTokens: 500,
    });

    return {
      totalErrors: Number(stats.total),
      byCategory: (stats.by_category as Record<string, number>) ?? {},
      bySeverity: {},
      trending: trending.rows.map((r) => ({
        message: r.message as string,
        count: Number(r.total_count),
        trend: "stable" as const,
      })),
      recommendations: recommendations
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim()
        .split("\n")
        .filter((l) => l.trim()),
    };
  }

  // 自動修復（可能な場合）
  async attemptAutoFix(errorId: string): Promise<{
    fixed: boolean;
    action: string;
  }> {
    const [error] = await db
      .select()
      .from(errorLogs)
      .where(sql`id = ${errorId}`)
      .limit(1);

    if (!error || !error.analysis?.autoFixable) {
      return { fixed: false, action: "Error not auto-fixable" };
    }

    let fixed = false;
    let action = "";

    switch (error.analysis.category) {
      case "database_connection":
        // DB接続プールリセット
        action = "Reset database connection pool";
        // 実際のリセットロジック
        fixed = true;
        break;

      case "ai_rate_limit":
        // レート制限 — 待機
        action = "Queued for retry after rate limit window";
        fixed = true;
        break;

      case "email_connection":
        // IMAP再接続
        action = "Reconnecting IMAP client";
        fixed = true;
        break;

      default:
        action = "No auto-fix available for this category";
        break;
    }

    if (fixed) {
      await db
        .update(errorLogs)
        .set({
          resolution: `Auto-fixed: ${action}`,
          resolvedAt: new Date(),
        })
        .where(sql`id = ${errorId}`);
    }

    return { fixed, action };
  }
}
```

### AB.2 エラー分析ミドルウェア

```typescript
// src/middleware/error-handler.ts
import { Context } from "elysia";
import { AIErrorAnalyzer } from "../services/ai-error-analyzer.js";

const analyzer = new AIErrorAnalyzer();

export async function aiErrorHandler(err: Error, c: Context): Promise<Response> {
  // AI分析を非同期で実行（レスポンスをブロックしない）
  analyzer.analyzeAndRecord(err, {
    method: c.req.method,
    path: c.req.path,
    query: c.req.query(),
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("x-forwarded-for"),
  }).catch(console.error);

  // クライアントへのエラーレスポンス
  const status = (err as { status?: number }).status ?? 500;
  const isDev = process.env.NODE_ENV !== "production";

  return c.json(
    {
      error: {
        message: status >= 500 && !isDev
          ? "Internal server error"
          : err.message,
        ...(isDev && { stack: err.stack }),
      },
    },
    status as 500
  );
}
```

### AB.3 エラー管理API

```typescript
// src/routes/errors.ts
import { Elysia } from "elysia";
import { AIErrorAnalyzer } from "../services/ai-error-analyzer.js";
import { db } from "../db/index.js";
import { errorLogs } from "../services/ai-error-analyzer.js";
import { sql } from "drizzle-orm";

const app = new Elysia();
const analyzer = new AIErrorAnalyzer();

// エラー一覧
app.get("/", async (c) => {
  const severity = c.req.query("severity");
  const days = parseInt(c.req.query("days") ?? "7");

  const filter = severity
    ? sql`AND analysis->>'severity' = ${severity}`
    : sql``;

  const errors = await db.execute(sql`
    SELECT id, error_type, message, analysis, occurrence_count, first_seen_at, last_seen_at, resolved_at
    FROM error_logs
    WHERE created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
      ${filter}
    ORDER BY last_seen_at DESC
    LIMIT 100
  `);

  return c.json({ errors: errors.rows });
});

// エラートレンド分析
app.get("/trends", async (c) => {
  const days = parseInt(c.req.query("days") ?? "7");
  const trends = await analyzer.analyzeTrends(days);
  return c.json({ trends });
});

// 自動修復試行
app.post("/:id/auto-fix", async (c) => {
  const result = await analyzer.attemptAutoFix(c.req.param("id"));
  return c.json(result);
});

// エラー解決済みマーク
app.post("/:id/resolve", async (c) => {
  const { resolution } = await c.req.json<{ resolution: string }>();
  await db
    .update(errorLogs)
    .set({ resolution, resolvedAt: new Date() })
    .where(sql`id = ${c.req.param("id")}`);
  return c.json({ resolved: true });
});

export default app;
```
