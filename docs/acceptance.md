# v0.1 验收记录

日期：2026-08-27（Asia/Shanghai）  
环境：macOS arm64、Node.js v24.18.0、pnpm 10.11.0、Playwright Chromium 151.0.7922.34。

## 最终 gate

`pnpm check`：通过。

- TypeScript project references：通过。
- Vite production build：41 modules；JS 213.79 KB / 66.38 KB gzip，CSS 4.54 KB / 1.64 KB gzip。
- BlockNote Vite production build：914 modules；主 JS 1,131.76 KB / 343.38 KB gzip，CSS 243.00 KB / 38.62 KB gzip；大 chunk 警告记录为已知限制。
- React Flow Vite production build：199 modules；JS 392.29 KB / 124.88 KB gzip，CSS 20.12 KB / 4.01 KB gzip。
- Vitest：12 files / 35 tests passed。
- 1,000-section patch benchmark：1,000 samples，p95 0.019 ms，gate 4 ms，通过。

`pnpm test:e2e`：3 tests passed（8.0 s；TODO List 1.6 s，React Flow 1.9 s，BlockNote 2.5 s）。

## 发布与公开 Demo 门禁

`pnpm release:check` 通过。7 个 `0.1.0` package 均生成只含编译 ESM、declaration、source map 与 manifest 的 tarball；审计确认没有 `src`、test 或 `workspace:` 依赖泄漏。`Prepare release artifacts` workflow 只能上传待检 tarball，不包含 tag、GitHub Release 或 npm publish 权限。

`pnpm smoke:demo` 通过：生产 Vite 资源与 bundled Node server 在 `127.0.0.1:4400` 启动，`/demo.html` 中 Alice/Bob 两个 iframe 经真实 WebSocket 收敛；标题更新为 v1，任务联动更新为 v2 / 50%。

`deploy/demo.Dockerfile` 与主 `Dockerfile` 均完成本机 Docker 构建。Demo 镜像以 UID/GID `10001:10001` 运行，容器 `/healthz` 返回 `{"status":"ok","version":"0.1.0"}`，并正确提供 Alice/Bob 双窗口页面。

## 真实进程与网络

最终 Playwright webServer 启动的是 `pnpm dev` 同一交付命令：

| 角色 | 最终验收 PID | 监听 |
|---|---:|---|
| TODO List API + CollabHub WebSocket | 95984 | `127.0.0.1:4100`, `/collab` |
| React Alice Vite | 95964 | `127.0.0.1:5173` |
| React Bob Vite | 95958 | `127.0.0.1:5174` |

BlockNote 最终 Playwright 验收使用 `pnpm dev:blocknote`：

| 角色 | PID | 监听 |
|---|---:|---|
| BlockNote CollabHub WebSocket | 96154 | `127.0.0.1:4200`, `/collab` |
| BlockNote Alice Vite | 96108 | `127.0.0.1:5183` |
| BlockNote Bob Vite | 96081 | `127.0.0.1:5184` |

Alice 与 Bob 使用两个独立 Chromium BrowserContext，而不是一个模拟 store。Server、两个 Vite client 和浏览器均由 Playwright 在验收结束后正常回收。

React Flow 手工 Playwright CLI 验收使用 `pnpm dev:react-flow`：

| 角色 | PID | 监听 |
|---|---:|---|
| React Flow CollabHub WebSocket | 54147 | `127.0.0.1:4300`, `/collab` |
| React Flow Alice Vite | 54131 | `127.0.0.1:5193` |
| React Flow Bob Vite | 54130 | `127.0.0.1:5194` |

## 故障 trace

最终 trace 文档：`e2e-1787822432763`。

