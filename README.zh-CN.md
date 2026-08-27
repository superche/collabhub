<h1 align="center">CollabHub</h1>

<p align="center"><strong>给现有 React 应用低侵入地外挂中心权威协同。</strong></p>

<p align="center">
  不接管领域模型，不要求迁移 CRDT。<br>
  协同代码收敛在 Transport、Adapter 与 Domain Pack，业务组件保持原样。
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-1f6f4a">
  <a href="https://github.com/superche/collabhub/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/superche/collabhub/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-4c566a">
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="docs/getting-started.zh-CN.md">快速接入</a> ·
  <a href="#案例">案例</a> ·
  <a href="#接入案例">接入案例</a> ·
  <a href="docs/capabilities.md">能力矩阵</a>
</p>

| 宿主继续拥有 | 协同只新增 | 关闭协同 |
|---|---|---|
| Domain、Store、React Components | Command Transport、Projection Adapter、Domain Pack | 切回原 REST transport |

> **发布状态：** 当前保持 `0.1.0` 验收版本。包产物与发布门禁已就绪；npm 包和 `v1.0.0` 在仓库所有者批准前不会发布。

## Features

| 能力 | 保证 |
|---|---|
| **Server authoritative** | 服务端定序、校验并发布 canonical patch |
| **Atomic linked updates** | 一个业务 intent 可原子更新实体、汇总与派生字段 |
| **Host-owned domain** | 无需迁移到 CollabHub 或 CRDT 数据模型 |
| **Pluggable strategies** | LWW、实体生命周期、列表排序、严格事务 |
| **Business conflict policy** | Domain Pack 可为旧版本 operation 选择 resolve、reject 或 resync |
| **Reliable recovery** | 幂等 operation、pending replay、WAL、snapshot recovery |
| **Horizontal scale** | 无状态 Gateway、单写 Room Worker、PostgreSQL fencing/outbox、Redis 临时路由 |
| **Single writer** | 协同会话内阻止 REST 与 room 双写 |
| **Ephemeral presence** | presence 不进入 WAL、snapshot 或文档版本 |

## 案例

### 1. TODO List

经典 React 待办清单：保留自己的 Domain、Store、CommandBus 与 REST API，通过 Transport、Adapter 和 Domain Pack 接入协同。

```bash
pnpm dev
```

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/superche/collabhub)

免费部署在 `/demo.html` 左右展示 Alice 与 Bob；服务闲置后可能休眠，Demo 数据为临时数据。详见 [Demo 部署](docs/demo.md)。

| 进程 | 地址 |
|---|---|
| Server / REST / WebSocket | `http://127.0.0.1:4100` |
| Alice | `http://127.0.0.1:5173/?client=alice` |
| Bob | `http://127.0.0.1:5174/?client=bob` |

联动演示：Alice 勾选一项任务，只提交一个 `section.setCompleted` intent；服务端在同一 canonical version 更新任务状态、完成数、任务总数与进度，Bob 同步收到完整结果。

验证通过：权威联动、业务自定义旧版本解冲突、排序、断线重放、snapshot recovery、REST/Collab 切换与协同期间防双写。详见 [TODO List 接入说明](docs/integration/todo-list-tutorial.md)。

https://github.com/user-attachments/assets/58963835-fffe-43ff-875b-617e635ec282

*双客户端冒烟：任务编辑、断线恢复与排序。*

### 2. BlockNote

BlockNote 通过适配器接入中心权威协同，不启用其内置 Yjs provider。

```bash
pnpm dev:blocknote
```

| 进程 | 地址 |
|---|---|
| Server / WebSocket | `http://127.0.0.1:4200` |
| Alice | `http://127.0.0.1:5183/?client=alice` |
| Bob | `http://127.0.0.1:5184/?client=bob` |

验证通过：富文本更新、块增删、块排序、连续输入合并、断线重放与 snapshot recovery。详见 [BlockNote 接入说明](docs/integration/blocknote.md)。

https://github.com/user-attachments/assets/6a90ca9d-ef9b-4d1b-a105-2e542c80b189

*双客户端冒烟：富文本输入、断线恢复与块排序。*

### 3. React Flow

React Flow 作为受控画布接入；宿主继续持有与渲染器无关的 `GraphDocument`。

```bash
pnpm dev:react-flow
```

| 进程 | 地址 |
|---|---|
| Server / WebSocket | `http://127.0.0.1:4300` |
| Alice | `http://127.0.0.1:5193/?client=alice` |
| Bob | `http://127.0.0.1:5194/?client=bob` |

验证通过：节点/边增删、重命名合并、拖拽松手单次提交、断线重放，以及删除节点时原子删除关联边。详见 [React Flow 接入说明](docs/integration/react-flow.md)。

https://github.com/user-attachments/assets/14766fef-c0ba-4bbb-a09e-7a1c9a14536e

*双客户端冒烟：节点编辑、拖拽合并、断线恢复与关联边联动删除。*

## 接入案例

React 组件不接触 WebSocket 或 operation。`CollaborationStore` 托管连接、pending、恢复和 canonical state；应用继续拥有 Command 与 patch 语义。

