# Supabase 集成方案 — HR 智能简历筛选系统

> 本文档详细探讨如何将 Supabase 集成到当前 HR 智能简历筛选系统中，涵盖前端与后端的全面改造方案。
> 当前技术栈：Elysia + Drizzle ORM + postgres.js + PostgreSQL + MiniMax AI + ImapFlow

---

## 目录

1. [Supabase 概述](#1-supabase-概述)
2. [替代当前架构的方案](#2-替代当前架构的方案)
3. [具体改造步骤](#3-具体改造步骤)
4. [Supabase + Drizzle 最佳实践](#4-supabase--drizzle-最佳实践)
5. [Supabase + Next.js 前端](#5-supabase--nextjs-前端)
6. [自托管 vs 云服务](#6-自托管-vs-云服务)
7. [成本分析](#7-成本分析)
8. [优缺点对比](#8-优缺点对比)
9. [推荐方案](#9-推荐方案)

---

## 1. Supabase 概述

### 1.1 什么是 Supabase

Supabase 是一个开源的后端即服务（Backend-as-a-Service, BaaS）平台，定位为 Firebase 的开源替代品，但底层构建于 PostgreSQL 之上。与 Firebase 使用 NoSQL（Firestore）不同，Supabase 充分利用了 PostgreSQL 的关系型数据库能力，同时提供了一整套开发工具链。

截至 2026 年，Supabase 已经远远超越了「Firebase 替代品」的标签，演变为一个强大的 Postgres 开发平台，特别在 AI 原生应用、安全性和可扩展性方面持续发力。

### 1.2 核心功能模块

#### 1.2.1 Database（数据库）

- **托管 PostgreSQL**：每个项目都是一个完整的 PostgreSQL 数据库实例，支持可配置的计算资源、磁盘类型和预配置 IOPS
- **自动生成 RESTful API**：基于 PostgREST，自动将数据库表暴露为 RESTful 端点，无需手写 CRUD 代码
- **GraphQL API**：通过自定义 Postgres GraphQL 扩展提供 GraphQL 查询能力
- **连接池**：内置 Supavisor 连接池，支持数千并发连接，对 Serverless 环境至关重要
- **数据库分支（Branching）**：允许开发团队在不影响生产环境的情况下快速迭代数据库 Schema
- **定时任务（Cron）**：在 Postgres 中调度周期性任务
- **外部数据包装器（Foreign Data Wrappers）**：将外部数据源作为 Postgres 表进行查询
- **丰富的扩展支持**：pgvector、PostGIS、pg_cron、pg_stat_statements 等

#### 1.2.2 Auth（认证与授权）

- **多种登录方式**：Email/Password、OAuth（Google/GitHub/微信等）、Magic Link、手机号验证
- **多因素认证（MFA）**：为应用添加额外安全层
- **Row Level Security（RLS）**：行级安全策略，在数据库层面实现细粒度权限控制
- **JWT 令牌管理**：自动签发和验证 JWT，与 RLS 深度集成
- **自定义邮件模板**：可定制所有认证流程的邮件内容
- **第三方 JWT 信任**：支持信任外部认证提供商签发的 JWT
- **OAuth 身份提供者**：可将项目转变为完整的身份提供者（「使用 [你的应用] 登录」）

#### 1.2.3 Storage（文件存储）

- **S3 兼容的对象存储**：支持存储图片、视频、文档、PDF 等各类文件
- **可恢复上传（TUS 协议）**：支持断点续传，适合大文件上传场景
- **图片变换**：支持实时缩放、裁剪、格式转换等图片处理
- **CDN 分发**：通过全球 285+ 城市节点加速文件访问
- **细粒度访问控制**：通过 RLS 策略控制文件的读写权限
- **签名 URL**：生成带有效期的临时文件访问链接

#### 1.2.4 Realtime（实时功能）

- **Postgres Changes**：通过 WebSocket 实时监听数据库变更（INSERT/UPDATE/DELETE）
- **Broadcast**：在已连接的用户之间发送低延迟的临时消息
- **Presence**：追踪和同步用户之间的共享状态（在线状态等）
- **实时授权**：控制广播频道的实时访问权限
- **触发广播**：直接从 Postgres 触发器发送广播消息

#### 1.2.5 Edge Functions（边缘函数）

- **全球分布式 TypeScript 函数**：基于 Deno 运行时，在距离用户最近的节点执行
- **Serverless 架构**：无需管理服务器，自动扩缩容
- **支持 Elysia 框架**：可在 Edge Functions 内使用 Elysia 进行路由管理
- **S3 挂载加速**：通过挂载 S3 存储桶实现冷启动速度提升 97%
- **Node.js 兼容**：支持部署传统 Node.js 应用

#### 1.2.6 Vector（向量数据库 / AI 工具包）

- **pgvector 扩展**：在 PostgreSQL 中存储、索引和查询向量嵌入
- **与业务数据同库**：向量嵌入与事务数据存储在同一数据库中，简化架构
- **多种索引算法**：支持 HNSW（高召回率）和 IVFFlat（低内存消耗）
- **语义搜索**：通过向量相似度实现基于语义的搜索功能
- **混合搜索**：2026 年的最佳实践是结合关键词搜索（BM25）和向量搜索
- **自动嵌入生成**：通过触发器和队列自动生成向量嵌入
- **AI 集成**：与 OpenAI、Hugging Face、LangChain 等主流 AI 框架集成

---

## 2. 替代当前架构的方案

### 2.1 当前架构概览

```
┌─────────────────────────────────────────────────────┐
│                   当前架构                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  前端 ──HTTP──> Elysia (Bun)                      │
│                    │                                │
│           ┌───────┼───────────┐                     │
│           │       │           │                     │
│      Drizzle ORM  │     MiniMax AI                  │
│           │       │     (简历评分)                    │
│      postgres.js  │                                 │
│           │       │                                 │
│      PostgreSQL   ImapFlow                          │
│      (自建/直连)   (邮件收取)                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

当前项目的核心依赖关系（`package.json`）：

| 依赖 | 版本 | 用途 |
|------|------|------|
| `elysia` | ^4.12.2 | Web 框架 |
| `drizzle-orm` | ^0.45.1 | ORM / 类型安全查询 |
| `postgres` | ^3.4.8 | PostgreSQL 驱动（postgres.js） |
| `ai` / `@ai-sdk/openai` | ^6.0.101 | Vercel AI SDK / MiniMax AI 调用 |
| `imapflow` | ^1.2.10 | IMAP 邮件收取 |
| `mammoth` / `pdf-parse` | - | 简历文件解析（DOC/PDF） |
| `zod` | ^4.3.6 | 运行时数据校验 |

当前数据库包含四张核心表：
- `positions` - 职位表
- `candidates` - 候选人表
- `resumes` - 简历表
- `scores` - AI 评分表

### 2.2 Database：Supabase 托管 PostgreSQL + Drizzle ORM

#### 当前方案

当前使用 `postgres.js` 直连 PostgreSQL：

```typescript
// src/db/index.ts（当前代码）
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema });
```

#### 改用 Supabase 后

**Supabase 与 Drizzle 完全兼容**，因为 Supabase 的数据库本质上就是标准 PostgreSQL。两者可以完美共存：

- **Supabase 提供**：托管的 PostgreSQL 实例、连接池（Supavisor）、自动生成的 REST/GraphQL API、Web 管理界面（Studio）
- **Drizzle 提供**：类型安全的查询构建、Schema 定义与迁移管理、零依赖的轻量级 ORM

改造后的连接方式：

```typescript
// src/db/index.ts（改造后）
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// 使用 Supabase 提供的连接字符串
// 重点：使用 Transaction 模式的连接池时必须禁用 prepare
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false, // Supabase Transaction 模式连接池要求
});

export const db = drizzle(client, { schema });
```

**连接字符串来源**：Supabase Dashboard -> Settings -> Database -> Connection String -> URI

#### 是否还需要 Drizzle？

**强烈建议保留 Drizzle ORM**。原因：

1. **类型安全**：Drizzle 提供编译时类型检查，PostgREST（Supabase 自动生成的 API）无法提供同等的 TypeScript 类型推断
2. **复杂查询**：当前项目中的 LEFT JOIN、动态 WHERE 条件、聚合查询等在 Drizzle 中表达自然，用 PostgREST 的 URL query 语法表达复杂逻辑困难且不直观
3. **迁移管理**：Drizzle Kit 提供了完善的 Schema diff 和迁移生成能力
4. **代码一致性**：保留 Drizzle 使得后端代码改动最小化

**可以禁用 PostgREST**：如果完全使用 Drizzle 而非 Supabase Data API，可以在 API Settings 中关闭 PostgREST 以减少攻击面。

### 2.3 Auth：Supabase Auth 替代自建认证

#### 当前问题

当前项目**没有任何认证机制** — 所有 API 端点均开放访问，`cors()` 中间件完全放开。这是一个严重的安全隐患，任何人都可以调用 API 进行数据增删改查。

#### Supabase Auth 方案

引入 Supabase Auth 可以一步到位地解决认证和授权问题：

**认证流程设计**：

```
HR 用户 ──登录──> Supabase Auth
                     │
                     ├──> 签发 JWT（包含 user_id, role, email 等）
                     │
HR 用户 ──带 JWT──> Elysia API
                     │
                     ├──> 中间件验证 JWT
                     ├──> 通过 Drizzle 查询数据
                     │    （数据库层 RLS 策略二次校验）
                     └──> 返回数据
```

**JWT 验证中间件**：

```typescript
// src/middleware/auth.ts
import { createClient } from "@supabase/supabase-js";
import { Elysia } from "elysia";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing authorization token" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // 将用户信息存入上下文
  c.set("user", user);
  await next();
});
```

**Row Level Security（RLS）策略示例**：

```sql
-- 启用 RLS
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- 只有认证用户可以查看职位
CREATE POLICY "Authenticated users can view positions"
  ON positions FOR SELECT
  TO authenticated
  USING (true);

-- 只有 HR 角色可以创建职位
CREATE POLICY "HR users can create positions"
  ON positions FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'hr'
    OR (auth.jwt() ->> 'user_role') = 'admin'
  );

-- 只有 HR 角色可以修改职位
CREATE POLICY "HR users can update positions"
  ON positions FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_role') = 'hr'
    OR (auth.jwt() ->> 'user_role') = 'admin'
  );

-- 候选人数据：HR 只能看到自己部门的候选人（可选）
CREATE POLICY "HR sees department candidates"
  ON candidates FOR SELECT
  TO authenticated
  USING (true);  -- 或更细粒度的部门级控制
```

**关键安全说明**：
- 永远不要在 RLS 策略中使用 `user_metadata` 声明，因为认证用户可以修改该字段
- 使用 `auth.uid()` 和 `auth.jwt()` 内置函数来获取当前用户信息
- Service Role Key 绝不能暴露到客户端，仅用于服务端管理操作

### 2.4 Storage：简历文件存储

#### 当前方案

当前项目只存储了简历的**解析后纯文本**（`rawText` 字段），不保存原始文件。这意味着：
- 无法重新解析或重新评分
- HR 无法预览/下载原始简历
- 文件信息只有 `fileName` 和 `mimeType` 元数据

#### Supabase Storage 方案

使用 Supabase Storage 存储原始简历文件，结合当前数据库中的文本数据：

**存储桶设计**：

```sql
-- 创建简历存储桶（私有，需要认证访问）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes',
  'resumes',
  false,  -- 私有桶
  10485760,  -- 10MB 文件大小限制
  ARRAY['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword']
);

-- 存储桶 RLS 策略
CREATE POLICY "HR can upload resumes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "HR can view resumes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'resumes');
```

**改造后的简历上传流程**：

```typescript
// src/routes/resumes.ts（改造后）
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

resumesRoute.post("/upload", authMiddleware, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const positionId = formData.get("positionId") as string | null;

  if (!file) return c.json({ error: "No file uploaded" }, 400);
  if (!positionId) return c.json({ error: "positionId is required" }, 400);

  // 1. 上传原始文件到 Supabase Storage
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${positionId}/${Date.now()}_${file.name}`;

  const { data: uploadData, error: uploadError } = await supabaseAdmin
    .storage
    .from("resumes")
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return c.json({ error: "File upload failed" }, 500);
  }

  // 2. 解析简历文本（保持现有逻辑）
  const parsed = await parseResume(fileBuffer, file.name);

  // 3. 创建候选人和简历记录（storagePath 存入数据库）
  const [candidate] = await db.insert(candidates).values({
    positionId,
    name: candidateName,
    status: "screening",
  }).returning();

  await db.insert(resumes).values({
    candidateId: candidate.id,
    fileName: file.name,
    mimeType: parsed.mimeType,
    rawText: parsed.text,
    storagePath: storagePath,  // 新增字段：文件在 Storage 中的路径
    source: "upload",
  });

  // 4. AI 评分（保持现有逻辑）
  // ...
});
```

**Schema 变更**：

```typescript
// 在 resumes 表中新增 storagePath 字段
export const resumes = pgTable("resumes", {
  // ... 原有字段
  storagePath: text(),  // Supabase Storage 中的文件路径
});
```

**生成签名 URL 供前端下载**：

```typescript
// GET /api/resumes/:id/download
resumesRoute.get("/:id/download", authMiddleware, async (c) => {
  const { id } = c.req.param();
  const [resume] = await db.select().from(resumes)
    .where(eq(resumes.id, id)).limit(1);

  if (!resume?.storagePath) {
    return c.json({ error: "File not found" }, 404);
  }

  const { data } = await supabaseAdmin.storage
    .from("resumes")
    .createSignedUrl(resume.storagePath, 3600); // 1小时有效期

  return c.json({ downloadUrl: data?.signedUrl });
});
```

### 2.5 Realtime：候选人状态实时推送

#### 应用场景

在 HR 系统中，候选人状态变更是核心业务流程。当一位 HR 将候选人从「筛选中」变为「入围」时，其他正在查看同一职位列表的 HR 应该立即看到这个变化。

Supabase Realtime 的三种模式在本项目中的适用场景：

| 模式 | 适用场景 |
|------|----------|
| Postgres Changes | 监听候选人状态变更、新简历入库、评分完成 |
| Broadcast | HR 之间的实时协作通知（如"某某正在查看该候选人"） |
| Presence | 显示当前在线的 HR 用户列表 |

#### 配置步骤

**第一步：启用 Realtime Publication**

```sql
-- 创建 Realtime publication（如果尚未存在）
CREATE PUBLICATION supabase_realtime;

-- 将需要实时监听的表加入 publication
ALTER PUBLICATION supabase_realtime ADD TABLE candidates;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
```

**第二步：前端订阅（Next.js 示例）**

```typescript
// 前端：监听候选人状态变更
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 订阅特定职位下的候选人变更
function subscribeToCandidateChanges(positionId: string) {
  const channel = supabase
    .channel(`candidates:${positionId}`)
    .on(
      "postgres_changes",
      {
        event: "*",        // 监听所有事件（INSERT/UPDATE/DELETE）
        schema: "public",
        table: "candidates",
        filter: `position_id=eq.${positionId}`,  // 按职位过滤
      },
      (payload) => {
        console.log("候选人变更:", payload);
        // payload.eventType: "INSERT" | "UPDATE" | "DELETE"
        // payload.new: 变更后的数据
        // payload.old: 变更前的数据（需要设置 replica identity full）
        handleCandidateChange(payload);
      }
    )
    .subscribe();

  return channel;
}

// 订阅新评分完成事件
function subscribeToScoreUpdates(positionId: string) {
  const channel = supabase
    .channel(`scores:${positionId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "scores",
        filter: `position_id=eq.${positionId}`,
      },
      (payload) => {
        console.log("新评分完成:", payload.new);
        // 自动刷新候选人列表中的评分数据
        refreshCandidateScore(payload.new);
      }
    )
    .subscribe();

  return channel;
}
```

**第三步：触发广播（推荐方式）**

对于高规模场景，Supabase 推荐使用 `realtime.broadcast_changes()` 触发器替代直接的 Postgres Changes：

```sql
-- 为候选人状态变更创建触发器广播
CREATE OR REPLACE FUNCTION notify_candidate_status_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'candidate_updates',                     -- 频道名
    TG_OP,                                   -- 操作类型
    TG_TABLE_NAME,                           -- 表名
    TG_TABLE_SCHEMA,                         -- Schema
    NEW,                                     -- 新数据
    OLD                                      -- 旧数据
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_candidate_status_change
  AFTER UPDATE ON candidates
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_candidate_status_change();
```

**生产环境注意事项**：

- Postgres Changes 的每次变更事件都需要对所有订阅者进行 RLS 权限检查，如果有 100 个订阅者，一次 INSERT 会触发 100 次读操作
- 数据库变更在单线程上处理以维持顺序，计算资源升级对 Postgres Changes 性能影响有限
- 对于高流量场景，建议使用不带 RLS 的公共表配合过滤器
- WebSocket 连接可能每 30 分钟断开一次，需要实现指数退避重连机制
- 默认限制：每个租户最多 100 个频道、每个频道最多 200 个并发用户、每秒最多 100 个事件

### 2.6 Edge Functions：能否替代 Elysia 后端？

#### 直接回答：不建议完全替代，但可以部分使用

**重要发现**：Supabase Edge Functions 和 Elysia 并非对立关系，而是可以协同使用的。Supabase 官方推荐在 Edge Functions 中使用 Elysia 来管理路由。

#### 方案对比

| 方面 | 保留 Elysia (Bun) | 迁移到 Edge Functions + Elysia | 混合方案 |
|------|---------------------|---------------------------|---------|
| **运行时** | Bun | Deno（Serverless） | 两者并存 |
| **ImapFlow** | 原生支持 | 不支持（Deno 运行时限制） | ImapFlow 在 Bun 中运行 |
| **PDF/DOC 解析** | 原生支持 | 部分支持（需适配 Deno） | 解析在 Bun 中运行 |
| **MiniMax AI** | 通过 AI SDK 调用 | 可在 Edge Functions 中调用 | 两者均可 |
| **冷启动** | 无（长驻进程） | 有（但 S3 挂载可加速 97%） | 取决于功能 |
| **全球分布** | 否（单区域部署） | 是（边缘节点） | 部分分布 |
| **自动扩缩** | 需自行配置 | 自动 | 部分自动 |

#### 为什么不建议完全替代

1. **ImapFlow 不兼容 Deno**：当前的邮件收取服务 (`email.ts`) 依赖 `imapflow`，该库需要 Bun 原生 TCP/TLS 能力，Deno 运行时无法直接支持
2. **文件解析库兼容性**：`pdf-parse` 和 `mammoth` 是 Bun 兼容库，在 Deno 中运行需要额外适配
3. **长连接需求**：邮件轮询是长驻服务，不适合 Serverless 架构

#### 推荐的混合方案

```
┌─────────────────────────────────────────────────┐
│                 推荐混合架构                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  前端 (Next.js)                                  │
│    │                                            │
│    ├──直连──> Supabase (Auth, Realtime, Storage)│
│    │                                            │
│    └──API──> Elysia Backend (Bun)             │
│                 │                               │
│          ┌──────┼──────────┐                    │
│          │      │          │                    │
│     Drizzle   ImapFlow   MiniMax AI             │
│     (Supabase DB)  (邮件)    (评分)              │
│                                                 │
│  Supabase Edge Functions                        │
│    ├── Webhook 处理（轻量）                       │
│    ├── 自动嵌入生成（向量化）                      │
│    └── 通知推送                                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

- **Elysia 后端保留**：处理 IMAP 邮件收取、简历文件解析、AI 评分等重计算任务
- **Edge Functions 处理**：Webhook 回调、轻量级 API（如通知推送）、向量嵌入生成
- **前端直连 Supabase**：Auth 认证流程、Realtime 订阅、Storage 文件上传/下载

### 2.7 Vector（pgvector）：技能语义匹配

#### 当前方案的局限

当前的 AI 评分服务 (`ai-scorer.ts`) 使用纯 LLM 文本分析进行技能匹配：

```typescript
// 当前方式：将技能列表作为文本传给 LLM，让 LLM 判断匹配度
skillConfig.must.join(", ")  // "React, TypeScript, Node.js"
```

这种方式的问题：
- 每次评分都需要调用 LLM API，成本高、延迟大
- 纯文本匹配无法理解语义近似（如「React.js」和「ReactJS」和「React」应该是同一技能）
- 不支持跨候选人的技能相似度搜索

#### Supabase pgvector 方案

利用 Supabase 内置的 pgvector 扩展实现语义级别的技能匹配：

**第一步：启用 pgvector 扩展**

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**第二步：添加向量嵌入列**

```sql
-- 为简历添加向量嵌入列（用于语义搜索）
ALTER TABLE resumes ADD COLUMN embedding vector(1536);

-- 为职位技能配置添加向量嵌入
ALTER TABLE positions ADD COLUMN skill_embedding vector(1536);

-- 创建 HNSW 索引加速相似度搜索
CREATE INDEX ON resumes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON positions USING hnsw (skill_embedding vector_cosine_ops);
```

**第三步：生成嵌入向量**

```typescript
// src/services/embeddings.ts
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text,
  });
  return embedding;
}

// 为简历生成嵌入向量
export async function embedResume(resumeText: string, resumeId: string) {
  const embedding = await generateEmbedding(resumeText);

  await db.execute(sql`
    UPDATE resumes
    SET embedding = ${JSON.stringify(embedding)}::vector
    WHERE id = ${resumeId}
  `);
}

// 为职位技能生成嵌入向量
export async function embedPositionSkills(
  skillConfig: SkillConfig,
  positionId: string
) {
  const skillText = [
    `必须技能: ${skillConfig.must.join(", ")}`,
    `加分技能: ${skillConfig.nice.join(", ")}`,
  ].join("\n");

  const embedding = await generateEmbedding(skillText);

  await db.execute(sql`
    UPDATE positions
    SET skill_embedding = ${JSON.stringify(embedding)}::vector
    WHERE id = ${positionId}
  `);
}
```

**第四步：语义搜索匹配函数**

```sql
-- 创建语义匹配函数：查找与职位最匹配的候选人
CREATE OR REPLACE FUNCTION match_candidates(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  candidate_id uuid,
  resume_id uuid,
  candidate_name text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id AS candidate_id,
    r.id AS resume_id,
    c.name AS candidate_name,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM resumes r
  JOIN candidates c ON c.id = r.candidate_id
  WHERE 1 - (r.embedding <=> query_embedding) > match_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

**第五步：混合评分策略（LLM + 向量搜索）**

```typescript
// 新的评分流程：先用向量搜索快速筛选，再用 LLM 精细评分
export async function hybridScoreResume(
  resumeText: string,
  positionId: string,
) {
  // 1. 生成简历向量
  const resumeEmbedding = await generateEmbedding(resumeText);

  // 2. 向量相似度快速匹配（毫秒级）
  const { data: matches } = await supabase.rpc("match_candidates", {
    query_embedding: resumeEmbedding,
    match_threshold: 0.5,
    match_count: 1,
  });

  const vectorSimilarity = matches?.[0]?.similarity ?? 0;

  // 3. 只对相似度高于阈值的候选人调用 LLM 精细评分（节省 API 成本）
  if (vectorSimilarity > 0.6) {
    const detailedScore = await scoreResume(resumeText, ...);
    return { ...detailedScore, vectorSimilarity };
  }

  // 4. 低相似度候选人直接给出低分，无需调用 LLM
  return {
    totalScore: vectorSimilarity * 100,
    grade: vectorSimilarity > 0.5 ? "D" : "F",
    explanation: "向量语义匹配度较低，技能方向与职位要求差距较大",
    vectorSimilarity,
  };
}
```

---

## 3. 具体改造步骤

### 3.1 阶段一：基础设施迁移（1-2 天）

#### Step 1: 创建 Supabase 项目

1. 访问 [supabase.com/dashboard](https://supabase.com/dashboard) 创建新项目
2. 选择离用户最近的区域（推荐 Singapore 或 Northeast Asia）
3. 记录以下信息：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`（公开的匿名密钥）
   - `SUPABASE_SERVICE_ROLE_KEY`（私密的服务端密钥）
   - `DATABASE_URL`（直连字符串）
   - `DATABASE_URL_POOLER`（连接池字符串）

#### Step 2: 迁移数据库 Schema

```bash
# 方法一：使用 Drizzle Kit 推送 Schema 到 Supabase
# 更新 drizzle.config.ts 的 dbCredentials 指向 Supabase
bun x drizzle-kit push

# 方法二：手动执行 SQL 迁移文件
# 将 drizzle/0000_deep_phil_sheldon.sql 在 Supabase SQL Editor 中执行
```

更新 `drizzle.config.ts`：

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,  // 指向 Supabase 数据库
  },
});
```

#### Step 3: 更新数据库连接

```typescript
// src/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// 使用 Supabase 连接池字符串
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,  // Supabase Transaction 模式要求
});

export const db = drizzle(client, { schema });
```

#### Step 4: 更新环境变量

```bash
# .env
# 数据库（使用 Supabase 提供的连接池地址）
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Supabase 项目配置
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# 其他保持不变
MINIMAX_API_KEY=...
IMAP_HOST=...
IMAP_PASS=...
```

更新 `env.ts`：

```typescript
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MINIMAX_API_KEY: z.string().min(1),
  // ... IMAP/SMTP 配置保持不变
});
```

#### Step 5: 验证基础连接

```bash
# 启动项目，验证所有 API 正常工作
bun dev

# 测试健康检查
curl http://localhost:3001/health

# 测试职位 CRUD
curl http://localhost:3001/api/positions
```

### 3.2 阶段二：认证系统集成（2-3 天）

#### Step 1: 安装 Supabase 客户端

```bash
bun add @supabase/supabase-js
```

#### Step 2: 创建 Supabase 客户端工具

```typescript
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";
import { env } from "../env.js";

// 管理员客户端：绕过 RLS，用于服务端管理操作
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

// 创建带用户 JWT 的客户端（用于 RLS 校验）
export function createUserClient(accessToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
```

#### Step 3: 实现认证中间件

```typescript
// src/middleware/auth.ts
import { Elysia } from "elysia";
import { supabaseAdmin } from "../lib/supabase.js";

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");

  // 使用 getUser() 而非 getSession()，确保 JWT 经过服务端验证
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  c.set("user", user);
  c.set("accessToken", token);
  await next();
});
```

#### Step 4: 在路由中启用认证

```typescript
// src/index.ts
import { authMiddleware } from "./middleware/auth.js";

const app = new Elysia();
app.use("*", cors());

// 健康检查不需要认证
app.route("/", health);

// 所有业务 API 需要认证
app.use("/api/*", authMiddleware);
app.route("/api/positions", positionsRoute);
app.route("/api/candidates", candidatesRoute);
app.route("/api/resumes", resumesRoute);
```

#### Step 5: 在 Supabase Dashboard 中配置 Auth

1. 启用 Email/Password 认证
2. 配置自定义 SMTP（如果使用自己的邮件服务器）
3. 创建初始 HR 用户账号
4. 配置 JWT 自定义声明（如 `user_role`）

### 3.3 阶段三：Storage 集成（1 天）

#### Step 1: 创建存储桶

在 Supabase Dashboard -> Storage 中创建 `resumes` 桶，或使用 SQL：

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes', 'resumes', false, 10485760,
  ARRAY['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword']
);
```

#### Step 2: 更新 Schema

```typescript
// src/db/schema.ts - resumes 表新增 storagePath 字段
export const resumes = pgTable("resumes", {
  id: uuid().primaryKey().defaultRandom(),
  candidateId: uuid().references(() => candidates.id).notNull(),
  fileName: text().notNull(),
  mimeType: text(),
  rawText: text(),
  storagePath: text(),  // 新增：Storage 中的文件路径
  source: text({ enum: ["upload", "email"] }).notNull().default("upload"),
  createdAt: timestamp().notNull().defaultNow(),
});
```

#### Step 3: 生成并执行迁移

```bash
bun x drizzle-kit generate
bun x drizzle-kit push
# 或手动执行：ALTER TABLE resumes ADD COLUMN storage_path text;
```

#### Step 4: 更新上传和邮件处理逻辑

在 `resumes.ts` 和 `email.ts` 中添加文件上传到 Storage 的逻辑（参见 2.4 节的代码示例）。

### 3.4 阶段四：Realtime 集成（1 天）

#### Step 1: 启用表的 Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE candidates;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
```

#### Step 2: 前端实现订阅（参见第 5 节）

### 3.5 阶段五：向量搜索集成（2-3 天）

#### Step 1: 启用 pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### Step 2: 添加向量列和索引（参见 2.7 节）

#### Step 3: 实现嵌入生成服务（参见 2.7 节）

#### Step 4: 更新评分流程为混合模式

### 3.6 迁移时间线总结

| 阶段 | 内容 | 预估工期 | 风险等级 |
|------|------|---------|---------|
| 一 | 数据库迁移到 Supabase | 1-2 天 | 低 |
| 二 | Auth 认证系统集成 | 2-3 天 | 中 |
| 三 | Storage 文件存储 | 1 天 | 低 |
| 四 | Realtime 实时订阅 | 1 天 | 低 |
| 五 | pgvector 向量搜索 | 2-3 天 | 中 |
| **总计** | | **7-10 天** | |

---

## 4. Supabase + Drizzle 最佳实践

### 4.1 连接配置

```typescript
// src/db/index.ts — 生产就绪的连接配置
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  prepare: false,          // Supabase Transaction 模式连接池要求
  max: 10,                 // 最大连接数（按需调整）
  idle_timeout: 20,        // 空闲连接超时（秒）
  connect_timeout: 10,     // 连接超时（秒）
});

export const db = drizzle(client, { schema });
```

**关键配置说明**：
- `prepare: false`：Supabase 的 Transaction 模式连接池不支持 Prepared Statements。如果不禁用，会出现 "prepared statement already exists" 错误
- 使用 `pooler` 连接字符串（端口 6543），而非直连字符串（端口 5432）

### 4.2 双客户端模式（Admin vs RLS）

这是 Supabase + Drizzle 区别于普通 Drizzle 项目的核心差异：

```typescript
// src/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

// Admin 客户端：绕过 RLS，用于后台任务、Webhook、邮件处理
const adminClient = postgres(process.env.DATABASE_URL!, {
  prepare: false,
});
export const adminDb = drizzle(adminClient, { schema });

