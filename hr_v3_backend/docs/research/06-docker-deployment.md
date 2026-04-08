# 06 — Docker 部署流程优化以及最佳实践

> 针对 HR 智能简历筛选系统后端（Elysia + Drizzle + PostgreSQL + MiniMax M2.5）的 Docker 容器化部署全面调研。

---

## 目录

1. [Docker 基础优化](#1-docker-基础优化)
2. [Dockerfile 最佳实践](#2-dockerfile-最佳实践)
3. [Docker Compose 编排](#3-docker-compose-编排)
4. [PostgreSQL 容器化](#4-postgresql-容器化)
5. [CI/CD 中的 Docker](#5-cicd-中的-docker)
6. [部署策略](#6-部署策略)
7. [监控和日志](#7-监控和日志)
8. [安全加固](#8-安全加固)
9. [开发体验优化](#9-开发体验优化)
10. [性能优化](#10-性能优化)
11. [实际部署方案](#11-实际部署方案)
12. [从零开始的实施路线图](#12-从零开始的实施路线图)

---

## 1. Docker 基础优化

### 1.1 基础镜像选型

| 镜像 | 大小 | 安全性 | 包管理器 | 适用场景 |
|------|------|--------|---------|---------|
| `oven/bun:1` | ~200MB | ⚠️ 攻击面大 | apt | 开发/调试 |
| `oven/bun:1-slim` | ~150MB | ✅ 较好 | apt（精简） | 通用生产 |
| `oven/bun:1-alpine` | ~100MB | ✅ 好 | apk | 体积敏感 |
| `oven/bun:1-distroless` | ~90MB | ✅✅ 极好 | 无 | 安全优先 |

**推荐 `oven/bun:1-alpine`**：体积小、安全性好。本项目使用的 `pdf-parse`、`mammoth`、`imapflow` 均为纯 JS 包，不依赖 native addon，与 Alpine 完全兼容。

> **Alpine 注意事项：** 若未来引入含 native 模块的依赖（如 `sharp`、`bcrypt`），需在 Dockerfile 中加装 `build-base python3` 或改用 `oven/bun:1`。

### 1.2 多阶段构建原理

```
Stage 1: deps      ─ 安装所有依赖（含 devDependencies）
Stage 2: build     ─ TypeScript 编译（bun build）
Stage 3: production─ 仅生产依赖 + src/ + drizzle/
```

多阶段构建的核心价值：
- **最终镜像不含** TypeScript 源码、devDependencies
- 每个 stage 有独立层缓存，依赖不变时跳过重装
- 生产镜像仅包含运行必需的文件

### 1.3 .dockerignore 配置

```dockerignore
# .dockerignore
node_modules
dist
.git
.gitignore
.env
.env.*
!.env.example
*.md
docs/
test/
coverage/
.claude/
.vscode/
.devcontainer/
drizzle/*.sql
*.log
.DS_Store
tmp/
```

**为什么重要：**
- 减小构建上下文（Docker CLI 发送给 daemon 的文件体积）
- 避免 `.env`（含 API Key）意外进入镜像
- 排除 `node_modules` 防止与容器内安装的依赖冲突

### 1.4 层缓存最大化

Docker 层缓存规则：**某一层变化时，它及后续所有层都会重建。** 因此应将变化频率低的操作放在前面。

```
# 最优顺序（变化频率 低→高）：
1. FROM oven/bun:1-alpine        ← 极少变
2. COPY package.json bun.lock    ← 偶尔变（加依赖时）
3. RUN bun install                ← 跟随 lockfile
4. COPY tsconfig.json            ← 极少变
5. COPY src/ drizzle/            ← 经常变
6. RUN bun build                  ← 跟随源码
```

---

## 2. Dockerfile 最佳实践

### 2.1 生产级 Dockerfile（完整版）

```dockerfile
# ── Stage 1: 安装依赖 ──────────────────────────────
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# 先复制依赖声明文件（利用层缓存，源码改动不会触发重装依赖）
COPY package.json bun.lock ./

# 安装所有依赖（含 devDependencies，编译 TypeScript 需要）
RUN bun install --frozen-lockfile

# ── Stage 2: TypeScript 编译 ──────────────────────
FROM deps AS build

WORKDIR /app

# 复制编译所需文件
COPY tsconfig.json ./
COPY src/ ./src/

# 编译 TypeScript → JavaScript（输出到 dist/）
RUN bun build ./src/index.ts --outdir ./dist --target bun

# ── Stage 3: 生产镜像 ─────────────────────────────
FROM oven/bun:1-alpine AS production

# 创建非 root 用户和组
RUN addgroup -g 1001 -S nodejs && \
    adduser -S hrapp -u 1001 -G nodejs

WORKDIR /app

# 仅复制生产依赖声明
COPY package.json bun.lock ./

# 仅安装生产依赖（不含 devDependencies）
RUN bun install --frozen-lockfile --production

# 从 build 阶段复制源码
COPY --from=build /app/src ./src

# 复制数据库迁移文件（部署时执行迁移需要）
COPY drizzle/ ./drizzle/

# 切换到非 root 用户
USER hrapp

# 暴露端口
EXPOSE 3001

# 健康检查（Alpine 自带 wget，无需安装 curl）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

# 运行时环境变量
ENV NODE_ENV=production \
    PORT=3001

# 启动
CMD ["bun", "src/index.ts"]
```

### 2.2 关键优化详解

#### 2.2.1 非 root 用户

```dockerfile
RUN addgroup -g 1001 -S nodejs && \
    adduser -S hrapp -u 1001 -G nodejs
USER hrapp
```

- `-S` 创建系统用户（无 home 目录、无登录 shell）
- 防止容器逃逸后攻击者获得 root 权限
- 指定固定 UID/GID（1001）确保宿主机文件权限可控

#### 2.2.2 健康检查

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
```

- `--start-period=10s`：启动宽限期，容器刚启动时允许失败
- `--retries=3`：连续 3 次失败后标记 unhealthy
- `wget -qO-`：Alpine 默认无 curl 但有 wget
- 使用项目已有的 `GET /health` 端点

#### 2.2.3 信号处理（Graceful Shutdown）

Docker `stop` 发送 SIGTERM，需要在应用中处理。在 `src/index.ts` 中添加：

```typescript
const server = Bun.serve({
  fetch: app.fetch,
  port,
});

// 优雅关闭：Docker stop 发送 SIGTERM
const shutdown = () => {
  console.log("Shutting down gracefully...");
  server.stop();
  console.log("Server closed.");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

Docker Compose 中配置停止超时：
```yaml
services:
  app:
    stop_grace_period: 15s
```

### 2.3 构建和验证

```bash
# 构建镜像
docker build -t hr-backend:latest .

# 验证镜像大小
docker images hr-backend
# 预期：~200-260MB

# 验证非 root 用户
docker run --rm hr-backend whoami
# 预期输出：hrapp

# 验证健康检查
docker run -d --name test hr-backend
docker inspect --format='{{.State.Health.Status}}' test
# 等待 30 秒后应为 healthy

# 清理
docker rm -f test
```

---

## 3. Docker Compose 编排

### 3.1 开发环境 Compose（主文件）

```yaml
# docker-compose.yml
services:
  # ── PostgreSQL 数据库 ──────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: hr-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      POSTGRES_DB: hr_screening
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d hr_screening"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped

  # ── pgAdmin 管理界面（可选）────────────────
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: hr-pgadmin
    profiles: ["debug"]  # 需显式启用：docker compose --profile debug up
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@ivis-sh.com
      PGADMIN_DEFAULT_PASSWORD: admin
      PGADMIN_LISTEN_PORT: 80
    ports:
      - "5050:80"
    depends_on:
      postgres:
        condition: service_healthy

  # ── HR Backend 应用 ────────────────────────
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: hr-backend
    ports:
      - "3001:3001"
    env_file:
      - .env.docker  # Docker 专用环境变量文件
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    stop_grace_period: 15s

volumes:
  pgdata:
    driver: local
```

### 3.2 Docker 专用 .env 文件

```bash
# .env.docker（gitignored）
DATABASE_URL=postgresql://postgres:your_password@postgres:5432/hr_screening
MINIMAX_API_KEY=sk-cp-your-key-here
IMAP_HOST=mail.ivis-sh.com
IMAP_PORT=143
IMAP_USER=hr@ivis-sh.com
IMAP_PASS=your-email-password
NODE_ENV=production
PORT=3001
```

> 注意：Compose 中数据库主机名用 `postgres`（service 名），不是 `localhost`。

### 3.3 开发 Override（热重载）

```yaml
# docker-compose.override.yml
# 开发环境自动加载（docker compose up 时）
services:
  app:
    build:
      target: deps  # 使用 deps 阶段，不做 build
    command: bun run --watch src/index.ts
    volumes:
      - ./src:/app/src             # 挂载源码实现热重载
      - ./drizzle:/app/drizzle     # 挂载迁移文件
      - ./tsconfig.json:/app/tsconfig.json:ro
    environment:
      NODE_ENV: development
    # 覆盖健康检查（开发环境不需要那么严格）
    healthcheck:
      disable: true
```

### 3.4 生产 Compose

```yaml
# docker-compose.prod.yml
services:
  app:
    image: hr-backend:latest  # 使用预构建镜像
    build: {}  # 覆盖开发的 build 配置
    deploy:
      replicas: 1  # HR 系统单副本足够
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
        reservations:
          memory: 256M
          cpus: "0.25"
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 5
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"

  postgres:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "2.0"
        reservations:
          memory: 512M
```

### 3.5 使用方式

```bash
# 开发环境（自动使用 override）
docker compose up -d

# 生产环境（跳过 override）
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 仅启动数据库（本地 bun dev 时用）
docker compose up -d postgres

# 启动含 pgAdmin
docker compose --profile debug up -d

# 查看日志
docker compose logs -f app

# 重建镜像
docker compose build --no-cache app

# 停止所有
docker compose down

# 停止并清除数据卷（⚠️ 慎用，删除数据库数据）
docker compose down -v
```

---

## 4. PostgreSQL 容器化

### 4.1 数据持久化

| 方式 | 优点 | 缺点 | 推荐场景 |
|------|------|------|---------|
| **Named Volume** | Docker 管理、性能好、可迁移 | 不直观 | 生产环境 |
| **Bind Mount** | 直接访问宿主机目录 | 权限问题 | 需要直接操作数据文件 |

```yaml
# Named Volume（推荐）
volumes:
  pgdata:
    driver: local
```

```bash
# 查看 volume 位置
docker volume inspect hr-backend_pgdata

# 备份 volume
docker run --rm -v hr-backend_pgdata:/data -v $(pwd):/backup alpine \
  tar czf /backup/pgdata-backup.tar.gz -C /data .
```

### 4.2 数据库初始化脚本

```sql
-- scripts/init-db.sql
-- Docker 首次创建数据库时自动执行
-- 后续重启不会重复执行（因为数据卷已存在）

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 启用 pgvector 扩展（为后续语义搜索准备）
-- 需要使用 pgvector/pgvector:pg16 镜像
-- CREATE EXTENSION IF NOT EXISTS vector;
```

### 4.3 备份策略

```bash
#!/bin/bash
# scripts/backup-db.sh
# Cron: 0 2 * * * /opt/hr-backend/scripts/backup-db.sh

set -euo pipefail

BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/hr_screening_$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# 通过 Docker 执行 pg_dump（自定义格式，支持并行恢复）
docker exec hr-postgres \
  pg_dump -U postgres -Fc hr_screening \
  | gzip > "$BACKUP_FILE"

# 保留最近 30 天的备份
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

echo "[$(date)] Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
```

```bash
# 恢复备份
gunzip < backup.sql.gz | docker exec -i hr-postgres \
  pg_restore -U postgres -d hr_screening --clean --if-exists
```

### 4.4 PostgreSQL 性能调优

```yaml
# docker-compose.yml
postgres:
  image: postgres:16-alpine
  command: >
    postgres
      -c shared_buffers=256MB
      -c work_mem=16MB
      -c maintenance_work_mem=128MB
      -c effective_cache_size=768MB
      -c max_connections=50
      -c random_page_cost=1.1
      -c log_min_duration_statement=500
      -c log_statement=none
      -c checkpoint_completion_target=0.9
```

| 参数 | 默认值 | 推荐值（4GB RAM 服务器） | 说明 |
|------|--------|--------------------------|------|
| `shared_buffers` | 128MB | 256MB（25% RAM） | PostgreSQL 共享缓存 |
| `work_mem` | 4MB | 16MB | 排序/哈希操作内存 |
| `effective_cache_size` | 4GB | 768MB（75% 可用） | 查询规划器参考值 |
| `max_connections` | 100 | 50 | HR 系统并发低 |
| `log_min_duration_statement` | -1（关） | 500（ms） | 记录慢查询（>500ms） |

### 4.5 pgvector 支持

如需后续语义搜索功能，替换 PostgreSQL 镜像：

```yaml
postgres:
  image: pgvector/pgvector:pg16  # 替代 postgres:16-alpine
```

---

## 5. CI/CD 中的 Docker

### 5.1 Gitea Actions 构建和推送

```yaml
# .gitea/workflows/docker-build.yml
name: Docker Build & Push

on:
  push:
    branches: [main]
    tags: ["v*"]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Gitea Container Registry
        uses: docker/login-action@v3
        with:
          registry: git.keiten-jp.com
          username: ${{ gitea.actor }}
          password: ${{ secrets.GITEA_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: git.keiten-jp.com/${{ gitea.repository }}/hr-backend
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=raw,value=latest,enable=${{ gitea.ref == 'refs/heads/main' }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64  # 根据服务器架构
```

### 5.2 镜像标签策略

| 标签 | 格式示例 | 触发条件 | 用途 |
|------|---------|---------|------|
| `latest` | `latest` | main 分支推送 | 最新稳定版 |
| Git SHA | `a1b2c3d` | 每次推送 | 精确版本追溯 |
| 语义版本 | `v1.2.3` | Git tag | 正式发布版 |
| 分支名 | `develop` | 非 main 分支 | 开发/测试版 |

### 5.3 镜像仓库选型

| 方案 | 费用 | 自托管 | 与 Gitea 集成 | 推荐 |
|------|------|--------|--------------|------|
| **Gitea Container Registry** | 免费 | ✅ 已有 | ✅ 原生 | ⭐ 首选 |
| Harbor | 免费 | ✅ 需部署 | 需配置 | 企业级备选 |
| Docker Hub | 免费（公开） | ❌ | 需配置 | 公开项目 |
| GHCR | 免费 | ❌ | ❌ | GitHub 项目 |

**推荐 Gitea Container Registry**：已有 Gitea 实例（`git.keiten-jp.com`），无需额外部署，原生支持。

### 5.4 多架构构建

```yaml
# 如需同时支持 ARM64（Mac M 系列）和 AMD64
- name: Set up QEMU
  uses: docker/setup-qemu-action@v3

- name: Build multi-arch
  uses: docker/build-push-action@v6
  with:
    platforms: linux/amd64,linux/arm64
```

---

## 6. 部署策略

### 6.1 方案对比

| 方案 | 复杂度 | 适用规模 | 零宕机 | 自动伸缩 | 运维成本 |
|------|--------|---------|--------|---------|---------|
| **单机 Compose** | ⭐ | < 1000 用户 | ❌ | ❌ | 低 |
| **Docker Swarm** | ⭐⭐ | 中小型 | ✅ | ✅ | 中 |
| **Kubernetes** | ⭐⭐⭐⭐ | 大型 | ✅ | ✅ | 高 |

**当前推荐：单机 Docker Compose + Nginx**
- HR 简历筛选系统并发量低（几十个 HR 同时使用）
- 一台 VPS 完全够用
- 运维简单，无需 K8s 知识

### 6.2 蓝绿部署（Compose 版）

```bash
#!/bin/bash
# scripts/deploy-blue-green.sh

set -euo pipefail

# 当前运行的版本
CURRENT=$(docker compose ps --format '{{.Name}}' | grep -E "blue|green" | head -1 || echo "")

if echo "$CURRENT" | grep -q "blue"; then
  NEW="green"; OLD="blue"
else
  NEW="blue"; OLD="green"
fi

echo "=== Deploying $NEW (current: ${OLD:-none}) ==="

# 拉取最新镜像
docker compose pull app

# 启动新版本（使用环境专属的 Compose 文件）
APP_COLOR=$NEW docker compose up -d app

# 等待健康检查
echo "Waiting for health check..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ $NEW is healthy!"
    break
  fi
  [ $i -eq 30 ] && { echo "❌ Health check failed!"; exit 1; }
  sleep 2
done

# Reload nginx 指向新版本
sudo nginx -s reload

echo "=== $NEW is live ==="
```

### 6.3 滚动更新

```bash
# Docker Compose 默认行为：停止旧容器 → 启动新容器
docker compose up -d --force-recreate app

# 有短暂不可用（几秒）
# 对于 HR 系统可接受
```

### 6.4 回滚

```bash
#!/bin/bash
# scripts/rollback.sh
# 使用方式: ./rollback.sh [image-tag]

TAG=${1:-$(docker inspect hr-backend --format '{{.Config.Image}}' | sed 's/.*://')}
echo "Rolling back to: hr-backend:$TAG"

docker compose down app
docker compose up -d app  # 使用之前的镜像
```

### 6.5 数据库迁移在部署流程中的位置

```
1. 拉取新镜像
2. ⬇️ 数据库备份（安全网）
3. ⬇️ 运行迁移（一次性容器）
4. ⬇️ 启动新版本容器
5. ⬇️ 健康检查
6. ⬇️ 切换流量
7. 清理旧容器
```

```bash
# 迁移使用一次性容器执行（--rm 运行后自动删除）
docker compose run --rm app bun src/db/migrate.ts
```

**迁移安全原则：**
- 迁移必须**向前兼容**（不删列、不改列类型）
- 先加新列 → 部署新代码 → 下个版本删旧列
- 生产迁移前先在 staging 验证

---

## 7. 监控和日志

### 7.1 容器日志管理

```yaml
# docker-compose.yml
services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "10m"     # 单个日志文件最大 10MB
        max-file: "5"       # 最多保留 5 个轮转文件
        tag: "hr-backend"   # 日志标签
```

```bash
# 实时查看日志
docker compose logs -f app

# 最近 1 小时日志
docker compose logs --since 1h app

# 最后 100 行
docker compose logs --tail 100 app

# 同时查看多个服务
docker compose logs -f app postgres
```

### 7.2 结构化日志

在应用中使用 JSON 日志格式，便于日志分析工具解析：

```typescript
// src/lib/logger.ts
export function log(level: string, message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  }));
}
```

### 7.3 Loki + Grafana（可选进阶方案）

```yaml
# docker-compose.monitoring.yml
services:
  loki:
    image: grafana/loki:latest
    container_name: hr-loki
    ports:
      - "3100:3100"
    volumes:
      - loki_data:/loki

  grafana:
    image: grafana/grafana:latest
    container_name: hr-grafana
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana_data:/var/lib/grafana
    depends_on:
      - loki

  # 日志采集器
  promtail:
    image: grafana/promtail:latest
    volumes:
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - ./monitoring/promtail.yml:/etc/promtail/config.yml:ro
    depends_on:
      - loki

volumes:
  loki_data:
  grafana_data:
```

### 7.4 健康检查与自动重启

```yaml
services:
  app:
    restart: unless-stopped  # 崩溃自动重启（手动 stop 后不重启）
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/health"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
```

Docker 自动重启策略：

| 策略 | 行为 |
|------|------|
| `no` | 不自动重启（默认） |
| `always` | 总是重启（包括手动 stop 后 daemon 重启时） |
| `unless-stopped` | 崩溃重启，手动 stop 后不重启 |
| `on-failure[:max]` | 仅非零退出码时重启，可限制次数 |

### 7.5 资源限制

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 512M    # 最大内存
          cpus: "1.0"     # 最大 CPU
        reservations:
          memory: 256M    # 保证内存
          cpus: "0.25"    # 保证 CPU

  postgres:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "2.0"
        reservations:
          memory: 512M
```

---

## 8. 安全加固

### 8.1 镜像安全扫描

```bash
# Trivy 扫描（推荐）
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image hr-backend:latest

# 仅报告高危和严重漏洞
trivy image --severity HIGH,CRITICAL hr-backend:latest

# CI 中扫描（发现高危漏洞时构建失败）
trivy image --exit-code 1 --severity HIGH,CRITICAL hr-backend:latest
```

### 8.2 安全清单

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 非 root 运行 | ✅ | `USER hrapp` |
| 最小基础镜像 | ✅ | Alpine |
| 固定镜像版本 | ✅ | `oven/bun:1-alpine` 非 `latest` |
| 无 .env 进入镜像 | ✅ | `.dockerignore` 排除 |
| 健康检查 | ✅ | `HEALTHCHECK` 指令 |
| 资源限制 | ✅ | `deploy.resources.limits` |
| 镜像扫描 | ⬜ | CI 中配置 Trivy |
| 网络隔离 | ⬜ | 内部网络 `internal: true` |

### 8.3 Secret 管理

| 方案 | 复杂度 | 安全性 | 适用场景 |
|------|--------|--------|---------|
| `.env` 文件 | 低 | ⚠️ 中 | 当前阶段 |
| `docker secret` | 中 | ✅ 好 | Docker Swarm |
| HashiCorp Vault | 高 | ✅✅ 最好 | 企业级 |
| 云 KMS | 中 | ✅ 好 | 云部署 |

**当前推荐：`.env.docker` 文件**（gitignored），后续迁移到 Docker Secrets。

### 8.4 网络隔离

```yaml
services:
  app:
    networks:
      - frontend    # 对外：接收 Nginx 转发的请求
      - backend     # 对内：连接 PostgreSQL

  postgres:
    networks:
      - backend     # 仅内部，外部不可直接访问
    # 注意：去掉 ports 暴露，仅内部网络可访问

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # 隔离，无法访问外网
```

---

## 9. 开发体验优化

### 9.1 推荐开发模式：混合

```
┌──────────────────────────────────────────┐
│ 宿主机（本地开发）                          │
│                                          │
│  bun dev  ←──→  localhost:3001          │
│                                          │
│  连接 Docker 中的 PostgreSQL:              │
│  DATABASE_URL=...@localhost:5432/...      │
└────────────────┬─────────────────────────┘
                 │
┌────────────────▼─────────────────────────┐
│ Docker Compose                           │
│                                          │
│  postgres:5432  ←  数据持久化到 volume     │
│  pgadmin:5050   ←  可选的数据库管理界面     │
└──────────────────────────────────────────┘
```

```bash
# 仅启动数据库
docker compose up -d postgres

# 本地开发（热重载更快，无 volume 延迟）
bun dev
```

### 9.2 VS Code Dev Containers

```json
// .devcontainer/devcontainer.json
{
  "name": "HR Backend Dev",
  "dockerComposeFile": ["../docker-compose.yml"],
  "service": "app",
  "workspaceFolder": "/app",
  "features": {
    "ghcr.io/devcontainers/features/git:1": {}
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "biomejs.biome",
        "bradlc.vscode-tailwindcss"
      ]
    }
  },
  "postCreateCommand": "bun install"
}
```

### 9.3 Testcontainers 集成测试

```typescript
// test/helpers/db-container.ts
import { PostgreSqlContainer } from "@testcontainers/postgresql";

export async function startTestDb() {
  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("hr_test")
    .start();

  return {
    url: container.getConnectionUri(),
    stop: () => container.stop(),
  };
}
```

---

## 10. 性能优化

### 10.1 Bun 容器内存

```dockerfile
# 容器限制 512MB 时，Bun 的 JSC 堆设为 75%
ENV BUN_JSC_forceRAMSize=402653184
```

| 容器限制 | `BUN_JSC_forceRAMSize` |
|---------|------------------------|
| 256MB | 201326592 |
| 512MB | 402653184 |
| 1GB | 805306368 |
| 2GB | 1610612736 |

### 10.2 线程池

```dockerfile
# Bun 使用自身的 I/O 调度器，对于兼容的 Node.js API 仍支持此设置
# 本项目有 IMAP + 文件解析，适当增大
ENV UV_THREADPOOL_SIZE=8
```

### 10.3 数据库连接池

```typescript
// src/db/index.ts
const client = postgres(env.DATABASE_URL, {
  max: 10,             // 容器环境不需要太多连接
  idle_timeout: 20,    // 20 秒空闲回收
  connect_timeout: 10, // 10 秒连接超时
});
```

### 10.4 生产依赖精简

```dockerfile
# 在 production 阶段仅安装生产依赖：
RUN bun install --frozen-lockfile --production
```

`bun install --production` 只会安装 `dependencies`，跳过 `devDependencies`，生成最小的 `node_modules`。

### 10.5 最终镜像大小分析

```bash
# 使用 dive 分析镜像层
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  wagoodman/dive hr-backend:latest
```

预期目标：

| 组成部分 | 大小 |
|---------|------|
| Alpine 基础 | ~5MB |
| Bun 运行时 | ~90MB |
| node_modules (prod) | ~30-50MB |
| src/ (TypeScript 源码) | ~100KB |
| drizzle/ (迁移) | ~10KB |
| **总计** | **~130-150MB** |

---

## 11. 实际部署方案

### 11.1 单服务器架构

```
Internet
  │
  ▼
┌─────────────────────────┐
│ Nginx (宿主机)           │
│ :80 → redirect :443     │
│ :443 → proxy :3001      │
│ SSL: Let's Encrypt      │
└─────────┬───────────────┘
          │
┌─────────▼───────────────┐
│ Docker Compose           │
│                          │
│  hr-backend:3001         │
│  postgres:5432           │
└──────────────────────────┘
```

### 11.2 Nginx 反向代理配置

```nginx
# /etc/nginx/sites-available/hr-backend
server {
    listen 80;
    server_name hr-api.ivis-sh.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name hr-api.ivis-sh.com;

    # SSL（Let's Encrypt）
    ssl_certificate /etc/letsencrypt/live/hr-api.ivis-sh.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hr-api.ivis-sh.com/privkey.pem;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # 安全头
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # 上传限制（简历文件，最大 20MB）
    client_max_body_size 20M;

    # 代理到 Docker 容器
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # AI 评分可能耗时较长
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # 健康检查不写日志
    location /health {
        proxy_pass http://127.0.0.1:3001;
        access_log off;
    }
}
```

### 11.3 SSL 证书

```bash
# 安装 certbot
apt install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d hr-api.ivis-sh.com

# 验证自动续期
certbot renew --dry-run
```

### 11.4 systemd 管理

```ini
# /etc/systemd/system/hr-backend.service
[Unit]
Description=HR Backend Docker Compose
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/hr-backend
ExecStart=/usr/bin/docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose up -d --force-recreate app
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable hr-backend
systemctl start hr-backend
systemctl status hr-backend
systemctl reload hr-backend   # 重启应用容器
```

### 11.5 完整部署脚本

```bash
#!/bin/bash
# scripts/deploy.sh
set -euo pipefail

DEPLOY_DIR="/opt/hr-backend"
cd "$DEPLOY_DIR"

echo "=== $(date) Starting deployment ==="

# 1. 拉取最新代码
echo "[1/6] Pulling latest code..."
git pull origin main

# 2. 构建镜像
echo "[2/6] Building Docker image..."
docker compose build app

# 3. 备份数据库
echo "[3/6] Backing up database..."
./scripts/backup-db.sh

# 4. 运行迁移
echo "[4/6] Running migrations..."
docker compose run --rm app bun src/db/migrate.ts

# 5. 重启应用
echo "[5/6] Restarting application..."
docker compose up -d app

# 6. 验证健康
echo "[6/6] Health check..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health > /dev/null; then
    echo "✅ Deployment successful!"
    docker image prune -f  # 清理旧镜像
    exit 0
  fi
  [ $i -eq 30 ] && {
    echo "❌ Health check failed! Check logs:"
    docker compose logs --tail 30 app
    exit 1
  }
  sleep 2
done
```

### 11.6 监控脚本

```bash
#!/bin/bash
# scripts/monitor.sh
# Cron: */5 * * * * /opt/hr-backend/scripts/monitor.sh >> /var/log/hr-monitor.log 2>&1

HEALTH_URL="http://localhost:3001/health"
WEBHOOK="${DINGTALK_WEBHOOK:-}"

HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
  echo "[$(date)] ⚠️ Health check failed: HTTP $HTTP_CODE"

  # 尝试自动重启
  cd /opt/hr-backend
  docker compose restart app

  # 发送告警
  if [ -n "$WEBHOOK" ]; then
    curl -s -X POST "$WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "{
        \"msgtype\": \"markdown\",
        \"markdown\": {
          \"title\": \"HR Backend 异常\",
          \"text\": \"### HR Backend 服务异常\\n- HTTP: $HTTP_CODE\\n- 时间: $(date)\\n- 操作: 已自动重启\"
        }
      }"
  fi
fi
```

---

## 12. 从零开始的实施路线图

### Phase 1：基础容器化（1-2 天）

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 创建 `.dockerignore` | P0 | 排除敏感文件和无用文件 |
| 编写 `Dockerfile`（多阶段） | P0 | 本文档 2.1 节的完整版 |
| 创建 `docker-compose.yml` | P0 | app + postgres |
| 验证 `docker build` + 运行 | P0 | 健康检查通过 |
| 添加 graceful shutdown | P1 | 信号处理 |

### Phase 2：开发环境（第 3 天）

| 任务 | 优先级 |
|------|--------|
| 创建 `docker-compose.override.yml` | P1 |
| 测试热重载开发流程 | P1 |
| 创建 `.env.docker` 模板 | P1 |

### Phase 3：生产部署（第 4-5 天）

| 任务 | 优先级 |
|------|--------|
| Nginx 反向代理配置 | P0 |
| SSL 证书配置 | P0 |
| systemd service | P1 |
| 部署脚本 | P1 |
| 备份脚本 | P1 |

### Phase 4：CI/CD 集成（第 6 天）

| 任务 | 优先级 |
|------|--------|
| Gitea Actions 构建镜像 | P2 |
| 推送到 Container Registry | P2 |
| 自动部署触发 | P2 |

### Phase 5：监控和安全（后续迭代）

| 任务 | 优先级 |
|------|--------|
| 监控脚本 + cron | P2 |
| Trivy 镜像扫描 | P3 |
| 网络隔离 | P3 |
| Prometheus + Grafana | P3 |
| 告警通知（钉钉） | P3 |

### 总体时间估算

| 阶段 | 工作量 | 累计 |
|------|--------|------|
| Phase 1 | 1-2 天 | 2 天 |
| Phase 2 | 0.5 天 | 2.5 天 |
| Phase 3 | 1-2 天 | 4.5 天 |
| Phase 4 | 1 天 | 5.5 天 |
| Phase 5 | 持续 | — |

---

## 附录：快速启动清单

```bash
# 1. 创建必要文件
touch .dockerignore Dockerfile docker-compose.yml .env.docker

# 2. 构建并启动
docker compose up -d

# 3. 验证
curl http://localhost:3001/health

# 4. 查看日志
docker compose logs -f app

# 5. 停止
docker compose down
```

---

## 附录 B：Docker 常见问题排查

### B.1 容器启动失败

```bash
# 查看退出码
docker compose ps -a
# Exit 0  = 正常退出（检查 CMD 是否正确）
# Exit 1  = 应用错误（查看日志）
# Exit 137 = OOM Killed（增加内存限制）
# Exit 139 = Segfault（检查 native 模块）

# 查看详细日志
docker compose logs --tail 50 app

# 进入容器调试（如果容器能启动）
docker compose exec app sh

# 临时启动一个调试容器（如果容器无法启动）
docker compose run --rm --entrypoint sh app
```

### B.2 数据库连接问题

```bash
# 检查 postgres 容器是否 healthy
docker compose ps postgres

# 从 app 容器内测试连接
docker compose exec app sh -c \
  "wget -qO- postgres:5432 || echo 'Port reachable'"

# 常见原因：
# 1. app 比 postgres 先启动 → 用 depends_on + healthcheck
# 2. DATABASE_URL 中主机名写了 localhost → 改为 postgres（service 名）
# 3. postgres 密码含特殊字符 → URL 编码
```

### B.3 镜像构建失败

```bash
# 查看构建详情（不使用缓存）
docker compose build --no-cache --progress=plain app

# bun install 失败 → 检查 bun.lock 是否最新
bun install   # 本地先运行一次更新 lockfile

# TypeScript 编译失败 → 本地先验证
bun run typecheck
```

### B.4 磁盘空间不足

```bash
# 查看 Docker 磁盘使用
docker system df

# 清理（安全，只删除未使用的资源）
docker system prune

# 深度清理（包括未使用的镜像和 volume）
docker system prune -a --volumes
# ⚠️ 这会删除数据库 volume，先备份！

# 只清理旧镜像
docker image prune -a --filter "until=168h"  # 7天前的
```

### B.5 性能问题

```bash
# 查看容器资源使用
docker stats

# 查看特定容器
docker stats hr-backend hr-postgres

# 输出示例：
# NAME          CPU%   MEM USAGE / LIMIT   MEM%   NET I/O
# hr-backend    0.5%   120MiB / 512MiB     23%    5.2kB / 3.1kB
# hr-postgres   1.2%   45MiB / 1GiB        4.4%   12kB / 8.5kB
```

---

## 附录 C：Docker 与当前项目依赖兼容性

### C.1 依赖 Native 模块检查

```bash
# 检查是否有 native 依赖（需要编译的 C/C++ 模块）
bun pm ls | grep -i native
# 或查看 node_modules 中是否有 .node 文件
find node_modules -name "*.node" 2>/dev/null
```

本项目当前所有依赖均为纯 JavaScript：

| 依赖 | 类型 | Alpine 兼容 |
|------|------|-------------|
| elysia | 纯 JS | ✅ |
| drizzle-orm | 纯 JS | ✅ |
| postgres (postgres.js) | 纯 JS | ✅ |
| ai (Vercel AI SDK) | 纯 JS | ✅ |
| @ai-sdk/openai | 纯 JS | ✅ |
| imapflow | 纯 JS | ✅ |
| pdf-parse v2 | 纯 JS | ✅ |
| mammoth | 纯 JS | ✅ |
| zod | 纯 JS | ✅ |
| nodemailer | 纯 JS | ✅ |

结论：**Alpine 镜像完全适用**，无需安装额外的编译工具。

### C.2 未来可能引入的 native 依赖

| 依赖 | 用途 | 需要 |
|------|------|------|
| `sharp` | 图片处理 | `build-base vips-dev` |
| `bcrypt` | 密码哈希 | `build-base python3` |
| `canvas` | 图形渲染 | `build-base cairo-dev` |
| `better-sqlite3` | SQLite | `build-base python3` |

如果未来引入这些依赖，需要在 deps 阶段加装编译工具：

```dockerfile
FROM oven/bun:1-alpine AS deps
RUN apk add --no-cache build-base python3
```

---

## 附录 D：多环境 .env 文件管理

```
.env.example        ← Git 提交（模板，无敏感值）
.env                ← 本地开发（gitignored）
.env.docker         ← Docker 开发（gitignored）
.env.staging        ← Staging 部署（gitignored，或存于服务器）
.env.production     ← 生产部署（gitignored，仅存于生产服务器）
```

```bash
# .env.example（提交到 Git）
DATABASE_URL=postgresql://postgres:password@localhost:5432/hr_screening
MINIMAX_API_KEY=your-minimax-api-key
IMAP_HOST=mail.ivis-sh.com
IMAP_PORT=143
IMAP_USER=hr@ivis-sh.com
IMAP_PASS=your-email-password

# .env.docker（Docker Compose 用，主机名为 service 名）
DATABASE_URL=postgresql://postgres:real_password@postgres:5432/hr_screening
MINIMAX_API_KEY=sk-cp-real-key
IMAP_HOST=mail.ivis-sh.com
IMAP_PORT=143
IMAP_USER=hr@ivis-sh.com
IMAP_PASS=real_password
```

---

## 附录 E：Docker Compose 命令速查

```bash
# 生命周期
docker compose up -d                 # 启动（后台）
docker compose down                  # 停止并删除容器
docker compose restart app           # 重启单个服务
docker compose stop                  # 停止（保留容器）
docker compose start                 # 启动已停止的容器

# 构建
docker compose build                 # 构建所有
docker compose build app             # 构建单个
docker compose build --no-cache      # 不使用缓存

# 日志
docker compose logs -f               # 实时日志（所有服务）
docker compose logs -f app           # 单服务日志
docker compose logs --since 30m      # 最近 30 分钟
docker compose logs --tail 100       # 最后 100 行

# 状态
docker compose ps                    # 运行状态
docker compose ps -a                 # 包括已停止的
docker compose top                   # 容器内进程

# 调试
docker compose exec app sh           # 进入运行中的容器
docker compose run --rm app sh       # 启动临时容器
docker compose run --rm app bun db:migrate  # 执行一次性命令

# 清理
docker compose down -v               # 停止 + 删除 volume（⚠️ 数据丢失）
docker compose down --rmi all        # 停止 + 删除镜像
```

---

## 附录 F：Docker BuildKit 高级优化

### F.1 启用 BuildKit

```bash
# 方法 1：环境变量
export DOCKER_BUILDKIT=1
docker build .

# 方法 2：Docker daemon 配置（永久）
# /etc/docker/daemon.json
{
  "features": {
    "buildkit": true
  }
}

# 方法 3：docker buildx（推荐）
docker buildx create --name hr-builder --use
docker buildx build --load -t hr-backend:latest .
```

### F.2 BuildKit 缓存挂载（Cache Mount）

利用 `--mount=type=cache` 在构建之间共享包管理器缓存：

```dockerfile
# ===== 优化 Dockerfile（带 BuildKit 缓存挂载）=====
# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./

# bun cache 缓存挂载 — 跨构建共享
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json ./
COPY src/ ./src/

# TypeScript 编译
RUN bun build ./src/index.ts --outdir ./dist --target bun

FROM oven/bun:1-alpine AS production
RUN addgroup -g 1001 -S nodejs && adduser -S hrapp -u 1001 -G nodejs
WORKDIR /app

COPY --from=build /app/src ./src
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

USER hrapp
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["bun", "src/index.ts"]
```

### F.3 缓存挂载 vs 传统层缓存对比

| 特性 | 传统层缓存 | BuildKit 缓存挂载 |
|------|-----------|-------------------|
| **缓存位置** | Docker 镜像层 | 独立缓存存储 |
| **锁文件变更时** | 完全重下载 | 增量更新（差异） |
| **缓存大小** | 包含在镜像层 | 不增加镜像体积 |
| **首次构建** | 快 | 略慢（挂载开销） |
| **后续构建** | 快（层命中）/慢（层失效） | 一直快 |
| **CI 环境** | 需 layer cache export | 需 cache export |
| **推荐场景** | 简单项目 | 依赖频繁变更的项目 |

### F.4 多平台构建（ARM64 + AMD64）

```bash
# 创建多平台 builder
docker buildx create --name multiarch --platform linux/amd64,linux/arm64 --use

# 构建多平台镜像并推送
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t registry.keiten-jp.com/hr-backend:latest \
  --push .

# 仅构建 ARM64（如部署到 M1/M2 Mac 或 ARM 服务器）
docker buildx build \
  --platform linux/arm64 \
  --load \
  -t hr-backend:arm64 .
```

### F.5 BuildKit Secret 安全传递

```dockerfile
# Dockerfile 中使用 secret（如私有 npm registry）
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    bun install --frozen-lockfile

# 构建时传入 secret
docker build --secret id=npmrc,src=$HOME/.npmrc .
```

**优势**：Secret 不会留在镜像层中，比 `ARG`/`ENV` 安全。

---

## 附录 G：Docker 安全加固最佳实践

### G.1 镜像安全扫描

```bash
# 方法 1：Docker Scout（Docker Desktop 内置）
docker scout cves hr-backend:latest
docker scout recommendations hr-backend:latest

# 方法 2：Trivy（开源，推荐用于 CI）
# 安装
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh

# 扫描镜像
trivy image hr-backend:latest

# 仅显示高危/严重漏洞
trivy image --severity HIGH,CRITICAL hr-backend:latest

# CI 中集成（发现高危漏洞时失败）
trivy image --exit-code 1 --severity HIGH,CRITICAL hr-backend:latest

# 方法 3：Grype（Anchore 开源）
grype hr-backend:latest
```

### G.2 Gitea Actions 集成 Trivy

```yaml
# .gitea/workflows/security-scan.yml
name: Security Scan
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # 每周一扫描

jobs:
  trivy-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t hr-backend:scan .

      - name: Run Trivy scan
        run: |
          docker run --rm \
            -v /var/run/docker.sock:/var/run/docker.sock \
            -v trivy-cache:/root/.cache/trivy \
            aquasec/trivy:latest image \
            --exit-code 1 \
            --severity HIGH,CRITICAL \
            --format table \
            hr-backend:scan

      - name: Generate SBOM
        if: always()
        run: |
          docker run --rm \
            -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy:latest image \
            --format spdx-json \
            --output sbom.json \
            hr-backend:scan
```

### G.3 容器运行时安全

```yaml
# docker-compose.prod.yml — 安全加固版
services:
  app:
    image: hr-backend:latest
    security_opt:
      - no-new-privileges:true    # 禁止权限提升
    read_only: true                # 只读文件系统
    tmpfs:
      - /tmp:noexec,nosuid,size=64m  # 临时目录（不可执行）
    cap_drop:
      - ALL                        # 丢弃所有 Linux capabilities
    cap_add:
      - NET_BIND_SERVICE           # 仅保留网络绑定
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 128M
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
      nproc:
        soft: 4096
        hard: 4096

  postgres:
    image: pgvector/pgvector:pg17
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=128m
      - /run/postgresql:noexec,nosuid,size=16m
    volumes:
      - pg_data:/var/lib/postgresql/data  # 数据目录可写
    cap_drop:
      - ALL
    cap_add:
      - DAC_OVERRIDE
      - FOWNER
      - SETGID
      - SETUID
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
```

### G.4 Docker Content Trust（镜像签名）

```bash
# 启用 DCT
export DOCKER_CONTENT_TRUST=1

# 推送签名镜像
docker push registry.keiten-jp.com/hr-backend:latest

# 验证签名
docker trust inspect registry.keiten-jp.com/hr-backend:latest

# CI 中强制签名验证
export DOCKER_CONTENT_TRUST=1
export DOCKER_CONTENT_TRUST_SERVER=https://notary.keiten-jp.com
docker pull registry.keiten-jp.com/hr-backend:latest
```

### G.5 镜像最小化检查清单

```
✅ 使用 Alpine 基础镜像（~50MB vs ~1GB Debian）
✅ 多阶段构建（最终镜像不含编译工具）
✅ 非 root 用户运行（USER hrapp）
✅ 无 shell 访问（可选：使用 distroless）
✅ 最小 capabilities（cap_drop ALL + 按需 cap_add）
✅ 只读文件系统（read_only: true）
✅ 资源限制（memory + cpu）
✅ 健康检查（HEALTHCHECK）
✅ 无 .env 文件在镜像中
✅ .dockerignore 排除敏感文件
✅ 固定基础镜像版本（oven/bun:1-alpine，非 latest）
```

---

## 附录 H：容器编排进阶 — Docker Swarm vs Kubernetes 对比

### H.1 适用场景分析

| 维度 | Docker Compose | Docker Swarm | Kubernetes |
|------|---------------|-------------|------------|
| **复杂度** | ★☆☆ | ★★☆ | ★★★★★ |
| **学习曲线** | 低 | 中 | 高 |
| **适合规模** | 单机开发/小型生产 | 3~10 节点 | 10~10000 节点 |
| **高可用** | ❌ | ✅ | ✅✅ |
| **自动扩缩** | ❌ | 手动 | ✅ HPA/VPA |
| **滚动更新** | ❌ | ✅ | ✅ |
| **服务发现** | docker-compose 网络 | 内置 DNS | CoreDNS + Service |
| **Secret 管理** | .env 文件 | Docker Secret | K8s Secret + Vault |
| **监控** | 外部工具 | 基础 | Prometheus 生态 |
| **CI/CD 集成** | 简单 | 中等 | ArgoCD/Flux |
| **本项目推荐** | ✅ 开发+MVP | ✅ 小团队生产 | ⚠️ 规模增长后 |

### H.2 Docker Swarm 最小部署（推荐的下一步）

```bash
# 初始化 Swarm（在主节点上）
docker swarm init --advertise-addr 192.168.1.100

# 在工作节点上加入
docker swarm join --token SWMTKN-xxx 192.168.1.100:2377

# 查看节点
docker node ls
```

```yaml
# docker-stack.yml（Swarm 专用）
version: "3.8"

services:
  app:
    image: registry.keiten-jp.com/hr-backend:latest
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        order: start-first       # 先启动新容器再关旧的
      rollback_config:
        parallelism: 0           # 回滚时全部同时
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
    ports:
      - "3001:3001"
    networks:
      - hr-net
    secrets:
      - db_url
      - minimax_key
    environment:
      DATABASE_URL_FILE: /run/secrets/db_url
      MINIMAX_API_KEY_FILE: /run/secrets/minimax_key

  postgres:
    image: pgvector/pgvector:pg17
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager     # DB 固定在管理节点
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - hr-net
    secrets:
      - postgres_password

  nginx:
    image: nginx:alpine
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 5s
    ports:
      - "80:80"
      - "443:443"
    networks:
      - hr-net

secrets:
  db_url:
    external: true
  minimax_key:
    external: true
  postgres_password:
    external: true

volumes:
  pg_data:

networks:
  hr-net:
    driver: overlay
    attachable: true
```

```bash
# 创建 secrets
echo "postgresql://postgres:xxx@postgres:5432/hr_screening" | \
  docker secret create db_url -

echo "sk-cp-xxx" | docker secret create minimax_key -

echo "postgres_password" | docker secret create postgres_password -

# 部署 stack
docker stack deploy -c docker-stack.yml hr

# 查看状态
docker stack services hr
docker service logs hr_app

# 扩容
docker service scale hr_app=4

# 更新镜像（触发滚动更新）
docker service update --image hr-backend:v2 hr_app

# 回滚
docker service rollback hr_app
```

### H.3 从 Docker Compose 迁移到 Swarm 的检查清单

```
1. 确认所有镜像都推送到 registry（Swarm 需要从 registry 拉取）
2. 将 .env 变量迁移到 Docker Secret
3. 修改代码支持 _FILE 后缀环境变量（读取 secret 文件）
4. 将 build: 替换为 image:（Swarm 不支持本地构建）
5. 将 depends_on 替换为健康检查 + 重试逻辑
6. 添加 deploy: 配置（replicas, update_config, resources）
7. 将 bridge 网络替换为 overlay 网络
8. 测试 docker stack deploy
```

### H.4 读取 Docker Secret 文件的代码适配

```typescript
// src/lib/docker-secrets.ts
import { readFileSync, existsSync } from "node:fs";

/**
 * 读取环境变量，优先从 _FILE 后缀指向的文件读取（Docker Secret）
 * 例如：DATABASE_URL_FILE=/run/secrets/db_url → 读取文件内容
 */
export function getEnvOrSecret(key: string): string | undefined {
  const fileKey = `${key}_FILE`;
  const filePath = process.env[fileKey];

  if (filePath && existsSync(filePath)) {
    return readFileSync(filePath, "utf-8").trim();
  }

  return process.env[key];
}

// src/env.ts 中使用
import { getEnvOrSecret } from "./lib/docker-secrets.js";

// 在 Zod 验证之前预处理
const envOverrides: Record<string, string> = {};
for (const key of ["DATABASE_URL", "MINIMAX_API_KEY", "IMAP_PASS", "SMTP_PASS"]) {
  const val = getEnvOrSecret(key);
  if (val) envOverrides[key] = val;
}
Object.assign(process.env, envOverrides);
```

---

## 附录 I：Docker 日志管理与监控

### I.1 日志驱动配置

```yaml
# docker-compose.prod.yml
services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "10m"        # 单个日志文件最大 10MB
        max-file: "5"          # 最多保留 5 个文件
        compress: "true"       # 旧文件 gzip 压缩
        labels: "service"
        tag: "hr-backend/{{.Name}}"

  postgres:
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"
```

### I.2 结构化日志（JSON 格式）

```typescript
// src/lib/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL || "info") as LogLevel;

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[currentLevel]) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: "hr-backend",
    ...meta,
  };

  const output = JSON.stringify(entry);

  if (level === "error") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
```

### I.3 Elysia 请求日志中间件

```typescript
// src/middleware/request-logger.ts
import type { MiddlewareHandler } from "elysia";
import { logger } from "../lib/logger.js";

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);

  logger.info("request_start", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
  });

  await next();

  const duration = Date.now() - start;

  logger.info("request_end", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
  });

  // 慢请求告警
  if (duration > 5000) {
    logger.warn("slow_request", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      duration,
    });
  }
};
```

### I.4 Prometheus 指标（可选）

```typescript
// src/lib/metrics.ts
// 简易 Prometheus 格式指标收集（无外部依赖）

interface Metric {
  name: string;
  help: string;
  type: "counter" | "gauge" | "histogram";
  labels: Record<string, Record<string, number>>; // label_key -> { value -> count }
}

class SimpleMetrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  inc(name: string, labels?: Record<string, string>, value = 1) {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  set(name: string, value: number, labels?: Record<string, string>) {
    const key = this.key(name, labels);
    this.gauges.set(key, value);
  }

  observe(name: string, value: number, labels?: Record<string, string>) {
    const key = this.key(name, labels);
    const arr = this.histograms.get(key) || [];
    arr.push(value);
    this.histograms.set(key, arr);
  }

  /** /metrics 输出（Prometheus text format） */
  format(): string {
    const lines: string[] = [];

    for (const [key, val] of this.counters) {
      lines.push(`# TYPE ${key.split("{")[0]} counter`);
      lines.push(`${key} ${val}`);
    }

    for (const [key, val] of this.gauges) {
      lines.push(`# TYPE ${key.split("{")[0]} gauge`);
      lines.push(`${key} ${val}`);
    }

    for (const [key, values] of this.histograms) {
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;
      lines.push(`# TYPE ${key.split("{")[0]} summary`);
      lines.push(`${key}_sum ${sum}`);
      lines.push(`${key}_count ${count}`);
    }

    return lines.join("\n") + "\n";
  }

  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${labelStr}}`;
  }
}

export const metrics = new SimpleMetrics();

// 使用示例：
// metrics.inc("http_requests_total", { method: "GET", path: "/api/candidates", status: "200" });
// metrics.observe("http_request_duration_seconds", 0.15, { method: "GET" });
// metrics.set("active_connections", 42);
```

### I.5 Prometheus + Grafana Docker Compose（可选监控栈）

```yaml
# docker-compose.monitoring.yml
# 与主 compose 文件一起使用：docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    networks:
      - hr-net
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3000:3000"
    networks:
      - hr-net
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_USERS_ALLOW_SIGN_UP: "false"

  node-exporter:
    image: prom/node-exporter:latest
    ports:
      - "9100:9100"
    networks:
      - hr-net
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'

volumes:
  prometheus_data:
  grafana_data:
```

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'hr-backend'
    static_configs:
      - targets: ['app:3001']
    metrics_path: /metrics
    scrape_interval: 10s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
```

### I.6 PostgreSQL 监控

```yaml
# docker-compose.monitoring.yml 中追加
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    environment:
      DATA_SOURCE_NAME: "postgresql://postgres:password@postgres:5432/hr_screening?sslmode=disable"
    ports:
      - "9187:9187"
    networks:
      - hr-net
```

### I.7 告警规则示例

```yaml
# monitoring/alerts.yml
groups:
  - name: hr-backend
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "HR Backend 错误率过高"
          description: "5xx 错误率超过 5%，持续 5 分钟"

      - alert: SlowResponses
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "HR Backend 响应变慢"
          description: "P95 响应时间超过 2 秒，持续 10 分钟"

      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes{name=~"hr.*app.*"} / container_spec_memory_limit_bytes > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "容器内存使用率过高"
          description: "内存使用超过 85%"

      - alert: DatabaseConnectionPoolExhausted
        expr: pg_stat_activity_count > 80
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL 连接数过高"
          description: "活跃连接数超过 80（默认最大 100）"
```

---

## 附录 J：Docker 网络最佳实践

### J.1 网络隔离架构

```
┌─────────────────────────────────────────────────────────┐
│                     外部网络（public）                     │
│  ┌──────────┐                                           │
│  │  Nginx   │  ports: 80, 443                           │
│  └────┬─────┘                                           │
├───────┼─────────────────────────────────────────────────┤
│       │         内部网络（hr-backend）                     │
│  ┌────┴─────┐                                           │
│  │   App    │  port: 3001（仅内部）                       │
│  └────┬─────┘                                           │
├───────┼─────────────────────────────────────────────────┤
│       │         数据网络（hr-data）                        │
│  ┌────┴─────┐  ┌──────────┐                             │
│  │ Postgres │  │  Redis   │                             │
│  └──────────┘  └──────────┘                             │
└─────────────────────────────────────────────────────────┘
```

```yaml
# docker-compose.prod.yml — 网络隔离
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    networks:
      - public
      - backend

  app:
    image: hr-backend:latest
    # 不暴露外部端口
    networks:
      - backend
      - data

  postgres:
    image: pgvector/pgvector:pg17
    # 不暴露外部端口
    networks:
      - data

networks:
  public:
    driver: bridge
  backend:
    driver: bridge
    internal: false
  data:
    driver: bridge
    internal: true    # 完全隔离，无外网访问
```

### J.2 DNS 与服务发现

```typescript
// Docker Compose 中，服务名即 DNS 名
// app 容器访问 postgres：
const DATABASE_URL = "postgresql://postgres:pass@postgres:5432/hr_screening";
//                                              ^^^^^^^^
//                                    Docker 内部 DNS 解析为 postgres 容器 IP

// 多副本时自动负载均衡
// docker compose up --scale app=3
// nginx → app:3001 → Docker 内置 round-robin → 3 个 app 容器
```

### J.3 IPv6 支持

```yaml
# docker-compose.yml
networks:
  hr-net:
    driver: bridge
    enable_ipv6: true
    ipam:
      config:
        - subnet: "172.20.0.0/16"
        - subnet: "fd00:dead:beef::/48"
```

---

## 附录 K：Docker 生产环境自动化脚本

### K.1 一键部署脚本（改进版）

```bash
#!/bin/bash
# scripts/deploy.sh — 生产环境一键部署
set -euo pipefail

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 配置
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
APP_NAME="hr-backend"
BACKUP_BEFORE_DEPLOY="${BACKUP_BEFORE_DEPLOY:-true}"
HEALTH_CHECK_URL="http://localhost:3001/health"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=2

# 检查前置条件
check_prerequisites() {
  log_info "检查前置条件..."

  command -v docker >/dev/null 2>&1 || { log_error "Docker 未安装"; exit 1; }
  command -v docker compose >/dev/null 2>&1 || { log_error "Docker Compose 未安装"; exit 1; }

  [ -f "$COMPOSE_FILE" ] || { log_error "找不到 $COMPOSE_FILE"; exit 1; }
  [ -f ".env.production" ] || { log_error "找不到 .env.production"; exit 1; }

  # 检查磁盘空间（至少 2GB）
  available_kb=$(df -k . | awk 'NR==2 {print $4}')
  if [ "$available_kb" -lt 2097152 ]; then
    log_error "磁盘空间不足（需要至少 2GB）"
    exit 1
  fi

  log_info "前置条件检查通过"
}

# 数据库备份
backup_database() {
  if [ "$BACKUP_BEFORE_DEPLOY" != "true" ]; then
    log_warn "跳过数据库备份"
    return
  fi

  log_info "备份数据库..."
  local backup_dir="./backups"
  local timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_file="${backup_dir}/hr_screening_${timestamp}.sql.gz"

  mkdir -p "$backup_dir"

  if docker compose -f "$COMPOSE_FILE" ps postgres | grep -q "running"; then
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
      pg_dump -U postgres hr_screening | gzip > "$backup_file"
    log_info "备份完成：$backup_file ($(du -h "$backup_file" | cut -f1))"

    # 保留最近 7 个备份
    ls -t "${backup_dir}"/hr_screening_*.sql.gz | tail -n +8 | xargs -r rm
    log_info "清理旧备份（保留最近 7 个）"
  else
    log_warn "PostgreSQL 未运行，跳过备份"
  fi
}

# 构建镜像
build_image() {
  log_info "构建镜像..."
  docker compose -f "$COMPOSE_FILE" build --no-cache app
  log_info "镜像构建完成"
}

# 数据库迁移
run_migrations() {
  log_info "运行数据库迁移..."
  docker compose -f "$COMPOSE_FILE" run --rm app \
    node -e "import('./dist/db/migrate.js')"
  log_info "迁移完成"
}

# 滚动更新
deploy() {
  log_info "开始部署..."

  # 先启动/更新数据库
  docker compose -f "$COMPOSE_FILE" up -d postgres
  sleep 3

  # 运行迁移
  run_migrations

  # 更新应用（零停机）
  docker compose -f "$COMPOSE_FILE" up -d --no-deps app

  log_info "等待健康检查..."
  local retries=0
  while [ $retries -lt $HEALTH_CHECK_RETRIES ]; do
    if curl -sf "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
      log_info "健康检查通过！"
      return 0
    fi
    retries=$((retries + 1))
    sleep $HEALTH_CHECK_INTERVAL
  done

  log_error "健康检查超时！回滚..."
  rollback
  exit 1
}

# 回滚
rollback() {
  log_error "回滚到上一版本..."
  docker compose -f "$COMPOSE_FILE" down app

  # 使用上一个镜像
  local prev_image=$(docker images --format "{{.Repository}}:{{.Tag}}" "${APP_NAME}" | sed -n '2p')
  if [ -n "$prev_image" ]; then
    docker tag "$prev_image" "${APP_NAME}:latest"
    docker compose -f "$COMPOSE_FILE" up -d app
    log_warn "已回滚到：$prev_image"
  else
    log_error "无可回滚版本"
  fi
}

# 清理
cleanup() {
  log_info "清理旧镜像..."
  docker image prune -f --filter "until=168h" --filter "label=app=${APP_NAME}"
  log_info "清理完成"
}

# 输出部署信息
show_status() {
  echo ""
  echo "=============================="
  log_info "部署完成！"
  echo "=============================="
  docker compose -f "$COMPOSE_FILE" ps
  echo ""
  log_info "应用地址: $HEALTH_CHECK_URL"
  log_info "查看日志: docker compose -f $COMPOSE_FILE logs -f app"
}

# 主流程
main() {
  local start_time=$(date +%s)

  check_prerequisites
  backup_database
  build_image
  deploy
  cleanup
  show_status

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  log_info "部署总耗时: ${duration}s"
}

main "$@"
```

### K.2 数据库备份恢复脚本

```bash
#!/bin/bash
# scripts/db-restore.sh — 从备份恢复数据库
set -euo pipefail

BACKUP_FILE="${1:?用法: $0 <backup_file.sql.gz>}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "错误：找不到备份文件 $BACKUP_FILE"
  exit 1
fi

echo "⚠️  即将恢复数据库，当前数据将被覆盖！"
echo "备份文件：$BACKUP_FILE"
read -p "确认继续？(yes/no): " confirm
[ "$confirm" = "yes" ] || { echo "已取消"; exit 0; }

echo "停止应用..."
docker compose -f "$COMPOSE_FILE" stop app

echo "恢复数据库..."
gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U postgres -d hr_screening

echo "重启应用..."
docker compose -f "$COMPOSE_FILE" start app

echo "✅ 数据库恢复完成"
```

### K.3 Docker 系统清理脚本

```bash
#!/bin/bash
# scripts/docker-cleanup.sh — 安全清理 Docker 资源
set -euo pipefail

echo "=== Docker 资源使用情况 ==="
docker system df

echo ""
echo "=== 清理计划 ==="

# 悬空镜像
dangling=$(docker images -f "dangling=true" -q | wc -l)
echo "- 悬空镜像: $dangling 个"

# 已停止容器
stopped=$(docker ps -a -f "status=exited" -q | wc -l)
echo "- 已停止容器: $stopped 个"

# 未使用网络
unused_nets=$(docker network ls -f "type=custom" -q | wc -l)
echo "- 自定义网络: $unused_nets 个"

# 构建缓存
echo "- 构建缓存: $(docker builder du --verbose 2>/dev/null | tail -1 || echo '未知')"

echo ""
read -p "执行清理？(yes/no): " confirm
[ "$confirm" = "yes" ] || { echo "已取消"; exit 0; }

echo "清理悬空镜像..."
docker image prune -f

echo "清理已停止容器..."
docker container prune -f

echo "清理未使用网络..."
docker network prune -f

echo "清理构建缓存（保留最近 7 天）..."
docker builder prune -f --keep-storage=5gb

echo ""
echo "=== 清理后资源使用 ==="
docker system df
```

---

## 附录 L：Docker 性能调优

### L.1 Bun 容器内存优化

```dockerfile
# Dockerfile — Bun 内存配置
FROM oven/bun:1-alpine AS production

# Bun 使用 JavaScriptCore，通过 BUN_JSC_* 环境变量配置内存
# 容器限制 512MB → Bun 堆限制 384MB → OS 128MB
ENV BUN_JSC_forceRAMSize=402653184

# UV 线程池大小（影响 DNS/文件 IO）
ENV UV_THREADPOOL_SIZE=8
```

### L.2 PostgreSQL 容器调优

```yaml
# docker-compose.prod.yml
services:
  postgres:
    image: pgvector/pgvector:pg17
    command:
      - postgres
      # 连接
      - -c max_connections=100
      # 内存（按 1GB 容器内存配置）
      - -c shared_buffers=256MB
      - -c effective_cache_size=512MB
      - -c work_mem=4MB
      - -c maintenance_work_mem=64MB
      # WAL
      - -c wal_buffers=16MB
      - -c checkpoint_completion_target=0.9
      - -c min_wal_size=80MB
      - -c max_wal_size=1GB
      # 查询规划
      - -c random_page_cost=1.1         # SSD 推荐值
      - -c effective_io_concurrency=200  # SSD 推荐值
      # 日志
      - -c log_min_duration_statement=200  # 慢查询 > 200ms
      - -c log_checkpoints=on
      - -c log_connections=on
      - -c log_disconnections=on
      # pgvector
      - -c shared_preload_libraries=vector
    shm_size: '128mb'  # 重要：共享内存
    deploy:
      resources:
        limits:
          memory: 1G
```

### L.3 性能基准测试

```bash
#!/bin/bash
# scripts/benchmark.sh — API 性能基准测试

# 安装 hey (HTTP 负载测试工具)
# go install github.com/rakyll/hey@latest
# 或: brew install hey

BASE_URL="${1:-http://localhost:3001}"

echo "=== HR Backend 性能基准测试 ==="
echo "目标: $BASE_URL"
echo ""

echo "--- 1. Health Check (轻量) ---"
hey -n 1000 -c 50 "$BASE_URL/health"

echo ""
echo "--- 2. 职位列表 (DB 查询) ---"
hey -n 500 -c 20 "$BASE_URL/api/positions"

echo ""
echo "--- 3. 候选人列表 (JOIN 查询) ---"
hey -n 200 -c 10 "$BASE_URL/api/candidates"

echo ""
echo "=== 基准测试完成 ==="
echo "参考指标："
echo "- Health: < 5ms (P99)"
echo "- 列表查询: < 50ms (P99)"
echo "- 复杂查询: < 200ms (P99)"
```

### L.4 Docker Compose Profile（开发 vs 生产 vs 测试）

```yaml
# docker-compose.yml — 使用 profiles 区分环境
services:
  app:
    build: .
    ports:
      - "3001:3001"
    profiles: ["dev", "prod"]

  # 开发专用：热重载
  app-dev:
    build:
      context: .
      target: deps  # 只到依赖安装阶段
    volumes:
      - ./src:/app/src:ro     # 挂载源码
      - ./package.json:/app/package.json:ro
    command: bun run --watch src/index.ts
    ports:
      - "3001:3001"
    profiles: ["dev"]
    environment:
      NODE_ENV: development
      LOG_LEVEL: debug

  postgres:
    image: pgvector/pgvector:pg17
    profiles: ["dev", "prod", "test"]
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: hr_screening

  # 测试专用：临时数据库
  postgres-test:
    image: pgvector/pgvector:pg17
    profiles: ["test"]
    ports:
      - "5433:5432"
    environment:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: hr_screening_test
    tmpfs:
      - /var/lib/postgresql/data  # 内存数据库（快，测试完即丢）

  # 监控（仅生产）
  prometheus:
    image: prom/prometheus:latest
    profiles: ["prod"]
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro

  grafana:
    image: grafana/grafana:latest
    profiles: ["prod"]
    ports:
      - "3000:3000"

volumes:
  pg_data:
```

```bash
# 按 profile 启动
docker compose --profile dev up        # 开发环境
docker compose --profile prod up -d    # 生产环境
docker compose --profile test up -d    # 测试环境

# 同时启动多个 profile
docker compose --profile dev --profile test up
```

---

## 附录 M：容器化最佳实践检查清单

### M.1 Dockerfile 最佳实践

```
✅ 使用 Alpine 基础镜像（体积小）
✅ 固定版本号（oven/bun:1-alpine，不用 :latest）
✅ 多阶段构建（deps → build → production）
✅ 利用 .dockerignore 排除无关文件
✅ COPY 指令从最不变到最频繁变更排列
✅ 合并 RUN 指令减少层数
✅ 使用非 root 用户（USER hrapp）
✅ 添加 HEALTHCHECK
✅ 清理包管理器缓存（apk del, rm -rf /var/cache/apk/*)
✅ 使用 BuildKit 缓存挂载
✅ 不在镜像中包含 secrets
✅ 设置合理的 WORKDIR
```

### M.2 Docker Compose 最佳实践

```
✅ 使用 docker compose（V2），而非 docker-compose（V1）
✅ 分离开发和生产 compose 文件（-f 多文件合并）
✅ 使用 .env 文件管理变量（不提交到 git）
✅ 定义 depends_on + healthcheck（服务启动顺序）
✅ 设置 restart: unless-stopped（生产）
✅ 配置日志驱动 + 日志轮转
✅ 资源限制（deploy.resources.limits）
✅ 使用命名 volume（数据持久化）
✅ 网络隔离（多网络分层）
✅ 使用 profiles 区分环境
```

### M.3 安全最佳实践

```
✅ 运行 Trivy/Scout 扫描漏洞
✅ 定期更新基础镜像
✅ 使用 read_only: true + tmpfs
✅ cap_drop: ALL + 按需 cap_add
✅ security_opt: no-new-privileges
✅ 不暴露数据库端口到外网
✅ 使用 Docker Secret（非环境变量）存储敏感信息
✅ 启用 Docker Content Trust
✅ 定期审计容器配置
```

### M.4 运维最佳实践

```
✅ 容器化之外的自动化脚本（deploy.sh, backup.sh）
✅ 日志聚合（JSON 格式 + ELK/Loki）
✅ 健康检查 + 告警
✅ 定期备份数据库
✅ 滚动更新策略
✅ 回滚机制
✅ 监控仪表盘（Grafana）
✅ 磁盘空间监控 + 自动清理
✅ 容器内无状态（状态外置到 DB/Volume）
```

---

## 附录 N：Nginx 反向代理 SSL 完整配置

### N.1 Let's Encrypt SSL 自动化

```bash
#!/bin/bash
# scripts/setup-ssl.sh — 自动获取 SSL 证书

DOMAIN="${1:?用法: $0 <domain>}"
EMAIL="${2:?用法: $0 <domain> <email>}"

# 安装 certbot
apk add certbot || apt-get install -y certbot

# 获取证书（standalone 模式 — 先停止 Nginx）
docker compose stop nginx 2>/dev/null || true

certbot certonly --standalone \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

# 证书路径
echo "证书位置："
echo "  证书: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "  私钥: /etc/letsencrypt/live/$DOMAIN/privkey.pem"

# 设置自动续期
echo "0 0 1 * * certbot renew --quiet && docker compose restart nginx" | crontab -
echo "已添加自动续期 cron job（每月1日检查）"
```

### N.2 完整 Nginx 配置

```nginx
# nginx/nginx.conf — HR Backend 生产配置

# 全局配置
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}

http {
    # 基础配置
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 20m;  # 简历文件大小限制

    # MIME
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式（JSON）
    log_format json_combined escape=json
        '{'
            '"time":"$time_iso8601",'
            '"remote_addr":"$remote_addr",'
            '"request":"$request",'
            '"status":$status,'
            '"body_bytes_sent":$body_bytes_sent,'
            '"request_time":$request_time,'
            '"upstream_response_time":"$upstream_response_time",'
            '"http_referer":"$http_referer",'
            '"http_user_agent":"$http_user_agent",'
            '"request_id":"$request_id"'
        '}';

    access_log /var/log/nginx/access.log json_combined;
    error_log /var/log/nginx/error.log warn;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 4;
    gzip_min_length 256;
    gzip_types
        application/json
        application/javascript
        text/css
        text/plain
        text/xml;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # 限流
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=upload:10m rate=5r/s;

    # 上游服务
    upstream hr_backend {
        server app:3001;
        keepalive 32;
    }

    # HTTP → HTTPS 重定向
    server {
        listen 80;
        server_name hr.ivis-sh.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS 主服务
    server {
        listen 443 ssl http2;
        server_name hr.ivis-sh.com;

        # SSL 证书
        ssl_certificate /etc/letsencrypt/live/hr.ivis-sh.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/hr.ivis-sh.com/privkey.pem;

        # SSL 配置（Mozilla Intermediate）
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 1d;
        ssl_session_tickets off;

        # HSTS
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # API 路由
        location /api/ {
            limit_req zone=api burst=50 nodelay;

            proxy_pass http://hr_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Request-ID $request_id;

            proxy_connect_timeout 5s;
            proxy_send_timeout 30s;
            proxy_read_timeout 60s;  # AI 评分可能需要较长时间
        }

        # 简历上传（更宽松的限流 + 更大超时）
        location /api/resumes/upload {
            limit_req zone=upload burst=10 nodelay;
            client_max_body_size 20m;

            proxy_pass http://hr_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            proxy_connect_timeout 5s;
            proxy_send_timeout 60s;
            proxy_read_timeout 120s;  # 上传 + 解析 + 评分
        }

        # 健康检查（无限流）
        location /health {
            proxy_pass http://hr_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
        }

        # 指标（仅内网）
        location /metrics {
            allow 10.0.0.0/8;
            allow 172.16.0.0/12;
            allow 192.168.0.0/16;
            deny all;

            proxy_pass http://hr_backend;
        }

        # 静态文件（如果有前端）
        location / {
            root /var/www/hr-frontend;
            try_files $uri $uri/ /index.html;

            # 缓存静态资源
            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
                expires 7d;
                add_header Cache-Control "public, immutable";
            }
        }
    }
}
```

### N.3 Docker Compose 中挂载 Nginx

```yaml
# docker-compose.prod.yml — Nginx 服务
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - ./frontend/dist:/var/www/hr-frontend:ro  # 前端构建产物
    depends_on:
      app:
        condition: service_healthy
    networks:
      - public
      - backend
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 附录 O：Docker + CI/CD 集成最佳实践

### O.1 Gitea Actions Docker 构建 + 推送

```yaml
# .gitea/workflows/docker-build.yml
name: Docker Build & Push
on:
  push:
    branches: [main]
    tags: ['v*']

env:
  REGISTRY: registry.keiten-jp.com
  IMAGE_NAME: hr-backend

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 生成镜像标签
      - name: Generate tags
        id: meta
        run: |
          # main 分支 → latest + commit hash
          if [ "${{ gitea.ref }}" = "refs/heads/main" ]; then
            echo "tags=$REGISTRY/$IMAGE_NAME:latest,$REGISTRY/$IMAGE_NAME:${{ gitea.sha }}" >> $GITHUB_OUTPUT
          fi
          # tag 推送 → 版本号
          if [[ "${{ gitea.ref }}" == refs/tags/v* ]]; then
            VERSION="${{ gitea.ref_name }}"
            echo "tags=$REGISTRY/$IMAGE_NAME:$VERSION,$REGISTRY/$IMAGE_NAME:latest" >> $GITHUB_OUTPUT
          fi

      # 登录 Registry
      - name: Login to registry
        run: |
          echo "${{ secrets.REGISTRY_PASSWORD }}" | \
            docker login $REGISTRY -u ${{ secrets.REGISTRY_USERNAME }} --password-stdin

      # 构建 + 推送
      - name: Build and push
        run: |
          docker buildx build \
            --platform linux/amd64 \
            --push \
            --cache-from type=registry,ref=$REGISTRY/$IMAGE_NAME:buildcache \
            --cache-to type=registry,ref=$REGISTRY/$IMAGE_NAME:buildcache,mode=max \
            $(echo "${{ steps.meta.outputs.tags }}" | sed 's/,/ -t /g; s/^/-t /') \
            .

      # 安全扫描
      - name: Security scan
        run: |
          docker run --rm \
            aquasec/trivy:latest image \
            --severity HIGH,CRITICAL \
            --exit-code 1 \
            $REGISTRY/$IMAGE_NAME:${{ gitea.sha }}

      # 通知部署
      - name: Trigger deploy
        if: gitea.ref == 'refs/heads/main'
        run: |
          ssh deploy@${{ secrets.DEPLOY_HOST }} \
            "cd /opt/hr-backend && docker compose pull && docker compose up -d"
```

### O.2 镜像版本管理策略

```
标签策略：
├─ :latest          — main 分支最新构建（自动）
├─ :v1.0.0          — 正式发布版本（git tag 触发）
├─ :sha-abc1234     — 每次提交的精确版本
├─ :buildcache      — BuildKit 远程缓存层
└─ :canary          — 预发布/金丝雀版本

docker-compose.prod.yml 中的引用：
├─ 开发/测试：image: hr-backend:latest
├─ 正式生产：image: hr-backend:v1.2.3  # 固定版本
└─ 金丝雀：image: hr-backend:canary    # 少量流量
```

### O.3 零停机部署流程

```bash
#!/bin/bash
# scripts/zero-downtime-deploy.sh

set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
NEW_IMAGE="${1:?用法: $0 <new-image-tag>}"

echo "=== 零停机部署 ==="
echo "新镜像: $NEW_IMAGE"

# 1. 拉取新镜像
echo "拉取镜像..."
docker compose -f "$COMPOSE_FILE" pull app

# 2. 启动新容器（不停旧容器）
echo "启动新容器..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps --scale app=2 app

# 3. 等待新容器健康
echo "等待健康检查..."
sleep 10
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec app \
    wget -qO- http://localhost:3001/health 2>/dev/null | grep -q "ok"; then
    echo "新容器健康！"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "新容器不健康，回滚..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps --scale app=1 app
    exit 1
  fi
  sleep 2
done

# 4. 缩减到 1 个容器（移除旧容器）
echo "移除旧容器..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps --scale app=1 app

echo "=== 部署完成 ==="
docker compose -f "$COMPOSE_FILE" ps
```

---

## 附录 P：跨文档参考索引

```
本文档与其他研究文档的关联：

Docker + CI/CD（→ 03-cicd-testing.md）
├─ CI 中的 Docker 构建步骤 → 本文档附录 O
├─ Gitea Actions Docker 配置 → 03 附录 C + 本文档附录 O
└─ 测试环境 Docker Compose → 03 附录 H + 本文档附录 L

Docker + Supabase（→ 01-supabase-integration.md）
├─ Supabase 自托管 Docker 部署 → 01 附录 J
├─ PostgreSQL 容器 vs Supabase 托管 → 01 附录 I
└─ Docker Compose 中数据库选型 → 本文档正文 + 01 正文

Docker + AI 工具（→ 05-ai-dev-tools.md）
├─ Claude Code 生成 Dockerfile → 05 附录 B
├─ MCP Server 容器化 → 05 附录 E
└─ CLAUDE.md 中的 Docker 命令 → 05 附录 A

Docker + Agent/MCP（→ 02-agents-skills-mcp.md）
├─ MCP Server Docker 部署 → 02 附录 D
└─ Agent 批量处理容器化 → 02 附录 H
```

---

## 附录 Q：Docker 常见问题排查 (FAQ)

### Q.1 镜像构建问题

```
问题：bun install 报错 lockfile missing
原因：Dockerfile 中未复制 bun.lock
解决：确保 COPY package.json bun.lock ./ 包含锁文件

问题：Alpine 上原生模块编译失败（如 canvas, sharp）
原因：Alpine 缺少编译依赖
解决：RUN apk add --no-cache python3 make g++
注意：pdf-parse 和 mammoth 是纯 JS，不需要原生编译

问题：构建后镜像太大（>500MB）
原因：未使用多阶段构建，或 dev dependencies 被包含
解决：
  1. 确保使用多阶段构建
  2. 最终阶段仅 COPY src + node_modules
  3. 检查 .dockerignore 是否排除了 .git, test, docs

问题：Docker build 缓存失效导致每次都重新安装依赖
原因：package.json 或 bun.lock 之前的层有变化
解决：确保 COPY 顺序：先 lock 文件 → install → 再 COPY 源码
```

### Q.2 运行时问题

```
问题：容器启动后立即退出（exit code 1）
排查：docker logs <container> 查看日志
常见原因：
  1. 环境变量缺失 → 检查 .env 文件是否挂载
  2. 端口冲突 → 检查 3001 端口是否被占用
  3. 数据库连接失败 → 检查 DATABASE_URL 中主机名是否为 service name

问题：数据库连接被拒绝
原因：app 容器启动时 postgres 尚未 ready
解决：
  1. depends_on + condition: service_healthy
  2. 或代码中添加连接重试逻辑

问题：容器内存 OOM Killed
原因：Bun 默认可能使用大量内存，超出容器限制
解决：设置 BUN_JSC_forceRAMSize=402653184
     配合 deploy.resources.limits.memory: 512M

问题：时区不正确（日志时间错误）
解决：
  1. 环境变量：TZ=Asia/Shanghai
  2. 或挂载：-v /etc/localtime:/etc/localtime:ro
```

### Q.3 网络问题

```
问题：容器间无法通信（Connection refused）
原因：不在同一 Docker 网络
解决：确保 services 在同一 network 下，使用 service name 作为主机名

问题：容器无法访问外网（如 MiniMax API）
原因：Docker 网络 DNS 配置问题
解决：
  1. docker compose 重启网络：docker compose down && docker compose up -d
  2. 检查 Docker daemon DNS：/etc/docker/daemon.json → {"dns": ["8.8.8.8"]}

问题：端口映射不生效
原因：防火墙阻止或端口已被占用
排查：
  1. docker compose ps → 确认端口映射
  2. ss -tlnp | grep 3001 → 检查端口占用
  3. ufw allow 3001 → 防火墙放行
```

### Q.4 数据持久化问题

```
问题：容器重启后数据丢失
原因：未使用 Docker Volume
解决：volumes: 声明命名卷，挂载到数据目录

问题：Volume 权限问题
原因：容器内用户 UID 与卷目录权限不匹配
解决：
  1. 在 Dockerfile 中 chown 数据目录
  2. 或使用与宿主机相同的 UID 创建用户

问题：备份文件太大
解决：
  1. pg_dump | gzip 压缩
  2. 定期清理旧备份
  3. 使用增量备份（pg_basebackup）
```

---

## 附录 R：生产环境 Checklist

### R.1 部署前检查清单

```markdown
## 代码质量
- [ ] TypeScript 编译无错误 (`bun run tsc --noEmit`)
- [ ] Biome lint 无错误 (`bun run biome check src/`)
- [ ] 所有测试通过 (`bun run vitest run`)
- [ ] 覆盖率达标 (> 70%)

## Docker
- [ ] Docker 构建成功 (`docker build .`)
- [ ] 安全扫描无高危漏洞 (`trivy image hr-backend:latest`)
- [ ] .dockerignore 排除敏感文件
- [ ] 非 root 用户运行
- [ ] HEALTHCHECK 配置正确

## 环境变量
- [ ] .env.production 所有变量已配置
- [ ] 敏感信息不在代码中（API key, 密码等）
- [ ] DATABASE_URL 指向生产数据库
- [ ] MINIMAX_API_KEY 有效

## 数据库
- [ ] 迁移脚本已测试 (`bun db:migrate`)
- [ ] 数据备份已完成
- [ ] 连接池配置合理

## 网络
- [ ] SSL 证书有效
- [ ] Nginx 配置已测试
- [ ] 防火墙规则：仅开放 80/443
- [ ] 数据库端口不对外暴露

## 监控
- [ ] 健康检查端点可访问
- [ ] 日志格式为 JSON
- [ ] 日志轮转已配置
- [ ] 告警规则已设置

## 备份
- [ ] 数据库备份 cron 已配置
- [ ] 备份恢复已测试
- [ ] 备份文件存储在独立位置

## 安全
- [ ] 容器使用 read_only + tmpfs
- [ ] capabilities 最小化
- [ ] 资源限制已设置
- [ ] Docker Content Trust 已启用
```

---

## 附录 S: Docker Registry 私有仓库管理

### S.1 为什么需要私有 Registry

```
公共 Docker Hub 限制:
- 免费用户: 100 pulls / 6 hours (IP限制)
- 匿名用户: 100 pulls / 6 hours
- Pro 用户: 无限制但需付费

私有 Registry 优势:
- 无拉取限制
- 数据在内网，安全可控
- 推送/拉取速度更快（局域网）
- 可配合 CI/CD 自动推送
- 支持镜像签名和扫描
```

### S.2 自建 Distribution Registry (推荐)

```yaml
# docker-compose.registry.yml
# HR 项目私有 Registry 部署

services:
  registry:
    image: registry:2
    container_name: hr-registry
    restart: always
    ports:
      - "5000:5000"
    environment:
      # 存储配置
      REGISTRY_STORAGE: filesystem
      REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY: /var/lib/registry
      REGISTRY_STORAGE_DELETE_ENABLED: "true"
      # 垃圾回收
      REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING_ENABLED: "true"
      REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING_AGE: 168h
      REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING_INTERVAL: 24h
      REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING_DRYRUN: "false"
      # HTTP 配置
      REGISTRY_HTTP_HEADERS_X-Content-Type-Options: "[nosniff]"
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Origin: "['*']"
      # TLS（生产环境必须）
      REGISTRY_HTTP_TLS_CERTIFICATE: /certs/domain.crt
      REGISTRY_HTTP_TLS_KEY: /certs/domain.key
      # 认证
      REGISTRY_AUTH: htpasswd
      REGISTRY_AUTH_HTPASSWD_REALM: "HR Registry"
      REGISTRY_AUTH_HTPASSWD_PATH: /auth/htpasswd
    volumes:
      - registry_data:/var/lib/registry
      - ./certs:/certs:ro
      - ./auth:/auth:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "https://localhost:5000/v2/"]
      interval: 30s
      timeout: 5s
      retries: 3

  # Registry UI（可选，方便查看镜像）
  registry-ui:
    image: joxit/docker-registry-ui:latest
    container_name: hr-registry-ui
    restart: always
    ports:
      - "8080:80"
    environment:
      REGISTRY_TITLE: "HR Project Registry"
      REGISTRY_URL: "https://registry:5000"
      DELETE_IMAGES: "true"
      SHOW_CONTENT_DIGEST: "true"
      SHOW_CATALOG_NB_TAGS: "true"
      CATALOG_MIN_BRANCHES: 1
      CATALOG_MAX_BRANCHES: 0
      TAGLIST_PAGE_SIZE: 100
      SINGLE_REGISTRY: "true"
    depends_on:
      - registry

volumes:
  registry_data:
    driver: local
```

### S.3 Registry 认证配置

```bash
#!/bin/bash
# scripts/setup-registry-auth.sh
# 创建 Registry 认证文件

set -euo pipefail

AUTH_DIR="./auth"
CERTS_DIR="./certs"
DOMAIN="${1:-registry.ivis-sh.com}"

# 1. 创建认证目录
mkdir -p "$AUTH_DIR" "$CERTS_DIR"

# 2. 创建 htpasswd 文件
echo "Creating htpasswd for registry users..."

# 安装 htpasswd 工具
if ! command -v htpasswd &>/dev/null; then
  echo "Installing apache2-utils..."
  sudo apt-get install -y apache2-utils
fi

# CI/CD 推送用户
htpasswd -Bbn ci-push "$(openssl rand -base64 16)" > "$AUTH_DIR/htpasswd"

# 开发者只读用户
htpasswd -Bbn dev-pull "$(openssl rand -base64 16)" >> "$AUTH_DIR/htpasswd"

# 管理员用户
htpasswd -Bbn admin "$(openssl rand -base64 16)" >> "$AUTH_DIR/htpasswd"

echo "Auth file created: $AUTH_DIR/htpasswd"
echo "⚠️  请保存以上密码到安全位置！"

# 3. 生成自签名证书（生产环境应使用 Let's Encrypt）
echo "Generating self-signed certificate for $DOMAIN..."

openssl req -newkey rsa:4096 -nodes -sha256 \
  -keyout "$CERTS_DIR/domain.key" \
  -x509 -days 365 \
  -out "$CERTS_DIR/domain.crt" \
  -subj "/CN=$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1"

echo "Certificate generated: $CERTS_DIR/domain.crt"
echo ""
echo "Setup complete! Start registry with:"
echo "  docker compose -f docker-compose.registry.yml up -d"
```

### S.4 镜像推送与管理脚本

```bash
#!/bin/bash
# scripts/registry-manage.sh
# 私有 Registry 镜像管理工具

set -euo pipefail

REGISTRY="${REGISTRY_URL:-registry.ivis-sh.com:5000}"
IMAGE_NAME="hr-backend"

usage() {
  echo "Usage: $0 {push|list|tags|delete|gc|mirror}"
  echo ""
  echo "Commands:"
  echo "  push [tag]         构建并推送镜像到私有 Registry"
  echo "  list               列出所有镜像"
  echo "  tags [image]       列出镜像的所有标签"
  echo "  delete [image:tag] 删除指定镜像标签"
  echo "  gc                 执行垃圾回收，清理未引用层"
  echo "  mirror [image]     从 Docker Hub 镜像到私有 Registry"
  echo "  prune [days]       删除超过 N 天的旧标签"
}

# 推送镜像
cmd_push() {
  local tag="${1:-latest}"
  local full_tag="$REGISTRY/$IMAGE_NAME:$tag"
  local git_sha
  git_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

  echo "Building $IMAGE_NAME..."
  docker build \
    --label "org.opencontainers.image.revision=$git_sha" \
    --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -t "$full_tag" \
    -t "$REGISTRY/$IMAGE_NAME:$git_sha" \
    .

  echo "Pushing to $REGISTRY..."
  docker push "$full_tag"
  docker push "$REGISTRY/$IMAGE_NAME:$git_sha"

  echo "✓ Pushed: $full_tag"
  echo "✓ Pushed: $REGISTRY/$IMAGE_NAME:$git_sha"
}

# 列出所有镜像
cmd_list() {
  echo "Images in $REGISTRY:"
  curl -s "https://$REGISTRY/v2/_catalog" | jq -r '.repositories[]' 2>/dev/null || \
    echo "Error: Cannot connect to registry"
}

# 列出标签
cmd_tags() {
  local image="${1:-$IMAGE_NAME}"
  echo "Tags for $image:"
  curl -s "https://$REGISTRY/v2/$image/tags/list" | jq -r '.tags[]' 2>/dev/null | sort -V
}

# 删除镜像标签
cmd_delete() {
  local image_tag="${1:?Usage: delete image:tag}"
  local image="${image_tag%%:*}"
  local tag="${image_tag##*:}"

  # 获取 digest
  local digest
  digest=$(curl -s -I \
    -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
    "https://$REGISTRY/v2/$image/manifests/$tag" | \
    grep -i "Docker-Content-Digest" | awk '{print $2}' | tr -d '\r')

  if [ -z "$digest" ]; then
    echo "Error: Cannot find digest for $image:$tag"
    return 1
  fi

  echo "Deleting $image:$tag (digest: $digest)..."
  curl -s -X DELETE "https://$REGISTRY/v2/$image/manifests/$digest"
  echo "✓ Deleted. Run 'gc' to reclaim disk space."
}

# 垃圾回收
cmd_gc() {
  echo "Running garbage collection on registry..."
  docker exec hr-registry bin/registry garbage-collect \
    /etc/docker/registry/config.yml \
    --delete-untagged=true

  echo "✓ Garbage collection complete"
}

# 镜像缓存（从 Docker Hub 拉到私有）
cmd_mirror() {
  local source_image="${1:?Usage: mirror source-image}"
  local target="$REGISTRY/$source_image"

  echo "Mirroring $source_image -> $target"
  docker pull "$source_image"
  docker tag "$source_image" "$target"
  docker push "$target"

  echo "✓ Mirrored: $target"
}

# 清理旧标签
cmd_prune() {
  local days="${1:-30}"
  local image="${2:-$IMAGE_NAME}"

  echo "Pruning tags older than $days days for $image..."

  local cutoff_date
  cutoff_date=$(date -d "$days days ago" +%Y-%m-%dT%H:%M:%S 2>/dev/null || \
                date -v-"${days}"d +%Y-%m-%dT%H:%M:%S)

  local tags
  tags=$(curl -s "https://$REGISTRY/v2/$image/tags/list" | jq -r '.tags[]' 2>/dev/null)

  local count=0
  for tag in $tags; do
    # 跳过 latest 和语义版本标签
    if [[ "$tag" == "latest" ]] || [[ "$tag" =~ ^v[0-9] ]]; then
      continue
    fi

    # 获取创建时间
    local created
    created=$(curl -s "https://$REGISTRY/v2/$image/manifests/$tag" \
      -H "Accept: application/vnd.docker.distribution.manifest.v2+json" | \
      jq -r '.config.digest' 2>/dev/null)

    if [ -n "$created" ]; then
      local blob_date
      blob_date=$(curl -s "https://$REGISTRY/v2/$image/blobs/$created" | \
        jq -r '.created' 2>/dev/null | cut -dT -f1)

      if [[ "$blob_date" < "$cutoff_date" ]]; then
        echo "  Deleting old tag: $tag (created: $blob_date)"
        cmd_delete "$image:$tag"
        ((count++))
      fi
    fi
  done

  echo "✓ Pruned $count old tags"
}

# 主入口
case "${1:-help}" in
  push)   cmd_push "${2:-}" ;;
  list)   cmd_list ;;
  tags)   cmd_tags "${2:-}" ;;
  delete) cmd_delete "${2:-}" ;;
  gc)     cmd_gc ;;
  mirror) cmd_mirror "${2:-}" ;;
  prune)  cmd_prune "${2:-}" "${3:-}" ;;
  *)      usage ;;
esac
```

### S.5 Gitea CI 集成私有 Registry

```yaml
# .gitea/workflows/docker-push.yml
# 构建并推送到私有 Registry

name: Docker Build & Push

on:
  push:
    branches: [main]
    tags: ['v*']

env:
  REGISTRY: registry.ivis-sh.com:5000
  IMAGE: hr-backend

jobs:
  build-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to Private Registry
        run: |
          echo "${{ secrets.REGISTRY_PASSWORD }}" | \
            docker login "$REGISTRY" -u ci-push --password-stdin

      - name: Build and Push
        run: |
          # 确定标签
          if [[ "$GITHUB_REF" == refs/tags/v* ]]; then
            TAG="${GITHUB_REF#refs/tags/}"
          else
            TAG="sha-$(echo $GITHUB_SHA | head -c 7)"
          fi

          docker build \
            --label "org.opencontainers.image.revision=$GITHUB_SHA" \
            --label "org.opencontainers.image.source=$GITHUB_SERVER_URL/$GITHUB_REPOSITORY" \
            -t "$REGISTRY/$IMAGE:$TAG" \
            -t "$REGISTRY/$IMAGE:latest" \
            .

          docker push "$REGISTRY/$IMAGE:$TAG"
          docker push "$REGISTRY/$IMAGE:latest"

          echo "Pushed: $REGISTRY/$IMAGE:$TAG"

      - name: Logout
        if: always()
        run: docker logout "$REGISTRY"
```

### S.6 镜像标签策略

```
推荐的标签命名规范:

1. 语义版本（发布用）:
   v1.0.0, v1.1.0, v2.0.0
   → 正式发布版本，永不覆盖

2. Git SHA（CI/CD 自动）:
   sha-abc1234
   → 每次提交自动生成，方便回溯

3. latest（最新稳定）:
   latest
   → 指向最新的 main 分支构建

4. 分支标签（开发用）:
   dev, staging
   → 对应开发/预发布环境

5. 日期标签（备份用）:
   20260227
   → 每日构建，方便按日期回滚

使用示例:
  docker pull registry.ivis-sh.com:5000/hr-backend:v1.2.0   # 指定版本
  docker pull registry.ivis-sh.com:5000/hr-backend:sha-abc12 # 指定提交
  docker pull registry.ivis-sh.com:5000/hr-backend:latest     # 最新稳定版
```

### S.7 Registry 备份策略

```bash
#!/bin/bash
# scripts/backup-registry.sh
# Registry 数据备份

set -euo pipefail

BACKUP_DIR="/data/backups/registry"
REGISTRY_VOLUME="hr-backend_registry_data"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/registry-$DATE.tar.gz"

echo "Backing up registry data..."

# 方法1: 直接备份 volume
docker run --rm \
  -v "$REGISTRY_VOLUME:/source:ro" \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/registry-$DATE.tar.gz" -C /source .

echo "Backup created: $BACKUP_FILE"
echo "Size: $(du -sh "$BACKUP_FILE" | cut -f1)"

# 清理旧备份
find "$BACKUP_DIR" -name "registry-*.tar.gz" -mtime +$RETENTION_DAYS -delete
echo "Cleaned backups older than $RETENTION_DAYS days"
```

---

## 附录 T: 容器编排方案对比与迁移路径

### T.1 编排方案对比矩阵

```
┌──────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ 特性             │ Docker Compose    │ Docker Swarm      │ Kubernetes        │
├──────────────────┼───────────────────┼───────────────────┼───────────────────┤
│ 复杂度           │ ★☆☆ 简单          │ ★★☆ 中等          │ ★★★ 复杂          │
│ 学习曲线         │ 极低              │ 低                │ 高                │
│ 适用规模         │ 单机              │ 3-10 节点         │ 10+ 节点          │
│ 高可用           │ ✗                 │ ✓（内置）         │ ✓（完善）         │
│ 自动扩缩容       │ ✗                 │ 手动              │ ✓（HPA/VPA）     │
│ 服务发现         │ DNS（内置）       │ DNS + VIP         │ DNS + Service     │
│ 负载均衡         │ ✗                 │ 内置 L4           │ Ingress + L4/L7   │
│ 滚动更新         │ 有限              │ ✓                 │ ✓（完善）         │
│ 回滚             │ 手动              │ ✓                 │ ✓（自动）         │
│ 密钥管理         │ .env 文件         │ Docker Secrets    │ K8s Secrets/Vault │
│ 存储编排         │ volumes           │ volumes           │ PV/PVC/CSI        │
│ 网络策略         │ 基础              │ overlay           │ NetworkPolicy     │
│ 监控集成         │ 手动              │ 手动              │ 生态丰富          │
│ CI/CD 集成       │ 简单              │ 中等              │ GitOps (ArgoCD)   │
│ 运维成本         │ 极低              │ 低                │ 高                │
│ 社区活跃度       │ 高                │ 低（逐渐式微）    │ 极高              │
│ HR项目推荐       │ ✓ 当前阶段        │ △ 需要HA时        │ ✗ 过度设计        │
└──────────────────┴───────────────────┴───────────────────┴───────────────────┘
```

### T.2 HR 项目阶段性编排建议

```
阶段 1: MVP / 开发阶段（当前）
→ Docker Compose
  - 单机部署即可
  - 开发/测试/生产环境通过 profiles 区分
  - 最低运维成本

阶段 2: 小规模生产（10-50 并发用户）
→ Docker Compose + Nginx
  - 仍然单机部署
  - Nginx 作为反向代理 + SSL 终止
  - 手动扩展（多实例 + 负载均衡）
  - 数据库可迁移到托管服务

阶段 3: 需要高可用时（100+ 并发用户）
→ Docker Swarm 或迁移到轻量 K8s（k3s）
  - 2-3 节点集群
  - 服务自动恢复
  - 滚动更新
  - 内置负载均衡

阶段 4: 大规模（极少企业需要）
→ Kubernetes (k3s / managed K8s)
  - 自动扩缩容
  - 完善的监控生态
  - GitOps 工作流
```

### T.3 从 Compose 平滑迁移到 Swarm

```yaml
# docker-compose.swarm.yml
# 同一个 Compose 文件，添加 Swarm deploy 配置
# docker stack deploy -c docker-compose.swarm.yml hr

version: "3.8"

services:
  app:
    image: registry.ivis-sh.com:5000/hr-backend:latest
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        order: start-first
      rollback_config:
        parallelism: 0
        order: stop-first
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
      placement:
        constraints:
          - node.role == worker
    environment:
      NODE_ENV: production
      PORT: "3001"
    secrets:
      - db_url
      - minimax_key
      - imap_pass
    networks:
      - frontend
      - backend
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 30s

  postgres:
    image: pgvector/pgvector:pg17
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      resources:
        limits:
          cpus: "2.0"
          memory: 1G
    volumes:
      - postgres_data:/var/lib/postgresql/data
    secrets:
      - db_password
    environment:
      POSTGRES_DB: hr_screening
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    networks:
      - backend

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
    configs:
      - source: nginx_conf
        target: /etc/nginx/conf.d/default.conf
    networks:
      - frontend

secrets:
  db_url:
    external: true
  db_password:
    external: true
  minimax_key:
    external: true
  imap_pass:
    external: true

configs:
  nginx_conf:
    file: ./nginx/default.conf

networks:
  frontend:
    driver: overlay
  backend:
    driver: overlay
    internal: true

volumes:
  postgres_data:
    driver: local
```

### T.4 Swarm 初始化与密钥配置

```bash
#!/bin/bash
# scripts/swarm-init.sh
# 初始化 Docker Swarm 集群并配置密钥

set -euo pipefail

echo "=== Docker Swarm 初始化 ==="

# 1. 初始化 Swarm（在 manager 节点执行）
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
  echo "Initializing Swarm manager..."
  docker swarm init --advertise-addr "$(hostname -I | awk '{print $1}')"
  echo ""
  echo "Worker join token:"
  docker swarm join-token worker -q
else
  echo "Swarm already active"
fi

# 2. 创建 secrets
echo ""
echo "=== 创建 Docker Secrets ==="

create_secret() {
  local name="$1"
  local value="$2"
  if docker secret inspect "$name" &>/dev/null; then
    echo "  Secret '$name' already exists, skipping"
  else
    echo "$value" | docker secret create "$name" -
    echo "  ✓ Created secret: $name"
  fi
}

# 从 .env 读取（仅在首次部署时）
if [ -f .env.production ]; then
  source .env.production

  create_secret "db_url" "$DATABASE_URL"
  create_secret "db_password" "$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')"
  create_secret "minimax_key" "$MINIMAX_API_KEY"
  create_secret "imap_pass" "$IMAP_PASS"
else
  echo "⚠️  .env.production not found"
  echo "Create secrets manually:"
  echo '  echo "your-db-url" | docker secret create db_url -'
  echo '  echo "your-api-key" | docker secret create minimax_key -'
fi

# 3. 创建 overlay 网络
echo ""
echo "=== 创建网络 ==="
for net in frontend backend; do
  if ! docker network inspect "$net" &>/dev/null; then
    docker network create --driver overlay --attachable "$net"
    echo "  ✓ Created network: $net"
  else
    echo "  Network '$net' already exists"
  fi
done

echo ""
echo "=== 部署 ==="
echo "docker stack deploy -c docker-compose.swarm.yml hr"
```

### T.5 从 Compose 迁移到 k3s (轻量 Kubernetes)

```bash
#!/bin/bash
# scripts/k3s-install.sh
# k3s 安装（如果未来需要迁移到 Kubernetes）
# k3s 是最轻量的 K8s 发行版，适合小团队

set -euo pipefail

echo "=== 安装 k3s ==="

# 1. 安装 k3s（单节点，禁用 traefik 使用自己的 nginx）
curl -sfL https://get.k3s.io | sh -s - \
  --disable traefik \
  --write-kubeconfig-mode 644

# 2. 等待就绪
echo "Waiting for k3s to be ready..."
until kubectl get nodes | grep -q "Ready"; do
  sleep 2
done
echo "✓ k3s is ready"

# 3. 查看节点状态
kubectl get nodes -o wide

echo ""
echo "=== 下一步 ==="
echo "1. 转换 Docker Compose → K8s manifests:"
echo "   kompose convert -f docker-compose.yml"
echo "2. 或使用 Helm chart"
echo "3. kubectl apply -f k8s/"
```

### T.6 K8s Manifest 示例（参考）

```yaml
# k8s/deployment.yml
# HR Backend Kubernetes 部署配置（仅供参考，当前阶段不需要）

apiVersion: apps/v1
kind: Deployment
metadata:
  name: hr-backend
  labels:
    app: hr-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: hr-backend
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: hr-backend
    spec:
      containers:
        - name: hr-backend
          image: registry.ivis-sh.com:5000/hr-backend:latest
          ports:
            - containerPort: 3001
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "3001"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: hr-secrets
                  key: database-url
            - name: MINIMAX_API_KEY
              valueFrom:
                secretKeyRef:
                  name: hr-secrets
                  key: minimax-api-key
          resources:
            requests:
              cpu: 250m
              memory: 128Mi
            limits:
              cpu: "1"
              memory: 512Mi
          readinessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 15
            periodSeconds: 20
      imagePullSecrets:
        - name: registry-creds

---
apiVersion: v1
kind: Service
metadata:
  name: hr-backend
spec:
  selector:
    app: hr-backend
  ports:
    - port: 80
      targetPort: 3001
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hr-backend
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - hr-api.ivis-sh.com
      secretName: hr-backend-tls
  rules:
    - host: hr-api.ivis-sh.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: hr-backend
                port:
                  number: 80
```

### T.7 编排方案决策树

```
                    需要容器编排吗？
                         │
                    ┌────┴────┐
                    │ 单机够用？│
                    └────┬────┘
                   Yes/    \No
                  /          \
          Docker Compose    需要高可用？
          (当前选择)        │
                      ┌────┴────┐
                     Yes       No → Docker Compose
                      │            + 手动多实例
                      │
                  团队有 K8s 经验？
                      │
                 ┌────┴────┐
                Yes        No
                 │          │
             k3s/K8s    Docker Swarm
                          (更简单)
```

---

## 附录 U: Docker Compose V2 高级特性

### U.1 Watch 模式（开发热重载）

```yaml
# docker-compose.yml
# Docker Compose Watch: 文件变更自动同步到容器

services:
  app:
    build: .
    ports:
      - "3001:3001"
    develop:
      watch:
        # 源码变更 → 同步到容器（不重建）
        - action: sync
          path: ./src
          target: /app/src
          ignore:
            - "**/*.test.ts"

        # package.json 变更 → 重建容器
        - action: rebuild
          path: ./package.json

        # 配置文件变更 → 重启容器
        - action: sync+restart
          path: ./drizzle.config.ts
          target: /app/drizzle.config.ts
```

```bash
# 使用 watch 模式启动
docker compose watch

# 等价于（旧版本）:
docker compose up --watch
```

### U.2 Compose Profiles 高级用法

```yaml
# docker-compose.yml
# 使用 profiles 管理不同环境的服务组合

services:
  # 核心服务（所有环境都启动）
  app:
    build:
      context: .
      target: ${BUILD_TARGET:-development}
    ports:
      - "${PORT:-3001}:3001"
    environment:
      NODE_ENV: ${NODE_ENV:-development}

  postgres:
    image: pgvector/pgvector:pg17
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # 仅开发环境
  pgadmin:
    image: dpage/pgadmin4
    profiles: ["dev"]
    ports:
      - "5050:80"
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@ivis-sh.com
      PGADMIN_DEFAULT_PASSWORD: admin

  mailpit:
    image: axllent/mailpit
    profiles: ["dev"]
    ports:
      - "8025:8025"  # Web UI
      - "1025:1025"  # SMTP

  # 仅测试环境
  test-db:
    image: pgvector/pgvector:pg17
    profiles: ["test"]
    tmpfs:
      - /var/lib/postgresql/data
    environment:
      POSTGRES_DB: hr_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test

  # 仅生产环境
  nginx:
    image: nginx:alpine
    profiles: ["prod"]
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx:/etc/nginx/conf.d:ro
      - ./certs:/etc/nginx/certs:ro

  prometheus:
    image: prom/prometheus
    profiles: ["prod", "monitoring"]
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana
    profiles: ["prod", "monitoring"]
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  postgres_data:
  prometheus_data:
  grafana_data:
```

```bash
# 开发环境（核心 + pgadmin + mailpit）
docker compose --profile dev up

# 测试环境（核心 + test-db）
docker compose --profile test up

# 生产环境（核心 + nginx + monitoring）
docker compose --profile prod --profile monitoring up

# 仅监控栈
docker compose --profile monitoring up
```

### U.3 Compose 依赖健康检查

```yaml
# docker-compose.yml
# 精确控制服务启动顺序

services:
  postgres:
    image: pgvector/pgvector:pg17
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d hr_screening"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  migrate:
    build: .
    command: ["bun", "db:migrate"]
    depends_on:
      postgres:
        condition: service_healthy
        restart: true    # 如果 postgres 重启，也重新运行迁移
    restart: "no"        # 运行一次就退出

  app:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully  # 等迁移完成
    restart: unless-stopped
```

### U.4 Compose 扩展字段 (x- extensions)

```yaml
# docker-compose.yml
# 使用 x- 扩展字段减少重复配置

x-common-env: &common-env
  NODE_ENV: ${NODE_ENV:-development}
  TZ: Asia/Shanghai

x-common-healthcheck: &common-healthcheck
  interval: 15s
  timeout: 5s
  retries: 3
  start_period: 30s

x-resource-limits: &resource-limits
  deploy:
    resources:
      limits:
        cpus: "1.0"
        memory: 512M
      reservations:
        cpus: "0.25"
        memory: 128M

x-logging: &default-logging
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "3"
      tag: "{{.Name}}"

services:
  app:
    <<: [*resource-limits, *default-logging]
    build: .
    environment:
      <<: *common-env
      PORT: "3001"
      DATABASE_URL: ${DATABASE_URL}
    healthcheck:
      <<: *common-healthcheck
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health"]

  worker:
    <<: [*resource-limits, *default-logging]
    build: .
    command: ["bun", "src/worker.ts"]
    environment:
      <<: *common-env
      DATABASE_URL: ${DATABASE_URL}
    healthcheck:
      <<: *common-healthcheck
      test: ["CMD", "bun", "-e", "process.exit(0)"]
```

### U.5 多项目共享网络

```yaml
# docker-compose.yml
# HR 前后端 + 共享服务的网络架构

services:
  app:
    build: .
    networks:
      - hr-internal     # 内部通信
      - shared-services # 共享服务

networks:
  hr-internal:
    driver: bridge
    internal: true      # 不暴露到主机

  shared-services:
    # 连接到外部已存在的网络（如其他项目的数据库）
    external: true
    name: infra_shared
```

```bash
# 先创建共享网络
docker network create infra_shared

# HR 后端
cd hr-backend && docker compose up -d

# HR 前端（使用同一个共享网络访问后端）
cd hr-frontend && docker compose up -d
```

### U.6 Docker Init 快速生成配置

```bash
# Docker 官方初始化工具（Docker Desktop 24.0+）
# 自动根据项目类型生成 Dockerfile + compose.yaml + .dockerignore

docker init

# 交互式问答:
# ? What application platform does your project use? Node
# ? What version of Node do you want to use? 22
# ? Which package manager do you want to use? bun
# ? What command do you want to use to start the app? bun start
# ? What port does your server listen on? 3001

# 生成文件:
# - Dockerfile (多阶段构建)
# - compose.yaml
# - .dockerignore

# 注意: 生成的文件是基础模板，需要根据项目需求调整
# HR 项目需要额外添加:
# - pgvector 数据库服务
# - 环境变量配置
# - 健康检查
# - 资源限制
```

---

## 附录 V: Docker 故障排除手册

### V.1 常见错误与解决方案

```
问题 1: 容器启动后立即退出
─────────────────────
症状: docker compose up 后容器状态为 Exited
诊断:
  docker compose logs app
  docker inspect --format='{{.State.ExitCode}}' hr-app

常见原因:
  Exit 1: 应用代码错误（语法错误、缺少环境变量）
  Exit 137: OOM Killed（内存不足）
  Exit 143: SIGTERM（正常关闭）

解决:
  - Exit 1: 检查日志，修复代码或补充 .env
  - Exit 137: 增加 memory limit 或优化内存使用
    deploy:
      resources:
        limits:
          memory: 1G  # 增大限制
  - 确保 .env 中所有必需变量都已设置

问题 2: 数据库连接拒绝
─────────────────────
症状: ECONNREFUSED 127.0.0.1:5432
原因: 容器内 localhost ≠ 主机 localhost

解决:
  - Docker Compose 中使用服务名: postgres (不是 localhost)
  - DATABASE_URL=postgresql://user:pass@postgres:5432/hr
  - 确保 depends_on + healthcheck 正确配置

问题 3: 端口冲突
───────────────
症状: Bind for 0.0.0.0:3001 failed: port is already allocated
诊断:
  lsof -i :3001
  # 或
  ss -tlnp | grep 3001

解决:
  - 停止占用端口的进程
  - 或修改 docker-compose.yml 的端口映射:
    ports:
      - "3002:3001"  # 改用 3002

问题 4: 构建缓存失效
─────────────────
症状: 每次构建都重新安装依赖
原因: Dockerfile 中 COPY . . 放在 npm install 之前

解决:
  # 正确的顺序:
  COPY package.json bun.lock ./
  RUN bun install --frozen-lockfile    # 仅依赖变更时重新安装
  COPY . .                               # 源码变更不影响依赖缓存

问题 5: 镜像体积过大
─────────────────
诊断:
  docker images hr-backend
  docker history hr-backend:latest

解决:
  1. 使用多阶段构建（build → production）
  2. 使用 alpine 基础镜像
  3. 检查 .dockerignore 是否完整
  4. 不要在镜像中包含 devDependencies:
     RUN bun install --production --frozen-lockfile
```

### V.2 调试技巧

```bash
#!/bin/bash
# scripts/docker-debug.sh
# Docker 调试工具集

set -euo pipefail

usage() {
  echo "Usage: $0 {shell|logs|inspect|network|resources|health}"
}

# 进入容器 shell
cmd_shell() {
  local container="${1:-hr-app}"
  echo "Entering container: $container"
  docker exec -it "$container" sh
}

# 查看实时日志
cmd_logs() {
  local container="${1:-}"
  if [ -n "$container" ]; then
    docker compose logs -f "$container"
  else
    docker compose logs -f
  fi
}

# 检查容器详情
cmd_inspect() {
  local container="${1:-hr-app}"
  echo "=== Container: $container ==="
  echo ""
  echo "--- Status ---"
  docker inspect --format='
  State: {{.State.Status}}
  Exit Code: {{.State.ExitCode}}
  Started: {{.State.StartedAt}}
  Health: {{if .State.Health}}{{.State.Health.Status}}{{else}}N/A{{end}}
  ' "$container"

  echo "--- Environment ---"
  docker inspect --format='{{range .Config.Env}}{{println .}}{{end}}' "$container" | \
    grep -v "PASSWORD\|SECRET\|KEY\|TOKEN" || true

  echo "--- Ports ---"
  docker port "$container" 2>/dev/null || echo "No ports"

  echo "--- Resources ---"
  docker stats --no-stream "$container" 2>/dev/null || true
}

# 网络诊断
cmd_network() {
  echo "=== Docker Networks ==="
  docker network ls --format "table {{.Name}}\t{{.Driver}}\t{{.Scope}}"
  echo ""

  echo "=== Network Details ==="
  for net in $(docker network ls --format '{{.Name}}' | grep hr); do
    echo "--- $net ---"
    docker network inspect "$net" --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{"\n"}}{{end}}'
  done

  echo ""
  echo "=== DNS Resolution Test ==="
  docker exec hr-app sh -c "nslookup postgres 2>/dev/null || echo 'DNS lookup failed'" 2>/dev/null || echo "Container not running"
}

# 资源使用情况
cmd_resources() {
  echo "=== Container Resources ==="
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
  echo ""

  echo "=== Disk Usage ==="
  docker system df
  echo ""

  echo "=== Image Sizes ==="
  docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | head -20
}

# 健康检查
cmd_health() {
  echo "=== Service Health ==="
  docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
  echo ""

  echo "=== Health Check Details ==="
  for container in $(docker compose ps -q 2>/dev/null); do
    local name=$(docker inspect --format '{{.Name}}' "$container" | sed 's/\///')
    local health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}' "$container")
    echo "  $name: $health"

    if [ "$health" = "unhealthy" ]; then
      echo "    Last check:"
      docker inspect --format '{{range .State.Health.Log}}{{.ExitCode}}: {{.Output}}{{end}}' "$container" | tail -1
    fi
  done

  echo ""
  echo "=== Application Health ==="
  curl -s http://localhost:3001/health 2>/dev/null | jq . 2>/dev/null || echo "Application not responding"
}

case "${1:-help}" in
  shell)     cmd_shell "${2:-}" ;;
  logs)      cmd_logs "${2:-}" ;;
  inspect)   cmd_inspect "${2:-}" ;;
  network)   cmd_network ;;
  resources) cmd_resources ;;
  health)    cmd_health ;;
  *)         usage ;;
