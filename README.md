<h1 align="center">CollabHub</h1>

<p align="center"><strong>Low-intrusion, server-authoritative collaboration for existing React applications.</strong></p>

<p align="center">
  Keep your domain model. Keep your React components. No CRDT migration required.<br>
  Collaboration stays behind Transport, Adapter, and Domain Pack boundaries.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.1-1f6f4a">
  <a href="https://github.com/superche/collabhub/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/superche/collabhub/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-4c566a">
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="docs/getting-started.md">Quick start</a> ·
  <a href="https://collabhub-demo.onrender.com/demo.html">Live demo</a> ·
  <a href="#examples">Examples</a> ·
  <a href="#integration">Integration</a> ·
  <a href="docs/capabilities.md">Capabilities</a>
</p>

| Your app keeps | CollabHub adds | Collaboration off |
|---|---|---|
| Domain, Store, React components | Command Transport, Projection Adapter, Domain Pack | Fall back to the existing REST transport |

> **Release status:** `0.1.1` technical preview for structured React state. It is not a production-ready security or multi-region platform; `v1.0.0` still requires owner approval.

For an existing React app, the default path has two moving parts: one React-facing SDK package and one deployable authoritative service. Protocol, strategies, WAL, reconnect, and room lifecycle stay behind those entries.

## Features

| Capability | Scope |
|---|---|
| **Server authoritative** | The server orders, validates, and publishes canonical patches |
| **Atomic linked updates** | One business intent atomically updates one document's entities, summaries, and derived fields |
| **Host-owned domain** | No migration to a CollabHub or CRDT data model |
| **Pluggable strategies** | LWW, entity lifecycle, list ordering, and strict transactions |
| **Business conflict policy** | Each Domain Pack chooses resolve, reject, or resync for stale operations |
| **Reliable recovery** | Idempotent operations, pending replay, WAL, and snapshot recovery |
| **Horizontal scale** | Reference runtime with stateless Gateways, single-writer Room Workers, PostgreSQL fencing/outbox, and ephemeral Redis routing |
| **Single-writer contract** | The host routes shared mutations through its gateway; the TODO example gates REST while collaboration is active |
| **Ephemeral presence** | Presence never enters WAL, snapshots, or document versions |
| **Public-edge controls** | JWT/JWKS identity binding plus configurable origin, connection, room, and message limits |
| **Two-entry onboarding** | Install `@collabhub/client-core`; deploy `@collabhub/server-ws` or the standalone image |

## Examples

### 1. TODO List

A classic React TODO app keeps its own Domain, Store, CommandBus, REST API, and repository. Transport, Adapter, and Domain Pack add collaboration around it.

```bash
pnpm dev
```

| Process | Address |
|---|---|
| Server / REST / WebSocket | `http://127.0.0.1:4100` |
| Alice | `http://127.0.0.1:5173/?client=alice` |
| Bob | `http://127.0.0.1:5174/?client=bob` |

Linked-update demo: Alice checks one task and sends one `section.setCompleted` intent. The server updates task state, completed count, total count, and progress in one canonical version; Bob receives the complete result.

Verified: authoritative linked updates, business-defined stale-operation rebase, ordering, offline replay, snapshot recovery, REST/Collab switching, and double-write prevention. See the [TODO List integration guide](docs/integration/todo-list-tutorial.en.md).

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

Verified: block-level rich-text updates, block insert/delete/reorder, input coalescing, offline replay, and snapshot recovery. Concurrent text in one top-level block is LWW, not character-level CRDT merge. See the [BlockNote integration guide](docs/integration/blocknote.en.md).

https://github.com/user-attachments/assets/6a90ca9d-ef9b-4d1b-a105-2e542c80b189

*Two-client smoke: rich-text input, offline recovery, and block ordering.*

### 3. React Flow

React Flow runs as a controlled canvas while the host keeps a renderer-independent `GraphDocument`.

```bash
pnpm dev:react-flow
```

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/superche/collabhub)