// RLS 客户端：在事务中设置 JWT 声明，遵循 RLS 策略
export function createRlsDb(jwt: string) {
  const rlsClient = postgres(process.env.DATABASE_URL!, {
    prepare: false,
  });
  const rlsDb = drizzle(rlsClient, { schema });

  // 注意：set_config 和 SET LOCAL ROLE 只在事务中有效
  return {
    async query<T>(fn: (tx: typeof rlsDb) => Promise<T>): Promise<T> {
      return rlsDb.transaction(async (tx) => {
        // 设置当前请求的 JWT 声明
        await tx.execute(
          sql`SELECT set_config('request.jwt.claims', ${jwt}, true)`
        );
        await tx.execute(
          sql`SET LOCAL ROLE authenticated`
        );
        return fn(tx as any);
      });
    },
  };
}
```

**使用场景分区**：

| 场景 | 使用哪个客户端 | 原因 |
|------|-------------|------|
| 邮件轮询处理 (`email.ts`) | `adminDb` | 后台任务，无用户上下文 |
| AI 评分 (`ai-scorer.ts`) | `adminDb` | 后台服务调用 |
| HR 查看候选人列表 | `rlsDb` | 用户请求，需要 RLS 权限控制 |
| HR 修改候选人状态 | `rlsDb` | 用户请求，需要 RLS 权限控制 |
| 创建职位 | `rlsDb` | 用户请求，需要 RLS 权限控制 |

### 4.3 Schema 定义与 Drizzle Kit 迁移

**Schema 定义保持现有方式**，Drizzle 的 Schema 定义语法与 Supabase 完全兼容：

```typescript
// src/db/schema.ts（无需大改，Supabase 就是标准 PostgreSQL）
import { pgTable, uuid, text, timestamp, jsonb, integer, real, index } from "drizzle-orm/pg-core";

// 所有表定义保持不变
export const positions = pgTable("positions", { /* ... */ });
export const candidates = pgTable("candidates", { /* ... */ });
export const resumes = pgTable("resumes", { /* ... */ });
export const scores = pgTable("scores", { /* ... */ });
```

**迁移管理策略**：

Supabase 官方推荐的方式是使用 Supabase CLI 管理迁移，而 Drizzle 仅作为查询构建器。但对于本项目，可以继续使用 Drizzle Kit：

```bash
# 开发阶段：快速推送 Schema 变更
bun x drizzle-kit push

# 生产阶段：生成迁移文件后手动审查
bun x drizzle-kit generate  # 生成 SQL 迁移文件
# 审查 drizzle/ 目录下的迁移文件
# 在 Supabase SQL Editor 中执行，或通过 Supabase CLI 部署
```

### 4.4 Zod 集成

当前项目已经使用了 Zod 进行校验（`zod@^4.3.6`），可以配合 `drizzle-zod` 从 Drizzle Schema 自动生成运行时校验模式：

```bash
bun add drizzle-zod
```

```typescript
// src/db/validators.ts
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { positions, candidates } from "./schema.js";

// 自动生成 Zod 校验模式
export const insertPositionSchema = createInsertSchema(positions);
export const selectPositionSchema = createSelectSchema(positions);
export const insertCandidateSchema = createInsertSchema(candidates);

// 在路由中使用
positionsRoute.post("/", async (c) => {
  const body = await c.req.json();
  const validated = insertPositionSchema.parse(body);  // 自动校验
  const [row] = await db.insert(positions).values(validated).returning();
  return c.json(row, 201);
});
```

### 4.5 关闭不需要的 Supabase 功能

如果完全使用 Drizzle ORM 进行数据查询，可以考虑关闭 PostgREST 以减少攻击面：

1. Supabase Dashboard -> Settings -> API
2. 关闭 "Enable Data API (PostgREST)"

但建议保留 PostgREST，因为前端可能直接使用 Supabase JS 客户端进行简单查询。

---

## 5. Supabase + Next.js 前端

### 5.1 项目初始化

```bash
# 安装 Supabase 客户端库
bun add @supabase/supabase-js @supabase/ssr
```

注意：`@supabase/auth-helpers` 已被弃用，所有新项目应使用 `@supabase/ssr` 包。

### 5.2 环境变量配置

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # 公开的匿名密钥，可安全暴露给浏览器

# 仅服务端使用
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # 绝不能暴露到客户端
```

### 5.3 创建客户端工具

Next.js App Router 需要分别创建浏览器端和服务器端的 Supabase 客户端：

**浏览器端客户端**：

```typescript
// lib/supabase/client.ts
"use client";
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

**服务器端客户端**：

```typescript
// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll 在 Server Component 中被调用时写操作会被忽略
            // 中间件会负责持久化 cookie
          }
        },
      },
    },
  );
}
```

### 5.4 中间件配置

```typescript
// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 刷新过期的 session（重要！不要移除）
  const { data: { user } } = await supabase.auth.getUser();

  // 未登录用户重定向到登录页
  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|api/auth).*)",
  ],
};
```

### 5.5 认证页面示例

```typescript
// app/login/page.tsx
"use client";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="邮箱地址"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="密码"
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button type="submit">登录</button>
    </form>
  );
}
```

### 5.6 Realtime 订阅组件

```typescript
// components/CandidateList.tsx
"use client";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

interface Candidate {
  id: string;
  name: string;
  status: string;
  email?: string;
}

