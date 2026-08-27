<h1 align="center">CollabHub</h1>

<p align="center"><strong>给现有应用外挂多人协同。</strong></p>

<p align="center">
  不接管领域模型，不要求迁移 CRDT。<br>
  协同代码收敛在 Transport、Adapter 与 Domain Pack，业务组件保持原样。
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1-1f6f4a">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-4c566a">
</p>

<p align="center">
  <a href="#案例">案例</a> ·
  <a href="#接入案例">接入案例</a> ·
  <a href="docs/architecture/overview.md">架构文档</a>
</p>

| 宿主继续拥有 | 协同只新增 | 关闭协同 |
|---|---|---|
| Domain、Store、React Components | Command Transport、Projection Adapter、Domain Pack | 切回原 REST transport |

## Features

| 能力 | 保证 |
|---|---|
| **Server authoritative** | 服务端定序、校验并发布 canonical patch |
| **Host-owned domain** | 无需迁移到 CollabHub 或 CRDT 数据模型 |
| **Pluggable strategies** | LWW、实体生命周期、列表排序、严格事务 |
| **Reliable recovery** | 幂等 operation、pending replay、WAL、snapshot recovery |
| **Single writer** | 协同会话内阻止 REST 与 room 双写 |
| **Ephemeral presence** | presence 不进入 WAL、snapshot 或文档版本 |

## 案例

### 1. TODO List

经典 React 待办清单：保留自己的 Domain、Store、CommandBus 与 REST API，通过 Transport、Adapter 和 Domain Pack 接入协同。

```bash
pnpm dev
```

| 进程 | 地址 |
|---|---|
| Server / REST / WebSocket | `http://127.0.0.1:4100` |
| Alice | `http://127.0.0.1:5173/?client=alice` |
| Bob | `http://127.0.0.1:5174/?client=bob` |

验证通过：任务编辑、排序、断线重放、snapshot recovery、REST/Collab 切换与协同期间防双写。详见 [TODO List 接入说明](docs/integration/todo-list-tutorial.md)。

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

## 接入案例

React 组件不接触 WebSocket 或 operation。应用保留自己的 Store 和 Command，只在 composition root 选择 transport。

```tsx
// 1. 先定义应用自己的端口；React 不依赖 CollabHub
interface CommandTransport {
  execute(command: AppCommand): Promise<void>
  subscribe(listener: (patch: DomainPatch) => void): () => void
  close(): void
}

// 2. 只在 composition root 选择协同或原 REST
function createAppRuntime(options: RuntimeOptions) {
  const store = new AppStore(options.initialDocument)
  const transport: CommandTransport = options.collabEnabled
    ? new CollabHubTransport({
        wsUrl: options.wsUrl,
        documentId: options.documentId,
        actorId: options.actorId,
      })
    : new RestTransport({
        apiBase: options.apiBase,
        documentId: options.documentId,
      })

  transport.subscribe((patch) => store.apply(patch))

  return {
    store,
    execute: (command: AppCommand) => transport.execute(command),
    close: () => transport.close(),
  }
}

// 3. 组件仍只读业务 Store、发送业务 Command
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

`CollabHubTransport` 集中完成 `Command → operation` 和 `canonical patch → DomainPatch`；关闭协同时换回 `RestTransport`，React 组件与领域模型无需修改。

完整实现：[composition root](examples/todo-list-app/src/app/composition-root.ts)、[command adapter](examples/todo-list-app/src/collab/draft-command-adapter.ts)、[projection adapter](examples/todo-list-app/src/collab/draft-projection-adapter.ts)、[server Domain Pack](examples/todo-list-app/server/draft-domain-pack.ts)。

## 仓库结构

```text
packages/
  protocol/        协议与 wire types
  client-core/     pending、重连与 recovery
  server-core/     定序、pipeline、WAL 与 snapshot
  strategy-sdk/    Strategy 与 Domain Pack SPI
  domain-json/     默认 JSON strategies
  testkit/         trace 与 conformance helpers
examples/
  todo-list-app/   REST baseline 与协同接入样板
  blocknote-app/   BlockNote 增量块协同适配
docs/              架构、接入与验收文档
```

## 开发手册

要求 Node.js 22+、pnpm 10+。

```bash
pnpm install
pnpm dev             # TODO List server + Alice + Bob
pnpm record:todo-list # 另开终端录制 TODO List 冒烟视频
pnpm dev:blocknote   # BlockNote server + Alice + Bob
pnpm record:blocknote # 另开终端录制 BlockNote 冒烟视频
pnpm check           # build + tests + benchmark
pnpm test:e2e        # 两套双浏览器验收
```

## 文档

- [架构](docs/architecture/overview.md)
- [协议与 Pipeline](docs/architecture/protocol.md)
- [接入条件](docs/integration/readiness.md)
- [TODO List 接入](docs/integration/todo-list-tutorial.md)
- [BlockNote 接入](docs/integration/blocknote.md)
- [验收记录](docs/acceptance.md)
- [已知限制](docs/known-limitations.md)

## License

[Apache-2.0](LICENSE)。BlockNote example 的 `@blocknote/*` 依赖使用 MPL-2.0。
