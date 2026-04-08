# HR Resume Screening Backend — 技术文档

## 项目概述

基于 AI 的简历自动筛选系统后端，用于 HR 招聘流程自动化。系统从企业邮箱（BOSS直聘）自动收取简历邮件，解析 PDF/DOCX 附件，通过 MiniMax M2.5 大模型进行智能评分，并提供 REST API + WebSocket 实时推送供前端管理候选人。

### 核心流程

```
邮件邮箱
  │
  ▼
┌─────────── pollInbox() Phase 1: IMAP 快速扫描（串行） ──────────┐
│                                                                 │
│  1. IMAP 连接 + 搜索未读                                         │
│  2. 逐封邮件 fetchOne (envelope + bodyStructure)                 │
│  3. DB 去重 (email_process_logs.messageId)                       │
│     └─ 已处理 → 标记已读，跳过                                     │
│  4. findAttachments (PDF/DOCX)                                  │
│  5. classifyEmail (三层规则，零 LLM 成本)                          │
│     ├─ "no"        → 记录 skipped，标记已读，跳过                   │
│     ├─ "yes"/"uncertain" 但无附件 → 记录 skipped，跳过             │
│     └─ "yes"/"uncertain" 有附件 → 继续处理                        │
│  6. 记录 fetched → DB                                           │
│  7. 下载附件 → parseResume (PDF/DOCX→文本)                        │
│  8. 更新 parsed → DB                                            │
│  9. extractUniversityName + lookupUniversity                     │
│ 10. INSERT candidates (status=screening) ← 入库                  │
│ 11. fileStorage.save() → 简历原件持久化                            │
│ 12. INSERT resumes (source=email, filePath)                      │
│ 13. EventBus.emit("candidate:new") ← 推送                        │
│ 14. 收集 ScoringTask → scoringTasks[]                            │
│ 15. 标记邮件已读                                                  │
│                                                                 │
│  异常 → 更新 error → DB，继续下一封                                 │
│  Phase 1 结束 → 释放 IMAP 连接                                    │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────── pollInbox() Phase 2: AI 并发评分（10 路） ───────────┐
│                                                                 │
│  按 SCORING_CONCURRENCY=10 分批 Promise.allSettled：              │
│  15. scoreResume (AI: MiniMax M2.5) ← AI 评分                    │
│  16. INSERT scores                                              │
│  17. 更新 scored + candidateId → email_process_logs              │
│  18. EventBus.emit("candidate:scored") ← 推送                    │
│                                                                 │
│  单个失败不影响其他候选人                                           │
│  全部完成 → EventBus.emit("inbox:summary")                        │
└─────────────────────────────────────────────────────────────────┘
                          │
                    EventBus.emit()
                          │
                  server.publish("hr:events")
                          │
               ┌──────────┴──────────┐
            WS client 1       WS client 2  ...
```

### 邮件处理详细步骤说明

| 步骤 | 阶段 | 涉及服务 | AI? | DB 写入 | WS 推送 |
|------|------|---------|-----|---------|---------|
| 1-2 | Phase 1: IMAP 连接 | ImapFlow | 否 | — | — |
| 3 | Phase 1: 去重检查 | email_process_logs | 否 | SELECT | — |
| 4 | Phase 1: 附件识别 | findAttachments | 否 | — | — |
| 5 | Phase 1: 邮件分类 | classifyEmail | **否 (零 LLM)** | INSERT (skipped) | — |
| 6 | Phase 1: 记录开始处理 | — | 否 | INSERT (fetched) | — |
| 7 | Phase 1: 简历解析 | resume-parser | 否 | UPDATE (parsed) | — |
| 8 | Phase 1: 院校查询 | university-lookup | 否 | SELECT | — |
| 9-11 | Phase 1: 候选人入库 | — | 否 | INSERT candidates + resumes | `candidate:new` |
| 11.5 | Phase 1: 原件持久化 | fileStorage | 否 | — | — |
| 12-13 | Phase 1: 收集任务 | — | 否 | — | — |
| 14 | Phase 1: 标记已读 | ImapFlow | 否 | — | — |
| — | Phase 1 结束 | ImapFlow logout | 否 | — | — |
| 15 | Phase 2: AI 评分 | ai-scorer (MiniMax) | **是** | INSERT scores | — |
| 16-17 | Phase 2: 状态更新 | — | 否 | UPDATE (scored) | `candidate:scored` |
| 全部完成 | Phase 2: 批次摘要 | — | 否 | — | `inbox:summary` |

---