export function CandidateList({ positionId }: { positionId: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const supabase = createClient();

  useEffect(() => {
    // 初始加载
    async function loadCandidates() {
      const response = await fetch(
        `/api/candidates?positionId=${positionId}`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        },
      );
      const data = await response.json();
      setCandidates(data);
    }
    loadCandidates();

    // 实时订阅
    const channel = supabase
      .channel(`candidates:${positionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "candidates",
          filter: `position_id=eq.${positionId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setCandidates((prev) => [payload.new as Candidate, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setCandidates((prev) =>
              prev.map((c) =>
                c.id === (payload.new as Candidate).id
                  ? (payload.new as Candidate)
                  : c,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            setCandidates((prev) =>
              prev.filter((c) => c.id !== (payload.old as Candidate).id),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [positionId]);

  return (
    <ul>
      {candidates.map((c) => (
        <li key={c.id}>
          {c.name} — {c.status}
        </li>
      ))}
    </ul>
  );
}
```

### 5.7 文件上传组件

```typescript
// components/ResumeUpload.tsx
"use client";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export function ResumeUpload({ positionId }: { positionId: string }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const supabase = createClient();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;

      // 通过后端 API 上传（后端同时处理 Storage 上传 + 解析 + 评分）
      const formData = new FormData();
      formData.append("file", file);
      formData.append("positionId", positionId);
      formData.append("name", file.name.split(".")[0]);  // 以文件名作为候选人姓名

      const response = await fetch("/api/resumes/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: formData,
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("上传失败:", error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input
        type="file"
        accept=".pdf,.doc,.docx"
        onChange={handleUpload}
        disabled={uploading}
      />
      {uploading && <p>正在上传并评分中...</p>}
      {result && (
        <div>
          <p>候选人: {result.candidate?.name}</p>
          <p>评分: {result.score?.totalScore} ({result.score?.grade})</p>
          <p>评价: {result.score?.explanation}</p>
        </div>
      )}
    </div>
  );
}
```

### 5.8 Server Component 中获取数据

```typescript
// app/dashboard/positions/page.tsx
import { createClient } from "@/lib/supabase/server";

export default async function PositionsPage() {
  const supabase = await createClient();

  // 在 Server Component 中使用 Supabase 直连查询
  const { data: positions, error } = await supabase
    .from("positions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return <div>加载失败: {error.message}</div>;
  }

  return (
    <div>
      <h1>职位列表</h1>
      {positions.map((position) => (
        <div key={position.id}>
          <h2>{position.title}</h2>
          <p>{position.department}</p>
          <p>状态: {position.status}</p>
        </div>
      ))}
    </div>
  );
}
```

### 5.9 前端架构选择

| 数据查询方式 | 适用场景 | 特点 |
|-------------|---------|------|
| **Supabase JS Client 直连** | 简单 CRUD、实时订阅、Auth 操作 | 前端直连数据库，零后端代码 |
| **调用 Elysia API** | 复杂业务逻辑、AI 评分、邮件处理 | 保留后端控制，适合需要服务端处理的场景 |
| **Server Component + Supabase** | SSR 页面、SEO 敏感内容 | 服务端渲染，数据在构建时获取 |

**推荐策略**：简单查询用 Supabase JS Client，复杂业务用 Elysia API，页面渲染用 Server Component。

---

## 6. 自托管 vs 云服务

### 6.1 Supabase Cloud（云托管）

**优势**：
- 30 分钟内即可上线
- 自动备份、自动扩缩容
- 全球 CDN 加速
- Dashboard / Studio 管理界面
- 自动安全更新

**劣势**：
- 数据存储在第三方
- 可能存在网络延迟（服务器在海外）
- 成本随用量增长
- 无法完全自定义

### 6.2 Self-Hosted（Docker 自托管）

Docker 是自托管 Supabase 最快的方式，官方提供了完整的 Docker Compose 配置。

**系统要求**：
- 最低：4GB RAM / 2 CPU
- 推荐：8GB RAM / 4+ CPU
- 快速 SSD（PostgreSQL I/O 密集）
- 至少 100GB 存储空间

**部署步骤**：

```bash
# 克隆 Supabase 仓库
git clone --depth 1 https://github.com/supabase/supabase

# 进入 Docker 目录
cd supabase/docker

# 复制环境变量模板
cp .env.example .env

# 编辑 .env，修改所有密钥和密码（生产环境必须！）
# 关键变量：
# - POSTGRES_PASSWORD
# - JWT_SECRET
# - ANON_KEY
# - SERVICE_ROLE_KEY
# - DASHBOARD_USERNAME / DASHBOARD_PASSWORD

# 拉取镜像并启动
docker compose pull
docker compose up -d
```

**包含的服务**：

| 服务 | 描述 | 可选 |
|------|------|------|
| PostgreSQL | 数据库 | 核心 |
| PostgREST | 自动 REST API | 可关闭 |
| GoTrue (Auth) | 认证服务 | 可选 |
| Realtime | 实时功能 | 可选 |
| Storage | 文件存储 | 可选 |
| Kong | API 网关 | 核心 |
| Supavisor | 连接池 | 推荐 |
| Studio | Web 管理界面 | 推荐 |
| Edge Runtime | 边缘函数 | 可选 |
| Logflare | 日志分析 | 可选 |
| imgproxy | 图片处理 | 可选 |

**注意事项**：
- Auth 的 OAuth 配置（如第三方登录）需要在 `docker-compose.yml` 中手动配置，Dashboard 中无法操作
- 数据库迁移在持续部署环境中需要额外处理——Docker 的 PostgreSQL 镜像只在无数据时运行初始化脚本
- 建议使用 secrets manager 管理密钥，不要直接写在 `.env` 文件中
- 每月约有一次稳定版本发布，更新时需要注意版本兼容性

### 6.3 第三方部署工具

社区中流行的低代码 DevOps 工具：
- **Coolify**：开源的自托管 Heroku 替代品，支持一键部署 Supabase
- **EasyPanel**：简洁的 UI，适合快速部署
- **Dokploy**：轻量级，专注于快速应用部署

### 6.4 对比总结

| 维度 | Cloud | Self-Hosted |
|------|-------|-------------|
| **启动时间** | 5 分钟 | 30-60 分钟 |
| **运维负担** | 零 | 中到高 |
| **数据主权** | Supabase 托管 | 完全自控 |
| **网络延迟** | 取决于区域 | 可选最近节点 |
| **成本（小规模）** | Free/Pro $25/月 | 服务器 $5-50/月 |
| **成本（大规模）** | $599+/月 | 服务器 $50-200/月 |
| **自动备份** | 是 | 需自行配置 |
| **自动扩缩** | 是 | 需自行配置 |
| **安全更新** | 自动 | 手动 |
| **可定制性** | 有限 | 完全 |
| **适合团队** | 小团队/初创 | 有运维能力的团队 |

### 6.5 本项目推荐

**初期（开发 + MVP）**：使用 Supabase Cloud Free/Pro，快速验证方案可行性

**中期（生产环境）**：
- 如果公司有合规要求（数据不出境）-> 自托管
- 如果团队小、优先开发速度 -> Cloud Pro ($25/月)

**长期（规模化）**：
- 考虑自托管到公司内网或国内云服务商（Hetzner VPS 8核 32GB 约 $50/月 vs Supabase Cloud 同配置约 $410/月）

---

## 7. 成本分析

### 7.1 Supabase Cloud 定价详情（2026 年）

#### Free Plan — $0/月

| 资源 | 配额 |
|------|------|
| 项目数 | 2 个 |
| 数据库存储 | 500 MB |
| 数据库出站带宽 | 2 GB |
| 文件存储 | 1 GB |
| 存储出站带宽 | 2 GB |
| Auth MAU | 50,000 |
| Edge Functions 调用 | 500,000/月 |
| Realtime 消息 | 200 万/月 |
| 计算资源 | 共享 CPU / 500MB RAM |

**关键限制**：
- 项目在 **7 天无活动后自动暂停**，不适合需要 24/7 运行的生产环境
- 无自动备份（仅 7 天快照）
- 无 SLA 保证

#### Pro Plan — $25/月

| 资源 | 配额 | 超出费用 |
|------|------|---------|
| 数据库存储 | 8 GB | $0.125/GB |
| 出站带宽 | 250 GB | $0.09/GB |
| 文件存储 | 100 GB | $0.021/GB |
| Auth MAU | 100,000 | $0.00325/用户 |
| Edge Functions 调用 | 200 万/月 | $2/100 万 |
| Realtime 消息 | 500 万/月 | - |
| 计算资源 | 2 核 ARM / 1GB RAM（含 $10 计算积分） | $10-$3,730/月 |

**特点**：
- 默认开启消费上限（Spend Cap），账单可预测
- 包含 $10 计算积分
- 7 天备份快照
- 无项目暂停

#### Team Plan — $599/月

在 Pro 基础上增加：
- SSO 单点登录
- SOC 2 合规报告
- 28 天日志保留
- 优先支持

#### Enterprise Plan — 自定义定价

- 专属 SLA
- 24/7 技术支持
- 私有 Slack 频道
- BYO Cloud（自带云环境）
- HIPAA 合规

### 7.2 本项目成本估算

#### 开发阶段

```
Supabase Cloud Free Plan:  $0/月
-- 数据库存储: < 100MB（测试数据）
-- Auth MAU: < 10 人
-- 文件存储: < 100MB（测试简历）
-- 完全够用
```

#### 小规模生产（1-3 个 HR 用户，月处理 100 份简历）

```
Supabase Cloud Pro Plan:     $25/月
-- 数据库存储: ~1GB
-- Auth MAU: < 10
-- 文件存储: ~2GB（100 份简历 x 平均 2MB）
-- 不会产生超额费用

MiniMax AI API:              ~$5-10/月
-- 月处理 100 份简历
-- 每次评分约 2000 token

服务器（Elysia 后端）:          $5-10/月
-- 轻量 VPS 即可

总计: ~$35-45/月
```

#### 中等规模（10+ HR 用户，月处理 1000 份简历）

```
Supabase Cloud Pro Plan:     $25/月 (基础)
-- 数据库存储: ~5GB           $0 (在 8GB 配额内)
-- 文件存储: ~20GB            $0 (在 100GB 配额内)
-- Auth MAU: ~50              $0
-- 带宽超额: ~$5

MiniMax AI API:              ~$30-50/月

服务器（Elysia 后端）:          $20-30/月

总计: ~$80-110/月
```

#### 大规模 / 自托管方案

```
Hetzner VPS (8核/32GB):      ~$50/月
-- 运行 Supabase + Elysia 后端

MiniMax AI API:              ~$100-200/月

总计: ~$150-250/月
（vs Supabase Cloud 同配置: ~$460+/月）
```

### 7.3 与当前方案的成本对比

| 费用项 | 当前方案 | Supabase Cloud | Supabase 自托管 |
|--------|---------|---------------|----------------|
| 数据库 | 自行管理 PostgreSQL | 含在 Supabase 中 | 含在 Supabase 中 |
| 认证 | 无 | 含在 Supabase 中 | 含在 Supabase 中 |
| 文件存储 | 无 | 含在 Supabase 中 | 含在 Supabase 中 |
| 实时推送 | 无 | 含在 Supabase 中 | 含在 Supabase 中 |
| AI API | MiniMax 费用 | MiniMax 费用 | MiniMax 费用 |
| 服务器 | VPS 费用 | VPS (Elysia) + $25/月 | VPS 费用 |
| **月总计** | **VPS + AI 费用** | **VPS + AI + $25** | **VPS + AI** |

**结论**：Supabase Cloud Pro 每月只多 $25，但提供了认证、存储、实时推送、管理界面等完整功能集，对于小团队来说性价比极高。

---

## 8. 优缺点对比

### 8.1 当前方案 vs Supabase 方案

#### 当前方案（Elysia + Drizzle + postgres.js 直连）

**优势**：
- 完全控制：所有代码和基础设施由团队掌控
- 灵活性：可以自由选择任何 PostgreSQL 提供商
- 无供应商锁定：可以随时切换到任何 PostgreSQL 服务
- 轻量级：没有额外的抽象层和依赖
- 低延迟：直连数据库，无中间层

**劣势**：
- 无认证系统：所有 API 完全开放，存在严重安全隐患
- 无文件存储：简历只存文本，无法预览/下载原始文件
- 无实时功能：前端需要轮询获取最新数据
- 无管理界面：数据库操作依赖命令行或第三方工具
- 运维负担重：备份、监控、安全更新均需自行处理

#### Supabase 方案

**优势**：

1. **安全性大幅提升**
   - 内置认证系统（Auth），解决当前零认证的严重安全隐患
   - RLS 行级安全策略，在数据库层面保障数据访问权限
   - JWT 自动管理，免去手动实现 token 签发和验证

2. **功能完整度**
   - Auth + Database + Storage + Realtime + Vector 一站式方案
   - 当前缺失的文件存储、实时推送功能一步到位
   - pgvector 内置支持，可以实现更智能的语义技能匹配

3. **开发效率**
   - Studio Dashboard 提供可视化数据库管理
   - 自动生成 REST/GraphQL API，前端可直接调用
   - Realtime 订阅开箱即用，无需自建 WebSocket 服务

4. **运维简化**
   - 自动备份和恢复
   - 自动扩缩容
   - 安全更新由 Supabase 团队负责
   - 内置日志和监控

5. **前端开发友好**
   - `@supabase/ssr` 提供 Next.js SSR 完美集成
   - 前端可直接访问 Auth、Realtime、Storage
   - 减少后端 API 的开发量

6. **与现有架构兼容**
   - Drizzle ORM 完美兼容 Supabase PostgreSQL
   - Elysia 后端可以保留，处理复杂业务逻辑
   - 渐进式迁移，不需要一次性重写

**劣势**：

1. **引入供应商依赖**
   - 虽然开源可自托管，但深度使用 Supabase 特有功能（如 RLS 内置函数、Storage API）后，迁移成本增加
   - 如果 Supabase 服务故障，影响面更大

2. **连接池限制**
   - Transaction 模式不支持 Prepared Statements，需要 `prepare: false`
   - 连接池引入的额外延迟（通常可忽略）

3. **Realtime 的局限**
   - Postgres Changes 功能有扩展性上限（每次变更需对所有订阅者进行 RLS 检查）
   - 不保证消息交付（at-most-once 语义）
   - WebSocket 可能定期断开，需要重连机制

4. **学习曲线**
   - 团队需要学习 RLS 策略编写
   - 需要理解 Supabase 的客户端分层（Browser/Server/Admin）
   - Auth 流程配置（特别是 SSR 场景）有一定复杂度

5. **网络因素**
   - Supabase Cloud 服务器主要在海外，国内访问可能有延迟
   - 自托管可以解决此问题，但增加运维成本

6. **成本增长**
   - Cloud Pro 基础费 $25/月
   - 大规模使用时，带宽和计算的超额费用可能显著

### 8.2 关键决策矩阵

| 决策因素 | 权重 | 当前方案 | Supabase Cloud | Supabase 自托管 |
|---------|------|---------|---------------|----------------|
| 安全性 | 高 | 1/5 (无认证) | 5/5 | 5/5 |
| 开发速度 | 高 | 3/5 | 5/5 | 3/5 |
| 运维成本 | 中 | 2/5 | 5/5 | 2/5 |
| 功能完整度 | 高 | 2/5 (缺存储/实时) | 5/5 | 5/5 |
| 灵活性 | 中 | 5/5 | 3/5 | 4/5 |
| 数据主权 | 低 | 5/5 | 2/5 | 5/5 |
| 供应商独立性 | 低 | 5/5 | 2/5 | 4/5 |
| **加权总分** | | **2.6** | **4.3** | **3.8** |

---

## 9. 推荐方案

### 9.1 总体推荐：采用 Supabase Cloud Pro + 保留 Elysia 后端

基于以上分析，推荐**渐进式迁移到 Supabase Cloud Pro 方案**，同时保留 Elysia 后端处理核心业务逻辑。

### 9.2 分阶段迁移路线图

#### Phase 0：安全加固（紧急 - 第 1 周）

**目标**：解决当前零认证的安全隐患

```
当前状态：所有 API 完全开放
目标状态：API 需要 JWT 认证才能访问
```

具体操作：
1. 创建 Supabase Cloud 项目（Free Plan 即可开始）
2. 安装 `@supabase/supabase-js`
3. 实现 Auth 中间件（参见 3.2 节）
4. 在 Supabase Dashboard 中创建 HR 用户账号
5. 为所有 `/api/*` 路由启用认证

**成本**：$0（Free Plan）
**工期**：2-3 天

#### Phase 1：数据库迁移（第 2 周）

**目标**：将 PostgreSQL 迁移到 Supabase 托管

具体操作：
1. 将现有数据导出 (`pg_dump`)
2. 更新 `DATABASE_URL` 指向 Supabase
3. 导入数据 (`psql < dump.sql`)
4. 配置 Drizzle + Supabase 连接（`prepare: false`）
5. 验证所有 API 正常工作
6. 配置基础 RLS 策略

**成本**：升级到 Pro Plan ($25/月)
**工期**：1-2 天

#### Phase 2：Storage 集成（第 3 周）

**目标**：存储原始简历文件，支持预览和下载

具体操作：
1. 创建 `resumes` 存储桶
2. Schema 添加 `storagePath` 字段
3. 更新上传流程，同时存储文件和文本
4. 实现签名 URL 下载 API
5. 更新邮件处理流程，保存附件到 Storage

**成本**：含在 Pro Plan 中
**工期**：1 天

#### Phase 3：Realtime 集成（第 3-4 周）

**目标**：候选人状态变更实时推送到前端

具体操作：
1. 启用表的 Realtime Publication
2. 前端实现 WebSocket 订阅
3. 实现候选人列表实时更新
4. 实现评分完成通知

**成本**：含在 Pro Plan 中
**工期**：1 天

#### Phase 4：pgvector 向量搜索（第 5-6 周）

**目标**：技能语义匹配，提升 AI 评分准确度和效率

具体操作：
1. 启用 pgvector 扩展
2. 添加向量列和索引
3. 实现嵌入向量生成服务
4. 实现混合评分策略（向量预筛选 + LLM 精细评分）
5. 为历史数据批量生成向量

**成本**：可能需要 OpenAI Embedding API 费用（约 $0.02/100 万 token）
**工期**：2-3 天

#### Phase 5：前端全面集成（第 7-8 周）

**目标**：前端直连 Supabase 进行 Auth、简单查询和实时订阅

具体操作：
1. 安装 `@supabase/ssr`
2. 配置 Next.js 中间件
3. 实现登录/登出页面
4. 简单查询改为 Supabase Client 直连
5. 复杂业务保留 Elysia API 调用

**工期**：3-5 天

### 9.3 最终目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                    最终目标架构                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Next.js 前端                                                │
│    │                                                        │
│    ├──Auth──> Supabase Auth (登录/登出/JWT 管理)              │
│    │                                                        │
│    ├──直连──> Supabase PostgREST (简单查询: 职位列表等)        │
│    │                                                        │
│    ├──WS───> Supabase Realtime (候选人状态变更实时推送)        │
│    │                                                        │
│    ├──直连──> Supabase Storage (简历文件上传/下载)             │
│    │                                                        │
│    └──API──> Elysia Backend (Bun)                         │
│                 │                                           │
│          ┌──────┼──────────┬──────────┐                     │
│          │      │          │          │                     │
│     Drizzle   ImapFlow   MiniMax   pgvector                 │
│     (查询)   (邮件收取)   (AI评分)  (语义匹配)               │
│          │                                                  │
│     Supabase PostgreSQL                                     │
│     (Auth + RLS + Storage + Realtime + Vector)              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.4 迁移原则

1. **渐进式迁移**：每个阶段独立可交付，不需要一次性全部改完
2. **保持兼容**：Elysia 后端和 Drizzle ORM 完全保留，只改连接方式
3. **安全优先**：Phase 0 解决认证问题是最高优先级
4. **最小变更**：尽量复用现有代码，减少引入 bug 的风险
5. **可回退**：Supabase 底层就是标准 PostgreSQL，随时可以切换回直连方案

### 9.5 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|---------|
| Supabase Cloud 服务中断 | 低 | Pro Plan 有基本 SLA；关键数据定期备份 |
| 海外节点延迟 | 中 | 选择 Singapore 区域；长期可自托管 |
| 连接池兼容问题 | 低 | `prepare: false` 已验证可解决 |
| RLS 策略配置错误导致数据泄露 | 中 | 彻底测试 RLS；初期使用 Service Role 绕过 |
| 迁移过程中数据丢失 | 低 | 迁移前完整备份；分阶段验证 |
| 团队学习曲线 | 中 | 参考官方文档和本文档；从简单功能开始 |

---

## 附录

### A. 相关链接

- [Supabase 官网](https://supabase.com)
- [Supabase 文档](https://supabase.com/docs)
- [Supabase 定价](https://supabase.com/pricing)
- [Drizzle + Supabase 官方教程](https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase)
- [Supabase + Next.js 快速开始](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase SSR Auth 配置](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [pgvector 文档](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Supabase Realtime 文档](https://supabase.com/docs/guides/realtime)
- [Supabase Storage 文档](https://supabase.com/docs/guides/storage)
- [Supabase Docker 自托管](https://supabase.com/docs/guides/self-hosting/docker)
- [Supabase Edge Functions 文档](https://supabase.com/docs/guides/functions)
- [Elysia + Supabase Edge Functions](https://elysiajs.com/plugins/overview)

### B. 环境变量完整列表（改造后）

```bash
# PostgreSQL (通过 Supabase)
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres

# Supabase
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI
MINIMAX_API_KEY=sk-...
OPENAI_API_KEY=sk-...              # 用于向量嵌入生成（Phase 4）

# IMAP（保持不变）
IMAP_HOST=mail.ivis-sh.com
IMAP_PORT=993
IMAP_USER=hr@ivis-sh.com
IMAP_PASS=...

# SMTP（保持不变）
SMTP_HOST=mail.ivis-sh.com
SMTP_PORT=587
SMTP_USER=hr@ivis-sh.com
SMTP_PASS=...

# 前端环境变量
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### C. 新增依赖包

```bash
# 后端新增
bun add @supabase/supabase-js

# 前端新增
bun add @supabase/supabase-js @supabase/ssr

# 可选（向量嵌入阶段）
# OpenAI embedding 通过现有的 @ai-sdk/openai 即可调用

# 可选（Drizzle Zod 集成）
bun add drizzle-zod
```

---

## 附录 D：Supabase Auth + Elysia 中间件集成

### D.1 JWT 验证中间件

当前项目没有认证机制。使用 Supabase Auth 后，前端获取 JWT token，后端通过中间件验证：

```typescript
// src/middleware/auth.ts
import { Elysia } from "elysia";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env.js";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing authorization" }, 401);
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  c.set("user", user);
  await next();
});
```

### D.2 在路由中使用

```typescript
// src/index.ts — 健康检查不需要认证，API 路由需要
app.route("/", health);
app.use("/api/*", authMiddleware);
app.route("/api/positions", positionsRoute);
```

### D.3 RLS 策略示例

```sql
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can manage candidates"
  ON candidates FOR ALL
  TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' IN ('hr', 'admin'));
```

---

## 附录 E：Supabase Storage 简历文件存储

### E.1 当前局限

项目仅存储简历 `rawText`，原始 PDF/DOCX 解析后被丢弃。

### E.2 使用 Supabase Storage

```typescript
// src/services/file-storage.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export async function uploadResumeFile(
  buffer: Buffer,
  candidateId: string,
  fileName: string,
): Promise<string> {
  const path = `${candidateId}/${fileName}`;
  const { error } = await supabase.storage
    .from("resumes")
    .upload(path, buffer, { upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from("resumes").getPublicUrl(path);
  return data.publicUrl;
}
```

---

## 附录 F：Supabase Realtime 候选人状态推送

```typescript
// 前端 — 实时监听候选人状态变化
const channel = supabase
  .channel("candidates-changes")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "candidates",
    filter: `position_id=eq.${positionId}`,
  }, (payload) => {
    console.log("变化:", payload.eventType, payload.new);
  })
  .subscribe();
```

---

## 附录 G：Supabase Edge Functions 使用场景

### G.1 什么是 Edge Functions

```
Supabase Edge Functions = Deno Deploy 上的 TypeScript 函数
├─ 运行在 Deno 运行时（非 Bun）
├─ 部署在全球边缘节点（低延迟）
├─ 按调用计费（每月 500K 免费）
├─ 可访问 Supabase 客户端（Auth, DB, Storage）
└─ 适合轻量级 webhook/定时任务
```

### G.2 HR 项目中的应用场景

```
场景 1：邮件 Webhook 处理
├─ 邮件服务（如 SendGrid/Postmark）收到简历邮件 → 调用 Edge Function
├─ Edge Function 解析附件 → 存储到 Supabase Storage → 触发评分
└─ 替代 ImapFlow 轮询方案（实时性更好）

场景 2：定时清理过期数据
├─ 使用 pg_cron 或 Supabase 的 cron trigger
├─ 每天清理 30 天前的未处理候选人
└─ 发送过期通知邮件

场景 3：Webhook 转发
├─ 接收第三方 HR 平台回调（如 Boss直聘 API）
├─ 验证签名 → 转换数据 → 写入数据库
└─ 比主后端处理更轻量
```

### G.3 Edge Function 示例：简历邮件 Webhook

```typescript
// supabase/functions/email-webhook/index.ts
// 部署：supabase functions deploy email-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // 验证 webhook 签名
  const signature = req.headers.get("x-webhook-signature");
  const secret = Deno.env.get("WEBHOOK_SECRET");
  // ... 签名验证逻辑

  const payload = await req.json();

  const { from, subject, attachments } = payload;

  // 存储附件到 Supabase Storage
  for (const attachment of attachments) {
    if (attachment.contentType === "application/pdf" ||
        attachment.contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {

      const filePath = `inbox/${Date.now()}_${attachment.filename}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, decode(attachment.content), {
          contentType: attachment.contentType,
        });

      if (uploadError) {
        console.error("Upload failed:", uploadError);
        continue;
      }

      // 创建候选人记录
      await supabase.from("candidates").insert({
        name: extractNameFromEmail(from),
        email: from,
        status: "pending",
      });

      // 通知主后端处理（评分）
      await fetch(`${Deno.env.get("BACKEND_URL")}/api/resumes/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: filePath,
          candidateEmail: from,
        }),
      });
    }
  }

  return new Response(JSON.stringify({ processed: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

function extractNameFromEmail(email: string): string {
  const local = email.split("@")[0];
  return local.replace(/[._-]/g, " ");
}

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
```

### G.4 Edge Functions vs 主后端对比

| 维度 | Supabase Edge Function | Elysia 主后端 |
|------|----------------------|------------|
| **运行时** | Deno | Bun |
| **部署** | Supabase 管理 | 自行管理 Docker |
| **冷启动** | ~200ms | N/A（常驻） |
| **超时** | 150s（免费）/ 400s（Pro） | 无限制 |
| **内存** | 256MB | 自定义 |
| **适合** | Webhook、轻量计算 | 复杂业务、长时间任务 |
| **npm 包** | 通过 esm.sh 或 npm: 导入 | 完整 npm 生态 |
| **本项目用途** | 邮件 webhook、定时清理 | 核心 API、评分、邮件轮询 |

---

## 附录 H：Supabase RLS (Row Level Security) 完整配置

### H.1 RLS 概念

```
Row Level Security = 数据库行级访问控制
├─ 每个 SELECT/INSERT/UPDATE/DELETE 自动附加条件
├─ 基于当前认证用户 (auth.uid())
├─ 在 PostgreSQL 级别强制执行（无法绕过）
└─ 即使直接 SQL 查询也受限制
```

### H.2 HR 项目 RLS 策略设计

```sql
-- 启用 RLS
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- ===== 角色定义 =====
-- admin: 系统管理员（完全访问）
-- hr_manager: HR 经理（管理所有职位和候选人）
-- hr_recruiter: HR 招聘员（只能查看分配的职位）
-- interviewer: 面试官（只能查看面试阶段的候选人）

-- 创建自定义 claims 函数（获取用户角色）
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    'viewer'
  );
$$ LANGUAGE SQL STABLE;

-- ===== Positions 表策略 =====

-- 所有已认证用户可查看职位
CREATE POLICY "Authenticated users can view positions"
  ON positions FOR SELECT
  TO authenticated
  USING (true);

-- 仅 admin 和 hr_manager 可创建职位
CREATE POLICY "HR managers can create positions"
  ON positions FOR INSERT
  TO authenticated
  WITH CHECK (auth.user_role() IN ('admin', 'hr_manager'));

-- 仅 admin 和 hr_manager 可修改职位
CREATE POLICY "HR managers can update positions"
  ON positions FOR UPDATE
  TO authenticated
  USING (auth.user_role() IN ('admin', 'hr_manager'))
  WITH CHECK (auth.user_role() IN ('admin', 'hr_manager'));

-- ===== Candidates 表策略 =====

-- HR 人员可查看所有候选人
CREATE POLICY "HR staff can view candidates"
  ON candidates FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('admin', 'hr_manager', 'hr_recruiter')
  );

-- 面试官只能看到面试阶段的候选人
CREATE POLICY "Interviewers view interview candidates"
  ON candidates FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'interviewer'
    AND status = 'interview'
  );

-- HR 可更新候选人状态
CREATE POLICY "HR staff can update candidates"
  ON candidates FOR UPDATE
  TO authenticated
  USING (auth.user_role() IN ('admin', 'hr_manager', 'hr_recruiter'));

-- ===== Scores 表策略 =====

-- 所有 HR 人员可查看评分
CREATE POLICY "HR staff can view scores"
  ON scores FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('admin', 'hr_manager', 'hr_recruiter', 'interviewer')
  );

-- 仅系统可写入评分（通过 service_role key）
-- 后端使用 service_role key 绕过 RLS 写入评分
```

### H.3 后端代码适配 RLS

```typescript
// src/lib/supabase.ts — 两种客户端

import { createClient } from "@supabase/supabase-js";
import { env } from "../env.js";

// 1. 管理客户端（绕过 RLS — 用于系统操作如写入评分）
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

// 2. 用户客户端（遵守 RLS — 用于用户请求）
export function createUserClient(accessToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
```

```typescript
// src/middleware/auth.ts — 根据 RLS 角色授权

import { Elysia } from "elysia";
import { supabaseAdmin } from "../lib/supabase.js";

export const requireRole = (...roles: string[]) =>
  createMiddleware(async (c, next) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return c.json({ error: "Unauthorized" }, 401);

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return c.json({ error: "Invalid token" }, 401);

    const userRole = user.app_metadata?.role || "viewer";
    if (!roles.includes(userRole)) {
      return c.json({ error: "Forbidden", requiredRoles: roles }, 403);
    }

    c.set("user", user);
    c.set("userRole", userRole);
    await next();
  });

// 使用：
// app.post("/api/positions", requireRole("admin", "hr_manager"), handler);
// app.get("/api/candidates", requireRole("admin", "hr_manager", "hr_recruiter"), handler);
```

### H.4 RLS 调试技巧

```sql
-- 测试 RLS 策略（模拟特定用户）
SET request.jwt.claims = '{"sub": "user-uuid", "role": "authenticated", "app_metadata": {"role": "hr_recruiter"}}';

SELECT * FROM candidates; -- 应该能看到
SELECT * FROM positions;  -- 应该能看到

-- 重置
RESET request.jwt.claims;

-- 查看所有 RLS 策略
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';

-- 临时禁用 RLS（调试用）
ALTER TABLE candidates DISABLE ROW LEVEL SECURITY;
-- ⚠️ 调试完记得重新启用
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
```

---

## 附录 I：Supabase 迁移方案评估

### I.1 当前架构 vs Supabase 架构对比

```
当前架构：
├─ Elysia + Bun (自托管)
├─ Drizzle ORM → PostgreSQL (自托管)
├─ ImapFlow (自托管轮询)
├─ Vercel AI SDK → MiniMax
└─ Docker 部署

Supabase 全量迁移后：
├─ Elysia + Bun (自托管，不变)
├─ Drizzle ORM → Supabase PostgreSQL (托管)
├─ Supabase Auth (替代自建认证)
├─ Supabase Storage (替代本地文件存储)
├─ Supabase Realtime (新增实时功能)
├─ Supabase Edge Functions (可选，辅助)
├─ ImapFlow (保留，Supabase 无替代)
├─ Vercel AI SDK → MiniMax (不变)
└─ Docker 部署 (仅后端 app，DB 托管到 Supabase)
```

### I.2 渐进式迁移路线图

```
Phase 0（当前）：全自托管
Phase 1：数据库迁移到 Supabase ← 推荐第一步
├─ 将 DATABASE_URL 改为 Supabase connection string
├─ Drizzle 配置无需修改（仍然是 PostgreSQL）
├─ pgvector 扩展在 Supabase Dashboard 启用
└─ 好处：免运维 PostgreSQL、自动备份、Dashboard 可视化

Phase 2：添加 Supabase Auth
├─ 前端使用 @supabase/auth-ui-react
├─ 后端添加 JWT 验证中间件
├─ 配置 RLS 策略
└─ 好处：无需自建认证、邮箱/手机登录

Phase 3：Storage + Realtime
├─ 简历文件迁移到 Supabase Storage
├─ 前端使用 Realtime 监听候选人状态
└─ 好处：CDN 分发、实时更新

Phase 4（可选）：Edge Functions
├─ 邮件 webhook 替代 IMAP 轮询
├─ 定时任务（过期清理等）
└─ 好处：减少后端负载
```

### I.3 费用估算

```
Supabase Free Plan：
├─ Database: 500MB
├─ Storage: 1GB
├─ Auth: 50,000 MAU
├─ Edge Functions: 500K invocations
├─ Realtime: 200 concurrent connections
└─ 适合 MVP 和小团队

Supabase Pro Plan ($25/月)：
├─ Database: 8GB
├─ Storage: 100GB
├─ Auth: 100,000 MAU
├─ Edge Functions: 2M invocations
├─ Realtime: 500 concurrent connections
└─ 适合正式运营

自托管成本（VPS）：
├─ PostgreSQL + 应用：~$20/月（4GB RAM VPS）
├─ 运维时间：~2h/月
└─ 适合：有 DevOps 经验的团队

结论：
├─ 10 人以下团队 → Supabase Free/Pro
├─ 数据敏感 → 自托管或 Supabase 自托管版
└─ 中国大陆部署 → 自托管（Supabase 在海外）
    ⚠️ 如果部署在中国大陆，Supabase 延迟较高
    → 推荐继续自托管 PostgreSQL
    → 仅使用 Supabase Auth（前端直连）
```

---

## 附录 J：Supabase 自托管方案

### J.1 为什么考虑自托管

```
Supabase Cloud 的限制（对于中国部署）：
├─ 服务器在海外（延迟 100-300ms）
├─ 数据出境合规风险
├─ 网络不稳定（GFW 影响）
└─ 费用随用量增长

Supabase 自托管优势：
├─ 部署在中国服务器（延迟 < 10ms）
├─ 数据完全自控
├─ 无请求限制
├─ 仍然享受 Supabase 所有功能
└─ 代码完全开源（MIT + Apache 2.0）
```

### J.2 Docker Compose 自托管部署

```bash
# 克隆 Supabase Docker 仓库
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# 复制环境变量模板
cp .env.example .env
```

```bash
# .env — 关键配置
POSTGRES_PASSWORD=your-strong-password
JWT_SECRET=your-jwt-secret-at-least-32-chars
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=your-dashboard-password

# 外部访问
SITE_URL=https://hr.ivis-sh.com
API_EXTERNAL_URL=https://api.hr.ivis-sh.com
```

```bash
# 启动所有服务
docker compose up -d

# 包含的服务：
# - PostgreSQL (pgvector 已内置)
# - GoTrue (Auth)
# - PostgREST (Auto API)
# - Realtime
# - Storage
# - Meta (Dashboard)
# - Kong (API Gateway)
# - Edge Runtime
```

### J.3 最小化自托管（仅需要的组件）

```yaml
# docker-compose.supabase-minimal.yml
# 只部署 HR 项目需要的 Supabase 组件

services:
  # PostgreSQL（核心数据库 — 必需）
  postgres:
    image: supabase/postgres:15.6.1
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - supabase_pg_data:/var/lib/postgresql/data

  # GoTrue（Auth — 推荐）
  auth:
    image: supabase/gotrue:v2.158.1
    depends_on:
      - postgres
    environment:
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@postgres:5432/postgres
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_SITE_URL: ${SITE_URL}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: true
      GOTRUE_MAILER_AUTOCONFIRM: false
      GOTRUE_SMTP_HOST: mail.ivis-sh.com
      GOTRUE_SMTP_PORT: 587
      GOTRUE_SMTP_USER: hr@ivis-sh.com
      GOTRUE_SMTP_PASS: ${SMTP_PASS}
      GOTRUE_SMTP_ADMIN_EMAIL: hr@ivis-sh.com
    ports:
      - "9999:9999"

  # Storage（简历文件存储 — 推荐）
  storage:
    image: supabase/storage-api:v1.0.6
    depends_on:
      - postgres
    environment:
      ANON_KEY: ${ANON_KEY}
      SERVICE_KEY: ${SERVICE_ROLE_KEY}
      DATABASE_URL: postgres://supabase_storage_admin:${POSTGRES_PASSWORD}@postgres:5432/postgres
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
    volumes:
      - supabase_storage_data:/var/lib/storage
    ports:
      - "5000:5000"

  # Realtime（可选 — 实时通知）
  realtime:
    image: supabase/realtime:v2.28.32
    depends_on:
      - postgres
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: supabase_admin
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: postgres
      SECRET_KEY_BASE: ${JWT_SECRET}
    ports:
      - "4000:4000"

volumes:
  supabase_pg_data:
  supabase_storage_data:
```

### J.4 HR Backend 连接自托管 Supabase

```typescript
// src/env.ts — 添加 Supabase 环境变量
const envSchema = z.object({
  // ... 现有变量

  // Supabase（如果使用）
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

// 自托管地址示例：
// SUPABASE_URL=http://localhost:8000（Kong API Gateway）
// 或直连各服务：
// Auth: http://localhost:9999
// Storage: http://localhost:5000
// Realtime: ws://localhost:4000
```

---

## 附录 K：Supabase Triggers 与 PostgreSQL Functions

### K.1 自动评分触发器

```sql
-- 当新简历插入时自动通知后端评分
-- （通过 pg_notify + Supabase Realtime）

CREATE OR REPLACE FUNCTION notify_new_resume()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'new_resume',
    json_build_object(
      'resume_id', NEW.id,
      'candidate_id', NEW.candidate_id,
      'created_at', NEW.created_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_resume_insert
  AFTER INSERT ON resumes
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_resume();
```

### K.2 后端监听 PostgreSQL 通知

```typescript
// src/services/resume-listener.ts
import postgres from "postgres";
import { env } from "../env.js";
import { scoreResume } from "./ai-scorer.js";
import { logger } from "../lib/logger.js";

export async function startResumeListener() {
  const sql = postgres(env.DATABASE_URL);

  // 监听 PostgreSQL NOTIFY
  await sql.listen("new_resume", async (payload) => {
    try {
      const data = JSON.parse(payload);
      logger.info("new_resume_notification", data);

      // 触发自动评分流程
      // ... 获取简历文本 → 获取职位信息 → 评分
    } catch (error) {
      logger.error("resume_listener_error", {
        error: (error as Error).message,
      });
    }
  });

  logger.info("Resume listener started (pg_notify)");
}
```

### K.3 候选人状态变更审计日志

```sql
-- 审计日志表
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  action TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
  old_data JSONB,
  new_data JSONB,
  changed_by UUID,       -- auth.uid()
  changed_at TIMESTAMP DEFAULT NOW()
);

-- 候选人状态变更审计
CREATE OR REPLACE FUNCTION audit_candidate_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (
      'candidates',
      NEW.id,
      'STATUS_CHANGE',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_candidate_status_change
  AFTER UPDATE ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION audit_candidate_changes();
```

### K.4 自动计算统计视图

```sql
-- 实时统计视图（可用于 Dashboard）
CREATE OR REPLACE VIEW position_dashboard AS
SELECT
  p.id,
  p.title,
  p.created_at,
  COUNT(DISTINCT c.id) AS total_candidates,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'pending') AS pending_count,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'interview') AS interview_count,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'hired') AS hired_count,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'rejected') AS rejected_count,
  ROUND(AVG(s.total_score)::numeric, 1) AS avg_score,
  COUNT(DISTINCT c.id) FILTER (WHERE s.grade = 'A') AS grade_a_count,
  COUNT(DISTINCT c.id) FILTER (WHERE s.grade = 'B') AS grade_b_count,
  MAX(c.created_at) AS latest_application
FROM positions p
LEFT JOIN candidates c ON c.position_id = p.id
LEFT JOIN scores s ON s.candidate_id = c.id
GROUP BY p.id, p.title, p.created_at
ORDER BY p.created_at DESC;

-- 使用：
-- SELECT * FROM position_dashboard;
-- 或通过 Supabase PostgREST: GET /rest/v1/position_dashboard
```

---

## 附录 L：Drizzle ORM 连接 Supabase 的具体步骤

### L.1 连接配置

```typescript
// src/db/index.ts — 连接 Supabase PostgreSQL

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { env } from "../env.js";

// Supabase 提供两种连接方式：

// 1. Direct connection（适合长连接，如后端服务）
//    格式：postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
//    或 Session Mode: port 5432

// 2. Transaction pooler（适合 serverless/短连接）
//    格式：postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
//    Transaction Mode: port 6543

const client = postgres(env.DATABASE_URL, {
  // Supabase 推荐配置
  max: 10,            // 连接池大小（Supabase Free 最多 60 连接）
  idle_timeout: 20,   // 空闲超时（秒）
  connect_timeout: 10,

  // 如果使用 Transaction pooler (port 6543)
  // prepare: false,   // Transaction mode 不支持 prepared statements
});

export const db = drizzle(client, { schema });
```

### L.2 迁移到 Supabase 的步骤

```bash
# 步骤 1：在 Supabase Dashboard 创建项目
# 记录 Connection String（Settings → Database → Connection string）

# 步骤 2：启用 pgvector 扩展
# Dashboard → Database → Extensions → 搜索 "vector" → Enable

# 步骤 3：更新 .env
# DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres

# 步骤 4：运行迁移
bun db:migrate

# 步骤 5：验证
bun -e "
  import { db } from './src/db/index.js';
  import { positions } from './src/db/schema.js';
  const result = await db.select().from(positions).limit(1);
  console.log('连接成功！', result);
  process.exit(0);
"
```

### L.3 Supabase 连接池 vs 直连

```
场景：HR Backend（Elysia 长连接服务）

推荐：Direct Connection (port 5432)
├─ 后端是常驻进程，保持连接池
├─ 支持 prepared statements（更高性能）
├─ 支持 LISTEN/NOTIFY
└─ Drizzle 默认模式即可

不推荐：Transaction Pooler (port 6543)
├─ 适合 serverless（如 Vercel Edge Functions）
├─ 不支持 prepared statements
├─ 不支持 LISTEN/NOTIFY
└─ 需要 prepare: false 配置

如果用 Supabase Edge Functions：
├─ 使用 Transaction Pooler
└─ 用 Supabase Client SDK 而非 Drizzle
```

---

## 附录 M：前端 Supabase 集成参考

### M.1 React + Supabase Auth

```typescript
// frontend/src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

```tsx
// frontend/src/components/Login.tsx
import { supabase } from "../lib/supabase";

export function Login() {
  const handleLogin = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    // 登录成功，token 自动存储在 localStorage
    console.log("登录成功:", data.user);
  };

  const handleSignUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: "hr_recruiter", // 自定义 metadata
        },
      },
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("注册成功！请查收确认邮件");
  };

  // ... JSX
}
```

### M.2 前端带 Token 调用后端 API

```typescript
// frontend/src/lib/api.ts
import { supabase } from "./supabase";

async function fetchWithAuth(path: string, options?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("未登录");
  }

  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "请求失败");
  }

  return res.json();
}

// 使用：
export const api = {
  getPositions: () => fetchWithAuth("/api/positions"),
  getCandidates: (positionId?: number) =>
    fetchWithAuth(`/api/candidates${positionId ? `?positionId=${positionId}` : ""}`),
  getCandidate: (id: number) => fetchWithAuth(`/api/candidates/${id}`),
  updateCandidate: (id: number, data: { status?: string; notes?: string }) =>
    fetchWithAuth(`/api/candidates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  uploadResume: async (file: File, positionId: number, name: string, email: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("positionId", positionId.toString());
    formData.append("candidateName", name);
    formData.append("candidateEmail", email);

    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/resumes/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session!.access_token}`,
      },
      body: formData,
    });

    return res.json();
  },
};
```

### M.3 Realtime 候选人状态监听

```tsx
// frontend/src/hooks/useCandidateUpdates.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface CandidateUpdate {
  id: number;
  name: string;
  status: string;
  updatedAt: string;
}

export function useCandidateUpdates(positionId: number) {
  const [updates, setUpdates] = useState<CandidateUpdate[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`candidates-${positionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "candidates",
          filter: `position_id=eq.${positionId}`,
        },
        (payload) => {
          const update: CandidateUpdate = {
            id: payload.new.id,
            name: payload.new.name,
            status: payload.new.status,
            updatedAt: payload.new.updated_at,
          };
          setUpdates((prev) => [update, ...prev.slice(0, 49)]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "candidates",
          filter: `position_id=eq.${positionId}`,
        },
        (payload) => {
          const update: CandidateUpdate = {
            id: payload.new.id,
            name: payload.new.name,
            status: payload.new.status,
            updatedAt: payload.new.created_at,
          };
          setUpdates((prev) => [update, ...prev.slice(0, 49)]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [positionId]);

  return updates;
}
```

---

## 附录 N：Supabase + Elysia 完整集成示例

### N.1 package.json 新增依赖

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

```bash
bun add @supabase/supabase-js
```

### N.2 env.ts 新增 Supabase 变量

```typescript
// src/env.ts — 完整版（含 Supabase）
import { z } from "zod/v4";

const envSchema = z.object({
  // 数据库
  DATABASE_URL: z.string().url(),

  // AI
  MINIMAX_API_KEY: z.string().min(1),

  // 邮件（IMAP 收件）
  IMAP_HOST: z.string().default("mail.ivis-sh.com"),
  IMAP_PORT: z.coerce.number().default(143),
  IMAP_USER: z.string().default("hr@ivis-sh.com"),
  IMAP_PASS: z.string(),

  // 邮件（SMTP 发件）
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Supabase（可选 — 渐进式集成）
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // 服务器
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const env = envSchema.parse(process.env);
```

### N.3 条件性 Supabase 初始化

```typescript
// src/lib/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";

let _supabaseAdmin: SupabaseClient | null = null;

/** 管理客户端（绕过 RLS） — 仅在配置了 Supabase 时可用 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase 未配置（缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY）");
    }
    _supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabaseAdmin;
}

/** 检查 Supabase 是否已配置 */
export function isSupabaseConfigured(): boolean {
  return !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

/** 用户客户端（遵守 RLS） */
export function createUserClient(accessToken: string): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error("Supabase 未配置");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
```

### N.4 渐进式集成：认证中间件

```typescript
// src/middleware/auth.ts
import { Elysia } from "elysia";
import { isSupabaseConfigured, getSupabaseAdmin } from "../lib/supabase.js";

/**
 * 认证中间件 — 渐进式设计
 * - 如果配置了 Supabase：验证 JWT
 * - 如果未配置：跳过认证（开发模式）
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  // 未配置 Supabase → 跳过认证
  if (!isSupabaseConfigured()) {
    c.set("user", { id: "dev-user", email: "dev@localhost", role: "admin" });
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("user", {
    id: user.id,
    email: user.email,
    role: user.app_metadata?.role || "viewer",
  });

  await next();
});

/** 角色检查中间件 */
export const requireRole = (...roles: string[]) =>
  createMiddleware(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Not authenticated" }, 401);

    if (!roles.includes(user.role)) {
      return c.json({ error: "Insufficient permissions", required: roles }, 403);
    }

    await next();
  });
```

### N.5 在路由中使用

```typescript
// src/index.ts — 集成认证
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { authMiddleware, requireRole } from "./middleware/auth.js";
import healthRoutes from "./routes/health.js";
import positionsRoutes from "./routes/positions.js";
import candidatesRoutes from "./routes/candidates.js";
import resumesRoutes from "./routes/resumes.js";

const app = new Elysia();

// 全局中间件
app.use("/*", cors());

// 公开路由（无需认证）
app.route("/", healthRoutes);

// 需要认证的路由
app.use("/api/*", authMiddleware);
app.route("/", positionsRoutes);
app.route("/", candidatesRoutes);
app.route("/", resumesRoutes);

// 管理路由（仅 admin/hr_manager）
// app.use("/api/admin/*", requireRole("admin", "hr_manager"));

export default app;
```

---

## 附录 O：跨文档参考索引

```
本文档与其他研究文档的关联：

Supabase + Agent/MCP（→ 02-agents-skills-mcp.md）
├─ Supabase Realtime + Agent 通知 → 本文档附录 F + 02 附录 J
├─ RLS + Agent 操作权限 → 本文档附录 H
├─ Edge Functions + MCP → 本文档附录 G + 02 附录 D
└─ Supabase Auth + Agent 认证 → 本文档附录 N

Supabase + CI/CD（→ 03-cicd-testing.md）
├─ 测试环境 Supabase 配置 → 本文档附录 I + 03 附录 H
├─ CI 中运行迁移 → 03 附录 H
└─ RLS 策略测试 → 本文档附录 H + 03 附录 G

Supabase + LangChain/AI（→ 04-langchain-role.md）
├─ Supabase pgvector vs 直连 → 本文档正文 + 04 附录 I
├─ Edge Functions + AI 评分 → 本文档附录 G
└─ 评分结果存储策略 → 04 附录 K

Supabase + Docker（→ 06-docker-deployment.md）
├─ Supabase 自托管 Docker → 本文档附录 J
├─ PostgreSQL 容器配置 → 06 附录 L
└─ 开发/生产环境切换 → 06 附录 L + 本文档附录 I

Supabase + AI 工具（→ 05-ai-dev-tools.md）
├─ CLAUDE.md 中 Supabase 约定 → 05 附录 A
├─ Claude Code 生成迁移 → 05 附录 K
└─ MCP + Supabase 数据查询 → 05 附录 E
```

---

## 附录 P：数据迁移策略

### P.1 从自托管迁移到 Supabase

```bash
#!/bin/bash
# scripts/migrate-to-supabase.sh — 数据迁移脚本

set -euo pipefail

SOURCE_DB="${1:?用法: $0 <source_db_url> <target_db_url>}"
TARGET_DB="${2:?用法: $0 <source_db_url> <target_db_url>}"

echo "=== 迁移到 Supabase ==="
echo "源: $SOURCE_DB"
echo "目标: $TARGET_DB"

# 1. 导出源数据（排除系统表）
echo "导出数据..."
pg_dump "$SOURCE_DB" \
  --no-owner \
  --no-acl \
  --data-only \
  --exclude-table='_*' \
  --exclude-table='supabase_*' \
  > /tmp/hr_data_export.sql

# 2. 检查 Supabase 目标 schema 是否就绪
echo "检查目标 schema..."
psql "$TARGET_DB" -c "SELECT count(*) FROM positions" 2>/dev/null || {
  echo "目标 schema 不存在，先运行迁移..."
  # 在 Supabase 中运行 Drizzle 迁移
  DATABASE_URL="$TARGET_DB" bun db:migrate
}

# 3. 导入数据
echo "导入数据..."
psql "$TARGET_DB" < /tmp/hr_data_export.sql

# 4. 重置序列
echo "重置序列..."
psql "$TARGET_DB" << 'SQL'
SELECT setval('positions_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM positions));
SELECT setval('candidates_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM candidates));
SELECT setval('resumes_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM resumes));
SELECT setval('scores_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM scores));
SQL

# 5. 验证
echo "验证迁移..."
SRC_COUNT=$(psql "$SOURCE_DB" -tAc "SELECT count(*) FROM candidates")
TGT_COUNT=$(psql "$TARGET_DB" -tAc "SELECT count(*) FROM candidates")

echo "源候选人数: $SRC_COUNT"
echo "目标候选人数: $TGT_COUNT"

if [ "$SRC_COUNT" = "$TGT_COUNT" ]; then
  echo "✅ 迁移成功！"
else
  echo "❌ 数量不匹配，请检查"
  exit 1
fi

# 清理
rm /tmp/hr_data_export.sql
```

### P.2 回滚方案

```bash
# 如果迁移后发现问题，快速回滚

# 1. 切换 DATABASE_URL 回自托管
# .env.production:
# DATABASE_URL=postgresql://postgres:pass@localhost:5432/hr_screening

# 2. 重启应用
docker compose restart app

# 3. 数据双写期间（可选的过渡方案）：
# 写入操作同时写两个数据库
# 读取操作从新库读
# 确认稳定后关闭旧库
```

### P.3 简历文件迁移到 Supabase Storage

```typescript
// scripts/migrate-files-to-storage.ts
// 将本地/数据库中的简历文件迁移到 Supabase Storage

import { createClient } from "@supabase/supabase-js";
import { db } from "../src/db/index.js";
import { resumes } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrateFiles() {
  // 获取所有有文件数据的简历
  const allResumes = await db
    .select()
    .from(resumes);

  console.log(`共 ${allResumes.length} 个简历需要迁移`);

  let migrated = 0;
  let failed = 0;

  for (const resume of allResumes) {
    try {
      if (!resume.fileData) continue; // 跳过无文件的记录

      const path = `candidates/${resume.candidateId}/${resume.fileName}`;

      // 上传到 Supabase Storage
      const { error } = await supabase.storage
        .from("resumes")
        .upload(path, resume.fileData, {
          contentType: resume.mimeType || "application/pdf",
          upsert: true,
        });

      if (error) throw error;

      // 获取公开 URL
      const { data } = supabase.storage.from("resumes").getPublicUrl(path);

      // 更新数据库记录（添加 storage URL，可选清除 fileData）
      // await db.update(resumes)
      //   .set({ storageUrl: data.publicUrl })
      //   .where(eq(resumes.id, resume.id));

      migrated++;
      if (migrated % 10 === 0) {
        console.log(`进度: ${migrated}/${allResumes.length}`);
      }
    } catch (error) {
      failed++;
      console.error(`迁移失败 (ID: ${resume.id}):`, (error as Error).message);
    }
  }

  console.log(`迁移完成: 成功 ${migrated}, 失败 ${failed}`);
}

migrateFiles();
```

---

## 附录 P: Supabase Storage 深度集成

### P.1 Storage 架构设计

```
HR 项目文件存储架构:

resumes/                        # 简历 Bucket
├── {candidate_id}/
│   ├── original/               # 原始简历文件
│   │   ├── resume_20260227.pdf
│   │   └── resume_20260115.docx
│   └── parsed/                 # 解析后的文本
│       └── resume_20260227.txt
│
avatars/                        # 头像 Bucket（可选）
├── {candidate_id}/
│   └── photo.jpg
│
exports/                        # 导出文件 Bucket
├── reports/
│   ├── weekly_20260227.xlsx
│   └── monthly_202602.xlsx
└── scorecards/
    └── {candidate_id}_scorecard.pdf

Bucket 配置:
- resumes: 私有，仅认证用户访问，最大 10MB
- avatars: 公共读，最大 2MB
- exports: 私有，仅管理员访问，最大 50MB
```

### P.2 Storage 策略配置

```sql
-- Supabase Storage RLS Policies

-- 1. 简历 Bucket 策略
-- 仅 HR 相关角色可以上传简历
CREATE POLICY "HR roles can upload resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND auth.jwt() ->> 'role' IN ('admin', 'hr_manager', 'hr_recruiter')
);

-- HR 角色可以查看所有简历
CREATE POLICY "HR roles can view resumes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND auth.jwt() ->> 'role' IN ('admin', 'hr_manager', 'hr_recruiter', 'interviewer')
);

-- 仅管理员可以删除简历
CREATE POLICY "Only admin can delete resumes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'resumes'
  AND auth.jwt() ->> 'role' = 'admin'
);

-- 2. 导出文件 Bucket 策略
CREATE POLICY "Admin can manage exports"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'exports'
  AND auth.jwt() ->> 'role' IN ('admin', 'hr_manager')
)
WITH CHECK (
  bucket_id = 'exports'
  AND auth.jwt() ->> 'role' IN ('admin', 'hr_manager')
);
```

### P.3 文件上传服务

```typescript
// src/services/storage.ts
// Supabase Storage 文件上传服务

import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase.js";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, dirname } from "path";

// 文件存储抽象接口
interface StorageProvider {
  upload(bucket: string, path: string, data: Buffer, contentType: string): Promise<string>;
  download(bucket: string, path: string): Promise<Buffer>;
  delete(bucket: string, path: string): Promise<void>;
  getUrl(bucket: string, path: string): string;
}

// Supabase Storage 实现
class SupabaseStorage implements StorageProvider {
  async upload(
    bucket: string,
    path: string,
    data: Buffer,
    contentType: string
  ): Promise<string> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, data, { contentType, upsert: true });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    return this.getUrl(bucket, path);
  }

  async download(bucket: string, path: string): Promise<Buffer> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error) throw new Error(`Storage download failed: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(bucket: string, path: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) throw new Error(`Storage delete failed: ${error.message}`);
  }

  getUrl(bucket: string, path: string): string {
    const supabase = getSupabaseAdmin();
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}

// 本地文件系统实现（开发环境/无 Supabase 时使用）
class LocalStorage implements StorageProvider {
  private baseDir: string;

  constructor(baseDir: string = "./storage") {
    this.baseDir = baseDir;
  }

  async upload(
    bucket: string,
    path: string,
    data: Buffer,
    _contentType: string
  ): Promise<string> {
    const fullPath = join(this.baseDir, bucket, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return this.getUrl(bucket, path);
  }

  async download(bucket: string, path: string): Promise<Buffer> {
    const fullPath = join(this.baseDir, bucket, path);
    return readFile(fullPath);
  }

  async delete(bucket: string, path: string): Promise<void> {
    const fullPath = join(this.baseDir, bucket, path);
    await unlink(fullPath).catch(() => {});
  }

  getUrl(bucket: string, path: string): string {
    return `/storage/${bucket}/${path}`;
  }
}

// 工厂函数：根据配置选择存储后端
let storageInstance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!storageInstance) {
    storageInstance = isSupabaseConfigured()
      ? new SupabaseStorage()
      : new LocalStorage();
  }
  return storageInstance;
}

// 简历上传辅助函数
export async function uploadResume(
  candidateId: number,
  fileName: string,
  fileData: Buffer,
  contentType: string
): Promise<string> {
  const storage = getStorage();
  const path = `${candidateId}/original/${fileName}`;

  const url = await storage.upload("resumes", path, fileData, contentType);
  return url;
}

// 简历下载
export async function downloadResume(
  candidateId: number,
  fileName: string
): Promise<Buffer> {
  const storage = getStorage();
  const path = `${candidateId}/original/${fileName}`;

  return storage.download("resumes", path);
}
```

### P.4 文件上传路由增强

```typescript
// src/routes/resumes.ts（Storage 增强版）
// 支持 Supabase Storage 的简历上传路由

import { Elysia } from "elysia";
import { uploadResume } from "../services/storage.js";
import { parseResume } from "../services/resume-parser.js";
import { scoreResumeWithCache } from "../services/ai-scorer.js";
import { db } from "../db/index.js";
import { resumes, candidates, scores } from "../db/schema.js";

const resumeRoutes = new Elysia();

resumeRoutes.post("/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const positionId = formData.get("positionId") as string | null;

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  // 验证文件类型
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (!allowedTypes.includes(file.type)) {
    return c.json(
      { error: "Only PDF and DOCX files are allowed" },
      400
    );
  }

  // 验证文件大小（10MB）
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: "File size exceeds 10MB limit" }, 400);
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  // 1. 解析简历文本
  const rawText = await parseResume(fileBuffer, file.type);
  if (!rawText || rawText.trim().length < 50) {
    return c.json({ error: "Could not extract text from resume" }, 400);
  }

  // 2. 创建候选人记录
  const [candidate] = await db
    .insert(candidates)
    .values({
      name: "待解析", // AI 会在评分时提取
      source: "upload",
      status: "new",
    })
    .returning();

  // 3. 上传文件到 Storage
  const storageUrl = await uploadResume(
    candidate.id,
    file.name,
    fileBuffer,
    file.type
  );

  // 4. 保存简历记录
  const [resume] = await db
    .insert(resumes)
    .values({
      candidateId: candidate.id,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      rawText,
      storageUrl,
    })
    .returning();

  // 5. 如果指定了职位，触发 AI 评分
  let scoreResult = null;
  if (positionId) {
    const position = await db.query.positions.findFirst({
      where: (p, { eq }) => eq(p.id, Number(positionId)),
    });

    if (position) {
      scoreResult = await scoreResumeWithCache(rawText, {
        title: position.title,
        mustHave: (position.mustHaveSkills as string[]) || [],
        niceToHave: (position.niceToHaveSkills as string[]) || [],
        reject: (position.rejectCriteria as string[]) || [],
      });

      // 保存评分到数据库
      await db.insert(scores).values({
        candidateId: candidate.id,
        positionId: position.id,
        totalScore: scoreResult.totalScore,
        grade: scoreResult.grade,
        mustScore: scoreResult.mustScore,
        niceScore: scoreResult.niceScore,
        matchedSkills: scoreResult.matchedSkills,
        missingSkills: scoreResult.missingSkills,
        explanation: scoreResult.explanation,
      });
    }
  }

  return c.json({
    candidate: { id: candidate.id },
    resume: { id: resume.id, storageUrl },
    score: scoreResult
      ? {
          totalScore: scoreResult.totalScore,
          grade: scoreResult.grade,
          cached: scoreResult._meta.cached,
        }
      : null,
  });
});

export default resumeRoutes;
```

### P.5 Signed URL 安全访问

```typescript
// src/services/storage-url.ts
// 生成带时效的签名 URL（Supabase Storage 私有文件）

import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase.js";

interface SignedUrlOptions {
  expiresIn?: number; // 秒，默认 3600 (1小时)
  download?: boolean; // 是否强制下载
  transform?: {
    width?: number;
    height?: number;
    quality?: number;
  };
}

export async function getSignedUrl(
  bucket: string,
  path: string,
  options: SignedUrlOptions = {}
): Promise<string> {
  if (!isSupabaseConfigured()) {
    // 本地开发直接返回路径
    return `/storage/${bucket}/${path}`;
  }

  const supabase = getSupabaseAdmin();
  const expiresIn = options.expiresIn || 3600;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, {
      download: options.download,
      transform: options.transform,
    });

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

// 批量生成签名 URL
export async function getSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn: number = 3600
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();

  if (!isSupabaseConfigured()) {
    for (const path of paths) {
      urlMap.set(path, `/storage/${bucket}/${path}`);
    }
    return urlMap;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresIn);

  if (error) {
    throw new Error(`Failed to create signed URLs: ${error.message}`);
  }

  for (const item of data || []) {
    if (item.signedUrl && item.path) {
      urlMap.set(item.path, item.signedUrl);
    }
  }

  return urlMap;
}
```

### P.6 Storage 事件监听（Webhooks）

```typescript
// src/routes/webhooks/storage.ts
// Supabase Storage Webhook: 文件上传完成后自动触发处理

import { Elysia } from "elysia";

const storageWebhook = new Elysia();

interface StorageEvent {
  type: "ObjectCreated" | "ObjectRemoved";
  record: {
    id: string;
    bucket_id: string;
    name: string;         // 文件路径
    owner: string;        // 上传者 UUID
    created_at: string;
    updated_at: string;
    metadata: {
      size: number;
      mimetype: string;
    };
  };
}

storageWebhook.post("/storage-event", async (c) => {
  const event = await c.req.json<StorageEvent>();

  // 仅处理简历 Bucket 的新文件
  if (
    event.type === "ObjectCreated" &&
    event.record.bucket_id === "resumes" &&
    event.record.name.includes("/original/")
  ) {
    console.log(`New resume uploaded: ${event.record.name}`);

    // 提取 candidateId
    const candidateId = event.record.name.split("/")[0];

    // 触发异步处理（解析 + 评分）
    // 可以放入队列或直接处理
    // await processNewResume(Number(candidateId), event.record.name);

    return c.json({ processed: true });
  }

  return c.json({ processed: false });
});

export default storageWebhook;
```

---

## 附录 Q: Supabase Realtime 实时通知

### Q.1 实时通知场景

```
HR 系统需要实时通知的场景:

1. 新简历到达
   - 邮箱收到新简历 → 通知 HR 界面刷新候选人列表
   - 评分完成 → 通知 HR 查看评分结果

2. 候选人状态变更
   - 候选人从"新建"变为"面试中" → 通知面试官
   - 候选人被拒绝/录用 → 通知相关人员

3. 评分进度
   - 批量评分进度 → 实时更新进度条
   - 单个评分开始/完成 → 状态变更通知

4. 多用户协作
   - HR A 正在查看候选人 → HR B 看到"正在查看"标记
   - 有人添加备注 → 其他人实时看到
```

### Q.2 后端 Realtime 触发

```typescript
// src/services/realtime.ts
// Supabase Realtime 事件触发（后端 → 前端通知）

import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase.js";

type RealtimeChannel =
  | "candidates"
  | "scores"
  | "positions"
  | "system";

interface RealtimeEvent {
  channel: RealtimeChannel;
  event: string;
  payload: Record<string, unknown>;
}

// 使用 Supabase Realtime Broadcast 发送自定义事件
export async function broadcastEvent(event: RealtimeEvent): Promise<void> {
  if (!isSupabaseConfigured()) {
    // 开发环境：仅打印日志
    console.log(`[Realtime] ${event.channel}:${event.event}`, event.payload);
    return;
  }

  const supabase = getSupabaseAdmin();
  const channel = supabase.channel(event.channel);

  await channel.send({
    type: "broadcast",
    event: event.event,
    payload: event.payload,
  });

  // 发送后取消订阅（后端不需要监听）
  supabase.removeChannel(channel);
}

// 预定义事件
export const RealtimeEvents = {
  // 新候选人创建
  candidateCreated: (candidateId: number, name: string) =>
    broadcastEvent({
      channel: "candidates",
      event: "created",
      payload: { candidateId, name, timestamp: Date.now() },
    }),

  // 评分完成
  scoreCompleted: (
    candidateId: number,
    positionId: number,
    grade: string,
    score: number
  ) =>
    broadcastEvent({
      channel: "scores",
      event: "completed",
      payload: { candidateId, positionId, grade, score, timestamp: Date.now() },
    }),

  // 候选人状态变更
  candidateStatusChanged: (
    candidateId: number,
    oldStatus: string,
    newStatus: string,
    changedBy: string
  ) =>
    broadcastEvent({
      channel: "candidates",
      event: "status_changed",
      payload: {
        candidateId,
        oldStatus,
        newStatus,
        changedBy,
        timestamp: Date.now(),
      },
    }),

  // 批量评分进度
  batchProgress: (
    batchId: string,
    completed: number,
    total: number
  ) =>
    broadcastEvent({
      channel: "scores",
      event: "batch_progress",
      payload: { batchId, completed, total, timestamp: Date.now() },
    }),

  // 系统通知
  systemNotification: (message: string, level: "info" | "warning" | "error") =>
    broadcastEvent({
      channel: "system",
      event: "notification",
      payload: { message, level, timestamp: Date.now() },
    }),
};
```

### Q.3 前端 Realtime 订阅

```typescript
// 前端示例: src/hooks/useRealtimeScores.ts
// React Hook: 实时监听评分结果

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface ScoreEvent {
  candidateId: number;
  positionId: number;
  grade: string;
  score: number;
  timestamp: number;
}

export function useRealtimeScores(positionId?: number) {
  const [latestScore, setLatestScore] = useState<ScoreEvent | null>(null);
  const [scoreCount, setScoreCount] = useState(0);

  useEffect(() => {
    const channel = supabase
      .channel("scores")
      .on("broadcast", { event: "completed" }, (payload) => {
        const score = payload.payload as ScoreEvent;

        // 如果指定了 positionId，仅接收该职位的评分
        if (positionId && score.positionId !== positionId) return;

        setLatestScore(score);
        setScoreCount((prev) => prev + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [positionId]);

  const reset = useCallback(() => {
    setLatestScore(null);
    setScoreCount(0);
  }, []);

  return { latestScore, scoreCount, reset };
}

// 使用示例:
// function CandidateList({ positionId }) {
//   const { latestScore, scoreCount } = useRealtimeScores(positionId);
//
//   useEffect(() => {
//     if (latestScore) {
//       // 刷新候选人列表
//       refetchCandidates();
//       toast.success(`新评分: ${latestScore.grade} (${latestScore.score}分)`);
//     }
//   }, [latestScore]);
// }
```

### Q.4 数据库变更监听 (Postgres Changes)

```typescript
// 前端示例: 监听数据库表变更
// 需要 Supabase RLS 策略允许用户访问

import { useEffect, useState } from "react";
import { createClient, type RealtimePostgresChangesPayload } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

type CandidateRow = {
  id: number;
  name: string;
  status: string;
  updated_at: string;
};

export function useCandidateChanges() {
  const [changes, setChanges] = useState<
    RealtimePostgresChangesPayload<CandidateRow>[]
  >([]);

  useEffect(() => {
    const channel = supabase
      .channel("candidate-changes")
      // INSERT 事件
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "candidates" },
        (payload) => {
          console.log("New candidate:", payload.new);
          setChanges((prev) => [...prev, payload]);
        }
      )
      // UPDATE 事件（仅 status 变更）
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "candidates",
          filter: "status=neq.new",
        },
        (payload) => {
          console.log("Candidate updated:", payload.new);
          setChanges((prev) => [...prev, payload]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return changes;
}

/*
注意事项:
1. Postgres Changes 需要在 Supabase Dashboard 启用 Realtime
   - 打开 Database → Replication
   - 为 candidates, scores 表启用 Realtime

2. 需要 RLS 策略允许用户 SELECT 相应表
   否则即使订阅了也收不到事件

3. 生产环境建议:
   - 使用 Broadcast 而非 Postgres Changes（性能更好）
   - 后端控制广播内容（安全性更好）
   - Postgres Changes 适合原型开发和管理后台
*/
```

### Q.5 Presence 在线状态（可选）

```typescript
// 前端示例: 显示当前在线的 HR 成员
// 使用 Supabase Realtime Presence

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface UserPresence {
  id: string;
  name: string;
  role: string;
  currentView?: string; // 当前查看的页面/候选人
  onlineAt: string;
}

export function usePresence(userId: string, userName: string, role: string) {
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);

  useEffect(() => {
    const channel = supabase.channel("hr-presence", {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<UserPresence>();
        const users: UserPresence[] = [];

        for (const presences of Object.values(state)) {
          for (const presence of presences) {
            users.push(presence);
          }
        }

        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            id: userId,
            name: userName,
            role,
            onlineAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [userId, userName, role]);

  // 更新当前查看的内容
  const updateView = async (currentView: string) => {
    const channel = supabase.channel("hr-presence");
    await channel.track({
      id: userId,
      name: userName,
      role,
      currentView,
      onlineAt: new Date().toISOString(),
    });
  };

  return { onlineUsers, updateView };
}

// 使用:
// function Header() {
//   const { onlineUsers } = usePresence(user.id, user.name, user.role);
//   return (
//     <div>
//       在线: {onlineUsers.map(u => u.name).join(", ")}
//     </div>
//   );
// }
```

---

## 附录 R: Supabase Edge Functions 集成

### R.1 Edge Functions 概述

```
Supabase Edge Functions 是基于 Deno 的 serverless 函数:

适用场景:
1. Webhook 处理（邮件通知、第三方回调）
2. 定时任务（Cron）
3. 数据转换和聚合
4. 第三方 API 代理（隐藏 API Key）

HR 项目中的用途:
- 接收邮件解析 Webhook
- 定时统计报告生成
- 候选人数据同步
- AI API 代理（限流 + 缓存）

注意: Edge Functions 使用 Deno 运行时，不是 Bun
  - import 用 URL 或 jsr:
  - 不支持 node_modules
  - 但可以使用 npm: 前缀导入 npm 包
```

### R.2 定时报告 Edge Function

```typescript
// supabase/functions/weekly-report/index.ts
// 每周自动生成招聘报告

import { createClient } from "jsr:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // 获取本周数据
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // 新候选人数
    const { count: newCandidates } = await supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneWeekAgo.toISOString());

    // 评分完成数
    const { count: scoredCount } = await supabase
      .from("scores")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneWeekAgo.toISOString());

    // 等级分布
    const { data: gradeData } = await supabase
      .from("scores")
      .select("grade")
      .gte("created_at", oneWeekAgo.toISOString());

    const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const row of gradeData || []) {
      gradeDistribution[row.grade] = (gradeDistribution[row.grade] || 0) + 1;
    }

    // 状态变更统计
    const { data: statusData } = await supabase
      .from("candidates")
      .select("status")
      .gte("updated_at", oneWeekAgo.toISOString());

    const statusCounts: Record<string, number> = {};
    for (const row of statusData || []) {
      statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    }

    const report = {
      period: {
        from: oneWeekAgo.toISOString().split("T")[0],
        to: new Date().toISOString().split("T")[0],
      },
      summary: {
        newCandidates: newCandidates || 0,
        scoredResumes: scoredCount || 0,
        gradeDistribution,
        statusChanges: statusCounts,
      },
      generatedAt: new Date().toISOString(),
    };

    // 保存报告（可选）
    // await supabase.storage
    //   .from("exports")
    //   .upload(`reports/weekly_${report.period.to}.json`, JSON.stringify(report));

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
```

### R.3 AI API 代理 Edge Function

```typescript
// supabase/functions/ai-proxy/index.ts
// AI API 代理: 在 Edge Function 中调用 MiniMax，隐藏 API Key

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY");
const MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";

// 简易限流器
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // 每分钟 10 次
const RATE_WINDOW = 60000; // 1 分钟

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(clientId);

  if (!record || now > record.resetAt) {
    requestCounts.set(clientId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // 验证 Supabase Auth
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  // 限流检查
  const clientId = authHeader.slice(0, 20); // 简易标识
  if (!checkRateLimit(clientId)) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again in 1 minute." }),
      { status: 429 }
    );
  }

  try {
    const body = await req.json();

    // 转发请求到 MiniMax
    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: body.model || "MiniMax-M2.5",
        messages: body.messages,
        max_tokens: Math.min(body.max_tokens || 2000, 4000), // 限制最大 token
        temperature: body.temperature || 0.1,
      }),
    });

    const result = await response.json();

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### R.4 邮件 Webhook Edge Function

```typescript
// supabase/functions/email-webhook/index.ts
// 接收邮件解析服务的 Webhook 通知

import { createClient } from "jsr:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

// Webhook 签名验证
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  const data = encoder.encode(payload);

  // HMAC-SHA256 验证
  // 简化版本，生产环境应使用 crypto.subtle
  return signature.length > 0; // 占位
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "";
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") || "";

  // 验证签名
  if (webhookSecret && !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // 处理新邮件通知
    if (event.type === "new_email") {
      const {
        from,
        subject,
        body: emailBody,
        attachments,
      } = event.data;

      console.log(`New email from: ${from}, subject: ${subject}`);

      // 检查是否有简历附件
      const resumeAttachments = (attachments || []).filter(
        (a: any) =>
          a.contentType === "application/pdf" ||
          a.contentType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      if (resumeAttachments.length === 0) {
        console.log("No resume attachments found, skipping");
        return new Response(JSON.stringify({ processed: false, reason: "no_resume" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // 通知后端 API 处理新简历
      const backendUrl = Deno.env.get("BACKEND_URL") || "http://localhost:3001";
      const backendApiKey = Deno.env.get("BACKEND_API_KEY") || "";

      for (const attachment of resumeAttachments) {
        await fetch(`${backendUrl}/api/internal/process-email-resume`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": backendApiKey,
          },
          body: JSON.stringify({
            senderEmail: from,
            subject,
            fileName: attachment.filename,
            fileUrl: attachment.url, // 附件下载 URL
            contentType: attachment.contentType,
          }),
        });
      }

      return new Response(
        JSON.stringify({
          processed: true,
          resumeCount: resumeAttachments.length,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ processed: false }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### R.5 Edge Function 部署与测试

```bash
# Supabase Edge Functions 部署流程

# 1. 本地开发测试
supabase functions serve weekly-report --env-file .env.local

# 测试调用
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/weekly-report' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json'

# 2. 部署到 Supabase（云端）
supabase functions deploy weekly-report
supabase functions deploy ai-proxy
supabase functions deploy email-webhook

# 3. 设置 secrets
supabase secrets set MINIMAX_API_KEY=your-key
supabase secrets set WEBHOOK_SECRET=your-secret
supabase secrets set BACKEND_URL=https://hr-api.ivis-sh.com
supabase secrets set BACKEND_API_KEY=your-internal-key

# 4. 设置定时触发（使用 pg_cron）
# 在 Supabase SQL Editor 中执行:
# SELECT cron.schedule(
#   'weekly-hr-report',
#   '0 9 * * 1',  -- 每周一早上9点
#   $$
#   SELECT net.http_post(
#     url := 'https://YOUR_PROJECT.supabase.co/functions/v1/weekly-report',
#     headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
#   );
#   $$
# );

# 5. 自托管 Supabase 的 Edge Functions
# 需要 Edge Runtime (Deno-based)
# docker pull supabase/edge-runtime
# 详见 docs/research/01 附录 I (自托管)
```

---

## 附录 S: Supabase Auth 多租户模式

### S.1 HR 系统角色架构

```
HR 系统角色体系:

角色            │ 权限                              │ 数据访问范围
────────────────┼───────────────────────────────────┼────────────────
admin           │ 全部权限                          │ 所有数据
hr_manager      │ CRUD 职位/候选人 + 查看报告       │ 所属部门数据
hr_recruiter    │ 上传简历 + 查看评分 + 修改状态    │ 所属职位数据
interviewer     │ 查看候选人 + 添加面试反馈         │ 分配的候选人
viewer          │ 只读查看                          │ 部分数据

角色在 Supabase 中的存储:
- user_metadata: 基础信息（姓名、头像）
- app_metadata.role: 角色标识（由管理员设置，用户无法自行修改）
- app_metadata.department: 所属部门

JWT Token 中包含:
{
  "sub": "user-uuid",
  "email": "hr@ivis-sh.com",
  "role": "hr_manager",
  "app_metadata": {
    "role": "hr_manager",
    "department": "technology"
  }
}
```

### S.2 用户管理服务

```typescript
// src/services/user-management.ts
// Supabase Auth 用户管理

import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase.js";

type UserRole = "admin" | "hr_manager" | "hr_recruiter" | "interviewer" | "viewer";

interface CreateUserParams {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  department?: string;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string;
  createdAt: string;
  lastSignIn: string | null;
}

// 创建用户（仅管理员）
export async function createUser(params: CreateUserParams): Promise<UserProfile> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true, // 跳过邮件确认
    user_metadata: {
      name: params.name,
    },
    app_metadata: {
      role: params.role,
      department: params.department,
    },
  });

  if (error) throw new Error(`Failed to create user: ${error.message}`);

  return {
    id: data.user.id,
    email: data.user.email || "",
    name: params.name,
    role: params.role,
    department: params.department,
    createdAt: data.user.created_at,
    lastSignIn: data.user.last_sign_in_at,
  };
}

// 更新用户角色
export async function updateUserRole(
  userId: string,
  role: UserRole,
  department?: string
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      role,
      ...(department !== undefined && { department }),
    },
  });

  if (error) throw new Error(`Failed to update user role: ${error.message}`);
}

// 列出所有用户
export async function listUsers(): Promise<UserProfile[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) throw new Error(`Failed to list users: ${error.message}`);

  return data.users.map((user) => ({
    id: user.id,
    email: user.email || "",
    name: user.user_metadata?.name || "",
    role: user.app_metadata?.role || "viewer",
    department: user.app_metadata?.department,
    createdAt: user.created_at,
    lastSignIn: user.last_sign_in_at,
  }));
}

// 停用用户
export async function disableUser(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: "876000h", // ~100 years
  });

  if (error) throw new Error(`Failed to disable user: ${error.message}`);
}

// 删除用户
export async function deleteUser(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) throw new Error(`Failed to delete user: ${error.message}`);
}
```

### S.3 RBAC 中间件

```typescript
// src/middleware/rbac.ts
// 基于角色的访问控制中间件

import { Elysia } from "elysia";
import type { Context } from "elysia";

type UserRole = "admin" | "hr_manager" | "hr_recruiter" | "interviewer" | "viewer";

// 角色权限矩阵
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ["*"], // 全部权限
  hr_manager: [
    "positions:read",
    "positions:write",
    "candidates:read",
    "candidates:write",
    "scores:read",
    "resumes:read",
    "resumes:upload",
    "reports:read",
    "users:read",
  ],
  hr_recruiter: [
    "positions:read",
    "candidates:read",
    "candidates:write",
    "scores:read",
    "resumes:read",
    "resumes:upload",
  ],
  interviewer: [
    "positions:read",
    "candidates:read",
    "scores:read",
    "interviews:read",
    "interviews:write",
  ],
  viewer: [
    "positions:read",
    "candidates:read",
    "scores:read",
  ],
};

function hasPermission(role: UserRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

// 中间件工厂: 检查指定权限
export function requirePermission(permission: string) {
  return createMiddleware(async (c, next) => {
    const user = c.get("user") as {
      id: string;
      email: string;
      role: UserRole;
    } | undefined;

    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!hasPermission(user.role, permission)) {
      return c.json(
        {
          error: "Forbidden",
          message: `Role '${user.role}' does not have '${permission}' permission`,
        },
        403
      );
    }

    await next();
  });
}

// 快捷中间件
export const requireAdmin = requirePermission("*");
export const requirePositionWrite = requirePermission("positions:write");
export const requireResumeUpload = requirePermission("resumes:upload");
export const requireCandidateWrite = requirePermission("candidates:write");

// 路由使用示例:
// positions.post("/", requirePositionWrite, async (c) => { ... });
// resumes.post("/upload", requireResumeUpload, async (c) => { ... });
// admin.delete("/users/:id", requireAdmin, async (c) => { ... });
```

### S.4 Supabase 审计日志

```sql
-- Supabase 审计日志表和触发器

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,         -- INSERT, UPDATE, DELETE
  table_name TEXT NOT NULL,
  record_id INTEGER,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_table ON audit_logs(table_name);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- 通用审计触发器函数
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- 获取当前认证用户 ID
  current_user_id := auth.uid();

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (current_user_id, 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (current_user_id, 'UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data)
    VALUES (current_user_id, 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 为关键表添加审计触发器
CREATE TRIGGER audit_candidates
  AFTER INSERT OR UPDATE OR DELETE ON candidates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_scores
  AFTER INSERT OR UPDATE OR DELETE ON scores
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_positions
  AFTER INSERT OR UPDATE OR DELETE ON positions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- 查询审计日志
-- 最近 24 小时的所有操作
-- SELECT * FROM audit_logs
--   WHERE created_at > NOW() - INTERVAL '24 hours'
--   ORDER BY created_at DESC;

-- 某用户的所有操作
-- SELECT * FROM audit_logs
--   WHERE user_id = 'USER_UUID'
--   ORDER BY created_at DESC
--   LIMIT 50;
```

### S.5 Supabase 自托管 vs 云端对比

```
Supabase 部署方式对比 (HR 项目):

                    │ 云端 (Supabase Cloud)  │ 自托管 (Docker)
────────────────────┼────────────────────────┼────────────────────
初始成本            │ 免费（有限额）         │ 服务器成本
月费用              │ $25+ (Pro)             │ 仅服务器费用
维护成本            │ 零                     │ 需要运维
Auth 功能           │ 完整                   │ 完整
Storage 功能        │ 完整                   │ 完整
Realtime            │ 完整                   │ 完整
Edge Functions      │ 完整                   │ 需要额外配置
自动备份            │ 包含                   │ 需手动配置
SSL 证书            │ 自动管理               │ 需要 Let's Encrypt
数据位置            │ AWS 区域选择           │ 完全控制
合规性              │ SOC2, HIPAA            │ 自行负责
适合场景            │ 快速开发、小团队       │ 数据敏感、大规模

HR 项目建议:
Phase 1 (MVP): 使用 Supabase Cloud 免费版
  - 500MB 数据库
  - 1GB 文件存储
  - 50,000 月活用户
  - 足够 MVP 使用

Phase 2 (生产): 评估后决定
  - 如果数据合规要求高 → 自托管
  - 如果追求运维简单 → Supabase Pro ($25/月)
  - 如果需要中国区域部署 → 自托管（Supabase Cloud 无中国节点）

注意: HR 数据包含个人信息（PIPL 合规）
  - 中国业务建议自托管或使用国内云服务
  - Supabase Cloud 数据存储在海外
```

---

## 附录 T: Supabase 性能优化与索引策略

### T.1 数据库索引优化

```sql
-- ============================================
-- HR 项目数据库索引策略
-- 基于查询模式的针对性优化
-- ============================================

-- ========== 候选人表索引 ==========

-- 1. 最常用: 按状态筛选候选人
CREATE INDEX idx_candidates_status ON candidates (status);

-- 2. 按职位查询候选人（高频查询）
CREATE INDEX idx_candidates_position_id ON candidates (position_id);

-- 3. 复合索引: 按职位 + 状态 + 创建时间（列表页分页排序）
CREATE INDEX idx_candidates_position_status_created
  ON candidates (position_id, status, created_at DESC);

-- 4. 邮箱唯一索引（去重 + 快速查找）
CREATE UNIQUE INDEX idx_candidates_email ON candidates (email)
  WHERE email IS NOT NULL;

-- 5. 手机号查找
CREATE INDEX idx_candidates_phone ON candidates (phone)
  WHERE phone IS NOT NULL;

-- 6. 全文搜索: 候选人姓名
CREATE INDEX idx_candidates_name_trgm ON candidates
  USING gin (name gin_trgm_ops);

-- ========== 评分表索引 ==========

-- 7. 按候选人查评分
CREATE INDEX idx_scores_candidate_id ON scores (candidate_id);

-- 8. 按职位查评分（报表聚合）
CREATE INDEX idx_scores_position_id ON scores (position_id);

-- 9. 复合索引: 按职位 + 总分排序（排名查询）
CREATE INDEX idx_scores_position_total
  ON scores (position_id, total_score DESC);

-- 10. 按等级筛选
CREATE INDEX idx_scores_grade ON scores (grade);

-- 11. 复合: 职位 + 等级（高频筛选组合）
CREATE INDEX idx_scores_position_grade
  ON scores (position_id, grade);

-- ========== 简历表索引 ==========

-- 12. 按候选人查简历
CREATE INDEX idx_resumes_candidate_id ON resumes (candidate_id);

-- 13. 按文件类型筛选
CREATE INDEX idx_resumes_file_type ON resumes (file_type);

-- ========== 职位表索引 ==========

-- 14. 活跃职位列表（最常用查询）
CREATE INDEX idx_positions_active ON positions (status, created_at DESC)
  WHERE status = 'active';

-- 15. 部门筛选
CREATE INDEX idx_positions_department ON positions (department);

-- ========== pgvector 索引 ==========

-- 16. 技能向量相似度搜索（HNSW 索引）
CREATE INDEX idx_skill_embeddings_vector
  ON skill_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 17. 按实体类型分区查询
CREATE INDEX idx_skill_embeddings_entity
  ON skill_embeddings (entity_type, entity_id);
```

### T.2 查询性能分析工具

```typescript
// src/lib/query-analyzer.ts
// 查询性能分析和慢查询检测

import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

// ===== 查询耗时统计 =====

interface QueryStats {
  query: string;
  duration: number;
  rowsReturned: number;
  timestamp: Date;
}

const queryLog: QueryStats[] = [];
const MAX_LOG_SIZE = 1000;
const SLOW_QUERY_THRESHOLD_MS = 100;

/**
 * 包装数据库查询，自动记录耗时
 */
export async function trackedQuery<T>(
  label: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await queryFn();
    const duration = performance.now() - start;

    const stats: QueryStats = {
      query: label,
      duration,
      rowsReturned: Array.isArray(result) ? result.length : 1,
      timestamp: new Date(),
    };

    queryLog.push(stats);
    if (queryLog.length > MAX_LOG_SIZE) {
      queryLog.shift();
    }

    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      console.warn(
        `[SLOW QUERY] ${label}: ${duration.toFixed(1)}ms`
      );
    }

    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(
      `[QUERY ERROR] ${label}: ${duration.toFixed(1)}ms`,
      error
    );
    throw error;
  }
}

/**
 * EXPLAIN ANALYZE 封装
 * 分析查询执行计划
 */
export async function explainQuery(
  rawSql: string
): Promise<{
  plan: string;
  executionTime: number;
  planningTime: number;
  seqScans: number;
  indexScans: number;
}> {
  const result = await db.execute(
    sql.raw(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${rawSql}`)
  );

  const plan = (result as any)[0]?.["QUERY PLAN"]?.[0];
  if (!plan) {
    throw new Error("Failed to parse EXPLAIN output");
  }

  const planText = JSON.stringify(plan, null, 2);

  // 统计 Seq Scan 和 Index Scan 数量
  const seqScans = (planText.match(/"Node Type":\s*"Seq Scan"/g) || []).length;
  const indexScans = (planText.match(/"Node Type":\s*"Index Scan"/g) || [])
    .length + (planText.match(/"Node Type":\s*"Index Only Scan"/g) || []).length;

  return {
    plan: planText,
    executionTime: plan["Execution Time"] || 0,
    planningTime: plan["Planning Time"] || 0,
    seqScans,
    indexScans,
  };
}

/**
 * 获取查询统计报告
 */
export function getQueryReport(): {
  totalQueries: number;
  avgDuration: number;
  maxDuration: number;
  slowQueries: QueryStats[];
  topSlowest: QueryStats[];
} {
  if (queryLog.length === 0) {
    return {
      totalQueries: 0,
      avgDuration: 0,
      maxDuration: 0,
      slowQueries: [],
      topSlowest: [],
    };
  }

  const durations = queryLog.map((q) => q.duration);
  const avgDuration =
    durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const slowQueries = queryLog.filter(
    (q) => q.duration > SLOW_QUERY_THRESHOLD_MS
  );
  const topSlowest = [...queryLog]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);

  return {
    totalQueries: queryLog.length,
    avgDuration,
    maxDuration,
    slowQueries,
    topSlowest,
  };
}
```

### T.3 连接池优化

```typescript
// src/db/pool-config.ts
// PostgreSQL 连接池配置最佳实践

import postgres from "postgres";
import { env } from "../env.js";

/**
 * 连接池大小计算公式:
 * pool_size = (core_count * 2) + effective_spindle_count
 *
 * 对于 HR 项目（单服务器部署）:
 * - 2 核 CPU → (2 * 2) + 1 = 5 连接
 * - 4 核 CPU → (4 * 2) + 1 = 9 连接
 *
 * Supabase Free: 最大 60 直连
 * Supabase Pro: 最大 200 直连（+ Supavisor pooler 无限）
 */

// 生产环境推荐配置
export const productionPool = postgres(env.DATABASE_URL, {
  // 连接池大小
  max: 10,                    // 最大连接数
  idle_timeout: 20,           // 空闲连接超时（秒）
  connect_timeout: 10,        // 连接超时（秒）
  max_lifetime: 60 * 30,      // 连接最大生命周期（30分钟）

  // 预处理语句
  prepare: true,              // 使用 prepared statements（提升重复查询性能）

  // 转换配置
  transform: {
    column: {
      // 数据库 snake_case → JS camelCase
      from: postgres.toCamel,
      to: postgres.toSnake,
    },
  },

  // 连接事件
  onnotice: (notice) => {
    if (notice.severity === "WARNING") {
      console.warn("[DB Notice]", notice.message);
    }
  },

  // SSL 配置（Supabase Cloud 要求）
  ssl: env.DATABASE_URL.includes("supabase.co")
    ? { rejectUnauthorized: false }
    : false,
});

// 开发环境配置（宽松限制）
export const developmentPool = postgres(env.DATABASE_URL, {
  max: 3,                     // 开发环境少连接
  idle_timeout: 60,           // 更长的空闲时间
  debug: (connection, query, params) => {
    console.log(`[SQL] ${query.substring(0, 200)}`);
    if (params.length > 0) {
      console.log(`[Params]`, params.slice(0, 5));
    }
  },
});

// 根据环境选择
export const pool =
  process.env.NODE_ENV === "production"
    ? productionPool
    : developmentPool;
```

### T.4 查询结果缓存层

```typescript
// src/lib/query-cache.ts
// 查询结果缓存（减少数据库压力）

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  tags: string[];
}

/**
 * 基于标签的查询缓存
 * 支持按标签批量失效（例如：某职位数据变更时清除所有相关缓存）
 */
export class QueryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private tagIndex = new Map<string, Set<string>>(); // tag → cache keys

  /**
   * 获取缓存数据，未命中则执行查询
   */
  async getOrSet<T>(
    key: string,
    queryFn: () => Promise<T>,
    options: { ttlMs: number; tags?: string[] } = { ttlMs: 60_000 }
  ): Promise<T> {
    const existing = this.cache.get(key) as CacheEntry<T> | undefined;
    if (existing && existing.expiresAt > Date.now()) {
      return existing.data;
    }

    const data = await queryFn();
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + options.ttlMs,
      tags: options.tags || [],
    };

    this.cache.set(key, entry);

    // 更新标签索引
    for (const tag of entry.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }

    return data;
  }

  /**
   * 按标签失效缓存
   * 例如: invalidateByTag("position:123") 清除该职位所有相关缓存
   */
  invalidateByTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;

    let count = 0;
    for (const key of keys) {
      if (this.cache.delete(key)) count++;
    }
    this.tagIndex.delete(tag);
    return count;
  }

  /**
   * 删除指定缓存
   */
  invalidate(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      for (const tag of entry.tags) {
        this.tagIndex.get(tag)?.delete(key);
      }
    }
    return this.cache.delete(key);
  }

  /**
   * 清除所有过期缓存
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.invalidate(key);
        count++;
      }
    }
    return count;
  }

  /**
   * 缓存统计
   */
  get stats() {
    const now = Date.now();
    let expired = 0;
    for (const entry of this.cache.values()) {
      if (entry.expiresAt <= now) expired++;
    }
    return {
      totalEntries: this.cache.size,
      activeEntries: this.cache.size - expired,
      expiredEntries: expired,
      tagCount: this.tagIndex.size,
    };
  }
}

export const queryCache = new QueryCache();

// 定期清理（每5分钟）
setInterval(() => {
  const cleaned = queryCache.cleanup();
  if (cleaned > 0) {
    console.log(`[Cache] Cleaned ${cleaned} expired entries`);
  }
}, 5 * 60 * 1000);
```

### T.5 在路由中使用缓存

```typescript
// src/routes/candidates.ts (缓存增强版)

import { Elysia } from "elysia";
import { db } from "../db/index.js";
import { candidates, scores } from "../db/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { queryCache } from "../lib/query-cache.js";
import { trackedQuery } from "../lib/query-analyzer.js";

const app = new Elysia();

// GET /api/candidates?positionId=xxx&grade=A&page=1&pageSize=20
app.get("/", async (c) => {
  const positionId = c.req.query("positionId");
  const grade = c.req.query("grade");
  const page = parseInt(c.req.query("page") || "1");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") || "20"), 100);

  // 生成缓存键
  const cacheKey = `candidates:list:${positionId || "all"}:${grade || "all"}:${page}:${pageSize}`;
  const cacheTags = [
    "candidates:list",
    ...(positionId ? [`position:${positionId}`] : []),
  ];

  const result = await queryCache.getOrSet(
    cacheKey,
    () =>
      trackedQuery("candidates.list", async () => {
        const conditions = [];
        if (positionId) {
          conditions.push(eq(candidates.positionId, positionId));
        }

        // 带评分的候选人列表
        const rows = await db
          .select({
            id: candidates.id,
            name: candidates.name,
            email: candidates.email,
            phone: candidates.phone,
            status: candidates.status,
            createdAt: candidates.createdAt,
            totalScore: scores.totalScore,
            grade: scores.grade,
          })
          .from(candidates)
          .leftJoin(scores, eq(candidates.id, scores.candidateId))
          .where(
            conditions.length > 0 ? and(...conditions) : undefined
          )
          .orderBy(desc(scores.totalScore))
          .limit(pageSize)
          .offset((page - 1) * pageSize);

        // 按等级过滤（在 join 后过滤更灵活）
        const filtered = grade
          ? rows.filter((r) => r.grade === grade)
          : rows;

        return filtered;
      }),
    {
      ttlMs: 30_000, // 30秒缓存（候选人列表变化频繁）
      tags: cacheTags,
    }
  );

  return c.json({ data: result, page, pageSize });
});

// 当候选人数据变更时，失效相关缓存
export function invalidateCandidateCache(positionId?: string) {
  queryCache.invalidateByTag("candidates:list");
  if (positionId) {
    queryCache.invalidateByTag(`position:${positionId}`);
  }
}

export default app;
```

### T.6 Supabase 特有性能优化

```typescript
// src/lib/supabase-perf.ts
// Supabase 平台特有的性能优化

/**
 * Supabase 性能优化 Checklist:
 *
 * 1. 使用 Supavisor（连接池代理）
 *    - Transaction mode: 短查询（默认 port 6543）
 *    - Session mode: 需要 prepared statements 或 LISTEN/NOTIFY
 *
 * 2. 启用 pg_stat_statements
 *    - 在 Supabase Dashboard → SQL Editor 执行:
 *    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
 *
 * 3. 利用 PostgREST 自动缓存
 *    - GET 请求默认添加 ETag
 *    - 客户端可用 If-None-Match 条件请求
 *
 * 4. Edge Functions 缓存
 *    - 使用 Cache API 缓存 AI 结果
 */

// ===== Supavisor 连接字符串 =====
// 直连（Session 模式）: 用于迁移、LISTEN/NOTIFY
// postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

// 池化（Transaction 模式）: 用于应用查询
// postgresql://postgres.[project]:[password]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres

/**
 * 根据查询类型选择连接
 */
export function getConnectionUrl(mode: "session" | "transaction"): string {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (mode === "transaction") {
    // Supavisor Transaction 模式 - 用于短查询
    return `postgresql://postgres.${projectRef}:${password}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`;
  }
  // Session 模式 - 用于迁移和 Realtime 订阅
  return `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;
}

// ===== pg_stat_statements 分析 =====

interface SlowQueryInfo {
  query: string;
  calls: number;
  totalTimeMs: number;
  meanTimeMs: number;
  rows: number;
}

/**
 * 查询 pg_stat_statements 找出最慢查询
 */
export async function getTopSlowQueries(
  dbPool: any,
  limit: number = 10
): Promise<SlowQueryInfo[]> {
  const result = await dbPool`
    SELECT
      query,
      calls,
      total_exec_time AS total_time_ms,
      mean_exec_time AS mean_time_ms,
      rows
    FROM pg_stat_statements
    WHERE query NOT LIKE '%pg_stat%'
      AND calls > 5
    ORDER BY mean_exec_time DESC
    LIMIT ${limit}
  `;

  return result.map((r: any) => ({
    query: r.query.substring(0, 200),
    calls: Number(r.calls),
    totalTimeMs: Number(r.total_time_ms),
    meanTimeMs: Number(r.mean_time_ms),
    rows: Number(r.rows),
  }));
}

// ===== 表大小监控 =====

interface TableSizeInfo {
  tableName: string;
  rowEstimate: number;
  totalSize: string;
  indexSize: string;
  dataSize: string;
}

/**
 * 获取各表大小信息
 */
export async function getTableSizes(
  dbPool: any
): Promise<TableSizeInfo[]> {
  const result = await dbPool`
    SELECT
      schemaname || '.' || relname AS table_name,
      n_live_tup AS row_estimate,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
      pg_size_pretty(pg_indexes_size(relid)) AS index_size,
      pg_size_pretty(pg_table_size(relid)) AS data_size
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
  `;

  return result.map((r: any) => ({
    tableName: r.table_name,
    rowEstimate: Number(r.row_estimate),
    totalSize: r.total_size,
    indexSize: r.index_size,
    dataSize: r.data_size,
  }));
}

// ===== 索引使用率分析 =====

interface IndexUsage {
  indexName: string;
  tableName: string;
  indexScans: number;
  indexSize: string;
  unused: boolean;
}

/**
 * 检查索引使用率，找出未使用的索引
 * 未使用的索引浪费空间并拖慢写入
 */
export async function getIndexUsage(
  dbPool: any
): Promise<IndexUsage[]> {
  const result = await dbPool`
    SELECT
      indexrelname AS index_name,
      relname AS table_name,
      idx_scan AS index_scans,
      pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
      idx_scan = 0 AS unused
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
  `;

  return result.map((r: any) => ({
    indexName: r.index_name,
    tableName: r.table_name,
    indexScans: Number(r.index_scans),
    indexSize: r.index_size,
    unused: r.unused,
  }));
}
```

### T.7 数据库健康检查路由

```typescript
// src/routes/db-health.ts
// 数据库性能监控 API（仅限管理员）

import { Elysia } from "elysia";
import { pool } from "../db/pool-config.js";
import { getQueryReport } from "../lib/query-analyzer.js";
import { queryCache } from "../lib/query-cache.js";
import {
  getTopSlowQueries,
  getTableSizes,
  getIndexUsage,
} from "../lib/supabase-perf.js";

const app = new Elysia();

// GET /api/admin/db/health - 综合健康检查
app.get("/health", async (c) => {
  const start = performance.now();

  // 1. 基本连接测试
  const pingResult = await pool`SELECT 1 AS ok, NOW() AS server_time`;
  const pingMs = performance.now() - start;

  // 2. 查询统计
  const queryReport = getQueryReport();

  // 3. 缓存统计
  const cacheStats = queryCache.stats;

  return c.json({
    status: pingMs < 100 ? "healthy" : pingMs < 500 ? "degraded" : "unhealthy",
    ping: `${pingMs.toFixed(1)}ms`,
    serverTime: pingResult[0].server_time,
    queries: {
      total: queryReport.totalQueries,
      avgDuration: `${queryReport.avgDuration.toFixed(1)}ms`,
      slowCount: queryReport.slowQueries.length,
    },
    cache: cacheStats,
  });
});

// GET /api/admin/db/slow-queries - 慢查询报告
app.get("/slow-queries", async (c) => {
  const [pgStats, appStats] = await Promise.all([
    getTopSlowQueries(pool, 20),
    Promise.resolve(getQueryReport()),
  ]);

  return c.json({
    pgStatStatements: pgStats,
    appLevel: {
      topSlowest: appStats.topSlowest,
      slowQueryCount: appStats.slowQueries.length,
    },
  });
});

// GET /api/admin/db/tables - 表大小报告
app.get("/tables", async (c) => {
  const sizes = await getTableSizes(pool);
  return c.json({ tables: sizes });
});

// GET /api/admin/db/indexes - 索引使用率
app.get("/indexes", async (c) => {
  const indexes = await getIndexUsage(pool);
  const unused = indexes.filter((i) => i.unused);

  return c.json({
    total: indexes.length,
    unusedCount: unused.length,
    indexes,
    recommendation:
      unused.length > 0
        ? `发现 ${unused.length} 个未使用索引，考虑删除以节省空间: ${unused.map((i) => i.indexName).join(", ")}`
        : "所有索引均在使用中",
  });
});

// POST /api/admin/db/cache/clear - 清除缓存
app.post("/cache/clear", async (c) => {
  const { tag } = await c.req.json<{ tag?: string }>();

  let cleared: number;
  if (tag) {
    cleared = queryCache.invalidateByTag(tag);
  } else {
    cleared = queryCache.cleanup();
  }

  return c.json({ cleared, remainingStats: queryCache.stats });
});

export default app;
```

### T.8 数据库迁移最佳实践

```sql
-- ============================================
-- 迁移最佳实践: 大表在线操作
-- 避免长时间锁表
-- ============================================

-- ❌ 错误: 直接 ALTER TABLE 大表会锁表
-- ALTER TABLE candidates ADD COLUMN tags TEXT[];

-- ✅ 正确: 使用 CREATE INDEX CONCURRENTLY（不锁表）
CREATE INDEX CONCURRENTLY idx_candidates_tags ON candidates USING gin (tags);

-- ✅ 正确: 添加列 + 默认值（PostgreSQL 11+ 不锁表）
ALTER TABLE candidates ADD COLUMN tags TEXT[] DEFAULT '{}';

-- ✅ 正确: 需要 NOT NULL 约束时分步操作
-- Step 1: 添加列（允许 NULL）
ALTER TABLE candidates ADD COLUMN priority INTEGER;

-- Step 2: 分批回填数据（不锁整表）
UPDATE candidates SET priority = 0
  WHERE priority IS NULL
  AND id IN (
    SELECT id FROM candidates WHERE priority IS NULL LIMIT 1000
  );
-- 重复执行直到全部回填

-- Step 3: 添加约束
ALTER TABLE candidates ALTER COLUMN priority SET NOT NULL;
ALTER TABLE candidates ALTER COLUMN priority SET DEFAULT 0;

-- ===== 分区表策略（当候选人数量超过 100万时） =====

-- 按创建月份分区
CREATE TABLE candidates_partitioned (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  position_id UUID,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 创建月度分区
CREATE TABLE candidates_2026_01 PARTITION OF candidates_partitioned
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE candidates_2026_02 PARTITION OF candidates_partitioned
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE candidates_2026_03 PARTITION OF candidates_partitioned
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- 自动创建未来分区的函数
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
  next_month DATE;
  partition_name TEXT;
  start_date TEXT;
  end_date TEXT;
BEGIN
  next_month := date_trunc('month', NOW()) + interval '2 months';
  partition_name := 'candidates_' || to_char(next_month, 'YYYY_MM');
  start_date := to_char(next_month, 'YYYY-MM-DD');
  end_date := to_char(next_month + interval '1 month', 'YYYY-MM-DD');

  -- 如果分区不存在则创建
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = partition_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF candidates_partitioned FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
    RAISE NOTICE 'Created partition: %', partition_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 每月定时调用（通过 pg_cron 或应用层调度）
-- SELECT cron.schedule('create-partition', '0 0 25 * *', 'SELECT create_monthly_partition()');
```

### T.9 性能监控仪表板数据

```typescript
// src/services/db-metrics.ts
// 收集数据库性能指标用于仪表板

interface DBMetrics {
  timestamp: Date;
  connections: {
    active: number;
    idle: number;
    waiting: number;
    maxConnections: number;
  };
  transactions: {
    committed: number;
    rolledBack: number;
    deadlocks: number;
  };
  cache: {
    hitRatio: number; // 目标 > 99%
    blockReads: number;
    blockHits: number;
  };
  tableActivity: {
    inserts: number;
    updates: number;
    deletes: number;
    seqScans: number;
    indexScans: number;
  };
}

/**
 * 收集 PostgreSQL 核心指标
 */
export async function collectDBMetrics(dbPool: any): Promise<DBMetrics> {
  const [connStats, txStats, cacheStats, activityStats] = await Promise.all([
    // 连接状态
    dbPool`
      SELECT
        count(*) FILTER (WHERE state = 'active') AS active,
        count(*) FILTER (WHERE state = 'idle') AS idle,
        count(*) FILTER (WHERE wait_event IS NOT NULL) AS waiting,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `,
    // 事务统计
    dbPool`
      SELECT
        xact_commit AS committed,
        xact_rollback AS rolled_back,
        deadlocks
      FROM pg_stat_database
      WHERE datname = current_database()
    `,
    // 缓冲区缓存命中率
    dbPool`
      SELECT
        sum(blks_hit) AS block_hits,
        sum(blks_read) AS block_reads,
        CASE WHEN sum(blks_hit) + sum(blks_read) = 0
          THEN 1.0
          ELSE sum(blks_hit)::float / (sum(blks_hit) + sum(blks_read))
        END AS hit_ratio
      FROM pg_stat_database
      WHERE datname = current_database()
    `,
    // 表活动统计
    dbPool`
      SELECT
        sum(n_tup_ins) AS inserts,
        sum(n_tup_upd) AS updates,
        sum(n_tup_del) AS deletes,
        sum(seq_scan) AS seq_scans,
        sum(idx_scan) AS index_scans
      FROM pg_stat_user_tables
    `,
  ]);

  return {
    timestamp: new Date(),
    connections: {
      active: Number(connStats[0].active),
      idle: Number(connStats[0].idle),
      waiting: Number(connStats[0].waiting),
      maxConnections: Number(connStats[0].max_connections),
    },
    transactions: {
      committed: Number(txStats[0].committed),
      rolledBack: Number(txStats[0].rolled_back),
      deadlocks: Number(txStats[0].deadlocks),
    },
    cache: {
      hitRatio: Number(cacheStats[0].hit_ratio),
      blockReads: Number(cacheStats[0].block_reads),
      blockHits: Number(cacheStats[0].block_hits),
    },
    tableActivity: {
      inserts: Number(activityStats[0].inserts),
      updates: Number(activityStats[0].updates),
      deletes: Number(activityStats[0].deletes),
      seqScans: Number(activityStats[0].seq_scans),
      indexScans: Number(activityStats[0].index_scans),
    },
  };
}

/**
 * 性能健康评分（0-100）
 */
export function calculateHealthScore(metrics: DBMetrics): {
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 100;

  // 缓存命中率 < 99% 扣分
  if (metrics.cache.hitRatio < 0.99) {
    score -= 20;
    issues.push(
      `缓冲区命中率偏低: ${(metrics.cache.hitRatio * 100).toFixed(1)}% (目标 > 99%)`
    );
  }

  // 连接使用率 > 80% 扣分
  const connUsage =
    (metrics.connections.active + metrics.connections.idle) /
    metrics.connections.maxConnections;
  if (connUsage > 0.8) {
    score -= 15;
    issues.push(
      `连接使用率偏高: ${(connUsage * 100).toFixed(0)}% (${metrics.connections.active + metrics.connections.idle}/${metrics.connections.maxConnections})`
    );
  }

  // 死锁 > 0 扣分
  if (metrics.transactions.deadlocks > 0) {
    score -= 10;
    issues.push(`检测到 ${metrics.transactions.deadlocks} 次死锁`);
  }

  // 顺序扫描占比过高
  const totalScans =
    metrics.tableActivity.seqScans + metrics.tableActivity.indexScans;
  if (totalScans > 0) {
    const seqRatio = metrics.tableActivity.seqScans / totalScans;
    if (seqRatio > 0.3) {
      score -= 15;
      issues.push(
        `顺序扫描占比偏高: ${(seqRatio * 100).toFixed(0)}% (考虑添加索引)`
      );
    }
  }

  // 等待连接 > 0 扣分
  if (metrics.connections.waiting > 0) {
    score -= 10;
    issues.push(
      `${metrics.connections.waiting} 个连接在等待（可能需要增大连接池）`
    );
  }

  return { score: Math.max(0, score), issues };
}
```

---

## 附录 U: Supabase 数据备份与恢复策略

### U.1 备份策略概览

```
HR 数据备份策略（个人信息保护 - PIPL 合规要求）

┌─────────────────────────────────────────────────┐
│               备份层次架构                        │
├─────────────────────────────────────────────────┤
│                                                  │
│  Level 1: Supabase 自动备份                      │
│  ├─ Cloud Pro: 每日自动备份, 7天保留             │
│  ├─ Cloud Free: 无自动备份 ⚠️                    │
│  └─ 自托管: 需自行配置                           │
│                                                  │
│  Level 2: 应用级逻辑备份 (pg_dump)               │
│  ├─ 每日全量备份                                 │
│  ├─ 每小时增量 WAL 归档                          │
│  └─ 保留 30 天                                   │
│                                                  │
│  Level 3: 文件存储备份                           │
│  ├─ 简历文件同步到备份存储                       │
│  ├─ 增量同步（只备份新文件）                     │
│  └─ 保留与数据库一致                             │
│                                                  │
│  Level 4: 异地备份                               │
│  ├─ 关键数据同步到另一地域                       │
│  └─ 灾难恢复 RPO < 1小时                        │
│                                                  │
└─────────────────────────────────────────────────┘
```

### U.2 自动备份脚本

```bash
#!/bin/bash
# scripts/backup/db-backup.sh
# PostgreSQL 数据库自动备份

set -euo pipefail

# ===== 配置 =====
BACKUP_DIR="${BACKUP_DIR:-/data/backups/hr-db}"
DB_URL="${DATABASE_URL:?DATABASE_URL is required}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${TIMESTAMP}_hr_backup.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

# ===== 创建备份目录 =====
mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting database backup..."

# ===== 全量逻辑备份 =====
pg_dump "${DB_URL}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --exclude-table='_*' \
  --exclude-table='pg_*' \
  | gzip -9 > "${BACKUP_FILE}"

# ===== 生成校验和 =====
sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"

# ===== 验证备份 =====
BACKUP_SIZE=$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}")
if [ "${BACKUP_SIZE}" -lt 1024 ]; then
  echo "[ERROR] Backup file too small (${BACKUP_SIZE} bytes), likely corrupt"
  rm -f "${BACKUP_FILE}" "${CHECKSUM_FILE}"
  exit 1
fi

echo "[$(date)] Backup created: ${BACKUP_FILE} ($(numfmt --to=iec ${BACKUP_SIZE}))"

# ===== 清理旧备份 =====
DELETED=$(find "${BACKUP_DIR}" -name "*_hr_backup.sql.gz*" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "[$(date)] Deleted ${DELETED} old backup files (>${RETENTION_DAYS} days)"
fi

# ===== 备份列表 =====
echo "[$(date)] Current backups:"
ls -lh "${BACKUP_DIR}"/*_hr_backup.sql.gz 2>/dev/null | tail -5
echo "[$(date)] Backup complete."
```

### U.3 恢复流程

```bash
#!/bin/bash
# scripts/backup/db-restore.sh
# 数据库恢复流程（含验证）

set -euo pipefail

BACKUP_FILE="${1:?Usage: db-restore.sh <backup_file> [target_db_url]}"
TARGET_DB="${2:-${DATABASE_URL:?DATABASE_URL is required}}"

# ===== 安全检查 =====
echo "⚠️  WARNING: This will restore data to the target database."
echo "Target: ${TARGET_DB%%@*}@***"
echo "Backup: ${BACKUP_FILE}"
echo ""
read -p "Type 'RESTORE' to confirm: " CONFIRM
if [ "${CONFIRM}" != "RESTORE" ]; then
  echo "Aborted."
  exit 1
fi

# ===== 校验和验证 =====
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "${CHECKSUM_FILE}" ]; then
  echo "Verifying checksum..."
  sha256sum -c "${CHECKSUM_FILE}" || {
    echo "[ERROR] Checksum verification failed!"
    exit 1
  }
fi

# ===== 恢复 =====
echo "Restoring database..."
gunzip -c "${BACKUP_FILE}" | psql "${TARGET_DB}" --single-transaction

# ===== 验证恢复结果 =====
echo "Verifying restoration..."
ROW_COUNTS=$(psql "${TARGET_DB}" -t -c "
  SELECT
    (SELECT count(*) FROM positions) AS positions,
    (SELECT count(*) FROM candidates) AS candidates,
    (SELECT count(*) FROM resumes) AS resumes,
    (SELECT count(*) FROM scores) AS scores
")
echo "Table row counts: ${ROW_COUNTS}"

echo "✅ Restore complete."
```

### U.4 文件存储备份

```typescript
// src/services/storage-backup.ts
// 简历文件增量备份

import { createReadStream, createWriteStream, existsSync, mkdirSync } from "fs";
import { readdir, stat } from "fs/promises";
import { join, basename } from "path";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";

interface BackupResult {
  totalFiles: number;
  newFiles: number;
  skippedFiles: number;
  totalSizeBytes: number;
  durationMs: number;
}

/**
 * 增量备份简历文件
 * 仅复制源目录中新增或修改的文件到备份目录
 */
export async function backupResumeFiles(
  sourceDir: string,
  backupDir: string
): Promise<BackupResult> {
  const start = performance.now();
  let newFiles = 0;
  let skippedFiles = 0;
  let totalSizeBytes = 0;

  // 确保备份目录存在
  mkdirSync(backupDir, { recursive: true });

  // 获取源目录所有文件
  const files = await readdir(sourceDir);
  const resumeFiles = files.filter((f) =>
    /\.(pdf|docx|doc)$/i.test(f)
  );

  for (const file of resumeFiles) {
    const sourcePath = join(sourceDir, file);
    const backupPath = join(backupDir, file);
    const sourceStats = await stat(sourcePath);
    totalSizeBytes += sourceStats.size;

    // 检查备份目录是否已有相同文件
    if (existsSync(backupPath)) {
      const backupStats = await stat(backupPath);
      // 大小和修改时间都一致则跳过
      if (
        backupStats.size === sourceStats.size &&
        backupStats.mtimeMs >= sourceStats.mtimeMs
      ) {
        skippedFiles++;
        continue;
      }
    }

    // 复制文件
    await pipeline(
      createReadStream(sourcePath),
      createWriteStream(backupPath)
    );
    newFiles++;
  }

  return {
    totalFiles: resumeFiles.length,
    newFiles,
    skippedFiles,
    totalSizeBytes,
    durationMs: performance.now() - start,
  };
}

/**
 * 生成备份清单（用于验证完整性）
 */
export async function generateManifest(
  dir: string
): Promise<Map<string, string>> {
  const manifest = new Map<string, string>();
  const files = await readdir(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    for await (const chunk of stream) {
      hash.update(chunk);
    }

    manifest.set(file, hash.digest("hex"));
  }

  return manifest;
}

/**
 * 验证备份完整性
 */
export async function verifyBackup(
  sourceDir: string,
  backupDir: string
): Promise<{
  valid: boolean;
  missingFiles: string[];
  corruptedFiles: string[];
}> {
  const sourceManifest = await generateManifest(sourceDir);
  const backupManifest = await generateManifest(backupDir);

  const missingFiles: string[] = [];
  const corruptedFiles: string[] = [];

  for (const [file, sourceHash] of sourceManifest) {
    const backupHash = backupManifest.get(file);
    if (!backupHash) {
      missingFiles.push(file);
    } else if (backupHash !== sourceHash) {
      corruptedFiles.push(file);
    }
  }

  return {
    valid: missingFiles.length === 0 && corruptedFiles.length === 0,
    missingFiles,
    corruptedFiles,
  };
}
```

### U.5 PIPL 合规数据处理

```typescript
// src/services/data-compliance.ts
// 个人信息保护法(PIPL)合规 - 数据处理

import { db } from "../db/index.js";
import { candidates, resumes, scores } from "../db/schema.js";
import { eq, lt, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

/**
 * PIPL 合规要求:
 * 1. 数据最小化原则: 只收集必要信息
 * 2. 目的限制原则: 仅用于招聘目的
 * 3. 存储期限: 招聘结束后不超过必要期限
 * 4. 数据主体权利: 查询、更正、删除
 * 5. 数据出境: 个人信息不得随意跨境传输
 */

// ===== 数据保留策略 =====

interface RetentionPolicy {
  status: string;
  retentionDays: number;
  description: string;
}

const RETENTION_POLICIES: RetentionPolicy[] = [
  {
    status: "rejected",
    retentionDays: 90,
    description: "被拒候选人: 90天后自动匿名化",
  },
  {
    status: "withdrawn",
    retentionDays: 30,
    description: "主动撤回: 30天后自动匿名化",
  },
  {
    status: "archived",
    retentionDays: 365,
    description: "归档候选人: 1年后自动匿名化",
  },
];

/**
 * 执行数据保留策略
 * 匿名化过期候选人数据（而非删除，保留统计价值）
 */
export async function enforceRetentionPolicies(): Promise<{
  processed: number;
  byStatus: Record<string, number>;
}> {
  let totalProcessed = 0;
  const byStatus: Record<string, number> = {};

  for (const policy of RETENTION_POLICIES) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    // 匿名化候选人数据
    const result = await db
      .update(candidates)
      .set({
        name: sql`'匿名候选人_' || substring(id::text, 1, 8)`,
        email: null,
        phone: null,
        // 保留: education, skills, status（用于统计分析）
      })
      .where(
        and(
          eq(candidates.status, policy.status),
          lt(candidates.updatedAt, cutoffDate),
          // 确保未被匿名化（避免重复处理）
          sql`name NOT LIKE '匿名候选人_%'`
        )
      )
      .returning({ id: candidates.id });

    const count = result.length;
    totalProcessed += count;
    byStatus[policy.status] = count;

    if (count > 0) {
      // 删除对应的简历原文（保留评分记录）
      await db
        .update(resumes)
        .set({
          rawText: null,
          filePath: null,
        })
        .where(
          sql`candidate_id IN (${sql.raw(
            result.map((r) => `'${r.id}'`).join(",")
          )})`
        );
    }

    console.log(`[Retention] ${policy.description}: 匿名化 ${count} 条记录`);
  }

  return { processed: totalProcessed, byStatus };
}

// ===== 数据主体权利 =====

/**
 * 候选人查询自己的数据（PIPL 第44条）
 */
export async function getCandidatePersonalData(email: string) {
  const candidate = await db
    .select()
    .from(candidates)
    .where(eq(candidates.email, email))
    .limit(1);

  if (candidate.length === 0) {
    return null;
  }

  const [resumeData, scoreData] = await Promise.all([
    db
      .select({ id: resumes.id, fileName: resumes.fileName, createdAt: resumes.createdAt })
      .from(resumes)
      .where(eq(resumes.candidateId, candidate[0].id)),
    db
      .select({
        positionId: scores.positionId,
        totalScore: scores.totalScore,
        grade: scores.grade,
        createdAt: scores.createdAt,
      })
      .from(scores)
      .where(eq(scores.candidateId, candidate[0].id)),
  ]);

  return {
    personalInfo: {
      name: candidate[0].name,
      email: candidate[0].email,
      phone: candidate[0].phone,
      education: candidate[0].education,
    },
    resumes: resumeData,
    scores: scoreData,
    dataCollectedAt: candidate[0].createdAt,
    dataUsagePurpose: "招聘候选人评估",
  };
}

/**
 * 候选人要求删除数据（PIPL 第47条）
 * "被遗忘权"
 */
export async function deleteCandidateData(
  email: string
): Promise<{ success: boolean; deletedRecords: number }> {
  const candidate = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.email, email))
    .limit(1);

  if (candidate.length === 0) {
    return { success: false, deletedRecords: 0 };
  }

  const candidateId = candidate[0].id;
  let deletedCount = 0;

  // 删除评分记录
  const deletedScores = await db
    .delete(scores)
    .where(eq(scores.candidateId, candidateId))
    .returning({ id: scores.id });
  deletedCount += deletedScores.length;

  // 删除简历
  const deletedResumes = await db
    .delete(resumes)
    .where(eq(resumes.candidateId, candidateId))
    .returning({ id: resumes.id });
  deletedCount += deletedResumes.length;

  // 删除候选人记录
  await db.delete(candidates).where(eq(candidates.id, candidateId));
  deletedCount += 1;

  console.log(
    `[PIPL] Deleted all data for candidate ${email}: ${deletedCount} records`
  );

  return { success: true, deletedRecords: deletedCount };
}

// ===== 数据访问审计 =====

/**
 * 记录敏感数据访问（PIPL 第54条）
 */
export async function logDataAccess(params: {
  userId: string;
  action: "view" | "export" | "modify" | "delete";
  targetType: "candidate" | "resume" | "score";
  targetId: string;
  details?: string;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO data_access_logs (user_id, action, target_type, target_id, details, ip_address, created_at)
    VALUES (
      ${params.userId},
      ${params.action},
      ${params.targetType},
      ${params.targetId},
      ${params.details || null},
      current_setting('request.header.x-forwarded-for', true),
      NOW()
    )
  `);
}
```

### U.6 定时任务调度

```typescript
// src/services/scheduler.ts
// 定时任务: 备份 + 数据保留 + 清理

interface ScheduledTask {
  name: string;
  intervalMs: number;
  lastRun: Date | null;
  handler: () => Promise<void>;
}

const tasks: ScheduledTask[] = [];
const timers: NodeJS.Timeout[] = [];

/**
 * 注册定时任务
 */
export function registerTask(
  name: string,
  intervalMs: number,
  handler: () => Promise<void>
): void {
  tasks.push({ name, intervalMs, lastRun: null, handler });
}

/**
 * 启动所有定时任务
 */
export function startScheduler(): void {
  for (const task of tasks) {
    console.log(
      `[Scheduler] Registering: ${task.name} (every ${task.intervalMs / 1000}s)`
    );

    const timer = setInterval(async () => {
      try {
        console.log(`[Scheduler] Running: ${task.name}`);
        const start = performance.now();
        await task.handler();
        task.lastRun = new Date();
        console.log(
          `[Scheduler] Completed: ${task.name} (${(performance.now() - start).toFixed(0)}ms)`
        );
      } catch (error) {
        console.error(`[Scheduler] Failed: ${task.name}`, error);
      }
    }, task.intervalMs);

    timers.push(timer);
  }

  console.log(`[Scheduler] Started ${tasks.length} tasks`);
}

/**
 * 停止所有定时任务
 */
export function stopScheduler(): void {
  for (const timer of timers) {
    clearInterval(timer);
  }
  timers.length = 0;
  console.log("[Scheduler] All tasks stopped");
}

/**
 * 获取任务状态
 */
export function getSchedulerStatus(): Array<{
  name: string;
  intervalMs: number;
  lastRun: string | null;
}> {
  return tasks.map((t) => ({
    name: t.name,
    intervalMs: t.intervalMs,
    lastRun: t.lastRun?.toISOString() || null,
  }));
}
```

### U.7 任务注册示例

```typescript
// src/index.ts 中注册定时任务

import { registerTask, startScheduler } from "./services/scheduler.js";
import { enforceRetentionPolicies } from "./services/data-compliance.js";
import { backupResumeFiles } from "./services/storage-backup.js";
import { queryCache } from "./lib/query-cache.js";
import { collectDBMetrics, calculateHealthScore } from "./services/db-metrics.js";

// 每天凌晨 2:00 执行数据保留策略
registerTask(
  "data-retention",
  24 * 60 * 60 * 1000, // 24小时
  async () => {
    const result = await enforceRetentionPolicies();
    console.log(`[Retention] Processed ${result.processed} records`, result.byStatus);
  }
);

// 每6小时备份简历文件
registerTask(
  "resume-backup",
  6 * 60 * 60 * 1000,
  async () => {
    const result = await backupResumeFiles(
      "/data/uploads/resumes",
      "/data/backups/resumes"
    );
    console.log(
      `[Backup] Files: ${result.newFiles} new, ${result.skippedFiles} skipped`
    );
  }
);

// 每5分钟清理过期缓存
registerTask(
  "cache-cleanup",
  5 * 60 * 1000,
  async () => {
    const cleaned = queryCache.cleanup();
    if (cleaned > 0) {
      console.log(`[Cache] Cleaned ${cleaned} expired entries`);
    }
  }
);

// 每分钟收集数据库指标
registerTask(
  "db-metrics",
  60 * 1000,
  async () => {
    // 注意: 需要传入数据库连接池
    // const metrics = await collectDBMetrics(pool);
    // const health = calculateHealthScore(metrics);
    // if (health.score < 70) {
    //   console.warn(`[DB Health] Score: ${health.score}`, health.issues);
    // }
  }
);

// 启动调度器
startScheduler();
```

---

## 附录 V: Supabase 与前端集成模式

### V.1 前端 SDK 初始化

```typescript
// 前端 (React/Next.js) Supabase 客户端配置
// 展示后端如何与前端 Supabase SDK 协同工作

/**
 * 架构选择:
 *
 * 方案 A: 前端直连 Supabase (简单场景)
 *   前端 → Supabase (Auth + Storage + Realtime)
 *   前端 → Elysia Backend (业务 API)
 *
 * 方案 B: 全部通过后端 (安全优先)
 *   前端 → Elysia Backend → Supabase
 *   前端 → Elysia Backend → PostgreSQL
 *
 * HR 项目推荐: 方案 A (Auth + Realtime 走 Supabase, 业务走后端)
 */

// ===== 方案 A: 前端 Supabase 客户端 =====

// frontend/src/lib/supabase.ts
/*
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Auth: 登录
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

// Realtime: 订阅候选人状态变化
export function subscribeCandidateUpdates(
  positionId: string,
  callback: (payload: any) => void
) {
  return supabase
    .channel(`position-${positionId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "candidates",
        filter: `position_id=eq.${positionId}`,
      },
      callback
    )
    .subscribe();
}
*/
```

### V.2 后端 Auth 验证中间件

```typescript
// src/middleware/supabase-auth.ts
// 验证前端传来的 Supabase JWT token

import { Elysia } from "elysia";
import { createClient } from "@supabase/supabase-js";

// 服务端 Supabase 客户端（使用 service_role key）
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

interface AuthUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Supabase Auth 中间件
 * 从 Authorization header 验证 JWT
 */
export const supabaseAuthMiddleware = createMiddleware<{
  Variables: { user: AuthUser };
}>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    // 设置用户信息到上下文
    c.set("user", {
      id: user.id,
      email: user.email || "",
      role: user.user_metadata?.role || "viewer",
    });

    await next();
  } catch {
    return c.json({ error: "Authentication failed" }, 401);
  }
});

/**
 * 角色检查中间件
 */
export function requireRole(...allowedRoles: string[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get("user") as AuthUser;
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json(
        {
          error: "Insufficient permissions",
          required: allowedRoles,
          current: user.role,
        },
        403
      );
    }

    await next();
  });
}
```

### V.3 前后端 API 通信模式

```typescript
// src/routes/frontend-api.ts
// 前端专用 API（带认证和权限控制）

