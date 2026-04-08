# 邮件简历处理系统分析报告

> 生成日期: 2026-03-01
> 邮箱: hr@ivis-sh.com (mail.ivis-sh.com:143)
> 当前状态: 4334 封邮件，全部未读（IMAP \Seen 标记为 0）

---

## 一、邮件增量判断机制分析

### 当前实现

系统完全依赖 IMAP `\Seen` 标记来区分已处理/未处理：

```
pollInbox() 流程:
  1. client.search({ seen: false })  → 获取所有未读 UID
  2. 逐封处理
  3. client.messageFlagsAdd(uid, ["\\Seen"])  → 标记已读
```

**文件**: `src/services/email.ts:69` (搜索) → `src/services/email.ts:213` (标记)

### 问题诊断

| 问题 | 严重度 | 说明 |
|------|--------|------|
| 无 DB 端幂等记录 | 🔴 高 | 如果在 step12(insert candidate) 之后、step19(mark Seen) 之前崩溃，重启后同一邮件会被重复处理，产生重复候选人 |
| 外部状态不可靠 | 🔴 高 | \Seen 标记存储在 IMAP 服务器上，如果邮箱被其他客户端（如 Foxmail/网页版）打开全部标记已读，或 IMAP 服务器重置，所有记录都会丢失 |
| 无断点续传 | 🟡 中 | 4334 封邮件一次 poll 必须全部遍历完，中途失败已标记的继续，未标记的下次重来，但已入库的不知道 |
| 其他客户端干扰 | 🟡 中 | HR 如果用邮件客户端手动查看邮件，会自动标记已读，导致系统跳过该邮件 |

### 最佳实践建议

**方案: DB 水位线 + Message-ID 去重（推荐）**

```
新增表: email_process_log
  - id: UUID PK
  - messageId: text UNIQUE  ← IMAP envelope.messageId (RFC 2822)
  - uid: integer
  - status: enum('fetched', 'parsed', 'scored', 'skipped', 'error')
  - hasResume: boolean
  - candidateId: UUID nullable FK
  - error: text nullable
  - processedAt: timestamp
  - createdAt: timestamp
```

处理流程改进:
```
1. search({ all: true })  或按日期范围 search({ since: lastPollDate })
2. 每封邮件: 先查 email_process_log WHERE messageId = envelope.messageId
   - 已存在且 status='scored' → 跳过 (幂等)
   - 已存在且 status='error' → 可选重试
   - 不存在 → 继续处理
3. 处理前: INSERT email_process_log (status='fetched')
4. 各步骤更新 status: fetched → parsed → scored
5. 保留 \Seen 标记作为辅助（不作为唯一依据）
```

好处:
- **幂等**: 同一邮件永远不会产生重复候选人
- **可追溯**: 每封邮件的处理状态都有记录
- **断点续传**: 崩溃后只需处理 status != 'scored' 的
- **统计**: 随时知道处理了多少、跳过了多少、失败了多少

---

## 二、邮件是否为简历的预判断

### 当前实现

当前**唯一的过滤条件**是附件扩展名 `.pdf/.doc/.docx`（`src/services/email.ts:279`）。

没有附件的邮件自动跳过（`for (const att of attachments)` 循环不执行），不会调用 LLM。
有 PDF 附件但不是简历（如合同、发票、通知）的会**错误地进入 LLM 评分流程**。

### 实际数据

```
邮件来源分布 (采样 50 封):
  ivis-sh.com      42% ← 内部邮件，大概率不是简历
  bosszhipin.com   14% ← 招聘平台，高概率是简历
  163.com          14% ← 个人邮箱，可能是简历
  其他             30% ← 混合

含简历附件: 6% (3/50)
```

42% 是内部邮件！如果这些内部邮件带 PDF 附件（如内部文档），现在会被错误地当作简历处理。

### 推荐方案: 三层过滤（不增加 LLM 成本）

```
Layer 1: 发件人白名单/黑名单 (零成本)
  ├─ 白名单域名: service.bosszhipin.com, *@zhipin.com 等招聘平台
  ├─ 黑名单域名: ivis-sh.com (内部), system-notifications 等
  └─ 其余走 Layer 2

Layer 2: 主题/内容关键词匹配 (零成本)
  ├─ 简历关键词: 简历, resume, 应聘, 求职, 投递, CV, 履歴書
  ├─ 招聘平台格式: "XX-XX岁-XX大学" (BOSS 直聘格式)
  └─ 匹配命中 → 进入 Layer 3; 不命中但有附件 → 标记 "uncertain", 仍进入 Layer 3

Layer 3: 附件扩展名 (当前已有)
  └─ .pdf, .doc, .docx → 下载解析
```