```json
{"event":"client_connected","actorId":"alice","lastKnownVersion":0,"canonicalVersion":0,"snapshotRecovery":false}
{"event":"client_connected","actorId":"bob","lastKnownVersion":0,"canonicalVersion":0,"snapshotRecovery":false}
{"event":"operation_result","operationType":"property.set","baseVersion":0,"result":"accepted","canonicalVersion":1,"latencyMs":7.43}
{"event":"operation_result","operationType":"section.setCompleted","baseVersion":1,"result":"accepted","canonicalVersion":2,"latencyMs":5}
{"event":"operation_result","operationType":"property.set","baseVersion":2,"result":"accepted","canonicalVersion":3,"latencyMs":4.44}
{"event":"client_connected","actorId":"alice","lastKnownVersion":2,"canonicalVersion":3,"snapshotRecovery":true}
{"event":"operation_result","operationType":"property.set","baseVersion":3,"result":"accepted","canonicalVersion":4,"latencyMs":4.74}
```

`section.setCompleted` 只提交一次业务 intent。E2E 解析 Bob 的 WebSocket canonical frame，断言同一个 v2 event 同时包含 task `entityUpsert`、`/completion/percent` 与 `/revision` patches；Alice、Bob 均显示 `1/2 completed`、`50%`。

故障段中 Alice v2 断线；Bob 推进到 v3；Alice 以 `lastKnownVersion=2` 重连并收到 v3 snapshot；其 pending intent 改写 baseVersion 为 3 后重放，被接受为 v4。最终 canonical version 4、pending 0、reconnect 1、resync 0。

## BlockNote 验收

最终 trace 文档：`blocknote-e2e-1787818499184`。

```json
{"event":"client_connected","actorId":"alice","lastKnownVersion":0,"canonicalVersion":0}
{"event":"operation_result","operationType":"block.update","result":"accepted","canonicalVersion":1,"payloadBytes":265}
{"event":"operation_result","operationType":"block.insert","result":"accepted","canonicalVersion":3,"payloadBytes":310}
{"event":"client_connected","actorId":"alice","lastKnownVersion":2,"canonicalVersion":3}
{"event":"operation_result","operationType":"block.insert","result":"accepted","canonicalVersion":4,"payloadBytes":312}
{"event":"operation_result","operationType":"block.move","result":"accepted","canonicalVersion":9,"payloadBytes":70}
```

Alice 在 v2 断线；Bob 插入块推进到 v3；Alice 以 v2 重连取得 snapshot，并把离线 insert 重放为 v4。随后 5 个真实 BlockNote move transaction 推进到 v9，两端顺序一致。E2E 同时解析双方 WebSocket frame，断言 submit payload 只有单块 `block`，不存在 `document` 或 `blocks`，且远端 projection 不产生回声 update。

### 双客户端冒烟视频

[播放 26 秒视频](assets/collabhub-blocknote-smoke.mp4)：1920×1080、H.264、30 fps。Alice 与 Bob 来自两个独立 Chromium BrowserContext，鼠标移动 0.8–1.0 秒、按键间隔 92 ms；只有 Alice 在故障段断网。

录制 trace：`blocknote-smoke-1787819407857`。

```json
{"event":"alice_typing_converged","aliceVersion":"2","bobVersion":"2"}
{"event":"bob_insert_converged","aliceVersion":"3","bobVersion":"3"}
{"event":"alice_offline_pending","aliceVersion":"3","bobVersion":"3","alicePending":"1"}
{"event":"bob_advances_canonical","aliceVersion":"3","bobVersion":"4","alicePending":"1"}
{"event":"reconnect_replay_converged","aliceVersion":"5","bobVersion":"5","alicePending":"0","aliceRecovery":"1 / 0"}
{"event":"block_order_converged","aliceVersion":"10","bobVersion":"10","alicePending":"0"}
```

<p>
  <img src="assets/blocknote-alice.png" alt="BlockNote Alice acceptance" width="49%">
  <img src="assets/blocknote-bob.png" alt="BlockNote Bob acceptance" width="49%">
</p>

## React Flow 验收