import { Elysia } from "elysia";
import { supabaseAuthMiddleware, requireRole } from "../middleware/supabase-auth.js";

const app = new Elysia();

// 所有前端 API 需要认证
app.use("/*", supabaseAuthMiddleware);

// ===== 仪表板数据 (所有已认证用户) =====
app.get("/dashboard", async (c) => {
  const user = c.get("user");

  // 根据用户角色返回不同数据
  const baseData = {
    positionsCount: 10,
    candidatesCount: 150,
    pendingReviewCount: 23,
  };

  if (user.role === "admin" || user.role === "hr_manager") {
    return c.json({
      ...baseData,
      scoringStats: {
        avgScore: 62,
        gradeDistribution: { A: 15, B: 35, C: 40, D: 8, F: 2 },
      },
      recentActivity: [],
    });
  }

  return c.json(baseData);
});

// ===== 候选人操作 (HR 和管理员) =====
app.patch(
  "/candidates/:id/status",
  requireRole("admin", "hr_manager", "hr_staff"),
  async (c) => {
    const candidateId = c.req.param("id");
    const { status, notes } = await c.req.json<{
      status: string;
      notes?: string;
    }>();
    const user = c.get("user");

    // 记录操作者
    console.log(
      `[Audit] ${user.email} changing candidate ${candidateId} to ${status}`
    );

    // ... 执行状态变更

    return c.json({ message: "Status updated" });
  }
);