## 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 运行时 | Bun | 1.x | 高性能 JavaScript/TypeScript 运行时 |
| Web 框架 | Elysia | 1.x | Bun 原生框架，类型安全，高性能 |
| ORM | Drizzle | 0.45+ | 类型安全，零代码生成 |
| 数据库 | PostgreSQL | 15+ | 主数据库 |
| AI SDK | Vercel AI SDK | 6.x | 统一 LLM 调用接口 |
| AI 模型 | MiniMax M2.5 | — | OpenAI 兼容 API，推理模型 |
| 邮件收取 | ImapFlow | 1.x | IMAP 客户端 |
| PDF 解析 | pdf-parse | 2.x | PDF 文本提取 |
| DOCX 解析 | mammoth | 1.x | Word 文档文本提取 |
| 环境变量 | Zod | 4.x | 类型安全的环境变量验证 |
| 测试 | bun:test | — | Bun 内置测试框架 |

---

## 项目结构

```
hr-backend/
├── package.json              # 项目配置，ESM 模式
├── tsconfig.json             # TypeScript 配置（strict, ESNext/Bundler）
├── drizzle.config.ts         # Drizzle ORM 配置
├── CLAUDE.md                 # Claude Code 项目指令（团队共享，提交到 git）
├── CLAUDE.local.md           # Claude Code 本地配置（gitignored，敏感信息）
├── .env                      # 环境变量（不提交到 git）
├── .env.example              # 环境变量模板
├── .gitignore
├── drizzle/
│   └── 0000_*.sql            # 自动生成的数据库迁移文件
├── src/
│   ├── index.ts              # 应用入口 + EventBus→WS 桥接 + 心跳定时器
│   ├── app.ts                # Elysia 应用实例（可测试）
│   ├── env.ts                # Zod 验证环境变量
│   ├── db/
│   │   ├── schema.ts         # 数据库表定义（6张表，含 email_process_logs）
│   │   ├── index.ts          # Drizzle 客户端实例
│   │   └── migrate.ts        # 数据库迁移执行器
│   ├── routes/
│   │   ├── health.ts         # 健康检查 GET /health
│   │   ├── positions.ts      # 职位 CRUD /api/positions
│   │   ├── candidates.ts     # 候选人管理 /api/candidates
│   │   ├── resumes.ts        # 简历上传 /api/resumes
│   │   ├── email-poll.ts     # 邮箱轮询 POST /api/email/poll
│   │   ├── email-stats.ts    # 邮件统计 GET /api/email/stats
│   │   ├── universities.ts   # 院校数据 /api/universities
│   │   └── ws.ts             # WebSocket /ws 实时推送
│   ├── services/
│   │   ├── email.ts          # IMAP 邮件轮询 + 去重 + 分类 + EventBus 事件
│   │   ├── email-classifier.ts # 邮件分类器（三层规则，零 LLM 成本）
│   │   ├── resume-parser.ts  # PDF/DOCX 文本提取
│   │   ├── ai-scorer.ts      # MiniMax AI 评分服务
│   │   └── university-lookup.ts # 院校层级查询 + educationScore 计算
│   └── lib/
│       ├── ai.ts             # MiniMax 模型配置
│       ├── types.ts          # 共享 TypeScript 类型
│       ├── ws-types.ts       # WebSocket 消息类型（discriminated union）
│       ├── event-bus.ts      # 事件总线（发布/订阅解耦）
│       └── storage.ts        # 文件存储抽象层（本地 FS / 未来 Supabase）
├── data/
│   ├── universities-cn.json  # 国内院校种子数据（~150所）
│   └── universities-intl.json # 国际院校种子数据（QS Top 300）
├── scripts/
│   ├── seed-universities.ts  # 院校种子数据导入
│   ├── rescore-all.ts        # 全量重新评分（院校识别 + AI）
│   ├── score-pending.ts      # 补评分：Phase 1 完成但 Phase 2 未执行的候选人
│   ├── dump-emails.ts        # 邮件导出工具
│   ├── probe-inbox.ts        # IMAP 连接探测
│   ├── test-full-pipeline.ts # 端到端流程测试
│   ├── test-parse-one.ts     # 单文件解析测试
│   └── download-resumes.ts   # 回填脚本：重新下载历史邮件简历原件
├── test/
│   ├── setup.ts              # 测试 mock 配置（DB, AI, email, classifier, EventBus, storage）
│   ├── university-tiers.test.ts # 院校层级纯函数测试
│   ├── universities.test.ts  # 院校 API 路由测试
│   ├── health.test.ts
│   ├── positions.test.ts
│   ├── candidates.test.ts
│   ├── resumes.test.ts       # 含事务测试（db.transaction 回滚验证）
│   ├── email-stats.test.ts  # 邮件统计 API 路由测试
│   ├── ai-scorer.test.ts
│   ├── email-helpers.test.ts # findAttachments 纯函数测试
│   ├── email-classifier.test.ts # classifyEmail 三层分类测试（20 tests）
│   ├── email-poll.test.ts    # 邮箱轮询端点测试（3 tests）
│   ├── email-transaction.test.ts # 事务行为测试（2 tests）
│   ├── resume-parser.test.ts
│   ├── i18n.test.ts           # i18n locale 字段 + AI prompt 语言切换（9 tests）
│   ├── ws-types.test.ts      # WS 类型守卫 + 序列化测试（14 tests）
│   ├── event-bus.test.ts     # EventBus 单元测试（8 tests）
│   └── ws.test.ts            # WebSocket 集成测试（5 tests）
└── docs/
    ├── TECHNICAL.md           # 本文件
    └── WEBSOCKET-API.md       # 前端对接 API 文档
```

