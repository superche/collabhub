<h1 align="center">CollabHub</h1>

<p align="center"><strong>Low-intrusion, server-authoritative collaboration for existing React applications.</strong></p>

<p align="center">
  Keep your domain model. Keep your React components. No CRDT migration required.<br>
  Collaboration stays behind Transport, Adapter, and Domain Pack boundaries.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-1f6f4a">
  <a href="https://github.com/superche/collabhub/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/superche/collabhub/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-4c566a">
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="docs/getting-started.md">Quick start</a> ·
  <a href="#examples">Examples</a> ·
  <a href="#integration">Integration</a> ·
  <a href="docs/capabilities.md">Capabilities</a>
</p>

| Your app keeps | CollabHub adds | Collaboration off |
|---|---|---|
| Domain, Store, React components | Command Transport, Projection Adapter, Domain Pack | Fall back to the existing REST transport |

> **Release status:** `0.1.0` validation. Package artifacts and release gates are ready, but npm packages and `v1.0.0` are intentionally unpublished pending owner approval.

## Features

| Capability | Guarantee |
|---|---|
| **Server authoritative** | The server orders, validates, and publishes canonical patches |
| **Atomic linked updates** | One business intent atomically updates entities, summaries, and derived fields |
| **Host-owned domain** | No migration to a CollabHub or CRDT data model |
| **Pluggable strategies** | LWW, entity lifecycle, list ordering, and strict transactions |
| **Reliable recovery** | Idempotent operations, pending replay, WAL, and snapshot recovery |
| **Horizontal scale** | Stateless Gateways, single-writer Room Workers, PostgreSQL fencing/outbox, and ephemeral Redis routing |
| **Single writer** | REST cannot bypass an active collaborative room |
| **Ephemeral presence** | Presence never enters WAL, snapshots, or document versions |

## Examples

### 1. TODO List

A classic React TODO app keeps its own Domain, Store, CommandBus, REST API, and repository. Transport, Adapter, and Domain Pack add collaboration around it.

```bash
pnpm dev
```

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/superche/collabhub)

The free deployment opens Alice and Bob side by side at `/demo.html`. It can sleep when idle and stores only ephemeral demo data. See [demo deployment](docs/demo.md).

| Process | Address |
|---|---|
| Server / REST / WebSocket | `http://127.0.0.1:4100` |
| Alice | `http://127.0.0.1:5173/?client=alice` |
| Bob | `http://127.0.0.1:5174/?client=bob` |

Linked-update demo: Alice checks one task and sends one `section.setCompleted` intent. The server updates task state, completed count, total count, and progress in one canonical version; Bob receives the complete result.

Verified: authoritative linked updates, editing, ordering, offline replay, snapshot recovery, REST/Collab switching, and double-write prevention. See the [TODO List integration guide](docs/integration/todo-list-tutorial.md).

https://github.com/user-attachments/assets/58963835-fffe-43ff-875b-617e635ec282

*Two-client smoke: task editing, offline recovery, and ordering.*

### 2. BlockNote

BlockNote connects through an adapter to the server-authoritative core without enabling its built-in Yjs provider.

```bash
pnpm dev:blocknote
```

| Process | Address |
|---|---|
| Server / WebSocket | `http://127.0.0.1:4200` |
| Alice | `http://127.0.0.1:5183/?client=alice` |
| Bob | `http://127.0.0.1:5184/?client=bob` |

Verified: rich-text updates, block insert/delete/reorder, input coalescing, offline replay, and snapshot recovery. See the [BlockNote integration guide](docs/integration/blocknote.md).

https://github.com/user-attachments/assets/6a90ca9d-ef9b-4d1b-a105-2e542c80b189

*Two-client smoke: rich-text input, offline recovery, and block ordering.*

### 3. React Flow

React Flow runs as a controlled canvas while the host keeps a renderer-independent `GraphDocument`.

```bash
pnpm dev:react-flow
```

| Process | Address |
|---|---|
| Server / WebSocket | `http://127.0.0.1:4300` |
| Alice | `http://127.0.0.1:5193/?client=alice` |
| Bob | `http://127.0.0.1:5194/?client=bob` |