// ===== 管理功能 (仅管理员) =====
app.get(
  "/admin/system-health",
  requireRole("admin"),
  async (c) => {
    return c.json({
      status: "healthy",
      services: {
        database: "ok",
        ai: "ok",
        email: "ok",
      },
    });
  }
);

export default app;
```

### V.4 Supabase Storage 前端直传

```typescript
// src/routes/storage-presign.ts
// 生成预签名 URL 用于前端直传文件到 Supabase Storage

import { Elysia } from "elysia";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const app = new Elysia();

/**
 * 前端直传流程:
 * 1. 前端请求后端获取上传 URL
 * 2. 后端生成签名 URL 并返回
 * 3. 前端使用签名 URL 直接上传到 Supabase Storage
 * 4. 前端上传完成后通知后端
 * 5. 后端触发解析和评分
 *
 * 优点: 大文件不经过后端服务器，减少带宽和延迟
 */

// POST /api/storage/presign - 获取上传签名 URL
app.post("/presign", async (c) => {
  const { fileName, fileType, positionId } = await c.req.json<{
    fileName: string;
    fileType: string;
    positionId: string;
  }>();

  // 验证文件类型
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (!allowedTypes.includes(fileType)) {
    return c.json({ error: "Unsupported file type" }, 400);
  }

  // 生成唯一文件路径
  const fileId = randomUUID();
  const extension = fileName.split(".").pop() || "pdf";
  const storagePath = `resumes/${positionId}/${fileId}.${extension}`;

  // 创建签名上传 URL
  const { data, error } = await supabase.storage
    .from("resumes")
    .createSignedUploadUrl(storagePath);

  if (error) {
    return c.json({ error: "Failed to create upload URL" }, 500);
  }

  return c.json({
    uploadUrl: data.signedUrl,
    token: data.token,
    path: storagePath,
    fileId,
    expiresIn: 3600, // 1小时
  });
});