---

## 数据库设计

### ER 关系

```
positions 1──N candidates 1──1 resumes
                    │
                    └──1 scores

email_process_logs N──0..1 candidates
```

### 表结构

#### `university_tiers` — 院校层级

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键，自动生成 |
| name | text | 院校名称（中文或英文） |
| aliases | text[] | 别名/英文名（用于模糊匹配） |
| country | text | 国家/地区代码（CN, JP, US, UK 等） |
| domestic_tag | text | 国内标签：985, 211, 双一流, 省重点一本, 普通一本, 普通本科 |
| qs_rank | integer | QS 世界排名（国际院校） |
| tier | text | 统一层级档位：S/A/B/C/D |
| updated_year | integer | 数据年份 |
| created_at | timestamp | 创建时间 |

#### `positions` — 职位/JD

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键，自动生成 |
| title | text | 职位名称 |
| department | text | 部门（可选） |
| description | text | 职位描述 |
| skill_config | JSONB | 技能配置：`{ must, nice, reject }` |
| status | text | 状态：open / closed / draft |
| locale | text | AI 评分输出语言：`zh`（中文，默认） / `ja`（日语） |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### `candidates` — 候选人

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| position_id | UUID (FK) | 关联职位 |
| name | text | 姓名 |
| email | text | 邮箱 |
| phone | text | 手机号 |
| education | text | 学历 |
| university | text | 毕业院校名称 |
| university_tier | text | 院校统一层级：S/A/B/C/D |
| skills | text[] | 技能标签数组 |
| status | text | 状态：new → screening → shortlisted → interviewed → rejected / hired |
| notes | text | HR 备注 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### `resumes` — 简历

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| candidate_id | UUID (FK) | 关联候选人 |
| file_name | text | 文件名 |
| mime_type | text | MIME 类型 |
| raw_text | text | 解析出的纯文本 |
| file_path | text | 原始文件在存储层的相对路径（如 `resumes/{candidateId}.pdf`），nullable 向后兼容 |
| source | text | 来源：upload / email |
| created_at | timestamp | 创建时间 |

#### `scores` — AI 评分

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| candidate_id | UUID (FK) | 关联候选人 |
| position_id | UUID (FK) | 关联职位 |
| total_score | real | 综合分（0.00-100.00，保留两位小数） |
| must_score | real | 必备技能匹配度（0.00-100.00） |
| nice_score | real | 加分项匹配度（0.00-100.00） |
| reject_penalty | real | 扣分项惩罚（0.00-100.00） |
| education_score | real | 学历/院校评分（0.00-100.00），基于院校层级映射 |
| grade | text | 等级：A(≥80.00) / B(≥65.00) / C(≥50.00) / D(≥35.00) / F(<35.00) |
| matched_skills | text[] | 匹配到的技能 |
| missing_skills | text[] | 缺失的技能 |
| explanation | text | AI 评语（根据职位 locale 输出中文或日语） |
| created_at | timestamp | 创建时间 |

#### `email_process_logs` — 邮件处理日志（去重 + 分类追踪）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID (PK) | 主键 |
| message_id | text (UNIQUE) | RFC 2822 Message-ID，幂等去重键 |
| imap_uid | integer | IMAP UID（当次连接内有效） |
| sender_email | text | 发件人邮箱 |
| subject | text | 邮件主题 |
| classification | text | 分类结果：`resume` / `not_resume` / `uncertain` |
| classification_reason | text | 分类原因：`recruit_platform` / `keyword_match` / `internal_no_attachment` 等 |
| status | text | 处理状态：`skipped` → `fetched` → `parsed` → `scored` / `error` |
| has_resume_attachment | boolean | 是否含简历格式附件（PDF/DOC/DOCX） |
| candidate_id | UUID (FK) | 关联候选人（处理成功后填入） |
| error | text | 错误信息（status=error 时） |
| processed_at | timestamp | 处理完成时间 |
| created_at | timestamp | 记录创建时间 |