Verified: node/edge lifecycle, rename coalescing, one commit per completed drag, offline replay, and atomic removal of edges linked to a deleted node. See the [React Flow integration guide](docs/integration/react-flow.md).

https://github.com/user-attachments/assets/14766fef-c0ba-4bbb-a09e-7a1c9a14536e

*Two-client smoke: node editing, drag coalescing, offline recovery, and linked-edge deletion.*

## Integration

React components never touch WebSocket or collaboration operations. `CollaborationStore` owns connection, pending, recovery, and canonical state; your application owns commands and patch semantics.

```tsx
import { CollaborationStore } from '@collabhub/client-core'

// composition-root.ts — the only CollabHub-aware boundary
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

// React still reads a Store and sends business Commands.
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

`adaptCommand` owns `Command → operation`; `applyPatches` owns `canonical patch → AppDocument`. Switching to the REST runtime leaves React components and the domain model unchanged. Follow the [React quick start](docs/getting-started.md).

Linked business rules stay in the server Domain Pack. Clients send intent, not authoritative computed state:

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

The server validates, writes, and broadcasts all `patches` in one canonical version. Other devices never observe a partial linked update.

Reference implementation: [composition root](examples/todo-list-app/src/app/composition-root.ts), [command adapter](examples/todo-list-app/src/collab/draft-command-adapter.ts), [projection adapter](examples/todo-list-app/src/collab/draft-projection-adapter.ts), and [server Domain Pack](examples/todo-list-app/server/draft-domain-pack.ts).

## Repository

```text
packages/
  protocol/           Wire protocol and versioned envelopes
  client-core/        Pending queue, reconnect, and recovery
  server-core/        Ordering, pipeline, WAL, and snapshots
  server-distributed/ PostgreSQL / Redis multi-node runtime
  strategy-sdk/       Strategy and Domain Pack SPI
  domain-json/        Built-in JSON strategies
  testkit/            Trace and conformance helpers
examples/
  todo-list-app/      REST baseline and collaboration integration
  blocknote-app/      Incremental BlockNote adapter
  react-flow-app/     Incremental React Flow adapter
docs/                 Architecture, integration, and acceptance
```

## Development

Requires Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm dev                # TODO List server + Alice + Bob
pnpm dev:blocknote      # BlockNote server + Alice + Bob
pnpm dev:react-flow     # React Flow server + Alice + Bob
pnpm check              # Build + tests + benchmark
pnpm test:e2e           # Real two-browser regression
pnpm smoke:demo         # Production bundle + two-frame public demo
pnpm release:check      # Package metadata, ESM/types, tarball audit

# Local independent processes: 2 Gateways + 2 Workers + 2 TODO clients
pnpm dev:todo-cluster
pnpm smoke:todo-cluster # Worker failover, linked update, offline replay

# Fully containerized distributed runtime
docker compose -f deploy/docker-compose.yml up --build -d
pnpm smoke:distributed
```

Recording commands: `pnpm record:todo-list`, `pnpm record:blocknote`, and `pnpm record:react-flow`.

## Documentation

- [React quick start](docs/getting-started.md)
- [Capability matrix](docs/capabilities.md)
- [Free public demo](docs/demo.md)
- [Architecture](docs/architecture/overview.md)
- [Protocol and pipeline](docs/architecture/protocol.md)
- [Horizontal scaling and cloud deployment](docs/architecture/horizontal-scaling.md)
- [Local multi-process TODO List smoke](docs/acceptance-local-process-cluster.md)
- [Integration readiness](docs/integration/readiness.md)
- [TODO List integration](docs/integration/todo-list-tutorial.md)
- [BlockNote integration](docs/integration/blocknote.md)
- [React Flow integration](docs/integration/react-flow.md)
- [Acceptance evidence](docs/acceptance.md)
- [Known limitations](docs/known-limitations.md)
- [Release process](docs/releasing.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

## License

[Apache-2.0](LICENSE). The BlockNote example's `@blocknote/*` dependencies are licensed under MPL-2.0.