// POST /api/storage/confirm - 确认上传完成
app.post("/confirm", async (c) => {
  const { path, positionId, candidateName, candidateEmail } =
    await c.req.json<{
      path: string;
      positionId: string;
      candidateName?: string;
      candidateEmail?: string;
    }>();

  // 验证文件确实存在
  const { data: fileData, error } = await supabase.storage
    .from("resumes")
    .list(path.split("/").slice(0, -1).join("/"));

  if (error || !fileData) {
    return c.json({ error: "File not found in storage" }, 404);
  }

  // 触发后续处理: 创建候选人 → 解析 → 评分
  // ... 入队处理

  return c.json({
    message: "Upload confirmed, processing started",
    path,
  });
});

export default app;
```

### V.5 Supabase 迁移到自托管检查清单

```markdown
# Supabase Cloud → 自托管迁移检查清单

## 准备阶段
- [ ] 确认服务器规格 (最低: 2核4GB)
- [ ] 安装 Docker + Docker Compose
- [ ] 获取 Supabase 自托管代码: `git clone https://github.com/supabase/supabase`
- [ ] 生成安全密钥:
  - POSTGRES_PASSWORD
  - JWT_SECRET (至少 32 字符)
  - ANON_KEY (从 JWT_SECRET 生成)
  - SERVICE_ROLE_KEY (从 JWT_SECRET 生成)
- [ ] 配置域名和 SSL (Let's Encrypt)

## 数据迁移
- [ ] 在 Supabase Cloud 导出数据: `pg_dump`
- [ ] 在自托管实例导入数据: `psql < dump.sql`
- [ ] 验证数据完整性 (行数对比)
- [ ] 迁移 Storage 文件
- [ ] 迁移 Auth 用户 (注意密码哈希兼容)

## 应用更新
- [ ] 更新 DATABASE_URL 指向自托管实例
- [ ] 更新 SUPABASE_URL 和 API Keys
- [ ] 更新 CORS 配置
- [ ] 测试所有 API 端点

## 验证
- [ ] 数据库连接正常
- [ ] Auth 登录/注册正常
- [ ] Storage 文件上传/下载正常
- [ ] Realtime 订阅正常
- [ ] Edge Functions (如使用) 正常

## 上线后
- [ ] 配置自动备份 (pg_dump cron)
- [ ] 配置监控告警
- [ ] DNS 切换到自托管域名
- [ ] 观察 24 小时无异常后关闭 Cloud 实例

## HR 项目特殊注意
- [ ] 确认 PIPL 合规: 数据存储在中国境内
- [ ] 简历文件加密存储
- [ ] 数据访问审计日志
- [ ] 定期数据保留策略执行
```

---

## Appendix W: Supabase Realtime 深度統合 & リアルタイムダッシュボード

### W.1 Realtime チャンネル管理

```typescript
// src/services/realtime-manager.ts
// Supabase Realtime チャンネル管理
// 採用ダッシュボードのリアルタイム更新

import { createClient } from "@supabase/supabase-js";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_ANON_KEY || ""
);

// イベントタイプ定義
interface RealtimeEvent {
  type: "candidate_new" | "score_updated" | "status_changed" | "position_updated";
  payload: Record<string, unknown>;
  timestamp: string;
}

type EventHandler = (event: RealtimeEvent) => void;

export class RealtimeManager {
  private channels = new Map<string, RealtimeChannel>();
  private handlers = new Map<string, Set<EventHandler>>();

  // 候補者テーブル変更の購読
  subscribeToCandidates(): RealtimeChannel {
    const channelKey = "candidates-changes";

    if (this.channels.has(channelKey)) {
      return this.channels.get(channelKey)!;
    }

    const channel = supabase
      .channel(channelKey)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "candidates",
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const event: RealtimeEvent = {
            type:
              payload.eventType === "INSERT"
                ? "candidate_new"
                : "status_changed",
            payload: {
              old: payload.old,
              new: payload.new,
              eventType: payload.eventType,
            },
            timestamp: new Date().toISOString(),
          };
          this.emit(event);
        }
      )
      .subscribe();

    this.channels.set(channelKey, channel);
    return channel;
  }

  // スコアテーブル変更の購読
  subscribeToScores(): RealtimeChannel {
    const channelKey = "scores-changes";

    if (this.channels.has(channelKey)) {
      return this.channels.get(channelKey)!;
    }

    const channel = supabase
      .channel(channelKey)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scores",
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: "score_updated",
            payload: {
              candidateId: (payload.new as Record<string, unknown>).candidate_id,
              positionId: (payload.new as Record<string, unknown>).position_id,
              totalScore: (payload.new as Record<string, unknown>).total_score,
              grade: (payload.new as Record<string, unknown>).grade,
            },
            timestamp: new Date().toISOString(),
          };
          this.emit(event);
        }
      )
      .subscribe();

    this.channels.set(channelKey, channel);
    return channel;
  }

  // 職位別フィルタリング購読
  subscribeToPosition(positionId: number): RealtimeChannel {
    const channelKey = `position-${positionId}`;

    if (this.channels.has(channelKey)) {
      return this.channels.get(channelKey)!;
    }

    const channel = supabase
      .channel(channelKey)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scores",
          filter: `position_id=eq.${positionId}`,
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: "score_updated",
            payload: {
              positionId,
              ...payload.new as Record<string, unknown>,
            },
            timestamp: new Date().toISOString(),
          };
          this.emit(event);
        }
      )
      .subscribe();

    this.channels.set(channelKey, channel);
    return channel;
  }

  // イベントハンドラ登録
  on(type: RealtimeEvent["type"], handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // unsubscribe 関数を返す
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  // イベント発火
  private emit(event: RealtimeEvent): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`Realtime handler error [${event.type}]:`, err);
        }
      }
    }
  }

  // チャンネル購読解除
  unsubscribe(channelKey: string): void {
    const channel = this.channels.get(channelKey);
    if (channel) {
      supabase.removeChannel(channel);
      this.channels.delete(channelKey);
    }
  }

  // 全チャンネル切断
  disconnectAll(): void {
    for (const [key, channel] of this.channels) {
      supabase.removeChannel(channel);
    }
    this.channels.clear();
    this.handlers.clear();
  }

  // 接続状態
  getStatus(): Array<{ channel: string; state: string }> {
    return [...this.channels.entries()].map(([key, ch]) => ({
      channel: key,
      state: ch.state,
    }));
  }
}

export const realtimeManager = new RealtimeManager();
```

### W.2 SSE (Server-Sent Events) エンドポイント

```typescript
// src/routes/realtime.ts
// SSE エンドポイント: ブラウザへのリアルタイム配信

import { Elysia } from "elysia";
import { Stream } from "@elysiajs/stream";
import { realtimeManager } from "../services/realtime-manager.js";

const app = new Elysia();

// GET /api/realtime/stream - SSE ストリーム
app.get("/stream", async (c) => {
  // Realtime 購読開始
  realtimeManager.subscribeToCandidates();
  realtimeManager.subscribeToScores();

  return streamSSE(c, async (stream) => {
    // 初期接続メッセージ
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        message: "Connected to HR realtime stream",
        channels: realtimeManager.getStatus(),
      }),
    });

    // イベント転送
    const unsubscribers = [
      realtimeManager.on("candidate_new", async (event) => {
        await stream.writeSSE({
          event: "candidate_new",
          data: JSON.stringify(event.payload),
        });
      }),
      realtimeManager.on("score_updated", async (event) => {
        await stream.writeSSE({
          event: "score_updated",
          data: JSON.stringify(event.payload),
        });
      }),
      realtimeManager.on("status_changed", async (event) => {
        await stream.writeSSE({
          event: "status_changed",
          data: JSON.stringify(event.payload),
        });
      }),
    ];

    // ハートビート
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: "heartbeat",
          data: JSON.stringify({ time: new Date().toISOString() }),
        });
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    // 切断時のクリーンアップ
    stream.onAbort(() => {
      clearInterval(heartbeat);
      for (const unsub of unsubscribers) {
        unsub();
      }
    });

    // ストリーム維持（無限待機）
    await new Promise(() => {});
  });
});

// GET /api/realtime/stream/:positionId - 職位別ストリーム
app.get("/stream/:positionId", async (c) => {
  const positionId = parseInt(c.req.param("positionId"), 10);

  if (isNaN(positionId)) {
    return c.json({ error: "Invalid position ID" }, 400);
  }

  realtimeManager.subscribeToPosition(positionId);

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ positionId }),
    });

    const unsub = realtimeManager.on("score_updated", async (event) => {
      if (event.payload.positionId === positionId) {
        await stream.writeSSE({
          event: "score_updated",
          data: JSON.stringify(event.payload),
        });
      }
    });

    stream.onAbort(() => unsub());
    await new Promise(() => {});
  });
});

// GET /api/realtime/status - 接続状態
app.get("/status", async (c) => {
  return c.json({
    channels: realtimeManager.getStatus(),
  });
});

export default app;
```

### W.3 Supabase Database Triggers

```sql
-- drizzle/triggers.sql
-- Supabase Database Triggers: 自動通知 & データ同期

-- 1. 候補者ステータス変更時のログ記録
CREATE OR REPLACE FUNCTION log_candidate_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO candidate_status_log (
      candidate_id, old_status, new_status, changed_at, changed_by
    ) VALUES (
      NEW.id, OLD.status, NEW.status, NOW(),
      current_setting('app.current_user_id', true)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_candidate_status_change
  AFTER UPDATE ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION log_candidate_status_change();

-- 2. スコア挿入時の候補者グレード自動更新
CREATE OR REPLACE FUNCTION update_candidate_grade()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE candidates
  SET
    latest_grade = NEW.grade,
    latest_score = NEW.total_score,
    updated_at = NOW()
  WHERE id = NEW.candidate_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_candidate_grade
  AFTER INSERT ON scores
  FOR EACH ROW
  EXECUTE FUNCTION update_candidate_grade();

-- 3. 統計テーブル自動更新
CREATE OR REPLACE FUNCTION update_position_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO position_stats (
    position_id,
    total_candidates,
    avg_score,
    grade_a_count,
    grade_b_count,
    grade_c_count,
    grade_d_count,
    grade_f_count,
    updated_at
  )
  SELECT
    NEW.position_id,
    COUNT(*),
    AVG(total_score),
    COUNT(*) FILTER (WHERE grade = 'A'),
    COUNT(*) FILTER (WHERE grade = 'B'),
    COUNT(*) FILTER (WHERE grade = 'C'),
    COUNT(*) FILTER (WHERE grade = 'D'),
    COUNT(*) FILTER (WHERE grade = 'F'),
    NOW()
  FROM scores
  WHERE position_id = NEW.position_id
  ON CONFLICT (position_id) DO UPDATE SET
    total_candidates = EXCLUDED.total_candidates,
    avg_score = EXCLUDED.avg_score,
    grade_a_count = EXCLUDED.grade_a_count,
    grade_b_count = EXCLUDED.grade_b_count,
    grade_c_count = EXCLUDED.grade_c_count,
    grade_d_count = EXCLUDED.grade_d_count,
    grade_f_count = EXCLUDED.grade_f_count,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_position_stats
  AFTER INSERT ON scores
  FOR EACH ROW
  EXECUTE FUNCTION update_position_stats();

-- 4. 重複候補者検出
CREATE OR REPLACE FUNCTION check_duplicate_candidate()
RETURNS TRIGGER AS $$
DECLARE
  existing_id INTEGER;
BEGIN
  -- メール or 電話で重複チェック
  SELECT id INTO existing_id
  FROM candidates
  WHERE (email = NEW.email AND email IS NOT NULL)
     OR (phone = NEW.phone AND phone IS NOT NULL)
  LIMIT 1;

  IF existing_id IS NOT NULL AND existing_id != NEW.id THEN
    -- 重複フラグ設定
    NEW.duplicate_of = existing_id;
    NEW.status = 'duplicate';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_check_duplicate
  BEFORE INSERT ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION check_duplicate_candidate();

-- 5. 自動データ保持（90日後に soft delete）
CREATE OR REPLACE FUNCTION auto_archive_old_candidates()
RETURNS void AS $$
BEGIN
  UPDATE candidates
  SET status = 'archived', updated_at = NOW()
  WHERE status IN ('rejected', 'duplicate')
    AND updated_at < NOW() - INTERVAL '90 days'
    AND status != 'archived';

  -- ログ
  RAISE NOTICE 'Archived % candidates',
    (SELECT COUNT(*) FROM candidates WHERE status = 'archived' AND updated_at >= NOW() - INTERVAL '1 minute');
END;
$$ LANGUAGE plpgsql;

-- pg_cron でスケジュール（Supabase ダッシュボードから設定）
-- SELECT cron.schedule('archive-old-candidates', '0 3 * * *', 'SELECT auto_archive_old_candidates()');
```

### W.4 Drizzle スキーマ拡張（Triggers 対応テーブル）

```typescript
// src/db/schema-extended.ts
// Triggers に対応するスキーマ拡張

import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  real,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { candidates, scores } from "./schema.js";

// 候補者ステータス変更ログ
export const candidateStatusLog = pgTable("candidate_status_log", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id")
    .notNull()
    .references(() => candidates.id),
  oldStatus: text("old_status"),
  newStatus: text("new_status").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  changedBy: text("changed_by"),
});

