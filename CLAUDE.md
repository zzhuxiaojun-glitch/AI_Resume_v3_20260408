# CLAUDE.md — HR Frontend Project Instructions

## Project Overview

AI-powered HR resume screening frontend (React + Vite + TypeScript + Tailwind CSS).  
Backend API: `https://hrapi.keiten-jp.com`  
Backend repo: `git.keiten-jp.com/hr_bot/hr_backend`

---

## Security — Commit 安全规则

**绝对不要 commit 以下内容：**
- API Key、Token、密码（如 `glpat-*`、`sk-*`、Bearer token）
- `.env` / `.env.local` 文件（已在 `.gitignore` 中）
- 任何包含 credentials 的配置文件

**敏感信息的正确存放位置：**
- 环境变量 → `.env.local`（gitignored）
- 代码中引用 → 只用 `import.meta.env.VITE_XXX`，不写真实值

---

## Git Commit Discipline

- Commit message 格式：`type: concise description`
- 每个 commit 保持可独立 review 的颗粒度
- 使用具体文件/功能名，不用模糊描述（如"update files"）

### 支持的 type

| type | 用途 |
|------|------|
| `feat:` | 新功能 |
| `fix:` | Bug 修复 |
| `test:` | 测试新增或修改 |
| `docs:` | 仅文档修改 |
| `refactor:` | 代码重构（不改功能） |
| `style:` | 样式调整（UI/CSS，不改逻辑） |

### 示例

```
feat: add university lookup to candidate detail page
fix: correct status filter not resetting on position change
docs: update API_REFERENCE with universities endpoints
refactor: extract StatusBadge into shared component
style: adjust kanban card padding and grade badge colors
```

---

## Development Workflow

### 分支管理

```
feature/*  ──MR──▶  main
```

- **main**: 主分支，对应生产部署
- **feature/***: 功能开发，完成后向 main 发 MR

### 开始新功能

```bash
git checkout main && git pull
git checkout -b feature/简短描述
```

### 提交规范

```bash
git add <具体文件>     # 不用 git add .
git commit -m "feat: add xxx"
git push origin feature/xxx
```

---

## Tech Stack & Key Commands

- **框架**: React 18 + Vite
- **语言**: TypeScript（strict mode）
- **样式**: Tailwind CSS
- **包管理**: npm

```bash
cd hr_v3_frontend
npm run dev        # 本地开发服务器 → http://localhost:5173
npm run build      # 生产构建
npm run preview    # 预览生产构建
./node_modules/.bin/tsc --noEmit  # TypeScript 类型检查
```

---

## Project Structure

```
hr_v3_frontend/
└── src/
    ├── components/       # 页面组件
    │   ├── CandidatesPage.tsx
    │   ├── CandidatesKanbanPage.tsx
    │   ├── CandidateDetailPage.tsx
    │   ├── DashboardPage.tsx
    │   ├── PositionsPage.tsx
    │   ├── UploadPage.tsx
    │   └── EmailPage.tsx
    ├── hooks/
    │   └── useWebSocket.ts   # WebSocket 实时事件 hook
    ├── lib/
    │   ├── api.ts            # 所有后端 API 调用
    │   └── types.ts          # 共享 TypeScript 类型定义
    └── App.tsx               # 路由入口
hr_v3_backend/            # v2 后端备份（参考用）
```

## API & Types

- 所有后端调用封装在 `src/lib/api.ts`，不要在组件里直接 fetch
- 类型定义在 `src/lib/types.ts`，与后端 schema 保持一致
- 新增/修改接口时同步更新 `types.ts` 和 `api.ts`