```tsx
import { CollaborationStore } from '@collabhub/client-core'

// composition-root.ts — 唯一感知 CollabHub 的边界
function createAppRuntime(options: RuntimeOptions) {
  if (!options.collabEnabled) return createRestRuntime(options)

  const store = new CollaborationStore<AppDocument, AppCommand>({
    url: options.wsUrl,
    tenantId: options.tenantId,
    documentId: options.documentId,
    actorId: options.actorId,
    clientId: crypto.randomUUID(),
    schemaVersion: '1.0',
    initialState: options.initialDocument,
    applyPatches,
    adaptCommand,
  })

  return {
    store,
    execute: (command: AppCommand) => store.execute(command),
    close: () => store.close(),
  }
}

// 组件仍只读业务 Store、发送业务 Command
function DocumentTitle({ runtime }: { runtime: AppRuntime }) {
  const document = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.getSnapshot,
  )
  const [title, setTitle] = useState(document.title)

  useEffect(() => setTitle(document.title), [document.title])

  return (
    <input
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => runtime.execute({ type: 'document.rename', title })}
    />
  )
}
```

`adaptCommand` 负责 `Command → operation`，`applyPatches` 负责 `canonical patch → AppDocument`。切回 REST runtime 时，React 组件与领域模型无需修改。详见 [React 快速接入](docs/getting-started.zh-CN.md)。

业务联动放在服务端 Domain Pack。客户端发送 intent，不提交权威计算结果：

```ts
resolve({ currentState, operation }) {
  const command = operation.payload as AppCommand
  const next = applyCommand(currentState, command)

  return {
    kind: 'accept',
    patches: diffCanonicalState(currentState, next),
  }
}
```

`patches` 在一个 canonical version 中校验、写 WAL 并广播；其他设备不会看到只更新一半的中间状态。

旧版本 intent 也由 Domain Pack 决策。operation 保留原始 `baseVersion`；安全命令可基于当前权威状态重算，严格事务则拒绝或要求 resync。详见[版本与冲突语义](docs/architecture/protocol.md#版本与冲突)。

完整实现：[composition root](examples/todo-list-app/src/app/composition-root.ts)、[command adapter](examples/todo-list-app/src/collab/draft-command-adapter.ts)、[projection adapter](examples/todo-list-app/src/collab/draft-projection-adapter.ts)、[server Domain Pack](examples/todo-list-app/server/draft-domain-pack.ts)。

## 仓库结构

```text
packages/
  protocol/           协议与 wire types
  client-core/        pending、重连与 recovery
  server-core/        定序、pipeline、WAL 与 snapshot
  server-distributed/ PostgreSQL / Redis 多节点 runtime
  strategy-sdk/       Strategy 与 Domain Pack SPI
  domain-json/        默认 JSON strategies
  testkit/            trace 与 conformance helpers
examples/
  todo-list-app/      REST baseline 与协同接入样板
  blocknote-app/      BlockNote 增量块协同适配
  react-flow-app/     React Flow 增量图协同适配
docs/                 架构、接入与验收文档
```

## 开发手册

要求 Node.js 22+、pnpm 10+。

```bash
pnpm install
pnpm dev                # TODO List server + Alice + Bob
pnpm dev:blocknote      # BlockNote server + Alice + Bob
pnpm dev:react-flow     # React Flow server + Alice + Bob
pnpm check              # build + tests + benchmark
pnpm test:e2e           # 双浏览器回归验收
pnpm smoke:demo         # 生产 bundle + 双窗口公开 Demo
pnpm release:check      # 包元数据、ESM/types、tarball 审计

# 本机独立进程：2 Gateway + 2 Worker + 2 TODO List 前端
pnpm dev:todo-cluster
pnpm smoke:todo-cluster # worker 故障迁移、联动更新、离线重放

# 全容器分布式 runtime
docker compose -f deploy/docker-compose.yml up --build -d
pnpm smoke:distributed
```

录制命令：`pnpm record:todo-list`、`pnpm record:blocknote`、`pnpm record:react-flow`。

## 文档

- [React 快速接入](docs/getting-started.zh-CN.md)
- [能力矩阵](docs/capabilities.md)
- [免费公开 Demo](docs/demo.md)
- [架构](docs/architecture/overview.md)
- [协议与 Pipeline](docs/architecture/protocol.md)
- [水平扩容与云部署](docs/architecture/horizontal-scaling.md)
- [本地多进程 TODO List 冒烟](docs/acceptance-local-process-cluster.md)
- [接入条件](docs/integration/readiness.md)
- [TODO List 接入](docs/integration/todo-list-tutorial.md)
- [BlockNote 接入](docs/integration/blocknote.md)
- [React Flow 接入](docs/integration/react-flow.md)
- [验收记录](docs/acceptance.md)
- [已知限制](docs/known-limitations.md)
- [发布流程](docs/releasing.md)
- [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md) · [变更记录](CHANGELOG.md)

## License

[Apache-2.0](LICENSE)。BlockNote example 的 `@blocknote/*` 依赖使用 MPL-2.0。