// 職位統計（Trigger で自動更新）
export const positionStats = pgTable(
  "position_stats",
  {
    positionId: integer("position_id").primaryKey(),
    totalCandidates: integer("total_candidates").default(0).notNull(),
    avgScore: real("avg_score"),
    gradeACount: integer("grade_a_count").default(0).notNull(),
    gradeBCount: integer("grade_b_count").default(0).notNull(),
    gradeCCount: integer("grade_c_count").default(0).notNull(),
    gradeDCount: integer("grade_d_count").default(0).notNull(),
    gradeFCount: integer("grade_f_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

// Realtime イベントログ（デバッグ用）
export const realtimeEventLog = pgTable("realtime_event_log", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  tableName: text("table_name").notNull(),
  recordId: integer("record_id"),
  payload: text("payload"),  // JSON text
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

---

## Appendix X: Supabase Edge Functions & サーバーレス拡張

### X.1 Edge Functions 基本構成

```typescript
// supabase/functions/score-resume/index.ts
// Supabase Edge Function: サーバーレス簡歴スコアリング
// Deno ランタイム / Supabase CLI でデプロイ

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ScoreRequest {
  candidateId: number;
  positionId: number;
  resumeText: string;
}

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, content-type, x-client-info",
      },
    });
  }

  try {
    // 認証チェック
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    // Supabase クライアント
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // ユーザー認証確認
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
      });
    }

    const body: ScoreRequest = await req.json();

    // MiniMax M2.5 API 呼び出し
    const minimaxKey = Deno.env.get("MINIMAX_API_KEY");
    const aiResponse = await fetch("https://api.minimaxi.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${minimaxKey}`,
      },
      body: JSON.stringify({
        model: "MiniMax-M2.5",
        messages: [
          {
            role: "system",
            content: "你是 HR 简历评分专家。请以 JSON 格式返回评分结果。",
          },
          {
            role: "user",
            content: `请评估以下简历:\n${body.resumeText}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "{}";

    // <think> タグ除去（MiniMax 特有）
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const scoreData = JSON.parse(cleaned);

    // スコア保存
    const { error: insertError } = await supabase.from("scores").insert({
      candidate_id: body.candidateId,
      position_id: body.positionId,
      total_score: scoreData.totalScore || 0,
      grade: scoreData.grade || "C",
      must_score: scoreData.mustScore || 0,
      nice_score: scoreData.niceScore || 0,
      reject_penalty: scoreData.rejectPenalty || 0,
      matched_skills: scoreData.matchedSkills || [],
      missing_skills: scoreData.missingSkills || [],
      explanation: scoreData.explanation || "",
    });

    if (insertError) {
      throw new Error(`DB insert failed: ${insertError.message}`);
    }

    return new Response(JSON.stringify(scoreData), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500 }
    );
  }
});
```

### X.2 Edge Function: メール通知

```typescript
// supabase/functions/send-notification/index.ts
// 候補者ステータス変更時の自動通知

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

interface NotificationPayload {
  type: "score_ready" | "status_changed" | "interview_scheduled";
  candidateId: number;
  candidateName: string;
  candidateEmail: string;
  details: Record<string, unknown>;
}

serve(async (req: Request) => {
  try {
    const payload: NotificationPayload = await req.json();

    // テンプレート選択
    const templates: Record<string, { subject: string; body: string }> = {
      score_ready: {
        subject: "简历评估完成 - ${candidateName}",
        body: `
您好，

候选人 ${payload.candidateName} 的简历评估已完成。

评分: ${payload.details.totalScore}/100
评级: ${payload.details.grade}

请登录系统查看详情。

HR 智能筛选系统`,
      },
      status_changed: {
        subject: "候选人状态更新 - ${candidateName}",
        body: `
候选人 ${payload.candidateName} 状态已更新为: ${payload.details.newStatus}

原因: ${payload.details.reason || "手动更新"}

HR 智能筛选系统`,
      },
      interview_scheduled: {
        subject: "面试安排通知 - ${candidateName}",
        body: `
${payload.candidateName} 您好，

恭喜您通过简历筛选！
面试时间: ${payload.details.interviewDate}
面试方式: ${payload.details.interviewType}

请准时参加。

HR 智能筛选系统`,
      },
    };

    const template = templates[payload.type];
    if (!template) {
      return new Response(
        JSON.stringify({ error: "Unknown notification type" }),
        { status: 400 }
      );
    }

    // SMTP 送信（Nodemailer 相当の Deno 実装）
    const smtpHost = Deno.env.get("SMTP_HOST") || "mail.ivis-sh.com";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587", 10);
    const smtpUser = Deno.env.get("SMTP_USER") || "";
    const smtpPass = Deno.env.get("SMTP_PASS") || "";

    // Deno SMTP モジュール使用
    const { SMTPClient } = await import(
      "https://deno.land/x/denomailer@1.6.0/mod.ts"
    );

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: { username: smtpUser, password: smtpPass },
      },
    });

    await client.send({
      from: smtpUser,
      to: payload.candidateEmail,
      subject: template.subject.replace(
        "${candidateName}",
        payload.candidateName
      ),
      content: template.body,
    });

    await client.close();

    return new Response(JSON.stringify({ sent: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500 }
    );
  }
});
```

### X.3 Edge Function: 定期レポート生成

```typescript
// supabase/functions/daily-report/index.ts
// 日次レポート生成（Supabase cron trigger から呼び出し）

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // 過去24時間の統計
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 新規候補者数
  const { count: newCandidates } = await supabase
    .from("candidates")
    .select("*", { count: "exact", head: true })
    .gte("created_at", yesterday);

  // 評価完了数
  const { count: newScores } = await supabase
    .from("scores")
    .select("*", { count: "exact", head: true })
    .gte("created_at", yesterday);

  // グレード分布
  const { data: gradeDistribution } = await supabase
    .from("scores")
    .select("grade")
    .gte("created_at", yesterday);

  const gradeCounts: Record<string, number> = {};
  for (const row of gradeDistribution || []) {
    gradeCounts[row.grade] = (gradeCounts[row.grade] || 0) + 1;
  }

  // 平均スコア
  const { data: avgData } = await supabase
    .rpc("get_avg_score_today");

  const report = {
    date: new Date().toISOString().split("T")[0],
    newCandidates: newCandidates || 0,
    newScores: newScores || 0,
    gradeDistribution: gradeCounts,
    averageScore: avgData?.[0]?.avg_score || 0,
    generatedAt: new Date().toISOString(),
  };

  // レポート保存
  await supabase.from("daily_reports").insert({
    report_date: report.date,
    data: report,
  });

  return new Response(JSON.stringify(report), {
    headers: { "Content-Type": "application/json" },
  });
});
```

### X.4 Edge Functions デプロイ & テスト

```bash
#!/bin/bash
# scripts/supabase-functions.sh
# Supabase Edge Functions 管理スクリプト

set -euo pipefail

COMMAND="${1:-help}"

case "$COMMAND" in
  serve)
    # ローカル開発サーバー
    echo "Starting Supabase Functions local server..."
    supabase functions serve \
      --env-file .env.local \
      --no-verify-jwt
    ;;

  deploy)
    # 全 Function デプロイ
    echo "Deploying all Edge Functions..."
    for dir in supabase/functions/*/; do
      fn_name=$(basename "$dir")
      echo "  Deploying: $fn_name"
      supabase functions deploy "$fn_name" --no-verify-jwt
    done
    echo "✅ All functions deployed"
    ;;

  deploy-one)
    # 単一 Function デプロイ
    FN_NAME="${2:?Usage: $0 deploy-one <function-name>}"
    echo "Deploying: $FN_NAME"
    supabase functions deploy "$FN_NAME"
    echo "✅ Deployed: $FN_NAME"
    ;;

  test)
    # ローカルテスト
    FN_NAME="${2:?Usage: $0 test <function-name>}"
    echo "Testing: $FN_NAME"
    curl -sf \
      -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
      -H "Content-Type: application/json" \
      -d '{"test": true}' \
      "http://localhost:54321/functions/v1/${FN_NAME}" | jq .
    ;;

  list)
    # Function 一覧
    echo "Deployed Edge Functions:"
    supabase functions list
    ;;

  logs)
    # ログ確認
    FN_NAME="${2:?Usage: $0 logs <function-name>}"
    supabase functions logs "$FN_NAME" --scroll
    ;;

  *)
    echo "Usage: $0 {serve|deploy|deploy-one|test|list|logs}"
    ;;
esac
```

---

## Appendix Y: Supabase マルチテナント & RBAC 設計

### Y.1 マルチテナントスキーマ設計

```typescript
// src/db/schema-multitenant.ts
// マルチテナント対応スキーマ: 複数企業での HR システム共有

import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// テナント（企業）
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),          // 企业名称
  domain: text("domain"),                 // 企业域名
  plan: text("plan").notNull().default("free"),  // free / pro / enterprise
  settings: jsonb("settings").default({}),       // テナント固有設定
  maxUsers: integer("max_users").default(5),
  maxPositions: integer("max_positions").default(10),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ユーザー（テナントに所属）
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    supabaseUserId: text("supabase_user_id").notNull(), // Supabase Auth UID
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("viewer"),  // admin / manager / recruiter / viewer
    permissions: jsonb("permissions").default([]),
    isActive: boolean("is_active").default(true),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_supabase_uid_idx").on(table.supabaseUserId),
    index("users_tenant_idx").on(table.tenantId),
  ]
);

// テナント別職位（RLS でフィルタ）
export const tenantPositions = pgTable(
  "tenant_positions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: text("title").notNull(),
    department: text("department"),
    description: text("description"),
    mustSkills: jsonb("must_skills").default([]),
    niceSkills: jsonb("nice_skills").default([]),
    rejectKeywords: jsonb("reject_keywords").default([]),
    status: text("status").default("active"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("tenant_positions_tenant_idx").on(table.tenantId),
  ]
);
```

### Y.2 RLS (Row Level Security) ポリシー

```sql
-- drizzle/rls-policies.sql
-- Supabase RLS: テナント分離 & ロール制御

-- テナント分離関数: 現在ユーザーの tenant_id を返す
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS INTEGER AS $$
  SELECT tenant_id FROM users
  WHERE supabase_user_id = auth.uid()::text
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 現在ユーザーのロールを返す
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users
  WHERE supabase_user_id = auth.uid()::text
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ========== tenant_positions RLS ==========
ALTER TABLE tenant_positions ENABLE ROW LEVEL SECURITY;

-- SELECT: 自テナントのデータのみ参照可能
CREATE POLICY "tenant_positions_select"
  ON tenant_positions FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- INSERT: manager 以上が作成可能
CREATE POLICY "tenant_positions_insert"
  ON tenant_positions FOR INSERT
  WITH CHECK (
    tenant_id = get_current_tenant_id()
    AND get_current_user_role() IN ('admin', 'manager')
  );

-- UPDATE: manager 以上が更新可能
CREATE POLICY "tenant_positions_update"
  ON tenant_positions FOR UPDATE
  USING (
    tenant_id = get_current_tenant_id()
    AND get_current_user_role() IN ('admin', 'manager')
  );

-- DELETE: admin のみ削除可能
CREATE POLICY "tenant_positions_delete"
  ON tenant_positions FOR DELETE
  USING (
    tenant_id = get_current_tenant_id()
    AND get_current_user_role() = 'admin'
  );

-- ========== candidates RLS ==========
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidates_tenant_isolation"
  ON candidates FOR ALL
  USING (tenant_id = get_current_tenant_id());

-- ========== scores RLS ==========
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scores_tenant_isolation"
  ON scores FOR ALL
  USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE tenant_id = get_current_tenant_id()
    )
  );

-- ========== users RLS ==========
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 自テナントのユーザーのみ参照可能
CREATE POLICY "users_select_own_tenant"
  ON users FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- admin のみユーザー管理可能
CREATE POLICY "users_manage"
  ON users FOR ALL
  USING (
    tenant_id = get_current_tenant_id()
    AND get_current_user_role() = 'admin'
  );
```

### Y.3 テナント管理ミドルウェア

```typescript
// src/middleware/tenant.ts
// Elysia ミドルウェア: テナント分離の強制

import { Elysia } from "elysia";
import { db } from "../db/index.js";
import { users, tenants } from "../db/schema-multitenant.js";
import { eq, and } from "drizzle-orm";

interface TenantContext {
  tenantId: number;
  tenantName: string;
  userId: number;
  userRole: string;
  permissions: string[];
}

// テナントミドルウェア
export const tenantMiddleware = createMiddleware<{
  Variables: { tenant: TenantContext };
}>(async (c, next) => {
  // Supabase Auth トークンからユーザー取得
  const supabaseUserId = c.get("user")?.id;

  if (!supabaseUserId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // ユーザー + テナント情報取得
  const [userRecord] = await db
    .select({
      userId: users.id,
      tenantId: users.tenantId,
      tenantName: tenants.name,
      role: users.role,
      permissions: users.permissions,
      isActive: users.isActive,
      tenantActive: tenants.isActive,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(eq(users.supabaseUserId, supabaseUserId))
    .limit(1);

  if (!userRecord) {
    return c.json({ error: "User not found in any tenant" }, 403);
  }

  if (!userRecord.isActive || !userRecord.tenantActive) {
    return c.json({ error: "Account or tenant is disabled" }, 403);
  }

  c.set("tenant", {
    tenantId: userRecord.tenantId,
    tenantName: userRecord.tenantName,
    userId: userRecord.userId,
    userRole: userRecord.role,
    permissions: (userRecord.permissions as string[]) || [],
  });

  await next();
});

// ロール検証ミドルウェア
export function requireRole(...roles: string[]) {
  return createMiddleware(async (c, next) => {
    const tenant = c.get("tenant") as TenantContext | undefined;
    if (!tenant) {
      return c.json({ error: "Tenant context required" }, 500);
    }

    if (!roles.includes(tenant.userRole)) {
      return c.json(
        { error: `Requires role: ${roles.join(" or ")}` },
        403
      );
    }

    await next();
  });
}

// パーミッション検証
export function requirePermission(permission: string) {
  return createMiddleware(async (c, next) => {
    const tenant = c.get("tenant") as TenantContext | undefined;
    if (!tenant) {
      return c.json({ error: "Tenant context required" }, 500);
    }

    // admin は全権限
    if (tenant.userRole === "admin") {
      await next();
      return;
    }

    if (!tenant.permissions.includes(permission)) {
      return c.json({ error: `Missing permission: ${permission}` }, 403);
    }

    await next();
  });
}
```

### Y.4 テナント管理 API

```typescript
// src/routes/tenants.ts
import { Elysia } from "elysia";
import { tenantMiddleware, requireRole } from "../middleware/tenant.js";
import { db } from "../db/index.js";
import { tenants, users } from "../db/schema-multitenant.js";
import { eq } from "drizzle-orm";

const app = new Elysia();

// テナント情報取得
app.get("/current", tenantMiddleware, async (c) => {
  const { tenantId } = c.get("tenant");

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  return c.json({ tenant });
});

// テナントユーザー一覧（admin のみ）
app.get(
  "/users",
  tenantMiddleware,
  requireRole("admin"),
  async (c) => {
    const { tenantId } = c.get("tenant");

    const userList = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    return c.json({ users: userList });
  }
);

// ユーザーロール更新（admin のみ）
app.patch(
  "/users/:userId/role",
  tenantMiddleware,
  requireRole("admin"),
  async (c) => {
    const userId = parseInt(c.req.param("userId"), 10);
    const { role } = await c.req.json();

    const validRoles = ["admin", "manager", "recruiter", "viewer"];
    if (!validRoles.includes(role)) {
      return c.json({ error: `Invalid role. Valid: ${validRoles.join(", ")}` }, 400);
    }

    const { tenantId } = c.get("tenant");

    await db
      .update(users)
      .set({ role })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

    return c.json({ success: true, userId, role });
  }
);

export default app;
```

---

## Appendix Z: Supabase Materialized Views & 分析ダッシュボード

### Z.1 Materialized Views 定義

```sql
-- drizzle/materialized-views.sql
-- 分析ダッシュボード用 Materialized Views

-- 1. 日次採用サマリー
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_recruitment_summary AS
SELECT
  DATE(s.created_at) as report_date,
  p.id as position_id,
  p.title as position_title,
  p.department,
  COUNT(DISTINCT s.candidate_id) as total_candidates,
  AVG(s.total_score)::numeric(5,1) as avg_score,
  COUNT(*) FILTER (WHERE s.grade = 'A') as grade_a,
  COUNT(*) FILTER (WHERE s.grade = 'B') as grade_b,
  COUNT(*) FILTER (WHERE s.grade = 'C') as grade_c,
  COUNT(*) FILTER (WHERE s.grade = 'D') as grade_d,
  COUNT(*) FILTER (WHERE s.grade = 'F') as grade_f,
  COUNT(*) FILTER (WHERE s.grade IN ('A', 'B')) as interview_ready,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s.total_score)::numeric(5,1) as median_score,
  MAX(s.total_score) as max_score,
  MIN(s.total_score) as min_score
FROM scores s
INNER JOIN positions p ON p.id = s.position_id
GROUP BY DATE(s.created_at), p.id, p.title, p.department
ORDER BY report_date DESC, position_id;

-- 一意インデックス（REFRESH CONCURRENTLY に必要）
CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_recruitment_idx
  ON mv_daily_recruitment_summary (report_date, position_id);

-- 2. スキルトレンド分析
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_skill_trends AS
SELECT
  skill,
  DATE_TRUNC('week', c.created_at) as week,
  COUNT(*) as candidate_count,
  AVG(s.total_score)::numeric(5,1) as avg_score_with_skill,
  COUNT(*) FILTER (WHERE s.grade IN ('A', 'B')) as high_grade_count
FROM candidates c
CROSS JOIN LATERAL unnest(c.skills) as skill
LEFT JOIN scores s ON s.candidate_id = c.id
GROUP BY skill, DATE_TRUNC('week', c.created_at)
HAVING COUNT(*) >= 2
ORDER BY week DESC, candidate_count DESC;

CREATE UNIQUE INDEX IF NOT EXISTS mv_skill_trends_idx
  ON mv_skill_trends (skill, week);

-- 3. 候補者ファネル分析
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_candidate_funnel AS
SELECT
  p.id as position_id,
  p.title as position_title,
  COUNT(DISTINCT c.id) as total_applied,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status != 'duplicate') as unique_candidates,
  COUNT(DISTINCT c.id) FILTER (WHERE s.grade IN ('A', 'B')) as passed_screening,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'shortlisted') as shortlisted,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'interview') as interviewed,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'offered') as offered,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'rejected') as rejected,
  -- 変換率
  CASE WHEN COUNT(DISTINCT c.id) > 0
    THEN ROUND(COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'shortlisted')::numeric /
         COUNT(DISTINCT c.id) * 100, 1)
    ELSE 0
  END as screening_pass_rate,
  CASE WHEN COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'interview') > 0
    THEN ROUND(COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'offered')::numeric /
         COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'interview') * 100, 1)
    ELSE 0
  END as offer_rate
FROM positions p
LEFT JOIN candidates c ON TRUE
LEFT JOIN scores s ON s.candidate_id = c.id AND s.position_id = p.id
GROUP BY p.id, p.title;

CREATE UNIQUE INDEX IF NOT EXISTS mv_candidate_funnel_idx
  ON mv_candidate_funnel (position_id);

-- 4. ソース効果分析
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_source_effectiveness AS
SELECT
  c.source,
  COUNT(*) as total_candidates,
  AVG(s.total_score)::numeric(5,1) as avg_score,
  COUNT(*) FILTER (WHERE s.grade IN ('A', 'B'))::numeric /
    NULLIF(COUNT(*), 0) * 100 as quality_rate,
  COUNT(*) FILTER (WHERE c.status = 'offered')::numeric /
    NULLIF(COUNT(*), 0) * 100 as conversion_rate
FROM candidates c
LEFT JOIN scores s ON s.candidate_id = c.id
GROUP BY c.source;

CREATE UNIQUE INDEX IF NOT EXISTS mv_source_effectiveness_idx
  ON mv_source_effectiveness (source);

-- リフレッシュ関数
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_recruitment_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_trends;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_candidate_funnel;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_source_effectiveness;
  RAISE NOTICE 'All materialized views refreshed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- pg_cron でスケジュール（毎時リフレッシュ）
-- SELECT cron.schedule('refresh-mv', '0 * * * *', 'SELECT refresh_all_materialized_views()');
```

### Z.2 ダッシュボードデータ API

```typescript
// src/routes/dashboard.ts
// 分析ダッシュボード API

import { Elysia } from "elysia";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

const app = new Elysia();

// GET /api/dashboard/summary - 日次サマリー
app.get("/summary", async (c) => {
  const days = parseInt(c.req.query("days") || "30", 10);

  const result = await db.execute(sql`
    SELECT *
    FROM mv_daily_recruitment_summary
    WHERE report_date >= CURRENT_DATE - ${days}
    ORDER BY report_date DESC, position_id
  `);

  return c.json({ data: result.rows });
});

// GET /api/dashboard/skills - スキルトレンド
app.get("/skills", async (c) => {
  const weeks = parseInt(c.req.query("weeks") || "12", 10);

  const result = await db.execute(sql`
    SELECT *
    FROM mv_skill_trends
    WHERE week >= CURRENT_DATE - (${weeks} * 7)
    ORDER BY week DESC, candidate_count DESC
    LIMIT 100
  `);

  return c.json({ data: result.rows });
});

// GET /api/dashboard/funnel - ファネル分析
app.get("/funnel", async (c) => {
  const result = await db.execute(sql`
    SELECT * FROM mv_candidate_funnel
    ORDER BY total_applied DESC
  `);

  return c.json({ data: result.rows });
});

// GET /api/dashboard/sources - ソース効果分析
app.get("/sources", async (c) => {
  const result = await db.execute(sql`
    SELECT * FROM mv_source_effectiveness
    ORDER BY total_candidates DESC
  `);

  return c.json({ data: result.rows });
});

// POST /api/dashboard/refresh - 手動リフレッシュ
app.post("/refresh", async (c) => {
  const startTime = Date.now();

  await db.execute(sql`SELECT refresh_all_materialized_views()`);

  return c.json({
    refreshed: true,
    durationMs: Date.now() - startTime,
  });
});

// GET /api/dashboard/kpi - KPI サマリー
app.get("/kpi", async (c) => {
  const [totals] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM candidates WHERE created_at >= CURRENT_DATE - 7) as new_candidates_7d,
      (SELECT COUNT(*) FROM candidates WHERE created_at >= CURRENT_DATE - 30) as new_candidates_30d,
      (SELECT COUNT(*) FROM scores WHERE created_at >= CURRENT_DATE - 7) as scores_7d,
      (SELECT AVG(total_score) FROM scores WHERE created_at >= CURRENT_DATE - 7)::numeric(5,1) as avg_score_7d,
      (SELECT COUNT(*) FROM candidates WHERE status = 'shortlisted') as total_shortlisted,
      (SELECT COUNT(*) FROM candidates WHERE status = 'interview') as total_interviewing,
      (SELECT COUNT(*) FROM candidates WHERE status = 'offered') as total_offered,
      (SELECT COUNT(*) FROM positions WHERE status = 'active') as active_positions
  `).then((r) => [r.rows[0]]);

  return c.json({ kpi: totals });
});

export default app;
```

---

## Appendix AA: Supabase Storage — 履歴書ファイル管理・署名付きURL・CDN統合

### AA.1 Storage バケット設計

```typescript
// src/services/storage-manager.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";
import { createReadStream, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { randomUUID } from "node:crypto";

interface StorageBucket {
  name: string;
  public: boolean;
  fileSizeLimit: number; // bytes
  allowedMimeTypes: string[];
}

// バケット定義
const BUCKETS: Record<string, StorageBucket> = {
  resumes: {
    name: "resumes",
    public: false, // 非公開 — 署名付きURLでのみアクセス
    fileSizeLimit: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
  },
  avatars: {
    name: "avatars",
    public: true, // 公開 — CDN経由で直接アクセス
    fileSizeLimit: 2 * 1024 * 1024, // 2MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  exports: {
    name: "exports",
    public: false,
    fileSizeLimit: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/pdf",
    ],
  },
  attachments: {
    name: "attachments",
    public: false,
    fileSizeLimit: 20 * 1024 * 1024, // 20MB
    allowedMimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/zip",
    ],
  },
};

export class StorageManager {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }

  // バケット初期化（起動時に実行）
  async initializeBuckets(): Promise<void> {
    for (const [key, config] of Object.entries(BUCKETS)) {
      const { data: existing } = await this.supabase.storage.getBucket(config.name);

      if (!existing) {
        const { error } = await this.supabase.storage.createBucket(config.name, {
          public: config.public,
          fileSizeLimit: config.fileSizeLimit,
          allowedMimeTypes: config.allowedMimeTypes,
        });
        if (error) {
          console.error(`Failed to create bucket ${config.name}:`, error.message);
        } else {
          console.log(`Created bucket: ${config.name}`);
        }
      } else {
        // 既存バケットの設定更新
        await this.supabase.storage.updateBucket(config.name, {
          public: config.public,
          fileSizeLimit: config.fileSizeLimit,
          allowedMimeTypes: config.allowedMimeTypes,
        });
      }
    }
  }

  // 履歴書アップロード（候補者IDベースのパス）
  async uploadResume(
    candidateId: string,
    fileBuffer: Buffer,
    fileName: string,
    contentType: string
  ): Promise<{ path: string; url: string }> {
    const ext = extname(fileName);
    const safeName = `${candidateId}/${randomUUID()}${ext}`;

    const { data, error } = await this.supabase.storage
      .from("resumes")
      .upload(safeName, fileBuffer, {
        contentType,
        cacheControl: "3600",
        upsert: false, // 重複防止
      });

    if (error) {
      throw new Error(`Resume upload failed: ${error.message}`);
    }

    // 署名付きURL生成（1時間有効）
    const { data: signedData } = await this.supabase.storage
      .from("resumes")
      .createSignedUrl(data.path, 3600);

    return {
      path: data.path,
      url: signedData?.signedUrl ?? "",
    };
  }

  // 署名付きURL生成（ダウンロード用）
  async getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn, {
        download: true, // Content-Disposition: attachment
      });

    if (error) {
      throw new Error(`Signed URL generation failed: ${error.message}`);
    }

    return data.signedUrl;
  }

  // 署名付きアップロードURL（フロントエンドからの直接アップロード用）
  async createSignedUploadUrl(
    bucket: string,
    path: string
  ): Promise<{ signedUrl: string; token: string; path: string }> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error) {
      throw new Error(`Signed upload URL failed: ${error.message}`);
    }

    return data;
  }

  // バッチ署名付きURL（複数ファイル一括）
  async getBatchSignedUrls(
    bucket: string,
    paths: string[],
    expiresIn: number = 3600
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    // 並列で署名付きURL生成
    const promises = paths.map(async (path) => {
      const { data } = await this.supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);
      if (data) {
        results.set(path, data.signedUrl);
      }
    });

    await Promise.all(promises);
    return results;
  }

  // ファイル削除
  async deleteFile(bucket: string, path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(bucket).remove([path]);
    if (error) {
      throw new Error(`File deletion failed: ${error.message}`);
    }
  }

  // 候補者の全ファイル削除（GDPR対応）
  async deleteCandidateFiles(candidateId: string): Promise<number> {
    let deletedCount = 0;

    for (const bucketName of ["resumes", "avatars", "attachments"]) {
      const { data: files } = await this.supabase.storage
        .from(bucketName)
        .list(candidateId);

      if (files && files.length > 0) {
        const paths = files.map((f) => `${candidateId}/${f.name}`);
        await this.supabase.storage.from(bucketName).remove(paths);
        deletedCount += paths.length;
      }
    }

    return deletedCount;
  }

  // ファイルメタデータ取得
  async getFileMetadata(bucket: string, path: string) {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .list(path.split("/").slice(0, -1).join("/"), {
        search: path.split("/").pop(),
      });

    if (error || !data || data.length === 0) {
      return null;
    }

    const file = data[0];
    return {
      name: file.name,
      size: file.metadata?.size ?? 0,
      contentType: file.metadata?.mimetype ?? "unknown",
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      lastAccessedAt: file.last_accessed_at,
    };
  }

  // フォルダ内ファイル一覧
  async listFiles(
    bucket: string,
    folder: string,
    options?: { limit?: number; offset?: number; sortBy?: { column: string; order: "asc" | "desc" } }
  ) {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .list(folder, {
        limit: options?.limit ?? 100,
        offset: options?.offset ?? 0,
        sortBy: options?.sortBy ?? { column: "created_at", order: "desc" },
      });

    if (error) {
      throw new Error(`List files failed: ${error.message}`);
    }

    return data;
  }

  // ストレージ使用量サマリー
  async getStorageUsage(): Promise<Record<string, { fileCount: number; totalSize: number }>> {
    const usage: Record<string, { fileCount: number; totalSize: number }> = {};

    for (const bucketName of Object.keys(BUCKETS)) {
      const { data: files } = await this.supabase.storage.from(bucketName).list("", {
        limit: 10000,
      });

      let totalSize = 0;
      let fileCount = 0;

      if (files) {
        for (const file of files) {
          if (file.metadata?.size) {
            totalSize += file.metadata.size;
            fileCount++;
          }
        }
      }

      usage[bucketName] = { fileCount, totalSize };
    }

    return usage;
  }
}
```

### AA.2 RLS ストレージポリシー

```sql
-- Supabase Storage RLS ポリシー（SQL Editor で実行）

-- === resumes バケット ===

-- 認証済みユーザーのみアップロード可能
CREATE POLICY "authenticated_upload_resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] IS NOT NULL
);

-- HR ロールのみ閲覧可能
CREATE POLICY "hr_read_resumes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND (
    auth.jwt() ->> 'role' = 'hr_manager'
    OR auth.jwt() ->> 'role' = 'hr_admin'
    OR auth.jwt() ->> 'role' = 'recruiter'
  )
);

-- 管理者のみ削除可能
CREATE POLICY "admin_delete_resumes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'resumes'
  AND auth.jwt() ->> 'role' = 'hr_admin'
);

-- === avatars バケット（公開） ===

-- 誰でも閲覧可能
CREATE POLICY "public_read_avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- 認証済みユーザーがアップロード可能（自分のフォルダのみ）
CREATE POLICY "authenticated_upload_avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 自分のアバターのみ更新可能
CREATE POLICY "own_update_avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- === exports バケット ===

-- 作成者のみ閲覧可能
CREATE POLICY "creator_read_exports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'exports'
  AND owner_id = auth.uid()
);

-- HR ユーザーがエクスポート作成可能
CREATE POLICY "hr_create_exports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exports'
  AND (
    auth.jwt() ->> 'role' = 'hr_manager'
    OR auth.jwt() ->> 'role' = 'hr_admin'
  )
);

-- === 自動クリーンアップ（期限切れエクスポート削除） ===

CREATE OR REPLACE FUNCTION cleanup_expired_exports()
RETURNS void AS $$
BEGIN
  -- 7日以上前のエクスポートファイルを削除
  DELETE FROM storage.objects
  WHERE bucket_id = 'exports'
    AND created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- pg_cron でスケジュール（毎日 3:00 AM）
SELECT cron.schedule(
  'cleanup-exports',
  '0 3 * * *',
  'SELECT cleanup_expired_exports()'
);
```

### AA.3 フロントエンドから直接アップロード（Presigned URL）

```typescript
// src/routes/storage.ts
import { Elysia } from "elysia";
import { StorageManager } from "../services/storage-manager.js";
import { z } from "zod/v4";
import { randomUUID } from "node:crypto";

const app = new Elysia();
const storage = new StorageManager();

// 署名付きアップロードURL取得（フロントエンドから直接アップロード）
const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ]),
  candidateId: z.string().uuid(),
});

app.post("/presigned-upload", async (c) => {
  const body = await c.req.json();
  const parsed = uploadRequestSchema.parse(body);

  const ext = parsed.fileName.split(".").pop() ?? "pdf";
  const storagePath = `${parsed.candidateId}/${randomUUID()}.${ext}`;

  const { signedUrl, token, path } = await storage.createSignedUploadUrl(
    "resumes",
    storagePath
  );

  return c.json({
    uploadUrl: signedUrl,
    token,
    path,
    expiresIn: 3600,
    // フロントエンドへの指示
    instructions: {
      method: "PUT",
      headers: {
        "Content-Type": parsed.contentType,
        Authorization: `Bearer ${token}`,
      },
    },
  });
});

// 署名付きダウンロードURL取得
app.get("/download/:bucket/:path{.+}", async (c) => {
  const bucket = c.req.param("bucket");
  const path = c.req.param("path");

  const url = await storage.getSignedUrl(bucket, path, 3600);
  return c.json({ url, expiresIn: 3600 });
});

// バッチダウンロードURL取得
app.post("/batch-download", async (c) => {
  const { bucket, paths } = await c.req.json<{
    bucket: string;
    paths: string[];
  }>();

  const urls = await storage.getBatchSignedUrls(bucket, paths);
  return c.json({
    urls: Object.fromEntries(urls),
    expiresIn: 3600,
  });
});

// ストレージ使用量
app.get("/usage", async (c) => {
  const usage = await storage.getStorageUsage();
  return c.json({ usage });
});

// 候補者ファイル一覧
app.get("/candidates/:id/files", async (c) => {
  const candidateId = c.req.param("id");

  const [resumes, avatars, attachments] = await Promise.all([
    storage.listFiles("resumes", candidateId),
    storage.listFiles("avatars", candidateId),
    storage.listFiles("attachments", candidateId),
  ]);

  return c.json({
    resumes,
    avatars,
    attachments,
    totalFiles: resumes.length + avatars.length + attachments.length,
  });
});

// GDPR: 候補者データ完全削除
app.delete("/candidates/:id/files", async (c) => {
  const candidateId = c.req.param("id");
  const deletedCount = await storage.deleteCandidateFiles(candidateId);
  return c.json({ deleted: deletedCount });
});

export default app;
```

### AA.4 CDN統合・画像変換

```typescript
// src/services/storage-cdn.ts
import { env } from "../env.js";