esac
```

### V.3 数据库连接故障排除

```bash
# PostgreSQL 连接调试

# 1. 检查 PostgreSQL 是否运行
docker compose exec postgres pg_isready -U postgres
# 输出: /var/run/postgresql:5432 - accepting connections

# 2. 检查从应用容器能否连接数据库
docker compose exec app sh -c \
  'pg_isready -h postgres -p 5432 -U postgres 2>/dev/null || echo "Cannot connect"'

# 如果 pg_isready 不可用:
docker compose exec app sh -c \
  'echo "SELECT 1;" | timeout 5 nc postgres 5432 && echo "Port open" || echo "Port closed"'

# 3. 检查连接字符串
docker compose exec app sh -c 'echo $DATABASE_URL | sed "s/:.*@/:***@/"'

# 4. 直接在数据库容器中检查
docker compose exec postgres psql -U postgres -d hr_screening -c '\dt'

# 5. 检查数据库是否存在
docker compose exec postgres psql -U postgres -c '\l' | grep hr

# 6. pgvector 扩展检查
docker compose exec postgres psql -U postgres -d hr_screening -c '\dx' | grep vector

# 7. 连接数检查
docker compose exec postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

### V.4 容器资源优化

```yaml
# docker-compose.yml
# 生产环境资源优化配置

services:
  app:
    build: .
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
    # Bun 内存优化
    environment:
      BUN_JSC_forceRAMSize: "402653184"
    # 限制日志大小
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    # 安全加固
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:size=50M

  postgres:
    image: pgvector/pgvector:pg17
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 1G
        reservations:
          cpus: "0.5"
          memory: 256M
    # PostgreSQL 调优
    command: >
      postgres
      -c shared_buffers=256MB
      -c effective_cache_size=512MB
      -c work_mem=4MB
      -c maintenance_work_mem=64MB
      -c max_connections=50
      -c log_min_duration_statement=200
    shm_size: "256mb"
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"
```

