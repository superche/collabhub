# v0.1 验收记录

日期：2026-08-27（Asia/Shanghai）  
环境：macOS arm64、Node.js v24.18.0、pnpm 10.11.0、Playwright Chromium 151.0.7922.34。

## 最终 gate

`pnpm check`：通过。

- TypeScript project references：通过。
- Vite production build：40 modules；JS 211.14 KB / 65.78 KB gzip，CSS 3.65 KB / 1.41 KB gzip。
- Vitest：4 files / 10 tests passed。
- 1,000-section patch benchmark：1,000 samples，p95 0.011 ms，gate 4 ms，通过。

`pnpm test:e2e`：1 test passed（3.1 s；case 1.5 s）。

## 真实进程与网络

最终 Playwright webServer 启动的是 `pnpm dev` 同一交付命令：

| 角色 | 最终验收 PID | 监听 |
|---|---:|---|
| Draft API + CollabHub WebSocket | 24743 | `127.0.0.1:4100`, `/collab` |
| React Alice Vite | 24721 | `127.0.0.1:5173` |
| React Bob Vite | 24727 | `127.0.0.1:5174` |

Alice 与 Bob 使用两个独立 Chromium BrowserContext，而不是一个模拟 store。Server、两个 Vite client 和浏览器均由 Playwright 在验收结束后正常回收。

## 故障 trace

最终 trace 文档：`e2e-1787813081729`。

```json
{"event":"client_connected","actorId":"alice","lastKnownVersion":0,"canonicalVersion":0,"snapshotRecovery":false}
{"event":"client_connected","actorId":"bob","lastKnownVersion":0,"canonicalVersion":0,"snapshotRecovery":false}
{"event":"operation_result","operationType":"property.set","baseVersion":0,"result":"accepted","canonicalVersion":1,"latencyMs":6.21}
{"event":"operation_result","operationType":"property.set","baseVersion":1,"result":"accepted","canonicalVersion":2,"latencyMs":3.04}
{"event":"client_connected","actorId":"alice","lastKnownVersion":1,"canonicalVersion":2,"snapshotRecovery":true}
{"event":"operation_result","operationType":"property.set","baseVersion":2,"result":"accepted","canonicalVersion":3,"latencyMs":2.26}
```

这条 trace 证明：Alice v1 断线；Bob 推进到 v2；Alice 以 `lastKnownVersion=1` 重连并收到 v2 snapshot；其 pending intent 改写 baseVersion 为 2 后重放，被接受为 v3。截图中的诊断面显示 canonical version 3、pending 0、reconnect 1、resync 0。

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
| REST/Collab transport 切换 | 双浏览器 e2e；两端退出后 REST 命令成功 |
| 防双写 | 活跃协同时 e2e 的 REST PUT 返回 409 collaborativeSessionActive |
| host import boundary | components/domain 扫描测试禁止 `@collabhub/*` |

## 可复现命令

```bash
pnpm install
pnpm check
pnpm test:e2e
pnpm dev
```
