# HR 智能筛选系统 — 前端 API 对接文档

> Base URL: `http://localhost:3001`
>
> WebSocket: `ws://localhost:3001/ws`

---

## 目录

1. [REST API](#rest-api)
   - [健康检查](#1-健康检查)
   - [职位管理](#2-职位管理)
   - [候选人管理](#3-候选人管理)
   - [简历上传](#4-简历上传)
   - [邮箱轮询](#5-邮箱轮询)
2. [WebSocket 实时推送](#websocket-实时推送)
   - [连接方式](#连接方式)
   - [Server → Client 事件](#server--client-事件)
   - [Client → Server 消息](#client--server-消息)
3. [前端集成示例](#前端集成示例)
   - [Axios / Fetch 封装](#axios--fetch-封装)
   - [WebSocket Hook (React)](#websocket-hook-react)
   - [完整 Dashboard 示例](#完整-dashboard-示例)
4. [数据类型参考](#数据类型参考)
5. [错误处理约定](#错误处理约定)
6. [手动测试](#手动测试)

---

## REST API

### 1. 健康检查

#### `GET /health`

**响应 200：**
```json
{
  "status": "ok",
  "timestamp": "2026-02-28T08:00:00.000Z"
}
```

---

### 2. 职位管理

#### `GET /api/positions` — 获取所有职位

**响应 200：**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "高级前端工程师",
    "department": "研发部",
    "description": "负责公司前端产品的开发和维护",
    "skillConfig": {
      "must": ["TypeScript", "React", "Node.js"],
      "nice": ["Docker", "CI/CD"],
      "reject": ["无相关开发经验"]
    },
    "status": "open",
    "locale": "zh",
    "createdAt": "2026-01-15T08:00:00.000Z",
    "updatedAt": "2026-01-15T08:00:00.000Z"
  }
]
```

#### `GET /api/positions/:id` — 获取单个职位

**响应 200：** 同上单个对象

**响应 404：**
```json
{ "error": "Position not found" }
```

#### `POST /api/positions` — 创建职位

**请求体：**
```json
{
  "title": "高级前端工程师",
  "department": "研发部",
  "description": "负责公司前端产品的开发和维护",
  "skillConfig": {
    "must": ["TypeScript", "React"],
    "nice": ["Docker", "CI/CD"],
    "reject": ["无相关开发经验"]
  },
  "status": "open",
  "locale": "zh"
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `title` | string | 是 | — | 职位名称 |
| `department` | string | 否 | `null` | 部门 |
| `description` | string | 否 | `null` | 职位描述 |
| `skillConfig` | object | 否 | `{must:[],nice:[],reject:[]}` | AI 评分技能配置 |
| `status` | string | 否 | `"open"` | 状态：`open` / `closed` / `draft` |
| `locale` | string | 否 | `"zh"` | AI 评分输出语言：`"zh"`（中文） / `"ja"`（日语） |

**响应 201：** 返回创建的职位对象（含 `id`, `createdAt`）

#### `PATCH /api/positions/:id` — 更新职位

**请求体：** 传入需要修改的字段（部分更新）

```json
{
  "title": "資深フロントエンドエンジニア",
  "locale": "ja",
  "skillConfig": {
    "must": ["TypeScript", "React", "Vue"],
    "nice": ["Docker"],
    "reject": []
  }
}
```

**响应 200：** 返回更新后的完整职位对象

**响应 404：** `{ "error": "Position not found" }`

#### `DELETE /api/positions/:id` — 删除职位

**响应 200：**
```json
{ "deleted": true }
```

**响应 404：** `{ "error": "Position not found" }`

---

### 3. 候选人管理

#### `GET /api/candidates` — 候选人列表

支持查询参数筛选，默认按 `totalScore` 降序排列。

| 参数 | 类型 | 说明 |
|------|------|------|
| `positionId` | UUID | 按职位筛选 |
| `status` | string | 按状态筛选：`new` / `screening` / `shortlisted` / `interviewed` / `rejected` / `hired` |
| `grade` | string | 按评级筛选：`A` / `B` / `C` / `D` / `F` |
| `universityTier` | string | 按院校层级筛选：`S` / `A` / `B` / `C` / `D` |

**示例请求：**
```
GET /api/candidates?positionId=550e8400-...&grade=A
```

**响应 200：**
```json
[
  {
    "id": "cand-uuid",
    "positionId": "pos-uuid",
    "name": "张三",
    "email": "zhang@example.com",
    "phone": "13800138000",
    "education": null,
    "university": "清华大学",
    "universityTier": "S",
    "skills": null,
    "status": "screening",
    "notes": null,
    "createdAt": "2026-02-28T08:30:00.000Z",
    "totalScore": 85.50,
    "educationScore": 95.00,
    "grade": "A"
  }
]
```

> 注意：`totalScore` 和 `grade` 来自 LEFT JOIN scores 表，未评分的候选人这两个字段为 `null`。所有分数保留两位小数。

#### `GET /api/candidates/:id` — 候选人详情

返回候选人基本信息 + 所有评分记录。

**响应 200：**
```json
{
  "id": "cand-uuid",
  "positionId": "pos-uuid",
  "name": "张三",
  "email": "zhang@example.com",
  "phone": null,
  "education": null,
  "skills": null,
  "status": "screening",
  "notes": null,
  "createdAt": "2026-02-28T08:30:00.000Z",
  "updatedAt": "2026-02-28T08:30:00.000Z",
  "scores": [
    {
      "id": "score-uuid",
      "candidateId": "cand-uuid",
      "positionId": "pos-uuid",
      "totalScore": 85.50,
      "mustScore": 90.00,
      "niceScore": 70.25,
      "rejectPenalty": 0.00,
      "grade": "A",
      "matchedSkills": ["TypeScript", "React", "Node.js"],
      "missingSkills": ["Docker"],
      "explanation": "候選者はフロントエンド開発能力が高く、TypeScriptとReactの経験が豊富。Dockerの経験が不足。",
      "createdAt": "2026-02-28T08:30:05.000Z"
    }
  ]
}
```

**响应 404：** `{ "error": "Candidate not found" }`

#### `PATCH /api/candidates/:id` — 更新候选人

**请求体：**
```json
{
  "status": "shortlisted",
  "notes": "技术面通过，推进终面",
  "phone": "13800138000",
  "email": "zhang@example.com"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 状态流转：`new` → `screening` → `shortlisted` → `interviewed` → `hired` / `rejected` |
| `notes` | string | HR 备注 |
| `phone` | string | 手机号 |
| `email` | string | 邮箱 |

**响应 200：** 返回更新后的候选人对象

**响应 404：** `{ "error": "Candidate not found" }`

---

### 4. 简历上传

#### `POST /api/resumes/upload` — 上传简历并自动评分

> Content-Type: `multipart/form-data`

**请求体（FormData）：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | PDF 或 DOCX 简历文件 |
| `positionId` | string | 是 | 关联职位 ID |
| `name` | string | 否 | 候选人姓名，默认 `"Unknown"` |

**前端调用示例：**
```typescript
const form = new FormData();
form.append("file", fileInput.files[0]);
form.append("positionId", selectedPositionId);
form.append("name", "李四");

const res = await fetch("/api/resumes/upload", {
  method: "POST",
  body: form,
});
```

**响应 201：**
```json
{
  "candidate": {
    "id": "cand-uuid",
    "positionId": "pos-uuid",
    "name": "李四",
    "email": null,
    "status": "screening",
    "createdAt": "2026-02-28T09:00:00.000Z",
    "updatedAt": "2026-02-28T09:00:00.000Z"
  },
  "score": {
    "id": "score-uuid",
    "candidateId": "cand-uuid",
    "positionId": "pos-uuid",
    "totalScore": 72.15,
    "mustScore": 80.00,
    "niceScore": 50.50,
    "rejectPenalty": 0.00,
    "grade": "B",
    "matchedSkills": ["TypeScript", "React"],
    "missingSkills": ["Node.js", "Docker"],
    "explanation": "候选人前端能力较强，但后端经验不足。",
    "createdAt": "2026-02-28T09:00:03.000Z"
  },
  "resumeText": "李四，男，2023年毕业于...（前 500 字）..."
}
```

**响应 400：**
```json
{ "error": "No file uploaded" }
// 或
{ "error": "positionId is required" }
```

**响应 404：** `{ "error": "Position not found" }`

---

### 5. 邮箱轮询

#### `POST /api/email/poll` — 触发一次邮箱收件

从 IMAP 邮箱抓取未读简历邮件，自动去重、分类、解析、评分并入库。处理过程中会通过 WebSocket 推送实时事件。

**请求体：**
```json
{
  "positionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `positionId` | UUID | 是 | 新候选人关联的职位 ID |

**响应 200：**
```json
{
  "candidateIds": [
    "cand-uuid-1",
    "cand-uuid-2",
    "cand-uuid-3"
  ],
  "count": 3
}
```

**响应 400：**
```json
{ "error": "positionId is required" }
```

**响应 500：**
```json
{ "error": "IMAP connection failed" }
```

**处理流程详解：**

邮件处理采用两阶段并发架构：

**Phase 1 — IMAP 快速扫描（串行）：**
1. **DB 去重** — 用 RFC 2822 `Message-ID` 查 `email_process_logs` 表，已处理(`scored`)的邮件直接标记已读跳过
2. **预分类** — `classifyEmail()` 零 LLM 成本判断邮件是否包含简历
   - 内部邮件(`ivis-sh.com`)无附件 → 跳过
   - 招聘平台(BOSS直聘/51job/猎聘等) → 处理
   - 主题含简历关键词 → 处理
   - 主题含系统通知关键词(验证码/退订等) → 跳过
   - 有 PDF/DOCX 附件但无上述特征 → 以 `uncertain` 状态处理
   - 无附件无特征 → 跳过
3. **附件下载 + 简历解析** — PDF/DOCX → 纯文本
4. **候选人入库** — INSERT `candidates`(status=screening) + `resumes`
5. **标记已读** — IMAP `\Seen` 标记
6. **释放 IMAP** — 连接断开

**Phase 2 — AI 并发评分（10 路并发）：**
7. **AI 评分** — MiniMax M2.5 智能评分 → INSERT `scores`（10 路并发）
8. **状态更新** — `email_process_logs` 更新为 `scored`

所有步骤的状态变化都记录在 `email_process_logs` 表中，状态流转：`fetched` → `parsed` → `scored`（或 `error`）。

**副作用（WebSocket 推送）：**

调用此端点后，邮件处理分两个阶段推送事件：
1. **Phase 1（IMAP 扫描）** — 每解析一封简历后推送 `candidate:new`（候选人已入库，但**未评分**）
2. **Phase 2（AI 并发评分，IMAP 已释放）** — 10 路并发评分完成后逐个推送 `candidate:scored`
3. （全部评分完后）`inbox:summary` — 批次摘要（含评分分布和 Top 5）

> 注意：Phase 1 所有 `candidate:new` 会先集中发出，Phase 2 的 `candidate:scored` 在 IMAP 释放后才开始。前端应能处理两个事件之间的时间差。

**幂等安全：** 同一封邮件重复调用不会产生重复候选人。`email_process_logs.messageId` UNIQUE 约束 + `onConflictDoNothing()` 保证幂等。

---

### 6. 院校数据

#### `GET /api/universities` — 院校列表

支持查询参数筛选。

| 参数 | 类型 | 说明 |
|------|------|------|
| `country` | string | 按国家/地区代码筛选（CN, JP, US, UK 等） |
| `tier` | string | 按统一层级筛选（S, A, B, C, D） |

**响应 200：**
```json
[
  {
    "id": "uuid",
    "name": "清华大学",
    "aliases": ["Tsinghua University"],
    "country": "CN",
    "domesticTag": "985",
    "qsRank": 20,
    "tier": "S",
    "updatedYear": 2025,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

#### `GET /api/universities/lookup?name=清华` — 院校模糊搜索

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 搜索关键词（中英文均可） |

**响应 200：** 返回匹配的院校对象

**响应 400：** `{ "error": "name parameter is required" }`

**响应 404：** `{ "error": "University not found" }`

#### `GET /api/universities/stats` — 院校统计

**响应 200：**
```json
{
  "total": 450,
  "byTier": { "S": 50, "A": 120, "B": 200, "C": 50, "D": 30 },
  "byCountry": { "CN": 150, "JP": 30, "US": 40, "UK": 25, ... }
}
```

---

## WebSocket 实时推送

### 连接方式

```
ws://localhost:3001/ws
```

连接成功后**立即**收到一条 `heartbeat` 消息。之后每 **30 秒**自动广播一次。

所有客户端共享同一 topic（`hr:events`），接收全部事件。

### Server → Client 事件

所有事件均为 JSON 字符串，通过 `type` 字段区分（discriminated union）。

---

#### `heartbeat` — 心跳

**触发时机：** 连接时立即 + 每 30 秒 + 客户端发送 `ping` 时

```json
{
  "type": "heartbeat",
  "timestamp": "2026-02-28T08:00:00.000Z",
  "connectedClients": 3
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | ISO 8601 string | 服务器当前时间 |
| `connectedClients` | number | 当前 WebSocket 连接数 |

---

#### `candidate:new` — 新候选人入库

**触发时机：** 邮箱轮询 Phase 1（IMAP 扫描阶段）中每创建一个候选人后，此时 AI 评分**尚未开始**

```json
{
  "type": "candidate:new",
  "candidateId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "张三",
  "email": "zhang@example.com",
  "positionId": "660e8400-e29b-41d4-a716-446655440000",
  "positionTitle": "高级前端工程师",
  "source": "email",
  "timestamp": "2026-02-28T08:30:00.000Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `candidateId` | UUID | 新创建的候选人 ID |
| `name` | string | 候选人姓名（来自邮件发件人） |
| `email` | string \| undefined | 候选人邮箱 |
| `positionId` | UUID | 关联职位 ID |
| `positionTitle` | string | 关联职位名称 |
| `source` | `"email"` \| `"upload"` | 简历来源 |
| `timestamp` | ISO 8601 | 事件时间 |

**前端建议操作：** 显示 toast 通知 "新候选人：张三 — 高级前端工程师"

---

#### `candidate:scored` — AI 评分完成

**触发时机：** Phase 2（AI 并发评分阶段，10 路并发）中每个候选人评分写入数据库后。注意：Phase 2 在 IMAP 连接释放后才开始，因此 `candidate:scored` 可能比对应的 `candidate:new` 晚很多。

```json
{
  "type": "candidate:scored",
  "candidateId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "张三",
  "positionId": "660e8400-e29b-41d4-a716-446655440000",
  "totalScore": 85.50,
  "grade": "A",
  "matchedSkills": ["TypeScript", "React", "Node.js"],
  "educationScore": 95.00,
  "timestamp": "2026-02-28T08:30:05.000Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `candidateId` | UUID | 候选人 ID |
| `name` | string | 候选人姓名 |
| `positionId` | UUID | 关联职位 ID |
| `totalScore` | number | 综合分数 (0.00-100.00，保留两位小数) |
| `grade` | `"A"` \| `"B"` \| `"C"` \| `"D"` \| `"F"` | 评级 |
| `matchedSkills` | string[] | 匹配到的技能列表 |
| `educationScore` | number | 学历/院校评分 (0.00-100.00，保留两位小数) |
| `timestamp` | ISO 8601 | 事件时间 |

**前端建议操作：** 更新候选人列表中的评分/评级；如果当前在候选人详情页则刷新评分数据

---

#### `inbox:summary` — 批次处理摘要

**触发时机：** 一次 `POST /api/email/poll` 全部处理完成后（仅处理了 ≥1 个候选人时才发送）

```json
{
  "type": "inbox:summary",
  "totalProcessed": 5,
  "gradeDistribution": {
    "A": 1,
    "B": 2,
    "C": 1,
    "D": 1,
    "F": 0
  },
  "topCandidates": [
    {
      "candidateId": "uuid-1",
      "name": "张三",
      "grade": "A",
      "totalScore": 90.25
    },
    {
      "candidateId": "uuid-2",
      "name": "李四",
      "grade": "B",
      "totalScore": 78.50
    }
  ],
  "timestamp": "2026-02-28T08:31:00.000Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `totalProcessed` | number | 本次处理的候选人总数 |
| `gradeDistribution` | `{A,B,C,D,F: number}` | 各评级人数分布 |
| `topCandidates` | array | 分数最高的前 5 名候选人 |
| `timestamp` | ISO 8601 | 事件时间 |

**前端建议操作：** 显示摘要弹窗/通知；刷新候选人列表

---

#### `error` — 错误

**触发时机：** 客户端发送的消息无法解析或类型不合法时

```json
{
  "type": "error",
  "message": "Invalid JSON"
}
```

可能的 message 值：
- `"Invalid JSON"` — 消息不是合法 JSON
- `"Unknown message type"` — type 字段不是 `ping` / `subscribe`

---

### Client → Server 消息

#### `ping` — 请求心跳回复

```json
{ "type": "ping" }
```

服务端收到后立即回复一条 `heartbeat`。可用于：
- 前端主动检测连接状态
- 获取最新 `connectedClients` 数

#### `subscribe`（预留，当前未实现过滤）

```json
{ "type": "subscribe", "positionId": "uuid" }
```

当前版本所有客户端接收全部事件，`positionId` 参数暂不生效。

---

## 前端集成示例

### Axios / Fetch 封装

```typescript
const API_BASE = "http://localhost:3001";

// 获取候选人列表（按职位 + 评级筛选）
async function getCandidates(params: {
  positionId?: string;
  grade?: string;
  status?: string;
}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v),
  ).toString();
  const res = await fetch(`${API_BASE}/api/candidates?${query}`);
  return res.json();
}

// 触发邮箱轮询
async function pollInbox(positionId: string) {
  const res = await fetch(`${API_BASE}/api/email/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ positionId }),
  });
  return res.json();
}

// 上传简历
async function uploadResume(file: File, positionId: string, name?: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("positionId", positionId);
  if (name) form.append("name", name);

  const res = await fetch(`${API_BASE}/api/resumes/upload`, {
    method: "POST",
    body: form,
  });
  return res.json();
}
```

### WebSocket Hook (React)

```typescript
import { useEffect, useRef, useCallback, useState } from "react";

// ---- 类型定义 ----

interface HeartbeatEvent {
  type: "heartbeat";
  timestamp: string;
  connectedClients: number;
}

interface CandidateNewEvent {
  type: "candidate:new";
  candidateId: string;
  name: string;
  email?: string;
  positionId: string;
  positionTitle: string;
  source: "email" | "upload";
  timestamp: string;
}

interface CandidateScoredEvent {
  type: "candidate:scored";
  candidateId: string;
  name: string;
  positionId: string;
  /** 0.00-100.00，保留两位小数 */
  totalScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  matchedSkills: string[];
  /** 学历/院校评分（0.00-100.00，保留两位小数） */
  educationScore: number;
  timestamp: string;
}

interface InboxSummaryEvent {
  type: "inbox:summary";
  totalProcessed: number;
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
  topCandidates: Array<{
    candidateId: string;
    name: string;
    grade: string;
    totalScore: number;
  }>;
  timestamp: string;
}

interface ErrorEvent {
  type: "error";
  message: string;
}

type ServerEvent =
  | HeartbeatEvent
  | CandidateNewEvent
  | CandidateScoredEvent
  | InboxSummaryEvent
  | ErrorEvent;

// ---- Hook ----

export function useHRWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null);
  const handlersRef = useRef<Map<string, Set<(e: any) => void>>>(new Map());

  // 注册事件处理器
  const on = useCallback(<T extends ServerEvent["type"]>(
    type: T,
    handler: (event: Extract<ServerEvent, { type: T }>) => void,
  ) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);

    // 返回取消订阅函数
    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  // 发送 ping
  const ping = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "ping" }));
  }, []);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let stopped = false;

    function connect() {
      if (stopped) return;
      const ws = new WebSocket(url);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as ServerEvent;
          setLastEvent(event);

          // 分发到注册的处理器
          const handlers = handlersRef.current.get(event.type);
          if (handlers) {
            for (const handler of handlers) handler(event);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => ws.close();
      wsRef.current = ws;
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [url]);

  return { connected, lastEvent, on, ping };
}
```

### 完整 Dashboard 示例

```tsx
import { useEffect, useCallback, useState } from "react";
import { useHRWebSocket } from "./hooks/useHRWebSocket";

const WS_URL = "ws://localhost:3001/ws";
const API_BASE = "http://localhost:3001";

export default function Dashboard() {
  const { connected, on } = useHRWebSocket(WS_URL);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);

  // 初始加载
  useEffect(() => {
    fetch(`${API_BASE}/api/candidates`)
      .then((r) => r.json())
      .then(setCandidates);
  }, []);

  // 监听 WS 事件
  useEffect(() => {
    const unsub1 = on("candidate:new", (e) => {
      setNotifications((prev) => [
        `新候选人：${e.name} — ${e.positionTitle}`,
        ...prev.slice(0, 9),
      ]);
    });

    const unsub2 = on("candidate:scored", (e) => {
      setNotifications((prev) => [
        `评分完成：${e.name} → ${e.grade} (${e.totalScore.toFixed(2)}分)`,
        ...prev.slice(0, 9),
      ]);
      // 收到评分后刷新列表
      fetch(`${API_BASE}/api/candidates`)
        .then((r) => r.json())
        .then(setCandidates);
    });

    const unsub3 = on("inbox:summary", (e) => {
      setNotifications((prev) => [
        `邮箱处理完成：${e.totalProcessed} 份简历，A:${e.gradeDistribution.A} B:${e.gradeDistribution.B} C:${e.gradeDistribution.C}`,
        ...prev.slice(0, 9),
      ]);
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [on]);

  // 触发邮箱轮询
  const handlePoll = async (positionId: string) => {
    await fetch(`${API_BASE}/api/email/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId }),
    });
    // 无需手动刷新——WS 事件会自动触发更新
  };

  return (
    <div>
      <header>
        <span>WebSocket: {connected ? "🟢 已连接" : "🔴 未连接"}</span>
      </header>

      <section>
        <h2>实时通知</h2>
        <ul>
          {notifications.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>候选人列表</h2>
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>邮箱</th>
              <th>评分</th>
              <th>评级</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.totalScore?.toFixed(2) ?? "—"}</td>
                <td>{c.grade ?? "—"}</td>
                <td>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
```

---

## 数据类型参考

### 候选人状态流转

```
new → screening → shortlisted → interviewed → hired
                                            → rejected
```

### AI 评分等级

| 等级 | 分数范围 | 说明 |
|------|---------|------|
| A | ≥ 80.00 | 优秀，强烈推荐面试 |
| B | ≥ 65.00 | 良好，推荐面试 |
| C | ≥ 50.00 | 一般，可选面试 |
| D | ≥ 35.00 | 较弱，不推荐 |
| F | < 35.00 | 不匹配 |

### 评分计算公式

```
totalScore = mustScore × 0.5 + niceScore × 0.2 + educationScore × 0.2 - rejectPenalty × 0.1
（所有分数保留两位小数，如 72.35）
```

### i18n 多语言支持

AI 评分的输出语言由职位的 `locale` 字段控制：

| locale | 语言 | AI 评价示例 |
|--------|------|------------|
| `"zh"` | 中文（默认） | `"候选人前端能力较强，但后端经验不足。"` |
| `"ja"` | 日语 | `"候補者はフロントエンド能力が高いが、バックエンド経験が不足。"` |

**影响范围：**
- `scores.explanation` 字段 — 根据 locale 输出对应语言的评语
- AI 评分提示词（Prompt） — 角色描述、输出指令、标签均切换语言
- REST API 响应中的 explanation 字段

**设置方式：**
```bash
# 创建日语评分职位
curl -X POST http://localhost:3001/api/positions \
  -H "Content-Type: application/json" \
  -d '{"title":"フロントエンドエンジニア","locale":"ja","skillConfig":{"must":["TypeScript"],"nice":["Docker"],"reject":[]}}'

# 更新现有职位为日语评分
curl -X PATCH http://localhost:3001/api/positions/UUID \
  -H "Content-Type: application/json" \
  -d '{"locale":"ja"}'
```

---

## 错误处理约定

所有 REST 错误响应格式统一：

```json
{ "error": "错误描述信息" }
```

| HTTP 状态码 | 场景 |
|------------|------|
| 400 | 缺少必填参数（positionId、file 等） |
| 404 | 资源不存在（职位、候选人） |
| 500 | 服务器内部错误（IMAP 连接失败、AI 调用异常等） |

---

## 手动测试

### 测试 REST API

```bash
# 创建职位（默认中文评分）
curl -X POST http://localhost:3001/api/positions \
  -H "Content-Type: application/json" \
  -d '{
    "title": "前端工程师",
    "department": "研发部",
    "skillConfig": {"must":["TypeScript","React"],"nice":["Docker"],"reject":[]},
    "locale": "zh"
  }'

# 获取候选人列表（筛选 A 级）
curl "http://localhost:3001/api/candidates?grade=A"

# 上传简历
curl -X POST http://localhost:3001/api/resumes/upload \
  -F "file=@resume.pdf" \
  -F "positionId=YOUR_POSITION_UUID" \
  -F "name=张三"
```

### 测试 WebSocket + 邮箱轮询

```bash
# 终端 1：启动服务
bun dev

# 终端 2：连接 WebSocket
npx wscat -c ws://localhost:3001/ws
# → 立即收到 {"type":"heartbeat",...}
# → 每 30 秒收到一次 heartbeat

# 终端 2 中发送 ping：
{"type":"ping"}
# → 立即收到 heartbeat 回复

# 终端 3：触发邮箱轮询
curl -X POST http://localhost:3001/api/email/poll \
  -H "Content-Type: application/json" \
  -d '{"positionId":"YOUR_POSITION_UUID"}'

# → 终端 2 依次收到：
#   {"type":"candidate:new","candidateId":"...","name":"张三",...}
#   {"type":"candidate:scored","candidateId":"...","totalScore":85.50,"grade":"A",...}
#   ... 每个候选人一组 new + scored
#   {"type":"inbox:summary","totalProcessed":3,"gradeDistribution":{...},...}
```