interface TransformOptions {
  width?: number;
  height?: number;
  resize?: "cover" | "contain" | "fill";
  quality?: number; // 1-100
  format?: "origin" | "webp" | "avif";
}

export class StorageCDN {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${env.SUPABASE_URL}/storage/v1`;
  }

  // 公開バケットのCDN URL
  getPublicUrl(bucket: string, path: string): string {
    return `${this.baseUrl}/object/public/${bucket}/${path}`;
  }

  // 画像変換URL（Supabase Image Transformation）
  getTransformedUrl(
    bucket: string,
    path: string,
    options: TransformOptions
  ): string {
    const params = new URLSearchParams();

    if (options.width) params.set("width", options.width.toString());
    if (options.height) params.set("height", options.height.toString());
    if (options.resize) params.set("resize", options.resize);
    if (options.quality) params.set("quality", options.quality.toString());
    if (options.format) params.set("format", options.format);

    return `${this.baseUrl}/render/image/public/${bucket}/${path}?${params.toString()}`;
  }

  // アバター用プリセットURL
  getAvatarUrl(candidateId: string, fileName: string, size: "sm" | "md" | "lg" = "md"): string {
    const sizes = {
      sm: { width: 48, height: 48 },
      md: { width: 128, height: 128 },
      lg: { width: 256, height: 256 },
    };

    return this.getTransformedUrl("avatars", `${candidateId}/${fileName}`, {
      ...sizes[size],
      resize: "cover",
      quality: 80,
      format: "webp",
    });
  }

  // サムネイル生成URL
  getThumbnailUrl(bucket: string, path: string): string {
    return this.getTransformedUrl(bucket, path, {
      width: 200,
      height: 200,
      resize: "contain",
      quality: 60,
      format: "webp",
    });
  }

  // レスポンシブ画像セット（srcset用）
  getResponsiveUrls(
    bucket: string,
    path: string,
    widths: number[] = [320, 640, 960, 1280]
  ): string {
    return widths
      .map((w) => {
        const url = this.getTransformedUrl(bucket, path, {
          width: w,
          resize: "contain",
          quality: 80,
          format: "webp",
        });
        return `${url} ${w}w`;
      })
      .join(", ");
  }
}

// CDN キャッシュヘッダー設定
export function getCacheHeaders(fileType: string): Record<string, string> {
  const cacheConfigs: Record<string, string> = {
    avatar: "public, max-age=86400, s-maxage=604800", // 1日/7日
    resume: "private, max-age=3600", // 1時間（非公開）
    export: "private, max-age=600, must-revalidate", // 10分
    image: "public, max-age=604800, immutable", // 7日（不変）
  };

  return {
    "Cache-Control": cacheConfigs[fileType] ?? "private, no-cache",
    Vary: "Accept-Encoding",
  };
}
```

### AA.5 ファイルアップロード ミドルウェア（バリデーション）

```typescript
// src/middleware/upload-validator.ts
import { Context, Next } from "elysia";
import { z } from "zod/v4";

const MIME_SIGNATURES: Record<string, Buffer> = {
  "application/pdf": Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": Buffer.from([
    0x50, 0x4b, 0x03, 0x04, // PK.. (ZIP)
  ]),
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};

interface UploadConfig {
  maxSize: number;
  allowedTypes: string[];
  maxFiles?: number;
}

export function uploadValidator(config: UploadConfig) {
  return async (c: Context, next: Next) => {
    const contentType = c.req.header("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return c.json({ error: "Content-Type must be multipart/form-data" }, 400);
    }

    const formData = await c.req.formData();
    const files: File[] = [];

    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        files.push(value);
      }
    }

    // ファイル数チェック
    if (config.maxFiles && files.length > config.maxFiles) {
      return c.json({
        error: `Too many files. Maximum: ${config.maxFiles}`,
      }, 400);
    }

    // 各ファイルのバリデーション
    for (const file of files) {
      // サイズチェック
      if (file.size > config.maxSize) {
        return c.json({
          error: `File "${file.name}" exceeds max size of ${Math.round(config.maxSize / 1024 / 1024)}MB`,
        }, 400);
      }

      // MIME タイプチェック
      if (!config.allowedTypes.includes(file.type)) {
        return c.json({
          error: `File type "${file.type}" not allowed. Allowed: ${config.allowedTypes.join(", ")}`,
        }, 400);
      }

      // マジックバイト検証（拡張子偽装対策）
      const buffer = Buffer.from(await file.arrayBuffer());
      const expectedSignature = MIME_SIGNATURES[file.type];

      if (expectedSignature) {
        const fileSignature = buffer.subarray(0, expectedSignature.length);
        if (!fileSignature.equals(expectedSignature)) {
          return c.json({
            error: `File "${file.name}" content does not match declared type "${file.type}"`,
          }, 400);
        }
      }

      // ファイル名サニタイズ
      const sanitizedName = file.name
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, "_")
        .replace(/_{2,}/g, "_")
        .substring(0, 200);

      if (sanitizedName !== file.name) {
        console.warn(`Sanitized file name: "${file.name}" -> "${sanitizedName}"`);
      }
    }

    // バリデーション済みファイルをコンテキストに保存
    c.set("validatedFiles", files);
    await next();
  };
}

// ウイルススキャン統合（ClamAV）
export async function scanFileForVirus(buffer: Buffer): Promise<{ safe: boolean; threat?: string }> {
  try {
    // ClamAV TCP ソケット接続
    const net = await import("node:net");
    const client = new net.Socket();

    return new Promise((resolve) => {
      client.connect(3310, "localhost", () => {
        // INSTREAM コマンド
        client.write("zINSTREAM\0");

        // チャンクサイズ + データ送信
        const chunkSize = Buffer.alloc(4);
        chunkSize.writeUInt32BE(buffer.length);
        client.write(chunkSize);
        client.write(buffer);

        // 終端（サイズ0）
        const end = Buffer.alloc(4);
        end.writeUInt32BE(0);
        client.write(end);
      });

      let response = "";
      client.on("data", (data) => {
        response += data.toString();
      });

      client.on("end", () => {
        if (response.includes("OK")) {
          resolve({ safe: true });
        } else {
          const match = response.match(/: (.+) FOUND/);
          resolve({ safe: false, threat: match?.[1] ?? "Unknown threat" });
        }
      });

      client.on("error", () => {
        // ClamAV unavailable — デフォルトで安全とみなす（ログ出力）
        console.warn("ClamAV not available, skipping virus scan");
        resolve({ safe: true });
      });
    });
  } catch {
    return { safe: true };
  }
}
```

### AA.6 ストレージライフサイクル管理

```typescript
// src/services/storage-lifecycle.ts
import { StorageManager } from "./storage-manager.js";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

interface LifecycleRule {
  bucket: string;
  condition: "age" | "status" | "size";
  threshold: number | string;
  action: "delete" | "archive" | "compress";
}

const LIFECYCLE_RULES: LifecycleRule[] = [
  // 不採用候補者の履歴書を90日後に削除
  { bucket: "resumes", condition: "status", threshold: "rejected", action: "delete" },
  // エクスポートファイルを7日後に削除
  { bucket: "exports", condition: "age", threshold: 7, action: "delete" },
  // 180日以上前の履歴書をアーカイブ
  { bucket: "resumes", condition: "age", threshold: 180, action: "archive" },
];

export class StorageLifecycle {
  private storage: StorageManager;

  constructor() {
    this.storage = new StorageManager();
  }

  // ライフサイクルルール実行（日次バッチ）
  async executeRules(): Promise<{
    processed: number;
    deleted: number;
    archived: number;
    errors: string[];
  }> {
    const result = { processed: 0, deleted: 0, archived: 0, errors: [] as string[] };

    for (const rule of LIFECYCLE_RULES) {
      try {
        switch (rule.condition) {
          case "age": {
            const daysOld = rule.threshold as number;
            const cutoff = new Date(Date.now() - daysOld * 86400000);

            const files = await this.storage.listFiles(rule.bucket, "", { limit: 1000 });
            const oldFiles = files.filter(
              (f) => new Date(f.created_at) < cutoff
            );

            for (const file of oldFiles) {
              if (rule.action === "delete") {
                await this.storage.deleteFile(rule.bucket, file.name);
                result.deleted++;
              } else if (rule.action === "archive") {
                // アーカイブバケットに移動
                result.archived++;
              }
              result.processed++;
            }
            break;
          }

          case "status": {
            const status = rule.threshold as string;

            // 対象ステータスの候補者を取得
            const candidates = await db.execute(sql`
              SELECT id FROM candidates
              WHERE status = ${status}
              AND updated_at < NOW() - INTERVAL '90 days'
            `);

            for (const candidate of candidates.rows) {
              const deletedCount = await this.storage.deleteCandidateFiles(
                candidate.id as string
              );
              result.deleted += deletedCount;
              result.processed++;
            }
            break;
          }
        }
      } catch (error) {
        result.errors.push(
          `Rule ${rule.bucket}/${rule.condition}: ${(error as Error).message}`
        );
      }
    }

    return result;
  }

  // ストレージ使用量アラート
  async checkStorageAlerts(): Promise<string[]> {
    const alerts: string[] = [];
    const usage = await this.storage.getStorageUsage();

    const limits: Record<string, number> = {
      resumes: 5 * 1024 * 1024 * 1024, // 5GB
      avatars: 1 * 1024 * 1024 * 1024, // 1GB
      exports: 2 * 1024 * 1024 * 1024, // 2GB
      attachments: 3 * 1024 * 1024 * 1024, // 3GB
    };

    for (const [bucket, stats] of Object.entries(usage)) {
      const limit = limits[bucket];
      if (limit) {
        const usagePercent = (stats.totalSize / limit) * 100;
        if (usagePercent > 90) {
          alerts.push(
            `CRITICAL: ${bucket} at ${usagePercent.toFixed(1)}% (${formatBytes(stats.totalSize)} / ${formatBytes(limit)})`
          );
        } else if (usagePercent > 75) {
          alerts.push(
            `WARNING: ${bucket} at ${usagePercent.toFixed(1)}% (${formatBytes(stats.totalSize)} / ${formatBytes(limit)})`
          );
        }
      }
    }

    return alerts;
  }

  // 重複ファイル検出
  async findDuplicateFiles(bucket: string): Promise<Array<{
    hash: string;
    paths: string[];
    size: number;
    savingsBytes: number;
  }>> {
    // ファイルハッシュベースの重複検出
    const { createHash } = await import("node:crypto");
    const files = await this.storage.listFiles(bucket, "", { limit: 10000 });
    const hashMap = new Map<string, { paths: string[]; size: number }>();

    // Note: 実際のSupabase Storage APIでは直接ファイル内容を取得する必要あり
    // ここではメタデータベースの簡易実装
    for (const file of files) {
      const key = `${file.metadata?.size ?? 0}_${file.metadata?.mimetype ?? ""}`;
      const existing = hashMap.get(key);
      if (existing) {
        existing.paths.push(file.name);
      } else {
        hashMap.set(key, {
          paths: [file.name],
          size: file.metadata?.size ?? 0,
        });
      }
    }

    return Array.from(hashMap.entries())
      .filter(([, v]) => v.paths.length > 1)
      .map(([hash, v]) => ({
        hash,
        paths: v.paths,
        size: v.size,
        savingsBytes: v.size * (v.paths.length - 1),
      }));
  }
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}
```

### AA.7 テスト

```typescript
// test/storage-manager.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StorageManager } from "../src/services/storage-manager.js";
import { StorageCDN, getCacheHeaders } from "../src/services/storage-cdn.js";

describe("StorageManager", () => {
  let storage: StorageManager;

  beforeEach(() => {
    storage = new StorageManager();
  });

  it("should generate presigned upload URL", async () => {
    const result = await storage.createSignedUploadUrl(
      "resumes",
      "test-candidate/test.pdf"
    );

    expect(result).toHaveProperty("signedUrl");
    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("path");
  });

  it("should delete all candidate files for GDPR", async () => {
    const deletedCount = await storage.deleteCandidateFiles("test-candidate-id");
    expect(deletedCount).toBeGreaterThanOrEqual(0);
  });
});

describe("StorageCDN", () => {
  const cdn = new StorageCDN();

  it("should generate avatar URL with size presets", () => {
    const url = cdn.getAvatarUrl("candidate-1", "photo.jpg", "md");
    expect(url).toContain("width=128");
    expect(url).toContain("height=128");
    expect(url).toContain("format=webp");
  });

  it("should generate responsive srcset", () => {
    const srcset = cdn.getResponsiveUrls("avatars", "candidate-1/photo.jpg");
    expect(srcset).toContain("320w");
    expect(srcset).toContain("640w");
    expect(srcset).toContain("960w");
    expect(srcset).toContain("1280w");
  });

  it("should return correct cache headers", () => {
    const resumeHeaders = getCacheHeaders("resume");
    expect(resumeHeaders["Cache-Control"]).toContain("private");

    const avatarHeaders = getCacheHeaders("avatar");
    expect(avatarHeaders["Cache-Control"]).toContain("public");
  });
});
```

---

## Appendix AB: Supabase データ移行・バックアップ・DR戦略

### AB.1 データ移行マネージャー

```typescript
// src/services/data-migration.ts
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

interface MigrationCheckpoint {
  table: string;
  lastProcessedId: string;
  totalProcessed: number;
  startedAt: string;
  lastUpdatedAt: string;
}

export class DataMigrationManager {
  private supabase: SupabaseClient;
  private checkpointDir: string;

  constructor() {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    this.checkpointDir = "./data/migration-checkpoints";
    if (!existsSync(this.checkpointDir)) {
      mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  // テーブルデータの完全エクスポート（増分対応）
  async exportTable(
    tableName: string,
    options: {
      batchSize?: number;
      format?: "json" | "csv";
      resumeFromCheckpoint?: boolean;
    } = {}
  ): Promise<{
    totalRows: number;
    filePath: string;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const batchSize = options.batchSize ?? 1000;
    const format = options.format ?? "json";
    const outputPath = join(
      "./data/exports",
      `${tableName}_${new Date().toISOString().split("T")[0]}.${format}`
    );

    // チェックポイント復元
    let checkpoint = options.resumeFromCheckpoint
      ? this.loadCheckpoint(tableName)
      : null;

    let totalRows = checkpoint?.totalProcessed ?? 0;
    const allRows: Record<string, unknown>[] = [];
    let lastId = checkpoint?.lastProcessedId ?? "";
    let hasMore = true;

    while (hasMore) {
      const whereClause = lastId
        ? sql`WHERE id > ${lastId}`
        : sql``;

      const result = await db.execute(sql`
        SELECT * FROM ${sql.raw(tableName)}
        ${whereClause}
        ORDER BY id ASC
        LIMIT ${batchSize}
      `);

      if (result.rows.length === 0) {
        hasMore = false;
        break;
      }

      allRows.push(...(result.rows as Record<string, unknown>[]));
      lastId = (result.rows[result.rows.length - 1] as { id: string }).id;
      totalRows += result.rows.length;

      // チェックポイント保存
      this.saveCheckpoint({
        table: tableName,
        lastProcessedId: lastId,
        totalProcessed: totalRows,
        startedAt: checkpoint?.startedAt ?? new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      });

      if (result.rows.length < batchSize) {
        hasMore = false;
      }

      console.log(`  Exported ${totalRows} rows from ${tableName}...`);
    }

    // ファイル出力
    mkdirSync("./data/exports", { recursive: true });

    if (format === "json") {
      writeFileSync(outputPath, JSON.stringify(allRows, null, 2));
    } else {
      const headers = Object.keys(allRows[0] ?? {});
      const csv = [
        headers.join(","),
        ...allRows.map((row) =>
          headers.map((h) => JSON.stringify(row[h] ?? "")).join(",")
        ),
      ].join("\n");
      writeFileSync(outputPath, csv);
    }

    return {
      totalRows,
      filePath: outputPath,
      durationMs: Date.now() - startTime,
    };
  }

  // データインポート（Supabase へ）
  async importToSupabase(
    tableName: string,
    filePath: string,
    options: {
      upsert?: boolean;
      batchSize?: number;
      conflictColumns?: string[];
    } = {}
  ): Promise<{
    inserted: number;
    updated: number;
    errors: string[];
  }> {
    const batchSize = options.batchSize ?? 500;
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>[];

    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      try {
        if (options.upsert) {
          const { error, count } = await this.supabase
            .from(tableName)
            .upsert(batch, {
              onConflict: (options.conflictColumns ?? ["id"]).join(","),
              count: "exact",
            });

          if (error) {
            errors.push(`Batch ${i}: ${error.message}`);
          } else {
            inserted += count ?? batch.length;
          }
        } else {
          const { error, count } = await this.supabase
            .from(tableName)
            .insert(batch)
            .select();

          if (error) {
            errors.push(`Batch ${i}: ${error.message}`);
          } else {
            inserted += count ?? batch.length;
          }
        }
      } catch (error) {
        errors.push(`Batch ${i}: ${(error as Error).message}`);
      }
    }

    return { inserted, updated, errors };
  }

  // スキーマ比較（Drizzle ↔ Supabase）
  async compareSchemas(): Promise<{
    matching: string[];
    missingInSupabase: string[];
    missingInLocal: string[];
    columnDiffs: Array<{
      table: string;
      column: string;
      localType: string;
      supabaseType: string;
    }>;
  }> {
    // ローカル DB のテーブル取得
    const localTables = await db.execute(sql`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    // Supabase のテーブル取得
    const { data: supabaseTables } = await this.supabase.rpc("get_schema_info");

    const localTableNames = new Set(
      localTables.rows.map((r) => r.table_name as string)
    );
    const supabaseTableNames = new Set(
      (supabaseTables ?? []).map((r: { table_name: string }) => r.table_name)
    );

    return {
      matching: [...localTableNames].filter((t) => supabaseTableNames.has(t)),
      missingInSupabase: [...localTableNames].filter((t) => !supabaseTableNames.has(t)),
      missingInLocal: [...supabaseTableNames].filter((t) => !localTableNames.has(t)),
      columnDiffs: [],
    };
  }

  // チェックポイント管理
  private saveCheckpoint(checkpoint: MigrationCheckpoint): void {
    writeFileSync(
      join(this.checkpointDir, `${checkpoint.table}.json`),
      JSON.stringify(checkpoint, null, 2)
    );
  }

  private loadCheckpoint(table: string): MigrationCheckpoint | null {
    const path = join(this.checkpointDir, `${table}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  }
}
```

### AB.2 自動バックアップシステム

```typescript
// src/services/backup-manager.ts
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env.js";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

interface BackupConfig {
  schedule: string; // cron式
  retention: {
    daily: number; // 日次バックアップ保持日数
    weekly: number;
    monthly: number;
  };
  compression: boolean;
  encryption: boolean;
  uploadToStorage: boolean;
}

const DEFAULT_CONFIG: BackupConfig = {
  schedule: "0 2 * * *", // 毎日 2:00 AM
  retention: { daily: 7, weekly: 4, monthly: 6 },
  compression: true,
  encryption: false,
  uploadToStorage: true,
};

export class BackupManager {
  private config: BackupConfig;
  private backupDir: string;

  constructor(config?: Partial<BackupConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.backupDir = "./data/backups";
    mkdirSync(this.backupDir, { recursive: true });
  }

  // フルバックアップ実行
  async createFullBackup(): Promise<{
    fileName: string;
    filePath: string;
    sizeBytes: number;
    durationMs: number;
    tables: string[];
  }> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `hr_backup_full_${timestamp}`;
    const sqlFile = join(this.backupDir, `${baseName}.sql`);
    const finalFile = this.config.compression
      ? `${sqlFile}.gz`
      : sqlFile;

    // pg_dump 実行
    const dumpCmd = this.config.compression
      ? `pg_dump "${env.DATABASE_URL}" --no-owner --no-privileges | gzip > "${finalFile}"`
      : `pg_dump "${env.DATABASE_URL}" --no-owner --no-privileges -f "${sqlFile}"`;

    try {
      execSync(dumpCmd, { stdio: "pipe" });
    } catch (error) {
      throw new Error(`Backup failed: ${(error as Error).message}`);
    }

    const stats = statSync(finalFile);

    // テーブル一覧取得
    const tablesOutput = execSync(
      `pg_dump "${env.DATABASE_URL}" --list | grep "TABLE" | awk '{print $NF}'`,
      { encoding: "utf-8" }
    );
    const tables = tablesOutput.trim().split("\n").filter(Boolean);

    // Storage にアップロード（オプション）
    if (this.config.uploadToStorage) {
      await this.uploadToStorage(finalFile, baseName);
    }

    console.log(`Backup created: ${finalFile} (${formatBytes(stats.size)})`);

    return {
      fileName: baseName,
      filePath: finalFile,
      sizeBytes: stats.size,
      durationMs: Date.now() - startTime,
      tables,
    };
  }

  // テーブル単位のバックアップ
  async createTableBackup(tableName: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `hr_backup_${tableName}_${timestamp}.sql`;
    const filePath = join(this.backupDir, fileName);

    execSync(
      `pg_dump "${env.DATABASE_URL}" --table=${tableName} --no-owner -f "${filePath}"`,
      { stdio: "pipe" }
    );

    if (this.config.compression) {
      execSync(`gzip "${filePath}"`);
      return `${filePath}.gz`;
    }

    return filePath;
  }

  // バックアップリストア
  async restore(
    filePath: string,
    options: {
      dropExisting?: boolean;
      targetDatabase?: string;
    } = {}
  ): Promise<{ success: boolean; tablesRestored: number }> {
    const dbUrl = options.targetDatabase ?? env.DATABASE_URL;

    if (options.dropExisting) {
      // 既存テーブル削除（注意: 本番では使用注意）
      execSync(
        `psql "${dbUrl}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`,
        { stdio: "pipe" }
      );
    }

    // リストア実行
    const isCompressed = filePath.endsWith(".gz");
    const restoreCmd = isCompressed
      ? `gunzip -c "${filePath}" | psql "${dbUrl}"`
      : `psql "${dbUrl}" -f "${filePath}"`;

    try {
      execSync(restoreCmd, { stdio: "pipe" });
    } catch (error) {
      return { success: false, tablesRestored: 0 };
    }

    // リストア後のテーブル数確認
    const result = execSync(
      `psql "${dbUrl}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'"`,
      { encoding: "utf-8" }
    );

    return {
      success: true,
      tablesRestored: parseInt(result.trim()),
    };
  }

  // 保持ポリシーに基づく古いバックアップの削除
  cleanupOldBackups(): { deleted: string[]; kept: number } {
    const files = readdirSync(this.backupDir)
      .filter((f) => f.startsWith("hr_backup_"))
      .map((f) => ({
        name: f,
        path: join(this.backupDir, f),
        mtime: statSync(join(this.backupDir, f)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const deleted: string[] = [];
    const retentionDays = this.config.retention.daily;
    const cutoff = new Date(Date.now() - retentionDays * 86400000);

    for (const file of files) {
      if (file.mtime < cutoff) {
        unlinkSync(file.path);
        deleted.push(file.name);
      }
    }

    return { deleted, kept: files.length - deleted.length };
  }

  // Supabase Storage にアップロード
  private async uploadToStorage(filePath: string, name: string): Promise<void> {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    const { readFileSync: readFile } = await import("node:fs");

    const buffer = readFile(filePath);
    await supabase.storage
      .from("exports")
      .upload(`backups/${name}`, buffer, {
        contentType: "application/gzip",
      });
  }

  // バックアップ一覧
  listBackups(): Array<{
    name: string;
    size: string;
    createdAt: Date;
    type: "full" | "table";
  }> {
    return readdirSync(this.backupDir)
      .filter((f) => f.startsWith("hr_backup_"))
      .map((f) => {
        const stats = statSync(join(this.backupDir, f));
        return {
          name: f,
          size: formatBytes(stats.size),
          createdAt: stats.mtime,
          type: f.includes("_full_") ? "full" as const : "table" as const,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}
```

### AB.3 ディザスタリカバリー（DR）戦略

```typescript
// src/services/disaster-recovery.ts
import { BackupManager } from "./backup-manager.js";
import { DataMigrationManager } from "./data-migration.js";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

interface DRConfig {
  rpo: number; // Recovery Point Objective (分)
  rto: number; // Recovery Time Objective (分)
  replicationMode: "sync" | "async" | "none";
  failoverStrategy: "automatic" | "manual";
}

interface DRStatus {
  primaryStatus: "healthy" | "degraded" | "down";
  replicationLag: number; // 秒
  lastBackup: Date | null;
  lastHealthCheck: Date;
  readyForFailover: boolean;
  checks: Array<{
    name: string;
    status: "pass" | "fail";
    message: string;
  }>;
}

export class DisasterRecovery {
  private backupManager: BackupManager;
  private config: DRConfig;

  constructor(config?: Partial<DRConfig>) {
    this.backupManager = new BackupManager();
    this.config = {
      rpo: 60, // 1時間
      rto: 30, // 30分
      replicationMode: "async",
      failoverStrategy: "manual",
      ...config,
    };
  }

  // DR ステータスチェック
  async checkStatus(): Promise<DRStatus> {
    const checks: DRStatus["checks"] = [];

    // 1. プライマリDBヘルスチェック
    let primaryStatus: DRStatus["primaryStatus"] = "healthy";
    try {
      await db.execute(sql`SELECT 1`);
      checks.push({ name: "primary_db", status: "pass", message: "Primary DB is healthy" });
    } catch {
      primaryStatus = "down";
      checks.push({ name: "primary_db", status: "fail", message: "Primary DB is unreachable" });
    }

    // 2. レプリケーションラグチェック
    let replicationLag = 0;
    try {
      const [lagResult] = await db.execute(sql`
        SELECT
          EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()))::integer as lag_seconds
      `).then((r) => r.rows);
      replicationLag = Number(lagResult?.lag_seconds ?? 0);

      const lagStatus = replicationLag < this.config.rpo * 60 ? "pass" : "fail";
      checks.push({
        name: "replication_lag",
        status: lagStatus,
        message: `Replication lag: ${replicationLag}s (RPO: ${this.config.rpo}min)`,
      });
    } catch {
      checks.push({ name: "replication_lag", status: "fail", message: "Cannot check replication" });
    }

    // 3. 最終バックアップチェック
    const backups = this.backupManager.listBackups();
    const lastBackup = backups.length > 0 ? backups[0].createdAt : null;
    const backupAge = lastBackup
      ? (Date.now() - lastBackup.getTime()) / 60000
      : Infinity;

    checks.push({
      name: "last_backup",
      status: backupAge < this.config.rpo ? "pass" : "fail",
      message: lastBackup
        ? `Last backup: ${Math.round(backupAge)} minutes ago`
        : "No backups found",
    });

    // 4. ディスク容量チェック
    try {
      const [diskResult] = await db.execute(sql`
        SELECT pg_database_size(current_database()) as db_size
      `).then((r) => r.rows);
      const dbSizeMB = Number(diskResult?.db_size ?? 0) / 1024 / 1024;
      checks.push({
        name: "disk_space",
        status: dbSizeMB < 10000 ? "pass" : "fail", // 10GB 閾値
        message: `Database size: ${dbSizeMB.toFixed(0)}MB`,
      });
    } catch {
      checks.push({ name: "disk_space", status: "fail", message: "Cannot check disk" });
    }

    const failCount = checks.filter((c) => c.status === "fail").length;
    if (failCount > 0) primaryStatus = "degraded";

    return {
      primaryStatus,
      replicationLag,
      lastBackup,
      lastHealthCheck: new Date(),
      readyForFailover: failCount === 0,
      checks,
    };
  }

  // フェイルオーバー実行
  async failover(targetUrl: string): Promise<{
    success: boolean;
    switchedAt: Date;
    previousPrimary: string;
    newPrimary: string;
    dataLossEstimate: string;
  }> {
    console.log("=== FAILOVER INITIATED ===");

    // 最新バックアップの確認
    const backups = this.backupManager.listBackups();
    const latestBackup = backups[0];

    if (!latestBackup) {
      throw new Error("No backups available for failover");
    }

    const backupAge = (Date.now() - latestBackup.createdAt.getTime()) / 60000;

    return {
      success: true,
      switchedAt: new Date(),
      previousPrimary: env.DATABASE_URL.split("@")[1]?.split("/")[0] ?? "unknown",
      newPrimary: targetUrl.split("@")[1]?.split("/")[0] ?? "unknown",
      dataLossEstimate: `Up to ${Math.ceil(backupAge)} minutes of data`,
    };
  }

  // DR テストラン
  async testFailover(): Promise<{
    passed: boolean;
    rtoActual: number;
    rpoActual: number;
    steps: Array<{ step: string; durationMs: number; status: "pass" | "fail" }>;
  }> {
    const steps: Array<{ step: string; durationMs: number; status: "pass" | "fail" }> = [];
    const overallStart = Date.now();

    // Step 1: ステータスチェック
    let stepStart = Date.now();
    const status = await this.checkStatus();
    steps.push({
      step: "Status check",
      durationMs: Date.now() - stepStart,
      status: status.primaryStatus === "healthy" ? "pass" : "fail",
    });

    // Step 2: バックアップ作成
    stepStart = Date.now();
    try {
      await this.backupManager.createFullBackup();
      steps.push({ step: "Create backup", durationMs: Date.now() - stepStart, status: "pass" });
    } catch {
      steps.push({ step: "Create backup", durationMs: Date.now() - stepStart, status: "fail" });
    }

    // Step 3: バックアップ検証
    stepStart = Date.now();
    const backups = this.backupManager.listBackups();
    steps.push({
      step: "Verify backup",
      durationMs: Date.now() - stepStart,
      status: backups.length > 0 ? "pass" : "fail",
    });

    const totalDuration = (Date.now() - overallStart) / 60000; // 分

    return {
      passed: steps.every((s) => s.status === "pass"),
      rtoActual: totalDuration,
      rpoActual: status.replicationLag / 60,
      steps,
    };
  }
}
```

### AB.4 バックアップ・DR管理API

```typescript
// src/routes/backup.ts
import { Elysia } from "elysia";
import { BackupManager } from "../services/backup-manager.js";
import { DisasterRecovery } from "../services/disaster-recovery.js";

const app = new Elysia();
const backup = new BackupManager();
const dr = new DisasterRecovery();

// バックアップ一覧
app.get("/", async (c) => {
  const backups = backup.listBackups();
  return c.json({ backups });
});

// フルバックアップ実行
app.post("/full", async (c) => {
  const result = await backup.createFullBackup();
  return c.json(result);
});

// テーブルバックアップ
app.post("/table/:name", async (c) => {
  const filePath = await backup.createTableBackup(c.req.param("name"));
  return c.json({ filePath });
});

// 古いバックアップ削除
app.delete("/cleanup", async (c) => {
  const result = backup.cleanupOldBackups();
  return c.json(result);
});

// DR ステータス
app.get("/dr/status", async (c) => {
  const status = await dr.checkStatus();
  return c.json({ status });
});

// DR テスト
app.post("/dr/test", async (c) => {
  const result = await dr.testFailover();
  return c.json({ result });
});

export default app;
```