**状态流转：**
```
邮件进入 pollInbox
  │
  ├─ 去重命中 (已 scored) → 跳过，不新增记录
  │
  ├─ classifyEmail = "no" → INSERT status=skipped
  │
  ├─ 无附件 → INSERT status=skipped
  │
  └─ 有附件 → INSERT status=fetched
                 │
                 ├─ 解析成功 → UPDATE status=parsed
                 │    │
                 │    ├─ AI 评分成功 → UPDATE status=scored, candidateId=xxx
                 │    │
                 │    └─ AI 评分失败 → UPDATE status=error
                 │
                 └─ 解析失败 → UPDATE status=error
```

### 健康检查

```
GET /health
→ { "status": "ok", "timestamp": "2026-02-26T..." }
```

### 职位管理

```
GET    /api/positions          # 列出所有职位
GET    /api/positions/:id      # 获取单个职位
POST   /api/positions          # 创建职位
PATCH  /api/positions/:id      # 更新职位
DELETE /api/positions/:id      # 删除职位
```

**创建职位 Body 示例：**

```json
{
  "title": "软件工程师",
  "department": "研发部",
  "description": "负责公司软件产品的开发和维护",
  "skillConfig": {
    "must": ["TypeScript", "React", "Node.js", "PostgreSQL"],
    "nice": ["Docker", "CI/CD", "微服务架构"],
    "reject": ["无相关开发经验", "频繁跳槽"]
  },
  "locale": "zh"
}
```

### 候选人管理

```
GET   /api/candidates              # 列出候选人（支持筛选）
GET   /api/candidates/:id          # 候选人详情 + 评分明细
PATCH /api/candidates/:id          # 更新状态/备注
```

**查询参数：**
- `positionId` — 按职位筛选
- `status` — 按状态筛选（new, screening, shortlisted, ...）
- `grade` — 按评分等级筛选（A, B, C, D, F）

### 简历上传

```
POST /api/resumes/upload
Content-Type: multipart/form-data

字段：
  file        — PDF 或 DOCX 简历文件（必填）
  positionId  — 目标职位 ID（必填）
  name        — 候选人姓名（选填，默认 "Unknown"）
```

**响应：** 返回候选人信息、AI 评分结果、简历文本预览。

**事务保护：** 上传路由预生成 `candidateId`，先调用 `fileStorage.save()` 将原件持久化到磁盘，再在 `db.transaction()` 中完成 INSERT candidates → INSERT resumes → scoreResume → INSERT scores。AI 评分失败时自动回滚，不会留下无评分的候选人记录。

### 邮箱轮询

```
POST /api/email/poll
Content-Type: application/json

Body:
  positionId  — 候选人关联的职位 ID（必填）
```

**响应：** `{ candidateIds: string[], count: number }`

### 邮件处理统计

```
GET /api/email/stats
```

**响应结构：**

```json
{
  "emails": {
    "total": 3950,
    "byClassification": {
      "resume": 3369,
      "not_resume": 579,
      "uncertain": 2
    },
    "byStatus": {
      "scored": 1995,
      "parsed": 1346,
      "skipped": 591,
      "error": 18
    },
    "breakdown": [
      { "classification": "not_resume", "status": "skipped", "hasAttachment": false, "count": 579 },
      { "classification": "resume", "status": "scored", "hasAttachment": true, "count": 1994 }
    ]
  },
  "candidates": {
    "total": 3379,
    "withScore": 3167,
    "withoutScore": 212
  },
  "resumes": {
    "total": 3378,
    "withFile": 519,
    "withoutFile": 2859
  }
}
```

**说明：**
- `emails` — 邮件处理日志按分类（resume/not_resume/uncertain）、状态（scored/parsed/skipped/error/fetched）聚合
- `candidates` — 候选人总数及有/无评分统计（LEFT JOIN scores）
- `resumes` — 简历总数及有/无文件路径统计（count filePath）

### WebSocket 实时推送

```
ws://localhost:3001/ws
```

连接后自动订阅 `hr:events` topic，接收以下事件：