```typescript
// 建议新增的预过滤函数
interface EmailClassification {
  isResume: 'yes' | 'no' | 'uncertain';
  reason: string;
  skipLLM: boolean;
}

function classifyEmail(
  senderAddress: string,
  subject: string,
  attachments: AttachmentInfo[]
): EmailClassification {
  const domain = senderAddress.split('@')[1] ?? '';

  // Layer 1: 域名过滤
  const internalDomains = ['ivis-sh.com'];
  const recruitDomains = ['service.bosszhipin.com', 'zhipin.com',
                          'liepin.com', '51job.com', 'lagou.com'];

  if (internalDomains.includes(domain) && attachments.length === 0) {
    return { isResume: 'no', reason: 'internal_no_attachment', skipLLM: true };
  }
  if (recruitDomains.some(d => domain.endsWith(d))) {
    return { isResume: 'yes', reason: 'recruit_platform', skipLLM: false };
  }

  // Layer 2: 主题关键词
  const resumeKeywords = /简历|resume|应聘|求职|投递|CV|履歴/i;
  if (resumeKeywords.test(subject)) {
    return { isResume: 'yes', reason: 'keyword_match', skipLLM: false };
  }

  // Layer 3: 有附件但不确定
  if (attachments.length > 0) {
    return { isResume: 'uncertain', reason: 'has_attachment', skipLLM: false };
  }

  return { isResume: 'no', reason: 'no_indicator', skipLLM: true };
}
```

资源节省估算:
- 当前: 4334 封邮件全部遍历 MIME 结构
- 优化后: ~42% 内部邮件在 Layer 1 直接跳过 → 减少 ~1820 次 MIME 解析
- LLM 调用: 仍然只在有附件时才调用，变化不大，但避免了"内部 PDF 被误评分"的问题

---

## 三、单封简历邮件的处理流程分析

### 当前流程 (线性串行)

```
收到邮件 (IMAP unseen)
    │
    ▼
[1] 获取 envelope + bodyStructure        ← IMAP fetch, ~100ms
    │
    ▼
[2] findAttachments (MIME 树递归)         ← 本地计算, <1ms
    │
    ▼
[3] 下载附件 binary stream               ← IMAP download, ~500ms-2s (取决于文件大小)
    │
    ▼
[4] parseResume (PDF/DOCX → text)         ← 本地 CPU, ~200ms-1s
    │
    ▼
[5] extractUniversityName (正则匹配)      ← 本地, <1ms
    │
    ▼
[6] lookupUniversity (DB ILIKE 查询)      ← DB, ~10ms
    │
    ▼
[7] 查询 position (DB select)            ← DB, ~5ms
    │
    ▼
[8] INSERT candidates                     ← DB, ~10ms
    │
    ▼
[9] INSERT resumes                        ← DB, ~10ms
    │
    ▼
[10] emit candidate:new → WS push         ← 本地 EventBus, <1ms
    │
    ▼
[11] scoreResume (LLM API call)           ← 🔴 网络 IO, 5-15秒 (瓶颈!)
    │
    ▼
[12] INSERT scores                        ← DB, ~10ms
    │
    ▼
[13] emit candidate:scored → WS push      ← 本地, <1ms
    │
    ▼
[14] 标记 \Seen                           ← IMAP, ~50ms
```

**总耗时**: 约 6-18 秒/封（LLM 调用占 80%+）

### 当前设计的问题

1. **先入库后评分 ✓** — 当前设计实际上是正确的：先 INSERT candidate → 再 LLM 评分。这意味着前端可以在评分前就看到新候选人（通过 `candidate:new` 事件），评分完成后再更新（通过 `candidate:scored` 事件）。

2. **但中间状态不完整** — 候选人创建时 status="screening"，但没有 "waiting_for_score" 之类的状态。如果 LLM 失败，候选人永远停留在 screening 且没有 score 记录。

