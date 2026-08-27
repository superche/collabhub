# CollabHub v0.1

CollabHub 是一个开箱即用、可扩展的中心化多人协同外挂。它只实现 server-authoritative client/server：宿主保留领域模型，通过版本化 operation、canonical patch、Client Core、Server Core、Domain Pack 与 Adapter 接入，不要求改造成某个 CRDT 的内部模型。

v0.1 是一个可本地运行、可测试、可做真实双浏览器验收的单节点开发者预览。它实现了纵向闭环，不把多实例、富文本和生产认证伪装成已交付。

## 60 秒启动

前置条件：Node.js 22+、pnpm 10+。

```bash
pnpm install
pnpm dev
```

一条命令会启动三个进程：

| 进程 | 地址 | 用途 |
|---|---|---|
| CollabHub + Draft API | `http://127.0.0.1:4100` | REST、WebSocket、中心 DraftRepository |
| React client Alice | `http://127.0.0.1:5173/?client=alice` | 第一个真实客户端 |
| React client Bob | `http://127.0.0.1:5174/?client=bob` | 第二个真实客户端 |

浏览器分别打开 Alice 与 Bob 地址，编辑同一个 `launch-plan` 草稿。用 `?draft=another-id` 切换文档，用 `?collab=0` 直接以 REST 单人模式启动。

完整验收：

```bash
pnpm check          # TypeScript + production web build + unit/integration + benchmark
pnpm test:e2e       # 真实 Chromium 双上下文、断线、恢复、单 writer、REST 切换
```

## 已交付能力

- `@collabhub/protocol`：transport-neutral operation envelope、accepted/rejected/resyncRequired、canonical patch、snapshot、presence、capability hello。
- `@collabhub/client-core`：乐观 overlay、pending queue、operation replay、自动重连、snapshot recovery、gap resync、幂等结果处理和 backpressure 上限。
- `@collabhub/server-core`：文档级串行权威会话、可插拔 pipeline hooks、策略注册、invariant、WAL-first commit、snapshot 与重启恢复。
- `@collabhub/strategy-sdk`：Domain Pack、ConflictStrategy、Invariant 和 StrategyRegistry 稳定接口。
- `@collabhub/domain-json`：property LWW、实体 create/delete/restore、fractional list ordering、reject-if-stale 与结构共享 patch apply。
- `@collabhub/testkit`：operation builder 与 golden trace runner。
- `examples/react-draft-app`：独立 DraftDocument / DraftStore / DraftCommandBus / REST API / DraftRepository baseline，以及窄 CollabHub adapter 接入。
- 诊断面：连接状态、pending 数量与字节、canonical version、ack latency、reject、reconnect、resync。

Presence 是单独的 ephemeral WebSocket lane，不进入 WAL、snapshot 或 canonical version。普通编辑只发送 operation 与增量 patch；snapshot 只用于首载与 recovery。

## 仓库结构

```text
packages/
  protocol/        wire contracts，不依赖 WebSocket 或 room runtime
  client-core/     store-neutral optimistic/pending/recovery state machine
  server-core/     authoritative ordering/pipeline/WAL/snapshot
  strategy-sdk/    Domain Pack 与 strategy SPI
  domain-json/     默认 JSON 原语与 canonical patch applier
  testkit/         golden trace/conformance helpers
examples/
  react-draft-app/
    src/domain/          原 Draft 领域，不 import CollabHub
    src/application/     Store、CommandBus、transport port
    src/infrastructure/  REST baseline transport
    src/collab/          command/projection adapters
    src/app/             composition root
    src/components/      React UI，不 import CollabHub
    server/              REST API、Repository、DraftDomainPack
docs/
  architecture/    架构、协议与可靠性边界
  integration/     接入条件与 baseline-to-collab 教程
```

## 单 writer 保证

同一草稿存在活跃 CollabHub 会话时，`POST /commands` 和 `PUT /draft` 返回 `409 collaborativeSessionActive`，不能绕过权威 room 双写。CollabHub 的 WAL commit 通过 `DraftRepositoryStorageAdapter` 更新中心 DraftRepository。全部协同连接退出后，REST 单人写入恢复。

严格命令（示例中的 `draft.submitReview`）使用 `reject-if-stale`，必须在当前 canonical version 上提交。普通 title、section 和排序编辑使用增量 operation/patch。

## 性能保护

- patch apply 使用逐层/逐集合结构共享；不会复制整份 DraftDocument 到网络热路径。
- React 使用 `useSyncExternalStore`，section 使用 memoized component。
- 文本在 blur 时聚合为一条业务命令，避免按键级 operation 风暴。
- pending 默认为最多 100 ops / 256 KB；Draft adapter 收紧为 50 ops / 64 KB。
- `pnpm benchmark` 对 1,000-section 草稿运行 1,000 次单实体 patch 并以 p95 ≤ 4 ms 作为 gate。

## 文档

- [架构与可靠性](docs/architecture/overview.md)
- [稳定协议与 pipeline](docs/architecture/protocol.md)
- [接入条件](docs/integration/readiness.md)
- [REST baseline 到协同接入教程](docs/integration/react-draft-tutorial.md)
- [已知限制与 v0.2 建议](docs/known-limitations.md)

## License

Apache-2.0。项目名称、npm scope 与商标在公开发布前仍需完成正式检索。
