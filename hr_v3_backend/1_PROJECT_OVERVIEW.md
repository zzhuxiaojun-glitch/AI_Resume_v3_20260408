# HR智能简历筛选系统 — 项目总览

## 一、系统简介

本系统是一套面向 HR 的 AI 驱动简历筛选后端，能够：

1. **自动收取邮件**：监听邮箱收件箱，识别含简历附件的邮件，自动下载解析
2. **解析简历内容**：支持 PDF / DOC / DOCX，提取纯文本
3. **提取关键信息**：自动识别**毕业院校**（含层级评分）和**日语能力（JLPT）等级**
4. **AI 评分**：调用 MiniMax AI 对候选人进行综合评分（0-100 分）
5. **REST API + WebSocket**：提供 HR 前端所需的全部接口，含实时推送

---

## 二、技术栈

| 层级 | 技术 | 版本 / 说明 |
|------|------|-------------|
| 运行时 | **Bun** | 1.x，替代 Node.js，速度更快 |
| Web 框架 | **Elysia** | Bun 原生框架，类型安全路由 |
| ORM | **Drizzle ORM** | 零代码生成，全类型安全 |
| 数据库 | **PostgreSQL** | 15+，主存储 |
| AI | **MiniMax M2.5/M2.7** | 通过 AI SDK (OpenAI 兼容接口) 调用 |
| 邮件收取 | **ImapFlow** | IMAP 协议，支持 STARTTLS / SSL |
| 邮件发送 | **Nodemailer** | SMTP，可选 |
| 文件解析 | **pdf-parse** + **mammoth** | PDF / DOCX 文本提取 |
| 校验 | **Zod v4** | 环境变量 + 数据校验 |
| 实时推送 | **WebSocket** (Bun 原生) | Elysia WS + 发布/订阅 |
| 测试 | **bun:test** | 内置测试框架 |

---

## 三、数据库表结构

### 3.1 `candidates`（候选人表）— 核心表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `positionId` | UUID | 关联职位 |
| `name` | text | 姓名 |
| `email` | text | 邮箱（可空） |
| `phone` | text | 电话（可空） |
| `university` | text | 毕业院校名（从简历提取） |
| `universityTier` | S/A/B/C/D | 院校统一层级 |
| `jlptLevel` | N1~N5 | **日语能力等级（新增）** |
| `skills` | text[] | 技能标签 |
| `status` | enum | new / screening / shortlisted / interviewed / rejected / hired |
| `notes` | text | HR 备注 |
| `createdAt` | timestamp | 创建时间 |

### 3.2 `university_tiers`（院校层级表）

| 层级 | 含义 | educationScore | 国内标签示例 |
|------|------|----------------|--------------|
| **S** | 顶级 | 95 | 985 院校（清华、北大...） |
| **A** | 优秀 | 85 | 211 / 双一流院校 |
| **B** | 良好 | 70 | 省重点一本 |
| **C** | 一般 | 55 | 普通一本 |
| **D** | 基本 | 30 | 普通本科 / 未匹配 |

国际院校以 QS 世界排名换算：≤50→S，≤100→A，≤300→B，≤500→C，其余→D

### 3.3 `scores`（AI评分表）

| 字段 | 说明 |
|------|------|
| `totalScore` | 综合总分（0-100） |
| `mustScore` | 必备技能匹配分 |
| `niceScore` | 加分项匹配分 |
| `educationScore` | 院校层级分 |
| `rejectPenalty` | 扣分项惩罚 |
| `grade` | 综合评级 A/B/C/D/F |
| `explanation` | AI 评价文字 |

### 3.4 其他表

- `positions`：招聘职位（含技能配置 skillConfig）
- `resumes`：简历文件元信息 + 解析文本
- `email_process_logs`：邮件处理幂等日志

---

## 四、API 接口列表

### 4.1 健康检查
```
GET /health
```

### 4.2 候选人接口 `/api/candidates`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/candidates` | 列表（支持 positionId / status / grade / universityTier 筛选） |
| **GET** | **`/api/candidates/search?q=xxx`** | **按姓名或邮箱搜索，返回学校+JLPT（新增）** |
| GET | `/api/candidates/:id` | 候选人详情 + 所有评分 |
| PATCH | `/api/candidates/:id` | 更新状态 / 备注 / 联系方式 |

#### `GET /api/candidates/search` 参数与返回

**请求参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `q` | 是 | 搜索关键字（姓名或邮箱模糊匹配） |
| `limit` | 否 | 最大返回条数，默认 20，上限 100 |

**返回示例：**
```json
[
  {
    "id": "uuid-xxx",
    "name": "田中太郎",
    "email": "taro@example.com",
    "university": "東京大学",
    "universityTier": "S",
    "jlptLevel": "N1",
    "status": "screening",
    "createdAt": "2025-03-01T09:00:00.000Z"
  }
]
```

### 4.3 简历接口 `/api/resumes`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/resumes/upload` | 上传简历（multipart/form-data：file + positionId + name） |

### 4.4 职位接口 `/api/positions`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/positions` | 职位列表 |
| POST | `/api/positions` | 创建职位 |
| GET | `/api/positions/:id` | 职位详情 |
| PATCH | `/api/positions/:id` | 更新职位 |
| DELETE | `/api/positions/:id` | 删除职位 |

### 4.5 院校接口 `/api/universities`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/universities` | 院校列表（支持 country / tier 筛选） |
| GET | `/api/universities/lookup?name=清华` | 院校模糊查询 |
| GET | `/api/universities/stats` | 院校层级统计 |