### V.5 镜像优化检查清单

```bash
#!/bin/bash
# scripts/image-audit.sh
# 检查 Docker 镜像优化状况

IMAGE="${1:-hr-backend:latest}"

echo "=== Docker Image Audit: $IMAGE ==="

# 1. 镜像大小
SIZE=$(docker image inspect "$IMAGE" --format '{{.Size}}' 2>/dev/null)
if [ -z "$SIZE" ]; then
  echo "Error: Image $IMAGE not found"
  exit 1
fi
SIZE_MB=$((SIZE / 1024 / 1024))
echo "Image size: ${SIZE_MB}MB"
if [ "$SIZE_MB" -gt 500 ]; then
  echo "  ⚠️  Image is larger than 500MB, consider optimization"
elif [ "$SIZE_MB" -gt 200 ]; then
  echo "  🟡  Image is ${SIZE_MB}MB, could be smaller"
else
  echo "  ✓  Image size is reasonable"
fi

# 2. 层数
LAYERS=$(docker image inspect "$IMAGE" --format '{{len .RootFS.Layers}}')
echo "Layers: $LAYERS"
if [ "$LAYERS" -gt 15 ]; then
  echo "  ⚠️  Too many layers, consider combining RUN commands"
fi

# 3. 基础镜像检查
BASE=$(docker image inspect "$IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.base.name"}}' 2>/dev/null || echo "unknown")
echo "Base image: $BASE"

# 4. 历史检查（查看大层）
echo ""
echo "=== Layer History ==="
docker history "$IMAGE" --format "table {{.CreatedBy}}\t{{.Size}}" --no-trunc 2>/dev/null | \
  head -20 | while read -r line; do
    size=$(echo "$line" | awk '{print $NF}')
    if echo "$size" | grep -qE '^[0-9]+MB$'; then
      num=$(echo "$size" | sed 's/MB//')
      if [ "$num" -gt 50 ]; then
        echo "  ⚠️  $line"
      else
        echo "  $line"
      fi
    else
      echo "  $line"
    fi
  done

# 5. 安全扫描（如果有 Trivy）
if command -v trivy &>/dev/null; then
  echo ""
  echo "=== Security Scan ==="
  trivy image --severity HIGH,CRITICAL --no-progress "$IMAGE" 2>/dev/null | tail -20
fi

echo ""
echo "=== Recommendations ==="
echo "1. Use multi-stage build (build → production)"
echo "2. Use alpine or distroless base image"
echo "3. Ensure .dockerignore excludes: node_modules, .git, .env, docs, test"
echo "4. Install only production dependencies: bun install --production"
echo "5. Use --mount=type=cache for build caching"
```