| 事件类型 | 触发时机 | 关键字段 |
|---------|---------|---------|
| `heartbeat` | 连接时 + 每 30s | `connectedClients` |
| `candidate:new` | 候选人入库后 | `candidateId`, `name`, `positionTitle` |
| `candidate:scored` | AI 评分完成后 | `candidateId`, `totalScore`, `grade` |
| `inbox:summary` | 批次处理完成后 | `totalProcessed`, `gradeDistribution`, `topCandidates` |
| `error` | 客户端发送无效消息 | `message` |

客户端可发送 `{ "type": "ping" }` 请求即时心跳回复。

详细字段定义和前端集成代码见 [WEBSOCKET-API.md](WEBSOCKET-API.md)。

---

## 核心服务

### 邮件服务 (`services/email.ts`)

通过 IMAP 协议连接企业邮箱 `mail.ivis-sh.com:143`（STARTTLS），轮询 INBOX 中的未读邮件。采用**两阶段并发架构**：Phase 1 串行扫描（受 IMAP 连接限制），Phase 2 10 路并发 AI 评分（IMAP 已释放）。

**Phase 1 — IMAP 快速扫描（串行，无 AI 调用）：**

1. **IMAP 连接** — 创建 ImapFlow 客户端，连接邮箱，获取 INBOX 排他锁
2. **搜索未读** — `client.search({ seen: false })` 获取所有未读邮件 UID 列表
3. **逐封处理** — 遍历每个 UID：
   - `fetchOne` 获取 envelope（发件人、主题、Message-ID）+ bodyStructure
   - **DB 去重**：用 `messageId` 查询 `email_process_logs`，已 `scored` 的直接标记已读跳过
   - **附件识别**：`findAttachments()` 递归遍历 MIME 树，按扩展名(.pdf/.doc/.docx)匹配
   - **邮件分类**：`classifyEmail()` 三层规则判断（见下方 email-classifier 服务）
   - 分类为 `no` → 写入 `email_process_logs`(status=skipped)，标记已读，跳过
   - 分类为 `yes`/`uncertain` 但无附件 → 写入 skipped，标记已读，跳过
   - 分类为 `yes`/`uncertain` 有附件 → 写入 `fetched`，开始处理
4. **附件处理**（每个附件独立处理，try-catch 隔离错误）：
   - 流式下载附件 → Buffer
   - `parseResume()` 解析文本 → 更新 `email_process_logs`(status=parsed)
   - `extractUniversityName()` + `lookupUniversity()` 查询院校层级
   - INSERT `candidates`(status=screening) + `fileStorage.save()` 持久化原件 + INSERT `resumes`(source=email, filePath)
   - EventBus.emit `candidate:new`
   - 收集 `ScoringTask` 到 `scoringTasks[]`
   - 错误时：更新 `email_process_logs`(status=error, error=msg)
5. **标记已读** — 每封邮件处理完后 `client.messageFlagsAdd("\\Seen")`
6. **释放 IMAP 连接** — `lock.release()` + `client.logout()`

**Phase 2 — AI 并发评分（IMAP 已释放，10 路并发）：**

按 `SCORING_CONCURRENCY = 10` 分批 `Promise.allSettled`：
1. `scoreResume()` AI 评分 → INSERT `scores`
2. 更新 `email_process_logs`(status=scored, candidateId=xxx)
3. EventBus.emit `candidate:scored`
4. 单个评分失败不影响其他候选人（记录 error 状态）
5. 全部完成 → EventBus.emit `inbox:summary`（含评分分布和 Top 5）

**补偿机制：** Phase 1 完成但 Phase 2 未执行（如进程崩溃）会导致候选人有记录但无评分。可通过 `bun scripts/score-pending.ts` 补充执行 Phase 2。

**幂等保证：** `email_process_logs.messageId` 有 UNIQUE 约束 + `onConflictDoNothing()`，崩溃重启后重复邮件不会产生重复候选人。

**适配说明：** BOSS直聘的简历 PDF 附件 `disposition` 为 `inline` 而非标准的 `attachment`，代码已做兼容处理。

### 邮件分类器 (`services/email-classifier.ts`)

零 LLM 成本的邮件预过滤，通过三层规则判断邮件是否可能包含简历：

**Layer 1 — 发件人域名：**
| 域名 | 判定 | 说明 |
|------|------|------|
| `ivis-sh.com` | 无附件→`no`，有附件→`uncertain` | 公司内部邮件 |
| `service.bosszhipin.com` | `yes` | BOSS 直聘 |
| `ehire.51job.com` | `yes` | 前程无忧 |
| `lietou.com` / `mail.lietou.com` | `yes` | 猎聘 |
| `em.zhaopin.com` | `yes` | 智联招聘 |
| `lagou.com` | `yes` | 拉勾网 |

