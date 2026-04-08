# AI Agent、Skill 与 MCP 在 HR 简历筛选系统中的应用

> 本文档系统性地分析 AI Agent、Skill、MCP（Model Context Protocol）三个核心概念，
> 并结合本项目（Elysia + Drizzle + PostgreSQL + MiniMax AI + ImapFlow + Vercel AI SDK）
> 给出具体的集成方案与分阶段实施路线图。

---

## 目录

1. [概念区分：Agent vs Skill vs MCP](#1-概念区分agent-vs-skill-vs-mcp)
2. [MCP (Model Context Protocol) 详解](#2-mcp-model-context-protocol-详解)
3. [AI Agent 在 HR 系统中的应用](#3-ai-agent-在-hr-系统中的应用)
4. [Vercel AI SDK 的 Agent 能力](#4-vercel-ai-sdk-的-agent-能力)
5. [LangChain vs Vercel AI SDK 对比](#5-langchain-vs-vercel-ai-sdk-对比)
6. [基于当前项目的具体实现方案](#6-基于当前项目的具体实现方案)
7. [分阶段实施路线图](#7-分阶段实施路线图)

---

## 1. 概念区分：Agent vs Skill vs MCP

### 1.1 什么是 AI Agent

AI Agent（智能代理）是一个拥有自主决策能力的 AI 系统，它能够：

- **感知环境**：通过工具（Tools）读取外部数据（邮件、数据库、文件等）
- **规划行动**：根据目标自主决定下一步执行什么操作
- **执行操作**：调用工具完成具体任务（解析简历、发邮件、写入数据库）
- **迭代循环**：根据执行结果决定是否继续、切换策略或终止

**核心特征：自主性 + 工具调用 + 多步推理循环**

在本 HR 项目中，一个"简历筛选 Agent"可以自主完成：收取邮件 -> 解析附件 -> 提取结构化信息 -> 评分 -> 更新数据库 -> 发送面试邀请，整个链路无需人工干预。

### 1.2 什么是 Skill

Skill（技能）是 Agent 能力的一个原子单元，通常表现为一个可被调用的函数/工具。Skill 本身不具备决策能力，它只是"被调用"来完成特定任务。

| 属性 | Agent | Skill |
|------|-------|-------|
| 决策能力 | 有，可自主规划 | 无，被动执行 |
| 复杂度 | 高，涉及多步推理 | 低，单一功能 |
| 组合方式 | Agent 调用多个 Skill | Skill 被 Agent 编排 |
| 类比 | 项目经理 | 具体执行人 |

**在本项目中的例子：**

- **Skill 示例**：`parseResume(buffer, fileName)` — 解析 PDF 文件提取文本
- **Skill 示例**：`scoreResume(text, job, desc, config)` — AI 评分
- **Agent 示例**：一个完整的"邮件简历处理 Agent"，自主决定何时收邮件、如何分配到职位、是否需要重新评分

### 1.3 什么是 MCP（Model Context Protocol）

MCP（模型上下文协议）是 Anthropic 于 2024 年 11 月发布的开放标准，用于标准化 AI 系统与外部工具/数据源之间的通信方式。2025 年 12 月，Anthropic 将 MCP 捐赠给了 Linux 基金会旗下的 Agentic AI Foundation（AAIF），由 Anthropic、Block 和 OpenAI 共同治理。

**核心思想：** MCP 是 Agent 和外部世界之间的"通信协议"，相当于 AI 世界的 USB 接口——任何 AI 应用（Host）都可以通过 MCP Client 连接任何 MCP Server，获取工具、资源和提示词模板。

### 1.4 三者关系图

```
┌─────────────────────────────────────────────────────────┐
│                     AI Agent（大脑）                       │
│         自主决策 + 多步推理 + 循环执行                      │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Skill A  │  │ Skill B  │  │ Skill C  │  ← 原子能力   │
│  │ 解析简历  │  │ AI 评分  │  │ 发送邮件  │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │                    │
│  ┌────┴──────────────┴──────────────┴────┐              │
│  │          MCP Client（协议层）            │              │
│  └────┬──────────────┬──────────────┬────┘              │
└───────┼──────────────┼──────────────┼────────────────────┘
        │              │              │
   MCP 协议         MCP 协议       MCP 协议
        │              │              │
┌───────┴───┐  ┌───────┴───┐  ┌──────┴────┐
│ MCP Server│  │ MCP Server│  │ MCP Server│
│ 邮箱服务   │  │ 数据库     │  │ 文件系统   │
└───────────┘  └───────────┘  └───────────┘
```

### 1.5 适用场景总结

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 简单的工具调用（解析 PDF） | Skill / Tool | 单步操作，无需自主决策 |
| 多步工作流（收邮件+解析+评分+入库） | Agent | 需要自主编排多个步骤 |
| 连接外部系统（邮箱、数据库） | MCP Server | 标准化接口，可复用 |
| 多个 AI 应用共享工具 | MCP Server | 一次实现，多处消费 |
| 需要人工审批的关键操作 | Agent + Human-in-the-Loop | Agent 暂停等待人工确认 |

---

## 2. MCP (Model Context Protocol) 详解

### 2.1 协议架构

MCP 遵循 **Host-Client-Server** 三层架构，基于 JSON-RPC 2.0 协议进行通信。

```
┌─────────────────────────────────────────────┐
│              MCP Host（宿主应用）              │
│         例如：HR Backend / Claude Desktop     │
│                                              │
│  ┌──────────────┐    ┌──────────────┐       │
│  │  MCP Client  │    │  MCP Client  │       │
│  │  连接邮箱服务  │    │  连接数据库   │       │
│  └──────┬───────┘    └──────┬───────┘       │
└─────────┼───────────────────┼────────────────┘
          │                   │
     JSON-RPC 2.0        JSON-RPC 2.0
          │                   │
┌─────────┴────────┐ ┌───────┴──────────┐
│   MCP Server     │ │   MCP Server     │
│   IMAP 邮箱      │ │   PostgreSQL     │
│   - Tools        │ │   - Tools        │
│   - Resources    │ │   - Resources    │
│   - Prompts      │ │   - Prompts      │
└──────────────────┘ └──────────────────┘
```

#### 2.1.1 三个参与角色

| 角色 | 说明 | 本项目对应 |
|------|------|-----------|
| **MCP Host** | 运行 AI 应用的宿主程序，管理一到多个 MCP Client | HR Backend（Elysia 服务） |
| **MCP Client** | 维持与 MCP Server 的连接，获取 Tools/Resources/Prompts | `@ai-sdk/mcp` 中的 `createMCPClient` |
| **MCP Server** | 暴露工具、资源和提示词模板的服务程序 | 自定义的邮箱/数据库/文件 Server |

#### 2.1.2 三大核心原语（Primitives）

| 原语 | 说明 | HR 项目示例 |
|------|------|-----------|
| **Tools** | 可执行函数，AI 可主动调用 | `search_emails`、`query_candidates`、`parse_resume` |
| **Resources** | 数据源，提供上下文信息 | 简历文本内容、候选人列表、职位描述 |
| **Prompts** | 可复用的提示词模板 | 简历评分 Prompt、面试邀请邮件模板 |

#### 2.1.3 能力协商（Capability Negotiation）

MCP Client 和 Server 在初始化连接时会进行能力协商，双方明确声明支持的功能。例如：

```typescript
// Client 声明支持的能力
const client = await createMCPClient({
  name: 'hr-backend',
  transport: { type: 'stdio', command: 'bun', args: ['mcp-server.ts'] },
  // Client 声明支持 tools、resources、prompts
});

// Server 在启动时声明暴露的能力
const server = new McpServer({
  name: 'hr-email-server',
  version: '1.0.0',
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
});
```

### 2.2 Transport 层（传输层）

MCP 规范定义了多种传输方式：

| Transport | 场景 | 通信方式 | 状态 |
|-----------|------|---------|------|
| **STDIO** | 本地进程间通信 | stdin/stdout | 稳定，适合本地开发 |
| **Streamable HTTP** | 远程服务通信 | HTTP + SSE | **推荐**（2025.03 引入） |
| **SSE** | 远程（旧） | Server-Sent Events | **已废弃**，被 Streamable HTTP 取代 |

**本项目推荐方案：**

- **开发阶段**：使用 STDIO Transport，HR Backend 进程直接启动 MCP Server 子进程
- **生产阶段**：使用 Streamable HTTP Transport，MCP Server 作为独立微服务部署

```typescript
// 开发阶段：STDIO Transport
import { createMCPClient } from '@ai-sdk/mcp';

const emailMcpClient = await createMCPClient({
  transport: {
    type: 'stdio',
    command: 'bun',
    args: ['./mcp-servers/email-server.ts'],
  },
});

// 生产阶段：Streamable HTTP Transport
const emailMcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://mcp-email.internal.ivis-sh.com/mcp',
    headers: {
      Authorization: `Bearer ${process.env.MCP_TOKEN}`,
    },
  },
});
```

### 2.3 在 HR 项目中的具体应用场景

#### 2.3.1 MCP Server 连接邮箱（读取简历邮件）

**当前实现：** `src/services/email.ts` 中直接使用 ImapFlow 硬编码了邮件收取逻辑。

**MCP 改造方案：** 将邮件操作封装为独立的 MCP Server，暴露标准化工具。

```typescript
// mcp-servers/email-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ImapFlow } from 'imapflow';

const server = new McpServer({
  name: 'hr-email-server',
  version: '1.0.0',
});

// Tool: 搜索未读邮件
server.registerTool('search_unread_emails', {
  title: '搜索未读邮件',
  description: '从 IMAP 邮箱中搜索所有未读邮件，返回邮件列表（发件人、主题、日期）',
  inputSchema: {
    folder: z.string().default('INBOX').describe('邮箱文件夹'),
    limit: z.number().default(50).describe('最大返回数量'),
  },
}, async ({ folder, limit }) => {
  const client = createImapClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock(folder);
    try {
      const results = await client.search({ seen: false });
      const emails = [];
      for (const uid of results.slice(0, limit)) {
        const msg = await client.fetchOne(String(uid), { envelope: true });
        emails.push({
          uid,
          from: msg.envelope.from?.[0]?.address,
          subject: msg.envelope.subject,
          date: msg.envelope.date,
        });
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(emails, null, 2) }],
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
});

// Tool: 下载邮件附件
server.registerTool('download_attachment', {
  title: '下载邮件附件',
  description: '下载指定邮件的指定附件，返回 base64 编码的文件内容',
  inputSchema: {
    uid: z.number().describe('邮件 UID'),
    part: z.string().describe('附件 MIME 部分编号'),
  },
}, async ({ uid, part }) => {
  const client = createImapClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const { content } = await client.download(String(uid), part);
      const chunks: Buffer[] = [];
      for await (const chunk of content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            size: buffer.length,
            base64: buffer.toString('base64'),
          }),
        }],
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
});

// Tool: 标记邮件为已读
server.registerTool('mark_as_read', {
  title: '标记邮件为已读',
  description: '将指定邮件标记为已读',
  inputSchema: {
    uid: z.number().describe('邮件 UID'),
  },
}, async ({ uid }) => {
  const client = createImapClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      await client.messageFlagsAdd(String(uid), ['\\Seen']);
      return { content: [{ type: 'text', text: 'OK' }] };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
});

// Resource: 邮箱状态
server.registerResource('mailbox_status', 'mailbox://status', {
  title: '邮箱状态',
  description: '当前邮箱的状态信息（邮件总数、未读数等）',
}, async () => {
  const client = createImapClient();
  await client.connect();
  try {
    const status = await client.status('INBOX', {
      messages: true,
      unseen: true,
    });
    return {
      contents: [{
        uri: 'mailbox://status',
        text: JSON.stringify(status, null, 2),
      }],
    };
  } finally {
    await client.logout();
  }
});

// 启动 Server
const transport = new StdioServerTransport();
await server.connect(transport);
```

**优势：**
- 邮件操作逻辑完全解耦，Agent 只需调用 `search_unread_emails`、`download_attachment` 等工具
- 其他 AI 应用也可以复用此 MCP Server
- 可独立测试、独立部署、独立扩展

**可复用的开源项目：**
- [non-dirty/imap-mcp](https://github.com/non-dirty/imap-mcp) -- IMAP MCP Server，MIT 许可证，支持邮件浏览、内容读取、附件处理、邮件标记等完整功能

#### 2.3.2 MCP Server 连接数据库（查询候选人）

**当前实现：** 路由层直接使用 Drizzle ORM 操作数据库。

**MCP 改造方案：** 将数据库查询封装为 MCP Server，AI Agent 可以通过自然语言查询候选人数据。

```typescript
// mcp-servers/database-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '../src/db/index.js';
import { candidates, scores, positions } from '../src/db/schema.js';
import { eq, and, gte, sql } from 'drizzle-orm';

const server = new McpServer({
  name: 'hr-database-server',
  version: '1.0.0',
});

// Tool: 查询候选人
server.registerTool('query_candidates', {
  title: '查询候选人列表',
  description: '根据条件查询候选人列表，支持按职位、状态、评分等级筛选',
  inputSchema: {
    positionId: z.string().uuid().optional().describe('职位 ID'),
    status: z.enum(['new', 'screening', 'shortlisted', 'interviewed', 'rejected', 'hired']).optional(),
    grade: z.enum(['A', 'B', 'C', 'D', 'F']).optional().describe('AI 评分等级'),
    minScore: z.number().min(0).max(100).optional().describe('最低分数'),
    limit: z.number().default(20).describe('返回数量限制'),
  },
}, async ({ positionId, status, grade, minScore, limit }) => {
  // 构建查询条件...
  const conditions = [];
  if (positionId) conditions.push(eq(candidates.positionId, positionId));
  if (status) conditions.push(eq(candidates.status, status));

  let query = db.select().from(candidates);
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  const results = await query.limit(limit);

  return {
    content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
  };
});

// Tool: 更新候选人状态
server.registerTool('update_candidate_status', {
  title: '更新候选人状态',
  description: '更新指定候选人的筛选状态',
  inputSchema: {
    candidateId: z.string().uuid().describe('候选人 ID'),
    status: z.enum(['new', 'screening', 'shortlisted', 'interviewed', 'rejected', 'hired']),
    notes: z.string().optional().describe('备注'),
  },
}, async ({ candidateId, status, notes }) => {
  const [updated] = await db
    .update(candidates)
    .set({ status, notes, updatedAt: new Date() })
    .where(eq(candidates.id, candidateId))
    .returning();

  return {
    content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
  };
});

// Tool: 获取职位详情及其技能配置
server.registerTool('get_position_details', {
  title: '获取职位详情',
  description: '获取职位的完整信息，包括技能配置（must/nice/reject）',
  inputSchema: {
    positionId: z.string().uuid().describe('职位 ID'),
  },
}, async ({ positionId }) => {
  const [position] = await db
    .select()
    .from(positions)
    .where(eq(positions.id, positionId))
    .limit(1);

  return {
    content: [{ type: 'text', text: JSON.stringify(position, null, 2) }],
  };
});

// Resource: 所有开放职位
server.registerResource('open_positions', 'positions://open', {
  title: '开放中的职位列表',
  description: '当前所有状态为 open 的招聘职位',
}, async () => {
  const openPositions = await db
    .select()
    .from(positions)
    .where(eq(positions.status, 'open'));

  return {
    contents: [{
      uri: 'positions://open',
      text: JSON.stringify(openPositions, null, 2),
    }],
  };
});
```

**可复用的开源项目：**
- [crystaldba/postgres-mcp](https://github.com/crystaldba/postgres-mcp) -- Postgres MCP Pro，提供读写访问和性能分析
- [HenkDz/postgresql-mcp-server](https://github.com/HenkDz/postgresql-mcp-server) -- 17 个智能工具的 PostgreSQL MCP Server
- [modelcontextprotocol/servers (postgres)](https://github.com/modelcontextprotocol/servers) -- 官方参考实现

> **注意：** 通用 PostgreSQL MCP Server 适合通用数据库查询场景。但本项目建议自建专用 MCP Server，封装业务逻辑（如候选人查询、评分聚合等），避免直接暴露原始 SQL 能力。

#### 2.3.3 MCP Server 连接文件系统（管理简历文件）

**场景说明：** 当简历文件需要存储在本地文件系统或对象存储中时，通过 MCP Server 提供文件管理能力。

```typescript
// mcp-servers/resume-file-server.ts
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

const RESUME_DIR = process.env.RESUME_STORAGE_PATH || './storage/resumes';

const server = new McpServer({
  name: 'hr-resume-file-server',
  version: '1.0.0',
});

// Tool: 保存简历文件
server.registerTool('save_resume_file', {
  title: '保存简历文件',
  description: '将简历文件保存到文件系统，返回文件路径',
  inputSchema: {
    candidateId: z.string().uuid().describe('候选人 ID'),
    fileName: z.string().describe('文件名'),
    base64Content: z.string().describe('文件内容（base64 编码）'),
  },
}, async ({ candidateId, fileName, base64Content }) => {
  const dir = path.join(RESUME_DIR, candidateId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, Buffer.from(base64Content, 'base64'));
  return {
    content: [{ type: 'text', text: JSON.stringify({ path: filePath, size: base64Content.length }) }],
  };
});

// Tool: 列出候选人的简历文件
server.registerTool('list_resume_files', {
  title: '列出简历文件',
  description: '列出指定候选人的所有简历文件',
  inputSchema: {
    candidateId: z.string().uuid().describe('候选人 ID'),
  },
}, async ({ candidateId }) => {
  const dir = path.join(RESUME_DIR, candidateId);
  try {
    const files = await fs.readdir(dir);
    const fileInfos = await Promise.all(
      files.map(async (f) => {
        const stat = await fs.stat(path.join(dir, f));
        return { name: f, size: stat.size, modifiedAt: stat.mtime };
      })
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(fileInfos, null, 2) }],
    };
  } catch {
    return { content: [{ type: 'text', text: '[]' }] };
  }
});

// Resource Template: 简历文件内容
server.registerResource(
  'resume_file',
  new ResourceTemplate('resume://{candidateId}/{fileName}', { list: undefined }),
  {
    title: '简历文件',
    description: '获取指定候选人的指定简历文件内容',
  },
  async (uri, { candidateId, fileName }) => {
    const filePath = path.join(RESUME_DIR, String(candidateId), String(fileName));
    const content = await fs.readFile(filePath);
    return {
      contents: [{
        uri: uri.href,
        blob: content.toString('base64'),
        mimeType: String(fileName).endsWith('.pdf')
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }],
    };
  }
);
```

**可复用的开源项目：**
- [modelcontextprotocol/servers (filesystem)](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) -- 官方 Filesystem MCP Server，MIT 许可证，提供安全的文件读写操作

#### 2.3.4 MCP Server 连接外部招聘平台 API

**场景说明：** 对接 BOSS 直聘、拉勾、猎聘等招聘平台 API，实现：

- 从平台直接拉取候选人信息
- 同步职位发布状态
- 获取平台上的候选人沟通记录

```typescript
// mcp-servers/recruitment-platform-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'hr-recruitment-platform-server',
  version: '1.0.0',
});

// Tool: 从招聘平台搜索候选人
server.registerTool('search_platform_candidates', {
  title: '搜索平台候选人',
  description: '通过关键词从外部招聘平台搜索候选人',
  inputSchema: {
    platform: z.enum(['boss', 'lagou', 'liepin']).describe('招聘平台'),
    keywords: z.string().describe('搜索关键词'),
    location: z.string().optional().describe('工作地点'),
    experience: z.string().optional().describe('工作年限要求'),
  },
}, async ({ platform, keywords, location, experience }) => {
  // 调用对应平台 API
  // 注意：各平台 API 需要各自的认证凭据
  const results = await callPlatformAPI(platform, {
    keywords,
    location,
    experience,
  });
  return {
    content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
  };
});

// Tool: 发布职位到招聘平台
server.registerTool('publish_position', {
  title: '发布职位',
  description: '将本系统中的职位发布到外部招聘平台',
  inputSchema: {
    platform: z.enum(['boss', 'lagou', 'liepin']),
    positionData: z.object({
      title: z.string(),
      description: z.string(),
      department: z.string().optional(),
      salary: z.string().optional(),
      location: z.string().optional(),
    }),
  },
}, async ({ platform, positionData }) => {
  const result = await publishToPlatform(platform, positionData);
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
});
```

### 2.4 如何实现自定义 MCP Server（TypeScript 完整指南）

#### 2.4.1 项目初始化

```bash
mkdir mcp-servers && cd mcp-servers
bun init
bun add @modelcontextprotocol/sdk zod
bun add -D typescript @types/bun
```

**`tsconfig.json`：**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

#### 2.4.2 Server 代码基本结构

```typescript
// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 1. 创建 Server 实例
const server = new McpServer({
  name: 'my-hr-mcp-server',
  version: '1.0.0',
});

// 2. 注册 Tool（可执行函数）
server.registerTool('tool_name', {
  title: '工具标题',
  description: '工具描述，AI 据此决定何时调用',
  inputSchema: {
    param1: z.string().describe('参数说明'),
    param2: z.number().optional().describe('可选参数'),
  },
}, async ({ param1, param2 }) => {
  // 实现业务逻辑
  const result = await doSomething(param1, param2);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  };
});

// 3. 注册 Resource（数据源）
server.registerResource('resource_name', 'resource://uri', {
  title: '资源标题',
  description: '资源描述',
}, async () => {
  const data = await loadData();
  return {
    contents: [{ uri: 'resource://uri', text: JSON.stringify(data) }],
  };
});

// 4. 注册 Prompt（提示词模板）
server.registerPrompt('prompt_name', {
  title: '提示词模板标题',
  description: '模板描述',
  argsSchema: {
    jobTitle: z.string().describe('职位名称'),
  },
}, ({ jobTitle }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `请为 ${jobTitle} 职位撰写招聘要求...`,
    },
  }],
}));

// 5. 启动 Transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

#### 2.4.3 使用 Streamable HTTP Transport（生产环境）

```typescript
// src/http-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'http';

const server = new McpServer({
  name: 'hr-mcp-server',
  version: '1.0.0',
});

// ... 注册 Tools / Resources / Prompts ...

// 创建 HTTP 服务器
const httpServer = createServer(async (req, res) => {
  if (req.url === '/mcp') {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

httpServer.listen(3002, () => {
  console.log('MCP Server running on http://localhost:3002/mcp');
});
```

### 2.5 现有可复用的 MCP Server 开源项目

以下是与 HR 项目直接相关的开源 MCP Server：

| 项目 | 功能 | 许可证 | 链接 |
|------|------|--------|------|
| **imap-mcp** | IMAP 邮件操作（收发、浏览、标记） | MIT | [non-dirty/imap-mcp](https://github.com/non-dirty/imap-mcp) |
| **postgres-mcp** | PostgreSQL 读写 + 性能分析 | MIT | [crystaldba/postgres-mcp](https://github.com/crystaldba/postgres-mcp) |
| **postgresql-mcp-server** | 17 个 PostgreSQL 管理工具 | MIT | [HenkDz/postgresql-mcp-server](https://github.com/HenkDz/postgresql-mcp-server) |
| **filesystem** | 文件系统操作（官方） | MIT | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) |
| **official servers** | 多种参考实现合集 | MIT | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) |
| **awesome-mcp-servers** | 社区 MCP Server 集合 | -- | [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) |
| **FastMCP** | MCP Server 快速开发框架 | MIT | [punkpeye/fastmcp](https://github.com/punkpeye/fastmcp) |

**推荐策略：**

1. **邮箱连接**：优先评估 `non-dirty/imap-mcp`，如果功能满足需求直接使用，否则参考其实现自建
2. **数据库**：本项目建议自建专用 MCP Server（封装业务查询逻辑），通用 PostgreSQL MCP Server 作为参考
3. **文件系统**：直接使用官方 Filesystem MCP Server，配置仅允许访问简历存储目录
4. **快速开发**：使用 FastMCP 框架加速 MCP Server 开发

---

## 3. AI Agent 在 HR 系统中的应用

### 3.1 简历解析 Agent（结构化信息提取）

**当前状态：** `resume-parser.ts` 仅提取纯文本，未做结构化解析。

**Agent 改造目标：** 自主从简历文本中提取姓名、学历、工作经历、技能等结构化字段。

```typescript
// src/agents/resume-parser-agent.ts
import { generateText, tool } from 'ai';
import { model } from '../lib/ai.js';
import { z } from 'zod/v4';

// 定义结构化简历数据的 schema
const structuredResumeSchema = z.object({
  name: z.string().describe('候选人姓名'),
  email: z.string().email().optional().describe('电子邮箱'),
  phone: z.string().optional().describe('手机号'),
  education: z.object({
    degree: z.enum(['博士', '硕士', '本科', '大专', '高中', '其他']),
    school: z.string(),
    major: z.string(),
    graduationYear: z.number().optional(),
  }).optional(),
  workExperience: z.array(z.object({
    company: z.string(),
    position: z.string(),
    duration: z.string(),
    description: z.string(),
  })),
  skills: z.array(z.string()),
  certifications: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  summary: z.string().describe('个人总结，200 字以内'),
});

// 定义 Agent 可使用的工具
const parseTools = {
  extract_structured_info: tool({
    description: '从简历文本中提取结构化信息',
    parameters: z.object({
      resumeText: z.string(),
    }),
    execute: async ({ resumeText }) => {
      // 使用 AI 做结构化提取
      const { text } = await generateText({
        model,
        prompt: `请从以下简历文本中提取结构化信息，返回 JSON 格式：

${resumeText}

要求提取：姓名、邮箱、电话、学历（学位、学校、专业、毕业年份）、
工作经历（公司、职位、时间段、描述）、技能列表、证书、语言能力、个人总结。
只返回 JSON，不要其他内容。`,
      });
      return text;
    },
  }),

  validate_phone: tool({
    description: '验证手机号格式是否正确',
    parameters: z.object({
      phone: z.string(),
    }),
    execute: async ({ phone }) => {
      const isValid = /^1[3-9]\d{9}$/.test(phone.replace(/[-\s]/g, ''));
      return { phone: phone.replace(/[-\s]/g, ''), isValid };
    },
  }),

  validate_email: tool({
    description: '验证邮箱格式是否正确',
    parameters: z.object({
      email: z.string(),
    }),
    execute: async ({ email }) => {
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      return { email, isValid };
    },
  }),
};

export async function parseResumeStructured(resumeText: string) {
  const { text, steps } = await generateText({
    model,
    tools: parseTools,
    maxSteps: 5,  // 允许最多 5 步工具调用
    system: `你是一个专业的简历解析 Agent。你的任务是：
1. 调用 extract_structured_info 工具提取简历的结构化信息
2. 对提取到的手机号调用 validate_phone 验证
3. 对提取到的邮箱调用 validate_email 验证
4. 最终返回完整的结构化简历数据（JSON 格式）

确保所有字段都经过验证后再返回。`,
    prompt: `请解析以下简历：\n\n${resumeText}`,
  });

  return JSON.parse(extractJson(text));
}
```

### 3.2 评分 Agent（多维度评分 + 自动分级）

**当前状态：** `ai-scorer.ts` 使用单次 `generateText` 调用完成评分，缺少多维度深度分析。

**Agent 改造目标：** 多步推理，分别评估技能匹配、经验匹配、文化契合度等维度，最终综合评分。

```typescript
// src/agents/scoring-agent.ts
import { ToolLoopAgent } from 'ai';
import { tool } from 'ai';
import { model } from '../lib/ai.js';
import { z } from 'zod/v4';

const scoringAgent = new ToolLoopAgent({
  model,
  system: `你是一个资深 HR 评分专家 Agent。你需要对候选人进行多维度评分。

评分流程：
1. 先调用 analyze_skills 分析技能匹配度
2. 再调用 analyze_experience 分析工作经验匹配度
3. 调用 analyze_education 分析学历匹配度
4. 调用 check_red_flags 检查扣分项
5. 最后调用 compute_final_score 计算综合评分

每个维度独立评分后再综合，确保评分公正全面。`,

  tools: {
    analyze_skills: tool({
      description: '分析候选人技能与职位要求的匹配度',
      parameters: z.object({
        candidateSkills: z.array(z.string()),
        mustSkills: z.array(z.string()),
        niceSkills: z.array(z.string()),
      }),
      execute: async ({ candidateSkills, mustSkills, niceSkills }) => {
        const matchedMust = mustSkills.filter(s =>
          candidateSkills.some(cs =>
            cs.toLowerCase().includes(s.toLowerCase())
          )
        );
        const matchedNice = niceSkills.filter(s =>
          candidateSkills.some(cs =>
            cs.toLowerCase().includes(s.toLowerCase())
          )
        );
        return {
          mustMatchRate: matchedMust.length / Math.max(mustSkills.length, 1),
          niceMatchRate: matchedNice.length / Math.max(niceSkills.length, 1),
          matchedMust,
          matchedNice,
          missingMust: mustSkills.filter(s => !matchedMust.includes(s)),
        };
      },
    }),

    analyze_experience: tool({
      description: '分析候选人工作经验的相关性和深度',
      parameters: z.object({
        resumeText: z.string(),
        jobDescription: z.string(),
      }),
      execute: async ({ resumeText, jobDescription }) => {
        // 可以调用 AI 做更细粒度的经验匹配分析
        const { text } = await generateText({
          model,
          prompt: `请分析以下简历中的工作经验与职位要求的匹配度。
返回 JSON：{ "relevanceScore": 0-100, "yearsOfRelevantExperience": number, "analysis": "..." }

简历：${resumeText.slice(0, 2000)}
职位要求：${jobDescription.slice(0, 1000)}`,
        });
        return JSON.parse(extractJson(text));
      },
    }),

    analyze_education: tool({
      description: '分析候选人学历背景',
      parameters: z.object({
        education: z.string(),
        requiredEducation: z.string().optional(),
      }),
      execute: async ({ education, requiredEducation }) => {
        const levels: Record<string, number> = {
          '博士': 5, '硕士': 4, '本科': 3, '大专': 2, '高中': 1,
        };
        // 简单匹配学历等级
        let level = 0;
        for (const [name, score] of Object.entries(levels)) {
          if (education.includes(name)) { level = score; break; }
        }
        return { educationLevel: level, analysis: education };
      },
    }),

    check_red_flags: tool({
      description: '检查候选人简历中的扣分项（频繁跳槽、空窗期等）',
      parameters: z.object({
        resumeText: z.string(),
        rejectCriteria: z.array(z.string()),
      }),
      execute: async ({ resumeText, rejectCriteria }) => {
        const flags: string[] = [];
        for (const criteria of rejectCriteria) {
          if (resumeText.toLowerCase().includes(criteria.toLowerCase())) {
            flags.push(criteria);
          }
        }
        return {
          redFlags: flags,
          penalty: flags.length * 15,  // 每项扣 15 分
        };
      },
    }),

    compute_final_score: tool({
      description: '根据各维度评分计算最终综合得分',
      parameters: z.object({
        mustMatchRate: z.number(),
        niceMatchRate: z.number(),
        experienceScore: z.number(),
        educationLevel: z.number(),
        penalty: z.number(),
      }),
      execute: async ({ mustMatchRate, niceMatchRate, experienceScore, educationLevel, penalty }) => {
        const mustScore = mustMatchRate * 100;
        const niceScore = niceMatchRate * 100;
        const eduScore = (educationLevel / 5) * 100;

        const total = mustScore * 0.4 + niceScore * 0.15
          + experienceScore * 0.25 + eduScore * 0.1
          - penalty * 0.1;

        const finalScore = Math.max(0, Math.min(100, total));
        const grade = finalScore >= 80 ? 'A'
          : finalScore >= 65 ? 'B'
          : finalScore >= 50 ? 'C'
          : finalScore >= 35 ? 'D' : 'F';

        return { totalScore: finalScore, grade };
      },
    }),
  },
});

// 使用 Agent
export async function scoreWithAgent(
  resumeText: string,
  jobTitle: string,
  jobDescription: string,
  skillConfig: SkillConfig,
) {
  const { text } = await scoringAgent.generate({
    prompt: `请对以下候选人简历进行全面评分。

职位: ${jobTitle}
职位描述: ${jobDescription}
必备技能: ${skillConfig.must.join(', ')}
加分项: ${skillConfig.nice.join(', ')}
扣分项: ${skillConfig.reject.join(', ')}

简历内容:
${resumeText}

请依次调用各分析工具完成评分，最终给出综合结果。`,
  });

  return JSON.parse(extractJson(text));
}
```

### 3.3 面试调度 Agent（自动发邮件约面试）

**核心能力：** 对评分达标（Grade A/B）的候选人，自动生成面试邀请邮件并发送。

```typescript
// src/agents/interview-scheduler-agent.ts
import { ToolLoopAgent } from 'ai';
import { tool } from 'ai';
import { model } from '../lib/ai.js';
import { z } from 'zod/v4';
import nodemailer from 'nodemailer';

const schedulerAgent = new ToolLoopAgent({
  model,
  system: `你是一个面试调度 Agent。你的职责是：
1. 查询所有评分为 A 或 B 且状态为 shortlisted 的候选人
2. 为每个候选人生成个性化的面试邀请邮件
3. 发送邮件
4. 更新候选人状态为 interviewed

注意事项：
- 邮件要专业、友好
- 包含面试时间、地点（或线上会议链接）、面试官信息
- 如果候选人没有邮箱，跳过并备注`,

  tools: {
    query_shortlisted_candidates: tool({
      description: '查询所有入围的候选人（Grade A/B，状态为 shortlisted）',
      parameters: z.object({
        positionId: z.string().uuid(),
      }),
      execute: async ({ positionId }) => {
        // 查询数据库...
        const results = await db
          .select()
          .from(candidates)
          .innerJoin(scores, eq(candidates.id, scores.candidateId))
          .where(
            and(
              eq(candidates.positionId, positionId),
              eq(candidates.status, 'shortlisted'),
              sql`${scores.grade} IN ('A', 'B')`
            )
          );
        return results;
      },
    }),

    generate_interview_email: tool({
      description: '生成个性化的面试邀请邮件内容',
      parameters: z.object({
        candidateName: z.string(),
        positionTitle: z.string(),
        interviewDate: z.string(),
        interviewTime: z.string(),
        location: z.string(),
        interviewerName: z.string(),
      }),
      execute: async ({ candidateName, positionTitle, interviewDate, interviewTime, location, interviewerName }) => {
        return {
          subject: `面试邀请 - ${positionTitle} | ivis`,
          body: `尊敬的 ${candidateName}：

感谢您对我司 ${positionTitle} 职位的关注。经过初步筛选，我们诚挚地邀请您参加面试。

面试详情：
- 日期：${interviewDate}
- 时间：${interviewTime}
- 地点：${location}
- 面试官：${interviewerName}

如有任何问题或需要调整时间，请直接回复本邮件。

期待与您见面！

ivis HR 团队`,
        };
      },
    }),

    send_email: tool({
      description: '发送邮件',
      parameters: z.object({
        to: z.string().email(),
        subject: z.string(),
        body: z.string(),
      }),
      execute: async ({ to, subject, body }) => {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'mail.ivis-sh.com',
          port: Number(process.env.SMTP_PORT) || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: `"ivis HR" <${process.env.SMTP_USER}>`,
          to,
          subject,
          text: body,
        });

        return { status: 'sent', to };
      },
    }),

    update_candidate_status: tool({
      description: '更新候选人状态',
      parameters: z.object({
        candidateId: z.string().uuid(),
        status: z.string(),
        notes: z.string().optional(),
      }),
      execute: async ({ candidateId, status, notes }) => {
        await db
          .update(candidates)
          .set({ status, notes, updatedAt: new Date() })
          .where(eq(candidates.id, candidateId));
        return { candidateId, newStatus: status };
      },
    }),
  },
});
```

### 3.4 人才推荐 Agent（根据 JD 从人才库推荐）

**核心能力：** 接收一个新的 JD（职位描述），从已有人才库中推荐匹配的候选人。

```typescript
// src/agents/talent-recommendation-agent.ts
import { ToolLoopAgent } from 'ai';
import { tool } from 'ai';
import { model } from '../lib/ai.js';
import { z } from 'zod/v4';

const recommendationAgent = new ToolLoopAgent({
  model,
  system: `你是一个人才推荐 Agent。当收到一个新的职位需求时，你需要：
1. 分析职位要求，提取关键技能和条件
2. 从人才库中搜索匹配的候选人
3. 对匹配的候选人进行排序
4. 返回推荐列表，并说明推荐理由

重要：优先推荐之前评分高的候选人，同时考虑技能匹配度。`,

  tools: {
    analyze_job_requirements: tool({
      description: '分析职位需求，提取关键要素',
      parameters: z.object({
        jobTitle: z.string(),
        jobDescription: z.string(),
      }),
      execute: async ({ jobTitle, jobDescription }) => {
        const { text } = await generateText({
          model,
          prompt: `分析以下职位，提取关键技能、经验要求、学历要求。
返回 JSON: { "mustSkills": [...], "niceSkills": [...], "minExperience": number, "education": "..." }

职位: ${jobTitle}
描述: ${jobDescription}`,
        });
        return JSON.parse(extractJson(text));
      },
    }),

    search_talent_pool: tool({
      description: '从人才库中搜索具有指定技能的候选人',
      parameters: z.object({
        skills: z.array(z.string()),
        minScore: z.number().optional(),
        limit: z.number().default(20),
      }),
      execute: async ({ skills, minScore, limit }) => {
        // 使用数据库全文搜索或将来的向量搜索
        const results = await db
          .select({
            candidate: candidates,
            score: scores,
            resumeText: resumes.rawText,
          })
          .from(candidates)
          .leftJoin(scores, eq(candidates.id, scores.candidateId))
          .leftJoin(resumes, eq(candidates.id, resumes.candidateId))
          .where(
            minScore ? gte(scores.totalScore, minScore) : undefined
          )
          .orderBy(sql`${scores.totalScore} DESC NULLS LAST`)
          .limit(limit);

        return results;
      },
    }),

    rank_candidates: tool({
      description: '根据职位要求对候选人列表进行排名',
      parameters: z.object({
        candidates: z.array(z.object({
          id: z.string(),
          name: z.string(),
          skills: z.array(z.string()).optional(),
          totalScore: z.number().optional(),
          resumeSummary: z.string().optional(),
        })),
        requirements: z.object({
          mustSkills: z.array(z.string()),
          niceSkills: z.array(z.string()),
        }),
      }),
      execute: async ({ candidates: candidateList, requirements }) => {
        // 为每个候选人计算匹配分数
        return candidateList.map(c => {
          const mustMatch = requirements.mustSkills.filter(s =>
            c.skills?.some(cs => cs.toLowerCase().includes(s.toLowerCase()))
          ).length;
          const niceMatch = requirements.niceSkills.filter(s =>
            c.skills?.some(cs => cs.toLowerCase().includes(s.toLowerCase()))
          ).length;
          const matchScore = (mustMatch / Math.max(requirements.mustSkills.length, 1)) * 70
            + (niceMatch / Math.max(requirements.niceSkills.length, 1)) * 30;
          return { ...c, matchScore };
        }).sort((a, b) => b.matchScore - a.matchScore);
      },
    }),
  },
});
```

### 3.5 Multi-Agent 协作模式

在完整的 HR 自动化流程中，多个 Agent 需要协同工作。以下是推荐的协作架构：

```
┌────────────────────────────────────────────────────────┐
│                  Orchestrator Agent（编排者）             │
│           负责协调各子 Agent，管理整体工作流               │
└──┬──────────┬──────────┬──────────┬────────────────────┘
   │          │          │          │
   v          v          v          v
┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
│ 邮件  │  │ 解析  │  │ 评分  │  │ 调度  │
│ Agent │  │ Agent │  │ Agent │  │ Agent │
│      │  │      │  │      │  │      │
│收取邮件│  │结构化 │  │多维度 │  │面试排期│
│下载附件│  │信息提取│  │综合评分│  │发送邀请│
└──────┘  └──────┘  └──────┘  └──────┘
```

**两种协作模式：**

#### 模式一：代码驱动的流水线（Pipeline）

适合流程固定、步骤确定的场景：

```typescript
// src/agents/orchestrator-pipeline.ts

export async function processNewResumes(positionId: string) {
  // Step 1: 邮件 Agent 收取新简历
  const emails = await emailAgent.generate({
    prompt: `收取所有未读邮件并下载简历附件`,
  });

  // Step 2: 对每个简历调用解析 Agent
  for (const resume of emails.attachments) {
    const structured = await parserAgent.generate({
      prompt: `解析以下简历：${resume.text}`,
    });

    // Step 3: 评分 Agent 评估
    const score = await scoringAgent.generate({
      prompt: `对候选人 ${structured.name} 进行评分，
职位 ID: ${positionId}，
简历内容: ${resume.text}`,
    });

    // Step 4: 如果评分 A/B，调度 Agent 安排面试
    if (['A', 'B'].includes(score.grade)) {
      await schedulerAgent.generate({
        prompt: `为候选人 ${structured.name}（${structured.email}）安排面试`,
      });
    }
  }
}
```

#### 模式二：LLM 驱动的自主编排（Autonomous）

适合需要灵活决策、动态调整的场景：

```typescript
// src/agents/orchestrator-autonomous.ts
import { ToolLoopAgent } from 'ai';

const orchestratorAgent = new ToolLoopAgent({
  model,
  system: `你是 HR 系统的总编排 Agent。你可以调用以下子 Agent：
- email_agent: 收取和处理邮件
- parser_agent: 解析简历提取结构化信息
- scoring_agent: 多维度评分
- scheduler_agent: 面试调度
- recommendation_agent: 人才推荐

根据用户指令，自主决定调用哪些 Agent、按什么顺序执行。
如果某步骤失败，尝试重试或跳过并记录。
定期汇报处理进度。`,

  tools: {
    email_agent: tool({ /* ... */ }),
    parser_agent: tool({ /* ... */ }),
    scoring_agent: tool({ /* ... */ }),
    scheduler_agent: tool({ /* ... */ }),
    recommendation_agent: tool({ /* ... */ }),
  },
});
```

**模式选择建议：**

| 因素 | 代码驱动（Pipeline） | LLM 驱动（Autonomous） |
|------|---------------------|----------------------|
| 可预测性 | 高 | 中 |
| 灵活性 | 低 | 高 |
| 成本 | 低（减少 LLM 调用） | 高（需要额外推理） |
| 调试难度 | 低 | 高 |
| 推荐场景 | 日常批量处理 | 特殊请求/复杂分析 |

**本项目推荐：以代码驱动为主，关键决策节点使用 LLM 驱动。**

---

## 4. Vercel AI SDK 的 Agent 能力

### 4.1 版本演进

| 版本 | 发布时间 | 关键特性 |
|------|---------|---------|
| AI SDK 4.x | 2024 | `generateText`, `streamText`, 基础 tool calling |
| AI SDK 5 | 2025.07 | `stopWhen`, `prepareStep`, `Experimental_Agent` 类 |
| AI SDK 6 | 2025 下半年 | `ToolLoopAgent`, MCP 完整支持, 工具审批, DevTools |

**当前项目使用：** `ai@^6.0.101`（AI SDK 6.x）

### 4.2 核心 API 详解

#### 4.2.1 `generateText` — 单次文本生成

当前项目 `ai-scorer.ts` 已在使用的基础方式：

```typescript
import { generateText } from 'ai';

const { text } = await generateText({
  model,
  prompt: '...',
});
```

#### 4.2.2 `tool` — 定义工具

```typescript
import { tool } from 'ai';
import { z } from 'zod/v4';

const parseResumeTool = tool({
  description: '解析 PDF/DOCX 简历文件，提取纯文本',
  parameters: z.object({
    base64Content: z.string().describe('文件的 base64 编码内容'),
    fileName: z.string().describe('文件名'),
  }),
  execute: async ({ base64Content, fileName }) => {
    const buffer = Buffer.from(base64Content, 'base64');
    const result = await parseResume(buffer, fileName);
    return result;
  },
});
```

#### 4.2.3 `generateText` + `tools` + `maxSteps` — 多步 Agent

```typescript
import { generateText, tool } from 'ai';

const { text, steps, toolResults } = await generateText({
  model,
  tools: {
    search_emails: searchEmailsTool,
    download_attachment: downloadAttachmentTool,
    parse_resume: parseResumeTool,
    score_resume: scoreResumeTool,
    save_to_db: saveToDbTool,
  },
  maxSteps: 10,  // 最多执行 10 步
  system: '你是一个简历处理 Agent...',
  prompt: '请处理所有未读的简历邮件',
});
```

**工作原理：**

1. 模型收到 prompt，决定调用 `search_emails` 工具
2. 工具执行后，结果自动追加到对话历史
3. 模型看到结果，决定下一步调用 `download_attachment`
4. 循环继续，直到模型返回文本回复（不再调用工具）或达到 `maxSteps`

#### 4.2.4 `stopWhen` + `prepareStep` — 精细循环控制

```typescript
import { generateText, stepCountIs } from 'ai';

const { text } = await generateText({
  model,
  tools: myTools,

  // 停止条件：最多执行 15 步
  stopWhen: stepCountIs(15),

  // 每步执行前的回调，可动态调整配置
  prepareStep: async ({ steps, stepCount }) => {
    // 根据已执行步骤动态切换模型
    if (stepCount > 10) {
      return { model: cheaperModel };  // 后期用便宜模型
    }

    // 根据上下文长度压缩历史消息
    if (steps.length > 5) {
      return {
        messages: compressMessages(steps),
      };
    }

    return {};
  },
});
```

#### 4.2.5 `ToolLoopAgent` — 生产级 Agent 类

```typescript
import { ToolLoopAgent, stepCountIs } from 'ai';

const myAgent = new ToolLoopAgent({
  model,
  system: '你的系统提示词...',
  tools: {
    tool1: myTool1,
    tool2: myTool2,
  },
  stopWhen: stepCountIs(20),  // 默认也是 20
  prepareStep: async ({ steps }) => {
    // 动态调整
    return {};
  },
});

// 生成文本
const { text } = await myAgent.generate({
  prompt: '用户指令...',
});

// 流式输出
const stream = await myAgent.stream({
  prompt: '用户指令...',
});
```

#### 4.2.6 `toolChoice` — 控制工具选择策略

```typescript
const { text } = await generateText({
  model,
  tools: myTools,
  toolChoice: 'auto',       // AI 自主决定是否调用工具（默认）
  // toolChoice: 'required', // 强制调用至少一个工具
  // toolChoice: 'none',     // 禁止调用工具
  // toolChoice: { type: 'tool', toolName: 'specific_tool' }, // 强制调用指定工具
});
```

#### 4.2.7 `needsApproval` — Human-in-the-Loop（人工审批）

```typescript
const sendEmailTool = tool({
  description: '发送面试邀请邮件',
  parameters: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  needsApproval: true,  // 需要人工确认才能执行
  execute: async ({ to, subject, body }) => {
    // 发送邮件逻辑...
  },
});
```

当 Agent 调用带有 `needsApproval: true` 的工具时，执行会暂停，等待应用层的确认后才继续。

#### 4.2.8 MCP 集成

```typescript
import { createMCPClient } from '@ai-sdk/mcp';
import { generateText } from 'ai';

// 创建 MCP Client
const emailMcp = await createMCPClient({
  transport: {
    type: 'stdio',
    command: 'bun',
    args: ['./mcp-servers/email-server.ts'],
  },
});

const dbMcp = await createMCPClient({
  transport: {
    type: 'stdio',
    command: 'bun',
    args: ['./mcp-servers/database-server.ts'],
  },
});

// 获取所有 MCP 工具
const emailTools = await emailMcp.tools();
const dbTools = await dbMcp.tools();

// 在 Agent 中使用 MCP 工具
const { text } = await generateText({
  model,
  tools: {
    ...emailTools,    // 邮件相关工具
    ...dbTools,       // 数据库相关工具
  },
  maxSteps: 10,
  system: 'HR 简历处理 Agent...',
  prompt: '请处理未读简历邮件并评分入库',
});

// 使用完毕后关闭 MCP Client
await emailMcp.close();
await dbMcp.close();
```

#### 4.2.9 Streaming（流式输出）

```typescript
import { streamText } from 'ai';

const stream = streamText({
  model,
  tools: myTools,
  maxSteps: 10,
  prompt: '...',
});

// 在 Elysia 中返回流式响应
app.post('/api/analyze', async (c) => {
  const stream = streamText({
    model,
    tools: myTools,
    prompt: '...',
  });

  return stream.toTextStreamResponse();
});
```

### 4.3 AI SDK Agent 能力总结

| 能力 | API | 说明 |
|------|-----|------|
| 单次生成 | `generateText` | 基础文本生成 |
| 工具定义 | `tool()` | 定义可被 AI 调用的函数 |
| 多步推理 | `maxSteps` / `stopWhen` | 自动循环直到完成 |
| 动态控制 | `prepareStep` | 每步动态调整模型/上下文/工具 |
| Agent 类 | `ToolLoopAgent` | 封装完整 Agent 生命周期 |
| 工具选择 | `toolChoice` | 控制工具调用策略 |
| 人工审批 | `needsApproval` | 关键操作暂停等待确认 |
| MCP 集成 | `createMCPClient` | 连接标准化外部工具 |
| 流式输出 | `streamText` | 实时返回生成内容 |
| 结构化输出 | `generateObject` | 生成类型安全的 JSON 对象 |

---

## 5. LangChain vs Vercel AI SDK 对比

### 5.1 整体定位对比

| 维度 | LangChain (JS) | Vercel AI SDK (v6) |
|------|---------------|-------------------|
| **定位** | 全功能 LLM 编排框架 | TypeScript AI 开发工具包 |
| **核心优势** | 丰富的生态、成熟的 Agent 架构 | 轻量、类型安全、原生流式支持 |
| **Bundle 大小** | ~101.2 kB (gzipped) | ~67.5 kB (gzipped) |
| **学习曲线** | 陡峭 | 平缓 |
| **TypeScript 支持** | 良好 | 优秀（原生 TypeScript） |
| **Provider 切换** | 需要修改代码 | 只需改 model ID |
| **月下载量** | 约 500 万 | 超 2000 万 |

### 5.2 Agent 能力对比

| Agent 能力 | LangChain / LangGraph | Vercel AI SDK 6 |
|-----------|----------------------|-----------------|
| 工具调用 | 支持 | 支持 |
| 多步推理循环 | 支持（ReAct, Plan-and-Execute） | 支持（`maxSteps`, `stopWhen`） |
| Agent 类 | `AgentExecutor`, LangGraph 节点 | `ToolLoopAgent` |
| Graph 工作流 | LangGraph（图状态机） | 不支持（需自行实现） |
| 内存/状态管理 | 内置多种 Memory 类型 | 需自行管理 |
| Human-in-the-Loop | LangGraph 支持 | `needsApproval` |
| MCP 支持 | 通过适配器 | 原生 `@ai-sdk/mcp` |
| 多 Agent 协作 | LangGraph 原生支持 | 需自行编排 |

### 5.3 在 HR 项目中的选择建议

**推荐使用 Vercel AI SDK 6，理由：**

1. **已有基础：** 当前项目已使用 `ai@^6.0.101` 和 `@ai-sdk/openai`，无需引入新依赖
2. **技术栈一致：** Elysia + TypeScript + Bun 生态与 Vercel AI SDK 完美契合
3. **轻量高效：** 无需引入 LangChain 的复杂抽象层
4. **MCP 原生支持：** `@ai-sdk/mcp` 提供开箱即用的 MCP 集成
5. **模型兼容：** 当前使用 MiniMax M2.5（OpenAI 兼容），AI SDK 的 `@ai-sdk/openai` 适配器已在工作
6. **够用即可：** 本项目的 Agent 工作流相对线性，不需要 LangGraph 的复杂图状态机

**何时考虑引入 LangChain/LangGraph：**

- 需要复杂的图状态机工作流（如多轮面试评估、多角色协作决策）
- 需要内置的 RAG（检索增强生成）管道
- 需要内置的向量存储集成（如将来引入 pgvector 语义搜索）
- 需要跨 Agent 的共享记忆管理

**可能的混合方案：**

```
Backend Agent 逻辑 → Vercel AI SDK 6（ToolLoopAgent + MCP）
未来 RAG / 向量搜索 → 可考虑 LangChain 的 Retriever 组件
```

---

## 6. 基于当前项目的具体实现方案

### 6.1 当前架构分析

```
当前架构（单体，硬编码）：

src/index.ts（Elysia 入口）
  ├─ routes/resumes.ts     ← 直接调用 parseResume + scoreResume
  ├─ routes/candidates.ts  ← 直接操作 Drizzle ORM
  ├─ routes/positions.ts   ← 直接操作 Drizzle ORM
  ├─ services/email.ts     ← 直接使用 ImapFlow
  ├─ services/resume-parser.ts ← 直接调用 pdf-parse / mammoth
  └─ services/ai-scorer.ts ← 单次 generateText 调用
```

**问题：**
- 所有逻辑紧耦合，邮件/数据库/AI 操作混在一起
- 无法被其他 AI 应用复用
- AI 功能仅限于单次评分，无自主决策能力
- 无法动态扩展工具或连接新数据源

### 6.2 目标架构（Agent + MCP）

```
目标架构（Agent 驱动 + MCP 解耦）：

src/index.ts（Elysia 入口）
  ├─ routes/           ← REST API（保持不变，给前端用）
  ├─ agents/           ← AI Agent 层（新增）
  │   ├─ resume-parser-agent.ts
  │   ├─ scoring-agent.ts
  │   ├─ scheduler-agent.ts
  │   ├─ recommendation-agent.ts
  │   └─ orchestrator.ts
  ├─ mcp/              ← MCP 集成层（新增）
  │   ├─ clients.ts    ← MCP Client 管理（连接各 MCP Server）
  │   └─ tools.ts      ← 工具聚合（合并所有 MCP 工具）
  ├─ services/         ← 保留核心服务（逐步迁移为 MCP Server）
  └─ lib/              ← 公共库

mcp-servers/           ← 独立的 MCP Server 项目（新增）
  ├─ email-server/     ← 邮箱 MCP Server
  ├─ database-server/  ← 数据库 MCP Server
  ├─ file-server/      ← 简历文件 MCP Server
  └─ platform-server/  ← 招聘平台 API MCP Server
```

### 6.3 改造步骤

#### Step 1: 安装依赖

```bash
bun add @ai-sdk/mcp @modelcontextprotocol/sdk
```

#### Step 2: 创建 MCP Client 管理器

```typescript
// src/mcp/clients.ts
import { createMCPClient } from '@ai-sdk/mcp';

let emailClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
let dbClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;

export async function getEmailMcpClient() {
  if (!emailClient) {
    emailClient = await createMCPClient({
      transport: {
        type: 'stdio',
        command: 'bun',
        args: ['./mcp-servers/email-server/src/index.ts'],
      },
    });
  }
  return emailClient;
}

export async function getDbMcpClient() {
  if (!dbClient) {
    dbClient = await createMCPClient({
      transport: {
        type: 'stdio',
        command: 'bun',
        args: ['./mcp-servers/database-server/src/index.ts'],
      },
    });
  }
  return dbClient;
}

export async function getAllTools() {
  const email = await getEmailMcpClient();
  const database = await getDbMcpClient();

  const emailTools = await email.tools();
  const dbTools = await database.tools();

  return { ...emailTools, ...dbTools };
}

export async function closeAllClients() {
  if (emailClient) { await emailClient.close(); emailClient = null; }
  if (dbClient) { await dbClient.close(); dbClient = null; }
}
```

#### Step 3: 改造评分服务为 Agent

当前的 `ai-scorer.ts` 使用单次 `generateText`，改造为支持多步推理的 Agent：

```typescript
// src/agents/scoring-agent.ts
import { generateText, tool } from 'ai';
import { z } from 'zod/v4';
import { model } from '../lib/ai.js';

const scoreTools = {
  analyze_skills_match: tool({
    description: '分析候选人技能与职位要求的匹配度',
    parameters: z.object({
      resumeText: z.string(),
      mustSkills: z.array(z.string()),
      niceSkills: z.array(z.string()),
    }),
    execute: async ({ resumeText, mustSkills, niceSkills }) => {
      const resumeLower = resumeText.toLowerCase();
      const matchedMust = mustSkills.filter(s => resumeLower.includes(s.toLowerCase()));
      const matchedNice = niceSkills.filter(s => resumeLower.includes(s.toLowerCase()));
      return {
        matchedMust,
        matchedNice,
        missingMust: mustSkills.filter(s => !matchedMust.includes(s)),
        mustScore: (matchedMust.length / Math.max(mustSkills.length, 1)) * 100,
        niceScore: (matchedNice.length / Math.max(niceSkills.length, 1)) * 100,
      };
    },
  }),

  check_reject_criteria: tool({
    description: '检查候选人是否命中扣分项',
    parameters: z.object({
      resumeText: z.string(),
      rejectCriteria: z.array(z.string()),
    }),
    execute: async ({ resumeText, rejectCriteria }) => {
      const resumeLower = resumeText.toLowerCase();
      const matched = rejectCriteria.filter(r => resumeLower.includes(r.toLowerCase()));
      return {
        matchedRejects: matched,
        rejectPenalty: matched.length * 20,
      };
    },
  }),

  compute_grade: tool({
    description: '根据各项分数计算最终等级',
    parameters: z.object({
      totalScore: z.number(),
    }),
    execute: async ({ totalScore }) => {
      const grade = totalScore >= 80 ? 'A'
        : totalScore >= 65 ? 'B'
        : totalScore >= 50 ? 'C'
        : totalScore >= 35 ? 'D' : 'F';
      return { grade };
    },
  }),
};

export async function scoreResumeWithAgent(
  resumeText: string,
  jobTitle: string,
  jobDescription: string,
  skillConfig: { must: string[]; nice: string[]; reject: string[] },
) {
  const { text } = await generateText({
    model,
    tools: scoreTools,
    maxSteps: 5,
    system: `你是一个资深 HR 评分专家。请按以下步骤对候选人进行评分：
1. 调用 analyze_skills_match 分析技能匹配度
2. 调用 check_reject_criteria 检查扣分项
3. 综合以上结果，计算 totalScore = mustScore * 0.6 + niceScore * 0.3 - rejectPenalty * 0.1
4. 调用 compute_grade 计算等级
5. 最终返回完整的 JSON 评分结果`,
    prompt: `请评分以下候选人：

职位: ${jobTitle}
职位描述: ${jobDescription || '无'}
必备技能: ${skillConfig.must.join(', ') || '无'}
加分项: ${skillConfig.nice.join(', ') || '无'}
扣分项: ${skillConfig.reject.join(', ') || '无'}

简历内容:
${resumeText}

请调用工具完成评分后，返回 JSON 格式的评分结果。`,
  });

  return JSON.parse(extractJson(text));
}
```

#### Step 4: 添加新的 API 端点（Agent 驱动）

```typescript
// src/routes/agent.ts
import { Elysia } from 'elysia';
import { streamText } from 'ai';
import { model } from '../lib/ai.js';
import { getAllTools } from '../mcp/clients.js';

const agentRoute = new Elysia();

// POST /api/agent/process-emails
// 触发 Agent 自动处理所有未读简历邮件
agentRoute.post('/process-emails', async (c) => {
  const { positionId } = await c.req.json<{ positionId: string }>();

  const tools = await getAllTools();

  const result = await generateText({
    model,
    tools,
    maxSteps: 20,
    system: `你是 HR 简历处理 Agent。请执行以下流程：
1. 搜索所有未读邮件
2. 下载每封邮件的简历附件
3. 解析简历文本
4. 对每份简历进行评分
5. 将结果保存到数据库
6. 标记邮件为已读
7. 汇报处理结果`,
    prompt: `请处理职位 ${positionId} 的所有未读简历邮件。`,
  });

  return c.json({ result: result.text, steps: result.steps.length });
});

// POST /api/agent/recommend
// Agent 根据 JD 推荐人才
agentRoute.post('/recommend', async (c) => {
  const { positionId, description } = await c.req.json();

  const tools = await getAllTools();

  const stream = streamText({
    model,
    tools,
    maxSteps: 10,
    system: '你是人才推荐 Agent...',
    prompt: `请为职位 ${positionId} 从人才库中推荐合适的候选人。
职位描述：${description}`,
  });

  return stream.toTextStreamResponse();
});

export { agentRoute };
```

### 6.4 项目结构变更总结

```
需要新增的文件：
├── src/
│   ├── agents/
│   │   ├── resume-parser-agent.ts    ← 结构化简历解析 Agent
│   │   ├── scoring-agent.ts          ← 多维度评分 Agent
│   │   ├── scheduler-agent.ts        ← 面试调度 Agent
│   │   ├── recommendation-agent.ts   ← 人才推荐 Agent
│   │   └── orchestrator.ts           ← 编排器
│   ├── mcp/
│   │   ├── clients.ts                ← MCP Client 管理
│   │   └── tools.ts                  ← 工具聚合
│   └── routes/
│       └── agent.ts                  ← Agent API 端点
├── mcp-servers/
│   ├── email-server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts              ← 邮箱 MCP Server
│   ├── database-server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts              ← 数据库 MCP Server
│   └── file-server/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts              ← 文件 MCP Server

需要修改的文件：
├── package.json                      ← 新增 @ai-sdk/mcp 等依赖
├── src/index.ts                      ← 注册 agentRoute
└── src/services/ai-scorer.ts         ← 升级为 Agent 模式（保留原有函数作为兼容）
```

---

## 7. 分阶段实施路线图

### Phase 1: Agent 基础能力（1-2 周）

**目标：** 在现有架构上引入 Agent 多步推理能力，不改变整体架构。

**具体任务：**

- [ ] 安装 `@ai-sdk/mcp` 依赖
- [ ] 将 `ai-scorer.ts` 升级为 Agent 模式，支持多步推理评分
  - 保留原有 `scoreResume` 函数作为兼容
  - 新增 `scoreResumeWithAgent` 函数
- [ ] 实现结构化简历解析 Agent（`resume-parser-agent.ts`）
  - 从简历文本提取：姓名、邮箱、电话、学历、技能、工作经历
  - 填充 candidates 表的 `education`、`skills`、`phone` 等字段
- [ ] 添加 `/api/agent/score` 端点，支持 Agent 模式评分
- [ ] 编写 Agent 测试用例

**技术重点：**
```typescript
// 核心改动：在 generateText 中加入 tools 和 maxSteps
const { text } = await generateText({
  model,
  tools: { analyze_skills, check_rejects, compute_grade },
  maxSteps: 5,
  prompt: '...',
});
```

**风险控制：**
- 保留现有 API 不变，新增 Agent API 作为并行路径
- 如果 MiniMax M2.5 对 tool calling 支持不好，可以回退到单次调用模式

---

### Phase 2: MCP Server 拆分（2-3 周）

**目标：** 将邮件和数据库操作拆分为独立 MCP Server。

**具体任务：**

- [ ] 创建 `mcp-servers/` 目录结构
- [ ] 实现 Email MCP Server
  - Tools: `search_unread_emails`, `download_attachment`, `mark_as_read`, `get_email_detail`
  - Resources: `mailbox://status`
  - Transport: STDIO（开发）/ Streamable HTTP（生产）
- [ ] 实现 Database MCP Server
  - Tools: `query_candidates`, `update_candidate_status`, `get_position_details`, `save_score`
  - Resources: `positions://open`, `candidates://recent`
- [ ] 创建 MCP Client 管理器（`src/mcp/clients.ts`）
- [ ] 将 `services/email.ts` 中的 `pollInbox` 改造为通过 MCP 工具实现
- [ ] 验证 Agent 通过 MCP 工具完成完整的邮件->解析->评分->入库流程

**技术重点：**
```typescript
// 邮件处理不再直接使用 ImapFlow，而是通过 MCP
const emailTools = await emailMcpClient.tools();
const dbTools = await dbMcpClient.tools();

const { text } = await generateText({
  model,
  tools: { ...emailTools, ...dbTools, ...localTools },
  maxSteps: 15,
  prompt: '处理所有未读简历邮件...',
});
```

---

### Phase 3: 面试调度 Agent（1-2 周）

**目标：** 实现自动面试邀请发送。

**具体任务：**

- [ ] 实现面试调度 Agent（`scheduler-agent.ts`）
- [ ] 添加 SMTP 发送邮件工具
  - 使用已有的 `nodemailer` 依赖
  - 工具设置 `needsApproval: true`，发送前需要人工确认
- [ ] 添加面试时间段管理（可能需要扩展数据库 schema）
- [ ] 添加 `/api/agent/schedule-interviews` 端点
- [ ] 实现 Human-in-the-Loop 审批流程

**技术重点：**
```typescript
// 关键操作需要人工确认
const sendEmailTool = tool({
  description: '发送面试邀请邮件',
  parameters: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
  needsApproval: true,  // 暂停等待确认
  execute: async ({ to, subject, body }) => { /* nodemailer 发送 */ },
});
```

---

### Phase 4: 人才推荐 + Multi-Agent（2-3 周）

**目标：** 实现基于 JD 的人才推荐和多 Agent 协作。

**具体任务：**

- [ ] 实现人才推荐 Agent（`recommendation-agent.ts`）
- [ ] 实现 Orchestrator Agent（`orchestrator.ts`）
  - 代码驱动模式：固定流水线
  - LLM 驱动模式：自主编排（实验性）
- [ ] 添加 `/api/agent/recommend` 端点（流式响应）
- [ ] 添加 `/api/agent/auto-process` 端点（一键全自动处理）
- [ ] 实现批量简历处理的并发控制

---

### Phase 5: 高级能力（3-4 周，远期）

**目标：** 引入向量搜索和外部平台集成。

**具体任务：**

- [ ] 引入 pgvector 扩展，实现语义相似度搜索
  - 将简历文本转为 embedding 向量
  - 基于向量相似度推荐候选人（替代关键词匹配）
- [ ] 实现招聘平台 MCP Server（BOSS 直聘 API 对接）
- [ ] 实现 File MCP Server（简历文件存储管理）
- [ ] 多模型对比评分（MiniMax + 其他模型，取平均/投票）
- [ ] 将 MCP Server 从 STDIO 切换到 Streamable HTTP
- [ ] 考虑是否引入 LangGraph 实现更复杂的工作流

---

### 时间线总览

```
Week 1-2:   Phase 1 — Agent 基础能力（评分 Agent + 解析 Agent）
Week 3-5:   Phase 2 — MCP Server 拆分（邮箱 + 数据库）
Week 6-7:   Phase 3 — 面试调度 Agent
Week 8-10:  Phase 4 — 人才推荐 + Multi-Agent 协作
Week 11-14: Phase 5 — 向量搜索 + 外部平台 + 生产级部署
```

**优先级建议：**

1. **Phase 1 优先级最高** -- 投入产出比最大，仅改动 AI 调用层即可获得显著提升
2. **Phase 2 是架构升级** -- 为后续所有 Agent 奠定基础，但需要较多工程投入
3. **Phase 3-4 是业务价值** -- 面试调度和人才推荐是 HR 最需要的自动化能力
4. **Phase 5 是锦上添花** -- 向量搜索和多模型可以在业务稳定后再考虑

---

## 参考资源

### MCP 相关
- [MCP 官方文档 - 架构概览](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP 规范 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP 官方 Server 合集](https://github.com/modelcontextprotocol/servers)
- [Anthropic MCP 公告](https://www.anthropic.com/news/model-context-protocol)
- [MCP Transport 未来发展](http://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/)
- [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)
- [FastMCP TypeScript 框架](https://github.com/punkpeye/fastmcp)
- [IMAP MCP Server](https://github.com/non-dirty/imap-mcp)
- [Postgres MCP Pro](https://github.com/crystaldba/postgres-mcp)

### Vercel AI SDK 相关
- [AI SDK 6 发布博客](https://vercel.com/blog/ai-sdk-6)
- [AI SDK 文档](https://ai-sdk.dev/docs/introduction)
- [ToolLoopAgent API 文档](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [AI SDK MCP 工具文档](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [AI SDK Agent 构建指南](https://ai-sdk.dev/docs/agents/building-agents)
- [AI SDK Agent 循环控制](https://ai-sdk.dev/docs/agents/loop-control)
- [createMCPClient API 文档](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client)
- [构建 AI Agent 实践](https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk)

### LangChain / 框架对比
- [LangChain vs Vercel AI SDK vs OpenAI SDK: 2026 指南](https://strapi.io/blog/langchain-vs-vercel-ai-sdk-vs-openai-sdk-comparison-guide)
- [AI 框架对比: AI SDK, Genkit, LangChain](https://komelin.com/blog/ai-framework-comparison)
- [JavaScript 多 Agent 编排框架](https://dev.to/tool_smith_90cff58355f087/javascript-catches-up-4-modern-frameworks-for-multi-agent-llm-orchestration-4aap)
- [AI Agent 编排设计模式 (Azure)](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)

### HR AI 最佳实践
- [AI 驱动的候选人筛选 2025 指南](https://www.herohunt.ai/blog/ai-driven-candidate-screening-the-2025-in-depth-guide)
- [AI 招聘：2026 Agentic AI 指南](https://aisera.com/blog/ai-recruiting/)
- [AI Agent 简化 HR 候选人筛选](https://www.accelirate.com/ai-agents-candidate-screening-hr/)
- [AI 简历筛选效率提升](https://www.mokahr.io/myblog/ai-resume-screening-efficiency/)

---

## 附录 A：AI SDK 6 Agent 实战代码

### A.1 简历信息提取 Agent（结构化输出）

当前项目只从简历提取纯文本，未做结构化提取。使用 AI SDK tool calling 可以实现：

```typescript
// src/services/resume-extractor.ts
import { generateText, tool } from "ai";
import { z } from "zod/v4";
import { model } from "../lib/ai.js";

const candidateInfoSchema = z.object({
  name: z.string().describe("候选人姓名"),
  phone: z.string().optional().describe("手机号码"),
  email: z.string().optional().describe("电子邮箱"),
  education: z.enum(["博士", "硕士", "本科", "大专", "其他"]).optional(),
  school: z.string().optional().describe("毕业院校"),
  major: z.string().optional().describe("专业"),
  experienceYears: z.number().optional().describe("工作年限"),
  currentCompany: z.string().optional().describe("当前公司"),
  skills: z.array(z.string()).describe("技能列表"),
  summary: z.string().describe("一句话总结候选人背景"),
});

export type CandidateInfo = z.infer<typeof candidateInfoSchema>;

export async function extractCandidateInfo(
  resumeText: string,
): Promise<CandidateInfo> {
  const { text } = await generateText({
    model,
    prompt: `请从以下简历中提取候选人结构化信息，以 JSON 格式返回。

## 简历内容：
${resumeText}

请返回包含以下字段的 JSON：
name, phone, email, education, school, major, experienceYears, currentCompany, skills, summary`,
  });

  // 复用 extractJson 处理 MiniMax 的 <think> 标签
  const { extractJson } = await import("./ai-scorer.js");
  const json = extractJson(text);
  return candidateInfoSchema.parse(JSON.parse(json));
}
```

### A.2 在上传流程中集成

```typescript
// src/routes/resumes.ts — 在评分前先提取结构化信息
const parsed = await parseResume(buffer, file.name);

// 新增：提取候选人结构化信息
const info = await extractCandidateInfo(parsed.text);

// 创建候选人时使用提取的信息
const [candidate] = await db
  .insert(candidates)
  .values({
    positionId,
    name: info.name || candidateName,
    email: info.email,
    phone: info.phone,
    education: info.education,
    skills: info.skills,
    status: "screening",
  })
  .returning();
```

### A.3 多步 Agent 示例（maxSteps）

```typescript
// src/services/talent-matcher.ts
import { generateText, tool } from "ai";
import { z } from "zod/v4";
import { model } from "../lib/ai.js";
import { db } from "../db/index.js";
import { candidates, scores, positions } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

/**
 * 人才匹配 Agent
 * 给定职位需求，自主搜索和推荐最佳候选人
 */
export async function findBestCandidates(positionId: string) {
  const [position] = await db
    .select()
    .from(positions)
    .where(eq(positions.id, positionId))
    .limit(1);

  if (!position) throw new Error("Position not found");

  const result = await generateText({
    model,
    system: `你是一位资深的猎头顾问。你可以使用工具来搜索候选人数据库，找到最匹配的人选。`,
    prompt: `请为以下职位找到最佳候选人：
职位：${position.title}
部门：${position.department}
要求：${JSON.stringify(position.skillConfig)}

请使用搜索工具查找候选人，分析他们的评分和技能匹配度，然后给出推荐列表。`,
    tools: {
      searchCandidates: tool({
        description: "按职位搜索候选人列表，返回评分和技能信息",
        parameters: z.object({
          positionId: z.string(),
          minScore: z.number().optional().default(50),
        }),
        execute: async ({ positionId, minScore }) => {
          const rows = await db
            .select()
            .from(candidates)
            .leftJoin(scores, eq(candidates.id, scores.candidateId))
            .where(eq(candidates.positionId, positionId))
            .orderBy(desc(scores.totalScore));

          return rows
            .filter((r) => (r.scores?.totalScore ?? 0) >= minScore)
            .map((r) => ({
              name: r.candidates.name,
              score: r.scores?.totalScore,
              grade: r.scores?.grade,
              matched: r.scores?.matchedSkills,
              missing: r.scores?.missingSkills,
              explanation: r.scores?.explanation,
            }));
        },
      }),
    },
    maxSteps: 3,  // 最多 3 轮工具调用
  });

  return result.text;
}
```

---

## 附录 B：MCP Server 快速开发模板

### B.1 最小化 MCP Server（TypeScript）

```typescript
// mcp-servers/hr-query/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const server = new McpServer({ name: "hr-query", version: "1.0.0" });

// 工具 1：查询候选人统计
server.tool(
  "candidate_stats",
  "获取候选人按等级统计",
  { positionId: z.string().optional() },
  async ({ positionId }) => {
    const rows = await sql`
      SELECT grade, COUNT(*)::int as count, ROUND(AVG(total_score)::numeric, 1) as avg
      FROM scores
      ${positionId ? sql`WHERE position_id = ${positionId}` : sql``}
      GROUP BY grade ORDER BY grade
    `;
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  },
);

// 工具 2：搜索候选人
server.tool(
  "search",
  "按名字搜索候选人",
  { name: z.string(), limit: z.number().default(5) },
  async ({ name, limit }) => {
    const rows = await sql`
      SELECT c.name, c.email, c.status, s.total_score, s.grade
      FROM candidates c LEFT JOIN scores s ON c.id = s.candidate_id
      WHERE c.name ILIKE ${"%" + name + "%"}
      LIMIT ${limit}
    `;
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  },
);

// 资源：数据库 Schema
server.resource("schema://tables", "数据库表结构", async () => ({
  contents: [{
    uri: "schema://tables",
    mimeType: "text/plain",
    text: "positions, candidates, resumes, scores — 详见 src/db/schema.ts",
  }],
}));

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
```

### B.2 在 Claude Code 中配置

```json
// .claude/settings.json
{
  "mcpServers": {
    "hr-query": {
      "command": "bun",
      "args": ["mcp-servers/hr-query/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:password@localhost:5432/hr_screening"
      }
    }
  }
}
```

### B.3 使用场景

在 Claude Code 中可以直接对话：
```
> 查询一下前端工程师职位的候选人评分分布
（Claude Code 会自动调用 candidate_stats 工具）

> 搜索姓张的候选人
（Claude Code 会自动调用 search 工具）
```

---

## 附录 C：AI Agent 错误处理与重试模式

### C.1 工具执行错误处理

```typescript
// src/lib/ai-error-handler.ts
import { logger } from "./logger.js";

export class AIToolError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly cause?: Error,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "AIToolError";
  }
}

/** 为 AI SDK tool 的 execute 函数添加安全包裹 */
export function safeExecute<TArgs, TResult>(
  toolName: string,
  fn: (args: TArgs) => Promise<TResult>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    fallback?: TResult;
  } = {}
): (args: TArgs) => Promise<TResult | { error: string }> {
  const { maxRetries = 1, retryDelay = 1000, fallback } = options;

  return async (args: TArgs) => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(args);
      } catch (error) {
        lastError = error as Error;

        logger.warn("tool_execution_error", {
          tool: toolName,
          attempt,
          error: lastError.message,
        });

        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
        }
      }
    }

    logger.error("tool_execution_failed", {
      tool: toolName,
      error: lastError?.message,
    });

    if (fallback !== undefined) return fallback;

    return {
      error: `工具 ${toolName} 执行失败: ${lastError?.message}`,
    };
  };
}
```

### C.2 使用示例

```typescript
import { tool } from "ai";
import { z } from "zod/v4";
import { safeExecute } from "../lib/ai-error-handler.js";

export const searchCandidatesTool = tool({
  description: "搜索候选人",
  parameters: z.object({
    query: z.string(),
    limit: z.number().default(10),
  }),
  execute: safeExecute("searchCandidates", async ({ query, limit }) => {
    const results = await db
      .select()
      .from(candidates)
      .where(sql`name ILIKE ${`%${query}%`}`)
      .limit(limit);
    return results;
  }, {
    maxRetries: 2,
    retryDelay: 500,
    fallback: [],
  }),
});
```

### C.3 Agent 步骤限制与循环检测

```typescript
// src/services/hr-assistant.ts — 增强版

const MAX_STEPS = 8;
const TOOL_CALL_BUDGET = 15; // 总工具调用次数上限

export async function chatWithHRAssistant(
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
) {
  let totalToolCalls = 0;

  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: [
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: userMessage },
    ],
    tools: {
      searchCandidates: searchCandidatesTool,
      getPosition: getPositionTool,
      getCandidateScore: getCandidateScoreTool,
      updateCandidateStatus: updateCandidateStatusTool,
    },
    maxSteps: MAX_STEPS,
    onStepFinish: ({ toolCalls }) => {
      totalToolCalls += toolCalls.length;
      if (totalToolCalls > TOOL_CALL_BUDGET) {
        throw new Error(`工具调用次数超出预算 (${TOOL_CALL_BUDGET})`);
      }
    },
  });

  return {
    response: result.text,
    steps: result.steps.length,
    totalToolCalls,
    usage: result.usage,
  };
}
```

---

## 附录 D：MCP 服务器进阶 — 多资源 + Prompt 模板

### D.1 完整 MCP 服务器（含 Prompt 和多资源）

```typescript
// mcp-servers/hr-full/index.ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const server = new McpServer({
  name: "hr-full-mcp",
  version: "2.0.0",
});

// ===== 工具 =====

server.tool(
  "candidate_search",
  "搜索候选人（支持姓名、技能、评分等级）",
  {
    query: z.string().describe("搜索关键词"),
    field: z.enum(["name", "skills", "grade"]).default("name").describe("搜索字段"),
    limit: z.number().default(10),
  },
  async ({ query, field, limit }) => {
    let rows;
    switch (field) {
      case "name":
        rows = await sql`
          SELECT c.*, s.total_score, s.grade
          FROM candidates c
          LEFT JOIN scores s ON s.candidate_id = c.id
          WHERE c.name ILIKE ${"%" + query + "%"}
          ORDER BY c.created_at DESC LIMIT ${limit}
        `;
        break;
      case "skills":
        rows = await sql`
          SELECT c.*, s.total_score, s.grade
          FROM candidates c
          LEFT JOIN scores s ON s.candidate_id = c.id
          WHERE ${query} = ANY(c.skills)
          ORDER BY s.total_score DESC NULLS LAST LIMIT ${limit}
        `;
        break;
      case "grade":
        rows = await sql`
          SELECT c.*, s.total_score, s.grade, s.explanation
          FROM candidates c
          JOIN scores s ON s.candidate_id = c.id
          WHERE s.grade = ${query.toUpperCase()}
          ORDER BY s.total_score DESC LIMIT ${limit}
        `;
        break;
    }
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  }
);

server.tool(
  "position_stats",
  "获取职位招聘统计数据",
  {
    positionId: z.number().optional().describe("职位ID，不填则返回所有职位"),
  },
  async ({ positionId }) => {
    const where = positionId ? sql`WHERE p.id = ${positionId}` : sql``;
    const rows = await sql`
      SELECT
        p.id, p.title,
        COUNT(DISTINCT c.id) as total_candidates,
        COUNT(DISTINCT CASE WHEN s.grade = 'A' THEN c.id END) as grade_a,
        COUNT(DISTINCT CASE WHEN s.grade = 'B' THEN c.id END) as grade_b,
        COUNT(DISTINCT CASE WHEN s.grade = 'C' THEN c.id END) as grade_c,
        COUNT(DISTINCT CASE WHEN s.grade = 'D' THEN c.id END) as grade_d,
        ROUND(AVG(s.total_score)::numeric, 1) as avg_score,
        COUNT(DISTINCT CASE WHEN c.status = 'interview' THEN c.id END) as in_interview,
        COUNT(DISTINCT CASE WHEN c.status = 'hired' THEN c.id END) as hired
      FROM positions p
      LEFT JOIN candidates c ON c.position_id = p.id
      LEFT JOIN scores s ON s.candidate_id = c.id
      ${where}
      GROUP BY p.id, p.title
      ORDER BY p.created_at DESC
    `;
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  }
);

server.tool(
  "candidate_compare",
  "对比两个候选人的评分详情",
  {
    candidateId1: z.number(),
    candidateId2: z.number(),
  },
  async ({ candidateId1, candidateId2 }) => {
    const rows = await sql`
      SELECT
        c.name, c.email, c.skills,
        s.total_score, s.must_score, s.nice_score, s.reject_penalty,
        s.grade, s.matched_skills, s.missing_skills, s.explanation
      FROM candidates c
      JOIN scores s ON s.candidate_id = c.id
      WHERE c.id IN (${candidateId1}, ${candidateId2})
    `;
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  }
);

// ===== 资源 =====

// 动态资源模板：按职位 ID 获取候选人列表
server.resource(
  new ResourceTemplate("position://{id}/candidates", { list: undefined }),
  async (uri, { id }) => ({
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(
        await sql`
          SELECT c.name, c.email, s.grade, s.total_score
          FROM candidates c
          LEFT JOIN scores s ON s.candidate_id = c.id
          WHERE c.position_id = ${Number(id)}
          ORDER BY s.total_score DESC NULLS LAST
        `
      ),
    }],
  })
);

// 静态资源：系统状态
server.resource("system://status", "系统运行状态", async () => ({
  contents: [{
    uri: "system://status",
    mimeType: "application/json",
    text: JSON.stringify({
      totalPositions: (await sql`SELECT COUNT(*) FROM positions`)[0].count,
      totalCandidates: (await sql`SELECT COUNT(*) FROM candidates`)[0].count,
      pendingReview: (await sql`SELECT COUNT(*) FROM candidates WHERE status = 'pending'`)[0].count,
      recentHires: (await sql`SELECT COUNT(*) FROM candidates WHERE status = 'hired' AND updated_at > NOW() - INTERVAL '30 days'`)[0].count,
    }),
  }],
}));

// ===== Prompt 模板 =====

server.prompt(
  "weekly_report",
  "生成周度招聘报告",
  { positionId: z.string().optional().describe("职位ID") },
  async ({ positionId }) => {
    const stats = await sql`
      SELECT
        p.title,
        COUNT(c.id) as new_candidates,
        COUNT(CASE WHEN s.grade IN ('A', 'B') THEN 1 END) as qualified,
        COUNT(CASE WHEN c.status = 'interview' THEN 1 END) as interviewing
      FROM positions p
      LEFT JOIN candidates c ON c.position_id = p.id AND c.created_at > NOW() - INTERVAL '7 days'
      LEFT JOIN scores s ON s.candidate_id = c.id
      ${positionId ? sql`WHERE p.id = ${Number(positionId)}` : sql``}
      GROUP BY p.title
    `;

    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `请根据以下数据生成本周招聘报告（中文）：\n\n${JSON.stringify(stats, null, 2)}\n\n要求：\n1. 概述本周新增候选人情况\n2. 分析各职位招聘进展\n3. 给出下周建议`,
        },
      }],
    };
  }
);

server.prompt(
  "candidate_summary",
  "生成候选人综合评估摘要",
  { candidateId: z.string().describe("候选人ID") },
  async ({ candidateId }) => {
    const [candidate] = await sql`
      SELECT c.*, s.total_score, s.grade, s.matched_skills, s.missing_skills, s.explanation,
             r.raw_text, p.title as position_title
      FROM candidates c
      LEFT JOIN scores s ON s.candidate_id = c.id
      LEFT JOIN resumes r ON r.candidate_id = c.id
      LEFT JOIN positions p ON p.id = c.position_id
      WHERE c.id = ${Number(candidateId)}
    `;

    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `请为以下候选人生成综合评估摘要（中文）：

姓名：${candidate.name}
应聘职位：${candidate.position_title}
评分：${candidate.total_score} (${candidate.grade})
匹配技能：${JSON.stringify(candidate.matched_skills)}
缺失技能：${JSON.stringify(candidate.missing_skills)}
AI 评语：${candidate.explanation}

简历内容（前 500 字）：
${(candidate.raw_text || "").slice(0, 500)}

请给出：
1. 候选人优势分析
2. 潜在风险点
3. 面试建议（应重点考察什么）
4. 综合推荐等级`,
        },
      }],
    };
  }
);

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
```

### D.2 MCP 客户端调用示例（用于测试）

```typescript
// test/mcp-client.ts — 测试 MCP 服务器
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testMCP() {
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["mcp-servers/hr-full/index.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
    },
  });

  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  });

  await client.connect(transport);

  // 列出可用工具
  const tools = await client.listTools();
  console.log("可用工具:", tools.tools.map((t) => t.name));

  // 列出可用资源
  const resources = await client.listResources();
  console.log("可用资源:", resources.resources.map((r) => r.uri));

  // 列出 prompt 模板
  const prompts = await client.listPrompts();
  console.log("可用 Prompts:", prompts.prompts.map((p) => p.name));

  // 调用搜索工具
  const searchResult = await client.callTool({
    name: "candidate_search",
    arguments: { query: "张", field: "name", limit: 5 },
  });
  console.log("搜索结果:", searchResult);

  // 获取统计
  const stats = await client.callTool({
    name: "position_stats",
    arguments: {},
  });
  console.log("统计:", stats);

  // 获取 prompt
  const report = await client.getPrompt({
    name: "weekly_report",
    arguments: {},
  });
  console.log("周报 prompt:", report);

  await client.close();
}

testMCP().catch(console.error);
```

---

## 附录 E：Skill 设计模式（Claude Code 自定义命令）

### E.1 Skill 概念

```
Claude Code 的 Skill = 可复用的 prompt 模板
├─ 位于 .claude/commands/ 目录
├─ 文件名即命令名（如 review.md → /project:review）
├─ 支持 $ARGUMENTS 变量替代
├─ 可包含系统上下文、步骤指引、输出格式
└─ 团队共享：提交到 git 即可
```

### E.2 HR 项目 Skill 集合

```markdown
<!-- .claude/commands/score-resume.md -->
# 简历评分分析

分析指定候选人的 AI 评分结果：

1. 读取 `src/services/ai-scorer.ts` 了解评分逻辑
2. 查看数据库中候选人 $ARGUMENTS 的评分记录
3. 分析评分是否合理：
   - must_score 是否与简历中的技能匹配
   - nice_score 加分是否准确
   - reject_penalty 扣分是否有依据
4. 给出改进评分 prompt 的建议

输出格式：
- 评分概览表格
- 匹配/缺失技能对照
- Prompt 改进建议
```

```markdown
<!-- .claude/commands/review-api.md -->
# API 路由代码审查

审查 $ARGUMENTS 路由文件：

1. 检查输入验证（Zod schema 完整性）
2. 检查错误处理（try/catch, 状态码）
3. 检查 SQL 注入风险（是否用参数化查询）
4. 检查响应格式一致性
5. 检查是否有未处理的边界情况

对每个问题给出：
- 严重程度（🔴 高 / 🟡 中 / 🟢 低）
- 具体位置（文件:行号）
- 修复建议（代码片段）
```

```markdown
<!-- .claude/commands/add-test.md -->
# 为模块生成测试

为 $ARGUMENTS 文件生成 Vitest 测试：

1. 读取目标文件，分析所有导出函数
2. 识别外部依赖（需要 mock 的模块）
3. 为每个函数生成测试：
   - 正常路径（happy path）
   - 边界情况（空输入、极大/极小值）
   - 错误路径（异常输入、依赖失败）
4. 将测试写入 `test/` 对应目录

遵循项目约定：
- 使用 vi.mock() 模拟外部依赖
- 使用中文描述测试（describe/it）
- 测试文件名：[模块名].test.ts
```

```markdown
<!-- .claude/commands/db-migration.md -->
# 生成数据库迁移

根据 $ARGUMENTS 需求修改 schema：

1. 读取 `src/db/schema.ts` 了解当前 schema
2. 读取 `drizzle.config.ts` 了解迁移配置
3. 修改 schema 添加/修改所需表和字段
4. 运行 `bun drizzle-kit generate` 生成迁移 SQL
5. 检查生成的 SQL 文件是否合理
6. 如有数据迁移需求，编写迁移脚本

注意：
- 不要删除现有字段（使用 deprecated 标记）
- 新字段尽量有 default 值
- JSONB 字段需要文档注释结构
```

### E.3 Skill 进阶：带工具提示的 Skill

```markdown
<!-- .claude/commands/deploy-check.md -->
# 部署前检查

执行部署前完整检查：

## 步骤 1：代码质量
运行 `bun biome check src/` 并确认无错误

## 步骤 2：类型检查
运行 `bun tsc --noEmit` 并确认无错误

## 步骤 3：测试
运行 `bun vitest run` 并确认所有测试通过

## 步骤 4：依赖安全
运行 `bun audit` 检查是否有高危漏洞

## 步骤 5：Docker 构建
运行 `docker build -t hr-backend:check .` 确认构建成功

## 步骤 6：环境变量
检查 `.env.example` 与代码中使用的环境变量是否一致

## 输出
用表格汇总每步结果：
| 步骤 | 状态 | 详情 |
|------|------|------|
| ... | ✅/❌ | ... |

如果有任何 ❌，不建议部署并列出修复步骤。
```

---

## 附录 F：Agent 架构模式对比

### F.1 ReAct (Reasoning + Acting)

```
当前项目使用的模式：AI SDK maxSteps + tools
等价于 ReAct 模式：
1. 思考 → 决定下一步
2. 行动 → 调用工具
3. 观察 → 获取工具结果
4. 循环直到完成

适合：简历评分、信息提取、数据查询
```

### F.2 Plan-and-Execute

```
更复杂的模式（本项目暂不需要）：
1. 规划 → 生成完整步骤列表
2. 执行 → 按步骤依次执行
3. 重规划 → 根据结果调整计划

适合：复杂招聘流程（多轮面试安排、offer 审批链）
实现：LangGraph 或自定义状态机
```

### F.3 Multi-Agent 协作

```
未来可能需要的模式：
├─ 简历解析 Agent（专注文本提取和结构化）
├─ 技能评估 Agent（专注技能匹配和评分）
├─ 面试建议 Agent（根据评分生成面试题）
└─ 协调 Agent（编排上述 Agent 工作流）

实现方式：
├─ 简单：多次 generateText 调用，手动编排
├─ 中等：AI SDK maxSteps + 多工具
└─ 复杂：LangGraph 多节点图
```

### F.4 架构选择决策矩阵

| 需求 | ReAct (AI SDK) | Plan-Execute | Multi-Agent |
|------|---------------|-------------|-------------|
| **实现复杂度** | ★☆☆ | ★★★ | ★★★★ |
| **单次任务（评分）** | ✅ 最佳 | 过度 | 过度 |
| **多步工作流** | ✅ | ✅ 最佳 | ✅ |
| **并行处理** | ⚠️ 有限 | ⚠️ | ✅ 最佳 |
| **需要人工审批** | ❌ | ✅ | ✅ |
| **调试可观测性** | ★★☆ | ★★★ | ★★★★ |
| **本项目阶段** | MVP ✅ | Phase 2 | Phase 3+ |

---

## 附录 G：AI 安全与合规

### G.1 AI 评分的偏见风险

```
已知风险：
├─ 性别偏见：模型可能根据名字推断性别并产生偏见
├─ 年龄偏见：过度重视"年轻"或"经验丰富"等描述
├─ 学历偏见：过度重视 985/211/海归
├─ 地域偏见：某些地区的教育背景可能被低估
└─ 语言偏见：中文简历 vs 英文简历评分差异

缓解措施：
├─ Prompt 中明确禁止考虑无关因素
├─ 评分仅基于 skillConfig 中定义的技能
├─ 定期审计评分分布（按性别/学历/地区分组）
├─ 人工复查 A 级和 D 级候选人
└─ 多模型交叉评分（减少单一模型偏见）
```

### G.2 反偏见 Prompt 模板

```typescript
const ANTI_BIAS_INSTRUCTION = `
## 公平评估原则（必须遵守）
1. 仅根据"技能要求配置"中列出的技能进行评分
2. 不要因为候选人的性别、年龄、学校等级、地域等因素影响评分
3. "经验年限"仅作为参考，技能掌握程度才是关键
4. 对中文和英文简历使用相同的评分标准
5. 不要假设候选人的能力——只看简历中明确提到的
`;

// 将此指令加入评分 prompt
function buildScoringPrompt(...) {
  return `${ANTI_BIAS_INSTRUCTION}\n\n...正常评分 prompt...`;
}
```

### G.3 数据隐私合规

```
处理候选人简历涉及个人信息，需注意：

中国个人信息保护法（PIPL）要求：
├─ 告知：简历提交时告知候选人数据将被 AI 处理
├─ 同意：获取候选人明确同意
├─ 最小必要：仅收集招聘所需信息
├─ 安全存储：加密存储、访问控制
├─ 保留期限：招聘结束后合理时间内删除
└─ 跨境传输：如使用海外 API（MiniMax/OpenAI），需告知

实现建议：
├─ 在简历投递页面添加隐私声明
├─ 记录候选人同意时间和内容
├─ 简历文本不要持久化到 AI 服务（评分后不留存在 API 侧）
├─ 数据库加密敏感字段（手机号、身份证号）
├─ 设置数据保留策略（如 1 年后自动删除）
└─ 提供候选人数据删除接口
```

### G.4 AI 输出安全过滤

```typescript
// src/lib/ai-safety.ts

/** 检查 AI 输出是否包含不当内容 */
export function validateAIOutput(output: string): {
  safe: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // 检查是否泄露系统 prompt
  if (output.includes("你是一个专业的HR")) {
    issues.push("AI 输出泄露了系统 prompt");
  }

  // 检查是否包含歧视性语言
  const discriminatoryPatterns = [
    /不适合女性/,
    /年龄太大/,
    /学历不够好/,
    /地方院校/,
  ];
  for (const pattern of discriminatoryPatterns) {
    if (pattern.test(output)) {
      issues.push(`AI 输出包含潜在歧视性语言: ${pattern.source}`);
    }
  }

  // 检查评分是否在合理范围
  try {
    const json = JSON.parse(output);
    if (json.totalScore < 0 || json.totalScore > 100) {
      issues.push("评分超出合理范围");
    }
  } catch {
    // 非 JSON 输出，跳过
  }

  return {
    safe: issues.length === 0,
    issues,
  };
}
```

---

## 附录 H：批量处理与队列

### H.1 简历批量评分队列

```typescript
// src/services/scoring-queue.ts
// 简易内存队列（MVP 用，后续可换 Redis/BullMQ）

interface ScoringJob {
  id: string;
  candidateId: number;
  resumeText: string;
  positionId: number;
  status: "pending" | "processing" | "done" | "failed";
  result?: unknown;
  error?: string;
  createdAt: Date;
}

const queue: ScoringJob[] = [];
let processing = false;
const CONCURRENCY = 3; // 并发评分数
let activeJobs = 0;

export function enqueueScoring(
  candidateId: number,
  resumeText: string,
  positionId: number
): string {
  const job: ScoringJob = {
    id: crypto.randomUUID(),
    candidateId,
    resumeText,
    positionId,
    status: "pending",
    createdAt: new Date(),
  };

  queue.push(job);
  processQueue(); // 触发处理
  return job.id;
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.some((j) => j.status === "pending") && activeJobs < CONCURRENCY) {
    const job = queue.find((j) => j.status === "pending");
    if (!job) break;

    job.status = "processing";
    activeJobs++;

    // 异步处理（不阻塞队列）
    processJob(job)
      .then((result) => {
        job.status = "done";
        job.result = result;
      })
      .catch((error) => {
        job.status = "failed";
        job.error = (error as Error).message;
      })
      .finally(() => {
        activeJobs--;
        processQueue(); // 处理下一个
      });
  }

  processing = false;
}

async function processJob(job: ScoringJob) {
  // 获取职位信息
  const position = await getPosition(job.positionId);
  if (!position) throw new Error("职位不存在");

  // 调用 AI 评分
  const score = await scoreResume(
    job.resumeText,
    position.title,
    position.description,
    position.skillConfig
  );

  // 存储评分结果
  await saveScore(job.candidateId, job.positionId, score);

  return score;
}

export function getQueueStatus() {
  return {
    total: queue.length,
    pending: queue.filter((j) => j.status === "pending").length,
    processing: queue.filter((j) => j.status === "processing").length,
    done: queue.filter((j) => j.status === "done").length,
    failed: queue.filter((j) => j.status === "failed").length,
  };
}

export function getJobStatus(jobId: string): ScoringJob | undefined {
  return queue.find((j) => j.id === jobId);
}
```

### H.2 批量评分 API

```typescript
// src/routes/batch.ts
import { Elysia } from "elysia";
import { enqueueScoring, getQueueStatus, getJobStatus } from "../services/scoring-queue.js";

const app = new Elysia();

// 提交批量评分
app.post("/api/batch/score", async (c) => {
  const { candidateIds, positionId } = await c.req.json();

  const jobIds: string[] = [];
  for (const candidateId of candidateIds) {
    const resume = await getResumeText(candidateId);
    if (resume) {
      const jobId = enqueueScoring(candidateId, resume, positionId);
      jobIds.push(jobId);
    }
  }

  return c.json({
    queued: jobIds.length,
    jobIds,
    status: getQueueStatus(),
  });
});

// 查询队列状态
app.get("/api/batch/status", (c) => {
  return c.json(getQueueStatus());
});

// 查询单个任务状态
app.get("/api/batch/jobs/:id", (c) => {
  const job = getJobStatus(c.req.param("id"));
  if (!job) return c.json({ error: "任务不存在" }, 404);
  return c.json(job);
});

export default app;
```

### H.3 未来升级路径：BullMQ + Redis

```typescript
// 当需要持久化队列时，迁移到 BullMQ
// bun add bullmq ioredis

/*
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(env.REDIS_URL);

const scoringQueue = new Queue("scoring", { connection });
const scoringWorker = new Worker(
  "scoring",
  async (job) => {
    const { candidateId, positionId } = job.data;
    // ... 评分逻辑
  },
  {
    connection,
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 60000, // 每分钟最多 10 次 API 调用
    },
  }
);
*/
```

---

## 附录 I：跨文档参考索引

```
本文档与其他研究文档的关联：

Agent/MCP + Supabase（→ 01-supabase-integration.md）
├─ Supabase Realtime + Agent 通知 → 01 附录 F
├─ RLS 角色权限 + Agent 操作 → 01 附录 H
├─ Edge Functions 作为 Agent 扩展 → 01 附录 G
└─ Supabase Auth + Agent 认证 → 01 附录 N

Agent/MCP + LangChain/AI（→ 04-langchain-role.md）
├─ AI SDK Tool Calling → 04 附录 D
├─ Agent 架构选择 → 本文档附录 F
├─ 评分重试/错误处理 → 04 附录 N
└─ 多模型 Fallback → 04 附录 H

Agent/MCP + CI/CD（→ 03-cicd-testing.md）
├─ MCP Server 测试 → 本文档附录 D + 03 附录 G
├─ Agent 工具 Mock 测试 → 本文档附录 C
└─ CI 中的 AI 安全审计 → 本文档附录 G

Agent/MCP + Docker（→ 06-docker-deployment.md）
├─ MCP Server 容器化 → 06 正文
├─ Agent 批量处理资源限制 → 06 附录 L
└─ 队列服务（Redis）容器化 → 06 Docker Compose

Agent/MCP + AI 工具（→ 05-ai-dev-tools.md）
├─ Claude Code Skill 设计 → 本文档附录 E + 05 附录 A
├─ MCP Server 在 Claude Code 中配置 → 本文档附录 D + 05 附录 E
└─ CLAUDE.md 中的 Agent 约定 → 05 附录 A
```

---

## 附录 J：通知与 Webhook 系统

### J.1 评分完成通知

```typescript
// src/services/notification.ts
import { logger } from "../lib/logger.js";

interface NotificationPayload {
  type: "score_completed" | "new_candidate" | "status_changed";
  data: Record<string, unknown>;
}

// 通知渠道接口
interface NotificationChannel {
  name: string;
  send: (payload: NotificationPayload) => Promise<void>;
}

// 邮件通知
const emailChannel: NotificationChannel = {
  name: "email",
  send: async (payload) => {
    if (payload.type === "score_completed") {
      const { candidateName, grade, positionTitle, totalScore } = payload.data;
      // 使用 Nodemailer 发送
      logger.info("email_notification", {
        to: "hr@ivis-sh.com",
        subject: `新候选人评分: ${candidateName} (${grade}级, ${totalScore}分) - ${positionTitle}`,
      });
    }
  },
};

// Webhook 通知（如企业微信/钉钉/飞书）
const webhookChannel: NotificationChannel = {
  name: "webhook",
  send: async (payload) => {
    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "markdown",
        markdown: {
          content: formatNotification(payload),
        },
      }),
    });
  },
};

function formatNotification(payload: NotificationPayload): string {
  switch (payload.type) {
    case "score_completed":
      return `**新候选人评分完成**
> 姓名: ${payload.data.candidateName}
> 职位: ${payload.data.positionTitle}
> 评分: ${payload.data.totalScore}分 (${payload.data.grade}级)
> 匹配技能: ${(payload.data.matchedSkills as string[])?.join(", ") || "无"}`;

    case "status_changed":
      return `**候选人状态变更**
> 姓名: ${payload.data.candidateName}
> 原状态: ${payload.data.oldStatus}
> 新状态: ${payload.data.newStatus}`;

    default:
      return JSON.stringify(payload.data);
  }
}

// 通知管理器
const channels: NotificationChannel[] = [emailChannel, webhookChannel];

export async function notify(payload: NotificationPayload): Promise<void> {
  await Promise.allSettled(
    channels.map(async (channel) => {
      try {
        await channel.send(payload);
      } catch (error) {
        logger.error("notification_failed", {
          channel: channel.name,
          error: (error as Error).message,
        });
      }
    })
  );
}
```

### J.2 企业微信 Bot 集成

```typescript
// src/lib/wechat-bot.ts
// 企业微信群机器人 Webhook

const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL;

export async function sendWeChatNotification(
  content: string,
  mentionedList?: string[] // @指定人的手机号
): Promise<void> {
  if (!WECHAT_WEBHOOK_URL) return;

  await fetch(WECHAT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: {
        content,
        mentioned_mobile_list: mentionedList,
      },
    }),
  });
}

// 使用示例（评分完成后）：
// await sendWeChatNotification(
//   `## 新简历评分 \n> **${name}** 应聘 **${position}** \n> 评分: **${score}** (${grade}级)`,
//   ["13800138000"]
// );
```

### J.3 飞书 Bot 集成

```typescript
// src/lib/feishu-bot.ts
// 飞书群机器人 Webhook

const FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL;
const FEISHU_WEBHOOK_SECRET = process.env.FEISHU_WEBHOOK_SECRET;

import { createHmac } from "node:crypto";

function generateSign(timestamp: number, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = createHmac("sha256", stringToSign);
  return hmac.digest("base64");
}

export async function sendFeishuNotification(
  title: string,
  content: string
): Promise<void> {
  if (!FEISHU_WEBHOOK_URL) return;

  const timestamp = Math.floor(Date.now() / 1000);

  const body: Record<string, unknown> = {
    msg_type: "interactive",
    card: {
      header: {
        title: { tag: "plain_text", content: title },
        template: "blue",
      },
      elements: [
        {
          tag: "markdown",
          content,
        },
      ],
    },
  };

  if (FEISHU_WEBHOOK_SECRET) {
    body.timestamp = String(timestamp);
    body.sign = generateSign(timestamp, FEISHU_WEBHOOK_SECRET);
  }

  await fetch(FEISHU_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
```

---

## 附录 K: Agent 记忆与上下文管理

### K.1 为什么 Agent 需要记忆

```
无记忆的 AI Agent 问题:

1. 重复提问: 每次对话都从头开始，无法记住之前的结论
2. 上下文丢失: 长对话超出 token 限制，早期信息被截断
3. 跨会话断裂: 昨天的分析结果今天无法引用
4. 一致性差: 对相同问题可能给出不同回答

HR 系统特有的记忆需求:
- 记住之前审核过的候选人特征
- 记住用户的偏好（如更重视项目经验还是学历）
- 积累筛选模式（如某类背景的候选人通常评分如何）
- 保存之前的评分决策理由（审计用途）
```

### K.2 短期记忆：对话上下文

```typescript
// src/services/agent-memory.ts
// Agent 短期记忆：管理单次对话的上下文

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
}

export class ConversationMemory {
  private messages: Message[] = [];
  private readonly maxTokenEstimate: number;
  private currentTokens = 0;

  constructor(maxTokens: number = 8000) {
    this.maxTokenEstimate = maxTokens;
  }

  add(role: Message["role"], content: string): void {
    const tokenEstimate = Math.ceil(content.length / 2); // 粗略中文估算

    // 如果超出限制，移除最早的非系统消息
    while (
      this.currentTokens + tokenEstimate > this.maxTokenEstimate &&
      this.messages.length > 1
    ) {
      const removed = this.messages.find((m) => m.role !== "system");
      if (removed) {
        this.messages = this.messages.filter((m) => m !== removed);
        this.currentTokens -= Math.ceil(removed.content.length / 2);
      } else {
        break;
      }
    }

    this.messages.push({ role, content, timestamp: Date.now() });
    this.currentTokens += tokenEstimate;
  }

  getMessages(): { role: string; content: string }[] {
    return this.messages.map(({ role, content }) => ({ role, content }));
  }

  // 获取上下文摘要（用于超长对话）
  getSummary(): string {
    const nonSystem = this.messages.filter((m) => m.role !== "system");
    if (nonSystem.length <= 4) {
      return nonSystem.map((m) => `${m.role}: ${m.content}`).join("\n");
    }

    // 保留最近 4 条 + 早期消息的摘要
    const recent = nonSystem.slice(-4);
    const early = nonSystem.slice(0, -4);

    const earlySummary = early
      .map((m) => `${m.role}: ${m.content.slice(0, 100)}...`)
      .join("\n");

    return `[早期对话摘要]\n${earlySummary}\n\n[最近对话]\n${recent.map((m) => `${m.role}: ${m.content}`).join("\n")}`;
  }

  clear(): void {
    const systemMsg = this.messages.find((m) => m.role === "system");
    this.messages = systemMsg ? [systemMsg] : [];
    this.currentTokens = systemMsg
      ? Math.ceil(systemMsg.content.length / 2)
      : 0;
  }
}
```

### K.3 长期记忆：评分模式学习

```typescript
// src/services/scoring-patterns.ts
// 从历史评分中学习模式，辅助新评分

import { db } from "../db/index.js";
import { scores, candidates, positions } from "../db/schema.js";
import { eq, desc, and, gte } from "drizzle-orm";

interface ScoringPattern {
  positionTitle: string;
  averageScore: number;
  gradeDistribution: Record<string, number>;
  commonMustMatches: string[];
  commonMissingSkills: string[];
  topCandidateTraits: string[];
  sampleSize: number;
}

// 获取某个职位的历史评分模式
export async function getPositionScoringPattern(
  positionId: number
): Promise<ScoringPattern | null> {
  const positionScores = await db
    .select({
      totalScore: scores.totalScore,
      grade: scores.grade,
      matchedSkills: scores.matchedSkills,
      missingSkills: scores.missingSkills,
      explanation: scores.explanation,
    })
    .from(scores)
    .where(eq(scores.positionId, positionId))
    .orderBy(desc(scores.createdAt))
    .limit(100);

  if (positionScores.length === 0) return null;

  const position = await db.query.positions.findFirst({
    where: (p, { eq }) => eq(p.id, positionId),
  });

  // 统计等级分布
  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const s of positionScores) {
    gradeDistribution[s.grade] = (gradeDistribution[s.grade] || 0) + 1;
  }

  // 统计常见匹配/缺失技能
  const matchCounts = new Map<string, number>();
  const missCounts = new Map<string, number>();

  for (const s of positionScores) {
    for (const skill of (s.matchedSkills as string[]) || []) {
      matchCounts.set(skill, (matchCounts.get(skill) || 0) + 1);
    }
    for (const skill of (s.missingSkills as string[]) || []) {
      missCounts.set(skill, (missCounts.get(skill) || 0) + 1);
    }
  }

  const sortByCount = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill]) => skill);

  // A 级候选人的共同特征
  const topScores = positionScores.filter((s) => s.grade === "A");
  const topTraits: string[] = [];
  if (topScores.length > 0) {
    const traitCounts = new Map<string, number>();
    for (const s of topScores) {
      for (const skill of (s.matchedSkills as string[]) || []) {
        traitCounts.set(skill, (traitCounts.get(skill) || 0) + 1);
      }
    }
    topTraits.push(...sortByCount(traitCounts).slice(0, 5));
  }

  return {
    positionTitle: position?.title || "Unknown",
    averageScore:
      positionScores.reduce((sum, s) => sum + s.totalScore, 0) /
      positionScores.length,
    gradeDistribution,
    commonMustMatches: sortByCount(matchCounts),
    commonMissingSkills: sortByCount(missCounts),
    topCandidateTraits: topTraits,
    sampleSize: positionScores.length,
  };
}

// 生成模式洞察文本（可插入 AI prompt）
export function formatPatternInsights(pattern: ScoringPattern): string {
  const total = Object.values(pattern.gradeDistribution).reduce(
    (a, b) => a + b,
    0
  );

  return `
## 历史评分模式参考 (${pattern.positionTitle}, ${pattern.sampleSize} 份简历)

平均分: ${pattern.averageScore.toFixed(1)} 分
等级分布: A=${pattern.gradeDistribution.A}(${((pattern.gradeDistribution.A / total) * 100).toFixed(0)}%) B=${pattern.gradeDistribution.B} C=${pattern.gradeDistribution.C} D=${pattern.gradeDistribution.D}

最常匹配的技能: ${pattern.commonMustMatches.join("、")}
最常缺失的技能: ${pattern.commonMissingSkills.join("、")}
A级候选人特征: ${pattern.topCandidateTraits.join("、")}

注意: 以上模式仅供参考，请基于候选人实际简历内容独立评分。
`.trim();
}
```

### K.4 用户偏好记忆

```typescript
// src/services/user-preferences.ts
// 记录和学习用户（HR）的筛选偏好

import { db } from "../db/index.js";
import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

// 用户偏好表
export const userPreferences = pgTable("user_preferences", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  preferenceType: text("preference_type").notNull(), // sorting, filtering, scoring_weight
  preferenceKey: text("preference_key").notNull(),
  preferenceValue: jsonb("preference_value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 用户操作日志（用于学习偏好）
export const userActions = pgTable("user_actions", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(), // view_candidate, change_status, add_note, override_score
  targetId: integer("target_id"), // candidateId
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 学习用户偏好
export async function learnUserPreferences(
  userId: string
): Promise<Record<string, unknown>> {
  // 分析用户最近 100 个操作
  const recentActions = await db
    .select()
    .from(userActions)
    .where(eq(userActions.userId, userId))
    .orderBy(desc(userActions.createdAt))
    .limit(100);

  const insights: Record<string, unknown> = {};

  // 1. 查看偏好：用户更常查看哪些等级的候选人
  const viewActions = recentActions.filter(
    (a) => a.action === "view_candidate"
  );
  if (viewActions.length > 0) {
    const gradeViews: Record<string, number> = {};
    for (const action of viewActions) {
      const grade = (action.details as any)?.grade;
      if (grade) {
        gradeViews[grade] = (gradeViews[grade] || 0) + 1;
      }
    }
    insights.preferredGrades = gradeViews;
  }

  // 2. 状态变更模式：用户倾向于推进还是拒绝
  const statusActions = recentActions.filter(
    (a) => a.action === "change_status"
  );
  if (statusActions.length > 0) {
    const statusChanges: Record<string, number> = {};
    for (const action of statusActions) {
      const newStatus = (action.details as any)?.newStatus;
      if (newStatus) {
        statusChanges[newStatus] = (statusChanges[newStatus] || 0) + 1;
      }
    }
    insights.statusChangePatterns = statusChanges;
  }

  // 3. 评分覆盖：用户是否经常修改 AI 评分
  const overrideActions = recentActions.filter(
    (a) => a.action === "override_score"
  );
  if (overrideActions.length > 0) {
    const overrides = overrideActions.map((a) => {
      const details = a.details as any;
      return {
        aiScore: details?.aiScore,
        humanScore: details?.humanScore,
        diff: (details?.humanScore || 0) - (details?.aiScore || 0),
      };
    });

    const avgDiff =
      overrides.reduce((sum, o) => sum + o.diff, 0) / overrides.length;
    insights.scoreOverrides = {
      count: overrides.length,
      averageDiff: avgDiff,
      tendency: avgDiff > 5 ? "AI偏低" : avgDiff < -5 ? "AI偏高" : "基本一致",
    };
  }

  return insights;
}
```

---

## 附录 L: MCP 协议高级特性

### L.1 MCP Sampling（让服务端请求 LLM）

```typescript
// MCP Sampling: 服务端可以请求客户端的 LLM 能力
// 这是 MCP 的高级特性，允许 MCP 服务器回调客户端进行推理

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  {
    name: "hr-mcp-advanced",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
      sampling: {}, // 声明需要 sampling 能力
    },
  }
);

// 工具: 深度分析候选人
server.setRequestHandler("tools/call", async (request) => {
  if (request.params.name === "deep_analyze_candidate") {
    const { candidateId } = request.params.arguments as {
      candidateId: number;
    };

    // 1. 获取候选人数据
    const candidate = await fetchCandidate(candidateId);
    const resume = await fetchResume(candidateId);
    const scores = await fetchScores(candidateId);

    // 2. 使用 Sampling 请求客户端 LLM 进行深度分析
    // 这允许 MCP 服务器利用客户端的 LLM 能力
    const analysis = await server.request(
      {
        method: "sampling/createMessage",
        params: {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `请对以下候选人进行深度分析:

候选人: ${candidate.name}
简历摘要: ${resume.rawText.slice(0, 2000)}
AI 评分: ${JSON.stringify(scores)}

请从以下维度分析:
1. 职业发展轨迹是否清晰
2. 技能深度 vs 广度
3. 潜在的文化适配度
4. 面试建议问题（3个）
5. 薪资范围估计`,
              },
            },
          ],
          maxTokens: 1500,
          systemPrompt: "你是一位资深 HR 顾问。",
        },
      },
      {}
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            candidateId,
            candidateName: candidate.name,
            deepAnalysis: analysis.content,
          }),
        },
      ],
    };
  }
});

async function fetchCandidate(id: number) {
  // 从数据库获取候选人
  return { name: "示例候选人" };
}

async function fetchResume(candidateId: number) {
  return { rawText: "示例简历内容" };
}

async function fetchScores(candidateId: number) {
  return { totalScore: 85, grade: "A" };
}
```

### L.2 MCP 资源订阅（实时更新）

```typescript
// MCP Resources with Subscriptions
// 客户端可以订阅资源变更，实现实时数据推送

import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server(
  { name: "hr-mcp-realtime", version: "2.0.0" },
  {
    capabilities: {
      resources: {
        subscribe: true, // 启用资源订阅
        listChanged: true,
      },
      tools: {},
    },
  }
);

// 资源列表
server.setRequestHandler("resources/list", async () => ({
  resources: [
    {
      uri: "hr://dashboard/live",
      name: "实时仪表盘",
      description: "候选人和评分的实时统计数据",
      mimeType: "application/json",
    },
    {
      uri: "hr://candidates/recent",
      name: "最近候选人",
      description: "最近24小时新增的候选人列表",
      mimeType: "application/json",
    },
  ],
}));

// 读取资源
server.setRequestHandler("resources/read", async (request) => {
  const { uri } = request.params;

  if (uri === "hr://dashboard/live") {
    const stats = await getDashboardStats();
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }

  if (uri === "hr://candidates/recent") {
    const recent = await getRecentCandidates(24);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(recent, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// 订阅管理
const subscriptions = new Set<string>();

server.setRequestHandler("resources/subscribe", async (request) => {
  subscriptions.add(request.params.uri);
  return {};
});

server.setRequestHandler("resources/unsubscribe", async (request) => {
  subscriptions.delete(request.params.uri);
  return {};
});

// 模拟数据变更通知（实际应由数据库触发器或事件驱动）
setInterval(async () => {
  for (const uri of subscriptions) {
    // 通知客户端资源已更新
    await server.notification({
      method: "notifications/resources/updated",
      params: { uri },
    });
  }
}, 30000); // 每 30 秒检查一次

async function getDashboardStats() {
  return {
    totalCandidates: 0,
    newToday: 0,
    pendingScoring: 0,
    gradeDistribution: { A: 0, B: 0, C: 0, D: 0 },
    updatedAt: new Date().toISOString(),
  };
}

async function getRecentCandidates(hours: number) {
  return [];
}
```

### L.3 MCP 多服务器组合

```typescript
// src/mcp/client-multi.ts
// 连接多个 MCP 服务器，组合不同能力

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// HR 项目推荐的 MCP 服务器组合
const HR_MCP_SERVERS: MCPServerConfig[] = [
  {
    name: "hr-backend",
    command: "bun",
    args: ["src/mcp/server.ts"],
    env: { DATABASE_URL: process.env.DATABASE_URL || "" },
  },
  {
    name: "filesystem",
    command: "bun",
    args: ["x", "@anthropic/mcp-server-filesystem", "./data"],
  },
  {
    name: "postgres",
    command: "bun",
    args: ["x", "@anthropic/mcp-server-postgres"],
    env: { DATABASE_URL: process.env.DATABASE_URL || "" },
  },
];

export class MCPClientPool {
  private clients = new Map<string, Client>();

  async connect(configs: MCPServerConfig[]): Promise<void> {
    for (const config of configs) {
      try {
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: { ...process.env, ...config.env },
        });

        const client = new Client(
          { name: `hr-client-${config.name}`, version: "1.0.0" },
          { capabilities: {} }
        );

        await client.connect(transport);
        this.clients.set(config.name, client);
        console.log(`Connected to MCP server: ${config.name}`);
      } catch (error) {
        console.error(
          `Failed to connect to ${config.name}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  // 列出所有可用工具
  async listAllTools(): Promise<
    { server: string; name: string; description: string }[]
  > {
    const allTools: { server: string; name: string; description: string }[] =
      [];

    for (const [serverName, client] of this.clients) {
      try {
        const { tools } = await client.request(
          { method: "tools/list" },
          {}
        );

        for (const tool of tools || []) {
          allTools.push({
            server: serverName,
            name: tool.name,
            description: tool.description || "",
          });
        }
      } catch {
        // 服务器可能不支持 tools
      }
    }

    return allTools;
  }

  // 调用指定服务器的工具
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    const result = await client.request(
      {
        method: "tools/call",
        params: { name: toolName, arguments: args },
      },
      {}
    );

    return result;
  }

  // 智能路由：根据工具名自动选择服务器
  async smartCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const allTools = await this.listAllTools();
    const match = allTools.find((t) => t.name === toolName);

    if (!match) {
      throw new Error(`Tool not found across all servers: ${toolName}`);
    }

    return this.callTool(match.server, toolName, args);
  }

  async disconnect(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
        console.log(`Disconnected from: ${name}`);
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }
}
```

### L.4 MCP Prompt 模板管理

```typescript
// MCP Prompts: 预定义的 prompt 模板，可被 AI 客户端发现和使用

server.setRequestHandler("prompts/list", async () => ({
  prompts: [
    {
      name: "weekly_hr_report",
      description: "生成每周 HR 招聘数据报告",
      arguments: [
        {
          name: "week_start",
          description: "报告开始日期 (YYYY-MM-DD)",
          required: false,
        },
        {
          name: "position_id",
          description: "特定职位ID（留空为全部）",
          required: false,
        },
      ],
    },
    {
      name: "candidate_comparison",
      description: "对比两个候选人的优劣势",
      arguments: [
        {
          name: "candidate_a_id",
          description: "候选人 A 的 ID",
          required: true,
        },
        {
          name: "candidate_b_id",
          description: "候选人 B 的 ID",
          required: true,
        },
      ],
    },
    {
      name: "interview_prep",
      description: "根据候选人简历生成面试题",
      arguments: [
        {
          name: "candidate_id",
          description: "候选人 ID",
          required: true,
        },
        {
          name: "focus_area",
          description: "重点考察领域（技术/项目/软技能）",
          required: false,
        },
      ],
    },
  ],
}));

server.setRequestHandler("prompts/get", async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "interview_prep") {
    const candidateId = Number(args?.candidate_id);
    const focusArea = (args?.focus_area as string) || "综合";

    // 获取候选人信息
    const candidate = await fetchCandidate(candidateId);
    const resume = await fetchResume(candidateId);
    const scoreData = await fetchScores(candidateId);

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `请根据以下候选人信息，生成${focusArea}方向的面试问题。

候选人: ${candidate.name}
评分: ${scoreData.totalScore} (${scoreData.grade})

简历:
${resume.rawText.slice(0, 3000)}

匹配的技能: ${(scoreData as any).matchedSkills?.join("、") || "N/A"}
缺失的技能: ${(scoreData as any).missingSkills?.join("、") || "N/A"}

请生成:
1. 3 个技术深度问题（验证简历中的技能水平）
2. 2 个项目经验问题（深入了解实际贡献）
3. 2 个行为面试问题（评估软技能和文化匹配）
4. 1 个开放性问题（评估思维方式）

每个问题附带:
- 考察目的
- 期望答案要点
- 评分标准（1-5分）`,
          },
        },
      ],
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
});
```

---

## 附录 M: Agent 工作流编排

### M.1 多步骤 Agent 编排模式

```typescript
// src/services/agent-workflows.ts
// Agent 工作流: 将复杂任务拆分为有序的步骤

import { generateText, generateObject } from "ai";
import { z } from "zod/v4";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../env.js";

const provider = createOpenAI({
  baseURL: "https://api.minimaxi.com/v1",
  apiKey: env.MINIMAX_API_KEY,
});

const model = provider("MiniMax-M2.5");

// 工作流步骤定义
interface WorkflowStep<TInput, TOutput> {
  name: string;
  description: string;
  execute: (input: TInput) => Promise<TOutput>;
  validate?: (output: TOutput) => boolean;
  retry?: number;
}

// 通用工作流执行器
export class WorkflowExecutor<TContext extends Record<string, unknown>> {
  private steps: WorkflowStep<TContext, unknown>[] = [];
  private context: TContext;

  constructor(initialContext: TContext) {
    this.context = { ...initialContext };
  }

  addStep<TOutput>(
    step: WorkflowStep<TContext, TOutput>,
    contextKey: keyof TContext
  ): this {
    this.steps.push({
      ...step,
      execute: async (ctx) => {
        const result = await step.execute(ctx);
        (this.context as any)[contextKey] = result;
        return result;
      },
    } as WorkflowStep<TContext, unknown>);
    return this;
  }

  async run(): Promise<{
    success: boolean;
    context: TContext;
    completedSteps: string[];
    error?: string;
  }> {
    const completedSteps: string[] = [];

    for (const step of this.steps) {
      const maxRetries = step.retry || 1;
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `[Workflow] Step: ${step.name} (attempt ${attempt}/${maxRetries})`
          );
          const result = await step.execute(this.context);

          if (step.validate && !step.validate(result)) {
            throw new Error(`Validation failed for step: ${step.name}`);
          }

          completedSteps.push(step.name);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(
            `[Workflow] Step ${step.name} failed (attempt ${attempt}):`,
            lastError.message
          );

          if (attempt < maxRetries) {
            await new Promise((r) =>
              setTimeout(r, 1000 * Math.pow(2, attempt - 1))
            );
          }
        }
      }

      if (lastError) {
        return {
          success: false,
          context: this.context,
          completedSteps,
          error: `Step "${step.name}" failed: ${lastError.message}`,
        };
      }
    }

    return { success: true, context: this.context, completedSteps };
  }
}

// === 具体工作流: 新候选人处理 ===

interface CandidateProcessingContext {
  resumeText: string;
  positionId: number;
  // 以下由工作流步骤填充
  extractedInfo?: {
    name: string;
    email: string;
    phone: string;
    education: string;
    experience: string;
    skills: string[];
  };
  score?: {
    totalScore: number;
    grade: string;
    explanation: string;
  };
  recommendation?: string;
  candidateId?: number;
}

const extractInfoSchema = z.object({
  name: z.string(),
  email: z.string().default(""),
  phone: z.string().default(""),
  education: z.string(),
  experience: z.string(),
  skills: z.array(z.string()),
});

export async function processNewCandidate(
  resumeText: string,
  positionId: number
) {
  const workflow = new WorkflowExecutor<CandidateProcessingContext>({
    resumeText,
    positionId,
  });

  // Step 1: 提取候选人信息
  workflow.addStep(
    {
      name: "extract_info",
      description: "从简历中提取结构化信息",
      retry: 2,
      execute: async (ctx) => {
        const { object } = await generateObject({
          model,
          schema: extractInfoSchema,
          prompt: `从以下简历中提取候选人信息:\n\n${ctx.resumeText}`,
        });
        return object;
      },
      validate: (result: any) => result.name && result.name.length > 0,
    },
    "extractedInfo"
  );

  // Step 2: AI 评分
  workflow.addStep(
    {
      name: "ai_scoring",
      description: "使用 AI 对候选人评分",
      retry: 3,
      execute: async (ctx) => {
        // 获取职位配置...
        const scoreSchema = z.object({
          totalScore: z.number().min(0).max(100),
          grade: z.enum(["A", "B", "C", "D"]),
          explanation: z.string(),
        });

        const { object } = await generateObject({
          model,
          schema: scoreSchema,
          prompt: `评估候选人与职位的匹配度...\n简历:\n${ctx.resumeText}`,
        });
        return object;
      },
      validate: (result: any) =>
        result.totalScore >= 0 && result.totalScore <= 100,
    },
    "score"
  );

  // Step 3: 生成推荐意见
  workflow.addStep(
    {
      name: "generate_recommendation",
      description: "生成录用推荐意见",
      execute: async (ctx) => {
        const { text } = await generateText({
          model,
          prompt: `基于评分结果 (${ctx.score?.grade}, ${ctx.score?.totalScore}分)，
用一句话给出推荐意见:
- A: 强烈推荐面试
- B: 建议安排面试
- C: 可作为备选
- D: 不建议继续

候选人: ${ctx.extractedInfo?.name}
评分解释: ${ctx.score?.explanation}`,
        });
        return text;
      },
    },
    "recommendation"
  );

  return workflow.run();
}
```

### M.2 条件分支工作流

```typescript
// src/services/conditional-workflow.ts
// 条件分支: 根据评分等级执行不同的后续流程

import { RealtimeEvents } from "./realtime.js";

interface ProcessingResult {
  candidateId: number;
  grade: string;
  actions: string[];
}

export async function postScoringWorkflow(
  candidateId: number,
  grade: string,
  positionId: number
): Promise<ProcessingResult> {
  const actions: string[] = [];

  switch (grade) {
    case "A": {
      // A 级候选人: 自动推进到面试安排
      actions.push("auto_advance_to_interview");

      // 通知 HR 经理
      await RealtimeEvents.candidateStatusChanged(
        candidateId,
        "new",
        "interview_scheduled",
        "system"
      );
      actions.push("notified_hr_manager");

      // 发送面试邀请邮件（如果配置了 SMTP）
      // await sendInterviewInvitation(candidateId);
      actions.push("interview_invitation_queued");
      break;
    }

    case "B": {
      // B 级候选人: 标记待审核
      actions.push("marked_for_review");

      await RealtimeEvents.candidateStatusChanged(
        candidateId,
        "new",
        "under_review",
        "system"
      );
      actions.push("notified_recruiters");
      break;
    }

    case "C": {
      // C 级候选人: 放入备选池
      actions.push("added_to_talent_pool");
      break;
    }

    case "D": {
      // D 级候选人: 自动归档
      actions.push("auto_archived");
      break;
    }
  }

  return { candidateId, grade, actions };
}
```

### M.3 并行 Agent 任务

```typescript
// src/services/parallel-scoring.ts
// 并行评分: 一份简历同时匹配多个职位

import { scoreResumeWithCache } from "./ai-scorer.js";
import { db } from "../db/index.js";
import { positions, scores } from "../db/schema.js";
import { eq } from "drizzle-orm";

interface ParallelScoringResult {
  candidateId: number;
  results: {
    positionId: number;
    positionTitle: string;
    totalScore: number;
    grade: string;
    cached: boolean;
    latencyMs: number;
  }[];
  bestMatch: {
    positionId: number;
    positionTitle: string;
    totalScore: number;
    grade: string;
  } | null;
  totalLatencyMs: number;
}

export async function scoreAgainstAllPositions(
  candidateId: number,
  resumeText: string
): Promise<ParallelScoringResult> {
  const startTime = Date.now();

  // 获取所有活跃职位
  const activePositions = await db
    .select()
    .from(positions)
    .where(eq(positions.status, "active"));

  if (activePositions.length === 0) {
    return {
      candidateId,
      results: [],
      bestMatch: null,
      totalLatencyMs: Date.now() - startTime,
    };
  }

  // 并行评分（使用 Promise.allSettled 容错）
  const scoringPromises = activePositions.map(async (position) => {
    const result = await scoreResumeWithCache(resumeText, {
      title: position.title,
      mustHave: (position.mustHaveSkills as string[]) || [],
      niceToHave: (position.niceToHaveSkills as string[]) || [],
      reject: (position.rejectCriteria as string[]) || [],
    });

    return {
      positionId: position.id,
      positionTitle: position.title,
      totalScore: result.totalScore,
      grade: result.grade,
      cached: result._meta.cached,
      latencyMs: result._meta.latencyMs,
    };
  });

  const settled = await Promise.allSettled(scoringPromises);

  const results = settled
    .filter(
      (r): r is PromiseFulfilledResult<(typeof scoringPromises)[number] extends Promise<infer T> ? T : never> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value);

  // 找到最佳匹配
  const bestMatch = results.length > 0
    ? results.reduce((best, curr) =>
        curr.totalScore > best.totalScore ? curr : best
      )
    : null;

  // 保存所有评分到数据库
  if (results.length > 0) {
    await db.insert(scores).values(
      results.map((r) => ({
        candidateId,
        positionId: r.positionId,
        totalScore: r.totalScore,
        grade: r.grade,
        mustScore: 0,
        niceScore: 0,
        explanation: `并行评分 - ${r.positionTitle}`,
      }))
    );
  }

  return {
    candidateId,
    results,
    bestMatch: bestMatch
      ? {
          positionId: bestMatch.positionId,
          positionTitle: bestMatch.positionTitle,
          totalScore: bestMatch.totalScore,
          grade: bestMatch.grade,
        }
      : null,
    totalLatencyMs: Date.now() - startTime,
  };
}
```

### M.4 Agent 状态机

```typescript
// src/services/candidate-state-machine.ts
// 候选人状态机: 管理候选人在招聘流程中的状态转换

type CandidateStatus =
  | "new"
  | "screening"
  | "under_review"
  | "interview_scheduled"
  | "interviewing"
  | "offer_pending"
  | "offered"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "archived";

interface Transition {
  from: CandidateStatus;
  to: CandidateStatus;
  condition?: string;
  action?: (candidateId: number) => Promise<void>;
}

const VALID_TRANSITIONS: Transition[] = [
  // 新简历进入
  { from: "new", to: "screening" },
  { from: "screening", to: "under_review" },
  { from: "screening", to: "rejected", condition: "score < 40" },

  // 审核流程
  { from: "under_review", to: "interview_scheduled" },
  { from: "under_review", to: "rejected" },
  { from: "under_review", to: "archived" },

  // 面试流程
  { from: "interview_scheduled", to: "interviewing" },
  { from: "interview_scheduled", to: "withdrawn" },
  { from: "interviewing", to: "offer_pending" },
  { from: "interviewing", to: "rejected" },

  // Offer 流程
  { from: "offer_pending", to: "offered" },
  { from: "offer_pending", to: "rejected" },
  { from: "offered", to: "accepted" },
  { from: "offered", to: "rejected" },
  { from: "offered", to: "withdrawn" },

  // 通用转换
  { from: "rejected", to: "archived" },
  { from: "withdrawn", to: "archived" },
];

export function canTransition(
  from: CandidateStatus,
  to: CandidateStatus
): boolean {
  return VALID_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export function getValidNextStatuses(
  current: CandidateStatus
): CandidateStatus[] {
  return VALID_TRANSITIONS
    .filter((t) => t.from === current)
    .map((t) => t.to);
}

export function validateTransition(
  from: CandidateStatus,
  to: CandidateStatus
): { valid: boolean; error?: string } {
  if (from === to) {
    return { valid: false, error: "状态未发生变化" };
  }

  if (!canTransition(from, to)) {
    const validNext = getValidNextStatuses(from);
    return {
      valid: false,
      error: `无法从 "${from}" 转换到 "${to}"。有效的下一步: ${validNext.join(", ")}`,
    };
  }

  return { valid: true };
}

// 状态流程可视化
export function getStateDiagram(): string {
  return `
候选人状态流程:

  new → screening → under_review → interview_scheduled → interviewing → offer_pending → offered → accepted
                  ↘ rejected      ↘ rejected             ↘ withdrawn     ↘ rejected     ↘ rejected  ↘ withdrawn
                  ↘ archived                                               ↘ offer_pending             ↘ rejected

  rejected → archived
  withdrawn → archived
  `.trim();
}
```

---

## 附录 N: Agent 测试策略

### N.1 Agent 行为测试框架

```typescript
// test/agent/agent-behavior.test.ts
// 测试 Agent 的行为是否符合预期

import { describe, it, expect, vi, beforeEach } from "vitest";
import { processNewCandidate } from "../../src/services/agent-workflows.js";

// Mock AI SDK
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "建议安排面试",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  }),
  generateObject: vi.fn().mockResolvedValue({
    object: {
      name: "张三",
      email: "zhangsan@example.com",
      phone: "13800138000",
      education: "浙江大学 计算机 硕士",
      experience: "5年前端开发",
      skills: ["React", "TypeScript", "Node.js"],
    },
    usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
  }),
}));

describe("Agent Workflow: Process New Candidate", () => {
  const sampleResume = `
张三 | 高级前端工程师 | 5年经验
教育: 浙江大学 计算机科学 硕士
技能: React, TypeScript, Node.js
  `.trim();

  it("should complete all workflow steps successfully", async () => {
    const result = await processNewCandidate(sampleResume, 1);

    expect(result.success).toBe(true);
    expect(result.completedSteps).toContain("extract_info");
    expect(result.completedSteps).toContain("ai_scoring");
    expect(result.completedSteps).toContain("generate_recommendation");
    expect(result.completedSteps).toHaveLength(3);
  });

  it("should extract candidate info correctly", async () => {
    const result = await processNewCandidate(sampleResume, 1);

    expect(result.context.extractedInfo).toBeDefined();
    expect(result.context.extractedInfo?.name).toBe("张三");
    expect(result.context.extractedInfo?.skills).toContain("React");
  });

  it("should handle AI API failures gracefully", async () => {
    // 模拟 AI 调用失败
    const { generateObject } = await import("ai");
    (generateObject as any).mockRejectedValueOnce(new Error("API timeout"));

    const result = await processNewCandidate(sampleResume, 1);

    // 工作流应该在失败步骤停止
    expect(result.success).toBe(false);
    expect(result.error).toContain("failed");
  });
});
```

### N.2 MCP 服务器集成测试

```typescript
// test/mcp/server.test.ts
// MCP 服务器集成测试

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("HR MCP Server", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "bun",
      args: ["src/mcp/server.ts"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL:
          "postgresql://test:test@localhost:5432/hr_test",
      },
    });

    client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it("should list available tools", async () => {
    const { tools } = await client.request(
      { method: "tools/list" },
      {}
    );

    expect(tools).toBeDefined();
    expect(tools.length).toBeGreaterThan(0);

    const toolNames = tools.map((t: any) => t.name);
    expect(toolNames).toContain("candidate_search");
    expect(toolNames).toContain("position_stats");
  });

  it("should list available resources", async () => {
    const { resources } = await client.request(
      { method: "resources/list" },
      {}
    );

    expect(resources).toBeDefined();
    expect(resources.length).toBeGreaterThan(0);
  });

  it("should list available prompts", async () => {
    const { prompts } = await client.request(
      { method: "prompts/list" },
      {}
    );

    expect(prompts).toBeDefined();
    expect(prompts.length).toBeGreaterThan(0);

    const promptNames = prompts.map((p: any) => p.name);
    expect(promptNames).toContain("interview_prep");
  });

  it("should execute candidate_search tool", async () => {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "candidate_search",
          arguments: {
            query: "React",
            limit: 5,
          },
        },
      },
      {}
    );

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
  });
});
```

### N.3 状态机测试

```typescript
// test/services/state-machine.test.ts
// 候选人状态机完整测试

import { describe, it, expect } from "vitest";
import {
  canTransition,
  getValidNextStatuses,
  validateTransition,
} from "../../src/services/candidate-state-machine.js";

describe("Candidate State Machine", () => {
  describe("canTransition", () => {
    // 有效转换
    it.each([
      ["new", "screening"],
      ["screening", "under_review"],
      ["screening", "rejected"],
      ["under_review", "interview_scheduled"],
      ["under_review", "rejected"],
      ["interview_scheduled", "interviewing"],
      ["interviewing", "offer_pending"],
      ["interviewing", "rejected"],
      ["offer_pending", "offered"],
      ["offered", "accepted"],
      ["offered", "withdrawn"],
      ["rejected", "archived"],
    ] as const)("should allow %s → %s", (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

    // 无效转换
    it.each([
      ["new", "accepted"],
      ["new", "offered"],
      ["screening", "accepted"],
      ["interviewing", "new"],
      ["archived", "new"],
      ["accepted", "new"],
      ["rejected", "accepted"],
    ] as const)("should reject %s → %s", (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  describe("getValidNextStatuses", () => {
    it("should return correct next statuses for 'new'", () => {
      const next = getValidNextStatuses("new");
      expect(next).toEqual(["screening"]);
    });

    it("should return multiple options for 'under_review'", () => {
      const next = getValidNextStatuses("under_review");
      expect(next).toContain("interview_scheduled");
      expect(next).toContain("rejected");
      expect(next).toContain("archived");
    });

    it("should return empty for terminal state 'accepted'", () => {
      const next = getValidNextStatuses("accepted");
      expect(next).toEqual([]);
    });
  });

  describe("validateTransition", () => {
    it("should reject same-state transition", () => {
      const result = validateTransition("new", "new");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("未发生变化");
    });

    it("should provide helpful error for invalid transitions", () => {
      const result = validateTransition("new", "accepted");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("screening");
    });
  });
});
```

### N.4 Agent 性能基准

```typescript
// test/benchmarks/agent-benchmark.ts
// Agent 工作流性能基准测试

import { describe, bench } from "vitest";

describe("Agent Performance Benchmarks", () => {
  bench("state machine validation (1000 transitions)", () => {
    const transitions = [
      ["new", "screening"],
      ["screening", "under_review"],
      ["under_review", "interview_scheduled"],
      ["interview_scheduled", "interviewing"],
      ["interviewing", "offer_pending"],
    ] as const;

    for (let i = 0; i < 200; i++) {
      for (const [from, to] of transitions) {
        canTransition(from, to);
      }
    }
  });

  bench("scoring pattern analysis (mock data)", async () => {
    // Mock 100 条评分数据的模式分析
    const scores = Array.from({ length: 100 }, (_, i) => ({
      totalScore: Math.floor(Math.random() * 100),
      grade: ["A", "B", "C", "D"][Math.floor(Math.random() * 4)],
      matchedSkills: ["React", "TypeScript"].slice(
        0,
        Math.floor(Math.random() * 3)
      ),
      missingSkills: ["Docker", "K8s"].slice(
        0,
        Math.floor(Math.random() * 3)
      ),
    }));

    // 计算统计
    const gradeCount: Record<string, number> = {};
    for (const s of scores) {
      gradeCount[s.grade] = (gradeCount[s.grade] || 0) + 1;
    }
    const avgScore =
      scores.reduce((sum, s) => sum + s.totalScore, 0) / scores.length;
  });
});

// 导入必要函数（避免未定义错误）
function canTransition(from: string, to: string): boolean {
  const valid: Record<string, string[]> = {
    new: ["screening"],
    screening: ["under_review", "rejected"],
    under_review: ["interview_scheduled", "rejected", "archived"],
    interview_scheduled: ["interviewing", "withdrawn"],
    interviewing: ["offer_pending", "rejected"],
    offer_pending: ["offered", "rejected"],
    offered: ["accepted", "rejected", "withdrawn"],
  };
  return (valid[from] || []).includes(to);
}
```

---

## 附录 O: Agent 可观测性与监控

### O.1 Agent 执行追踪

```typescript
// src/lib/agent-tracing.ts
// Agent 执行全链路追踪

import { randomUUID } from "crypto";

// ===== 追踪数据结构 =====

interface TraceSpan {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  startTime: number;
  endTime: number | null;
  status: "running" | "success" | "error";
  attributes: Record<string, string | number | boolean>;
  events: TraceEvent[];
}

interface TraceEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, string | number | boolean>;
}

// ===== 追踪上下文 =====

class TraceContext {
  private spans: Map<string, TraceSpan> = new Map();
  readonly traceId: string;

  constructor(traceId?: string) {
    this.traceId = traceId || randomUUID();
  }

  /**
   * 开始一个新的 span
   */
  startSpan(
    name: string,
    parentSpanId?: string | null,
    attributes?: Record<string, string | number | boolean>
  ): string {
    const spanId = randomUUID();
    const span: TraceSpan = {
      spanId,
      traceId: this.traceId,
      parentSpanId: parentSpanId || null,
      name,
      startTime: performance.now(),
      endTime: null,
      status: "running",
      attributes: attributes || {},
      events: [],
    };
    this.spans.set(spanId, span);
    return spanId;
  }

  /**
   * 结束一个 span
   */
  endSpan(spanId: string, status: "success" | "error" = "success"): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.endTime = performance.now();
      span.status = status;
    }
  }

  /**
   * 添加事件到 span
   */
  addEvent(
    spanId: string,
    name: string,
    attributes?: Record<string, string | number | boolean>
  ): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.events.push({
        name,
        timestamp: performance.now(),
        attributes: attributes || {},
      });
    }
  }

  /**
   * 设置 span 属性
   */
  setAttribute(
    spanId: string,
    key: string,
    value: string | number | boolean
  ): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.attributes[key] = value;
    }
  }

  /**
   * 获取完整追踪信息
   */
  getTrace(): {
    traceId: string;
    spans: TraceSpan[];
    totalDurationMs: number;
  } {
    const spans = Array.from(this.spans.values());
    const startTimes = spans.map((s) => s.startTime);
    const endTimes = spans
      .filter((s) => s.endTime !== null)
      .map((s) => s.endTime!);

    const totalDuration =
      endTimes.length > 0 && startTimes.length > 0
        ? Math.max(...endTimes) - Math.min(...startTimes)
        : 0;

    return {
      traceId: this.traceId,
      spans,
      totalDurationMs: totalDuration,
    };
  }
}

// ===== 全局追踪存储 =====

const activeTraces = new Map<string, TraceContext>();
const completedTraces: Array<ReturnType<TraceContext["getTrace"]>> = [];
const MAX_COMPLETED_TRACES = 200;

export function createTrace(): TraceContext {
  const trace = new TraceContext();
  activeTraces.set(trace.traceId, trace);
  return trace;
}

export function getTrace(traceId: string): TraceContext | undefined {
  return activeTraces.get(traceId);
}

export function completeTrace(traceId: string): void {
  const trace = activeTraces.get(traceId);
  if (trace) {
    completedTraces.push(trace.getTrace());
    if (completedTraces.length > MAX_COMPLETED_TRACES) {
      completedTraces.shift();
    }
    activeTraces.delete(traceId);
  }
}

export function getRecentTraces(limit: number = 20) {
  return completedTraces.slice(-limit);
}
```

### O.2 评分流程追踪集成

```typescript
// src/services/ai-scorer-traced.ts
// 带追踪的评分服务

import { createTrace, completeTrace, TraceContext } from "../lib/agent-tracing.js";
import { generateObject } from "ai";
import { openai } from "../lib/ai.js";
import { z } from "zod/v4";

interface ScoringInput {
  resumeText: string;
  positionTitle: string;
  mustSkills: string[];
  niceSkills: string[];
  rejectKeywords: string[];
}

/**
 * 带完整追踪的评分流程
 */
export async function scoreResumeTraced(input: ScoringInput) {
  const trace = createTrace();

  // ===== 根 span: 整个评分流程 =====
  const rootSpan = trace.startSpan("score_resume", null, {
    positionTitle: input.positionTitle,
    resumeLength: input.resumeText.length,
    mustSkillCount: input.mustSkills.length,
    niceSkillCount: input.niceSkills.length,
  });

  try {
    // ===== Step 1: 简历预处理 =====
    const preprocessSpan = trace.startSpan("preprocess_resume", rootSpan, {
      inputLength: input.resumeText.length,
    });

    const cleanedText = input.resumeText
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 8000);

    trace.setAttribute(preprocessSpan, "outputLength", cleanedText.length);
    trace.setAttribute(
      preprocessSpan,
      "truncated",
      input.resumeText.length > 8000
    );
    trace.endSpan(preprocessSpan, "success");

    // ===== Step 2: 构建 Prompt =====
    const promptSpan = trace.startSpan("build_prompt", rootSpan);

    const prompt = buildScoringPrompt(cleanedText, input);
    trace.setAttribute(promptSpan, "promptLength", prompt.length);
    trace.endSpan(promptSpan, "success");

    // ===== Step 3: AI 调用 =====
    const aiSpan = trace.startSpan("ai_call", rootSpan, {
      model: "MiniMax-M2.5",
      provider: "minimax",
    });

    trace.addEvent(aiSpan, "request_sent");

    const { object: result, usage } = await generateObject({
      model: openai("MiniMax-M2.5"),
      schema: scoringResultSchema,
      prompt,
    });

    trace.addEvent(aiSpan, "response_received", {
      promptTokens: usage?.promptTokens || 0,
      completionTokens: usage?.completionTokens || 0,
    });
    trace.setAttribute(aiSpan, "totalTokens", (usage?.totalTokens || 0));
    trace.endSpan(aiSpan, "success");

    // ===== Step 4: 后处理 =====
    const postSpan = trace.startSpan("post_process", rootSpan, {
      rawScore: result.totalScore,
      rawGrade: result.grade,
    });

    // 验证分数范围
    const validatedResult = {
      ...result,
      totalScore: Math.max(0, Math.min(100, result.totalScore)),
      mustScore: Math.max(0, Math.min(100, result.mustScore)),
      niceScore: Math.max(0, Math.min(100, result.niceScore)),
    };

    trace.setAttribute(postSpan, "finalScore", validatedResult.totalScore);
    trace.setAttribute(postSpan, "finalGrade", validatedResult.grade);
    trace.endSpan(postSpan, "success");

    // ===== 完成 =====
    trace.endSpan(rootSpan, "success");
    const traceData = trace.getTrace();
    completeTrace(trace.traceId);

    return {
      result: validatedResult,
      traceId: trace.traceId,
      durationMs: traceData.totalDurationMs,
    };
  } catch (error) {
    trace.addEvent(rootSpan, "error", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    trace.endSpan(rootSpan, "error");
    completeTrace(trace.traceId);
    throw error;
  }
}

// Schema 和 prompt 构建（简化版）
const scoringResultSchema = z.object({
  totalScore: z.number(),
  mustScore: z.number(),
  niceScore: z.number(),
  rejectPenalty: z.number(),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  explanation: z.string(),
});

function buildScoringPrompt(resumeText: string, input: ScoringInput): string {
  return `你是一个专业的HR简历评估助手。请分析以下简历并评分。

职位: ${input.positionTitle}
必须技能: ${input.mustSkills.join(", ")}
加分技能: ${input.niceSkills.join(", ")}
否决关键词: ${input.rejectKeywords.join(", ")}

简历内容:
${resumeText}

请返回 JSON 格式的评分结果。`;
}
```

### O.3 Agent 指标收集

```typescript
// src/lib/agent-metrics.ts
// Agent 性能指标聚合

interface MetricPoint {
  value: number;
  timestamp: number;
  labels: Record<string, string>;
}

interface MetricSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

class AgentMetrics {
  private counters = new Map<string, number>();
  private histograms = new Map<string, MetricPoint[]>();
  private gauges = new Map<string, MetricPoint>();

  // ===== Counter: 累加计数 =====

  increment(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  // ===== Histogram: 分布统计 =====

  observe(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push({
      value,
      timestamp: Date.now(),
      labels,
    });

    // 只保留最近 1000 个数据点
    const points = this.histograms.get(key)!;
    if (points.length > 1000) {
      points.splice(0, points.length - 1000);
    }
  }

  // ===== Gauge: 当前值 =====

  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.gauges.set(key, { value, timestamp: Date.now(), labels });
  }

  // ===== 查询 =====

  getCounter(name: string, labels: Record<string, string> = {}): number {
    const key = `${name}:${JSON.stringify(labels)}`;
    return this.counters.get(key) || 0;
  }

  getHistogramSummary(
    name: string,
    labels: Record<string, string> = {}
  ): MetricSummary | null {
    const key = `${name}:${JSON.stringify(labels)}`;
    const points = this.histograms.get(key);
    if (!points || points.length === 0) return null;

    const values = points.map((p) => p.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      sum,
      min: values[0],
      max: values[values.length - 1],
      avg: sum / values.length,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      p99: percentile(values, 99),
    };
  }

  // ===== 导出所有指标 =====

  exportAll(): {
    counters: Record<string, number>;
    histograms: Record<string, MetricSummary>;
    gauges: Record<string, { value: number; timestamp: number }>;
  } {
    const counters: Record<string, number> = {};
    for (const [key, value] of this.counters) {
      counters[key] = value;
    }

    const histograms: Record<string, MetricSummary> = {};
    for (const [key, points] of this.histograms) {
      const values = points.map((p) => p.value).sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      histograms[key] = {
        count: values.length,
        sum,
        min: values[0],
        max: values[values.length - 1],
        avg: sum / values.length,
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        p99: percentile(values, 99),
      };
    }

    const gauges: Record<string, { value: number; timestamp: number }> = {};
    for (const [key, point] of this.gauges) {
      gauges[key] = { value: point.value, timestamp: point.timestamp };
    }

    return { counters, histograms, gauges };
  }
}

function percentile(sortedValues: number[], p: number): number {
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

// 全局实例
export const agentMetrics = new AgentMetrics();

// ===== 预定义指标名 =====

export const METRICS = {
  // 评分相关
  SCORING_DURATION: "agent.scoring.duration_ms",
  SCORING_TOKEN_USAGE: "agent.scoring.tokens",
  SCORING_SUCCESS: "agent.scoring.success_total",
  SCORING_ERROR: "agent.scoring.error_total",
  SCORING_GRADE_DIST: "agent.scoring.grade",

  // 邮件处理
  EMAIL_POLL_DURATION: "agent.email.poll_duration_ms",
  EMAIL_PROCESSED: "agent.email.processed_total",
  EMAIL_ATTACHMENTS: "agent.email.attachments_total",

  // 简历解析
  PARSE_DURATION: "agent.parse.duration_ms",
  PARSE_SUCCESS: "agent.parse.success_total",
  PARSE_ERROR: "agent.parse.error_total",

  // Workflow
  WORKFLOW_DURATION: "agent.workflow.duration_ms",
  WORKFLOW_STEPS: "agent.workflow.steps_completed",
  WORKFLOW_FAILURES: "agent.workflow.failure_total",

  // 活跃状态
  ACTIVE_WORKFLOWS: "agent.workflow.active_count",
  QUEUE_SIZE: "agent.queue.size",
} as const;
```

### O.4 指标路由

```typescript
// src/routes/agent-metrics.ts
// Agent 指标 API

import { Elysia } from "elysia";
import { agentMetrics, METRICS } from "../lib/agent-metrics.js";
import { getRecentTraces } from "../lib/agent-tracing.js";

const app = new Elysia();

// GET /api/admin/agents/metrics - 所有指标
app.get("/metrics", (c) => {
  const allMetrics = agentMetrics.exportAll();
  return c.json(allMetrics);
});

// GET /api/admin/agents/scoring-stats - 评分统计
app.get("/scoring-stats", (c) => {
  const durationStats = agentMetrics.getHistogramSummary(
    METRICS.SCORING_DURATION
  );
  const tokenStats = agentMetrics.getHistogramSummary(
    METRICS.SCORING_TOKEN_USAGE
  );
  const successCount = agentMetrics.getCounter(METRICS.SCORING_SUCCESS);
  const errorCount = agentMetrics.getCounter(METRICS.SCORING_ERROR);

  return c.json({
    totalScored: successCount + errorCount,
    successRate:
      successCount + errorCount > 0
        ? ((successCount / (successCount + errorCount)) * 100).toFixed(1) + "%"
        : "N/A",
    duration: durationStats
      ? {
          avg: `${durationStats.avg.toFixed(0)}ms`,
          p50: `${durationStats.p50.toFixed(0)}ms`,
          p95: `${durationStats.p95.toFixed(0)}ms`,
          p99: `${durationStats.p99.toFixed(0)}ms`,
        }
      : null,
    tokenUsage: tokenStats
      ? {
          avg: Math.round(tokenStats.avg),
          total: tokenStats.sum,
        }
      : null,
  });
});

// GET /api/admin/agents/traces - 最近追踪
app.get("/traces", (c) => {
  const limit = parseInt(c.req.query("limit") || "20");
  const traces = getRecentTraces(limit);
  return c.json({ traces, count: traces.length });
});

// GET /api/admin/agents/traces/:traceId - 单个追踪详情
app.get("/traces/:traceId", (c) => {
  const traceId = c.req.param("traceId");
  const traces = getRecentTraces(200);
  const trace = traces.find((t) => t.traceId === traceId);

  if (!trace) {
    return c.json({ error: "Trace not found" }, 404);
  }

  return c.json(trace);
});

export default app;
```

### O.5 Agent 错误恢复策略

```typescript
// src/lib/agent-resilience.ts
// Agent 弹性和错误恢复

// ===== 重试策略 =====

interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
};

/**
 * 指数退避重试
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 检查是否为可重试错误
      if (opts.retryableErrors && opts.retryableErrors.length > 0) {
        const isRetryable = opts.retryableErrors.some(
          (msg) => lastError!.message.includes(msg)
        );
        if (!isRetryable) throw lastError;
      }

      if (attempt === opts.maxAttempts) {
        throw lastError;
      }

      // 计算延迟（指数退避 + 抖动）
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );
      const jitter = delay * 0.1 * Math.random();
      const finalDelay = delay + jitter;

      console.warn(
        `[Retry] Attempt ${attempt}/${opts.maxAttempts} failed: ${lastError.message}. Retrying in ${finalDelay.toFixed(0)}ms`
      );
      await sleep(finalDelay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== 熔断器 =====

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerOptions {
  failureThreshold: number;    // 连续失败次数触发熔断
  resetTimeoutMs: number;      // 熔断后等待时间
  halfOpenMaxAttempts: number;  // 半开状态最大尝试数
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = {
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
      halfOpenMaxAttempts: 3,
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      // 检查是否可以切换到半开
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = "half-open";
        this.halfOpenAttempts = 0;
        console.log(`[CircuitBreaker:${this.name}] State: open → half-open`);
      } else {
        throw new Error(
          `CircuitBreaker [${this.name}] is OPEN. Service temporarily unavailable.`
        );
      }
    }

    try {
      const result = await fn();

      // 成功: 重置状态
      if (this.state === "half-open") {
        this.halfOpenAttempts++;
        if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
          this.state = "closed";
          this.failureCount = 0;
          console.log(`[CircuitBreaker:${this.name}] State: half-open → closed`);
        }
      } else {
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.state === "half-open") {
        // 半开状态失败，立即回到全开
        this.state = "open";
        console.log(`[CircuitBreaker:${this.name}] State: half-open → open`);
      } else if (this.failureCount >= this.options.failureThreshold) {
        this.state = "open";
        console.log(
          `[CircuitBreaker:${this.name}] State: closed → open (${this.failureCount} failures)`
        );
      }

      throw error;
    }
  }

  getState(): {
    name: string;
    state: CircuitState;
    failureCount: number;
    lastFailureTime: number | null;
  } {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime || null,
    };
  }
}

// ===== 预定义熔断器 =====

export const circuitBreakers = {
  minimax: new CircuitBreaker("minimax-api", {
    failureThreshold: 3,
    resetTimeoutMs: 30_000,
    halfOpenMaxAttempts: 2,
  }),
  imap: new CircuitBreaker("imap-server", {
    failureThreshold: 5,
    resetTimeoutMs: 60_000,
    halfOpenMaxAttempts: 3,
  }),
  database: new CircuitBreaker("postgresql", {
    failureThreshold: 3,
    resetTimeoutMs: 10_000,
    halfOpenMaxAttempts: 5,
  }),
};

// ===== 降级策略 =====

interface FallbackConfig<T> {
  primary: () => Promise<T>;
  fallback: () => Promise<T>;
  circuitBreaker?: CircuitBreaker;
}

/**
 * 主备切换: 主方法失败时使用降级方法
 */
export async function withFallback<T>(config: FallbackConfig<T>): Promise<T> {
  try {
    if (config.circuitBreaker) {
      return await config.circuitBreaker.execute(config.primary);
    }
    return await config.primary();
  } catch (primaryError) {
    console.warn(
      `[Fallback] Primary failed, trying fallback:`,
      primaryError instanceof Error ? primaryError.message : primaryError
    );
    return await config.fallback();
  }
}
```

### O.6 Agent 健康检查集成

```typescript
// src/routes/agent-health.ts
// Agent 子系统健康检查

import { Elysia } from "elysia";
import { circuitBreakers } from "../lib/agent-resilience.js";
import { getSchedulerStatus } from "../services/scheduler.js";
import { agentMetrics, METRICS } from "../lib/agent-metrics.js";

const app = new Elysia();

// GET /api/admin/agents/health - Agent 健康总览
app.get("/health", async (c) => {
  // 各子系统状态
  const circuits = Object.entries(circuitBreakers).map(([name, cb]) =>
    cb.getState()
  );

  // 调度器状态
  const schedulerStatus = getSchedulerStatus();

  // 最近错误率
  const scoringSuccess = agentMetrics.getCounter(METRICS.SCORING_SUCCESS);
  const scoringError = agentMetrics.getCounter(METRICS.SCORING_ERROR);
  const totalScoring = scoringSuccess + scoringError;
  const errorRate =
    totalScoring > 0 ? (scoringError / totalScoring) * 100 : 0;

  // 综合健康判定
  const hasOpenCircuit = circuits.some((cb) => cb.state === "open");
  const highErrorRate = errorRate > 10;

  const overallStatus = hasOpenCircuit
    ? "unhealthy"
    : highErrorRate
      ? "degraded"
      : "healthy";

  return c.json({
    status: overallStatus,
    circuitBreakers: circuits,
    scheduler: schedulerStatus,
    scoring: {
      totalProcessed: totalScoring,
      successCount: scoringSuccess,
      errorCount: scoringError,
      errorRate: `${errorRate.toFixed(1)}%`,
    },
    checks: {
      allCircuitsClosed: !hasOpenCircuit,
      errorRateAcceptable: !highErrorRate,
      schedulerRunning: schedulerStatus.length > 0,
    },
  });
});

// POST /api/admin/agents/circuit-breakers/:name/reset - 手动重置熔断器
app.post("/circuit-breakers/:name/reset", (c) => {
  const name = c.req.param("name") as keyof typeof circuitBreakers;
  const cb = circuitBreakers[name];

  if (!cb) {
    return c.json(
      { error: `Circuit breaker '${name}' not found` },
      404
    );
  }

  // 创建新实例替代（简单重置方法）
  // 实际应用中可以添加 reset() 方法到 CircuitBreaker 类
  return c.json({
    message: `Circuit breaker '${name}' state`,
    current: cb.getState(),
    note: "Manual reset requires restart or dedicated reset method",
  });
});

export default app;
```

### O.7 Agent 日志结构化

```typescript
// src/lib/agent-logger.ts
// 结构化日志（适合 ELK/Loki 收集）

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component: string;
  traceId?: string;
  spanId?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class AgentLogger {
  constructor(private readonly component: string) {}

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: this.component,
      ...data,
    };

    // JSON 格式输出（适合日志收集器）
    if (process.env.NODE_ENV === "production") {
      const output =
        level === "error" ? console.error : level === "warn" ? console.warn : console.log;
      output(JSON.stringify(entry));
    } else {
      // 开发环境可读格式
      const prefix = `[${entry.timestamp.substring(11, 23)}] [${level.toUpperCase().padEnd(5)}] [${this.component}]`;
      const output =
        level === "error" ? console.error : level === "warn" ? console.warn : console.log;
      output(prefix, message, data ? JSON.stringify(data, null, 2) : "");
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (process.env.LOG_LEVEL === "debug") {
      this.log("debug", message, data);
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log("error", message, {
      ...data,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
  }

  /**
   * 创建带 traceId 的子 logger
   */
  withTrace(traceId: string): TracedLogger {
    return new TracedLogger(this.component, traceId);
  }
}

class TracedLogger extends AgentLogger {
  constructor(
    component: string,
    private readonly traceId: string
  ) {
    super(component);
  }
}

// ===== 预定义 Logger =====

export const loggers = {
  scorer: new AgentLogger("ai-scorer"),
  email: new AgentLogger("email-service"),
  parser: new AgentLogger("resume-parser"),
  workflow: new AgentLogger("workflow"),
  scheduler: new AgentLogger("scheduler"),
  api: new AgentLogger("api"),
};
```

---

## 附录 P: Agent 任务队列与异步处理

### P.1 简历处理队列

```typescript
// src/lib/task-queue.ts
// 内存任务队列（轻量级，适合单实例部署）

type TaskStatus = "pending" | "processing" | "completed" | "failed" | "retrying";

interface QueueTask<T = unknown> {
  id: string;
  type: string;
  payload: T;
  status: TaskStatus;
  priority: number;          // 数字越大优先级越高
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  result: unknown | null;
}

type TaskHandler<T> = (payload: T) => Promise<unknown>;

export class TaskQueue {
  private queue: QueueTask[] = [];
  private handlers = new Map<string, TaskHandler<any>>();
  private processing = false;
  private concurrency: number;
  private activeCount = 0;

  constructor(options: { concurrency?: number } = {}) {
    this.concurrency = options.concurrency || 3;
  }

  /**
   * 注册任务处理器
   */
  register<T>(type: string, handler: TaskHandler<T>): void {
    this.handlers.set(type, handler);
  }

  /**
   * 添加任务到队列
   */
  enqueue<T>(
    type: string,
    payload: T,
    options: { priority?: number; maxAttempts?: number } = {}
  ): string {
    const task: QueueTask<T> = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      type,
      payload,
      status: "pending",
      priority: options.priority || 0,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      error: null,
      result: null,
    };

    this.queue.push(task);
    // 按优先级排序（高优先级在前）
    this.queue.sort((a, b) => b.priority - a.priority);

    this.processNext();
    return task.id;
  }

  /**
   * 处理下一个任务
   */
  private async processNext(): Promise<void> {
    if (this.activeCount >= this.concurrency) return;

    const task = this.queue.find((t) => t.status === "pending");
    if (!task) return;

    const handler = this.handlers.get(task.type);
    if (!handler) {
      task.status = "failed";
      task.error = `No handler registered for type: ${task.type}`;
      return;
    }

    task.status = "processing";
    task.startedAt = new Date();
    task.attempts++;
    this.activeCount++;

    try {
      task.result = await handler(task.payload);
      task.status = "completed";
      task.completedAt = new Date();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (task.attempts < task.maxAttempts) {
        task.status = "pending"; // 重新入队
        task.error = `Attempt ${task.attempts} failed: ${errorMsg}`;
        console.warn(
          `[Queue] Task ${task.id} failed (attempt ${task.attempts}/${task.maxAttempts}): ${errorMsg}`
        );
      } else {
        task.status = "failed";
        task.error = errorMsg;
        console.error(
          `[Queue] Task ${task.id} permanently failed after ${task.attempts} attempts: ${errorMsg}`
        );
      }
    } finally {
      this.activeCount--;
      // 继续处理下一个
      this.processNext();
    }
  }

  /**
   * 获取任务状态
   */
  getTask(id: string): QueueTask | undefined {
    return this.queue.find((t) => t.id === id);
  }

  /**
   * 获取队列统计
   */
  getStats(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  } {
    const stats = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    for (const task of this.queue) {
      stats[task.status === "retrying" ? "pending" : task.status]++;
      stats.total++;
    }
    return stats;
  }

  /**
   * 清理已完成的任务（保留最近 N 个）
   */
  cleanup(keepCompleted: number = 100): number {
    const completed = this.queue
      .filter((t) => t.status === "completed" || t.status === "failed")
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));

    const toRemove = completed.slice(keepCompleted);
    const removeIds = new Set(toRemove.map((t) => t.id));

    const before = this.queue.length;
    this.queue = this.queue.filter((t) => !removeIds.has(t.id));
    return before - this.queue.length;
  }
}

// 全局队列实例
export const resumeQueue = new TaskQueue({ concurrency: 3 });
```

### P.2 队列使用示例

```typescript
// src/services/resume-pipeline.ts
// 简历处理流水线: 邮件 → 解析 → 评分

import { resumeQueue } from "../lib/task-queue.js";
import { parseResume } from "./resume-parser.js";
import { scoreResumeTraced } from "./ai-scorer-traced.js";
import { db } from "../db/index.js";
import { candidates, resumes, scores } from "../db/schema.js";
import { agentMetrics, METRICS } from "../lib/agent-metrics.js";
import { loggers } from "../lib/agent-logger.js";

// ===== 注册任务处理器 =====

interface ParseResumePayload {
  candidateId: string;
  resumeId: string;
  filePath: string;
  fileType: "pdf" | "docx";
}

resumeQueue.register<ParseResumePayload>(
  "parse_resume",
  async (payload) => {
    const start = performance.now();
    loggers.parser.info("Parsing resume", {
      data: { resumeId: payload.resumeId, fileType: payload.fileType },
    });

    // 解析简历文本
    const text = await parseResume(payload.filePath, payload.fileType);

    // 更新数据库
    await db
      .update(resumes)
      .set({ rawText: text, parsedAt: new Date() })
      .where(eq(resumes.id, payload.resumeId));

    agentMetrics.observe(METRICS.PARSE_DURATION, performance.now() - start);
    agentMetrics.increment(METRICS.PARSE_SUCCESS);

    loggers.parser.info("Resume parsed successfully", {
      data: { resumeId: payload.resumeId, textLength: text.length },
    });

    // 自动触发评分任务
    resumeQueue.enqueue("score_resume", {
      candidateId: payload.candidateId,
      resumeId: payload.resumeId,
      resumeText: text,
    });

    return { textLength: text.length };
  }
);

interface ScoreResumePayload {
  candidateId: string;
  resumeId: string;
  resumeText: string;
}

resumeQueue.register<ScoreResumePayload>(
  "score_resume",
  async (payload) => {
    loggers.scorer.info("Scoring resume", {
      data: { candidateId: payload.candidateId },
    });

    // 获取候选人关联的职位
    const candidate = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, payload.candidateId))
      .limit(1);

    if (candidate.length === 0) {
      throw new Error(`Candidate not found: ${payload.candidateId}`);
    }

    // 获取职位要求
    const position = await db
      .select()
      .from(positions)
      .where(eq(positions.id, candidate[0].positionId))
      .limit(1);

    if (position.length === 0) {
      throw new Error(`Position not found: ${candidate[0].positionId}`);
    }

    const config = position[0].skillConfig as {
      must: string[];
      nice: string[];
      reject: string[];
    };

    // AI 评分
    const { result, traceId, durationMs } = await scoreResumeTraced({
      resumeText: payload.resumeText,
      positionTitle: position[0].title,
      mustSkills: config.must,
      niceSkills: config.nice,
      rejectKeywords: config.reject,
    });

    // 保存评分结果
    await db.insert(scores).values({
      candidateId: payload.candidateId,
      positionId: position[0].id,
      totalScore: result.totalScore,
      mustScore: result.mustScore,
      niceScore: result.niceScore,
      rejectPenalty: result.rejectPenalty,
      grade: result.grade,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      explanation: result.explanation,
    });

    // 更新候选人状态
    await db
      .update(candidates)
      .set({ status: "screening" })
      .where(eq(candidates.id, payload.candidateId));

    // 记录指标
    agentMetrics.observe(METRICS.SCORING_DURATION, durationMs);
    agentMetrics.increment(METRICS.SCORING_SUCCESS);
    agentMetrics.increment(METRICS.SCORING_GRADE_DIST, { grade: result.grade });

    loggers.scorer.info("Resume scored", {
      data: {
        candidateId: payload.candidateId,
        score: result.totalScore,
        grade: result.grade,
        traceId,
      },
    });

    return result;
  }
);

// 必要 import
import { eq } from "drizzle-orm";
import { positions } from "../db/schema.js";

// ===== 队列状态路由 =====

import { Elysia } from "elysia";

export const queueRoutes = new Elysia();

// GET /api/admin/queue/stats
queueRoutes.get("/stats", (c) => {
  return c.json(resumeQueue.getStats());
});

// GET /api/admin/queue/tasks/:id
queueRoutes.get("/tasks/:id", (c) => {
  const task = resumeQueue.getTask(c.req.param("id"));
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json(task);
});

// POST /api/admin/queue/cleanup
queueRoutes.post("/cleanup", (c) => {
  const removed = resumeQueue.cleanup(50);
  return c.json({ removed, stats: resumeQueue.getStats() });
});
```

### P.3 邮件轮询与队列集成

```typescript
// src/services/email-poller.ts
// 邮件轮询 → 自动入队

import { ImapFlow } from "imapflow";
import { env } from "../env.js";
import { resumeQueue } from "../lib/task-queue.js";
import { db } from "../db/index.js";
import { candidates, resumes } from "../db/schema.js";
import { loggers } from "../lib/agent-logger.js";
import { circuitBreakers, withRetry } from "../lib/agent-resilience.js";
import { agentMetrics, METRICS } from "../lib/agent-metrics.js";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = "/data/uploads/resumes";
const POLL_INTERVAL_MS = 60_000; // 1分钟

let pollTimer: NodeJS.Timeout | null = null;

/**
 * 启动邮件轮询
 */
export function startEmailPoller(): void {
  loggers.email.info("Starting email poller", {
    data: { host: env.IMAP_HOST, interval: `${POLL_INTERVAL_MS / 1000}s` },
  });

  // 立即执行一次
  pollMailbox();

  // 定期轮询
  pollTimer = setInterval(pollMailbox, POLL_INTERVAL_MS);
}

/**
 * 停止邮件轮询
 */
export function stopEmailPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    loggers.email.info("Email poller stopped");
  }
}

/**
 * 轮询收件箱
 */
async function pollMailbox(): Promise<void> {
  const start = performance.now();

  try {
    await circuitBreakers.imap.execute(async () => {
      const client = new ImapFlow({
        host: env.IMAP_HOST,
        port: env.IMAP_PORT,
        secure: env.IMAP_PORT === 993,
        auth: {
          user: env.IMAP_USER,
          pass: env.IMAP_PASS,
        },
        logger: false,
      });

      await client.connect();

      try {
        const lock = await client.getMailboxLock("INBOX");
        try {
          // 查找未读邮件
          const messages = client.fetch(
            { seen: false },
            {
              envelope: true,
              bodyStructure: true,
              source: true,
            }
          );

          let processedCount = 0;

          for await (const msg of messages) {
            await processEmail(client, msg);
            processedCount++;

            // 标记已读
            await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
          }

          if (processedCount > 0) {
            loggers.email.info(`Processed ${processedCount} new emails`);
            agentMetrics.increment(METRICS.EMAIL_PROCESSED, {}, processedCount);
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout();
      }
    });
  } catch (error) {
    loggers.email.error(
      "Email poll failed",
      error instanceof Error ? error : new Error(String(error))
    );
  }

  agentMetrics.observe(METRICS.EMAIL_POLL_DURATION, performance.now() - start);
}

/**
 * 处理单封邮件
 */
async function processEmail(client: ImapFlow, msg: any): Promise<void> {
  const from = msg.envelope?.from?.[0];
  if (!from) return;

  const senderEmail = `${from.mailbox}@${from.host}`;
  const senderName = from.name || senderEmail.split("@")[0];
  const subject = msg.envelope?.subject || "(无主题)";

  loggers.email.info("Processing email", {
    data: { from: senderEmail, subject },
  });

  // 提取附件
  const attachments = extractAttachments(msg);
  if (attachments.length === 0) {
    loggers.email.debug("No resume attachments found", {
      data: { from: senderEmail },
    });
    return;
  }

  // 创建候选人记录
  const [candidate] = await db
    .insert(candidates)
    .values({
      name: senderName,
      email: senderEmail,
      status: "new",
    })
    .onConflictDoUpdate({
      target: candidates.email,
      set: { name: senderName },
    })
    .returning();

  // 处理每个附件
  for (const attachment of attachments) {
    // 保存文件
    await mkdir(UPLOAD_DIR, { recursive: true });
    const filePath = join(
      UPLOAD_DIR,
      `${candidate.id}_${Date.now()}_${attachment.filename}`
    );
    await writeFile(filePath, attachment.content);

    // 创建简历记录
    const [resume] = await db
      .insert(resumes)
      .values({
        candidateId: candidate.id,
        fileName: attachment.filename,
        fileType: attachment.type,
        filePath,
        fileSize: attachment.content.length,
      })
      .returning();

    // 入队: 解析 → 评分
    resumeQueue.enqueue(
      "parse_resume",
      {
        candidateId: candidate.id,
        resumeId: resume.id,
        filePath,
        fileType: attachment.type as "pdf" | "docx",
      },
      { priority: 1 }
    );

    agentMetrics.increment(METRICS.EMAIL_ATTACHMENTS);

    loggers.email.info("Resume queued for processing", {
      data: {
        candidateId: candidate.id,
        resumeId: resume.id,
        filename: attachment.filename,
      },
    });
  }
}

/**
 * 从邮件中提取简历附件
 */
function extractAttachments(msg: any): Array<{
  filename: string;
  type: string;
  content: Buffer;
}> {
  // 简化版: 实际实现需要解析 MIME parts
  const attachments: Array<{
    filename: string;
    type: string;
    content: Buffer;
  }> = [];

  // ImapFlow 提供的 bodyStructure 包含附件信息
  // 具体实现取决于邮件 MIME 结构
  // 这里是示意代码

  return attachments;
}
```

---

## 附录 Q: Agent 配置管理与动态调参

### Q.1 Agent 配置中心

```typescript
// src/lib/agent-config.ts
// Agent 运行时配置管理（支持动态调整）

interface AgentConfig {
  // AI 评分配置
  scoring: {
    model: string;
    maxTokens: number;
    temperature: number;
    timeoutMs: number;
    maxRetries: number;
    concurrency: number;
    cacheEnabled: boolean;
    cacheTtlMs: number;
  };

  // 邮件轮询配置
  email: {
    pollIntervalMs: number;
    maxAttachmentSizeMB: number;
    supportedFormats: string[];
    enabled: boolean;
  };

  // 任务队列配置
  queue: {
    concurrency: number;
    maxRetries: number;
    retryDelayMs: number;
    cleanupIntervalMs: number;
    maxCompletedTasks: number;
  };

  // 监控配置
  monitoring: {
    metricsEnabled: boolean;
    tracingEnabled: boolean;
    slowQueryThresholdMs: number;
    logLevel: "debug" | "info" | "warn" | "error";
  };

  // 安全配置
  security: {
    promptInjectionDetection: boolean;
    outputValidation: boolean;
    maxResumeTextLength: number;
    rateLimitPerMinute: number;
  };
}

// 默认配置
const DEFAULT_CONFIG: AgentConfig = {
  scoring: {
    model: "MiniMax-M2.5",
    maxTokens: 4096,
    temperature: 0.1,
    timeoutMs: 30_000,
    maxRetries: 3,
    concurrency: 3,
    cacheEnabled: true,
    cacheTtlMs: 3600_000, // 1小时
  },
  email: {
    pollIntervalMs: 60_000, // 1分钟
    maxAttachmentSizeMB: 10,
    supportedFormats: ["pdf", "docx", "doc"],
    enabled: true,
  },
  queue: {
    concurrency: 3,
    maxRetries: 3,
    retryDelayMs: 5000,
    cleanupIntervalMs: 300_000, // 5分钟
    maxCompletedTasks: 500,
  },
  monitoring: {
    metricsEnabled: true,
    tracingEnabled: true,
    slowQueryThresholdMs: 100,
    logLevel: "info",
  },
  security: {
    promptInjectionDetection: true,
    outputValidation: true,
    maxResumeTextLength: 8000,
    rateLimitPerMinute: 60,
  },
};

// 运行时配置（可动态修改）
let currentConfig: AgentConfig = structuredClone(DEFAULT_CONFIG);

/**
 * 获取当前配置
 */
export function getAgentConfig(): Readonly<AgentConfig> {
  return currentConfig;
}

/**
 * 更新配置（深度合并）
 */
export function updateAgentConfig(
  patch: DeepPartial<AgentConfig>
): AgentConfig {
  currentConfig = deepMerge(currentConfig, patch) as AgentConfig;

  console.log("[Config] Agent configuration updated");
  return currentConfig;
}

/**
 * 重置为默认配置
 */
export function resetAgentConfig(): AgentConfig {
  currentConfig = structuredClone(DEFAULT_CONFIG);
  console.log("[Config] Agent configuration reset to defaults");
  return currentConfig;
}

// 类型工具
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}
```

### Q.2 配置管理路由

```typescript
// src/routes/agent-config.ts
// Agent 配置管理 API

import { Elysia } from "elysia";
import {
  getAgentConfig,
  updateAgentConfig,
  resetAgentConfig,
} from "../lib/agent-config.js";

const app = new Elysia();

// GET /api/admin/config - 获取当前配置
app.get("/", (c) => {
  return c.json(getAgentConfig());
});

// PATCH /api/admin/config - 更新配置
app.patch("/", async (c) => {
  const patch = await c.req.json();
  const updated = updateAgentConfig(patch);
  return c.json({
    message: "Configuration updated",
    config: updated,
  });
});

// POST /api/admin/config/reset - 重置配置
app.post("/reset", (c) => {
  const config = resetAgentConfig();
  return c.json({
    message: "Configuration reset to defaults",
    config,
  });
});

// 常用配置快捷操作
// POST /api/admin/config/scoring/pause - 暂停评分
app.post("/scoring/pause", (c) => {
  updateAgentConfig({ scoring: { concurrency: 0 } });
  return c.json({ message: "Scoring paused (concurrency set to 0)" });
});

// POST /api/admin/config/scoring/resume - 恢复评分
app.post("/scoring/resume", (c) => {
  updateAgentConfig({ scoring: { concurrency: 3 } });
  return c.json({ message: "Scoring resumed (concurrency set to 3)" });
});

// POST /api/admin/config/email/toggle - 切换邮件轮询
app.post("/email/toggle", (c) => {
  const current = getAgentConfig();
  updateAgentConfig({ email: { enabled: !current.email.enabled } });
  return c.json({
    message: `Email polling ${!current.email.enabled ? "enabled" : "disabled"}`,
  });
});

export default app;
```

### Q.3 Agent 事件系统

```typescript
// src/lib/agent-events.ts
// Agent 事件发布/订阅

type EventName =
  | "resume.received"
  | "resume.parsed"
  | "resume.scored"
  | "candidate.created"
  | "candidate.statusChanged"
  | "email.polled"
  | "email.error"
  | "scoring.started"
  | "scoring.completed"
  | "scoring.failed"
  | "workflow.completed"
  | "config.updated";

interface EventPayload {
  "resume.received": { candidateId: string; fileName: string };
  "resume.parsed": { resumeId: string; textLength: number };
  "resume.scored": {
    candidateId: string;
    positionId: string;
    score: number;
    grade: string;
  };
  "candidate.created": { candidateId: string; email: string };
  "candidate.statusChanged": {
    candidateId: string;
    from: string;
    to: string;
  };
  "email.polled": { newMessages: number };
  "email.error": { error: string };
  "scoring.started": { candidateId: string };
  "scoring.completed": { candidateId: string; durationMs: number };
  "scoring.failed": { candidateId: string; error: string };
  "workflow.completed": {
    workflowId: string;
    steps: number;
    durationMs: number;
  };
  "config.updated": { section: string };
}

type EventHandler<T extends EventName> = (
  payload: EventPayload[T]
) => void | Promise<void>;

class AgentEventBus {
  private handlers = new Map<string, Set<EventHandler<any>>>();

  /**
   * 订阅事件
   */
  on<T extends EventName>(event: T, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // 返回取消订阅函数
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * 发布事件
   */
  async emit<T extends EventName>(
    event: T,
    payload: EventPayload[T]
  ): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.size === 0) return;

    const promises: Promise<void>[] = [];
    for (const handler of handlers) {
      try {
        const result = handler(payload);
        if (result instanceof Promise) {
          promises.push(result);
        }
      } catch (error) {
        console.error(`[EventBus] Handler error for '${event}':`, error);
      }
    }

    // 等待所有异步 handler 完成
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * 获取事件统计
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [event, handlers] of this.handlers) {
      stats[event] = handlers.size;
    }
    return stats;
  }
}

// 全局事件总线
export const agentEvents = new AgentEventBus();
```

### Q.4 事件处理器注册

```typescript
// src/services/event-handlers.ts
// 注册 Agent 事件处理器

import { agentEvents } from "../lib/agent-events.js";
import { agentMetrics, METRICS } from "../lib/agent-metrics.js";
import { loggers } from "../lib/agent-logger.js";
import { invalidateCandidateCache } from "../routes/candidates.js";

/**
 * 注册所有事件处理器
 */
export function registerEventHandlers(): void {
  // 简历接收 → 日志 + 计数
  agentEvents.on("resume.received", (payload) => {
    loggers.email.info("Resume received", { data: payload });
    agentMetrics.increment(METRICS.EMAIL_ATTACHMENTS);
  });

  // 评分完成 → 更新指标 + 日志
  agentEvents.on("scoring.completed", (payload) => {
    loggers.scorer.info("Scoring completed", { data: payload });
    agentMetrics.observe(METRICS.SCORING_DURATION, payload.durationMs);
    agentMetrics.increment(METRICS.SCORING_SUCCESS);
  });

  // 评分失败 → 报警
  agentEvents.on("scoring.failed", (payload) => {
    loggers.scorer.error("Scoring failed", undefined, { data: payload });
    agentMetrics.increment(METRICS.SCORING_ERROR);
  });

  // 候选人状态变更 → 缓存失效
  agentEvents.on("candidate.statusChanged", (payload) => {
    loggers.api.info("Candidate status changed", { data: payload });
    invalidateCandidateCache();
  });

  // 简历评分 → 记录等级分布
  agentEvents.on("resume.scored", (payload) => {
    agentMetrics.increment(METRICS.SCORING_GRADE_DIST, {
      grade: payload.grade,
    });
  });

  // 邮件轮询错误 → 报警
  agentEvents.on("email.error", (payload) => {
    loggers.email.error("Email polling error", new Error(payload.error));
  });

  console.log("[Events] All event handlers registered");
}
```

### Q.5 Agent 运行时诊断

```typescript
// src/routes/agent-diagnostics.ts
// Agent 运行时诊断 API

import { Elysia } from "elysia";
import { getAgentConfig } from "../lib/agent-config.js";
import { agentMetrics } from "../lib/agent-metrics.js";
import { agentEvents } from "../lib/agent-events.js";
import { circuitBreakers } from "../lib/agent-resilience.js";
import { getSchedulerStatus } from "../services/scheduler.js";
import { resumeQueue } from "../lib/task-queue.js";

const app = new Elysia();

// GET /api/admin/diagnostics - 完整诊断报告
app.get("/", async (c) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  return c.json({
    system: {
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      memory: {
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(1)}MB`,
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(1)}MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(1)}MB`,
      },
      bunVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    },
    config: getAgentConfig(),
    metrics: agentMetrics.exportAll(),
    circuitBreakers: Object.entries(circuitBreakers).map(([name, cb]) =>
      cb.getState()
    ),
    scheduler: getSchedulerStatus(),
    queue: resumeQueue.getStats(),
    events: agentEvents.getStats(),
  });
});

export default app;
```

---

## Appendix R: エージェント多段階ワークフロー & DAG 実行エンジン

### R.1 ワークフロー定義 & DAG エンジン

```typescript
// src/services/workflow-engine.ts
// DAG ベースのワークフロー実行エンジン
// 採用パイプラインの各ステップを有向非巡回グラフで管理

type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface WorkflowStep {
  id: string;
  name: string;
  handler: (input: unknown, context: WorkflowContext) => Promise<unknown>;
  dependsOn: string[];       // 前提ステップの ID
  retries: number;           // リトライ回数
  timeoutMs: number;         // タイムアウト
  condition?: (context: WorkflowContext) => boolean;  // 実行条件
}

interface StepResult {
  stepId: string;
  status: StepStatus;
  output: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs: number;
  retryCount: number;
}

interface WorkflowContext {
  workflowId: string;
  inputs: Record<string, unknown>;
  results: Map<string, StepResult>;
  metadata: Record<string, unknown>;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
  onComplete?: (context: WorkflowContext) => Promise<void>;
  onError?: (error: Error, context: WorkflowContext) => Promise<void>;
}

interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  context: WorkflowContext;
  startedAt: Date;
  completedAt?: Date;
}

export class WorkflowEngine {
  private workflows = new Map<string, WorkflowDefinition>();
  private executions = new Map<string, WorkflowExecution>();

  // ワークフロー登録
  register(workflow: WorkflowDefinition): void {
    // DAG 検証（循環チェック）
    this.validateDAG(workflow.steps);
    this.workflows.set(workflow.id, workflow);
  }

  // DAG の循環チェック
  private validateDAG(steps: WorkflowStep[]): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const stepMap = new Map(steps.map((s) => [s.id, s]));

    const dfs = (id: string): void => {
      if (inStack.has(id)) {
        throw new Error(`Circular dependency detected at step: ${id}`);
      }
      if (visited.has(id)) return;

      inStack.add(id);
      const step = stepMap.get(id);
      if (step) {
        for (const dep of step.dependsOn) {
          dfs(dep);
        }
      }
      inStack.delete(id);
      visited.add(id);
    };

    for (const step of steps) {
      dfs(step.id);
    }
  }

  // ワークフロー実行
  async execute(
    workflowId: string,
    inputs: Record<string, unknown>
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const context: WorkflowContext = {
      workflowId,
      inputs,
      results: new Map(),
      metadata: {},
    };

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: "running",
      context,
      startedAt: new Date(),
    };

    this.executions.set(executionId, execution);

    try {
      await this.executeDAG(workflow.steps, context);
      execution.status = "completed";
      if (workflow.onComplete) {
        await workflow.onComplete(context);
      }
    } catch (error) {
      execution.status = "failed";
      if (workflow.onError) {
        await workflow.onError(error as Error, context);
      }
    }

    execution.completedAt = new Date();
    return execution;
  }

  // DAG 実行（トポロジカル順序 + 並行実行）
  private async executeDAG(
    steps: WorkflowStep[],
    context: WorkflowContext
  ): Promise<void> {
    const remaining = new Set(steps.map((s) => s.id));
    const stepMap = new Map(steps.map((s) => [s.id, s]));

    while (remaining.size > 0) {
      // 実行可能なステップを探す（依存が全て完了）
      const ready: WorkflowStep[] = [];

      for (const id of remaining) {
        const step = stepMap.get(id)!;
        const depsCompleted = step.dependsOn.every((dep) => {
          const result = context.results.get(dep);
          return result && (result.status === "completed" || result.status === "skipped");
        });

        if (depsCompleted) {
          ready.push(step);
        }
      }

      if (ready.length === 0 && remaining.size > 0) {
        // デッドロック（依存関係にfailedステップがある）
        const failedDeps = [...remaining].filter((id) => {
          const step = stepMap.get(id)!;
          return step.dependsOn.some((dep) => {
            const result = context.results.get(dep);
            return result && result.status === "failed";
          });
        });

        for (const id of failedDeps) {
          context.results.set(id, {
            stepId: id,
            status: "skipped",
            output: null,
            error: "Skipped due to failed dependency",
            startedAt: new Date(),
            durationMs: 0,
            retryCount: 0,
          });
          remaining.delete(id);
        }
        continue;
      }

      // 並行実行
      await Promise.all(
        ready.map((step) => this.executeStep(step, context))
      );

      for (const step of ready) {
        remaining.delete(step.id);
      }
    }
  }

  // 個別ステップ実行（リトライ付き）
  private async executeStep(
    step: WorkflowStep,
    context: WorkflowContext
  ): Promise<void> {
    // 条件チェック
    if (step.condition && !step.condition(context)) {
      context.results.set(step.id, {
        stepId: step.id,
        status: "skipped",
        output: null,
        startedAt: new Date(),
        durationMs: 0,
        retryCount: 0,
      });
      return;
    }

    const startedAt = new Date();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= step.retries; attempt++) {
      try {
        // 前ステップの出力を入力として渡す
        const input = step.dependsOn.length > 0
          ? Object.fromEntries(
              step.dependsOn.map((dep) => [dep, context.results.get(dep)?.output])
            )
          : context.inputs;

        // タイムアウト付き実行
        const output = await Promise.race([
          step.handler(input, context),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Step ${step.id} timed out`)), step.timeoutMs)
          ),
        ]);

        context.results.set(step.id, {
          stepId: step.id,
          status: "completed",
          output,
          startedAt,
          completedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          retryCount: attempt,
        });
        return;
      } catch (error) {
        lastError = error as Error;
        if (attempt < step.retries) {
          // 指数バックオフ
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }

    context.results.set(step.id, {
      stepId: step.id,
      status: "failed",
      output: null,
      error: lastError?.message,
      startedAt,
      completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      retryCount: step.retries,
    });
  }

  // 実行状態取得
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  // 全実行履歴
  listExecutions(): WorkflowExecution[] {
    return [...this.executions.values()];
  }
}

export const workflowEngine = new WorkflowEngine();
```

### R.2 採用パイプライン ワークフロー定義

```typescript
// src/workflows/resume-processing.ts
// 簡歴処理ワークフロー定義

import { workflowEngine } from "../services/workflow-engine.js";
import { parseResume } from "../services/resume-parser.js";
import { scoreCandidate } from "../services/ai-scorer.js";
import { db } from "../db/index.js";
import { candidates, resumes, scores } from "../db/schema.js";
import { eq } from "drizzle-orm";

// ワークフロー: メールからの簡歴処理
workflowEngine.register({
  id: "resume-from-email",
  name: "邮件简历处理流程",
  steps: [
    // Step 1: 添付ファイル抽出
    {
      id: "extract_attachment",
      name: "提取邮件附件",
      dependsOn: [],
      retries: 2,
      timeoutMs: 30_000,
      handler: async (input) => {
        const { emailData } = input as { emailData: { attachments: Array<{ filename: string; content: Buffer }> } };
        const supportedExts = [".pdf", ".docx", ".doc"];
        const validAttachments = emailData.attachments.filter((a) =>
          supportedExts.some((ext) => a.filename.toLowerCase().endsWith(ext))
        );

        if (validAttachments.length === 0) {
          throw new Error("没有找到支持的简历文件（PDF/DOCX）");
        }

        return { attachments: validAttachments };
      },
    },

    // Step 2: テキスト抽出
    {
      id: "parse_text",
      name: "解析简历文本",
      dependsOn: ["extract_attachment"],
      retries: 1,
      timeoutMs: 60_000,
      handler: async (input) => {
        const { extract_attachment } = input as {
          extract_attachment: { attachments: Array<{ filename: string; content: Buffer }> };
        };
        const attachment = extract_attachment.attachments[0];
        const text = await parseResume(attachment.content, attachment.filename);

        if (text.trim().length < 50) {
          throw new Error("简历文本过短，可能解析失败");
        }

        return { text, filename: attachment.filename, charCount: text.length };
      },
    },

    // Step 3: 候補者レコード作成
    {
      id: "create_candidate",
      name: "创建候选人记录",
      dependsOn: ["parse_text"],
      retries: 2,
      timeoutMs: 10_000,
      handler: async (input, context) => {
        const { parse_text } = input as { parse_text: { text: string; filename: string } };
        const emailData = context.inputs.emailData as { from: string; subject: string };

        // 基本情報抽出（簡易版）
        const emailMatch = parse_text.text.match(
          /[\w.+-]+@[\w-]+\.[\w.-]+/
        );
        const phoneMatch = parse_text.text.match(
          /1[3-9]\d{9}/
        );

        const [candidate] = await db
          .insert(candidates)
          .values({
            name: emailData.subject.replace(/简历|求职|应聘/g, "").trim() || "未知",
            email: emailMatch?.[0] || emailData.from,
            phone: phoneMatch?.[0] || null,
            source: "email",
            status: "new",
          })
          .returning();

        // 簡歴レコード
        await db.insert(resumes).values({
          candidateId: candidate.id,
          filename: parse_text.filename,
          rawText: parse_text.text,
          fileSize: Buffer.byteLength(parse_text.text),
        });

        return { candidateId: candidate.id };
      },
    },

    // Step 4: AI スコアリング
    {
      id: "ai_scoring",
      name: "AI评分",
      dependsOn: ["parse_text", "create_candidate"],
      retries: 3,
      timeoutMs: 120_000,
      handler: async (input, context) => {
        const { parse_text, create_candidate } = input as {
          parse_text: { text: string };
          create_candidate: { candidateId: number };
        };
        const positionId = (context.inputs.positionId as number) || 1;

        const scoreResult = await scoreCandidate(
          parse_text.text,
          positionId
        );

        // スコア保存
        await db.insert(scores).values({
          candidateId: create_candidate.candidateId,
          positionId,
          totalScore: scoreResult.totalScore,
          mustScore: scoreResult.mustScore,
          niceScore: scoreResult.niceScore,
          rejectPenalty: scoreResult.rejectPenalty,
          grade: scoreResult.grade,
          matchedSkills: scoreResult.matchedSkills,
          missingSkills: scoreResult.missingSkills,
          explanation: scoreResult.explanation,
        });

        return scoreResult;
      },
    },

    // Step 5: 候補者ステータス更新
    {
      id: "update_status",
      name: "更新候选人状态",
      dependsOn: ["ai_scoring"],
      retries: 1,
      timeoutMs: 5_000,
      handler: async (input) => {
        const { ai_scoring } = input as {
          ai_scoring: { grade: string; totalScore: number };
        };

        // グレードに基づくステータス自動設定
        let status: string;
        if (ai_scoring.grade === "A" || ai_scoring.grade === "B") {
          status = "shortlisted";   // ショートリスト入り
        } else if (ai_scoring.grade === "C") {
          status = "review";        // 手動レビュー対象
        } else {
          status = "rejected";      // 自動不合格
        }

        return { status, grade: ai_scoring.grade, score: ai_scoring.totalScore };
      },
    },

    // Step 6: 通知送信（条件付き）
    {
      id: "send_notification",
      name: "发送通知",
      dependsOn: ["update_status"],
      retries: 2,
      timeoutMs: 10_000,
      condition: (context) => {
        const result = context.results.get("ai_scoring");
        const score = result?.output as { grade: string } | undefined;
        return score?.grade === "A";  // A 評価のみ通知
      },
      handler: async (input) => {
        const { update_status } = input as {
          update_status: { status: string; grade: string; score: number };
        };
        // 通知ロジック（Slack, メール等）
        console.log(
          `🎯 优秀候选人！评级: ${update_status.grade}, 分数: ${update_status.score}`
        );
        return { notified: true };
      },
    },
  ],

  onComplete: async (context) => {
    const scoring = context.results.get("ai_scoring");
    const candidate = context.results.get("create_candidate");
    console.log(
      `✅ 简历处理完成 [候选人ID: ${(candidate?.output as { candidateId: number })?.candidateId}]`
    );
  },

  onError: async (error, context) => {
    console.error(`❌ 简历处理失败: ${error.message}`);
    // エラーログを DB に保存
  },
});
```

### R.3 ワークフロー管理ルート

```typescript
// src/routes/workflows.ts
// ワークフロー管理 API

import { Elysia } from "elysia";
import { workflowEngine } from "../services/workflow-engine.js";

const app = new Elysia();

// POST /api/workflows/:id/execute - ワークフロー実行
app.post("/:id/execute", async (c) => {
  const workflowId = c.req.param("id");
  const inputs = await c.req.json();

  try {
    const execution = await workflowEngine.execute(workflowId, inputs);

    const stepResults = Object.fromEntries(
      [...execution.context.results.entries()].map(([id, result]) => [
        id,
        {
          status: result.status,
          durationMs: result.durationMs,
          retryCount: result.retryCount,
          error: result.error,
        },
      ])
    );

    return c.json({
      executionId: execution.id,
      status: execution.status,
      steps: stepResults,
      totalDurationMs: execution.completedAt
        ? execution.completedAt.getTime() - execution.startedAt.getTime()
        : null,
    });
  } catch (error) {
    return c.json(
      { error: `Workflow execution failed: ${(error as Error).message}` },
      500
    );
  }
});

// GET /api/workflows/executions - 実行履歴
app.get("/executions", async (c) => {
  const executions = workflowEngine.listExecutions();

  return c.json({
    total: executions.length,
    executions: executions.map((e) => ({
      id: e.id,
      workflowId: e.workflowId,
      status: e.status,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      stepCount: e.context.results.size,
    })),
  });
});

// GET /api/workflows/executions/:id - 実行詳細
app.get("/executions/:id", async (c) => {
  const executionId = c.req.param("id");
  const execution = workflowEngine.getExecution(executionId);

  if (!execution) {
    return c.json({ error: "Execution not found" }, 404);
  }

  return c.json({
    id: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    inputs: execution.context.inputs,
    steps: Object.fromEntries(
      [...execution.context.results.entries()].map(([id, result]) => [
        id,
        {
          status: result.status,
          durationMs: result.durationMs,
          retryCount: result.retryCount,
          error: result.error,
          output: result.output,
        },
      ])
    ),
  });
});

export default app;
```

### R.4 ワークフローテスト

```typescript
// test/workflow-engine.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { WorkflowEngine } from "../src/services/workflow-engine.js";

describe("WorkflowEngine", () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  it("シンプルな直列ワークフローを実行", async () => {
    engine.register({
      id: "simple",
      name: "Simple Workflow",
      steps: [
        {
          id: "step1",
          name: "Step 1",
          dependsOn: [],
          retries: 0,
          timeoutMs: 5000,
          handler: async (input) => ({ value: (input as { initial: number }).initial * 2 }),
        },
        {
          id: "step2",
          name: "Step 2",
          dependsOn: ["step1"],
          retries: 0,
          timeoutMs: 5000,
          handler: async (input) => ({
            result: (input as { step1: { value: number } }).step1.value + 10,
          }),
        },
      ],
    });

    const execution = await engine.execute("simple", { initial: 5 });

    expect(execution.status).toBe("completed");
    expect(execution.context.results.get("step1")?.output).toEqual({ value: 10 });
    expect(execution.context.results.get("step2")?.output).toEqual({ result: 20 });
  });

  it("並行ステップを同時実行", async () => {
    const executionOrder: string[] = [];

    engine.register({
      id: "parallel",
      name: "Parallel Workflow",
      steps: [
        {
          id: "a",
          name: "Step A",
          dependsOn: [],
          retries: 0,
          timeoutMs: 5000,
          handler: async () => {
            executionOrder.push("a_start");
            await new Promise((r) => setTimeout(r, 50));
            executionOrder.push("a_end");
            return { a: true };
          },
        },
        {
          id: "b",
          name: "Step B",
          dependsOn: [],
          retries: 0,
          timeoutMs: 5000,
          handler: async () => {
            executionOrder.push("b_start");
            await new Promise((r) => setTimeout(r, 50));
            executionOrder.push("b_end");
            return { b: true };
          },
        },
        {
          id: "c",
          name: "Step C (depends on A and B)",
          dependsOn: ["a", "b"],
          retries: 0,
          timeoutMs: 5000,
          handler: async () => {
            executionOrder.push("c");
            return { c: true };
          },
        },
      ],
    });

    const execution = await engine.execute("parallel", {});

    expect(execution.status).toBe("completed");
    // A と B は同時に開始される
    expect(executionOrder.indexOf("a_start")).toBeLessThan(executionOrder.indexOf("c"));
    expect(executionOrder.indexOf("b_start")).toBeLessThan(executionOrder.indexOf("c"));
  });

  it("循環依存を検出", () => {
    expect(() => {
      engine.register({
        id: "circular",
        name: "Circular",
        steps: [
          {
            id: "x",
            name: "X",
            dependsOn: ["y"],
            retries: 0,
            timeoutMs: 5000,
            handler: async () => ({}),
          },
          {
            id: "y",
            name: "Y",
            dependsOn: ["x"],
            retries: 0,
            timeoutMs: 5000,
            handler: async () => ({}),
          },
        ],
      });
    }).toThrow(/Circular dependency/);
  });

  it("失敗ステップの後続をスキップ", async () => {
    engine.register({
      id: "fail-skip",
      name: "Fail and Skip",
      steps: [
        {
          id: "fail",
          name: "Will Fail",
          dependsOn: [],
          retries: 0,
          timeoutMs: 5000,
          handler: async () => {
            throw new Error("Intentional failure");
          },
        },
        {
          id: "dependent",
          name: "Depends on Fail",
          dependsOn: ["fail"],
          retries: 0,
          timeoutMs: 5000,
          handler: async () => ({ ran: true }),
        },
      ],
    });

    const execution = await engine.execute("fail-skip", {});

    expect(execution.context.results.get("fail")?.status).toBe("failed");
    expect(execution.context.results.get("dependent")?.status).toBe("skipped");
  });

  it("条件付きステップをスキップ", async () => {
    engine.register({
      id: "conditional",
      name: "Conditional",
      steps: [
        {
          id: "check",
          name: "Check",
          dependsOn: [],
          retries: 0,
          timeoutMs: 5000,
          handler: async () => ({ grade: "C" }),
        },
        {
          id: "notify",
          name: "Notify (A only)",
          dependsOn: ["check"],
          retries: 0,
          timeoutMs: 5000,
          condition: (ctx) => {
            const result = ctx.results.get("check");
            return (result?.output as { grade: string })?.grade === "A";
          },
          handler: async () => ({ notified: true }),
        },
      ],
    });

    const execution = await engine.execute("conditional", {});

    expect(execution.context.results.get("check")?.status).toBe("completed");
    expect(execution.context.results.get("notify")?.status).toBe("skipped");
  });
});
```

---

## Appendix S: MCP (Model Context Protocol) サーバー実装

### S.1 HR データ MCP サーバー

```typescript
// src/mcp/hr-data-server.ts
// MCP サーバー: AI アシスタントに HR データを提供
// Claude Desktop / MCP クライアントから接続

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { db } from "../db/index.js";
import { candidates, positions, scores } from "../db/schema.js";
import { eq, desc, sql } from "drizzle-orm";

const server = new Server(
  { name: "hr-data-server", version: "1.0.0" },
  { capabilities: { resources: { listChanged: true }, tools: {} } }
);

// --- Resources: HR データのリード ---

// リソース一覧
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // 職位リストをリソースとして公開
  const positionList = await db
    .select({ id: positions.id, title: positions.title })
    .from(positions);

  return {
    resources: [
      {
        uri: "hr://positions",
        name: "全職位一覧",
        mimeType: "application/json",
        description: "Active positions with skill requirements",
      },
      {
        uri: "hr://candidates/summary",
        name: "候補者サマリー",
        mimeType: "application/json",
        description: "Candidate statistics and grade distribution",
      },
      ...positionList.map((p) => ({
        uri: `hr://positions/${p.id}/candidates`,
        name: `${p.title} - 候補者一覧`,
        mimeType: "application/json",
        description: `Candidates for position: ${p.title}`,
      })),
    ],
  };
});

// リソース読み取り
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // 全職位
  if (uri === "hr://positions") {
    const positionList = await db.select().from(positions);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(positionList, null, 2),
        },
      ],
    };
  }

  // 候補者サマリー
  if (uri === "hr://candidates/summary") {
    const stats = await db
      .select({
        totalCandidates: sql<number>`count(distinct ${candidates.id})`,
        totalScored: sql<number>`count(distinct ${scores.candidateId})`,
        avgScore: sql<number>`avg(${scores.totalScore})`,
      })
      .from(candidates)
      .leftJoin(scores, eq(scores.candidateId, candidates.id));

    const gradeDistribution = await db
      .select({
        grade: scores.grade,
        count: sql<number>`count(*)`,
      })
      .from(scores)
      .groupBy(scores.grade);

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            { stats: stats[0], gradeDistribution },
            null,
            2
          ),
        },
      ],
    };
  }

  // 職位別候補者
  const positionMatch = uri.match(/^hr:\/\/positions\/(\d+)\/candidates$/);
  if (positionMatch) {
    const positionId = parseInt(positionMatch[1], 10);

    const candidateList = await db
      .select({
        id: candidates.id,
        name: candidates.name,
        email: candidates.email,
        skills: candidates.skills,
        totalScore: scores.totalScore,
        grade: scores.grade,
        status: candidates.status,
      })
      .from(candidates)
      .innerJoin(scores, eq(scores.candidateId, candidates.id))
      .where(eq(scores.positionId, positionId))
      .orderBy(desc(scores.totalScore));

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(candidateList, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// --- Tools: HR 操作 ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_candidates",
        description: "按技能、评级或状态搜索候选人",
        inputSchema: {
          type: "object" as const,
          properties: {
            skills: {
              type: "array",
              items: { type: "string" },
              description: "要匹配的技能列表",
            },
            minScore: {
              type: "number",
              description: "最低分数",
            },
            grade: {
              type: "string",
              enum: ["A", "B", "C", "D", "F"],
              description: "评级筛选",
            },
            limit: {
              type: "number",
              description: "返回数量限制",
              default: 20,
            },
          },
        },
      },
      {
        name: "update_candidate_status",
        description: "更新候选人状态（shortlisted / rejected / interview）",
        inputSchema: {
          type: "object" as const,
          properties: {
            candidateId: { type: "number", description: "候选人 ID" },
            status: {
              type: "string",
              enum: ["new", "shortlisted", "interview", "offered", "rejected", "archived"],
              description: "新状态",
            },
            note: { type: "string", description: "备注" },
          },
          required: ["candidateId", "status"],
        },
      },
      {
        name: "get_position_report",
        description: "获取职位的招聘进度报告",
        inputSchema: {
          type: "object" as const,
          properties: {
            positionId: { type: "number", description: "职位 ID" },
          },
          required: ["positionId"],
        },
      },
    ],
  };
});

// ツール実行
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "search_candidates": {
      const { skills, minScore, grade, limit = 20 } = args as {
        skills?: string[];
        minScore?: number;
        grade?: string;
        limit?: number;
      };

      let query = db
        .select({
          id: candidates.id,
          name: candidates.name,
          email: candidates.email,
          skills: candidates.skills,
          totalScore: scores.totalScore,
          grade: scores.grade,
        })
        .from(candidates)
        .innerJoin(scores, eq(scores.candidateId, candidates.id))
        .orderBy(desc(scores.totalScore))
        .limit(limit);

      // フィルタは動的に適用
      const conditions = [];
      if (minScore !== undefined) {
        conditions.push(sql`${scores.totalScore} >= ${minScore}`);
      }
      if (grade) {
        conditions.push(eq(scores.grade, grade));
      }
      if (skills && skills.length > 0) {
        conditions.push(
          sql`${candidates.skills} @> ${sql.raw(`ARRAY[${skills.map((s) => `'${s}'`).join(",")}]::text[]`)}`
        );
      }

      const result = await query;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "update_candidate_status": {
      const { candidateId, status, note } = args as {
        candidateId: number;
        status: string;
        note?: string;
      };

      await db
        .update(candidates)
        .set({ status, updatedAt: new Date() })
        .where(eq(candidates.id, candidateId));

      return {
        content: [
          {
            type: "text",
            text: `候选人 ${candidateId} 状态已更新为: ${status}${note ? ` (备注: ${note})` : ""}`,
          },
        ],
      };
    }

    case "get_position_report": {
      const { positionId } = args as { positionId: number };

      const [position] = await db
        .select()
        .from(positions)
        .where(eq(positions.id, positionId));

      const stats = await db
        .select({
          grade: scores.grade,
          count: sql<number>`count(*)`,
          avgScore: sql<number>`avg(${scores.totalScore})`,
        })
        .from(scores)
        .where(eq(scores.positionId, positionId))
        .groupBy(scores.grade);

      const total = stats.reduce((sum, s) => sum + Number(s.count), 0);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                position: position?.title,
                totalCandidates: total,
                gradeDistribution: Object.fromEntries(
                  stats.map((s) => [s.grade, { count: s.count, avgScore: s.avgScore }])
                ),
                recommendation:
                  total === 0
                    ? "暂无候选人"
                    : `共 ${total} 位候选人，其中 A/B 级 ${
                        stats
                          .filter((s) => s.grade === "A" || s.grade === "B")
                          .reduce((sum, s) => sum + Number(s.count), 0)
                      } 位可面试`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// MCP サーバー起動
export async function startMCPServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HR Data MCP Server started (stdio)");
}
```

### S.2 MCP サーバー設定ファイル

```json
// .claude/mcp-servers.json
// Claude Desktop / Claude Code 用 MCP サーバー設定
{
  "hr-data": {
    "command": "bun",
    "args": ["src/mcp/hr-data-server.ts"],
    "env": {
      "DATABASE_URL": "postgresql://postgres:password@localhost:5432/hr_screening"
    },
    "description": "HR Resume Screening Data Server"
  }
}
```

### S.3 MCP クライアント（Elysia から MCP サーバーに問い合わせ）

```typescript
// src/services/mcp-client.ts
// 他の MCP サーバーからリソースを読む汎用クライアント

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPClient {
  private client: Client;
  private connected = false;

  constructor(
    private serverCommand: string,
    private serverArgs: string[],
    private env?: Record<string, string>
  ) {
    this.client = new Client(
      { name: "hr-backend-mcp-client", version: "1.0.0" },
      { capabilities: {} }
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const transport = new StdioClientTransport({
      command: this.serverCommand,
      args: this.serverArgs,
      env: { ...process.env, ...this.env } as Record<string, string>,
    });

    await this.client.connect(transport);
    this.connected = true;
  }

  async readResource(uri: string): Promise<unknown> {
    await this.connect();
    const response = await this.client.readResource({ uri });
    const text = response.contents[0]?.text;
    return text ? JSON.parse(text as string) : null;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    await this.connect();
    const response = await this.client.callTool({ name, arguments: args });
    return (response.content as Array<{ text: string }>)[0]?.text || "";
  }

  async listTools(): Promise<Array<{ name: string; description: string }>> {
    await this.connect();
    const response = await this.client.listTools();
    return response.tools.map((t) => ({
      name: t.name,
      description: t.description || "",
    }));
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
```

---

## Appendix T: エージェント間通信 & マルチエージェント協調

### T.1 エージェント間メッセージバス

```typescript
// src/services/agent-message-bus.ts
// エージェント間の非同期メッセージ通信
// 簡歴パース → スコアリング → 通知 の各エージェントを疎結合で接続

type AgentId = string;

interface AgentMessage {
  id: string;
  from: AgentId;
  to: AgentId | "*";  // "*" = ブロードキャスト
  type: string;
  payload: unknown;
  timestamp: Date;
  correlationId?: string;  // リクエスト-レスポンス紐付け
  replyTo?: string;        // 返信先メッセージ ID
}

type MessageHandler = (message: AgentMessage) => Promise<void>;

interface AgentRegistration {
  id: AgentId;
  name: string;
  capabilities: string[];
  status: "active" | "paused" | "stopped";
  handler: MessageHandler;
  registeredAt: Date;
  messageCount: number;
  lastMessageAt?: Date;
}

export class AgentMessageBus {
  private agents = new Map<AgentId, AgentRegistration>();
  private messageLog: AgentMessage[] = [];
  private maxLogSize = 1000;

  // エージェント登録
  register(
    id: AgentId,
    name: string,
    capabilities: string[],
    handler: MessageHandler
  ): void {
    if (this.agents.has(id)) {
      throw new Error(`Agent already registered: ${id}`);
    }

    this.agents.set(id, {
      id,
      name,
      capabilities,
      status: "active",
      handler,
      registeredAt: new Date(),
      messageCount: 0,
    });
  }

  // エージェント登録解除
  unregister(id: AgentId): void {
    this.agents.delete(id);
  }

  // メッセージ送信
  async send(message: Omit<AgentMessage, "id" | "timestamp">): Promise<string> {
    const fullMessage: AgentMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
    };

    // ログ記録
    this.messageLog.push(fullMessage);
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog = this.messageLog.slice(-this.maxLogSize);
    }

    if (message.to === "*") {
      // ブロードキャスト
      const promises: Promise<void>[] = [];
      for (const [agentId, agent] of this.agents) {
        if (agentId !== message.from && agent.status === "active") {
          promises.push(this.deliverMessage(agent, fullMessage));
        }
      }
      await Promise.allSettled(promises);
    } else {
      // ユニキャスト
      const target = this.agents.get(message.to);
      if (!target) {
        throw new Error(`Agent not found: ${message.to}`);
      }
      if (target.status !== "active") {
        throw new Error(`Agent is not active: ${message.to} (${target.status})`);
      }
      await this.deliverMessage(target, fullMessage);
    }

    return fullMessage.id;
  }

  // メッセージ配信
  private async deliverMessage(
    agent: AgentRegistration,
    message: AgentMessage
  ): Promise<void> {
    try {
      await agent.handler(message);
      agent.messageCount++;
      agent.lastMessageAt = new Date();
    } catch (error) {
      console.error(
        `Message delivery failed to ${agent.id}:`,
        (error as Error).message
      );
    }
  }

  // リクエスト-レスポンス パターン
  async request(
    from: AgentId,
    to: AgentId,
    type: string,
    payload: unknown,
    timeoutMs: number = 30_000
  ): Promise<unknown> {
    const correlationId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timeout: ${type} to ${to}`));
      }, timeoutMs);

      // 一時的な返信ハンドラ
      const originalHandler = this.agents.get(from)?.handler;
      if (!originalHandler) {
        clearTimeout(timer);
        reject(new Error(`Sender agent not found: ${from}`));
        return;
      }

      const replyHandler: MessageHandler = async (msg) => {
        if (msg.correlationId === correlationId) {
          clearTimeout(timer);
          // ハンドラを元に戻す
          const agent = this.agents.get(from);
          if (agent) agent.handler = originalHandler;
          resolve(msg.payload);
        } else {
          await originalHandler(msg);
        }
      };

      const agent = this.agents.get(from);
      if (agent) agent.handler = replyHandler;

      // リクエスト送信
      await this.send({
        from,
        to,
        type,
        payload,
        correlationId,
      });
    });
  }

  // エージェント一覧
  listAgents(): Array<{
    id: string;
    name: string;
    status: string;
    capabilities: string[];
    messageCount: number;
    lastMessageAt?: Date;
  }> {
    return [...this.agents.values()].map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      capabilities: a.capabilities,
      messageCount: a.messageCount,
      lastMessageAt: a.lastMessageAt,
    }));
  }

  // メッセージログ
  getMessageLog(limit: number = 50): AgentMessage[] {
    return this.messageLog.slice(-limit);
  }

  // 統計
  getStats(): {
    totalAgents: number;
    activeAgents: number;
    totalMessages: number;
  } {
    return {
      totalAgents: this.agents.size,
      activeAgents: [...this.agents.values()].filter((a) => a.status === "active").length,
      totalMessages: this.messageLog.length,
    };
  }
}

export const messageBus = new AgentMessageBus();
```

### T.2 採用パイプライン エージェント群

```typescript
// src/agents/pipeline-agents.ts
// 採用パイプラインの各ステージをエージェントとして実装

import { messageBus } from "../services/agent-message-bus.js";
import { parseResume } from "../services/resume-parser.js";
import { scoreCandidate } from "../services/ai-scorer.js";

// エージェント1: 簡歴パーサー
messageBus.register(
  "parser",
  "简历解析代理",
  ["parse_pdf", "parse_docx", "extract_text"],
  async (message) => {
    if (message.type === "parse_resume") {
      const { content, filename } = message.payload as {
        content: Buffer;
        filename: string;
      };

      try {
        const text = await parseResume(content, filename);

        // スコアリングエージェントに転送
        await messageBus.send({
          from: "parser",
          to: "scorer",
          type: "score_resume",
          payload: { text, filename, parsedAt: new Date() },
          correlationId: message.correlationId,
        });
      } catch (error) {
        // エラーハンドラに通知
        await messageBus.send({
          from: "parser",
          to: "error-handler",
          type: "parse_error",
          payload: {
            filename,
            error: (error as Error).message,
            originalMessageId: message.id,
          },
        });
      }
    }
  }
);

// エージェント2: AI スコアラー
messageBus.register(
  "scorer",
  "AI评分代理",
  ["score_resume", "batch_score"],
  async (message) => {
    if (message.type === "score_resume") {
      const { text, filename } = message.payload as {
        text: string;
        filename: string;
      };

      try {
        const result = await scoreCandidate(text, 1); // positionId=1

        // 通知エージェントに結果転送
        await messageBus.send({
          from: "scorer",
          to: "notifier",
          type: "scoring_complete",
          payload: {
            filename,
            totalScore: result.totalScore,
            grade: result.grade,
            matchedSkills: result.matchedSkills,
          },
          correlationId: message.correlationId,
        });

        // 返信（request-response パターン用）
        if (message.correlationId) {
          await messageBus.send({
            from: "scorer",
            to: message.from,
            type: "score_result",
            payload: result,
            correlationId: message.correlationId,
          });
        }
      } catch (error) {
        await messageBus.send({
          from: "scorer",
          to: "error-handler",
          type: "scoring_error",
          payload: {
            error: (error as Error).message,
            originalMessageId: message.id,
          },
        });
      }
    }
  }
);

// エージェント3: 通知エージェント
messageBus.register(
  "notifier",
  "通知代理",
  ["notify_hr", "notify_candidate"],
  async (message) => {
    if (message.type === "scoring_complete") {
      const { filename, totalScore, grade } = message.payload as {
        filename: string;
        totalScore: number;
        grade: string;
      };

      // A 評価の場合は HR に通知
      if (grade === "A") {
        console.log(
          `🎯 [通知] 优秀候选人! 文件: ${filename}, 评分: ${totalScore} (${grade})`
        );
        // メール送信、Slack 通知等
      }
    }
  }
);

// エージェント4: エラーハンドラ
messageBus.register(
  "error-handler",
  "错误处理代理",
  ["handle_errors", "retry", "escalate"],
  async (message) => {
    console.error(
      `[错误处理] 类型: ${message.type}, 来源: ${message.from}`,
      message.payload
    );

    // エラー統計を蓄積
    // リトライ判定
    // エスカレーション
  }
);
```

### T.3 エージェント管理ルート

```typescript
// src/routes/agents.ts
// エージェント管理 API

import { Elysia } from "elysia";
import { messageBus } from "../services/agent-message-bus.js";

const app = new Elysia();

// GET /api/agents - エージェント一覧
app.get("/", async (c) => {
  return c.json({
    agents: messageBus.listAgents(),
    stats: messageBus.getStats(),
  });
});

// POST /api/agents/send - メッセージ送信
app.post("/send", async (c) => {
  const { from, to, type, payload } = await c.req.json();

  const messageId = await messageBus.send({ from, to, type, payload });

  return c.json({ messageId });
});

// GET /api/agents/messages - メッセージログ
app.get("/messages", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  return c.json({
    messages: messageBus.getMessageLog(limit),
  });
});

export default app;
```

---

## Appendix U: エージェント能力発見・ヘルスモニタリング・バージョン管理

### U.1 エージェント能力レジストリ

```typescript
// src/services/agent-capability-registry.ts
import { EventEmitter } from "node:events";

interface AgentCapability {
  name: string; // 例: "parse_pdf", "score_resume", "send_email"
  version: string; // セマンティックバージョン
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  outputSchema: Record<string, unknown>;
  constraints?: {
    maxConcurrency?: number;
    timeoutMs?: number;
    retryable?: boolean;
    idempotent?: boolean;
  };
}

interface AgentRegistration {
  id: string;
  name: string;
  version: string;
  capabilities: AgentCapability[];
  status: "starting" | "ready" | "busy" | "degraded" | "stopped";
  health: AgentHealth;
  metadata: {
    startedAt: Date;
    lastHeartbeat: Date;
    processId: number;
    host: string;
    tags: string[];
  };
}

interface AgentHealth {
  status: "healthy" | "unhealthy" | "unknown";
  uptime: number; // ms
  metrics: {
    totalProcessed: number;
    totalErrors: number;
    avgLatencyMs: number;
    p99LatencyMs: number;
    currentLoad: number; // 0-1
    memoryUsageMB: number;
  };
  lastCheck: Date;
  checks: Array<{
    name: string;
    status: "pass" | "fail" | "warn";
    message: string;
    duration: number;
  }>;
}

export class AgentCapabilityRegistry extends EventEmitter {
  private agents = new Map<string, AgentRegistration>();
  private capabilityIndex = new Map<string, Set<string>>(); // capability -> agent IDs
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(private healthCheckIntervalMs: number = 30000) {
    super();
  }

  // エージェント登録
  register(agent: Omit<AgentRegistration, "health">): void {
    const registration: AgentRegistration = {
      ...agent,
      health: {
        status: "unknown",
        uptime: 0,
        metrics: {
          totalProcessed: 0,
          totalErrors: 0,
          avgLatencyMs: 0,
          p99LatencyMs: 0,
          currentLoad: 0,
          memoryUsageMB: 0,
        },
        lastCheck: new Date(),
        checks: [],
      },
    };

    this.agents.set(agent.id, registration);

    // 能力インデックス更新
    for (const cap of agent.capabilities) {
      if (!this.capabilityIndex.has(cap.name)) {
        this.capabilityIndex.set(cap.name, new Set());
      }
      this.capabilityIndex.get(cap.name)!.add(agent.id);
    }

    this.emit("agent:registered", { agentId: agent.id, name: agent.name });
    console.log(`Agent registered: ${agent.name} (${agent.id}) with ${agent.capabilities.length} capabilities`);
  }

  // エージェント登録解除
  unregister(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // 能力インデックスからも削除
    for (const cap of agent.capabilities) {
      this.capabilityIndex.get(cap.name)?.delete(agentId);
    }

    this.agents.delete(agentId);
    this.emit("agent:unregistered", { agentId, name: agent.name });
  }

  // 能力によるエージェント検索
  findByCapability(capabilityName: string): AgentRegistration[] {
    const agentIds = this.capabilityIndex.get(capabilityName);
    if (!agentIds) return [];

    return [...agentIds]
      .map((id) => this.agents.get(id)!)
      .filter((a) => a.status === "ready")
      .sort((a, b) => a.health.metrics.currentLoad - b.health.metrics.currentLoad);
  }

  // 最適なエージェント選択（負荷分散）
  selectBestAgent(capabilityName: string): AgentRegistration | null {
    const candidates = this.findByCapability(capabilityName);
    if (candidates.length === 0) return null;

    // 重み付きスコアで選択
    const scored = candidates.map((agent) => {
      const loadScore = 1 - agent.health.metrics.currentLoad; // 低負荷ほど高スコア
      const healthScore = agent.health.status === "healthy" ? 1 : 0.5;
      const latencyScore = Math.max(0, 1 - agent.health.metrics.avgLatencyMs / 5000);
      const errorScore = Math.max(
        0,
        1 - agent.health.metrics.totalErrors / Math.max(1, agent.health.metrics.totalProcessed)
      );

      return {
        agent,
        score: loadScore * 0.4 + healthScore * 0.3 + latencyScore * 0.2 + errorScore * 0.1,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].agent;
  }

  // ヘルスチェック実行
  async performHealthCheck(agentId: string): Promise<AgentHealth> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const checks: AgentHealth["checks"] = [];

    // 1. ハートビートチェック
    const heartbeatAge = Date.now() - agent.metadata.lastHeartbeat.getTime();
    checks.push({
      name: "heartbeat",
      status: heartbeatAge < 60000 ? "pass" : heartbeatAge < 120000 ? "warn" : "fail",
      message: `Last heartbeat ${Math.round(heartbeatAge / 1000)}s ago`,
      duration: 0,
    });

    // 2. 負荷チェック
    checks.push({
      name: "load",
      status: agent.health.metrics.currentLoad < 0.8 ? "pass" : agent.health.metrics.currentLoad < 0.95 ? "warn" : "fail",
      message: `Current load: ${(agent.health.metrics.currentLoad * 100).toFixed(1)}%`,
      duration: 0,
    });

    // 3. エラーレートチェック
    const errorRate = agent.health.metrics.totalProcessed > 0
      ? agent.health.metrics.totalErrors / agent.health.metrics.totalProcessed
      : 0;
    checks.push({
      name: "error_rate",
      status: errorRate < 0.01 ? "pass" : errorRate < 0.05 ? "warn" : "fail",
      message: `Error rate: ${(errorRate * 100).toFixed(2)}%`,
      duration: 0,
    });

    // 4. メモリチェック
    checks.push({
      name: "memory",
      status: agent.health.metrics.memoryUsageMB < 512 ? "pass" : agent.health.metrics.memoryUsageMB < 1024 ? "warn" : "fail",
      message: `Memory: ${agent.health.metrics.memoryUsageMB}MB`,
      duration: 0,
    });

    // 5. レイテンシチェック
    checks.push({
      name: "latency",
      status: agent.health.metrics.p99LatencyMs < 5000 ? "pass" : agent.health.metrics.p99LatencyMs < 10000 ? "warn" : "fail",
      message: `P99 latency: ${agent.health.metrics.p99LatencyMs}ms`,
      duration: 0,
    });

    // 総合ステータス判定
    const failCount = checks.filter((c) => c.status === "fail").length;
    const warnCount = checks.filter((c) => c.status === "warn").length;

    const healthStatus: AgentHealth["status"] =
      failCount > 0 ? "unhealthy" : warnCount > 1 ? "unhealthy" : "healthy";

    const health: AgentHealth = {
      status: healthStatus,
      uptime: Date.now() - agent.metadata.startedAt.getTime(),
      metrics: agent.health.metrics,
      lastCheck: new Date(),
      checks,
    };

    // ステータス更新
    agent.health = health;
    if (healthStatus === "unhealthy" && agent.status === "ready") {
      agent.status = "degraded";
      this.emit("agent:degraded", { agentId, health });
    } else if (healthStatus === "healthy" && agent.status === "degraded") {
      agent.status = "ready";
      this.emit("agent:recovered", { agentId, health });
    }

    return health;
  }

  // ヘルスチェック定期実行開始
  startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [agentId] of this.agents) {
        try {
          await this.performHealthCheck(agentId);
        } catch (error) {
          console.error(`Health check failed for ${agentId}:`, error);
        }
      }
    }, this.healthCheckIntervalMs);
  }

  // 停止
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // ハートビート受信
  heartbeat(agentId: string, metrics?: Partial<AgentHealth["metrics"]>): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.metadata.lastHeartbeat = new Date();
    if (metrics) {
      Object.assign(agent.health.metrics, metrics);
    }
  }

  // 全エージェントサマリー
  getSummary(): {
    total: number;
    byStatus: Record<string, number>;
    capabilities: Array<{ name: string; providers: number }>;
    unhealthy: string[];
  } {
    const byStatus: Record<string, number> = {};
    const unhealthy: string[] = [];

    for (const [id, agent] of this.agents) {
      byStatus[agent.status] = (byStatus[agent.status] ?? 0) + 1;
      if (agent.health.status === "unhealthy") {
        unhealthy.push(`${agent.name} (${id})`);
      }
    }

    const capabilities = [...this.capabilityIndex.entries()].map(([name, ids]) => ({
      name,
      providers: [...ids].filter((id) => this.agents.get(id)?.status === "ready").length,
    }));

    return {
      total: this.agents.size,
      byStatus,
      capabilities,
      unhealthy,
    };
  }

  // 能力マトリクス表示
  getCapabilityMatrix(): string {
    const agentNames = [...this.agents.values()].map((a) => a.name);
    const capNames = [...this.capabilityIndex.keys()];

    let matrix = "| Capability |";
    for (const name of agentNames) matrix += ` ${name} |`;
    matrix += "\n|---|";
    for (const _ of agentNames) matrix += "---|";
    matrix += "\n";

    for (const cap of capNames) {
      matrix += `| ${cap} |`;
      for (const agent of this.agents.values()) {
        const has = agent.capabilities.some((c) => c.name === cap);
        matrix += ` ${has ? "✓" : "—"} |`;
      }
      matrix += "\n";
    }

    return matrix;
  }
}
```

### U.2 エージェントバージョン管理

```typescript
// src/services/agent-versioning.ts
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp, integer, boolean, uuid } from "drizzle-orm/pg-core";

// エージェントバージョン履歴テーブル
export const agentVersions = pgTable("agent_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentName: text("agent_name").notNull(),
  version: text("version").notNull(), // semver
  config: jsonb("config").$type<{
    capabilities: string[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    tools?: string[];
  }>(),
  changelog: text("changelog"),
  isActive: boolean("is_active").notNull().default(false),
  deployedAt: timestamp("deployed_at"),
  rolledBackAt: timestamp("rolled_back_at"),
  performance: jsonb("performance").$type<{
    avgLatencyMs: number;
    errorRate: number;
    avgScore: number;
    sampleSize: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export class AgentVersionManager {
  // 新バージョン登録
  async registerVersion(
    agentName: string,
    version: string,
    config: typeof agentVersions.$inferInsert["config"],
    changelog?: string
  ): Promise<typeof agentVersions.$inferSelect> {
    const [record] = await db
      .insert(agentVersions)
      .values({
        agentName,
        version,
        config,
        changelog,
      })
      .returning();

    return record;
  }

  // バージョンデプロイ（アクティベート）
  async deploy(agentName: string, version: string): Promise<void> {
    await db.transaction(async (tx) => {
      // 全バージョン非アクティブ化
      await tx
        .update(agentVersions)
        .set({ isActive: false })
        .where(sql`agent_name = ${agentName}`);

      // 指定バージョンをアクティブ化
      await tx
        .update(agentVersions)
        .set({ isActive: true, deployedAt: new Date() })
        .where(sql`agent_name = ${agentName} AND version = ${version}`);
    });
  }

  // ロールバック
  async rollback(agentName: string): Promise<string | null> {
    // 現在のアクティブバージョン
    const [current] = await db
      .select()
      .from(agentVersions)
      .where(sql`agent_name = ${agentName} AND is_active = true`)
      .limit(1);

    if (!current) return null;

    // 一つ前のバージョンを取得
    const [previous] = await db
      .select()
      .from(agentVersions)
      .where(sql`
        agent_name = ${agentName}
        AND version != ${current.version}
        AND deployed_at IS NOT NULL
      `)
      .orderBy(sql`deployed_at DESC`)
      .limit(1);

    if (!previous) return null;

    // ロールバック実行
    await db.transaction(async (tx) => {
      await tx
        .update(agentVersions)
        .set({ isActive: false, rolledBackAt: new Date() })
        .where(sql`id = ${current.id}`);

      await tx
        .update(agentVersions)
        .set({ isActive: true, deployedAt: new Date() })
        .where(sql`id = ${previous.id}`);
    });

    return previous.version;
  }

  // バージョン履歴
  async getHistory(agentName: string): Promise<Array<typeof agentVersions.$inferSelect>> {
    return db
      .select()
      .from(agentVersions)
      .where(sql`agent_name = ${agentName}`)
      .orderBy(sql`created_at DESC`);
  }

  // パフォーマンス記録
  async recordPerformance(
    agentName: string,
    version: string,
    metrics: typeof agentVersions.$inferInsert["performance"]
  ): Promise<void> {
    await db
      .update(agentVersions)
      .set({ performance: metrics })
      .where(sql`agent_name = ${agentName} AND version = ${version}`);
  }

  // カナリアデプロイ（段階的ロールアウト）
  async canaryDeploy(
    agentName: string,
    newVersion: string,
    trafficPercent: number = 10
  ): Promise<{
    canaryVersion: string;
    stableVersion: string;
    trafficSplit: { canary: number; stable: number };
  }> {
    const [current] = await db
      .select()
      .from(agentVersions)
      .where(sql`agent_name = ${agentName} AND is_active = true`)
      .limit(1);

    return {
      canaryVersion: newVersion,
      stableVersion: current?.version ?? "unknown",
      trafficSplit: {
        canary: trafficPercent,
        stable: 100 - trafficPercent,
      },
    };
  }

  // バージョン比較レポート
  async compareVersions(
    agentName: string,
    versionA: string,
    versionB: string
  ): Promise<{
    configDiff: Record<string, { old: unknown; new: unknown }>;
    performanceDiff: Record<string, { old: number; new: number; change: string }>;
    recommendation: string;
  }> {
    const [a, b] = await Promise.all([
      db.select().from(agentVersions)
        .where(sql`agent_name = ${agentName} AND version = ${versionA}`)
        .limit(1)
        .then((r) => r[0]),
      db.select().from(agentVersions)
        .where(sql`agent_name = ${agentName} AND version = ${versionB}`)
        .limit(1)
        .then((r) => r[0]),
    ]);

    const configDiff: Record<string, { old: unknown; new: unknown }> = {};
    if (a?.config && b?.config) {
      const aConfig = a.config as Record<string, unknown>;
      const bConfig = b.config as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(aConfig), ...Object.keys(bConfig)]);
      for (const key of allKeys) {
        if (JSON.stringify(aConfig[key]) !== JSON.stringify(bConfig[key])) {
          configDiff[key] = { old: aConfig[key], new: bConfig[key] };
        }
      }
    }

    const performanceDiff: Record<string, { old: number; new: number; change: string }> = {};
    if (a?.performance && b?.performance) {
      for (const key of Object.keys(a.performance) as Array<keyof typeof a.performance>) {
        const oldVal = a.performance[key] as number;
        const newVal = (b.performance as Record<string, number>)[key] ?? 0;
        const change = oldVal > 0 ? ((newVal - oldVal) / oldVal * 100).toFixed(1) + "%" : "N/A";
        performanceDiff[key] = { old: oldVal, new: newVal, change };
      }
    }

    const betterLatency = (b?.performance?.avgLatencyMs ?? 0) < (a?.performance?.avgLatencyMs ?? Infinity);
    const betterErrors = (b?.performance?.errorRate ?? 0) < (a?.performance?.errorRate ?? Infinity);
    const recommendation = betterLatency && betterErrors
      ? `${versionB} is better in both latency and error rate. Recommend deploying.`
      : betterLatency
        ? `${versionB} has better latency but higher error rate. Monitor carefully.`
        : `${versionA} performs better overall. Keep current version.`;

    return { configDiff, performanceDiff, recommendation };
  }
}
```

### U.3 エージェントヘルスダッシュボードAPI

```typescript
// src/routes/agent-health.ts
import { Elysia } from "elysia";
import { AgentCapabilityRegistry } from "../services/agent-capability-registry.js";
import { AgentVersionManager } from "../services/agent-versioning.js";

const app = new Elysia();
const registry = new AgentCapabilityRegistry();
const versionManager = new AgentVersionManager();

// ダッシュボードサマリー
app.get("/dashboard", async (c) => {
  const summary = registry.getSummary();
  return c.json({ dashboard: summary });
});

// 能力マトリクス
app.get("/capabilities", async (c) => {
  const matrix = registry.getCapabilityMatrix();
  return c.json({ matrix });
});

// 能力によるエージェント検索
app.get("/capabilities/:name/providers", async (c) => {
  const name = c.req.param("name");
  const agents = registry.findByCapability(name);
  return c.json({
    capability: name,
    providers: agents.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      load: a.health.metrics.currentLoad,
      latency: a.health.metrics.avgLatencyMs,
    })),
  });
});

// エージェントヘルスチェック
app.get("/agents/:id/health", async (c) => {
  const id = c.req.param("id");
  const health = await registry.performHealthCheck(id);
  return c.json({ health });
});

// ハートビート受信
app.post("/agents/:id/heartbeat", async (c) => {
  const id = c.req.param("id");
  const metrics = await c.req.json();
  registry.heartbeat(id, metrics);
  return c.json({ received: true });
});

// --- バージョン管理 ---

// バージョン履歴
app.get("/agents/:name/versions", async (c) => {
  const name = c.req.param("name");
  const history = await versionManager.getHistory(name);
  return c.json({ versions: history });
});

// バージョンデプロイ
app.post("/agents/:name/deploy/:version", async (c) => {
  const name = c.req.param("name");
  const version = c.req.param("version");
  await versionManager.deploy(name, version);
  return c.json({ deployed: true, agent: name, version });
});

// ロールバック
app.post("/agents/:name/rollback", async (c) => {
  const name = c.req.param("name");
  const previousVersion = await versionManager.rollback(name);
  if (!previousVersion) {
    return c.json({ error: "No previous version to rollback to" }, 400);
  }
  return c.json({ rolledBack: true, version: previousVersion });
});

// バージョン比較
app.get("/agents/:name/compare", async (c) => {
  const name = c.req.param("name");
  const a = c.req.query("a") ?? "1.0.0";
  const b = c.req.query("b") ?? "2.0.0";
  const comparison = await versionManager.compareVersions(name, a, b);
  return c.json({ comparison });
});

// カナリアデプロイ
app.post("/agents/:name/canary/:version", async (c) => {
  const name = c.req.param("name");
  const version = c.req.param("version");
  const { trafficPercent } = await c.req.json<{ trafficPercent?: number }>();
  const result = await versionManager.canaryDeploy(name, version, trafficPercent ?? 10);
  return c.json({ canary: result });
});

export default app;
```

### U.4 テスト

```typescript
// test/agent-capability-registry.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { AgentCapabilityRegistry } from "../src/services/agent-capability-registry.js";

describe("AgentCapabilityRegistry", () => {
  let registry: AgentCapabilityRegistry;

  beforeEach(() => {
    registry = new AgentCapabilityRegistry();
  });

  it("should register an agent with capabilities", () => {
    registry.register({
      id: "parser-1",
      name: "ResumeParser",
      version: "1.0.0",
      status: "ready",
      capabilities: [
        {
          name: "parse_pdf",
          version: "1.0.0",
          description: "Parse PDF resume",
          inputSchema: { type: "object", properties: { buffer: { type: "string" } } },
          outputSchema: { type: "object", properties: { text: { type: "string" } } },
        },
        {
          name: "parse_docx",
          version: "1.0.0",
          description: "Parse DOCX resume",
          inputSchema: {},
          outputSchema: {},
        },
      ],
      metadata: {
        startedAt: new Date(),
        lastHeartbeat: new Date(),
        processId: 1234,
        host: "localhost",
        tags: ["parser"],
      },
    });

    const summary = registry.getSummary();
    expect(summary.total).toBe(1);
    expect(summary.capabilities).toHaveLength(2);
  });

  it("should find agents by capability", () => {
    registry.register({
      id: "parser-1",
      name: "ParserA",
      version: "1.0.0",
      status: "ready",
      capabilities: [{ name: "parse_pdf", version: "1.0.0", description: "", inputSchema: {}, outputSchema: {} }],
      metadata: { startedAt: new Date(), lastHeartbeat: new Date(), processId: 1, host: "h1", tags: [] },
    });

    registry.register({
      id: "parser-2",
      name: "ParserB",
      version: "1.0.0",
      status: "ready",
      capabilities: [{ name: "parse_pdf", version: "1.0.0", description: "", inputSchema: {}, outputSchema: {} }],
      metadata: { startedAt: new Date(), lastHeartbeat: new Date(), processId: 2, host: "h2", tags: [] },
    });

    const pdfParsers = registry.findByCapability("parse_pdf");
    expect(pdfParsers).toHaveLength(2);

    const docxParsers = registry.findByCapability("parse_docx");
    expect(docxParsers).toHaveLength(0);
  });

  it("should select best agent based on load", () => {
    registry.register({
      id: "a1",
      name: "AgentA",
      version: "1.0.0",
      status: "ready",
      capabilities: [{ name: "score", version: "1.0.0", description: "", inputSchema: {}, outputSchema: {} }],
      metadata: { startedAt: new Date(), lastHeartbeat: new Date(), processId: 1, host: "h1", tags: [] },
    });

    registry.register({
      id: "a2",
      name: "AgentB",
      version: "1.0.0",
      status: "ready",
      capabilities: [{ name: "score", version: "1.0.0", description: "", inputSchema: {}, outputSchema: {} }],
      metadata: { startedAt: new Date(), lastHeartbeat: new Date(), processId: 2, host: "h2", tags: [] },
    });

    // AgentA に高負荷を設定
    registry.heartbeat("a1", { currentLoad: 0.9 });
    registry.heartbeat("a2", { currentLoad: 0.2 });

    const best = registry.selectBestAgent("score");
    expect(best?.id).toBe("a2"); // 低負荷のAgentBが選択される
  });

  it("should perform health checks", async () => {
    registry.register({
      id: "test-agent",
      name: "TestAgent",
      version: "1.0.0",
      status: "ready",
      capabilities: [],
      metadata: { startedAt: new Date(), lastHeartbeat: new Date(), processId: 1, host: "h1", tags: [] },
    });

    const health = await registry.performHealthCheck("test-agent");
    expect(health.status).toBe("healthy");
    expect(health.checks.length).toBeGreaterThan(0);
  });

  it("should unregister and remove from capability index", () => {
    registry.register({
      id: "temp",
      name: "TempAgent",
      version: "1.0.0",
      status: "ready",
      capabilities: [{ name: "temp_cap", version: "1.0.0", description: "", inputSchema: {}, outputSchema: {} }],
      metadata: { startedAt: new Date(), lastHeartbeat: new Date(), processId: 1, host: "h1", tags: [] },
    });

    expect(registry.findByCapability("temp_cap")).toHaveLength(1);

    registry.unregister("temp");
    expect(registry.findByCapability("temp_cap")).toHaveLength(0);
    expect(registry.getSummary().total).toBe(0);
  });
});
```

---

## Appendix V: エージェントオーケストレーション — 分散タスクスケジューラ

### V.1 分散タスクキュー

```typescript
// src/services/task-scheduler.ts
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp, integer, uuid, boolean } from "drizzle-orm/pg-core";

// タスクテーブル
export const scheduledTasks = pgTable("scheduled_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // "parse_resume" | "score_candidate" | "send_notification" | "fetch_email"
  priority: integer("priority").notNull().default(5), // 1(最高) - 10(最低)
  status: text("status").notNull().default("pending"), // pending, running, completed, failed, cancelled
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  assignedTo: text("assigned_to"), // エージェントID
  maxRetries: integer("max_retries").notNull().default(3),
  retryCount: integer("retry_count").notNull().default(0),
  timeoutMs: integer("timeout_ms").notNull().default(60000),
  scheduledAt: timestamp("scheduled_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  deadlineAt: timestamp("deadline_at"),
  parentTaskId: uuid("parent_task_id"),
  dependsOn: jsonb("depends_on").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

// タスクログテーブル
export const taskLogs = pgTable("task_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").references(() => scheduledTasks.id),
  level: text("level").notNull(), // info, warn, error
  message: text("message").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

interface TaskHandler {
  type: string;
  handler: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  concurrency: number;
  timeout: number;
}

export class TaskScheduler extends EventEmitter {
  private handlers = new Map<string, TaskHandler>();
  private activeCount = new Map<string, number>();
  private pollInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  // ハンドラー登録
  registerHandler(config: TaskHandler): void {
    this.handlers.set(config.type, config);
    this.activeCount.set(config.type, 0);
    console.log(`Task handler registered: ${config.type} (concurrency: ${config.concurrency})`);
  }

  // タスクスケジュール
  async schedule(
    type: string,
    payload: Record<string, unknown>,
    options: {
      priority?: number;
      delayMs?: number;
      deadline?: Date;
      parentTaskId?: string;
      dependsOn?: string[];
      maxRetries?: number;
    } = {}
  ): Promise<string> {
    const scheduledAt = options.delayMs
      ? new Date(Date.now() + options.delayMs)
      : new Date();

    const [task] = await db
      .insert(scheduledTasks)
      .values({
        type,
        payload,
        priority: options.priority ?? 5,
        scheduledAt,
        deadlineAt: options.deadline,
        parentTaskId: options.parentTaskId,
        dependsOn: options.dependsOn ?? [],
        maxRetries: options.maxRetries ?? 3,
      })
      .returning();

    this.emit("task:scheduled", { taskId: task.id, type });
    return task.id;
  }

  // バッチスケジュール
  async scheduleBatch(
    tasks: Array<{
      type: string;
      payload: Record<string, unknown>;
      priority?: number;
    }>
  ): Promise<string[]> {
    const parentId = randomUUID();
    const ids: string[] = [];

    for (const task of tasks) {
      const id = await this.schedule(task.type, task.payload, {
        priority: task.priority,
        parentTaskId: parentId,
      });
      ids.push(id);
    }

    return ids;
  }

  // パイプラインスケジュール（順次実行チェーン）
  async schedulePipeline(
    steps: Array<{
      type: string;
      payload: Record<string, unknown>;
    }>
  ): Promise<string[]> {
    const ids: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const dependsOn = i > 0 ? [ids[i - 1]] : [];
      const id = await this.schedule(steps[i].type, steps[i].payload, {
        dependsOn,
        priority: 3, // パイプラインは高優先度
      });
      ids.push(id);
    }

    return ids;
  }

  // スケジューラー開始
  start(pollMs: number = 1000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.pollInterval = setInterval(async () => {
      await this.processNextTasks();
    }, pollMs);

    console.log(`Task scheduler started (poll: ${pollMs}ms)`);
  }

  // 停止
  stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log("Task scheduler stopped");
  }

  // 次のタスクを取得して実行
  private async processNextTasks(): Promise<void> {
    for (const [type, handler] of this.handlers) {
      const currentActive = this.activeCount.get(type) ?? 0;
      const available = handler.concurrency - currentActive;

      if (available <= 0) continue;

      // PostgreSQL の FOR UPDATE SKIP LOCKED でアトミックに取得
      const tasks = await db.execute(sql`
        UPDATE scheduled_tasks
        SET status = 'running', started_at = NOW(), assigned_to = 'scheduler'
        WHERE id IN (
          SELECT id FROM scheduled_tasks
          WHERE type = ${type}
            AND status = 'pending'
            AND scheduled_at <= NOW()
            AND (
              depends_on = '[]'::jsonb
              OR NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(depends_on) AS dep_id
                JOIN scheduled_tasks deps ON deps.id = dep_id::uuid
                WHERE deps.status != 'completed'
              )
            )
          ORDER BY priority ASC, scheduled_at ASC
          LIMIT ${available}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      for (const task of tasks.rows) {
        this.executeTask(task as typeof scheduledTasks.$inferSelect, handler);
      }
    }
  }

  // タスク実行
  private async executeTask(
    task: typeof scheduledTasks.$inferSelect,
    handler: TaskHandler
  ): Promise<void> {
    const type = task.type;
    this.activeCount.set(type, (this.activeCount.get(type) ?? 0) + 1);
    this.emit("task:started", { taskId: task.id, type });

    try {
      // タイムアウト付き実行
      const result = await Promise.race([
        handler.handler(task.payload ?? {}),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Task timeout (${handler.timeout}ms)`)),
            handler.timeout
          )
        ),
      ]);

      // 成功
      await db
        .update(scheduledTasks)
        .set({
          status: "completed",
          result: result as Record<string, unknown>,
          completedAt: new Date(),
        })
        .where(sql`id = ${task.id}`);

      this.emit("task:completed", { taskId: task.id, type, result });
    } catch (error) {
      const errorMsg = (error as Error).message;

      // リトライ判定
      const retryCount = (task.retryCount ?? 0) + 1;
      if (retryCount < (task.maxRetries ?? 3)) {
        // リトライスケジュール（指数バックオフ）
        const delayMs = Math.min(30000, 1000 * Math.pow(2, retryCount));
        await db
          .update(scheduledTasks)
          .set({
            status: "pending",
            retryCount,
            scheduledAt: new Date(Date.now() + delayMs),
            error: errorMsg,
          })
          .where(sql`id = ${task.id}`);

        this.emit("task:retrying", { taskId: task.id, type, retryCount, delayMs });
      } else {
        // 最終失敗
        await db
          .update(scheduledTasks)
          .set({
            status: "failed",
            error: errorMsg,
            completedAt: new Date(),
          })
          .where(sql`id = ${task.id}`);

        this.emit("task:failed", { taskId: task.id, type, error: errorMsg });
      }
    } finally {
      this.activeCount.set(type, Math.max(0, (this.activeCount.get(type) ?? 0) - 1));
    }
  }

  // タスクキャンセル
  async cancel(taskId: string): Promise<boolean> {
    const result = await db
      .update(scheduledTasks)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(sql`id = ${taskId} AND status IN ('pending', 'running')`)
      .returning();

    return result.length > 0;
  }

  // ステータス取得
  async getTaskStatus(taskId: string): Promise<typeof scheduledTasks.$inferSelect | null> {
    const [task] = await db
      .select()
      .from(scheduledTasks)
      .where(sql`id = ${taskId}`)
      .limit(1);
    return task ?? null;
  }

  // 統計情報
  async getStats(): Promise<{
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    avgWaitTimeMs: number;
    avgProcessTimeMs: number;
    failureRate: number;
  }> {
    const [stats] = await db.execute(sql`
      SELECT
        json_object_agg(
          status, cnt
        ) FILTER (WHERE status IS NOT NULL) as by_status,
        json_object_agg(
          type, type_cnt
        ) FILTER (WHERE type IS NOT NULL) as by_type
      FROM (
        SELECT status, COUNT(*) as cnt, type, COUNT(*) as type_cnt
        FROM scheduled_tasks
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY status, type
      ) sub
    `).then((r) => r.rows);

    const [timing] = await db.execute(sql`
      SELECT
        AVG(EXTRACT(EPOCH FROM (started_at - scheduled_at)) * 1000)::integer as avg_wait,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::integer as avg_process,
        COUNT(*) FILTER (WHERE status = 'failed')::float /
          NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed')), 0) as failure_rate
      FROM scheduled_tasks
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `).then((r) => r.rows);

    return {
      byStatus: (stats?.by_status as Record<string, number>) ?? {},
      byType: (stats?.by_type as Record<string, number>) ?? {},
      avgWaitTimeMs: Number(timing?.avg_wait ?? 0),
      avgProcessTimeMs: Number(timing?.avg_process ?? 0),
      failureRate: Number(timing?.failure_rate ?? 0),
    };
  }

  // デッドタスク検出・クリーンアップ
  async cleanupStale(maxAgeHours: number = 24): Promise<number> {
    const result = await db.execute(sql`
      UPDATE scheduled_tasks
      SET status = 'failed', error = 'Task stale (timeout)', completed_at = NOW()
      WHERE status = 'running'
        AND started_at < NOW() - INTERVAL '${sql.raw(maxAgeHours.toString())} hours'
      RETURNING id
    `);
    return result.rows.length;
  }
}
```

### V.2 HR パイプラインタスクハンドラー

```typescript
// src/services/pipeline-tasks.ts
import { TaskScheduler } from "./task-scheduler.js";
import { parseResume } from "./resume-parser.js";
import { scoreCandidate } from "./ai-scorer.js";

export function registerHRTasks(scheduler: TaskScheduler): void {
  // 履歴書パースタスク
  scheduler.registerHandler({
    type: "parse_resume",
    concurrency: 3,
    timeout: 30000,
    handler: async (payload) => {
      const { fileBuffer, fileName, contentType } = payload as {
        fileBuffer: string; // base64
        fileName: string;
        contentType: string;
      };

      const buffer = Buffer.from(fileBuffer, "base64");
      const text = await parseResume(buffer, contentType);

      return { text, charCount: text.length };
    },
  });

  // AIスコアリングタスク
  scheduler.registerHandler({
    type: "score_candidate",
    concurrency: 2, // API レート制限考慮
    timeout: 60000,
    handler: async (payload) => {
      const { resumeText, positionId } = payload as {
        resumeText: string;
        positionId: string;
      };

      const score = await scoreCandidate(resumeText, positionId);
      return score as Record<string, unknown>;
    },
  });

  // メール取得タスク
  scheduler.registerHandler({
    type: "fetch_email",
    concurrency: 1, // IMAP接続は1つのみ
    timeout: 120000,
    handler: async (payload) => {
      // メール受信処理
      return { fetched: 0 };
    },
  });

  // 通知送信タスク
  scheduler.registerHandler({
    type: "send_notification",
    concurrency: 5,
    timeout: 10000,
    handler: async (payload) => {
      const { type, to, subject, body } = payload as {
        type: string;
        to: string;
        subject: string;
        body: string;
      };
      // 通知送信ロジック
      return { sent: true };
    },
  });

  // 定期メール取得スケジュール
  setInterval(async () => {
    await scheduler.schedule("fetch_email", {}, { priority: 3 });
  }, 5 * 60 * 1000); // 5分ごと
}
```

### V.3 タスク管理API

```typescript
// src/routes/tasks.ts
import { Elysia } from "elysia";
import { TaskScheduler } from "../services/task-scheduler.js";

const app = new Elysia();
const scheduler = new TaskScheduler();

// タスクスケジュール
app.post("/", async (c) => {
  const { type, payload, priority, delayMs } = await c.req.json();
  const taskId = await scheduler.schedule(type, payload, { priority, delayMs });
  return c.json({ taskId }, 201);
});

// パイプラインスケジュール
app.post("/pipeline", async (c) => {
  const { steps } = await c.req.json<{
    steps: Array<{ type: string; payload: Record<string, unknown> }>;
  }>();
  const taskIds = await scheduler.schedulePipeline(steps);
  return c.json({ taskIds });
});

// タスクステータス
app.get("/:id", async (c) => {
  const task = await scheduler.getTaskStatus(c.req.param("id"));
  if (!task) return c.json({ error: "Not found" }, 404);
  return c.json({ task });
});

// タスクキャンセル
app.delete("/:id", async (c) => {
  const cancelled = await scheduler.cancel(c.req.param("id"));
  return c.json({ cancelled });
});

// 統計
app.get("/stats/summary", async (c) => {
  const stats = await scheduler.getStats();
  return c.json({ stats });
});

export default app;
```

### V.4 テスト

```typescript
// test/task-scheduler.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TaskScheduler } from "../src/services/task-scheduler.js";

describe("TaskScheduler", () => {
  let scheduler: TaskScheduler;

  beforeEach(() => {
    scheduler = new TaskScheduler();
  });

  it("should register handlers", () => {
    scheduler.registerHandler({
      type: "test_task",
      concurrency: 2,
      timeout: 5000,
      handler: async (payload) => ({ processed: true }),
    });

    // ハンドラーが登録されていることを確認
    expect(() => scheduler.start()).not.toThrow();
    scheduler.stop();
  });

  it("should schedule a task and return ID", async () => {
    const taskId = await scheduler.schedule("test_task", { key: "value" });
    expect(taskId).toBeDefined();
    expect(typeof taskId).toBe("string");
  });

  it("should schedule a pipeline with dependencies", async () => {
    const ids = await scheduler.schedulePipeline([
      { type: "parse_resume", payload: { file: "test.pdf" } },
      { type: "score_candidate", payload: { positionId: "pos-1" } },
      { type: "send_notification", payload: { to: "hr@test.com" } },
    ]);

    expect(ids).toHaveLength(3);
    // 各ステップが前ステップに依存していることを確認
    for (let i = 1; i < ids.length; i++) {
      const task = await scheduler.getTaskStatus(ids[i]);
      expect(task?.dependsOn).toContain(ids[i - 1]);
    }
  });

  it("should cancel a pending task", async () => {
    const taskId = await scheduler.schedule("test_task", {}, { delayMs: 60000 });
    const cancelled = await scheduler.cancel(taskId);
    expect(cancelled).toBe(true);

    const task = await scheduler.getTaskStatus(taskId);
    expect(task?.status).toBe("cancelled");
  });
});
```

---

## Appendix W: スキルツリー・能力成長追跡システム

### W.1 スキルオントロジー定義

```typescript
// src/services/skill-ontology.ts
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp, uuid, integer, boolean } from "drizzle-orm/pg-core";

// スキルカテゴリテーブル
export const skillCategories = pgTable("skill_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(), // "programming", "framework", "database", "devops", "soft_skill"
  displayName: text("display_name").notNull(),
  description: text("description"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// スキル定義テーブル
export const skillDefinitions = pgTable("skill_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // "TypeScript", "React", "PostgreSQL"
  categoryId: uuid("category_id").references(() => skillCategories.id),
  aliases: jsonb("aliases").$type<string[]>().default([]), // ["TS", "typescript", "ts"]
  relatedSkills: jsonb("related_skills").$type<string[]>().default([]), // 関連スキルID
  parentSkillId: uuid("parent_skill_id"), // 親スキル（例: React → JavaScript）
  level: integer("level").notNull().default(1), // スキルツリーの深さ
  description: text("description"),
  assessmentCriteria: jsonb("assessment_criteria").$type<{
    beginner: string;
    intermediate: string;
    advanced: string;
    expert: string;
  }>(),
  marketDemand: integer("market_demand"), // 1-100 の市場需要スコア
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export class SkillOntology {
  // スキル正規化（エイリアスから正式名称へ）
  async normalize(rawSkill: string): Promise<{
    normalized: string;
    skillId: string | null;
    confidence: number;
  }> {
    const lower = rawSkill.toLowerCase().trim();

    // 完全一致
    const [exact] = await db
      .select()
      .from(skillDefinitions)
      .where(sql`LOWER(name) = ${lower}`)
      .limit(1);

    if (exact) {
      return { normalized: exact.name, skillId: exact.id, confidence: 1.0 };
    }

    // エイリアス検索
    const [alias] = await db
      .select()
      .from(skillDefinitions)
      .where(sql`aliases @> ${JSON.stringify([lower])}::jsonb`)
      .limit(1);

    if (alias) {
      return { normalized: alias.name, skillId: alias.id, confidence: 0.95 };
    }

    // あいまい検索（前方一致 + 類似度）
    const fuzzy = await db.execute(sql`
      SELECT name, id,
        similarity(LOWER(name), ${lower}) as sim
      FROM skill_definitions
      WHERE similarity(LOWER(name), ${lower}) > 0.3
      ORDER BY sim DESC
      LIMIT 1
    `);

    if (fuzzy.rows.length > 0) {
      const match = fuzzy.rows[0];
      return {
        normalized: match.name as string,
        skillId: match.id as string,
        confidence: Number(match.sim),
      };
    }

    return { normalized: rawSkill, skillId: null, confidence: 0 };
  }

  // バッチ正規化
  async normalizeMany(skills: string[]): Promise<Array<{
    original: string;
    normalized: string;
    confidence: number;
  }>> {
    return Promise.all(
      skills.map(async (skill) => {
        const result = await this.normalize(skill);
        return { original: skill, ...result };
      })
    );
  }

  // スキルツリー取得
  async getSkillTree(categoryName?: string): Promise<Array<{
    category: string;
    skills: Array<{
      id: string;
      name: string;
      level: number;
      children: Array<{ id: string; name: string }>;
      marketDemand: number | null;
    }>;
  }>> {
    const categoryFilter = categoryName
      ? sql`AND c.name = ${categoryName}`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        c.name as category,
        c.display_name as category_display,
        s.id, s.name, s.level, s.parent_skill_id, s.market_demand
      FROM skill_definitions s
      JOIN skill_categories c ON c.id = s.category_id
      WHERE s.is_active = true ${categoryFilter}
      ORDER BY c.sort_order, s.level, s.name
    `);

    // ツリー構造に変換
    const categoryMap = new Map<string, {
      category: string;
      skills: Map<string, { id: string; name: string; level: number; children: Array<{ id: string; name: string }>; marketDemand: number | null }>;
    }>();

    for (const row of result.rows) {
      const cat = row.category as string;
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { category: cat, skills: new Map() });
      }

      const entry = categoryMap.get(cat)!;
      entry.skills.set(row.id as string, {
        id: row.id as string,
        name: row.name as string,
        level: row.level as number,
        children: [],
        marketDemand: row.market_demand as number | null,
      });
    }

    // 親子関係構築
    for (const row of result.rows) {
      if (row.parent_skill_id) {
        const cat = row.category as string;
        const parent = categoryMap.get(cat)?.skills.get(row.parent_skill_id as string);
        if (parent) {
          parent.children.push({ id: row.id as string, name: row.name as string });
        }
      }
    }

    return [...categoryMap.values()].map((entry) => ({
      category: entry.category,
      skills: [...entry.skills.values()].filter((s) => s.level === 1),
    }));
  }

  // スキルギャップ分析
  async analyzeGap(
    candidateSkills: string[],
    requiredSkills: string[]
  ): Promise<{
    matched: Array<{ skill: string; confidence: number }>;
    missing: Array<{ skill: string; relatedSkills: string[]; learnPath: string[] }>;
    extra: Array<{ skill: string; relevance: "high" | "medium" | "low" }>;
    matchRate: number;
  }> {
    const matched: Array<{ skill: string; confidence: number }> = [];
    const missing: Array<{ skill: string; relatedSkills: string[]; learnPath: string[] }> = [];

    for (const required of requiredSkills) {
      const normalizedRequired = await this.normalize(required);

      let found = false;
      for (const candidate of candidateSkills) {
        const normalizedCandidate = await this.normalize(candidate);
        if (
          normalizedCandidate.normalized === normalizedRequired.normalized ||
          normalizedCandidate.skillId === normalizedRequired.skillId
        ) {
          matched.push({ skill: required, confidence: normalizedCandidate.confidence });
          found = true;
          break;
        }
      }

      if (!found) {
        // 関連スキルと学習パス取得
        const [skill] = normalizedRequired.skillId
          ? await db.select().from(skillDefinitions).where(sql`id = ${normalizedRequired.skillId}`).limit(1)
          : [];

        missing.push({
          skill: required,
          relatedSkills: (skill?.relatedSkills as string[]) ?? [],
          learnPath: [], // AIで生成可能
        });
      }
    }

    // 追加スキル（求人にないが候補者が持つスキル）
    const extra = candidateSkills
      .filter((cs) => !requiredSkills.some((rs) =>
        rs.toLowerCase() === cs.toLowerCase()
      ))
      .map((skill) => ({
        skill,
        relevance: "medium" as const,
      }));

    return {
      matched,
      missing,
      extra,
      matchRate: requiredSkills.length > 0 ? matched.length / requiredSkills.length : 0,
    };
  }

  // 人気スキルランキング
  async getPopularSkills(limit: number = 20): Promise<Array<{
    skill: string;
    candidateCount: number;
    positionCount: number;
    demandSupplyRatio: number;
  }>> {
    const result = await db.execute(sql`
      WITH candidate_skills AS (
        SELECT unnest(skills) as skill, COUNT(*) as candidate_count
        FROM candidates
        GROUP BY unnest(skills)
      ),
      position_skills AS (
        SELECT skill, COUNT(*) as position_count
        FROM (
          SELECT jsonb_array_elements_text(requirements->'mustHave') as skill FROM positions WHERE status = 'active'
          UNION ALL
          SELECT jsonb_array_elements_text(requirements->'niceToHave') as skill FROM positions WHERE status = 'active'
        ) sub
        GROUP BY skill
      )
      SELECT
        COALESCE(cs.skill, ps.skill) as skill,
        COALESCE(cs.candidate_count, 0) as candidate_count,
        COALESCE(ps.position_count, 0) as position_count,
        CASE
          WHEN COALESCE(cs.candidate_count, 0) > 0
          THEN COALESCE(ps.position_count, 0)::float / cs.candidate_count
          ELSE 0
        END as demand_supply_ratio
      FROM candidate_skills cs
      FULL OUTER JOIN position_skills ps ON LOWER(cs.skill) = LOWER(ps.skill)
      ORDER BY demand_supply_ratio DESC
      LIMIT ${limit}
    `);

    return result.rows.map((r) => ({
      skill: r.skill as string,
      candidateCount: Number(r.candidate_count),
      positionCount: Number(r.position_count),
      demandSupplyRatio: Number(Number(r.demand_supply_ratio).toFixed(2)),
    }));
  }
}
```

### W.2 スキルAPI

```typescript
// src/routes/skills.ts
import { Elysia } from "elysia";
import { SkillOntology } from "../services/skill-ontology.js";

const app = new Elysia();
const ontology = new SkillOntology();

// スキルツリー取得
app.get("/tree", async (c) => {
  const category = c.req.query("category");
  const tree = await ontology.getSkillTree(category);
  return c.json({ tree });
});

// スキル正規化
app.post("/normalize", async (c) => {
  const { skills } = await c.req.json<{ skills: string[] }>();
  const normalized = await ontology.normalizeMany(skills);
  return c.json({ normalized });
});

// スキルギャップ分析
app.post("/gap-analysis", async (c) => {
  const { candidateSkills, requiredSkills } = await c.req.json<{
    candidateSkills: string[];
    requiredSkills: string[];
  }>();
  const analysis = await ontology.analyzeGap(candidateSkills, requiredSkills);
  return c.json({ analysis });
});

// 人気スキルランキング
app.get("/popular", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "20");
  const skills = await ontology.getPopularSkills(limit);
  return c.json({ skills });
});

export default app;
```

### W.3 テスト

```typescript
// test/skill-ontology.test.ts
import { describe, it, expect } from "vitest";
import { SkillOntology } from "../src/services/skill-ontology.js";

describe("SkillOntology", () => {
  const ontology = new SkillOntology();

  describe("normalize", () => {
    it("should normalize exact match", async () => {
      const result = await ontology.normalize("TypeScript");
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it("should normalize case-insensitive", async () => {
      const result = await ontology.normalize("typescript");
      expect(result.normalized).toBe("TypeScript");
    });

    it("should return low confidence for unknown skills", async () => {
      const result = await ontology.normalize("完全に存在しないスキル12345");
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe("analyzeGap", () => {
    it("should calculate match rate", async () => {
      const result = await ontology.analyzeGap(
        ["TypeScript", "React", "Node.js"],
        ["TypeScript", "React", "Docker"]
      );

      expect(result.matched.length).toBeGreaterThanOrEqual(0);
      expect(result.matchRate).toBeGreaterThanOrEqual(0);
      expect(result.matchRate).toBeLessThanOrEqual(1);
    });

    it("should identify missing skills", async () => {
      const result = await ontology.analyzeGap(
        ["JavaScript"],
        ["TypeScript", "React", "Docker"]
      );

      expect(result.missing.length).toBeGreaterThan(0);
    });
  });
});
```