---

## 附录 W: 生产环境运维自动化

### W.1 系统健康检查脚本

```bash
#!/bin/bash
# scripts/health-monitor.sh
# 全面的系统健康检查（可用于 cron 定时运行）

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"  # 飞书/钉钉 Webhook

STATUS="OK"
ISSUES=()

check() {
  local name="$1"
  local cmd="$2"
  local expected="${3:-}"

  local result
  result=$(eval "$cmd" 2>&1) || {
    STATUS="CRITICAL"
    ISSUES+=("$name: FAILED - $result")
    echo "  ✗ $name: FAILED"
    return
  }

  if [ -n "$expected" ] && [[ "$result" != *"$expected"* ]]; then
    STATUS="WARNING"
    ISSUES+=("$name: UNEXPECTED - got '$result', expected '$expected'")
    echo "  ⚠ $name: UNEXPECTED"
    return
  fi

  echo "  ✓ $name: OK"
}

echo "=== System Health Check $(date) ==="

# 1. 应用健康
echo "--- Application ---"
check "API Health" "curl -sf $BACKEND_URL/health | jq -r '.status'" "ok"
check "API Response Time" "curl -sf -o /dev/null -w '%{time_total}' $BACKEND_URL/health"

# 2. Docker 服务
echo "--- Docker Services ---"
check "Docker daemon" "docker info --format '{{.ServerVersion}}'"
check "App container" "docker compose ps app --format '{{.Status}}'" "Up"
check "Postgres container" "docker compose ps postgres --format '{{.Status}}'" "Up"

# 3. 数据库
echo "--- Database ---"
check "DB connection" "docker compose exec -T postgres pg_isready -U postgres"
check "DB size" "docker compose exec -T postgres psql -U postgres -d hr_screening -t -c 'SELECT pg_size_pretty(pg_database_size(current_database()));'"
check "Active connections" "docker compose exec -T postgres psql -U postgres -t -c 'SELECT count(*) FROM pg_stat_activity;'"

# 4. 磁盘空间
echo "--- Disk ---"
DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
check "Root disk (<80%)" "echo $DISK_USAGE" ""
if [ "$DISK_USAGE" -gt 80 ]; then
  STATUS="WARNING"
  ISSUES+=("Disk usage: ${DISK_USAGE}%")
fi

# Docker disk
DOCKER_USAGE=$(docker system df --format '{{.Size}}' | head -1)
echo "  Docker disk usage: $DOCKER_USAGE"

# 5. 内存
echo "--- Memory ---"
MEM_USED=$(free -m | awk 'NR==2{printf "%d", $3/$2*100}')
check "Memory (<85%)" "echo ${MEM_USED}%"
if [ "$MEM_USED" -gt 85 ]; then
  STATUS="WARNING"
  ISSUES+=("Memory usage: ${MEM_USED}%")
fi

# 6. SSL 证书（如果有）
echo "--- SSL ---"
if [ -f /etc/letsencrypt/live/*/fullchain.pem ]; then
  CERT_EXPIRY=$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/*/fullchain.pem | cut -d= -f2)
  CERT_DAYS=$(( ( $(date -d "$CERT_EXPIRY" +%s) - $(date +%s) ) / 86400 ))
  check "SSL cert (>14 days)" "echo ${CERT_DAYS} days"
  if [ "$CERT_DAYS" -lt 14 ]; then
    STATUS="WARNING"
    ISSUES+=("SSL cert expires in ${CERT_DAYS} days")
  fi
else
  echo "  - SSL: No certificate found (skipped)"
fi

# 汇总
echo ""
echo "=== Status: $STATUS ==="

if [ ${#ISSUES[@]} -gt 0 ]; then
  echo "Issues:"
  for issue in "${ISSUES[@]}"; do
    echo "  - $issue"
  done

  # 发送告警（如果配置了 Webhook）
  if [ -n "$ALERT_WEBHOOK" ] && [ "$STATUS" != "OK" ]; then
    ALERT_MSG="HR Backend Health Alert: $STATUS\n\nIssues:\n$(printf '- %s\n' "${ISSUES[@]}")"
    curl -sf -X POST "$ALERT_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"$ALERT_MSG\"}}" \
      >/dev/null 2>&1 || true
  fi
fi
```

### W.2 自动清理脚本