### 4.6 邮件接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/email-poll` | 手动触发一次收件箱轮询 |
| GET | `/api/email-stats` | 邮件处理统计 |

### 4.7 WebSocket

```
WS /ws
```

订阅频道 `hr:events`，推送以下事件类型：

| 事件 | 触发时机 |
|------|---------|
| `candidate:new` | 新候选人入库 |
| `candidate:scored` | AI 评分完成 |
| `inbox:summary` | 本轮邮件处理汇总 |
| `heartbeat` | 每 30 秒一次心跳 |

---

## 五、关键逻辑说明

### 5.1 JLPT 等级提取

函数：`extractJlptLevel(text)` in `src/services/university-lookup.ts`

正则匹配以下格式（取多个匹配中最高级，即数字最小）：
- `N2`、`n2`
- `JLPT N2`、`JLPT N1`
- `日本語能力試験N1`
- `日语N2级`
- `日语能力考试N3`

### 5.2 院校层级提取

函数：`extractUniversityName(text)` + `lookupUniversity(db, name)`

提取流程：
1. 正则从简历文本中提取院校名
2. PostgreSQL ILIKE 模糊匹配 `university_tiers` 表
3. 若 name 匹配失败，尝试 aliases 数组
4. 匹配成功 → 写入 `universityTier`（S/A/B/C/D）

### 5.3 两阶段并发邮件处理

```
Phase 1（串行，IMAP 连接内）
  邮件扫描 → 分类 → 下载 → 解析 → 提取院校+JLPT → 候选人入库

Phase 2（10路并发，IMAP 已释放）
  AI 评分（MiniMax）→ 评分入库 → WebSocket 推送
```

---

## 六、本地启动步骤

### 6.1 前置条件

```bash
# 1. 安装 Bun（已完成）
curl -fsSL https://bun.sh/install | bash

# 2. 安装 PostgreSQL
sudo apt-get install -y postgresql

# 3. 创建数据库用户和数据库
sudo -u postgres psql -c "CREATE USER hr_user WITH PASSWORD 'hr_dev_pass';"
sudo -u postgres psql -c "CREATE DATABASE hr_screening OWNER hr_user;"

# 4. 启动 PostgreSQL
sudo service postgresql start
```

### 6.2 配置环境变量

编辑 `.env`，**必须填写**：

```env
DATABASE_URL=postgresql://hr_user:hr_dev_pass@localhost:5432/hr_screening
MINIMAX_API_KEY=<你的 MiniMax API Key>
IMAP_PASS=<邮箱密码>
```

### 6.3 初始化数据库

```bash
bun run db:migrate          # 执行所有迁移
bun run db:seed-universities # 导入院校层级数据
```

### 6.4 启动开发服务器

```bash
bun dev          # 热重载，监听 http://localhost:3001
# 或
bun start        # 生产模式
```

### 6.5 验证服务

```bash
curl http://localhost:3001/health
# → {"status":"ok"}

curl "http://localhost:3001/api/candidates/search?q=田中"
# → [...]
```

---

## 七、目录结构

```
hr_backend/
├── src/
│   ├── index.ts              # 入口：启动服务、WS 桥接
│   ├── app.ts                # Elysia 应用实例（路由注册）
│   ├── env.ts                # 环境变量校验（Zod）
│   ├── db/
│   │   ├── schema.ts         # 数据库表结构定义
│   │   ├── index.ts          # Drizzle DB 实例
│   │   └── migrate.ts        # 迁移执行脚本
│   ├── routes/
│   │   ├── candidates.ts     # 候选人 API（含 /search）
│   │   ├── resumes.ts        # 简历上传
│   │   ├── positions.ts      # 职位管理
│   │   ├── universities.ts   # 院校查询
│   │   ├── email-poll.ts     # 手动触发收件
│   │   ├── email-stats.ts    # 邮件统计
│   │   ├── ws.ts             # WebSocket
│   │   └── health.ts         # 健康检查
│   ├── services/
│   │   ├── email.ts          # 邮件两阶段处理（核心）
│   │   ├── ai-scorer.ts      # MiniMax AI 评分
│   │   ├── resume-parser.ts  # PDF/DOCX 解析
│   │   ├── university-lookup.ts # 院校匹配 + JLPT 提取
│   │   └── email-classifier.ts  # 邮件分类（规则引擎）
│   └── lib/
│       ├── types.ts          # 公共类型定义
│       ├── storage.ts        # 文件存储接口
│       ├── ai.ts             # AI 客户端配置
│       ├── event-bus.ts      # 内部事件总线
│       └── ws-types.ts       # WebSocket 消息类型
├── drizzle/                  # SQL 迁移文件
├── scripts/                  # 工具脚本（重跑评分、种子数据等）
├── test/                     # 单元测试
├── .env                      # 环境变量（gitignored）
└── package.json
```

---

## 八、新增功能说明（本次变更）

### JLPT 日语等级字段

- **数据库**：`candidates.jlptLevel`，枚举 `N1 / N2 / N3 / N4 / N5`，可空
- **提取时机**：简历上传（`POST /api/resumes/upload`）和邮件自动处理时自动提取
- **筛选**：`GET /api/candidates?jlptLevel=N2`（需后续扩展，当前通过 search 返回）

### 搜索接口

`GET /api/candidates/search?q=xxx` 是专为前端 HR 查询设计的轻量接口：
- 按**姓名**或**邮箱**模糊匹配（PostgreSQL ILIKE）
- 返回字段：姓名、邮箱、**毕业院校**、**院校层级**、**JLPT 等级**、状态、入库时间
- 支持 `limit` 参数控制返回数量（最大 100）