3. **事务缺失** — candidate INSERT 和 resume INSERT 不在同一事务中。如果 resume INSERT 失败，会留下没有简历的候选人记录。

### 最佳实践流程

```
收到邮件
    │
    ├── [预判断] classifyEmail() ← 域名/关键词/附件过滤
    │      └─ isResume='no' → 记录到 email_process_log(status='skipped') → 结束
    │
    ▼
    ├── [下载+解析] 下载附件 → 解析文本
    │
    ├── [去重检查] 查 email_process_log(messageId)
    │      └─ 已存在 → 跳过
    │
    ▼
    ├── [事务入库] BEGIN TRANSACTION
    │      ├── INSERT email_process_log (status='parsed')
    │      ├── INSERT candidate (status='pending_score')
    │      └── INSERT resume
    │      └── COMMIT
    │
    ├── [推送] emit candidate:new  ← 前端立即可见
    │
    ▼
    ├── [AI 评分] scoreResume() ← 异步/可重试
    │      ├── 成功 → INSERT score → UPDATE candidate status='screening'
    │      │         UPDATE email_process_log status='scored'
    │      │         emit candidate:scored
    │      └── 失败 → UPDATE email_process_log status='error'
    │                 (候选人仍可见，但无评分，可手动重触发)
    │
    └── [标记] IMAP \Seen
```

关键改进:
- **先入库再评分** ✓ (当前已是这样，保持)
- **事务包裹** candidate + resume 的 INSERT
- **增加去重** 通过 email_process_log
- **评分失败可恢复** 不影响已入库的候选人
- **状态更细粒度** pending_score → screening → ...

---

## 四、推送与 API 设计评估

### 当前架构

```
Services → EventBus (内存 pub/sub) → Bridge (index.ts) → Bun server.publish → WS clients
                                                           topic: "hr:events"
```

### 设计评分

| 方面 | 评分 | 说明 |
|------|------|------|
| 解耦设计 | ⭐⭐⭐⭐⭐ | Service 完全不知道 WS 存在，EventBus 作为中间层非常优雅 |
| 零拷贝广播 | ⭐⭐⭐⭐⭐ | Bun native server.publish 是 C++ 级别的零拷贝，性能极好 |
| 心跳机制 | ⭐⭐⭐⭐ | 30 秒间隔 + 带 connectedClients 字段，实用 |
| 事件类型 | ⭐⭐⭐⭐ | candidate:new / candidate:scored / inbox:summary 语义清晰 |
| 实时性 | ⭐⭐⭐⭐⭐ | 入库即推送，评分即推送，前端体验好 |

### 当前不足

| 问题 | 说明 |
|------|------|
| 单 topic 广播 | 所有客户端收到所有事件，无法按 positionId 过滤。subscribe 消息虽然定义了但是 no-op |
| 无 ACK 机制 | 消息推送后不确认是否到达，断线期间的事件会丢失 |
| 无离线回放 | 客户端断线重连后无法获取错过的事件 |
| 无认证 | WS 连接无 token 验证，任何人可订阅 |

### 改进建议

**短期 (推荐立即做)**:
```
1. 按 positionId 分 topic
   topic 命名: "hr:position:{id}" + "hr:global" (inbox:summary 等)
   subscribe 消息真正生效: ws.subscribe(`hr:position:${positionId}`)

2. 重连时补发
   客户端携带 lastEventTimestamp
   服务端从内存 ring buffer (最近 N 条) 补发
```

**中期 (建议规划)**:
```
3. WS 认证
   连接时 URL query 带 token: /ws?token=xxx
   在 open handler 验证 → 失败则 ws.close(4001, "unauthorized")

4. 事件持久化
   events 表: id, type, payload(JSONB), createdAt
   用于审计 + 离线回放
```

### REST API 评估

当前 REST API 设计合理，RESTful 风格标准：
- GET /api/candidates?positionId=&grade=&status= — 列表查询带过滤 ✓
- GET /api/candidates/:id — 详情 + scores join ✓
- POST /api/email/poll — 手动触发 ✓
- POST /api/resumes/upload — 文件上传 ✓

建议补充:
- `GET /api/email/status` — 查询处理进度（已处理/待处理/失败数）
- `POST /api/candidates/:id/rescore` — 重新评分（LLM 失败恢复用）
- `GET /api/email/logs` — 邮件处理日志（配合 email_process_log 表）

