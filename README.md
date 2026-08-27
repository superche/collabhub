# CollabHub

中心权威、业务无关、可扩展的多人协同内核。

宿主保留自己的领域模型，通过 operation、canonical patch 与 Domain Pack 接入。

## Features

- **Server authoritative**：服务端定序、校验并发布 canonical patch。
- **Host-owned domain**：不要求宿主迁移到 CRDT 数据模型。
- **Pluggable strategies**：支持 LWW、实体生命周期、列表排序与严格事务。
- **Reliable recovery**：幂等 operation、pending replay、WAL 与 snapshot recovery。
- **Single writer**：协同会话内阻止 REST 与 room 双写。
- **Ephemeral presence**：presence 不进入 WAL、snapshot 或文档版本。

## 案例

### 1. TODO List

最小协同示例，覆盖任务增删、状态修改、排序与在线成员。规划中。

## 接入案例

现有 React 组件不接触 WebSocket 或 operation。应用层保留自己的 Store 和 Command，只在 composition root 切换 transport。

```tsx
// 1. 用业务 Command 定义一个稳定端口
interface DraftCommandTransport {
  execute(command: DraftCommand): Promise<DraftCommandResult>
  subscribe(listener: (event: DraftDomainEvent) => void): () => void
  close(): void
}

// 2. 在 composition root 接入 CollabHub；关闭协同时仍走原 REST
function createDraftRuntime({ collabEnabled, draftId, actorId }: {
  collabEnabled: boolean
  draftId: string
  actorId: string
}) {
  const store = new DraftStore(initialDraft(draftId))
  const transport: DraftCommandTransport = collabEnabled
    ? new CollabHubDraftTransport(
        'ws://127.0.0.1:4100/collab', actorId, crypto.randomUUID(), store,
      )
    : new RestDraftTransport('http://127.0.0.1:4100', draftId)

  transport.subscribe((event) => store.publish(event))

  return {
    store,
    commands: new DraftCommandBus(transport),
  }
}

// 3. 组件仍然是普通 React：读 Store，发业务 Command
function DraftTitle({ store, commands }: ReturnType<typeof createDraftRuntime>) {
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [title, setTitle] = useState(draft.title)

  useEffect(() => setTitle(draft.title), [draft.title]) // 接收远端 canonical patch

  return (
    <input
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => commands.execute({ type: 'draft.rename', title })}
    />
  )
}
```

`CollabHubDraftTransport` 集中完成 `Command → operation` 和 `canonical patch → DraftDomainEvent`；React 组件与领域模型无需 import CollabHub。

参考实现：[composition root](examples/react-draft-app/src/app/composition-root.ts)、[command adapter](examples/react-draft-app/src/collab/draft-command-adapter.ts)、[projection adapter](examples/react-draft-app/src/collab/draft-projection-adapter.ts)、[server Domain Pack](examples/react-draft-app/server/draft-domain-pack.ts)。

<a href="docs/assets/collabhub-v0.1-smoke.mp4">
  <img src="docs/assets/collabhub-smoke-poster.jpg" alt="CollabHub multiplayer smoke test" width="100%">
</a>

[播放双客户端冒烟视频](docs/assets/collabhub-v0.1-smoke.mp4)

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
  react-draft-app/ REST baseline 与协同接入样板
docs/              架构、接入与验收文档
```

## 开发手册

要求 Node.js 22+、pnpm 10+。

```bash
pnpm install
pnpm dev       # server + Alice + Bob
pnpm check     # build + tests + benchmark
pnpm test:e2e  # 双浏览器验收
```

| 服务 | 地址 |
|---|---|
| Server / REST / WebSocket | `http://127.0.0.1:4100` |
| Alice | `http://127.0.0.1:5173/?client=alice` |
| Bob | `http://127.0.0.1:5174/?client=bob` |

## 文档

- [架构](docs/architecture/overview.md)
- [协议与 Pipeline](docs/architecture/protocol.md)
- [接入条件](docs/integration/readiness.md)
- [React Draft 接入](docs/integration/react-draft-tutorial.md)
- [验收记录](docs/acceptance.md)
- [已知限制](docs/known-limitations.md)

## License

[Apache-2.0](LICENSE)