```bash
#!/bin/bash
# scripts/auto-cleanup.sh
# 自动清理 Docker 资源和旧日志

set -euo pipefail

echo "=== Auto Cleanup $(date) ==="

# 1. 清理未使用的 Docker 资源
echo "--- Docker Cleanup ---"
echo "Before:"
docker system df

# 清理停止的容器
docker container prune -f

# 清理悬挂的镜像
docker image prune -f

# 清理未使用的网络
docker network prune -f

# 清理构建缓存（保留最近 7 天）
docker builder prune -f --filter "until=168h"

echo "After:"
docker system df

# 2. 清理旧日志
echo ""
echo "--- Log Cleanup ---"
LOG_DIR="/var/log/hr-backend"
if [ -d "$LOG_DIR" ]; then
  find "$LOG_DIR" -name "*.log" -mtime +30 -delete
  find "$LOG_DIR" -name "*.log.gz" -mtime +90 -delete
  echo "Cleaned logs older than 30 days"
fi

# 3. 清理旧备份（保留最近 30 天）
echo ""
echo "--- Backup Cleanup ---"
BACKUP_DIR="/data/backups"
if [ -d "$BACKUP_DIR" ]; then
  BEFORE=$(du -sh "$BACKUP_DIR" | cut -f1)
  find "$BACKUP_DIR" -name "*.sql" -mtime +30 -delete
  find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
  AFTER=$(du -sh "$BACKUP_DIR" | cut -f1)
  echo "Backups: $BEFORE -> $AFTER"
fi

# 4. 清理临时文件
echo ""
echo "--- Temp Cleanup ---"
TEMP_DIR="/tmp/hr-*"
find /tmp -name "hr-*" -mtime +1 -delete 2>/dev/null || true
echo "Cleaned temp files"

echo ""
echo "=== Cleanup Complete ==="
```

### W.3 Cron 定时任务配置

```bash
# /etc/cron.d/hr-backend
# HR 后端定时任务

# 每 5 分钟健康检查
*/5 * * * * root /opt/hr-backend/scripts/health-monitor.sh >> /var/log/hr-backend/health.log 2>&1

# 每天凌晨 2 点数据库备份
0 2 * * * root /opt/hr-backend/scripts/db-backup.sh >> /var/log/hr-backend/backup.log 2>&1

# 每天凌晨 3 点自动清理
0 3 * * * root /opt/hr-backend/scripts/auto-cleanup.sh >> /var/log/hr-backend/cleanup.log 2>&1

# 每周一早上 9 点 SSL 证书续期检查
0 9 * * 1 root certbot renew --quiet --deploy-hook "docker compose -f /opt/hr-backend/docker-compose.yml restart nginx"

# 每小时轮转日志
0 * * * * root docker compose -f /opt/hr-backend/docker-compose.yml logs --tail=0 > /dev/null 2>&1
```

### W.4 数据库自动备份

```bash
#!/bin/bash
# scripts/db-backup.sh
# PostgreSQL 数据库自动备份（支持本地 + 远程存储）

set -euo pipefail

BACKUP_DIR="/data/backups/postgres"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="hr_screening"

mkdir -p "$BACKUP_DIR"

echo "=== Database Backup: $DATE ==="

# 1. 执行备份
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${DATE}.sql.gz"

docker compose exec -T postgres \
  pg_dump -U postgres -d "$DB_NAME" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-acl \
  > "$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# 2. 验证备份完整性
docker compose exec -T postgres \
  pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1 && \
  echo "Backup verification: OK" || \
  echo "⚠️  Backup verification: FAILED"

# 3. 清理旧备份
DELETED=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
echo "Cleaned $DELETED backups older than $RETENTION_DAYS days"

# 4. 可选: 上传到远程存储
# if command -v rclone &>/dev/null; then
#   rclone copy "$BACKUP_FILE" remote:hr-backups/postgres/
#   echo "Uploaded to remote storage"
# fi

# 5. 显示备份统计
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "Total backups: $TOTAL_BACKUPS, Total size: $TOTAL_SIZE"

echo "=== Backup Complete ==="
```

### W.5 零停机部署流程

```bash
#!/bin/bash
# scripts/zero-downtime-deploy.sh
# 零停机部署: 使用蓝绿部署策略

set -euo pipefail

IMAGE="${1:?Usage: zero-downtime-deploy.sh <image-tag>}"
REGISTRY="${REGISTRY_URL:-registry.ivis-sh.com:5000}"
FULL_IMAGE="$REGISTRY/hr-backend:$IMAGE"

echo "=== Zero-Downtime Deploy: $IMAGE ==="

# 1. 拉取新镜像
echo "Pulling new image..."
docker pull "$FULL_IMAGE"

# 2. 备份当前数据库
echo "Creating pre-deploy backup..."
./scripts/db-backup.sh

# 3. 运行数据库迁移（如果需要）
echo "Running migrations..."
docker run --rm --network hr-backend_default \
  -e DATABASE_URL="$DATABASE_URL" \
  "$FULL_IMAGE" \
  bun db:migrate

# 4. 启动新容器（不影响旧容器）
echo "Starting new container..."
docker compose up -d --no-deps --scale app=2 app

# 5. 等待新容器健康
echo "Waiting for new container to be healthy..."
for i in $(seq 1 60); do
  HEALTHY=$(docker compose ps app --format json | jq -r '.Health' | grep -c "healthy" || true)
  if [ "$HEALTHY" -ge 2 ]; then
    echo "Both containers healthy"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "⚠️  New container not healthy after 60s, rolling back..."
    docker compose up -d --no-deps --scale app=1 app
    exit 1
  fi
  sleep 1
done

# 6. 缩减到 1 个容器（新版本）
echo "Scaling down to single container..."
docker compose up -d --no-deps --scale app=1 app

# 7. 最终健康检查
sleep 3
if curl -sf http://localhost:3001/health | jq -r '.status' | grep -q "ok"; then
  echo "✓ Deploy successful: $IMAGE"

  # 清理旧镜像
  docker image prune -f --filter "dangling=true"
else
  echo "⚠️  Post-deploy health check failed!"
  echo "Check logs: docker compose logs app"
fi
```

---

## 附录 X: Docker 多环境配置管理

### X.1 环境分层架构

```
Docker 配置分层:

docker-compose.yml          ← 基础配置（所有环境共用）
├── docker-compose.dev.yml  ← 开发环境覆盖
├── docker-compose.test.yml ← 测试环境覆盖
├── docker-compose.prod.yml ← 生产环境覆盖
└── docker-compose.ci.yml   ← CI 环境覆盖

使用方法:
  开发: docker compose -f docker-compose.yml -f docker-compose.dev.yml up
  测试: docker compose -f docker-compose.yml -f docker-compose.test.yml up
  生产: docker compose -f docker-compose.yml -f docker-compose.prod.yml up
  CI:   docker compose -f docker-compose.yml -f docker-compose.ci.yml up
```

### X.2 基础配置

```yaml
# docker-compose.yml - 基础配置
# 定义所有服务的基本结构，不包含环境特定配置

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - NODE_ENV
      - DATABASE_URL
    networks:
      - hr-network

  postgres:
    image: pgvector/pgvector:pg16
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - hr-network

volumes:
  pg-data:

networks:
  hr-network:
    driver: bridge
```

### X.3 开发环境

```yaml
# docker-compose.dev.yml - 开发环境覆盖

services:
  app:
    build:
      target: development  # 多阶段构建的开发目标
    ports:
      - "3001:3001"        # 暴露 API 端口
      - "9229:9229"        # Bun 调试端口
    volumes:
      - .:/app             # 源码挂载（热重载）
      - /app/node_modules  # 排除 node_modules
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:devpass@postgres:5432/hr_dev
      - LOG_LEVEL=debug
    command: ["bun", "run", "--watch", "src/index.ts"]  # bun 热重载
    develop:
      watch:                   # Docker Compose Watch
        - action: sync
          path: ./src
          target: /app/src
        - action: rebuild
          path: ./package.json

  postgres:
    ports:
      - "5432:5432"         # 直接访问数据库
    environment:
      POSTGRES_DB: hr_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: devpass

  # 开发专用: 邮件测试服务
  mailhog:
    image: mailhog/mailhog
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI
    networks:
      - hr-network

  # 开发专用: Drizzle Studio
  drizzle-studio:
    image: oven/bun:1-alpine
    working_dir: /app
    volumes:
      - .:/app
    ports:
      - "4983:4983"
    environment:
      - DATABASE_URL=postgresql://postgres:devpass@postgres:5432/hr_dev
    command: ["bun", "x", "drizzle-kit", "studio"]
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - hr-network
```

### X.4 测试环境

```yaml
# docker-compose.test.yml - 测试环境覆盖

services:
  app:
    build:
      target: builder  # 包含 devDependencies
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgresql://postgres:testpass@postgres:5432/hr_test
      - MINIMAX_API_KEY=test-mock-key
      - IMAP_HOST=localhost
      - IMAP_PORT=993
    command: ["bun", "test:ci"]

  postgres:
    environment:
      POSTGRES_DB: hr_test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: testpass
    # 测试环境: 使用 tmpfs 加速
    tmpfs:
      - /var/lib/postgresql/data
    # 不需要持久化 volume
    volumes: []
```

### X.5 生产环境

```yaml
# docker-compose.prod.yml - 生产环境覆盖

services:
  app:
    build:
      target: production
    ports:
      - "127.0.0.1:3001:3001"  # 只绑定 localhost（通过 Nginx 代理）
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    env_file:
      - .env.production   # 敏感信息从文件加载
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 1024M
        reservations:
          cpus: "0.5"
          memory: 256M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

  postgres:
    environment:
      POSTGRES_DB: hr_production
    env_file:
      - .env.production
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2048M
    volumes:
      - pg-data-prod:/var/lib/postgresql/data
    # 生产: 不暴露端口
    ports: []

  # 生产专用: Nginx 反向代理
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
    depends_on:
      - app
    networks:
      - hr-network
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 128M

  # 生产专用: Redis 缓存
  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    networks:
      - hr-network
    deploy:
      resources:
        limits:
          memory: 256M

volumes:
  pg-data-prod:
    driver: local
  redis-data:
    driver: local
```

### X.6 CI 环境

```yaml
# docker-compose.ci.yml - CI 流水线专用

services:
  app:
    build:
      target: builder
      cache_from:
        - type=registry,ref=registry.keiten-jp.com/hr/backend:buildcache
      cache_to:
        - type=registry,ref=registry.keiten-jp.com/hr/backend:buildcache,mode=max
    environment:
      - NODE_ENV=test
      - CI=true
      - DATABASE_URL=postgresql://postgres:cipass@postgres:5432/hr_ci
      - MINIMAX_API_KEY=ci-mock-key

  postgres:
    environment:
      POSTGRES_DB: hr_ci
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: cipass
    tmpfs:
      - /var/lib/postgresql/data
    volumes: []
```

### X.7 环境切换脚本

```bash
#!/bin/bash
# scripts/docker-env.sh
# Docker 多环境快捷命令

set -euo pipefail

COMMAND="${1:-help}"
ENV="${2:-dev}"

BASE="docker compose -f docker-compose.yml"

case "$ENV" in
  dev)   COMPOSE="$BASE -f docker-compose.dev.yml" ;;
  test)  COMPOSE="$BASE -f docker-compose.test.yml" ;;
  prod)  COMPOSE="$BASE -f docker-compose.prod.yml" ;;
  ci)    COMPOSE="$BASE -f docker-compose.ci.yml" ;;
  *)
    echo "Unknown environment: $ENV"
    echo "Available: dev, test, prod, ci"
    exit 1
    ;;
esac

case "$COMMAND" in
  up)
    echo "Starting $ENV environment..."
    $COMPOSE up -d
    echo "Services started. Logs: $0 logs $ENV"
    ;;
  down)
    echo "Stopping $ENV environment..."
    $COMPOSE down
    ;;
  logs)
    $COMPOSE logs -f --tail=50
    ;;
  build)
    echo "Building $ENV images..."
    $COMPOSE build --no-cache
    ;;
  restart)
    $COMPOSE restart
    ;;
  ps)
    $COMPOSE ps
    ;;
  exec)
    shift 2
    $COMPOSE exec app "$@"
    ;;
  shell)
    $COMPOSE exec app sh
    ;;
  db)
    case "$ENV" in
      dev)  $COMPOSE exec postgres psql -U postgres hr_dev ;;
      test) $COMPOSE exec postgres psql -U postgres hr_test ;;
      prod) $COMPOSE exec postgres psql -U postgres hr_production ;;
    esac
    ;;
  clean)
    echo "Cleaning $ENV environment (including volumes)..."
    $COMPOSE down -v --remove-orphans
    ;;
  help|*)
    cat << 'EOF'
Docker Environment Manager

Usage: ./scripts/docker-env.sh <command> <env>

Commands:
  up       Start environment
  down     Stop environment
  logs     Follow logs
  build    Rebuild images
  restart  Restart services
  ps       List containers
  exec     Execute command in app container
  shell    Open shell in app container
  db       Connect to PostgreSQL
  clean    Remove everything (including data)

Environments:
  dev      Development (hot-reload, debug port, mailhog)
  test     Testing (tmpfs DB, mock keys)
  prod     Production (nginx, redis, resource limits)
  ci       CI pipeline (build cache, tmpfs DB)

Examples:
  ./scripts/docker-env.sh up dev
  ./scripts/docker-env.sh logs prod
  ./scripts/docker-env.sh exec dev bun test
  ./scripts/docker-env.sh db dev
EOF
    ;;
esac
```

### X.8 多阶段 Dockerfile（完整版）

```dockerfile
# Dockerfile - 多阶段构建（支持所有环境）

# ===== Stage 1: Base =====
FROM oven/bun:1-alpine AS base
WORKDIR /app
COPY package.json bun.lock ./

# ===== Stage 2: Dependencies =====
FROM base AS deps
RUN bun install --frozen-lockfile

# ===== Stage 3: Development =====
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3001 9229
CMD ["bun", "run", "--watch", "src/index.ts"]

# ===== Stage 4: Builder =====
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run tsc --noEmit
RUN bun build ./src/index.ts --outdir ./dist --target bun

# ===== Stage 5: Production =====
FROM base AS production
ENV NODE_ENV=production
RUN bun install --frozen-lockfile --production
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle

# Non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
USER appuser

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["bun", "src/index.ts"]
```

---

## 附录 Y: Docker 安全加固

### Y.1 容器安全扫描

```bash
#!/bin/bash
# scripts/docker-security-scan.sh
# Docker 镜像安全扫描

set -euo pipefail

IMAGE="${1:?Usage: docker-security-scan.sh <image:tag>}"

echo "🔒 Security Scan: ${IMAGE}"
echo "=" .repeat(60)

# ===== 1. Trivy 漏洞扫描 =====
echo ""
echo "--- Trivy Vulnerability Scan ---"
if command -v trivy &> /dev/null; then
  trivy image --severity CRITICAL,HIGH --exit-code 0 "${IMAGE}"

  # 生成 JSON 报告
  trivy image --format json --output trivy-report.json "${IMAGE}"
  CRITICAL=$(cat trivy-report.json | jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="CRITICAL")] | length')
  HIGH=$(cat trivy-report.json | jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="HIGH")] | length')
  echo "Summary: ${CRITICAL} Critical, ${HIGH} High"
else
  echo "Trivy not installed. Install: https://trivy.dev"
fi

# ===== 2. Docker Scout (Docker Desktop 内置) =====
echo ""
echo "--- Docker Scout ---"
if docker scout version &> /dev/null 2>&1; then
  docker scout cves "${IMAGE}" --only-severity critical,high
else
  echo "Docker Scout not available"
fi

# ===== 3. 镜像层分析 =====
echo ""
echo "--- Image Layer Analysis ---"
docker history --no-trunc --format "table {{.Size}}\t{{.CreatedBy}}" "${IMAGE}" | head -20

# ===== 4. 安全最佳实践检查 =====
echo ""
echo "--- Security Best Practices ---"

# 检查是否以 root 运行
USER=$(docker inspect "${IMAGE}" --format '{{.Config.User}}')
if [ -z "${USER}" ] || [ "${USER}" = "root" ]; then
  echo "⚠️  Container runs as root. Add USER directive."
else
  echo "✅ Non-root user: ${USER}"
fi

# 检查是否有 HEALTHCHECK
HEALTHCHECK=$(docker inspect "${IMAGE}" --format '{{.Config.Healthcheck}}')
if [ "${HEALTHCHECK}" = "<nil>" ]; then
  echo "⚠️  No HEALTHCHECK defined."
else
  echo "✅ HEALTHCHECK configured."
fi

# 检查暴露端口
PORTS=$(docker inspect "${IMAGE}" --format '{{json .Config.ExposedPorts}}')
echo "📡 Exposed ports: ${PORTS}"

# 检查环境变量（查找敏感信息泄露）
echo ""
echo "--- Environment Variables Check ---"
docker inspect "${IMAGE}" --format '{{range .Config.Env}}{{println .}}{{end}}' | while read -r var; do
  KEY=$(echo "$var" | cut -d= -f1)
  VALUE=$(echo "$var" | cut -d= -f2-)
  if echo "$KEY" | grep -qiE '(password|secret|key|token)'; then
    echo "⚠️  Sensitive env var found: ${KEY}=***"
  fi
done

echo ""
echo "Scan complete."
```

### Y.2 运行时安全配置

```yaml
# docker-compose.security.yml
# 安全加固覆盖配置（可叠加到任何环境）

services:
  app:
    # 只读文件系统
    read_only: true
    tmpfs:
      - /tmp
      - /app/uploads  # 上传目录可写

    # 安全选项
    security_opt:
      - no-new-privileges:true

    # 能力限制（移除所有，按需添加）
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE  # 绑定端口

    # 资源限制
    ulimits:
      nofile:
        soft: 65536
        hard: 65536
      nproc:
        soft: 4096
        hard: 4096

    # 系统调用过滤
    sysctls:
      - net.ipv4.ip_unprivileged_port_start=0

  postgres:
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - DAC_OVERRIDE
      - FOWNER
      - SETGID
      - SETUID
```

### Y.3 Docker Secrets 管理

```yaml
# docker-compose.secrets.yml
# 使用 Docker Secrets（适用于 Swarm 模式或 Compose 3.x）

services:
  app:
    secrets:
      - db_password
      - minimax_api_key
      - imap_password
    environment:
      # 应用从文件读取 secrets
      - DB_PASSWORD_FILE=/run/secrets/db_password
      - MINIMAX_API_KEY_FILE=/run/secrets/minimax_api_key
      - IMAP_PASS_FILE=/run/secrets/imap_password

  postgres:
    secrets:
      - db_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt     # 开发: 从文件
    # external: true                    # 生产: 从 Swarm secret store
  minimax_api_key:
    file: ./secrets/minimax_api_key.txt
  imap_password:
    file: ./secrets/imap_password.txt
```

### Y.4 应用读取 Docker Secrets

```typescript
// src/lib/secrets.ts
// 从 Docker Secrets 文件或环境变量读取敏感配置

import { readFileSync, existsSync } from "fs";

/**
 * 优先从 Docker Secret 文件读取，否则回退到环境变量
 *
 * Docker Secrets 以文件形式挂载在 /run/secrets/ 目录
 * 比环境变量更安全（环境变量可能泄露到日志或进程列表）
 */
export function getSecret(name: string): string {
  // 1. 检查 _FILE 环境变量（Docker Secrets 标准模式）
  const fileEnvKey = `${name}_FILE`;
  const filePath = process.env[fileEnvKey];

  if (filePath && existsSync(filePath)) {
    return readFileSync(filePath, "utf-8").trim();
  }

  // 2. 检查标准 Docker Secrets 路径
  const defaultPath = `/run/secrets/${name.toLowerCase()}`;
  if (existsSync(defaultPath)) {
    return readFileSync(defaultPath, "utf-8").trim();
  }

  // 3. 回退到环境变量
  const envValue = process.env[name];
  if (envValue) {
    return envValue;
  }

  throw new Error(
    `Secret '${name}' not found. Checked: ${fileEnvKey} env, /run/secrets/${name.toLowerCase()}, ${name} env`
  );
}

// 使用示例（在 env.ts 中）:
// DATABASE_URL: getSecret("DATABASE_URL"),
// MINIMAX_API_KEY: getSecret("MINIMAX_API_KEY"),
```

### Y.5 网络安全配置

```yaml
# docker-compose.network-security.yml
# 网络隔离配置

services:
  app:
    networks:
      - frontend   # Nginx ↔ App
      - backend    # App ↔ Database
    # 禁止 app 容器访问外部网络（仅允许 MiniMax API）
    # 注: 需要额外的 iptables 规则来实现精细控制

  postgres:
    networks:
      - backend    # 只在后端网络
    # 数据库完全隔离，不暴露任何端口

  nginx:
    networks:
      - frontend   # 只在前端网络
    ports:
      - "443:443"  # 只暴露 HTTPS

  redis:
    networks:
      - backend    # 只在后端网络

networks:
  frontend:
    driver: bridge
    internal: false  # 允许外部访问
  backend:
    driver: bridge
    internal: true   # 纯内部网络（无法访问外网）
```

### Y.6 安全审计日志

```typescript
// src/lib/docker-audit.ts
// 容器安全审计

/**
 * 容器安全 Checklist（运行时检查）
 */
export async function containerSecurityAudit(): Promise<{
  checks: Array<{
    name: string;
    status: "pass" | "fail" | "warn";
    detail: string;
  }>;
  score: number;
}> {
  const checks: Array<{
    name: string;
    status: "pass" | "fail" | "warn";
    detail: string;
  }> = [];

  // 1. 非 root 运行
  const uid = process.getuid?.();
  checks.push({
    name: "Non-root user",
    status: uid !== undefined && uid !== 0 ? "pass" : "fail",
    detail: `UID: ${uid ?? "unknown"}`,
  });

  // 2. 环境变量无明文密码
  const sensitiveKeys = Object.keys(process.env).filter((k) =>
    /password|secret|key|token/i.test(k)
  );
  const plainTextSecrets = sensitiveKeys.filter(
    (k) => !k.endsWith("_FILE") && process.env[k] && process.env[k]!.length < 100
  );
  checks.push({
    name: "No plaintext secrets in env",
    status: plainTextSecrets.length === 0 ? "pass" : "warn",
    detail:
      plainTextSecrets.length > 0
        ? `Found: ${plainTextSecrets.join(", ")}`
        : "All secrets use _FILE pattern or are not present",
  });

  // 3. NODE_ENV 正确设置
  checks.push({
    name: "NODE_ENV is production",
    status: process.env.NODE_ENV === "production" ? "pass" : "warn",
    detail: `NODE_ENV=${process.env.NODE_ENV || "not set"}`,
  });

  // 4. 调试端口未开放
  const debugPort = process.env.BUN_CONFIG_VERBOSE;
  checks.push({
    name: "Debug port disabled",
    status: !debugPort ? "pass" : "fail",
    detail: debugPort ? "Bun debug mode is enabled!" : "Not enabled",
  });

  // 5. 文件系统权限
  const fs = await import("fs/promises");
  let readOnly = false;
  try {
    await fs.writeFile("/app/test-write", "test");
    await fs.unlink("/app/test-write");
    readOnly = false;
  } catch {
    readOnly = true;
  }
  checks.push({
    name: "Read-only filesystem",
    status: readOnly ? "pass" : "warn",
    detail: readOnly ? "Filesystem is read-only" : "Filesystem is writable",
  });

  // 计算得分
  const passCount = checks.filter((c) => c.status === "pass").length;
  const score = Math.round((passCount / checks.length) * 100);

  return { checks, score };
}
```

---

## 附录 Z: Docker 日志管理与监控集成

### Z.1 结构化日志配置

```yaml
# docker-compose.logging.yml
# 日志管理覆盖配置

services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"
        tag: "hr-backend/{{.Name}}/{{.ID}}"
        labels: "service,environment"
        env: "NODE_ENV"
    labels:
      service: "hr-backend"
      environment: "${NODE_ENV:-development}"

  postgres:
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "5"
        tag: "hr-postgres/{{.Name}}"
    labels:
      service: "hr-postgres"

  # Loki: 日志聚合
  loki:
    image: grafana/loki:3.0.0
    ports:
      - "3100:3100"
    volumes:
      - loki-data:/loki
      - ./config/loki.yml:/etc/loki/config.yml:ro
    command: -config.file=/etc/loki/config.yml
    networks:
      - hr-network
    deploy:
      resources:
        limits:
          memory: 512M

  # Promtail: 日志收集代理
  promtail:
    image: grafana/promtail:3.0.0
    volumes:
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - ./config/promtail.yml:/etc/promtail/config.yml:ro
    command: -config.file=/etc/promtail/config.yml
    depends_on:
      - loki
    networks:
      - hr-network

  # Grafana: 可视化
  grafana:
    image: grafana/grafana:11.0.0
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./config/grafana/provisioning:/etc/grafana/provisioning:ro
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
    depends_on:
      - loki
    networks:
      - hr-network

volumes:
  loki-data:
  grafana-data:
```

### Z.2 Loki 配置

```yaml
# config/loki.yml
# Loki 日志存储配置

auth_enabled: false

server:
  http_listen_port: 3100
  log_level: warn

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 30d         # 保留 30 天日志
  max_query_lookback: 30d
  ingestion_rate_mb: 10
  ingestion_burst_size_mb: 20

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_cancel_period: 10m
```

### Z.3 Promtail 配置

```yaml
# config/promtail.yml
# Promtail 日志收集配置

server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # Docker 容器日志
  - job_name: docker
    static_configs:
      - targets:
          - localhost
        labels:
          job: docker
          __path__: /var/lib/docker/containers/*/*-json.log

    pipeline_stages:
      # Docker JSON 日志解析
      - docker: {}

      # 从容器标签提取服务名
      - labels:
          service:
          environment:

      # 识别 JSON 格式日志（应用结构化日志）
      - match:
          selector: '{job="docker"}'
          stages:
            - json:
                expressions:
                  level: level
                  component: component
                  message: message
                  traceId: traceId
            - labels:
                level:
                component:
            - output:
                source: message

      # 日志级别过滤: 生产环境只保留 info 以上
      - match:
          selector: '{environment="production", level="debug"}'
          action: drop
```

### Z.4 Grafana Dashboard 配置

```json
{
  "dashboard": {
    "title": "HR Backend - Operations Dashboard",
    "panels": [
      {
        "title": "Request Rate",
        "type": "timeseries",
        "datasource": "Loki",
        "targets": [
          {
            "expr": "rate({service=\"hr-backend\"} |= \"\" [5m])",
            "legendFormat": "requests/s"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "stat",
        "datasource": "Loki",
        "targets": [
          {
            "expr": "sum(rate({service=\"hr-backend\", level=\"error\"} [5m])) / sum(rate({service=\"hr-backend\"} [5m])) * 100",
            "legendFormat": "error %"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "steps": [
                { "color": "green", "value": 0 },
                { "color": "yellow", "value": 1 },
                { "color": "red", "value": 5 }
              ]
            },
            "unit": "percent"
          }
        }
      },
      {
        "title": "AI Scoring Latency",
        "type": "timeseries",
        "datasource": "Loki",
        "targets": [
          {
            "expr": "{service=\"hr-backend\", component=\"ai-scorer\"} |~ \"duration\" | json | unwrap duration_ms [5m] | quantile_over_time(0.95, ) by ()",
            "legendFormat": "p95 latency"
          }
        ]
      },
      {
        "title": "Recent Errors",
        "type": "logs",
        "datasource": "Loki",
        "targets": [
          {
            "expr": "{service=\"hr-backend\", level=\"error\"}"
          }
        ]
      },
      {
        "title": "Container Memory Usage",
        "type": "gauge",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "container_memory_usage_bytes{name=~\"hr.*\"} / container_spec_memory_limit_bytes{name=~\"hr.*\"} * 100"
          }
        ]
      },
      {
        "title": "Scoring Grade Distribution",
        "type": "piechart",
        "datasource": "Loki",
        "targets": [
          {
            "expr": "sum by (grade) (count_over_time({service=\"hr-backend\", component=\"ai-scorer\"} |~ \"grade\" | json [24h]))"
          }
        ]
      }
    ]
  }
}
```

### Z.5 Prometheus 指标导出

```typescript
// src/lib/metrics-exporter.ts
// Prometheus 格式指标导出

import { agentMetrics, METRICS } from "./agent-metrics.js";

/**
 * 生成 Prometheus 文本格式指标
 * 供 Prometheus scrape
 */
export function generatePrometheusMetrics(): string {
  const lines: string[] = [];
  const allMetrics = agentMetrics.exportAll();

  // Counters
  for (const [key, value] of Object.entries(allMetrics.counters)) {
    const [name, labelsJson] = key.split(":");
    const labels = labelsJson ? JSON.parse(labelsJson) : {};
    const labelStr = formatLabels(labels);

    lines.push(`# TYPE ${sanitizeName(name)} counter`);
    lines.push(`${sanitizeName(name)}${labelStr} ${value}`);
  }

  // Histograms (简化为 summary)
  for (const [key, summary] of Object.entries(allMetrics.histograms)) {
    const [name] = key.split(":");
    const sName = sanitizeName(name);

    lines.push(`# TYPE ${sName} summary`);
    lines.push(`${sName}_count ${summary.count}`);
    lines.push(`${sName}_sum ${summary.sum}`);
    lines.push(`${sName}{quantile="0.5"} ${summary.p50}`);
    lines.push(`${sName}{quantile="0.95"} ${summary.p95}`);
    lines.push(`${sName}{quantile="0.99"} ${summary.p99}`);
  }

  // Gauges
  for (const [key, point] of Object.entries(allMetrics.gauges)) {
    const [name] = key.split(":");
    lines.push(`# TYPE ${sanitizeName(name)} gauge`);
    lines.push(`${sanitizeName(name)} ${point.value}`);
  }

  return lines.join("\n") + "\n";
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_:]/g, "_");
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  const parts = entries.map(([k, v]) => `${k}="${v}"`);
  return `{${parts.join(",")}}`;
}
```

### Z.6 指标路由

```typescript
// src/routes/metrics.ts
// Prometheus 指标端点

import { Elysia } from "elysia";
import { generatePrometheusMetrics } from "../lib/metrics-exporter.js";

const app = new Elysia();

// GET /metrics - Prometheus 抓取端点
app.get("/", (c) => {
  const metrics = generatePrometheusMetrics();
  return c.text(metrics, 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
  });
});

export default app;
```

### Z.7 Docker 容器资源监控脚本

```bash
#!/bin/bash
# scripts/container-monitor.sh
# 容器资源使用率实时监控

set -euo pipefail

INTERVAL="${1:-5}"  # 默认5秒刷新

echo "Container Resource Monitor (refresh: ${INTERVAL}s)"
echo "Press Ctrl+C to exit"
echo ""