**Layer 2 — 主题关键词：**
- 简历关键词（→ `yes`）：`简历|resume|应聘|求职|投递|CV|履歴|エントリー`
- 系统通知关键词（→ `no`）：`验证码|notification|unsubscribe|退订|mailer-daemon|noreply|no-reply|自动回复|out of office`

**Layer 3 — 附件兜底：**
- 有简历格式附件 → `uncertain`（仍处理，但标记不确定）
- 无附件 → `no`

**分类结果对应 email_process_logs.classification：**
| isResume | classification |
|----------|---------------|
| `"yes"` | `resume` |
| `"uncertain"` | `uncertain` |
| `"no"` | `not_resume` |

### 事件总线 (`lib/event-bus.ts`)

轻量级发布/订阅机制，解耦 services 层与 WebSocket 传输层：

- `eventBus.emit(event)` — 由 services 调用发布事件
- `eventBus.on(listener)` — 在 `index.ts` 中注册桥接监听器
- 桥接逻辑：`eventBus.on(event => app.server.publish("hr:events", serializeEvent(event)))`

这样 services 不需要直接依赖 Elysia/Bun server，避免循环依赖。

### WebSocket 路由 (`routes/ws.ts`)

使用 Elysia `.ws("/ws")` + Bun 原生 pub/sub：

- **open** — `ws.subscribe("hr:events")` + 发送初始 heartbeat
- **message** — 解析 JSON → type guard 校验 → ping 回复 heartbeat / 无效消息回复 error
- **close** — `ws.unsubscribe("hr:events")`
- **广播** — 通过 `server.publish("hr:events", ...)` 零分配 C++ 层广播给所有客户端

### 文件存储服务 (`lib/storage.ts`)

简历原件持久化的统一抽象层，当前实现为本地文件系统，未来切换 Supabase Storage 只需替换实现类：

- **`FileStorage` 接口** — `save(candidateId, buffer, mimeType)` 返回相对路径 key，`exists(key)` 检查文件是否存在
- **`LocalFileStorage`** — 保存到 `{STORAGE_DIR}/resumes/{candidateId}.{pdf|docx}`，自动创建目录
- **`fileStorage` 单例** — 全局导出，由 `email.ts` 和 `resumes.ts` 共用

存储路径示例：`storage/resumes/601a2b6a-84c2-4a4b-a206-ea14c4d96823.pdf`

**存储演进规划：**

```
当前：LocalFileStorage（本地 FS）
  │   写入快、零网络依赖，单机部署足够
  │
  ▼  前端需要下载简历原件时
目标：SupabaseFileStorage（云存储为主，本地为备）
      │
      ├─ save() 同时写本地 + 上传 Supabase Storage
      ├─ Supabase 为 source of truth（前端用签名 URL 直接下载，不经后端）
      ├─ 本地仅为写入副产品，不需要保持严格一致
      └─ 调用方零改动（接口不变，只换实现类）
```

实施步骤（TODO）：
1. `SupabaseFileStorage implements FileStorage` — `save()` 内先 `writeFileSync` 本地，再 `supabase.storage.upload()` 上传云端
2. 新增 `getSignedUrl(key)` 方法到 `FileStorage` 接口 — 前端下载用
3. 新增 `GET /api/resumes/:id/download` 路由 — 返回 Supabase 签名 URL（302 重定向）
4. 回填已有本地文件到 Supabase — 一次性脚本，类似 `download-resumes.ts`
5. 切换导出：`export const fileStorage = new SupabaseFileStorage()`

### 简历解析服务 (`services/resume-parser.ts`)

| 格式 | 库 | 方法 |
|------|----|------|
| PDF | pdf-parse v2 | `new PDFParse({ data: buffer }).getText()` |
| DOCX/DOC | mammoth | `mammoth.extractRawText({ buffer })` |

### AI 评分服务 (`services/ai-scorer.ts`)

使用 Vercel AI SDK 调用 MiniMax M2.5 模型。

**关键设计决策：**

1. **使用 `generateText` 而非 `generateObject`**：MiniMax M2.5 是推理模型，返回 `<think>...</think>` 思考过程 + JSON。`generateObject` 无法解析带 think 标签的输出，所以用 `generateText` + 手动 JSON 提取。

2. **JSON 提取逻辑**：`extractJson()` 函数先去除 `<think>` 块，再去除 markdown 代码围栏，得到纯 JSON。

3. **Zod 验证**：提取的 JSON 经过 Zod schema 验证，确保类型安全。所有分数字段通过 `.transform(round2)` 强制保留两位小数。`educationScore` 字段使用 `.default(0)` 确保向后兼容。

