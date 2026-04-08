# HR 智能简历筛选系统 — 后端

> Bun + Elysia + Drizzle + PostgreSQL + DeepSeek AI

---

## 快速启动

**前提：** PostgreSQL 已运行，Bun 已安装。

```bash
# 1. 进入目录
cd AI_Resume_v2_20260407/hr_backend
export PATH="$HOME/.bun/bin:$PATH"

# 2. 安装依赖（首次）
bun install

# 3. 配置环境变量（首次）
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY 和邮箱密码

# 4. 初始化数据库（首次）
bun run db:migrate
bun run db:seed-universities

# 5. 启动（开发模式，热重载）
bun dev
# → http://localhost:3001
```

**验证：**
```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

**打开前端：** 双击 `../hr_frontend/index.html`

---

## 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 运行时 | Bun | 1.3+ |
| Web 框架 | Elysia | 1.4+ |
| ORM | Drizzle ORM | 0.45+ |
| 数据库 | PostgreSQL | 16 |
| AI 评分 | DeepSeek Chat | via AI SDK v6 |
| 邮件收取 | ImapFlow | IMAP/IMAPS |
| 简历解析 | pdf-parse + mammoth | PDF/DOCX |
| 实时推送 | WebSocket | Bun 原生 |
| 校验 | Zod v4 | — |

---

## API 一览

### 候选人 `/api/candidates`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/candidates` | 列表，支持 positionId/status/grade/universityTier/jlptLevel 筛选 |
| GET | `/api/candidates/search?q=xxx` | 按姓名/邮箱模糊搜索 |
| GET | `/api/candidates/stats` | 聚合统计（Dashboard 用） |
| GET | `/api/candidates/export` | 导出 CSV（支持同列表筛选参数） |
| GET | `/api/candidates/:id` | 候选人详情 + 所有评分 |
| PATCH | `/api/candidates/:id` | 更新状态/备注/联系方式 |

### 简历 `/api/resumes`
| POST | `/api/resumes/upload` | 上传 PDF/DOCX，自动触发 LLM 提取 + AI 评分 |

### 职位 `/api/positions`
| GET/POST | `/api/positions` | 列表/创建 |
| GET/PATCH/DELETE | `/api/positions/:id` | 详情/更新/删除 |

### 邮件 `/api/email`
| POST | `/api/email/poll` | 手动触发收件箱扫描 |
| GET | `/api/email/stats` | 邮件处理统计 |

### 院校 `/api/universities`
| GET | `/api/universities` | 列表（支持 country/tier 筛选） |
| GET | `/api/universities/lookup?name=xxx` | 模糊查询 |
| GET | `/api/universities/stats` | 层级统计 |

### 其他
| GET | `/health` | 健康检查 |
| WS | `/ws` | WebSocket 实时推送 |

---

## 简历处理流程

```
PDF/DOCX
  → ① parseResume()              本地提取纯文本（免费）
  → ② 正则提取                   院校名 → DB查层级，JLPT 等级
  → ③ Promise.all 并发：
       extractStructuredResume()  LLM提取10个字段（≈¥0.003/份）
       scoreResume()              LLM AI评分（≈¥0.008/份）
  → ④ 写入数据库                 候选人 + 简历 + 评分（事务）
```

**每份简历总成本：≈ ¥0.011（100份约¥1.1）**

---

## 数据库表（简要）

**candidates：** id · name · email · phone · university · universityTier(S-D) · jlptLevel(N1-N5) · age · gender · educationLevel · major · workYears · relocationWilling · status · notes

**positions：** id · title · department · description · skillConfig(must/nice/reject) · **scoringWeights(可自定义)** · status · locale

**scores：** totalScore · mustScore · niceScore · educationScore · rejectPenalty · grade(A-F) · matchedSkills · missingSkills · explanation

---

## 常用命令

```bash
bun dev                        # 开发模式（热重载，port 3001）
bun start                      # 生产模式
bun test                       # 运行测试
bun run typecheck              # TypeScript 类型检查
bun run db:generate            # 生成新迁移文件
bun run db:migrate             # 执行迁移
bun run db:seed-universities   # 导入院校种子数据（482条）
bun scripts/rescore-all.ts     # 重跑所有候选人 AI 评分
```

---

## 环境变量

```env
DATABASE_URL=postgresql://hr_user:hr_dev_pass@localhost:5432/hr_screening
DEEPSEEK_API_KEY=sk-...        # 必填
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=xxx@gmail.com
IMAP_PASS=...                  # Gmail 需用 App Password
```

> `.env` 已在 `.gitignore` 中，密钥不会进入版本库。

---

## 详细文档

| 文档 | 内容 |
|------|------|
| `1_PROJECT_OVERVIEW.md` | 完整架构文档 |
| `../2_CHANGELOG_AND_GUIDE.md` | 变更日志 + HR 使用指南 |
| `../3_STRUCTURED_EXTRACTION.md` | LLM提取 + 费用分析 + 权重配置 |
| `../4_CHAT_LOG.md` | 开发对话记录 |
| `../5_USER_GUIDE.md` | 精简用户指南 |