[Open the live Alice/Bob React Flow demo](https://collabhub-demo.onrender.com/demo.html)

The free deployment opens two React Flow clients against one authoritative graph. Active WebSocket rooms are protected; disconnected rooms expire after 30 minutes, with at most 500 warm rooms. Demo state is in memory. See [demo deployment](docs/demo.md).
Opening the [single-client demo](https://collabhub-demo.onrender.com/) creates a room ID in `?document=...`; share that URL to invite another client.

| Process | Address |
|---|---|
| Server / WebSocket | `http://127.0.0.1:4300` |
| Alice | `http://127.0.0.1:5193/?client=alice` |
| Bob | `http://127.0.0.1:5194/?client=bob` |

Verified: incremental node/edge edits, one commit per completed drag, offline replay, and atomic removal of edges linked to a deleted node. See the [React Flow integration guide](docs/integration/react-flow.en.md).

https://github.com/user-attachments/assets/40594baa-6181-4e9f-a227-4d650c8eac35

*Two-client smoke: node editing, drag coalescing, offline recovery, and linked-edge deletion.*

## Integration

### 1. Deploy the authoritative service

The standalone image persists snapshots and WAL under `/data`:

```bash
docker run --name collabhub -p 4100:4100 -v collabhub-data:/data \
  -e COLLABHUB_ALLOWED_ORIGINS=http://localhost:5173 \
  -e COLLABHUB_ALLOW_INSECURE_DEVELOPMENT_IDENTITY=true \
  -e COLLABHUB_INITIAL_STATE_JSON='{"title":"Untitled"}' \
  ghcr.io/superche/collabhub-standalone:0.1.1
```

Use explicit development identity only for evaluation. Production deployments provide `authenticate`, tenant authorization, TLS, and retention policy. PostgreSQL/Redis is optional until horizontal scale is needed.

The image is built from [deploy/standalone.Dockerfile](deploy/standalone.Dockerfile). A custom Domain Pack can use the same Docker shape when business rules must compute linked patches.

### 2. Connect the existing React app

```bash
npm add @collabhub/client-core@0.1.1
```

Using a private company registry? Add `@collabhub:registry=https://registry.npmjs.org` to the app's `.npmrc`.

Create one file at the composition root. Your components keep reading the existing runtime/store and sending business commands.

```tsx
import { createCollaboration, json } from '@collabhub/client-core'

function createAppRuntime(options: RuntimeOptions) {
  if (!options.collabEnabled) return createRestRuntime(options)

  const store = createCollaboration<AppDocument, AppCommand>({
    url: options.wsUrl,
    documentId: options.documentId,
    actorId: options.actorId,
    initialState: options.initialDocument,
    command: (command) => {
      if (command.type === 'document.rename') return json.set('/title', command.title)
      throw new Error(`Unsupported command: ${command.type}`)
    },
  })

  return {
    store,
    execute: (command: AppCommand) => store.execute(command),
    close: () => store.close(),
  }
}
```

`createCollaboration` owns connection, pending, reconnect, recovery, canonical projection, and diagnostics. `json.set/create/delete/move/transaction` hide protocol and strategy identifiers. Switching back to the REST runtime leaves the domain model and React components unchanged. Follow the [existing React app guide](docs/getting-started.md).

To inspect a complete generated project:

```bash
npm create @collabhub/react@0.1.1 my-collab-app
```

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

Stale intent handling is also owned by the Domain Pack. The operation keeps its original `baseVersion`; safe commands can re-run against current canonical state while strict transactions reject or request resync. See [version and conflict semantics](docs/architecture/protocol.en.md#version-policy).

Reference implementation: [composition root](examples/todo-list-app/src/app/composition-root.ts), [command adapter](examples/todo-list-app/src/collab/draft-command-adapter.ts), [projection adapter](examples/todo-list-app/src/collab/draft-projection-adapter.ts), and [server Domain Pack](examples/todo-list-app/server/draft-domain-pack.ts).

## Repository

```text
packages/
  protocol/           Wire protocol and versioned envelopes
  client-core/        Pending queue, reconnect, and recovery
  server-core/        Ordering, pipeline, WAL, and snapshots
  server-ws/          Standalone WebSocket adapter and room lifecycle
  server-distributed/ PostgreSQL / Redis multi-node runtime
  strategy-sdk/       Strategy and Domain Pack SPI
  domain-json/        Built-in JSON strategies
  testkit/            Trace and conformance helpers
  create-react/       npm create starter for a fresh React project
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
pnpm smoke:fresh-react  # Pack, npm-install, build, and sync a fresh external starter
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
- [Architecture](docs/architecture/overview.en.md)
- [Protocol and pipeline](docs/architecture/protocol.en.md)
- [Horizontal scaling and cloud deployment](docs/architecture/horizontal-scaling.en.md)
- [Local multi-process TODO List smoke](docs/acceptance-local-process-cluster.md)
- [Integration readiness](docs/integration/readiness.en.md)
- [TODO List integration](docs/integration/todo-list-tutorial.en.md)
- [BlockNote integration](docs/integration/blocknote.en.md)
- [React Flow integration](docs/integration/react-flow.en.md)
- [Acceptance evidence](docs/acceptance.en.md)
- [Known limitations](docs/known-limitations.en.md)
- [Release process](docs/releasing.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

## License

[Apache-2.0](LICENSE). The BlockNote example's `@blocknote/*` dependencies are licensed under MPL-2.0.