while true; do
  clear
  echo "=== HR Backend Container Monitor ==="
  echo "$(date '+%Y-%m-%d %H:%M:%S')"
  echo ""

  # Docker stats（非交互模式）
  docker stats --no-stream --format \
    "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" \
    $(docker compose ps -q 2>/dev/null) 2>/dev/null || echo "(no containers running)"

  echo ""

  # 健康检查状态
  echo "--- Health Status ---"
  docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}" 2>/dev/null || true

  echo ""

  # 磁盘使用
  echo "--- Disk Usage ---"
  docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}" 2>/dev/null || true

  echo ""

  # 应用健康
  echo "--- App Health ---"
  HEALTH=$(curl -sf http://localhost:3001/health 2>/dev/null || echo '{"status":"unreachable"}')
  echo "  API: $(echo $HEALTH | jq -r '.status' 2>/dev/null || echo 'unknown')"

  # 数据库连接
  DB_OK=$(docker compose exec -T postgres pg_isready -U postgres 2>/dev/null && echo "ok" || echo "error")
  echo "  Database: ${DB_OK}"

  sleep "${INTERVAL}"
done
```

### Z.8 告警规则配置

```yaml
# config/alerting-rules.yml
# Grafana 告警规则

groups:
  - name: hr-backend-alerts
    rules:
      # 1. 应用错误率 > 5%
      - alert: HighErrorRate
        expr: |
          sum(rate({service="hr-backend", level="error"} [5m]))
          / sum(rate({service="hr-backend"} [5m]))
          > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "HR Backend error rate above 5%"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # 2. 容器内存 > 80%
      - alert: HighMemoryUsage
        expr: |
          container_memory_usage_bytes{name=~"hr.*"}
          / container_spec_memory_limit_bytes{name=~"hr.*"}
          > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Container {{ $labels.name }} memory above 80%"

      # 3. AI 评分延迟 > 10s (p95)
      - alert: HighScoringLatency
        expr: |
          histogram_quantile(0.95,
            rate(agent_scoring_duration_ms_bucket[5m])
          ) > 10000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "AI scoring p95 latency above 10s"

      # 4. 数据库连接池耗尽
      - alert: DatabaseConnectionPoolExhausted
        expr: |
          pg_stat_activity_count{datname="hr_production"}
          / pg_settings_max_connections
          > 0.9
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Database connection pool above 90%"

      # 5. 应用健康检查失败
      - alert: AppUnhealthy
        expr: |
          probe_success{job="hr-backend-health"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "HR Backend health check failing"
```

---

## 附录 AA: Docker Compose 开发体验优化

### AA.1 一键开发环境

```bash
#!/bin/bash
# scripts/dev-start.sh
# 一键启动完整开发环境

set -euo pipefail

echo "🚀 Starting HR Backend Development Environment"
echo ""

# 1. 检查依赖
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  echo "❌ Docker not installed"
  exit 1
fi

if ! command -v bun &> /dev/null; then
  echo "❌ bun not installed. Run: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

if ! docker info &> /dev/null 2>&1; then
  echo "❌ Docker daemon not running"
  exit 1
fi

echo "✅ All prerequisites met"

# 2. 环境文件
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "⚠️  Please edit .env with your actual configuration"
fi

# 3. 安装依赖
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  bun install
fi

# 4. 启动 Docker 服务
echo "Starting Docker services..."
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 5. 等待数据库就绪
echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres &> /dev/null; then
    echo "✅ PostgreSQL ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "❌ PostgreSQL not ready after 30s"
    exit 1
  fi
  sleep 1
done

# 6. 运行数据库迁移
echo "Running database migrations..."
bun db:migrate 2>/dev/null || echo "⚠️  No migrations to run (or command not configured)"

# 7. 启动应用
echo ""
echo "=================================="
echo "🎉 Development environment ready!"
echo ""
echo "Services:"
echo "  API:           http://localhost:3001"
echo "  Health:        http://localhost:3001/health"
echo "  PostgreSQL:    localhost:5432"
echo "  MailHog SMTP:  localhost:1025"
echo "  MailHog UI:    http://localhost:8025"
echo ""
echo "Commands:"
echo "  bun dev       Start API server (with hot-reload)"
echo "  bun test      Run tests"
echo "  bun lint      Lint code"
echo "  bun db:studio Open Drizzle Studio"
echo ""
echo "To stop:"
echo "  docker compose -f docker-compose.yml -f docker-compose.dev.yml down"
echo "=================================="
```

### AA.2 VS Code Dev Container

```jsonc
// .devcontainer/devcontainer.json
// VS Code Remote Container 开发环境

{
  "name": "HR Backend Dev",
  "dockerComposeFile": [
    "../docker-compose.yml",
    "../docker-compose.dev.yml",
    "docker-compose.devcontainer.yml"
  ],
  "service": "app",
  "workspaceFolder": "/app",

  // VS Code 设置
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next",
        "cweijan.vscode-postgresql-client2",
        "humao.rest-client"
      ],
      "settings": {
        "typescript.tsdk": "node_modules/typescript/lib",
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "[typescript]": {
          "editor.defaultFormatter": "esbenp.prettier-vscode"
        }
      }
    }
  },

  // 端口转发
  "forwardPorts": [3001, 5432, 8025, 4983, 9229],

  // 容器创建后运行
  "postCreateCommand": "bun install",

  // 环境变量
  "remoteEnv": {
    "NODE_ENV": "development",
    "DATABASE_URL": "postgresql://postgres:devpass@postgres:5432/hr_dev"
  }
}
```

### AA.3 Dev Container 覆盖配置

```yaml
# .devcontainer/docker-compose.devcontainer.yml
# VS Code Dev Container 专用覆盖

services:
  app:
    build:
      context: ..
      dockerfile: Dockerfile
      target: development
    volumes:
      - ..:/app:cached
      - node_modules:/app/node_modules
    command: sleep infinity  # VS Code 会管理进程
    environment:
      - NODE_ENV=development
      - SHELL=/bin/zsh

    # 安装开发工具
    cap_add:
      - SYS_PTRACE  # 调试需要

volumes:
  node_modules:
```

### AA.4 Docker 开发常见问题解决

```markdown
# Docker 开发常见问题 FAQ

## Q1: hot-reload 不生效
**原因**: 文件系统事件在 Docker volume 挂载时可能丢失
**解决**:
```yaml
# docker-compose.dev.yml
services:
  app:
    environment:
      - CHOKIDAR_USEPOLLING=true  # 强制轮询模式
      - CHOKIDAR_INTERVAL=1000   # 轮询间隔 1s
```
或使用 Docker Compose Watch:
```yaml
    develop:
      watch:
        - action: sync
          path: ./src
          target: /app/src
```

## Q2: node_modules 在容器内和宿主机冲突
**原因**: macOS/Windows 和 Linux 的二进制模块不兼容
**解决**: 使用匿名 volume 隔离:
```yaml
    volumes:
      - .:/app
      - /app/node_modules  # 匿名 volume，不与宿主机共享
```

## Q3: PostgreSQL 数据丢失
**原因**: 使用了 tmpfs 或未配置 named volume
**解决**: 确保使用 named volume:
```yaml
    volumes:
      - pg-data:/var/lib/postgresql/data
volumes:
  pg-data:  # 持久化存储
```

## Q4: 容器无法连接数据库
**原因**: 使用了 localhost 而非 Docker 服务名
**解决**:
```
# 错误: DATABASE_URL=postgresql://localhost:5432/hr
# 正确: DATABASE_URL=postgresql://postgres:5432/hr
# Docker 容器间通过服务名通信，不是 localhost
```

## Q5: 构建缓存失效导致每次都重建
**原因**: COPY . . 导致任何文件变化都触发重建
**解决**: 分层 COPY:
```dockerfile
# 先复制依赖文件（变化少）
COPY package.json bun.lock ./
RUN bun install
# 再复制源码（变化频繁）
COPY . .
```
```

### AA.5 多服务编排启动顺序

```typescript
// scripts/wait-for-services.ts
// 等待所有依赖服务就绪

interface ServiceCheck {
  name: string;
  check: () => Promise<boolean>;
  required: boolean;
}

const services: ServiceCheck[] = [
  {
    name: "PostgreSQL",
    check: async () => {
      try {
        const res = await fetch("http://localhost:5432", {
          signal: AbortSignal.timeout(2000),
        });
        return true;
      } catch {
        // TCP 连接被拒绝也说明端口在监听
        return false;
      }
    },
    required: true,
  },
  {
    name: "MailHog",
    check: async () => {
      try {
        const res = await fetch("http://localhost:8025/api/v2/messages", {
          signal: AbortSignal.timeout(2000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    required: false,
  },
];

async function waitForAll(maxWaitMs: number = 60_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  const pending = new Set(services.map((s) => s.name));

  while (pending.size > 0 && Date.now() < deadline) {
    for (const service of services) {
      if (!pending.has(service.name)) continue;

      const ok = await service.check();
      if (ok) {
        console.log(`  ✅ ${service.name} ready`);
        pending.delete(service.name);
      }
    }

    if (pending.size > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // 检查必须的服务
  for (const service of services) {
    if (service.required && pending.has(service.name)) {
      throw new Error(`Required service '${service.name}' not available`);
    }
    if (!service.required && pending.has(service.name)) {
      console.warn(`  ⚠️  ${service.name} not available (optional)`);
    }
  }
}

console.log("Waiting for services...");
waitForAll()
  .then(() => console.log("All services ready!"))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
```

### AA.6 Docker 开发环境清理

```bash
#!/bin/bash
# scripts/dev-clean.sh
# 清理开发环境（保留数据可选）

set -euo pipefail

MODE="${1:-soft}"

echo "🧹 Cleaning development environment (mode: ${MODE})"

case "$MODE" in
  soft)
    # 只停止容器，保留数据
    docker compose -f docker-compose.yml -f docker-compose.dev.yml down
    echo "✅ Containers stopped. Data preserved."
    ;;

  hard)
    # 停止容器 + 删除数据卷
    docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
    echo "✅ Containers and volumes removed."
    ;;

  full)
    # 彻底清理
    docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --rmi local --remove-orphans
    # 清理 dangling 镜像
    docker image prune -f
    # 清理 build 缓存
    docker builder prune -f
    echo "✅ Full cleanup complete."
    ;;

  *)
    echo "Usage: dev-clean.sh [soft|hard|full]"
    echo ""
    echo "Modes:"
    echo "  soft  Stop containers, keep data (default)"
    echo "  hard  Stop containers, delete volumes"
    echo "  full  Remove everything including images and cache"
    exit 1
    ;;
esac

# 显示剩余空间
echo ""
echo "Docker disk usage:"
docker system df
```

---

## Appendix AB: Docker イメージ最適化 & マルチアーキテクチャビルド

### AB.1 イメージサイズ分析ツール

```bash
#!/bin/bash
# scripts/docker-image-analyze.sh
# Docker イメージのレイヤー分析 & サイズ最適化レポート

set -euo pipefail

IMAGE_NAME="${1:-hr-backend:latest}"
REPORT_FILE="docker-image-report.txt"

echo "=== Docker Image Analysis Report ===" > "$REPORT_FILE"
echo "Image: $IMAGE_NAME" >> "$REPORT_FILE"
echo "Date: $(date -Iseconds)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# --- 基本情報 ---
echo "--- Basic Info ---" >> "$REPORT_FILE"
docker image inspect "$IMAGE_NAME" --format '
Size: {{.Size}} bytes ({{printf "%.1f" (divf .Size 1048576)}} MB)
Created: {{.Created}}
Architecture: {{.Architecture}}
OS: {{.Os}}
Layers: {{len .RootFS.Layers}}
' >> "$REPORT_FILE" 2>/dev/null || echo "Image not found: $IMAGE_NAME" >> "$REPORT_FILE"

# --- レイヤーサイズ内訳 ---
echo "" >> "$REPORT_FILE"
echo "--- Layer Breakdown ---" >> "$REPORT_FILE"
docker history "$IMAGE_NAME" --no-trunc --format "table {{.Size}}\t{{.CreatedBy}}" >> "$REPORT_FILE" 2>/dev/null

# --- 大きいファイル検出 ---
echo "" >> "$REPORT_FILE"
echo "--- Largest Files (Top 20) ---" >> "$REPORT_FILE"
docker run --rm --entrypoint="" "$IMAGE_NAME" \
  find / -type f -size +1M -exec ls -lhS {} \; 2>/dev/null | \
  head -20 >> "$REPORT_FILE" || echo "Cannot inspect files" >> "$REPORT_FILE"

# --- 不要なファイル検出 ---
echo "" >> "$REPORT_FILE"
echo "--- Potentially Unnecessary Files ---" >> "$REPORT_FILE"
docker run --rm --entrypoint="" "$IMAGE_NAME" sh -c '
  echo "=== Cache files ==="
  find / -name "*.cache" -o -name "__pycache__" -o -name ".npm" 2>/dev/null | head -10
  echo ""
  echo "=== Test files in production ==="
  find /app -name "*.test.*" -o -name "*.spec.*" -o -name "test" -type d 2>/dev/null | head -10
  echo ""
  echo "=== Dev dependencies markers ==="
  find /app -name ".eslintrc*" -o -name "tsconfig*.json" -o -name "vitest*" 2>/dev/null | head -10
' >> "$REPORT_FILE" 2>/dev/null || echo "Cannot inspect" >> "$REPORT_FILE"

# --- 最適化推奨 ---
echo "" >> "$REPORT_FILE"
echo "--- Optimization Recommendations ---" >> "$REPORT_FILE"

IMAGE_SIZE=$(docker image inspect "$IMAGE_NAME" --format '{{.Size}}' 2>/dev/null || echo "0")
IMAGE_MB=$((IMAGE_SIZE / 1048576))

if [ "$IMAGE_MB" -gt 500 ]; then
  echo "⚠️  Image is ${IMAGE_MB}MB - consider multi-stage build optimization" >> "$REPORT_FILE"
elif [ "$IMAGE_MB" -gt 200 ]; then
  echo "⚡ Image is ${IMAGE_MB}MB - good, but could be optimized further" >> "$REPORT_FILE"
else
  echo "✅ Image is ${IMAGE_MB}MB - well optimized" >> "$REPORT_FILE"
fi

LAYER_COUNT=$(docker image inspect "$IMAGE_NAME" --format '{{len .RootFS.Layers}}' 2>/dev/null || echo "0")
if [ "$LAYER_COUNT" -gt 15 ]; then
  echo "⚠️  ${LAYER_COUNT} layers - consider merging RUN commands" >> "$REPORT_FILE"
fi

cat "$REPORT_FILE"
echo ""
echo "Report saved to: $REPORT_FILE"
```

### AB.2 最適化 Dockerfile（プロダクション特化）

```dockerfile
# Dockerfile.optimized
# HR Backend - 最適化版（目標: <100MB）

# ========== Stage 1: Dependencies ==========
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# lockfile + package.json のみコピー（キャッシュ効率化）
COPY package.json bun.lock ./

# --frozen-lockfile で再現性保証
RUN bun install --frozen-lockfile

# ========== Stage 2: Build ==========
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# deps からコピー
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# TypeScript コンパイル
RUN bun run tsc --noEmit && \
    echo "TypeScript check passed"

# プロダクション用依存のみ再インストール
RUN bun install --frozen-lockfile --production

# ========== Stage 3: Production ==========
FROM oven/bun:1-alpine AS production

# セキュリティ: 非 root ユーザー
RUN addgroup -g 1001 -S hrapp && \
    adduser -S hrapp -u 1001 -G hrapp

# タイムゾーン設定（中国時間）
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# tini: PID 1 問題解決
RUN apk add --no-cache tini

WORKDIR /app

# プロダクション依存のみコピー
COPY --from=builder --chown=hrapp:hrapp /app/node_modules ./node_modules
COPY --from=builder --chown=hrapp:hrapp /app/package.json ./
COPY --from=builder --chown=hrapp:hrapp /app/src ./src
COPY --from=builder --chown=hrapp:hrapp /app/drizzle ./drizzle

# キャッシュ・ログディレクトリ
RUN mkdir -p /app/logs /app/tmp && \
    chown -R hrapp:hrapp /app/logs /app/tmp

USER hrapp

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3001/health || exit 1

EXPOSE 3001

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

ENTRYPOINT ["tini", "--"]
CMD ["bun", "src/index.ts"]
```

### AB.3 マルチアーキテクチャビルド

```bash
#!/bin/bash
# scripts/docker-multiarch-build.sh
# AMD64 + ARM64 マルチアーキテクチャビルド

set -euo pipefail

REGISTRY="${DOCKER_REGISTRY:-registry.ivis-sh.com}"
IMAGE_NAME="${REGISTRY}/hr-backend"
VERSION="${1:-$(git describe --tags --always 2>/dev/null || echo 'dev')}"
PLATFORMS="linux/amd64,linux/arm64"

echo "=== Multi-Architecture Build ==="
echo "Image: ${IMAGE_NAME}:${VERSION}"
echo "Platforms: ${PLATFORMS}"
echo ""

# --- BuildKit ビルダー作成 ---
BUILDER_NAME="hr-multiarch"
if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  echo "Creating buildx builder: $BUILDER_NAME"
  docker buildx create \
    --name "$BUILDER_NAME" \
    --driver docker-container \
    --platform "$PLATFORMS" \
    --use

  # QEMU エミュレーション有効化（ARM64 on AMD64）
  docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
else
  docker buildx use "$BUILDER_NAME"
fi

# --- ビルド & プッシュ ---
echo ""
echo "Building and pushing..."

docker buildx build \
  --platform "$PLATFORMS" \
  --file Dockerfile.optimized \
  --tag "${IMAGE_NAME}:${VERSION}" \
  --tag "${IMAGE_NAME}:latest" \
  --build-arg BUILD_DATE="$(date -Iseconds)" \
  --build-arg GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
  --build-arg VERSION="$VERSION" \
  --cache-from "type=registry,ref=${IMAGE_NAME}:buildcache" \
  --cache-to "type=registry,ref=${IMAGE_NAME}:buildcache,mode=max" \
  --push \
  .

echo ""
echo "=== Build Complete ==="

# --- マニフェスト確認 ---
echo ""
echo "Image manifest:"
docker buildx imagetools inspect "${IMAGE_NAME}:${VERSION}"
```

### AB.4 Docker BuildKit 高度な機能

```dockerfile
# syntax=docker/dockerfile:1.7

# Dockerfile.buildkit-advanced
# BuildKit 高度機能を活用した Dockerfile

# ========== Stage 1: Dependencies with cache mount ==========
FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./

# BuildKit cache mount: bun cache をビルド間でキャッシュ
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ========== Stage 2: Build with secret mount ==========
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Secret mount: ビルド時に必要なシークレットを安全に渡す
# シークレットはレイヤーに残らない
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    bun install --frozen-lockfile

# TypeScript ビルド
RUN bun run tsc --noEmit

# プロダクション依存のみ
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

# ========== Stage 3: Production ==========
FROM oven/bun:1-alpine AS production

# 必要最小限のパッケージ
RUN apk add --no-cache tini curl

RUN addgroup -g 1001 -S hrapp && \
    adduser -S hrapp -u 1001 -G hrapp

WORKDIR /app

COPY --from=builder --chown=hrapp:hrapp /app/node_modules ./node_modules
COPY --from=builder --chown=hrapp:hrapp /app/package.json ./
COPY --from=builder --chown=hrapp:hrapp /app/src ./src
COPY --from=builder --chown=hrapp:hrapp /app/drizzle ./drizzle

USER hrapp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

EXPOSE 3001

ENV NODE_ENV=production

ENTRYPOINT ["tini", "--"]
CMD ["bun", "src/index.ts"]
```

```bash
# BuildKit シークレット付きビルド
DOCKER_BUILDKIT=1 docker build \
  --secret id=npmrc,src=$HOME/.npmrc \
  -f Dockerfile.buildkit-advanced \
  -t hr-backend:latest \
  .

# BuildKit SSH マウント（プライベートリポジトリ）
DOCKER_BUILDKIT=1 docker build \
  --ssh default=$SSH_AUTH_SOCK \
  -f Dockerfile.buildkit-advanced \
  -t hr-backend:latest \
  .
```

### AB.5 コンテナイメージ Slim 化ツール

```typescript
// src/lib/docker-slim-config.ts
// DockerSlim / Slim.ai 設定生成

interface SlimConfig {
  target: string;
  httpProbe: boolean;
  httpProbePorts: number[];
  includeShell: boolean;
  includePaths: string[];
  excludePatterns: string[];
  continueAfterTimeout: number;
}

export function generateSlimConfig(): SlimConfig {
  return {
    target: "hr-backend:latest",
    httpProbe: true,
    httpProbePorts: [3001],
    includeShell: false, // シェル除外でセキュリティ向上
    includePaths: [
      "/app/src",
      "/app/node_modules",
      "/app/package.json",
      "/app/drizzle",
      "/etc/ssl/certs", // TLS 証明書必須
      "/etc/localtime",  // タイムゾーン
    ],
    excludePatterns: [
      "*.test.*",
      "*.spec.*",
      "*.md",
      "*.map",
      ".git",
      "test/",
      "docs/",
      "__tests__/",
    ],
    continueAfterTimeout: 60,
  };
}

// slim コマンド生成
export function generateSlimCommand(config: SlimConfig): string {
  const args = [
    `slim build`,
    `--target ${config.target}`,
    `--http-probe=${config.httpProbe}`,
    config.httpProbePorts.map((p) => `--http-probe-port ${p}`).join(" "),
    `--include-shell=${config.includeShell}`,
    config.includePaths.map((p) => `--include-path ${p}`).join(" "),
    config.excludePatterns.map((p) => `--exclude-pattern '${p}'`).join(" "),
    `--continue-after ${config.continueAfterTimeout}`,
    `--tag ${config.target.replace(":latest", ":slim")}`,
  ];

  return args.join(" \\\n  ");
}
```

```bash
#!/bin/bash
# scripts/docker-slim.sh
# DockerSlim でイメージを最小化

set -euo pipefail

IMAGE="${1:-hr-backend:latest}"
SLIM_IMAGE="${IMAGE/:latest/:slim}"

echo "=== Slimming Docker Image ==="
echo "Source: $IMAGE"
echo "Target: $SLIM_IMAGE"
echo ""

# イメージサイズ（before）
BEFORE_SIZE=$(docker image inspect "$IMAGE" --format '{{.Size}}')
BEFORE_MB=$((BEFORE_SIZE / 1048576))
echo "Before: ${BEFORE_MB} MB"

# DockerSlim 実行
slim build \
  --target "$IMAGE" \
  --http-probe=true \
  --http-probe-port 3001 \
  --include-shell=false \
  --include-path /app/src \
  --include-path /app/node_modules \
  --include-path /app/package.json \
  --include-path /app/drizzle \
  --include-path /etc/ssl/certs \
  --include-path /etc/localtime \
  --exclude-pattern '*.test.*' \
  --exclude-pattern '*.spec.*' \
  --exclude-pattern '*.md' \
  --exclude-pattern '.git' \
  --continue-after 60 \
  --tag "$SLIM_IMAGE"

# イメージサイズ（after）
AFTER_SIZE=$(docker image inspect "$SLIM_IMAGE" --format '{{.Size}}')
AFTER_MB=$((AFTER_SIZE / 1048576))
REDUCTION=$(( (BEFORE_SIZE - AFTER_SIZE) * 100 / BEFORE_SIZE ))

echo ""
echo "=== Results ==="
echo "Before: ${BEFORE_MB} MB"
echo "After:  ${AFTER_MB} MB"
echo "Reduction: ${REDUCTION}%"

# ヘルスチェック確認
echo ""
echo "Verifying slim image..."
docker run -d --name hr-slim-test -p 3099:3001 "$SLIM_IMAGE"
sleep 5

if curl -sf http://localhost:3099/health >/dev/null; then
  echo "✅ Slim image health check passed"
else
  echo "❌ Slim image health check failed"
fi

docker rm -f hr-slim-test 2>/dev/null
```

### AB.6 Docker レジストリ管理

```typescript
// src/lib/registry-manager.ts
// プライベート Docker Registry 管理

interface RegistryConfig {
  url: string;
  username: string;
  password: string;
}

interface ImageTag {
  name: string;
  tag: string;
  digest: string;
  size: number;
  created: string;
  architecture: string;
}

interface CleanupPolicy {
  keepLatest: number;       // 最新N個を保持
  keepDays: number;         // N日以内を保持
  keepPattern: RegExp;      // パターンに一致するタグを保持
  dryRun: boolean;
}

export class RegistryManager {
  private config: RegistryConfig;

  constructor(config: RegistryConfig) {
    this.config = config;
  }

  // レジストリ認証ヘッダー
  private authHeader(): string {
    const encoded = Buffer.from(
      `${this.config.username}:${this.config.password}`
    ).toString("base64");
    return `Basic ${encoded}`;
  }

  // イメージタグ一覧
  async listTags(repository: string): Promise<string[]> {
    const res = await fetch(
      `${this.config.url}/v2/${repository}/tags/list`,
      {
        headers: {
          Authorization: this.authHeader(),
          Accept: "application/vnd.docker.distribution.manifest.v2+json",
        },
      }
    );

    if (!res.ok) throw new Error(`Registry API error: ${res.status}`);

    const data = (await res.json()) as { tags: string[] };
    return data.tags || [];
  }

  // マニフェスト取得（サイズ・ダイジェスト情報）
  async getManifest(
    repository: string,
    tag: string
  ): Promise<{ digest: string; size: number }> {
    const res = await fetch(
      `${this.config.url}/v2/${repository}/manifests/${tag}`,
      {
        headers: {
          Authorization: this.authHeader(),
          Accept: "application/vnd.docker.distribution.manifest.v2+json",
        },
      }
    );

    if (!res.ok) throw new Error(`Manifest not found: ${repository}:${tag}`);

    const digest = res.headers.get("Docker-Content-Digest") || "";
    const manifest = (await res.json()) as {
      config: { size: number };
      layers: Array<{ size: number }>;
    };
    const size =
      manifest.config.size +
      manifest.layers.reduce((sum, l) => sum + l.size, 0);

    return { digest, size };
  }

  // 古いタグのクリーンアップ
  async cleanup(
    repository: string,
    policy: CleanupPolicy
  ): Promise<{ deleted: string[]; kept: string[] }> {
    const tags = await this.listTags(repository);
    const deleted: string[] = [];
    const kept: string[] = [];

    // タグを日付順でソート（新しい順）
    const tagInfos = await Promise.all(
      tags.map(async (tag) => {
        try {
          const manifest = await this.getManifest(repository, tag);
          return { tag, ...manifest };
        } catch {
          return { tag, digest: "", size: 0 };
        }
      })
    );

    // 保持対象のフィルタリング
    tagInfos.forEach((info, index) => {
      const shouldKeep =
        index < policy.keepLatest || // 最新N個
        policy.keepPattern.test(info.tag); // パターンマッチ

      if (shouldKeep) {
        kept.push(info.tag);
      } else {
        deleted.push(info.tag);
      }
    });

    if (!policy.dryRun) {
      for (const tag of deleted) {
        try {
          const { digest } = await this.getManifest(repository, tag);
          await fetch(
            `${this.config.url}/v2/${repository}/manifests/${digest}`,
            {
              method: "DELETE",
              headers: { Authorization: this.authHeader() },
            }
          );
        } catch (err) {
          console.error(`Failed to delete ${repository}:${tag}:`, err);
        }
      }
    }

    return { deleted, kept };
  }
}
```

```bash
#!/bin/bash
# scripts/registry-cleanup.sh
# Docker Registry 古いイメージの定期クリーンアップ

set -euo pipefail

REGISTRY_URL="${DOCKER_REGISTRY:-https://registry.ivis-sh.com}"
REPOSITORY="hr-backend"
KEEP_LATEST=10
KEEP_PATTERN="^v[0-9]+\.[0-9]+\.[0-9]+$"  # セマンティックバージョンを保持

echo "=== Docker Registry Cleanup ==="
echo "Registry: $REGISTRY_URL"
echo "Repository: $REPOSITORY"
echo "Keep latest: $KEEP_LATEST"
echo ""

# タグ一覧
TAGS=$(curl -sf \
  -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
  "${REGISTRY_URL}/v2/${REPOSITORY}/tags/list" | \
  jq -r '.tags[]' 2>/dev/null || echo "")

if [ -z "$TAGS" ]; then
  echo "No tags found or registry unavailable"
  exit 0
fi

TAG_COUNT=$(echo "$TAGS" | wc -l)
echo "Total tags: $TAG_COUNT"

# セマンティックバージョンタグは保持
KEEP_TAGS=$(echo "$TAGS" | grep -E "$KEEP_PATTERN" || echo "")
DELETE_CANDIDATES=$(echo "$TAGS" | grep -vE "$KEEP_PATTERN" | tail -n +$((KEEP_LATEST + 1)) || echo "")

echo "Tags to keep (semver): $(echo "$KEEP_TAGS" | wc -l)"
echo "Delete candidates: $(echo "$DELETE_CANDIDATES" | wc -l)"

if [ -n "$DELETE_CANDIDATES" ]; then
  echo ""
  echo "Will delete:"
  echo "$DELETE_CANDIDATES" | head -20

  if [ "${DRY_RUN:-true}" = "false" ]; then
    for TAG in $DELETE_CANDIDATES; do
      DIGEST=$(curl -sf \
        -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
        -I "${REGISTRY_URL}/v2/${REPOSITORY}/manifests/${TAG}" | \
        grep -i "Docker-Content-Digest" | awk '{print $2}' | tr -d '\r')

      if [ -n "$DIGEST" ]; then
        curl -sf -X DELETE "${REGISTRY_URL}/v2/${REPOSITORY}/manifests/${DIGEST}"
        echo "Deleted: ${REPOSITORY}:${TAG}"
      fi
    done
    echo ""
    echo "✅ Cleanup complete"
  else
    echo ""
    echo "Dry run mode. Set DRY_RUN=false to actually delete."
  fi
fi
```

### AB.7 Gitea CI マルチアーキテクチャ & 最適化パイプライン

```yaml
# .gitea/workflows/docker-optimized.yml
name: Docker Optimized Build

on:
  push:
    tags:
      - 'v*'

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Analyze Dockerfile
        run: |
          # hadolint: Dockerfile リンター
          docker run --rm -i hadolint/hadolint < Dockerfile.optimized

      - name: Check image size budget
        run: |
          # ビルド & サイズチェック
          docker build -f Dockerfile.optimized -t hr-backend:check .
          SIZE=$(docker image inspect hr-backend:check --format '{{.Size}}')
          SIZE_MB=$((SIZE / 1048576))
          echo "Image size: ${SIZE_MB} MB"

          # 200MB 上限
          if [ "$SIZE_MB" -gt 200 ]; then
            echo "::error::Image size ${SIZE_MB}MB exceeds 200MB budget"
            exit 1
          fi

  build-multiarch:
    runs-on: ubuntu-latest
    needs: analyze
    steps:
      - uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Registry
        uses: docker/login-action@v3
        with:
          registry: registry.ivis-sh.com
          username: ${{ secrets.REGISTRY_USER }}
          password: ${{ secrets.REGISTRY_PASS }}

      - name: Extract version
        id: version
        run: echo "tag=${GITHUB_REF#refs/tags/}" >> "$GITHUB_OUTPUT"

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile.optimized
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            registry.ivis-sh.com/hr-backend:${{ steps.version.outputs.tag }}
            registry.ivis-sh.com/hr-backend:latest
          cache-from: type=registry,ref=registry.ivis-sh.com/hr-backend:buildcache
          cache-to: type=registry,ref=registry.ivis-sh.com/hr-backend:buildcache,mode=max
          build-args: |
            BUILD_DATE=${{ github.event.head_commit.timestamp }}
            GIT_COMMIT=${{ github.sha }}
            VERSION=${{ steps.version.outputs.tag }}

      - name: Verify manifest
        run: |
          docker buildx imagetools inspect \
            registry.ivis-sh.com/hr-backend:${{ steps.version.outputs.tag }}

  cleanup:
    runs-on: ubuntu-latest
    needs: build-multiarch
    steps:
      - uses: actions/checkout@v4

      - name: Cleanup old images
        run: |
          chmod +x scripts/registry-cleanup.sh
          DRY_RUN=false ./scripts/registry-cleanup.sh
```

---

## Appendix AC: Docker ヘルスチェック & 自動復旧

### AC.1 高度なヘルスチェック実装

```typescript
// src/services/health-checker.ts
// 多層ヘルスチェック: liveness / readiness / startup

import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface HealthComponent {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  components: HealthComponent[];
}

// コンポーネント別ヘルスチェック
async function checkDatabase(): Promise<HealthComponent> {
  const start = performance.now();
  try {
    const result = await Promise.race([
      db.execute(sql`SELECT 1 as ok`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DB timeout")), 5000)
      ),
    ]);
    const latency = performance.now() - start;
    return {
      name: "postgresql",
      status: latency > 1000 ? "degraded" : "healthy",
      latencyMs: Math.round(latency),
      details: { connectionPool: "active" },
    };
  } catch (error) {
    return {
      name: "postgresql",
      status: "unhealthy",
      latencyMs: Math.round(performance.now() - start),
      error: (error as Error).message,
    };
  }
}

async function checkDiskSpace(): Promise<HealthComponent> {
  const start = performance.now();
  try {
    const { execSync } = await import("node:child_process");
    const output = execSync("df -h /app 2>/dev/null || df -h / 2>/dev/null", {
      timeout: 3000,
    }).toString();

    const lines = output.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    const parts = lastLine.split(/\s+/);
    const usagePercent = parseInt(parts[4]?.replace("%", "") || "0", 10);

    return {
      name: "disk",
      status: usagePercent > 90 ? "unhealthy" : usagePercent > 80 ? "degraded" : "healthy",
      latencyMs: Math.round(performance.now() - start),
      details: {
        total: parts[1],
        used: parts[2],
        available: parts[3],
        usagePercent: `${usagePercent}%`,
      },
    };
  } catch {
    return {
      name: "disk",
      status: "healthy",
      latencyMs: Math.round(performance.now() - start),
      details: { note: "Unable to check disk (container)" },
    };
  }
}

async function checkMemory(): Promise<HealthComponent> {
  const start = performance.now();
  const mem = process.memoryUsage();
  const heapUsedMB = mem.heapUsed / 1024 / 1024;
  const heapTotalMB = mem.heapTotal / 1024 / 1024;
  const heapPercent = (heapUsedMB / heapTotalMB) * 100;

  return {
    name: "memory",
    status: heapPercent > 90 ? "unhealthy" : heapPercent > 75 ? "degraded" : "healthy",
    latencyMs: Math.round(performance.now() - start),
    details: {
      heapUsed: `${heapUsedMB.toFixed(1)}MB`,
      heapTotal: `${heapTotalMB.toFixed(1)}MB`,
      rss: `${(mem.rss / 1024 / 1024).toFixed(1)}MB`,
      external: `${(mem.external / 1024 / 1024).toFixed(1)}MB`,
      heapPercent: `${heapPercent.toFixed(1)}%`,
    },
  };
}

async function checkEventLoop(): Promise<HealthComponent> {
  const start = performance.now();

  const eventLoopLatency = await new Promise<number>((resolve) => {
    const before = performance.now();
    setImmediate(() => {
      resolve(performance.now() - before);
    });
  });

  return {
    name: "event_loop",
    status: eventLoopLatency > 100 ? "unhealthy" : eventLoopLatency > 50 ? "degraded" : "healthy",
    latencyMs: Math.round(performance.now() - start),
    details: {
      eventLoopDelayMs: eventLoopLatency.toFixed(2),
    },
  };
}

// 統合ヘルスチェック
export async function getHealthReport(): Promise<HealthReport> {
  const components = await Promise.all([
    checkDatabase(),
    checkMemory(),
    checkDiskSpace(),
    checkEventLoop(),
  ]);

  // 全体ステータス判定
  const hasUnhealthy = components.some((c) => c.status === "unhealthy");
  const hasDegraded = components.some((c) => c.status === "degraded");

  return {
    status: hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION || "dev",
    components,
  };
}

// Liveness: プロセスが生きているか
export async function livenessCheck(): Promise<{
  status: "ok" | "error";
}> {
  return { status: "ok" };
}

// Readiness: リクエスト受付可能か
export async function readinessCheck(): Promise<{
  status: "ready" | "not_ready";
  reason?: string;
}> {
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "ready" };
  } catch (error) {
    return {
      status: "not_ready",
      reason: `Database unavailable: ${(error as Error).message}`,
    };
  }
}

// Startup: 初期化完了しているか
let startupComplete = false;
export function markStartupComplete(): void {
  startupComplete = true;
}
export function startupCheck(): { status: "started" | "starting" } {
  return { status: startupComplete ? "started" : "starting" };
}
```

### AC.2 ヘルスチェックルート

```typescript
// src/routes/health.ts
// Kubernetes / Docker 対応ヘルスチェックルート

import { Elysia } from "elysia";
import {
  getHealthReport,
  livenessCheck,
  readinessCheck,
  startupCheck,
} from "../services/health-checker.js";

const app = new Elysia();

// GET /health - 詳細ヘルスレポート
app.get("/", async (c) => {
  const report = await getHealthReport();
  const statusCode = report.status === "healthy" ? 200 : report.status === "degraded" ? 200 : 503;
  return c.json(report, statusCode);
});

// GET /health/live - Liveness Probe（Docker HEALTHCHECK / K8s livenessProbe）
app.get("/live", async (c) => {
  const result = await livenessCheck();
  return c.json(result, result.status === "ok" ? 200 : 503);
});

// GET /health/ready - Readiness Probe（K8s readinessProbe）
app.get("/ready", async (c) => {
  const result = await readinessCheck();
  return c.json(result, result.status === "ready" ? 200 : 503);
});

// GET /health/startup - Startup Probe（K8s startupProbe）
app.get("/startup", async (c) => {
  const result = startupCheck();
  return c.json(result, result.status === "started" ? 200 : 503);
});

export default app;
```

### AC.3 Docker Compose ヘルスチェック設定

```yaml
# docker-compose.healthcheck.yml
# ヘルスチェック強化 Overlay

services:
  hr-backend:
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health/live"]
      interval: 15s
      timeout: 5s
      start_period: 30s
      retries: 3
    deploy:
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 5
        window: 120s
    labels:
      - "com.hr-backend.health.endpoint=/health"
      - "com.hr-backend.health.ready=/health/ready"

  postgres:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d hr_screening"]
      interval: 10s
      timeout: 5s
      start_period: 15s
      retries: 5

  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
```

### AC.4 自動復旧スクリプト

```bash
#!/bin/bash
# scripts/auto-recovery.sh
# Docker コンテナの自動復旧 & 通知

set -euo pipefail

SERVICE="hr-backend"
COMPOSE_FILE="docker-compose.yml"
HEALTH_URL="http://localhost:3001/health"
MAX_RETRIES=3
RETRY_DELAY=10
LOG_FILE="/var/log/hr-backend-recovery.log"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"
}

