# 水平扩容

## 进程与权威边界

```text
Client ──WS/HTTP── Gateway × N ──HTTP── Room Worker × N
                       │                    │
                       ├── Redis ───────────┤ route lease / presence / wake-up
                       └── PostgreSQL ──────┘ head / epoch / receipt / WAL / outbox / snapshot
```

- Gateway 无文档权威状态，可由云负载均衡任意分发连接。
- 一个文档同一时刻只有一个 Room Worker writer；PostgreSQL `owner_epoch + owner_instance_id` fencing 是最终权威。
- Redis 只缓存短租约 owner route、worker registry、Presence，并用 Pub/Sub 唤醒 Gateway；Redis 丢消息由 PostgreSQL head watermark + WAL catch-up 修复。
- WAL、operation receipt、document head 与 outbox 在同一个 PostgreSQL 事务提交。commit 后的 publish/snapshot 失败不会把 accepted 改成 rejected。
- operationId receipt 持久化；相同 payload 返回 duplicate，不同 payload 以 collision 拒绝。

## 2C4G 单节点起始水位

以下是调度起点，不是生产 SLO；上线前必须用真实 Domain Pack、snapshot 大小与云数据库复测。

| 角色 | 起始水位 | 扩容信号 |
|---|---:|---|
| Gateway | 4k–5k WebSocket；800–1000 ingress msg/s | connection、event-loop lag、egress bytes、slow client |
| Room Worker | 300 accepted op/s；单热 room 50 op/s | mailbox depth、commit p95、fencing retry、warm-state RSS |
| Warm rooms | 1,000 / VM 起步 | `floor(1 GiB / p95 retained bytes per room)` |

本地可重复基线（Colima 4C8G 共享栈、500 个同文档 operation、32 并发、跨两个 Gateway）：accepted 434.5 op/s，远端完整收敛 397.5 op/s，HTTP request p95 103.96 ms。命令：`pnpm benchmark:distributed`。它是回归数据，不替代 2C4G 独占 VM 与云 PostgreSQL 的容量测试。

裸 VM 每台 2C4G 建议两个 Node 进程，每进程 `--max-old-space-size=768–896`、`PG_POOL_MAX=5`，总 RSS 3 GiB 熔断。Kubernetes 基线是一 Pod 一进程/2C4G、`PG_POOL_MAX=10`。两种方式均通过 PgBouncer 将每 VM/Pod 连接控制在 8–12。数据库容量约束副本上限：

```text
required_db_connections = ceil(worker_qps × mean_db_tx_seconds / 0.7)
max_worker_replicas = floor(0.6 × measured_db_commit_qps / worker_scheduling_qps)
```

## Docker Compose

要求 Docker 24+ / Compose v2。一次启动两个 Gateway、两个 Worker、PostgreSQL 16、Redis 7.2 与 Nginx：

```bash
docker compose -f deploy/docker-compose.yml up --build -d
pnpm smoke:distributed
docker compose -f deploy/docker-compose.yml down
```

入口：负载均衡 `http/ws://127.0.0.1:7090`；直连 Gateway 为 `7001`、`7002`。冒烟脚本验证跨 Gateway 同步、重复投递、Presence 不落盘、writer 宕机迁移与 snapshot recovery，并在结束时恢复被停止的 Worker。

## 本机独立进程

只用 Docker 启动 PostgreSQL 与 Redis；Gateway、Worker 和 TODO List 前端均为可观察、可单独终止的本机 Node.js 进程：

```bash
pnpm dev:todo-cluster    # 持续运行，Ctrl-C 统一清理
pnpm smoke:todo-cluster  # 自动验收并清理
```

Alice 经 Gateway 1，Bob 经 Gateway 2。冒烟会终止 PostgreSQL 当前记录的 writer PID，验证另一 Worker fencing 接管、业务联动、离线 pending replay 与新浏览器 snapshot recovery。端口、进程和验收 trace 见[本地多进程验收](../acceptance-local-process-cluster.md)。

## Kubernetes / 主流云

镜像使用 OCI 标准、非 root 用户、只读 root filesystem，可用 `buildx` 发布 `linux/amd64` 与 `linux/arm64`：

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/superche/collabhub:0.1.0 --push .
kubectl apply -f deploy/kubernetes/collabhub.yaml
```

基线兼容 Node.js 22 LTS、PostgreSQL 15/16、Redis 7.2/7.x、Kubernetes 1.29+。清单适用于 EKS、GKE、AKS、ACK 等标准 Kubernetes；生产使用托管 PostgreSQL/Redis、TLS、Secret Manager 与云负载均衡。Worker 使用 StatefulSet + headless Service 获得可路由实例地址；Gateway 使用 Deployment + LoadBalancer/HPA。

CPU HPA 只是兜底。生产应接入 Prometheus Adapter/KEDA，以 Gateway connection/egress 和 Worker mailbox/commit latency 作为主扩容指标。

关键环境变量：

| 变量 | Gateway | Worker | 默认值 |
|---|:---:|:---:|---|
| `DATABASE_URL` / `REDIS_URL` | ✓ | ✓ | 本地地址 |
| `INTERNAL_TOKEN` | ✓ | ✓ | 仅本地开发值；生产必改 |
| `INSTANCE_ID` / `PORT` | ✓ | ✓ | hostname + role + port |
| `INTERNAL_URL` |  | ✓ | `http://127.0.0.1:PORT` |
| `PG_POOL_MAX` | ✓ | ✓ | `10` |
| `MAX_ROOM_MAILBOX` / `MAX_WARM_ROOMS` |  | ✓ | `256` / `1000` |
| `SNAPSHOT_INTERVAL` |  | ✓ | `100` |
| `RSS_LIMIT_BYTES` | ✓ | ✓ | 3 GiB |

## 故障语义

| 故障 | 行为 |
|---|---|
| Gateway 退出 | 客户端重连其他 Gateway，以相同 operationId replay pending |
| Worker 退出 | Gateway 淘汰路由；新 Worker 在 PostgreSQL 递增 epoch、恢复 snapshot + WAL |
| 旧 Worker 恢复 | 旧 epoch 的任何 commit 被 PostgreSQL fencing 拒绝 |
| Redis Pub/Sub 丢消息 | Gateway 周期比较 head watermark，从 WAL 补齐 canonical event |
| publish/snapshot 失败 | outbox 重试；已 commit operation 仍为 accepted |
| commit 响应未知 | 客户端保留 operationId 重试，receipt 返回唯一结果 |

## 生产接入条件

- Gateway 前置 JWT/JWKS 或服务网关鉴权，并把可信 identity 绑定到 `ConnectionContext`；示例 header/query identity 只用于本地验收。
- REST 写入必须调用 Gateway operation API，不能直接更新业务库形成双 writer。
- 按 tenant 做 rate limit、payload schema 校验、数据库行级隔离/独立库策略。
- 为 PostgreSQL 配置 PITR、跨可用区高可用、PgBouncer；Redis 只承担可重建临时状态。
- 监控 head/worker epoch、outbox age、mailbox depth、recovery count、slow client 与 snapshot retained bytes。

建议上线顺序：先部署托管 PostgreSQL/Redis 与 Worker；再以旁路 Gateway 做压测和故障注入；随后把 WebSocket 与 REST mutation 一并切到 Gateway；最后启用 HPA，并以数据库 commit capacity 限制 Worker 最大副本数。