录制文档：`react-flow-smoke-1787824705658`。左右画面来自两个独立 Chromium BrowserContext；视频为 1920×820、H.264、30 fps，鼠标移动 0.7–0.9 秒，按键间隔 82 ms。

```json
{"event":"node_add_converged","aliceVersion":"1","bobVersion":"1"}
{"event":"rename_coalesced","aliceVersion":"2","bobVersion":"2"}
{"event":"drag_stop_converged","aliceVersion":"3","bobVersion":"3","aliceMoves":"1"}
{"event":"offline_pending","aliceVersion":"3","bobVersion":"3","bobPending":"1"}
{"event":"online_client_advanced","aliceVersion":"4","bobVersion":"3","bobPending":"1"}
{"event":"reconnect_converged","aliceVersion":"5","bobVersion":"5","bobPending":"0","bobRecovery":"1 / 0"}
{"event":"linked_delete_converged","aliceVersion":"6","bobVersion":"6","alicePending":"0","bobPending":"0"}
```

浏览器验收还断言：断线操作未提前出现在 Alice；重连后两端均为 6 个节点；删除 Build 的一个 `node.delete` 在 v6 同步节点删除与两条关联边删除，两端均显示 `5 nodes · 0 edges`。

Server trace 中 `node.add` 108 bytes、`node.rename` 64 bytes、`node.move` 66 bytes、`node.delete` 39 bytes；编辑热路径没有完整 graph。全新浏览器会话控制台为 0 errors / 0 warnings。

## 验收矩阵

| 场景 | 自动化证据 |
|---|---|
| 同属性并发 LWW | `server-core.test.ts`，两 baseVersion=0 op 收敛到服务端后到值 |
| section 并发移动 | 同上，fractional positions 唯一且顺序确定 |
| 重复投递 | 同上，duplicate=true 且版本不增加；重启恢复仍去重 |
| reject-if-stale | 同上，strict transaction rejected / staleVersion |
| resyncRequired | 同上，超过 recovery window 返回 snapshotRef |
| snapshot + WAL recovery | 同上，从 v2 snapshot 回放 v3 WAL |
| 断线重连与 pending replay | `client-core.test.ts` + 双浏览器 e2e |
| REST baseline | `draft-domain.test.ts` 与真实 REST API |
| 服务端权威联动 | `draft-domain-pack.test.ts` + 双浏览器 WebSocket frame；一个 op 原子同步任务、汇总与 revision |
| REST/Collab transport 切换 | 双浏览器 e2e；两端退出后 REST 命令成功 |
| 防双写 | 活跃协同时 e2e 的 REST PUT 返回 409 collaborativeSessionActive |
| host import boundary | components/domain 扫描测试禁止 `@collabhub/*` |
| BlockNote 富文本增量更新 | `blocknote.spec.ts` 检查真实输入同步及 WebSocket 单块 payload |
| BlockNote 插入与排序 | 双浏览器 e2e 检查 `block.insert`、`block.move` 与最终顺序 |
| BlockNote 断线恢复 | Alice 离线 pending，Bob 推进版本，Alice snapshot recovery 后重放 |
| BlockNote 依赖边界 | components/application/domain 禁止 `@collabhub/*`；canonical domain/server pack 禁止 `@blocknote/*` |
| React Flow 增量图操作 | adapter 测试断言 `node.move` payload 不含完整 nodes/edges |
| React Flow 拖拽合并 | 真实双客户端验收中多帧拖拽只产生 1 个 `node.move` |
| React Flow 断线恢复 | Bob pending 1，Alice 推进版本，Bob 重连重放后双方 v5 / pending 0 |
| React Flow 联动删除 | 一个 `node.delete` 原子发布节点与两条关联边删除，双方 v6 收敛 |
| React Flow 依赖边界 | components/application/domain 禁止 `@collabhub/*`；canonical domain/server pack 禁止 `@xyflow/*` |

## 分布式 runtime 验收