notify() {
  local message="$1"
  local severity="${2:-info}"

  log "[$severity] $message"

  # Slack 通知（オプション）
  if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    local color
    case "$severity" in
      error)   color="#FF0000" ;;
      warning) color="#FFA500" ;;
      *)       color="#36A64F" ;;
    esac

    curl -sf -X POST "$SLACK_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{
        \"attachments\": [{
          \"color\": \"$color\",
          \"title\": \"HR Backend Alert\",
          \"text\": \"$message\",
          \"ts\": $(date +%s)
        }]
      }" || true
  fi
}

check_health() {
  local response
  local status_code

  response=$(curl -sf -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

  if [ "$response" = "200" ]; then
    return 0
  else
    return 1
  fi
}

recover_service() {
  log "Attempting service recovery..."

  # 1. コンテナ再起動
  log "Restarting container..."
  docker compose -f "$COMPOSE_FILE" restart "$SERVICE"
  sleep "$RETRY_DELAY"

  if check_health; then
    notify "Service recovered after restart" "info"
    return 0
  fi

  # 2. コンテナ再作成
  log "Recreating container..."
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate "$SERVICE"
  sleep "$RETRY_DELAY"

  if check_health; then
    notify "Service recovered after recreate" "warning"
    return 0
  fi

  # 3. 全サービス再起動
  log "Full stack restart..."
  docker compose -f "$COMPOSE_FILE" down
  docker compose -f "$COMPOSE_FILE" up -d
  sleep $((RETRY_DELAY * 2))

  if check_health; then
    notify "Service recovered after full restart" "warning"
    return 0
  fi

  notify "Service recovery FAILED after all attempts" "error"
  return 1
}

# メインループ
main() {
  local consecutive_failures=0

  log "Starting health monitor for $SERVICE"

  while true; do
    if check_health; then
      if [ "$consecutive_failures" -gt 0 ]; then
        log "Service is healthy again (was failing for $consecutive_failures checks)"
        consecutive_failures=0
      fi
    else
      consecutive_failures=$((consecutive_failures + 1))
      log "Health check failed ($consecutive_failures/$MAX_RETRIES)"

      if [ "$consecutive_failures" -ge "$MAX_RETRIES" ]; then
        notify "Health check failed $consecutive_failures times, attempting recovery" "error"
        if recover_service; then
          consecutive_failures=0
        else
          # 復旧失敗: 次のサイクルで再試行
          consecutive_failures=0
          sleep 60
        fi
      fi
    fi

    sleep 30
  done
}

main
```

### AC.5 Systemd サービスファイル（Docker 外運用）

```ini
# /etc/systemd/system/hr-backend-monitor.service
# ヘルスモニター & 自動復旧 Systemd サービス

[Unit]
Description=HR Backend Health Monitor
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/hr-backend
ExecStart=/opt/hr-backend/scripts/auto-recovery.sh
Restart=always
RestartSec=10

# 環境変数
Environment="COMPOSE_FILE=/opt/hr-backend/docker-compose.yml"
Environment="HEALTH_URL=http://localhost:3001/health"

# ログ
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hr-monitor

[Install]
WantedBy=multi-user.target
```

```bash
# Systemd サービス登録
sudo systemctl daemon-reload
sudo systemctl enable hr-backend-monitor
sudo systemctl start hr-backend-monitor
sudo systemctl status hr-backend-monitor
```

---

## Appendix AD: Docker ゼロダウンタイムデプロイ & ブルーグリーン

### AD.1 ブルーグリーンデプロイ

```bash
#!/bin/bash
# scripts/blue-green-deploy.sh
# Docker Compose ブルーグリーンデプロイ

set -euo pipefail

IMAGE="${1:?Usage: $0 <image:tag>}"
HEALTH_URL="http://localhost:3001/health"
NGINX_CONF="/etc/nginx/conf.d/hr-backend.conf"
DEPLOY_LOG="/var/log/hr-backend-deploy.log"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$DEPLOY_LOG"
}

# --- 現在のアクティブカラー判定 ---
get_active_color() {
  if docker ps --format '{{.Names}}' | grep -q "hr-backend-blue"; then
    if docker inspect hr-backend-blue --format '{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy"; then
      echo "blue"
      return
    fi
  fi
  echo "green"
}

ACTIVE=$(get_active_color)
if [ "$ACTIVE" = "blue" ]; then
  NEXT="green"
  NEXT_PORT=3002
  ACTIVE_PORT=3001
else
  NEXT="blue"
  NEXT_PORT=3001
  ACTIVE_PORT=3002
fi

log "=== Blue-Green Deploy ==="
log "Active: $ACTIVE (port $ACTIVE_PORT)"
log "Deploying: $NEXT (port $NEXT_PORT)"
log "Image: $IMAGE"

# --- Step 1: 新バージョン起動 ---
log "Starting $NEXT container..."

docker run -d \
  --name "hr-backend-${NEXT}" \
  --network hr-network \
  -p "${NEXT_PORT}:3001" \
  -e NODE_ENV=production \
  -e DATABASE_URL="${DATABASE_URL}" \
  -e MINIMAX_API_KEY="${MINIMAX_API_KEY}" \
  --health-cmd="wget -q --spider http://localhost:3001/health/ready || exit 1" \
  --health-interval=5s \
  --health-timeout=3s \
  --health-retries=10 \
  --health-start-period=15s \
  --restart=unless-stopped \
  "$IMAGE"

# --- Step 2: ヘルスチェック待機 ---
log "Waiting for $NEXT to become healthy..."

MAX_WAIT=60
WAITED=0

while [ "$WAITED" -lt "$MAX_WAIT" ]; do
  STATUS=$(docker inspect "hr-backend-${NEXT}" --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

  if [ "$STATUS" = "healthy" ]; then
    log "✅ $NEXT is healthy"
    break
  fi

  WAITED=$((WAITED + 2))
  sleep 2
done

if [ "$WAITED" -ge "$MAX_WAIT" ]; then
  log "❌ $NEXT failed health check, rolling back"
  docker rm -f "hr-backend-${NEXT}" 2>/dev/null
  exit 1
fi

# --- Step 3: Nginx 切り替え ---
log "Switching Nginx to $NEXT..."

cat > "$NGINX_CONF" << NGINX_EOF
upstream hr_backend {
    server 127.0.0.1:${NEXT_PORT};
}

server {
    listen 80;
    server_name hr-api.ivis-sh.com;

    location / {
        proxy_pass http://hr_backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /health {
        proxy_pass http://hr_backend;
        access_log off;
    }
}
NGINX_EOF

# Nginx リロード（ダウンタイムゼロ）
nginx -t && nginx -s reload
log "Nginx switched to $NEXT"

# --- Step 4: 旧バージョン停止 ---
log "Stopping old $ACTIVE container..."
sleep 5  # 進行中リクエストの完了を待つ

docker rm -f "hr-backend-${ACTIVE}" 2>/dev/null || true

log "=== Deploy Complete ==="
log "Active: $NEXT (port $NEXT_PORT)"
```

### AD.2 ローリングアップデート (Docker Compose)

```yaml
# docker-compose.rolling.yml
# ローリングアップデート設定

services:
  hr-backend:
    image: registry.ivis-sh.com/hr-backend:${TAG:-latest}
    deploy:
      replicas: 3
      update_config:
        parallelism: 1          # 1コンテナずつ更新
        delay: 10s              # 更新間隔
        failure_action: rollback
        monitor: 30s            # ヘルスチェック監視時間
        max_failure_ratio: 0.3  # 30% 以上失敗でロールバック
        order: start-first      # 新コンテナ起動後に旧停止
      rollback_config:
        parallelism: 0          # 全コンテナ同時ロールバック
        delay: 0s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health/ready"]
      interval: 10s
      timeout: 5s
      start_period: 20s
      retries: 3
    networks:
      - hr-network
    environment:
      - NODE_ENV=production

  # Nginx ロードバランサー
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      hr-backend:
        condition: service_healthy
    networks:
      - hr-network

networks:
  hr-network:
    driver: bridge
```

```nginx
# nginx/nginx.conf
# Nginx ロードバランサー設定

upstream hr_backend {
    # Docker DNS でサービスディスカバリ
    server hr-backend:3001;

    # ヘルスチェック（nginx plus なら active check）
    # OSS 版は passive チェック
    keepalive 32;
}

server {
    listen 80;
    server_name hr-api.ivis-sh.com;

    # ヘルスチェック用（アクセスログなし）
    location /health {
        proxy_pass http://hr_backend;
        access_log off;
    }

    # API ルート
    location /api/ {
        proxy_pass http://hr_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_http_version 1.1;

        # タイムアウト
        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;

        # バッファリング
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
    }

    # SSE ストリーミング用
    location /api/streaming/ {
        proxy_pass http://hr_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        chunked_transfer_encoding on;
    }

    # ファイルアップロード（サイズ制限）
    location /api/resumes/upload {
        proxy_pass http://hr_backend;
        client_max_body_size 10m;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### AD.3 デプロイスクリプト（統合版）

```bash
#!/bin/bash
# scripts/deploy.sh
# 統合デプロイスクリプト

set -euo pipefail

COMMAND="${1:-help}"
TAG="${2:-latest}"
REGISTRY="registry.ivis-sh.com"
IMAGE="${REGISTRY}/hr-backend:${TAG}"

case "$COMMAND" in
  build)
    echo "Building ${IMAGE}..."
    docker build -f Dockerfile.optimized -t "$IMAGE" .
    echo "✅ Built: $IMAGE"
    ;;

  push)
    echo "Pushing ${IMAGE}..."
    docker push "$IMAGE"
    echo "✅ Pushed: $IMAGE"
    ;;

  deploy)
    echo "Deploying ${IMAGE}..."

    # イメージ取得
    docker pull "$IMAGE"

    # Blue-Green デプロイ
    ./scripts/blue-green-deploy.sh "$IMAGE"
    ;;

  rollback)
    echo "Rolling back..."

    # 直前のイメージタグを取得
    PREV_TAG=$(docker images --format '{{.Tag}}' "${REGISTRY}/hr-backend" | \
      grep -v latest | sort -rV | head -2 | tail -1)

    if [ -z "$PREV_TAG" ]; then
      echo "❌ No previous version found"
      exit 1
    fi

    echo "Rolling back to: ${REGISTRY}/hr-backend:${PREV_TAG}"
    ./scripts/blue-green-deploy.sh "${REGISTRY}/hr-backend:${PREV_TAG}"
    ;;

  status)
    echo "=== Deployment Status ==="
    echo ""
    echo "Running containers:"
    docker ps --filter "name=hr-backend" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "Health:"
    for container in $(docker ps --filter "name=hr-backend" --format "{{.Names}}"); do
      health=$(docker inspect "$container" --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
      echo "  $container: $health"
    done
    ;;

  *)
    echo "Usage: $0 {build|push|deploy|rollback|status} [tag]"
    echo ""
    echo "Commands:"
    echo "  build    Build Docker image"
    echo "  push     Push to registry"
    echo "  deploy   Deploy with blue-green strategy"
    echo "  rollback Rollback to previous version"
    echo "  status   Show deployment status"
    ;;
esac
```

---

## Appendix AE: Docker Compose プロファイル & 条件付きサービス

### AE.1 プロファイルベースの Compose 設定

```yaml
# docker-compose.profiles.yml
# Docker Compose Profiles: 用途別サービス起動制御

services:
  # --- 常に起動 ---
  hr-backend:
    build:
      context: .
      dockerfile: Dockerfile.optimized
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=${NODE_ENV:-development}
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/hr_screening
      - MINIMAX_API_KEY=${MINIMAX_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health"]
      interval: 15s
      timeout: 5s
      retries: 3
    networks:
      - hr-network

  postgres:
    image: pgvector/pgvector:pg16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=hr_screening
      - POSTGRES_PASSWORD=${DB_PASSWORD:-postgres}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - hr-network

  # --- debug プロファイル ---
  pgadmin:
    image: dpage/pgadmin4:latest
    profiles: ["debug"]
    ports:
      - "5050:80"
    environment:
      - PGADMIN_DEFAULT_EMAIL=admin@ivis-sh.com
      - PGADMIN_DEFAULT_PASSWORD=admin
    depends_on:
      - postgres
    networks:
      - hr-network

  drizzle-studio:
    image: oven/bun:1-alpine
    profiles: ["debug"]
    command: sh -c "bun x drizzle-kit studio --host 0.0.0.0 --port 4983"
    ports:
      - "4983:4983"
    working_dir: /app
    volumes:
      - .:/app:ro
    environment:
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/hr_screening
    depends_on:
      - postgres
    networks:
      - hr-network

  # --- monitoring プロファイル ---
  prometheus:
    image: prom/prometheus:latest
    profiles: ["monitoring"]
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    networks:
      - hr-network

  grafana:
    image: grafana/grafana:latest
    profiles: ["monitoring"]
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
      - GF_AUTH_ANONYMOUS_ENABLED=true
    depends_on:
      - prometheus
    networks:
      - hr-network

  loki:
    image: grafana/loki:latest
    profiles: ["monitoring"]
    ports:
      - "3100:3100"
    volumes:
      - loki_data:/loki
    networks:
      - hr-network

  # --- testing プロファイル ---
  mailhog:
    image: mailhog/mailhog:latest
    profiles: ["testing"]
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI
    networks:
      - hr-network

  test-runner:
    build:
      context: .
      dockerfile: Dockerfile.optimized
      target: builder
    profiles: ["testing"]
    command: sh -c "bun run vitest run"
    environment:
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/hr_test
      - NODE_ENV=test
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - hr-network

  # --- redis プロファイル ---
  redis:
    image: redis:7-alpine
    profiles: ["redis", "production"]
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    networks:
      - hr-network

  # --- production プロファイル ---
  nginx:
    image: nginx:alpine
    profiles: ["production"]
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      hr-backend:
        condition: service_healthy
    networks:
      - hr-network

volumes:
  pgdata:
  prometheus_data:
  grafana_data:
  loki_data:
  redis_data:

networks:
  hr-network:
    driver: bridge
```

### AE.2 プロファイル管理スクリプト

```bash
#!/bin/bash
# scripts/compose-profile.sh
# Docker Compose プロファイル管理

set -euo pipefail

COMMAND="${1:-help}"
shift || true
PROFILES="${*:-}"

COMPOSE_FILE="docker-compose.profiles.yml"

case "$COMMAND" in
  up)
    # プロファイル指定起動
    if [ -z "$PROFILES" ]; then
      echo "Starting base services..."
      docker compose -f "$COMPOSE_FILE" up -d
    else
      PROFILE_ARGS=""
      for profile in $PROFILES; do
        PROFILE_ARGS="$PROFILE_ARGS --profile $profile"
      done
      echo "Starting with profiles: $PROFILES"
      docker compose -f "$COMPOSE_FILE" $PROFILE_ARGS up -d
    fi
    ;;

  dev)
    # 開発環境（debug + testing）
    echo "Starting development environment..."
    docker compose -f "$COMPOSE_FILE" \
      --profile debug \
      --profile testing \
      up -d

    echo ""
    echo "=== Development Services ==="
    echo "  Backend:        http://localhost:3001"
    echo "  PgAdmin:        http://localhost:5050"
    echo "  Drizzle Studio: http://localhost:4983"
    echo "  MailHog:        http://localhost:8025"
    ;;

  prod)
    # 本番環境（production + redis + monitoring）
    echo "Starting production environment..."
    docker compose -f "$COMPOSE_FILE" \
      --profile production \
      --profile redis \
      --profile monitoring \
      up -d

    echo ""
    echo "=== Production Services ==="
    echo "  Backend (via Nginx): http://localhost"
    echo "  Grafana:             http://localhost:3000"
    echo "  Prometheus:          http://localhost:9090"
    ;;

  test)
    # テスト環境
    echo "Starting test environment..."
    docker compose -f "$COMPOSE_FILE" \
      --profile testing \
      up -d

    echo ""
    echo "Running tests..."
    docker compose -f "$COMPOSE_FILE" \
      --profile testing \
      run --rm test-runner
    ;;

  down)
    # 全サービス停止
    echo "Stopping all services..."
    docker compose -f "$COMPOSE_FILE" \
      --profile debug \
      --profile testing \
      --profile monitoring \
      --profile redis \
      --profile production \
      down "$@"
    ;;

  ps)
    # 実行中サービス一覧
    docker compose -f "$COMPOSE_FILE" \
      --profile debug \
      --profile testing \
      --profile monitoring \
      --profile redis \
      --profile production \
      ps
    ;;

  logs)
    # ログ表示
    SERVICE="${1:-hr-backend}"
    docker compose -f "$COMPOSE_FILE" logs -f "$SERVICE"
    ;;

  *)
    echo "Usage: $0 {up|dev|prod|test|down|ps|logs} [profiles/args]"
    echo ""
    echo "Preset environments:"
    echo "  dev    Debug + Testing profiles (PgAdmin, Drizzle Studio, MailHog)"
    echo "  prod   Production + Redis + Monitoring (Nginx, Grafana, Prometheus)"
    echo "  test   Run test suite in container"
    echo ""
    echo "Custom profiles:"
    echo "  up debug monitoring   Start with specific profiles"
    echo ""
    echo "Available profiles:"
    echo "  debug       PgAdmin, Drizzle Studio"
    echo "  testing     MailHog, Test Runner"
    echo "  monitoring  Prometheus, Grafana, Loki"
    echo "  redis       Redis cache"
    echo "  production  Nginx reverse proxy"
    ;;
esac
```

### AE.3 Docker Compose 依存関係グラフ生成

```typescript
// src/lib/compose-graph.ts
// docker-compose.yml から依存関係グラフを生成（Mermaid 形式）

import { readFileSync } from "node:fs";
import { parse } from "yaml";

interface ComposeService {
  depends_on?: Record<string, { condition?: string }> | string[];
  profiles?: string[];
  ports?: string[];
  healthcheck?: unknown;
}

interface ComposeFile {
  services: Record<string, ComposeService>;
}

export function generateDependencyGraph(
  composePath: string
): string {
  const content = readFileSync(composePath, "utf-8");
  const compose: ComposeFile = parse(content);

  let mermaid = "graph TD\n";
  const serviceStyles: string[] = [];

  for (const [name, service] of Object.entries(compose.services)) {
    // ノードスタイル
    const profiles = service.profiles || [];
    const ports = service.ports || [];
    const hasHealthcheck = !!service.healthcheck;

    // ノード定義
    const label = ports.length > 0
      ? `${name}[${name}<br/>:${ports[0].split(":")[0]}]`
      : `${name}[${name}]`;
    mermaid += `  ${label}\n`;

    // プロファイルによるスタイリング
    if (profiles.includes("debug")) {
      serviceStyles.push(`style ${name} fill:#FFE0B2`);
    } else if (profiles.includes("monitoring")) {
      serviceStyles.push(`style ${name} fill:#C8E6C9`);
    } else if (profiles.includes("testing")) {
      serviceStyles.push(`style ${name} fill:#BBDEFB`);
    } else if (profiles.includes("production")) {
      serviceStyles.push(`style ${name} fill:#F8BBD0`);
    }

    // 依存関係
    if (service.depends_on) {
      const deps = Array.isArray(service.depends_on)
        ? service.depends_on
        : Object.keys(service.depends_on);

      for (const dep of deps) {
        const depName = typeof dep === "string" ? dep : dep;
        const condition = !Array.isArray(service.depends_on)
          ? service.depends_on[depName]?.condition
          : undefined;

        const arrow = condition === "service_healthy"
          ? `-->|healthy|`
          : `-->`;
        mermaid += `  ${depName} ${arrow} ${name}\n`;
      }
    }
  }

  // スタイル適用
  mermaid += "\n";
  for (const style of serviceStyles) {
    mermaid += `  ${style}\n`;
  }

  return mermaid;
}
```

---

## Appendix AF: Docker Rootless モード・セキュリティハードニング

### AF.1 Rootless Docker セットアップ

```bash
#!/bin/bash
# scripts/setup-rootless-docker.sh
# Docker Rootless モードのセットアップスクリプト

set -euo pipefail

echo "=== Docker Rootless Mode Setup ==="

# 前提条件チェック
check_prerequisites() {
  echo "[1/5] Checking prerequisites..."

  # uidmap パッケージ確認
  if ! command -v newuidmap &>/dev/null; then
    echo "Installing uidmap..."
    if command -v apt-get &>/dev/null; then
      sudo apt-get install -y uidmap dbus-user-session
    elif command -v dnf &>/dev/null; then
      sudo dnf install -y shadow-utils fuse-overlayfs
    fi
  fi

  # /etc/subuid, /etc/subgid 確認
  local current_user
  current_user=$(whoami)

  if ! grep -q "^${current_user}:" /etc/subuid 2>/dev/null; then
    echo "Configuring subuid/subgid for ${current_user}..."
    sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 "${current_user}"
  fi

  echo "  ✓ Prerequisites OK"
}

# Docker rootless インストール
install_rootless() {
  echo "[2/5] Installing rootless Docker..."

  # 既存の rootful Docker を停止（競合防止）
  if systemctl is-active --quiet docker 2>/dev/null; then
    echo "  Stopping rootful Docker (will not remove)..."
    sudo systemctl stop docker
    sudo systemctl disable docker
  fi

  # rootless セットアップ
  dockerd-rootless-setuptool.sh install

  echo "  ✓ Rootless Docker installed"
}

# 環境変数設定
configure_environment() {
  echo "[3/5] Configuring environment..."

  local shell_rc="${HOME}/.bashrc"
  if [ -n "${ZSH_VERSION:-}" ]; then
    shell_rc="${HOME}/.zshrc"
  fi

  # DOCKER_HOST 設定
  if ! grep -q "DOCKER_HOST" "${shell_rc}" 2>/dev/null; then
    cat >> "${shell_rc}" << 'ENVEOF'

# Docker Rootless
export DOCKER_HOST=unix://${XDG_RUNTIME_DIR}/docker.sock
export PATH=${HOME}/bin:${PATH}
ENVEOF
  fi

  export DOCKER_HOST="unix://${XDG_RUNTIME_DIR}/docker.sock"

  echo "  ✓ Environment configured"
}

# systemd ユーザーサービス有効化
enable_service() {
  echo "[4/5] Enabling systemd user service..."

  systemctl --user enable docker
  systemctl --user start docker

  # ログイン前にサービス開始（linger有効化）
  sudo loginctl enable-linger "$(whoami)"

  echo "  ✓ Service enabled"
}

