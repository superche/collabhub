# CollabHub v0.1

**给已有应用外挂多人协同，不接管你的领域模型。**

CollabHub 是开箱即用、可扩展的中心权威协同内核。宿主继续拥有自己的 Document、Store、Command 和 REST API；协同能力集中在 operation adapter、canonical-patch projection 与服务端 Domain Pack，不要求把业务重写成某个 CRDT 的内部数据结构。

`Server-authoritative` · `Host-owned domain` · `Pluggable strategies` · `REST fallback` · `No P2P` · `Apache-2.0`

## 业务接入：保留原 Command，只替换 Transport

React 组件仍然只调用宿主业务命令。关闭协同时走原 REST，开启协同时由窄 adapter 映射 operation；canonical patch 再投影回原 DraftStore。

```ts
// 原业务边界：components/domain 不 import @collabhub/*
interface DraftCommandTransport {
  execute(command: DraftCommand): Promise<DraftCommandResult>
  subscribe(listener: (event: DraftDomainEvent) => void): () => void
}

// composition root：同一套 UI / CommandBus 可在 REST 与协同间切换
const transport: DraftCommandTransport = collabEnabled
  ? new CollabHubDraftTransport(
      'ws://127.0.0.1:4100/collab', actorId, clientId, draftStore,
    )
  : new RestDraftTransport('http://127.0.0.1:4100', draftId)

const commandBus = new DraftCommandBus(transport)
await commandBus.execute({ type: 'draft.rename', title: 'Launch plan' })

// client adapter：业务 Command -> 版本化 operation；只发送增量 intent
const operation = adaptDraftCommand(command, draftStore.getSnapshot())
await collabClient.submit(operation, operation.optimisticPatches)

// projection adapter：canonical patch -> 原业务 DraftDocument / DraftStore
collabClient.subscribe((canonicalDraft) => {
  draftStore.publish({ type: 'draft.changed', draft: canonicalDraft })
})

// server：扩展业务语义，不修改 Server Core
export const DraftDomainPack = defineDomainPack({
  id: 'example.draft',
  schemaVersion: '1.0',
  strategies: jsonStrategies, // property LWW / entity / list / reject-if-stale
  invariants: [uniqueSectionId, validDraftStatus],
  initialState: (documentId) => initialDraft(documentId),
})
```

完整可运行接入见 [`examples/react-draft-app`](examples/react-draft-app) 和 [baseline → collaboration 教程](docs/integration/react-draft-tutorial.md)。

## Feature Highlights

| 能力 | CollabHub v0.1 提供什么 |
|---|---|
| **中心权威收敛** | 单文档串行定序；客户端消费 `accepted / rejected / resyncRequired` 与 canonical patch |
| **宿主低侵入** | React components、Draft domain、Store 与 CommandBus 不依赖 CollabHub；协同依赖集中在 adapter/composition root |
| **可插拔业务语义** | Strategy SDK + Domain Pack；内置 property LWW、实体生命周期、fractional list order、reject-if-stale |
| **可靠重连** | 幂等 `operationId`、有界 pending queue、自动重连、snapshot + WAL recovery、pending intent replay |
| **防止 split brain** | 协同会话只有一个 writer；REST `POST/PUT` 不能绕过权威 room 双写 |
| **性能与诊断** | 增量 operation/patch、结构共享、输入合并、backpressure；实时观察 version、pending、ack、reject、resync |

Presence 使用独立 ephemeral lane，不写 WAL/snapshot；普通编辑热路径不发送整份业务文档。

## 28 秒真实双客户端冒烟

点击画面播放 1080p MP4。左侧 Alice、右侧 Bob，以人类键鼠速度验证标题、正文、实体新增与列表排序同步，最终两端 `canonical version = 4`、`pending = 0`。

<a href="docs/assets/collabhub-v0.1-smoke.mp4">
  <img src="docs/assets/collabhub-smoke-poster.jpg" alt="CollabHub Alice and Bob multiplayer smoke test" width="100%">
</a>

**[▶ 播放 CollabHub v0.1 多人协同冒烟视频](docs/assets/collabhub-v0.1-smoke.mp4)**

> v0.1 是可本地运行、可测试、经过真实双浏览器故障验收的单节点开发者预览。多实例、生产认证、富文本与 transactional outbox 的边界见 [已知限制](docs/known-limitations.md)。

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