4. **i18n 多语言提示词**：`scoreResume()` 接受 `locale` 参数（`"zh"` | `"ja"`，默认 `"zh"`），根据 locale 切换提示词语言。

5. **universityTier 参数**：`scoreResume()` 接受 `universityTier` 参数（默认 `"D"`），用于在 prompt 中提供预计算的 educationScore。

### 院校层级服务 (`services/university-lookup.ts`)

提供院校层级映射和查询功能：

- **`mapDomesticTagToTier(tag)`** — 国内标签→统一层级（985→S, 211→A, 双一流→A 等）
- **`mapQsRankToTier(rank)`** — QS 排名→统一层级（1-50→S, 51-100→A 等）
- **`tierToScore(tier)`** — 层级→educationScore（S→95, A→85 等）
- **`extractUniversityName(text)`** — 从简历文本提取院校名（正则匹配）
- **`lookupUniversity(db, name)`** — 数据库模糊查询匹配院校

**院校名提取策略**（MVP）：使用正则匹配 `毕业于XX大学/学院`、`XX大学`、`University of XX`、`XX University` 等模式。提取失败时 educationScore 默认为 0（D 档对应 30 分由 AI prompt 处理），不阻塞评分流程。

**评分算法：**

```
totalScore = mustScore × 0.5 + niceScore × 0.2 + educationScore × 0.2 - rejectPenalty × 0.1
（所有分数保留两位小数）
```

**院校层级 → educationScore 映射：**

| 统一档位 | 国内标签 | 国外 (QS排名) | educationScore |
|---------|---------|--------------|----------------|
| S | 985 | Top 50 | 95.00 |
| A | 211 / 双一流 | 51-100 | 85.00 |
| B | 省重点一本 | 101-300 | 70.00 |
| C | 普通一本 | 301-500 | 55.00 |
| D | 普通本科/未知 | 500+ / 无排名 | 30.00 |

| 等级 | 分数范围 |
|------|---------|
| A | ≥ 80.00 |
| B | ≥ 65.00 |
| C | ≥ 50.00 |
| D | ≥ 35.00 |
| F | < 35.00 |

**模型配置：**
- API Base URL: `https://api.minimaxi.com/v1`（注意是 minimax**i**.com）
- 模型名: `MiniMax-M2.5`
- 使用 `.chat()` 方法走 `/chat/completions` 端点

---

## 环境配置

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接串（密码含 `@` 需用 `%40` 编码） |
| `MINIMAX_API_KEY` | 是 | MiniMax 平台 API Key |
| `IMAP_HOST` | 否 | IMAP 服务器，默认 `mail.ivis-sh.com` |
| `IMAP_PORT` | 否 | IMAP 端口，默认 `143`（STARTTLS） |
| `IMAP_USER` | 否 | 邮箱账号，默认 `hr@ivis-sh.com` |
| `IMAP_PASS` | 是 | 邮箱密码 |
| `SMTP_HOST` | 否 | SMTP 服务器，默认 `mail.ivis-sh.com` |
| `SMTP_PORT` | 否 | SMTP 端口，默认 `587` |
| `SMTP_USER` | 否 | SMTP 账号 |
| `SMTP_PASS` | 否 | SMTP 密码（发送邮件时需要） |
| `STORAGE_DIR` | 否 | 简历原件存储根目录，默认 `./storage` |
| `GITLAB_TOKEN` | 否 | GitLab API Token（AI review 集成用） |

### 已验证的连接参数

| 服务 | 地址 | 端口 | 协议 | 状态 |
|------|------|------|------|------|
| IMAP | mail.ivis-sh.com | 143 | STARTTLS | ✅ 已通 |
| IMAP | mail.ivis-sh.com | 993 | SSL | ❌ 不支持 |
| MiniMax API | api.minimaxi.com | 443 | HTTPS | ✅ 已通 |
| MiniMax API | api.minimax.io | 443 | HTTPS | ❌ 401 |

---

## 开发命令

```bash
bun dev                # 启动开发服务器（--watch 热重载）
bun test               # 运行测试（bun:test）
bun run start          # 启动生产服务
bun run typecheck      # 类型检查（tsc --noEmit）
bun run db:generate    # 生成数据库迁移文件
bun run db:migrate     # 执行数据库迁移
bun run db:seed-universities  # 导入院校种子数据（CN ~150 + intl QS Top 300）
bun scripts/download-resumes.ts  # 回填历史邮件简历原件（IMAP 重下载，自动重连）
```

---

## 开发规范

