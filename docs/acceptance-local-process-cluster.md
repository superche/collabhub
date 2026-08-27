# 本地多进程 TODO List 冒烟

## 拓扑

PostgreSQL 与 Redis 仅作为本地基础设施容器。CollabHub 服务和页面均为独立本机进程。

| 进程 | 端口 | 用途 |
|---|---:|---|
| `todo-worker-1` / `todo-worker-2` | 7111 / 7112 | 注入 `DraftDomainPack` 的 Room Worker |
| `todo-gateway-1` / `todo-gateway-2` | 7011 / 7012 | WebSocket / HTTP Gateway |
| `todo-alice-web` / `todo-bob-web` | 5273 / 5274 | 两个独立 Vite 进程 |
| PostgreSQL / Redis | 55432 / 56379 | 权威存储 / 临时协调 |

Alice 固定连接 Gateway 1，Bob 固定连接 Gateway 2。每个进程有独立 PID、前缀日志和关闭生命周期。

## 运行

```bash
pnpm dev:todo-cluster
```

页面：

- Alice：`http://127.0.0.1:5273/?client=alice`
- Bob：`http://127.0.0.1:5274/?client=bob`

自动冒烟：

```bash
pnpm smoke:todo-cluster
```

脚本启动两个真实 Chromium context，并依次验证：

1. TODO 标题跨 Gateway 收敛。
2. 勾选任务以单个 intent 原子同步任务状态、完成数和百分比。
3. 查询 PostgreSQL 当前 owner，终止对应 Worker PID；另一 Worker 以新 epoch 接管并继续写入。
4. Alice 离线排队，Bob 推进 canonical version；Alice 重连后 replay pending。
5. 全新 Charlie 浏览器从 snapshot + WAL 恢复最终状态。
6. 核对 PostgreSQL head、epoch、WAL、receipt 与 delivered outbox。

脚本无论成功失败都会关闭浏览器、全部本机子进程，并执行基础设施 `docker compose down -v`。

## 验收证据

2026-08-27 实测启动了 6 个独立本机进程；当前 writer PID 被真实 `SIGTERM`，未使用 mock。

```json
{"event":"two_browsers_on_distinct_gateways","gateway1":7011,"gateway2":7012}
{"event":"cross_gateway_title_converged","canonicalVersion":1}
{"event":"linked_update_converged","canonicalVersion":2,"completed":1,"total":2,"percent":50}
{"event":"writer_process_stopped","instanceId":"todo-worker-2","pid":5160}
{"event":"writer_failover_converged","from":"todo-worker-2","to":"todo-worker-1","canonicalVersion":3}
{"event":"offline_pending_replayed","canonicalVersion":5,"pending":0}
{"event":"fresh_browser_snapshot_recovery","canonicalVersion":5}
{"event":"postgres_evidence","canonicalVersion":5,"ownerEpoch":2,"owner":"todo-worker-1","snapshotVersion":4,"wal":5,"receipts":5,"deliveredOutbox":5}
```

并行启动 Worker 时曾触发 PostgreSQL `CREATE TABLE IF NOT EXISTS` 的系统类型唯一键竞态。schema migration 现由 transaction-scoped advisory lock 串行化；修复后重复完整冒烟通过。