# 検証
verify_installation() {
  echo "[5/5] Verifying installation..."

  # rootless で動作していることを確認
  local security_info
  security_info=$(docker info --format '{{.SecurityOptions}}')

  if echo "${security_info}" | grep -q "rootless"; then
    echo "  ✓ Docker is running in rootless mode"
  else
    echo "  ✗ WARNING: Docker may not be in rootless mode"
    docker info | grep -i "rootless\|security"
  fi

  # テストコンテナ実行
  docker run --rm hello-world > /dev/null 2>&1 && \
    echo "  ✓ Test container ran successfully" || \
    echo "  ✗ Test container failed"

  echo ""
  echo "=== Setup Complete ==="
  echo "DOCKER_HOST=${DOCKER_HOST}"
  echo "Docker socket: ${XDG_RUNTIME_DIR}/docker.sock"
}

# メイン実行
check_prerequisites
install_rootless
configure_environment
enable_service
verify_installation
```

### AF.2 セキュリティハードニング Dockerfile

```dockerfile
# Dockerfile.hardened
# セキュリティハードニング済み本番用イメージ

# ====== ステージ1: ビルド ======
FROM oven/bun:1-alpine AS builder

# セキュリティ: ビルド時のみ必要なツール
RUN apk add --no-cache \
    ca-certificates

WORKDIR /build

# 依存関係インストール（キャッシュ最適化）
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ソースコードコピー＆ビルド
COPY tsconfig.json ./
COPY src/ ./src/
RUN bun build ./src/index.ts --outdir ./dist --target bun

# 本番依存関係のみ
RUN bun install --frozen-lockfile --production

# ====== ステージ2: 本番 ======
FROM oven/bun:1-alpine AS production

# メタデータ
LABEL maintainer="hr-team@ivis-sh.com"
LABEL org.opencontainers.image.title="HR Resume Screening Backend"
LABEL org.opencontainers.image.description="AI-powered resume screening service"
LABEL org.opencontainers.image.vendor="ivis-sh"

# 非 root ユーザーで実行
RUN addgroup -g 1001 -S hrapp && \
    adduser -S hrapp -u 1001 -G hrapp

USER hrapp

WORKDIR /app

# ビルド成果物のみコピー（所有者を hrapp に設定）
COPY --from=builder --chown=hrapp:hrapp /build/src ./src
COPY --from=builder --chown=hrapp:hrapp /build/node_modules ./node_modules
COPY --from=builder --chown=hrapp:hrapp /build/package.json ./

# 環境変数
ENV NODE_ENV=production
ENV PORT=3001

# ポート公開
EXPOSE 3001

# セキュリティ: 読み取り専用ファイルシステム対応
# tmpfs は docker-compose で設定
VOLUME ["/tmp"]

# エントリポイント
CMD ["bun", "src/index.ts"]
```

### AF.3 Seccomp プロファイル

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "defaultErrnoRet": 1,
  "architectures": ["SCMP_ARCH_X86_64", "SCMP_ARCH_AARCH64"],
  "syscalls": [
    {
      "names": [
        "accept", "accept4", "access", "arch_prctl", "bind",
        "brk", "capget", "capset", "chdir", "chmod",
        "clock_getres", "clock_gettime", "clock_nanosleep",
        "clone", "clone3", "close", "connect",
        "dup", "dup2", "dup3",
        "epoll_create", "epoll_create1", "epoll_ctl", "epoll_pwait", "epoll_wait",
        "eventfd", "eventfd2", "execve", "exit", "exit_group",
        "faccessat", "faccessat2", "fadvise64", "fallocate",
        "fchmod", "fchmodat", "fchown", "fchownat",
        "fcntl", "fdatasync", "flock", "fork",
        "fstat", "fstatfs", "fsync", "ftruncate",
        "futex", "getcwd", "getdents", "getdents64",
        "getegid", "geteuid", "getgid", "getgroups",
        "getpeername", "getpgrp", "getpid", "getppid",
        "getpriority", "getrandom", "getresgid", "getresuid",
        "getrlimit", "getsockname", "getsockopt", "gettid",
        "gettimeofday", "getuid",
        "inotify_add_watch", "inotify_init", "inotify_init1", "inotify_rm_watch",
        "ioctl", "lseek", "lstat",
        "madvise", "membarrier", "memfd_create",
        "mincore", "mkdir", "mkdirat",
        "mmap", "mprotect", "mremap", "munmap",
        "nanosleep", "newfstatat",
        "open", "openat", "openat2",
        "pipe", "pipe2", "poll", "ppoll",
        "prctl", "pread64", "preadv", "prlimit64",
        "pwrite64", "pwritev",
        "read", "readahead", "readlink", "readlinkat", "readv",
        "recvfrom", "recvmmsg", "recvmsg",
        "rename", "renameat", "renameat2",
        "restart_syscall", "rmdir",
        "rt_sigaction", "rt_sigprocmask", "rt_sigreturn", "rt_sigsuspend",
        "sched_getaffinity", "sched_yield",
        "seccomp", "select", "sendfile",
        "sendmmsg", "sendmsg", "sendto",
        "set_robust_list", "set_tid_address",
        "setgid", "setgroups", "setsockopt", "setuid",
        "shutdown", "sigaltstack",
        "socket", "socketpair", "splice",
        "stat", "statfs", "statx",
        "symlink", "symlinkat", "sysinfo",
        "tgkill", "timer_create", "timer_delete",
        "timer_getoverrun", "timer_gettime", "timer_settime",
        "timerfd_create", "timerfd_gettime", "timerfd_settime",
        "umask", "uname", "unlink", "unlinkat",
        "wait4", "waitid", "write", "writev"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

### AF.4 Docker Compose セキュリティオーバーレイ

```yaml
# docker-compose.security.yml
# セキュリティハードニングオーバーレイ（本番環境用）
# 使用: docker compose -f docker-compose.yml -f docker-compose.security.yml up

services:
  app:
    # セキュリティオプション
    security_opt:
      - no-new-privileges:true
      - seccomp=./seccomp-profile.json
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE  # 1024以下のポートバインド（不要なら削除）
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=100m
    # リソース制限
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 1024M
          pids: 100
        reservations:
          cpus: "0.5"
          memory: 256M
    # ネットワーク制限
    networks:
      - backend
    dns:
      - 1.1.1.1
      - 8.8.8.8
    # ヘルスチェック
    healthcheck:
      test: ["CMD", "bun", "healthcheck.mjs"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    # ログ制限
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
        tag: "{{.Name}}/{{.ID}}"

  postgres:
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - DAC_OVERRIDE
      - FOWNER
      - SETGID
      - SETUID
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2048M
          pids: 200
    networks:
      - backend
    # データベースポートを外部に公開しない
    # ports: を削除（内部ネットワークのみ）
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"

networks:
  backend:
    driver: bridge
    internal: false  # 外部通信が必要な場合
    driver_opts:
      com.docker.network.bridge.enable_icc: "true"
      com.docker.network.bridge.enable_ip_masquerade: "true"
```

### AF.5 コンテナイメージスキャナー

```typescript
// scripts/scan-image.ts
// Docker イメージの脆弱性スキャン（Trivy / Grype 統合）

import { execSync } from "node:child_process";

interface VulnerabilityReport {
  scanner: string;
  image: string;
  timestamp: string;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  vulnerabilities: Array<{
    id: string;
    severity: string;
    package: string;
    version: string;
    fixedVersion: string;
    description: string;
  }>;
  passed: boolean;
}

function scanWithTrivy(image: string): VulnerabilityReport {
  console.log(`\n[Trivy] Scanning ${image}...`);

  try {
    const result = execSync(
      `trivy image --format json --severity CRITICAL,HIGH,MEDIUM ${image}`,
      { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
    );

    const report = JSON.parse(result);
    const vulnerabilities: VulnerabilityReport["vulnerabilities"] = [];
    const summary = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

    for (const target of report.Results ?? []) {
      for (const vuln of target.Vulnerabilities ?? []) {
        const severity = vuln.Severity?.toLowerCase() ?? "unknown";
        if (severity in summary) {
          (summary as Record<string, number>)[severity]++;
        }
        summary.total++;

        vulnerabilities.push({
          id: vuln.VulnerabilityID,
          severity: vuln.Severity,
          package: vuln.PkgName,
          version: vuln.InstalledVersion,
          fixedVersion: vuln.FixedVersion ?? "N/A",
          description: vuln.Title ?? vuln.Description?.substring(0, 200) ?? "",
        });
      }
    }

    return {
      scanner: "trivy",
      image,
      timestamp: new Date().toISOString(),
      summary,
      vulnerabilities,
      passed: summary.critical === 0 && summary.high === 0,
    };
  } catch (error) {
    console.error("Trivy scan failed:", (error as Error).message);
    return {
      scanner: "trivy",
      image,
      timestamp: new Date().toISOString(),
      summary: { critical: -1, high: -1, medium: -1, low: -1, total: -1 },
      vulnerabilities: [],
      passed: false,
    };
  }
}

function scanWithGrype(image: string): VulnerabilityReport {
  console.log(`\n[Grype] Scanning ${image}...`);

  try {
    const result = execSync(
      `grype ${image} -o json --fail-on critical`,
      { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
    );

    const report = JSON.parse(result);
    const vulnerabilities: VulnerabilityReport["vulnerabilities"] = [];
    const summary = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

    for (const match of report.matches ?? []) {
      const severity = match.vulnerability?.severity?.toLowerCase() ?? "unknown";
      if (severity in summary) {
        (summary as Record<string, number>)[severity]++;
      }
      summary.total++;

      vulnerabilities.push({
        id: match.vulnerability?.id ?? "unknown",
        severity: match.vulnerability?.severity ?? "Unknown",
        package: match.artifact?.name ?? "unknown",
        version: match.artifact?.version ?? "unknown",
        fixedVersion: match.vulnerability?.fix?.versions?.[0] ?? "N/A",
        description: match.vulnerability?.description?.substring(0, 200) ?? "",
      });
    }

    return {
      scanner: "grype",
      image,
      timestamp: new Date().toISOString(),
      summary,
      vulnerabilities,
      passed: summary.critical === 0,
    };
  } catch (error) {
    const exitError = error as { status?: number };
    // Grype は脆弱性検出時に非ゼロで終了
    if (exitError.status === 1) {
      console.warn("Grype found critical vulnerabilities");
    }
    return {
      scanner: "grype",
      image,
      timestamp: new Date().toISOString(),
      summary: { critical: -1, high: -1, medium: -1, low: -1, total: -1 },
      vulnerabilities: [],
      passed: false,
    };
  }
}

// SBOM 生成（Software Bill of Materials）
function generateSBOM(image: string): string {
  console.log(`\n[SBOM] Generating for ${image}...`);

  try {
    const sbom = execSync(
      `syft ${image} -o spdx-json`,
      { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
    );
    return sbom;
  } catch {
    console.warn("SBOM generation failed (syft not installed?)");
    return "{}";
  }
}

// メイン実行
async function main(): Promise<void> {
  const image = process.argv[2] ?? "hr-backend:latest";
  console.log(`=== Container Security Scan: ${image} ===`);

  // 並列スキャン
  const trivyReport = scanWithTrivy(image);
  const grypeReport = scanWithGrype(image);

  // レポート出力
  console.log("\n=== Scan Results ===");
  console.log(`\nTrivy: ${trivyReport.passed ? "PASSED ✓" : "FAILED ✗"}`);
  console.log(`  Critical: ${trivyReport.summary.critical}`);
  console.log(`  High: ${trivyReport.summary.high}`);
  console.log(`  Medium: ${trivyReport.summary.medium}`);
  console.log(`  Total: ${trivyReport.summary.total}`);

  console.log(`\nGrype: ${grypeReport.passed ? "PASSED ✓" : "FAILED ✗"}`);
  console.log(`  Critical: ${grypeReport.summary.critical}`);
  console.log(`  High: ${grypeReport.summary.high}`);

  // CI/CD 用の終了コード
  const overallPass = trivyReport.passed && grypeReport.passed;
  console.log(`\nOverall: ${overallPass ? "PASSED ✓" : "FAILED ✗"}`);

  if (!overallPass) {
    console.log("\nCritical/High vulnerabilities found:");
    const criticals = [
      ...trivyReport.vulnerabilities.filter((v) => v.severity === "CRITICAL" || v.severity === "HIGH"),
    ];
    for (const vuln of criticals.slice(0, 20)) {
      console.log(`  ${vuln.severity} ${vuln.id}: ${vuln.package}@${vuln.version} (fix: ${vuln.fixedVersion})`);
    }
    process.exit(1);
  }
}

main().catch(console.error);
```

### AF.6 Gitea CI セキュリティスキャンワークフロー

```yaml
# .gitea/workflows/security-scan.yml
name: Container Security Scan

on:
  push:
    branches: [main]
    paths:
      - "Dockerfile*"
      - "package.json"
      - "bun.lock"
  schedule:
    - cron: "0 6 * * 1"  # 毎週月曜 6:00 AM

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t hr-backend:scan -f Dockerfile.hardened .

      - name: Trivy vulnerability scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: "hr-backend:scan"
          format: "sarif"
          output: "trivy-results.sarif"
          severity: "CRITICAL,HIGH"
          exit-code: "1"

      - name: Trivy config scan (Dockerfile)
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: "config"
          scan-ref: "."
          format: "table"
          severity: "CRITICAL,HIGH,MEDIUM"

      - name: Dockle lint
        run: |
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            goodwithtech/dockle:latest \
            --exit-code 1 \
            --exit-level warn \
            hr-backend:scan

      - name: Check image size
        run: |
          SIZE=$(docker image inspect hr-backend:scan --format='{{.Size}}')
          SIZE_MB=$((SIZE / 1024 / 1024))
          echo "Image size: ${SIZE_MB}MB"
          if [ "$SIZE_MB" -gt 200 ]; then
            echo "WARNING: Image exceeds 200MB target"
          fi

      - name: Generate SBOM
        run: |
          curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
          syft hr-backend:scan -o spdx-json > sbom.spdx.json

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: security-reports
          path: |
            trivy-results.sarif
            sbom.spdx.json
```

---

## Appendix AG: K3s 軽量 Kubernetes デプロイ

### AG.1 K3s クラスターセットアップ

```bash
#!/bin/bash
# scripts/setup-k3s.sh
# 単一ノード K3s Kubernetes クラスターセットアップ

set -euo pipefail

echo "=== K3s Lightweight Kubernetes Setup ==="

# K3s インストール
install_k3s() {
  echo "[1/4] Installing K3s..."

  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
    --disable=traefik \
    --write-kubeconfig-mode=644 \
    --tls-san=$(hostname -I | awk '{print $1}') \
    --data-dir=/opt/k3s" sh -

  # kubeconfig 設定
  mkdir -p "${HOME}/.kube"
  sudo cp /etc/rancher/k3s/k3s.yaml "${HOME}/.kube/config"
  sudo chown "$(id -u):$(id -g)" "${HOME}/.kube/config"

  echo "  ✓ K3s installed"
}

# Nginx Ingress Controller
install_ingress() {
  echo "[2/4] Installing Nginx Ingress..."

  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml

  echo "  Waiting for ingress controller..."
  kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=120s

  echo "  ✓ Ingress installed"
}

# cert-manager (Let's Encrypt)
install_cert_manager() {
  echo "[3/4] Installing cert-manager..."

  kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

  kubectl wait --namespace cert-manager \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/instance=cert-manager \
    --timeout=120s

  echo "  ✓ cert-manager installed"
}

# 動作確認
verify() {
  echo "[4/4] Verifying..."

  echo "  Nodes:"
  kubectl get nodes -o wide

  echo "  System Pods:"
  kubectl get pods -A

  echo "  K3s version: $(k3s --version)"
  echo ""
  echo "=== K3s Setup Complete ==="
}

install_k3s
install_ingress
install_cert_manager
verify
```

### AG.2 HR Backend Kubernetes マニフェスト

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: hr-system
  labels:
    app.kubernetes.io/part-of: hr-screening

---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: hr-backend-config
  namespace: hr-system
data:
  NODE_ENV: "production"
  PORT: "3001"
  IMAP_HOST: "mail.ivis-sh.com"
  IMAP_PORT: "993"
  SMTP_HOST: "mail.ivis-sh.com"
  SMTP_PORT: "587"
  LOG_LEVEL: "info"

---
# k8s/secret.yaml (テンプレート — 実際の値は外部管理)
apiVersion: v1
kind: Secret
metadata:
  name: hr-backend-secrets
  namespace: hr-system
type: Opaque
stringData:
  DATABASE_URL: "postgresql://postgres:CHANGE_ME@postgres-svc:5432/hr_screening"
  MINIMAX_API_KEY: "CHANGE_ME"
  IMAP_USER: "hr@ivis-sh.com"
  IMAP_PASS: "CHANGE_ME"
  SMTP_USER: "hr@ivis-sh.com"
  SMTP_PASS: "CHANGE_ME"

---
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hr-backend
  namespace: hr-system
  labels:
    app: hr-backend
    version: v1
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: hr-backend
  template:
    metadata:
      labels:
        app: hr-backend
        version: v1
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: hr-backend
          image: registry.ivis-sh.com/hr-backend:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 3001
              protocol: TCP
          envFrom:
            - configMapRef:
                name: hr-backend-config
            - secretRef:
                name: hr-backend-secrets
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 512Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          volumeMounts:
            - name: tmp
              mountPath: /tmp
          livenessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 12
      volumes:
        - name: tmp
          emptyDir:
            sizeLimit: 100Mi
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: hr-backend

---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: hr-backend-svc
  namespace: hr-system
spec:
  selector:
    app: hr-backend
  ports:
    - port: 80
      targetPort: 3001
      protocol: TCP
  type: ClusterIP

---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hr-backend-ingress
  namespace: hr-system
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/proxy-body-size: "20m"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "X-Frame-Options: DENY";
      more_set_headers "X-Content-Type-Options: nosniff";
      more_set_headers "X-XSS-Protection: 1; mode=block";
      more_set_headers "Referrer-Policy: strict-origin-when-cross-origin";
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - hr-api.ivis-sh.com
      secretName: hr-api-tls
  rules:
    - host: hr-api.ivis-sh.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: hr-backend-svc
                port:
                  number: 80

---
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: hr-backend-hpa
  namespace: hr-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: hr-backend
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 120
```

### AG.3 PostgreSQL StatefulSet

```yaml
# k8s/postgres.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: hr-system
spec:
  serviceName: postgres-svc
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: pgvector/pgvector:pg16
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: hr_screening
            - name: POSTGRES_USER
              value: postgres
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: hr-backend-secrets
                  key: POSTGRES_PASSWORD
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: "2"
              memory: 2Gi
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
          livenessProbe:
            exec:
              command:
                - pg_isready
                - -U
                - postgres
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            exec:
              command:
                - pg_isready
                - -U
                - postgres
            initialDelaySeconds: 5
            periodSeconds: 5
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: local-path
        resources:
          requests:
            storage: 20Gi

---
apiVersion: v1
kind: Service
metadata:
  name: postgres-svc
  namespace: hr-system
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
  clusterIP: None  # Headless service for StatefulSet
```

### AG.4 K3s デプロイスクリプト

```bash
#!/bin/bash
# scripts/k3s-deploy.sh
# K3s へのデプロイスクリプト

set -euo pipefail

ACTION="${1:-deploy}"
IMAGE_TAG="${2:-latest}"
NAMESPACE="hr-system"

case "$ACTION" in
  deploy)
    echo "=== Deploying HR Backend to K3s ==="

    # Namespace 作成
    kubectl apply -f k8s/namespace.yaml

    # ConfigMap & Secrets
    kubectl apply -f k8s/configmap.yaml
    kubectl apply -f k8s/secret.yaml

    # PostgreSQL
    kubectl apply -f k8s/postgres.yaml
    echo "Waiting for PostgreSQL..."
    kubectl wait --namespace "$NAMESPACE" \
      --for=condition=ready pod \
      --selector=app=postgres \
      --timeout=120s

    # Backend
    kubectl set image deployment/hr-backend \
      hr-backend="registry.ivis-sh.com/hr-backend:${IMAGE_TAG}" \
      --namespace "$NAMESPACE" 2>/dev/null || \
      kubectl apply -f k8s/deployment.yaml

    kubectl apply -f k8s/service.yaml
    kubectl apply -f k8s/ingress.yaml
    kubectl apply -f k8s/hpa.yaml

    # ロールアウト待機
    kubectl rollout status deployment/hr-backend \
      --namespace "$NAMESPACE" \
      --timeout=180s

    echo "=== Deploy Complete ==="
    kubectl get all -n "$NAMESPACE"
    ;;

  rollback)
    echo "=== Rolling Back ==="
    kubectl rollout undo deployment/hr-backend --namespace "$NAMESPACE"
    kubectl rollout status deployment/hr-backend --namespace "$NAMESPACE"
    ;;

  status)
    echo "=== Cluster Status ==="
    kubectl get all -n "$NAMESPACE"
    echo ""
    echo "=== Pod Logs (last 20 lines) ==="
    kubectl logs -l app=hr-backend -n "$NAMESPACE" --tail=20
    ;;

  scale)
    REPLICAS="${2:-3}"
    echo "=== Scaling to ${REPLICAS} replicas ==="
    kubectl scale deployment/hr-backend --replicas="$REPLICAS" -n "$NAMESPACE"
    ;;

  *)
    echo "Usage: $0 {deploy|rollback|status|scale} [tag|replicas]"
    exit 1
    ;;
esac
```

---

## Appendix AH: Docker ログ管理・集約・分析

### AH.1 構造化ログドライバー設定

```yaml
# docker-compose.logging.yml
# ログ管理オーバーレイ

services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
        tag: "hr-backend/{{.Name}}/{{.ID}}"
        labels: "service,environment"
        env: "NODE_ENV,LOG_LEVEL"
    labels:
      - "service=hr-backend"
      - "environment=${NODE_ENV:-production}"
    environment:
      LOG_LEVEL: ${LOG_LEVEL:-info}
      LOG_FORMAT: json

  postgres:
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "3"
        tag: "postgres/{{.Name}}"
    command: >
      postgres
        -c logging_collector=on
        -c log_directory=/var/log/postgresql
        -c log_filename=postgresql-%Y-%m-%d.log
        -c log_rotation_age=1d
        -c log_rotation_size=100MB
        -c log_min_duration_statement=1000
        -c log_checkpoints=on
        -c log_connections=on
        -c log_disconnections=on
        -c log_lock_waits=on
        -c log_temp_files=0
        -c log_line_prefix='%t [%p]: db=%d,user=%u,app=%a,client=%h '

  # Loki ログ集約（Grafanaスタック）
  loki:
    image: grafana/loki:latest
    profiles:
      - monitoring
    ports:
      - "3100:3100"
    volumes:
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3100/ready || exit 1"]
      interval: 30s
      timeout: 5s

  # Promtail ログ収集エージェント
  promtail:
    image: grafana/promtail:latest
    profiles:
      - monitoring
    volumes:
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config/promtail.yml:/etc/promtail/config.yml:ro
    command: -config.file=/etc/promtail/config.yml
    depends_on:
      - loki

volumes:
  loki-data:
```

### AH.2 アプリケーション構造化ロガー

```typescript
// src/lib/logger.ts
import { env } from "../env.js";

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

class Logger {
  private minLevel: number;
  private service: string;
  private defaultContext: Record<string, unknown>;

  constructor(
    service: string = "hr-backend",
    options?: {
      level?: LogLevel;
      context?: Record<string, unknown>;
    }
  ) {
    this.service = service;
    this.minLevel = LOG_LEVELS[options?.level ?? (env.LOG_LEVEL as LogLevel) ?? "info"];
    this.defaultContext = options?.context ?? {};
  }

  // 子ロガー作成（コンテキスト継承）
  child(context: Record<string, unknown>): Logger {
    const logger = new Logger(this.service, {
      context: { ...this.defaultContext, ...context },
    });
    return logger;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, error?: Error | Record<string, unknown>): void {
    const data = error instanceof Error
      ? { error: { name: error.name, message: error.message, stack: error.stack } }
      : error;
    this.log("error", message, data);
  }

  fatal(message: string, error?: Error | Record<string, unknown>): void {
    const data = error instanceof Error
      ? { error: { name: error.name, message: error.message, stack: error.stack } }
      : error;
    this.log("fatal", message, data);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      ...this.defaultContext,
      ...data,
    };

    const output = JSON.stringify(entry);

    if (level === "error" || level === "fatal") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  }
}

// シングルトンロガー
export const logger = new Logger();

// リクエストロガーミドルウェア
export function requestLogger() {
  return async (c: import("elysia").Context, next: import("elysia").Next) => {
    const start = Date.now();
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();

    // リクエストログ
    logger.info("Request received", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      query: c.req.query(),
      userAgent: c.req.header("user-agent"),
      ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip"),
    });

    // レスポンスヘッダーにリクエストID追加
    c.header("X-Request-ID", requestId);

    await next();

    // レスポンスログ
    const duration = Date.now() - start;
    const status = c.res.status;

    const logFn = status >= 500 ? logger.error.bind(logger) : logger.info.bind(logger);
    logFn("Request completed", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: duration,
    });
  };
}
```

### AH.3 Promtail設定

```yaml
# config/promtail.yml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # Docker コンテナログ収集
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
        filters:
          - name: label
            values: ["service"]
    relabel_configs:
      # コンテナ名をラベルに
      - source_labels: ["__meta_docker_container_name"]
        target_label: "container"
        regex: "/(.*)"
      # サービス名
      - source_labels: ["__meta_docker_container_label_service"]
        target_label: "service"
      # 環境
      - source_labels: ["__meta_docker_container_label_environment"]
        target_label: "environment"
    pipeline_stages:
      # JSON ログパース
      - json:
          expressions:
            level: level
            message: message
            timestamp: timestamp
            service: service
            requestId: requestId
            method: method
            path: path
            status: status
            durationMs: durationMs
      # タイムスタンプ設定
      - timestamp:
          source: timestamp
          format: RFC3339
      # ラベル設定
      - labels:
          level:
          service:
          method:
      # ログレベルに基づくフィルタ
      - match:
          selector: '{level="error"} |= "error"'
          stages:
            - metrics:
                error_total:
                  type: Counter
                  description: "Total error log entries"
                  config:
                    action: inc
```

### AH.4 ログ分析スクリプト

```typescript
// scripts/log-analyzer.ts
// Docker コンテナログの分析ツール

import { execSync } from "node:child_process";

interface LogAnalysis {
  totalLines: number;
  byLevel: Record<string, number>;
  topErrors: Array<{ message: string; count: number }>;
  topPaths: Array<{ path: string; count: number; avgDurationMs: number }>;
  slowRequests: Array<{ path: string; durationMs: number; timestamp: string }>;
  errorRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
}

function analyzeLogs(containerName: string = "hr-backend", hours: number = 24): LogAnalysis {
  // Docker ログ取得
  const since = `${hours}h`;
  let rawLogs: string;

  try {
    rawLogs = execSync(
      `docker logs --since ${since} ${containerName} 2>&1`,
      { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 }
    );
  } catch {
    rawLogs = "";
  }

  const lines = rawLogs.split("\n").filter(Boolean);
  const byLevel: Record<string, number> = {};
  const errorMessages: Record<string, number> = {};
  const pathStats: Record<string, { count: number; totalDuration: number; durations: number[] }> = {};

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // レベル集計
      const level = entry.level ?? "unknown";
      byLevel[level] = (byLevel[level] ?? 0) + 1;

      // エラーメッセージ集計
      if (level === "error" || level === "fatal") {
        const msg = entry.message ?? "Unknown error";
        errorMessages[msg] = (errorMessages[msg] ?? 0) + 1;
      }

      // パス別統計
      if (entry.path && entry.durationMs) {
        if (!pathStats[entry.path]) {
          pathStats[entry.path] = { count: 0, totalDuration: 0, durations: [] };
        }
        pathStats[entry.path].count++;
        pathStats[entry.path].totalDuration += entry.durationMs;
        pathStats[entry.path].durations.push(entry.durationMs);
      }
    } catch {
      // JSON パース失敗 — プレーンテキストログ
      byLevel["plain"] = (byLevel["plain"] ?? 0) + 1;
    }
  }

  // トップエラー
  const topErrors = Object.entries(errorMessages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([message, count]) => ({ message, count }));

  // トップパス
  const topPaths = Object.entries(pathStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([path, stats]) => ({
      path,
      count: stats.count,
      avgDurationMs: Math.round(stats.totalDuration / stats.count),
    }));

  // スローリクエスト
  const allDurations: number[] = [];
  const slowRequests: LogAnalysis["slowRequests"] = [];

  for (const [path, stats] of Object.entries(pathStats)) {
    allDurations.push(...stats.durations);
    const slow = stats.durations.filter((d) => d > 5000);
    if (slow.length > 0) {
      slowRequests.push({
        path,
        durationMs: Math.max(...slow),
        timestamp: new Date().toISOString(),
      });
    }
  }

  allDurations.sort((a, b) => a - b);
  const p95Index = Math.ceil(allDurations.length * 0.95) - 1;

  const totalRequests = Object.values(pathStats).reduce((sum, s) => sum + s.count, 0);
  const totalErrors = (byLevel["error"] ?? 0) + (byLevel["fatal"] ?? 0);

  return {
    totalLines: lines.length,
    byLevel,
    topErrors,
    topPaths,
    slowRequests: slowRequests.sort((a, b) => b.durationMs - a.durationMs).slice(0, 10),
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    avgResponseTime: allDurations.length > 0
      ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
      : 0,
    p95ResponseTime: allDurations[p95Index] ?? 0,
  };
}

// メイン実行
const containerName = process.argv[2] ?? "hr-backend";
const hours = parseInt(process.argv[3] ?? "24");

console.log(`=== Log Analysis: ${containerName} (last ${hours}h) ===\n`);
const analysis = analyzeLogs(containerName, hours);

console.log(`Total log lines: ${analysis.totalLines}`);
console.log(`Error rate: ${(analysis.errorRate * 100).toFixed(2)}%`);
console.log(`Avg response time: ${analysis.avgResponseTime}ms`);
console.log(`P95 response time: ${analysis.p95ResponseTime}ms`);

console.log("\nBy Level:");
for (const [level, count] of Object.entries(analysis.byLevel)) {
  console.log(`  ${level}: ${count}`);
}

if (analysis.topErrors.length > 0) {
  console.log("\nTop Errors:");
  for (const err of analysis.topErrors) {
    console.log(`  [${err.count}x] ${err.message}`);
  }
}

console.log("\nTop Paths:");
for (const path of analysis.topPaths.slice(0, 10)) {
  console.log(`  ${path.path}: ${path.count} requests, avg ${path.avgDurationMs}ms`);
}

if (analysis.slowRequests.length > 0) {
  console.log("\nSlow Requests (>5s):");
  for (const req of analysis.slowRequests) {
    console.log(`  ${req.path}: ${req.durationMs}ms`);
  }
}
```