---

## 五、全量处理工作量与资源估算

### 邮箱实测数据

| 指标 | 数值 |
|------|------|
| **邮件总数** | 4,334 封 |
| **未读邮件** | 4,334 封 (100% — 从未处理过) |
| **已读邮件** | 0 封 |
| **含简历附件** | ~6% (~260 封) |
| **无简历附件** | ~94% (~4,074 封) |
| **附件类型** | 全部 PDF (采样中未见 DOC/DOCX) |
| **平均邮件大小** | 63.6 KB |

### 发件人分布

| 来源 | 占比 | 性质 |
|------|------|------|
| ivis-sh.com | 42% | 内部邮件，非简历 |
| service.bosszhipin.com | 14% | BOSS 直聘，高概率简历 |
| 163.com | 14% | 个人邮箱，部分简历 |
| mx.tplants.com | 6% | 外部企业 |
| seek.com | 4% | 澳洲招聘平台 |
| outlook.com | 4% | 个人邮箱 |
| 其他 | 16% | 混合 |

### 全量处理资源估算

#### 场景 A: 当前代码直接处理所有未读 (不推荐)

```
遍历邮件:     4,334 封 × (~200ms IMAP fetch) = ~14 分钟
  其中跳过:   4,074 封 (无附件，仅 fetch envelope + bodyStructure)
  需处理:     ~260 封
    下载附件:   260 × ~1s = ~4 分钟
    PDF 解析:   260 × ~500ms = ~2 分钟
    DB 操作:    260 × 6次 × ~10ms = ~16 秒
    LLM 调用:   260 × ~8s = ~35 分钟 ← 🔴 瓶颈

总计: ~55 分钟 (串行)
```

| 资源 | 消耗量 |
|------|--------|
| **IMAP 连接时间** | ~55 分钟持续连接 |
| **LLM API 调用** | ~260 次 |
| **LLM Token** | ~520,000 input tokens + ~130,000 output tokens |
| **LLM 费用** | 取决于 MiniMax 定价，估计 ¥5-15 |
| **DB INSERT** | ~780 行 (260 candidates + 260 resumes + 260 scores) |
| **DB 存储增量** | ~1.3 MB (rawText) + ~200KB (scores/metadata) |
| **内存峰值** | ~100-150 MB (PDF 解析临时内存) |
| **CPU** | 低 (主要是 IO 等待) |

#### 场景 B: 优化后处理 (推荐)

```
Layer 1 过滤:  直接跳过 ~42% 内部邮件 (ivis-sh.com) ≈ 1,820 封
               仅标记 \Seen + 记录 email_process_log

Layer 2 过滤:  主题关键词匹配，进一步排除明显非简历
               预计再排除 ~30% ≈ 750 封

实际需处理:    ~260 封 (与场景 A 相同，但遍历更快)
并发 LLM (3路): 260 / 3 × ~8s = ~12 分钟

总计: ~20 分钟
```

#### 场景 C: 分批处理 (最安全)

```
每批 50 封邮件，按时间从新到旧
每批之间间隔 30 秒 (避免 IMAP 连接超时)
总批次: 4,334 / 50 = 87 批

每批实际含简历: ~3 封
每批耗时: ~2-3 分钟

优势: 可随时中断、可观察进度、不占长时间连接
```

### 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| IMAP 长连接超时断开 | 高 | 中断处理 | 分批 + 每批新建连接 |
| LLM API 限流/超时 | 中 | 部分失败 | 重试队列 + exponential backoff |
| 重复候选人 | 高 | 数据脏 | email_process_log 去重 |
| 内部邮件被误评分 | 高 | 浪费 LLM 配额 | 发件人域名过滤 |
| PDF 解析失败 (加密/扫描件) | 低 | 跳过简历 | 记录错误 + 人工介入标记 |
| 数据库连接池耗尽 | 低 | 全局阻塞 | 控制并发数 |

### 建议执行计划

```
Phase 1 (立即): 新增 email_process_log 表 + 去重逻辑 + classifyEmail 预过滤
Phase 2 (接着): 分批处理模式 + 进度 API
Phase 3 (后续): WS topic 按 position 分离 + 评分重试机制
Phase 4 (规划): 定时 cron 轮询 + 并发 LLM 调用
```