### AI 辅助开发（Claude Code）

项目使用 Claude Code 作为 AI 辅助开发工具，通过配置文件管理开发规范：

| 文件 | 作用 | 进 git？ | 说明 |
|------|------|----------|------|
| `CLAUDE.md` | 项目级开发规范 | **提交** | 团队共享：TDD 流程、commit 纪律、文档同步规则 |
| `CLAUDE.local.md` | 个人本地配置 | **不提交** | 敏感信息、本地路径、个人偏好 |
| `.env` | 环境变量 | **不提交** | API Key、密码、Token 真实值 |
| `.env.example` | 环境变量模板 | **提交** | 空值模板，新成员参考 |

`CLAUDE.md` 每次 Claude Code 会话自动加载，包含以下团队约定：

1. **TDD 工作流** — 先写测试（RED）→ 写实现（GREEN）→ 重构（REFACTOR）
2. **文档同步** — 改功能必须同步更新 README.md / TECHNICAL.md / WEBSOCKET-API.md
3. **Git Commit 纪律** — 每个逻辑模块独立 commit + push，保持可 review 颗粒度
4. **安全规则** — 绝不 commit Token/密码/API Key，敏感信息只放 `.env` 或 `CLAUDE.local.md`
5. **GitLab Review** — Push 后自动触发 AI review bot，可通过 GitLab API 拉取评论并处理

### 安全规则（重要）

**绝对不要 commit 以下内容到 git：**
- API Key、Token（如 `glpat-*`、`sk-*`）
- 数据库密码、邮箱密码
- `.env` 文件内容

**正确做法：**
- 敏感值 → `.env`（已 gitignore）
- 个人配置 → `CLAUDE.local.md`（已 gitignore）
- 代码引用 → `process.env.XXX`，不写明文
- Commit 前 → `git diff --staged` 检查无敏感字符串

### GitLab AI Review Bot

每次 push / MR 会自动触发 AI review bot（`gitlab-ai-reviewer` 项目），通过 MiniMax M2.5 对代码差异进行审查，评论发布到 GitLab commit/MR 下。

审查维度（按优先级）：
1. 缺陷与安全
2. 类型安全
3. 最佳实践
4. 测试覆盖
5. 可维护性
6. 国际化

---

## 测试

使用 Bun 内置测试框架（`bun:test`），通过 `app.handle(new Request(...))` 测试 HTTP 层。

```bash
bun test               # 运行全部测试（149 tests across 16 files）
bun test test/health   # 运行单个测试文件
```

测试 mock 配置在 `test/setup.ts`，mock 掉 DB（含 `transaction` 方法）、AI 服务、简历解析器、pollInbox、email-classifier、EventBus。

WS 集成测试（`test/ws.test.ts`）通过 `app.listen(0)` 启动真实服务器进行 WebSocket 连接测试。

---

## 已验证的端到端流程

测试用例（`test/e2e-test.mjs`）：

1. **IMAP 连接** → 成功连接 `mail.ivis-sh.com:143`
2. **邮件读取** → INBOX 4334 封邮件（BOSS直聘简历推送）
3. **PDF 下载** → 成功下载 200KB 简历附件
4. **文本解析** → 提取 2682 字符的简历文本
5. **AI 评分** → MiniMax M2.5 返回结构化评分

---

## 后续规划

### 近期
- [ ] 结构化简历解析（姓名、学历、技能等字段提取）
- [ ] 自定义评分维度和权重（数据驱动，存入 positions 表）
- [x] i18n 后端多语言支持（locale 字段控制 AI 输出语言，当前支持 zh/ja）
- [x] 两阶段并发架构（Phase 1 串行 IMAP + Phase 2 10路并发 AI 评分）
- [x] 简历原件持久化（fileStorage 抽象层 + 本地 FS 实现 + 回填脚本）
- [x] DB 事务保护（resumes.ts `db.transaction()`）
- [ ] 前端界面（候选人列表、评分详情、职位管理）
- [ ] Supabase Storage 云存储迁移（前端简历下载需要）

### 中期
- [ ] 定时邮件轮询（cron / 后台任务）
- [ ] pgvector 向量检索（语义技能匹配）
- [x] 邮件去重 + 预分类（email_process_logs + classifyEmail，零 LLM 成本）
- [x] 批量并发评分（SCORING_CONCURRENCY = 10）
- [ ] 邮件通知（SMTP 发送面试邮请）

### 远期
- [ ] Agent 多步工作流（自动筛选 → 自动发邀请 → 排期）
- [ ] MCP 集成（连接内部人才库、背调 API）
- [ ] 多模型对比评分