本机独立进程模式的 TODO List 双浏览器、真实 worker 退出与恢复证据见[本地多进程验收](acceptance-local-process-cluster.md)。

容器栈：Node.js 22、PostgreSQL 16、Redis 7.2、Nginx 1.27；两个 Gateway、两个 Room Worker。Gateway 直连端口 `7001/7002`，Nginx 负载均衡端口 `7090`。运行镜像使用 UID/GID `10001:10001`，本机 arm64 镜像约 80.4 MB。

```bash
docker compose -f deploy/docker-compose.yml up --build -d
pnpm smoke:distributed
docker buildx build --platform linux/amd64,linux/arm64 --output type=cacheonly .
```

最终故障文档：`smoke-1787828374147`。Alice 连接 Gateway 1，Bob 连接 Gateway 2；冒烟脚本主动停止 PostgreSQL 记录的当前 writer，验证接管后自动恢复该 Worker。Charlie 经 Nginx `7090` WebSocket 入口恢复状态。

```json
{"event":"dual_gateway_ready","aliceVersion":0,"bobVersion":0}
{"event":"cross_gateway_converged","canonicalVersion":1}
{"event":"duplicate_receipt","duplicate":true,"canonicalVersion":1}
{"event":"operation_id_collision_rejected","canonicalVersion":1}
{"event":"presence_ephemeral","canonicalVersion":1,"boundActorId":"alice"}
{"event":"owner_stopped","owner":"worker-1"}
{"event":"owner_failover_converged","from":"worker-1","canonicalVersion":2}
{"event":"rest_uses_authoritative_path","canonicalVersion":3}
{"event":"snapshot_recovery","canonicalVersion":3,"title":"REST through authority"}
```

故障后 PostgreSQL 权威状态：`canonical_version=3`、`owner_epoch=2`、`owner_instance_id=worker-2`、`snapshot_version=2`。同文档有 3 条 WAL、3 条 receipt、3 条已投递 outbox；Presence 后版本仍为 1。Charlie 从不可变 v2 snapshot + v3 WAL 恢复到 v3。`linux/amd64` 与 `linux/arm64` 双平台 Docker buildx 构建退出码均为 0。

500-op 基线文档 `distributed-1787828190944`：32 并发、Gateway 1 HTTP ingress、Gateway 2 WebSocket observer；accepted 434.5 op/s、跨 Gateway 完整收敛 397.5 op/s，请求 p50/p95/p99 为 67.23/103.96/111.72 ms。PostgreSQL 最终 v500、snapshot v500、500 WAL/receipt/delivered outbox。该结果来自本机 Colima 4C8G 共享容器栈，仅用于回归，不是 2C4G 云 VM SLO。

| 场景 | 真实证据 |
|---|---|
| 跨 Gateway 广播 | Alice v1 accepted；另一 Gateway 的 Bob 收到同一 v1 canonical |
| 持久幂等 | 相同 operation 返回 `duplicate=true`；同 operationId 不同 payload 被拒绝，head 保持 v1 |
| 身份绑定 | spoofed Presence 被改写为 hello 绑定的 Alice/document |
| Presence 临时态 | 广播后 PostgreSQL canonical version 不变 |
| writer 故障迁移 | worker-1 停止；worker-2 以 epoch 2 接管并提交 v2 |
| REST 单写 | HTTP operation API 提交 v3；两个 WebSocket 客户端同步收到 canonical |
| snapshot + WAL | snapshot pointer v2；新客户端恢复为 v3 |
| OCI 多架构 | Dockerfile 对 linux/amd64、linux/arm64 均完整构建 |

## 可复现命令

```bash
pnpm install
pnpm check
pnpm test:e2e
pnpm dev
pnpm dev:blocknote
pnpm dev:react-flow
# 另开终端
pnpm record:todo-list
pnpm record:blocknote
pnpm record:react-flow
docker compose -f deploy/docker-compose.yml up --build -d
pnpm smoke:distributed
```
