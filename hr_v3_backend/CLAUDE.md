# CLAUDE.md — HR Backend Project Instructions

## Project Overview

AI-powered resume screening backend (Bun + Elysia + Drizzle + PostgreSQL).
See `docs/TECHNICAL.md` for full architecture details.

## Security — Commit 安全规则

**绝对不要 commit 以下内容：**
- API Key、Token、密码（如 `glpat-*`、`sk-*`、Bearer token）
- `.env` 文件（已在 `.gitignore` 中）
- 数据库连接串中的明文密码
- 任何包含 credentials 的配置文件

**敏感信息的正确存放位置：**
- 环境变量 → `.env`（gitignored）
- 本地个人配置 → `CLAUDE.local.md`（自动 gitignored）
- 代码中引用 → 只用 `$ENV_VAR` 或 `process.env.XXX`，不写真实值

**Commit 前检查：**
- `git diff --staged` 中不应出现 token、password、secret 等敏感字符串
- 如果误 commit 了敏感信息，必须立即轮换（revoke + regenerate），git history 无法安全删除

## Development Workflow

### TDD (Test-Driven Development)

- Always write tests BEFORE implementation code (Red-Green-Refactor)
- RED: Write failing tests that define expected behavior
- GREEN: Write minimal code to make tests pass
- REFACTOR: Clean up while keeping tests green
- Run `bun test` after each change to verify

### Documentation

- When modifying features, update ALL related docs:
  - `README.md` — user-facing overview
  - `docs/TECHNICAL.md` — architecture, DB schema, services
  - `docs/WEBSOCKET-API.md` — API reference for frontend integration
- Keep docs in sync with code — no stale documentation

### Git Commit Discipline

- Commit and push after each logical module or step
- Each commit must be independently reviewable
- Commit message format: `type: concise description`
  - `feat:` new feature
  - `fix:` bug fix
  - `test:` test additions/changes
  - `test+feat:` TDD — tests and implementation together
  - `docs:` documentation only
  - `refactor:` code restructuring
- Stage specific files (not `git add .`) to keep commits focused
- Push after each commit to keep remote up to date

### GitLab AI Review 工作流

Push 后 GitLab 会自动触发 AI review bot 评论。当用户说"看 review"或"check review"时：

1. 用 GitLab API 拉取最近 commit 的 review 评论（token 从环境变量 `GITLAB_TOKEN` 读取）
2. 解析评论内容，过滤 AI Bot 的评论
3. 评估每条建议：判断是否合理、是否需要修改
4. 合理的建议直接修改代码，commit 并 push
5. 不合理的建议说明原因，跳过

GitLab 项目路径：`hr_bot/hr_backend`
GitLab API Host：`git.keiten-jp.com`
API 调用方式：`curl -s --header "PRIVATE-TOKEN: $GITLAB_TOKEN" "https://git.keiten-jp.com/api/v4/projects/..."`

## Tech Stack & Conventions

- **Runtime**: Bun (not Node.js)
- **Test runner**: `bun:test` (not Jest/Vitest)
- **Package manager**: `bun install` (not npm/yarn)
- **Framework**: Elysia (Bun-native, type-safe)
- **ORM**: Drizzle (type-safe, zero codegen)
- **DB**: PostgreSQL 15+
- **Language**: TypeScript strict mode, ESM only
- **Validation**: Zod v4

## Key Commands

```bash
bun dev                      # Dev server (hot reload, port 3001)
bun test                     # Run all tests
bun test test/<name>         # Run specific test file
bun run typecheck            # TypeScript type check (tsc --noEmit)
bun run db:generate          # Generate DB migration
bun run db:migrate           # Execute DB migration
bun run db:seed-universities # Import university seed data
```

## Testing Patterns

- Tests use `app.handle(new Request(...))` to test HTTP layer
- All external deps are mocked in `test/setup.ts` (DB, AI, email, EventBus)
- Drizzle query builder mocks use chainable proxy pattern: `chainable(finalValue)`
- `mockDb.transaction` delegates to callback with `mockDb` as `tx`, enabling transaction tests
- Pure function tests copy functions locally to avoid mock interference from setup.ts preload
- WS integration tests use `app.listen(0)` for real server connections

## Architecture Notes

- `src/lib/event-bus.ts` decouples services from WebSocket transport
- Services emit events via EventBus; `src/index.ts` bridges to WS pub/sub
- **Two-phase concurrent architecture** in `email.ts`:
  - Phase 1 (serial): IMAP scan → parse → **fileStorage.save()** → insert candidates/resumes → collect ScoringTask[]
  - Phase 2 (10-way concurrent): AI scoring → insert scores → emit events
  - IMAP released before AI calls, improving resource utilization
- `resumes.ts` upload route pre-generates `candidateId`, saves file via `fileStorage.save()` before transaction, then uses `db.transaction()` for atomic insert (candidate + resume + score)
- AI scorer uses `generateText` (not `generateObject`) because MiniMax M2.5 returns `<think>` tags
- All scores use 2 decimal places via `.transform(round2)`
- `educationScore` defaults to 0 everywhere for backward compatibility
- `src/lib/storage.ts` provides `FileStorage` interface + `LocalFileStorage` impl; swap to Supabase by replacing the implementation class

## Utility Scripts

```bash
bun scripts/seed-universities.ts   # Import university seed data
bun scripts/rescore-all.ts         # Re-score all candidates (university + AI)
bun scripts/score-pending.ts       # Score orphan candidates (Phase 1 done, Phase 2 missing)
bun scripts/download-resumes.ts    # Backfill: re-download email resume files via IMAP
```
