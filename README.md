<h1 align="center">CollabHub</h1>

<p align="center"><strong>Add real-time collaboration to an existing React app with little code, and keep REST as a fallback.</strong></p>

<p align="center">
  Keep your data model, store, and React components. No CRDT migration required.<br>
  Collaboration code stays in one small integration area instead of spreading through the UI.
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.3-1f6f4a">
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

| Your app keeps | CollabHub adds | When collaboration is off |
|---|---|---|
| Data types, store, React components | One client file and one deployable service | Use the existing REST path |

> **Release status:** `0.1.3` technical preview for structured React state. It is not a production-ready security or multi-region platform; `v1.0.0` still requires owner approval.

An existing React app only needs two things: one deployable service and one SDK at the app startup boundary. CollabHub handles connections, reconnects, recovery, and multi-user messages.

The standalone image is the fast path for new documents and evaluation. Existing database records can stay where they are: load and save them through a `StorageAdapter`, and stop the old REST endpoint from writing the same document while collaboration is active. Client `initialState` only fills the screen before connection; it does not import data into the server.

## Features

| Capability | Scope |
|---|---|
| **Small integration surface** | Keep existing data types, store, components, and REST fallback |
| **Linked changes land together** | One action can update content, counters, and progress without showing a half-finished state |
| **Custom conflict rules** | Your app can accept, reject, or reload when edits arrive late |
| **Automatic recovery** | Reconnect, resend unfinished work, and reload the document when needed |
| **Common edits included** | Field changes, item add/delete, and list ordering |
| **Horizontal scaling** | A PostgreSQL / Redis multi-node runtime is included |
| **Cloud deployment baselines** | Terraform stacks for AWS VM/RDS/ElastiCache and Alibaba Cloud ECS/RDS/Tair |
| **Temporary presence channel** | Cursor and selection messages do not enter document history |
| **Public-edge controls** | Login checks, Origin rules, connection limits, and message-rate limits |
| **Two-step start** | Install `@collabhub/client-core`; deploy `@collabhub/server-ws` or the standalone image |

## Examples

### 1. TODO List

A classic React TODO app keeps its data types, store, command handling, and REST API. Collaboration is selected only at app startup.

```bash
pnpm dev
```

| Process | Address |
|---|---|
| Server / REST / WebSocket | `http://127.0.0.1:4100` |
| Alice | `http://127.0.0.1:5173/?client=alice` |
| Bob | `http://127.0.0.1:5174/?client=bob` |

Linked-update demo: Alice checks one task once. Task state, completed count, total count, and progress update together, so Bob never sees a half-updated page.

Verified: linked updates, app-defined conflict handling, ordering, offline recovery, REST/Collab switching, and double-write prevention. See the [TODO List integration guide](docs/integration/todo-list-tutorial.en.md).

https://github.com/user-attachments/assets/58963835-fffe-43ff-875b-617e635ec282

*Two-client smoke: task editing, offline recovery, and ordering.*

### 2. BlockNote

BlockNote keeps its normal editor API and connects through one integration file without enabling its built-in Yjs provider.

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

The free deployment opens two React Flow pages on the same graph. Rooms stay alive while someone is connected; empty rooms expire after 30 minutes, with at most 500 kept in memory. Demo state is in memory. See [demo deployment](docs/demo.md).
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

Assume your React app already has an `AppRuntime`: components read data from it and call `runtime.execute(command)` after user actions. CollabHub does not need to appear in those components, and you keep your existing data types.

There are only three steps: run the service, map app commands to data changes, and choose collaboration or your existing REST runtime at startup.

### 1. Run the collaboration service

Start locally:

```bash
docker run --name collabhub -p 4100:4100 -v collabhub-data:/data \
  -e COLLABHUB_ALLOWED_ORIGINS=http://localhost:5173 \
  -e COLLABHUB_ALLOW_INSECURE_DEVELOPMENT_IDENTITY=true \
  -e COLLABHUB_INITIAL_STATE_JSON='{"title":"Untitled","cards":[]}' \
  ghcr.io/superche/collabhub-standalone:0.1.3
```

The browser connects to `ws://localhost:4100/collab`. Data stays in the `collabhub-data` Docker volume across container restarts.

`COLLABHUB_INITIAL_STATE_JSON` is the easy path for a new app. If your documents already live in a database, use a `StorageAdapter` to load and save them. Do not let REST and CollabHub write the same document at the same time. See [existing server data](docs/getting-started.md#existing-server-owned-documents).

### 2. Add one collaboration file to the React app

```bash
npm add @collabhub/client-core@0.1.3
```

Create `src/collab/create-collab-runtime.ts`. Its only job is to say which data each app command changes.

```tsx
import { createCollaboration, json } from '@collabhub/client-core'
import type { AppCommand, AppDocument, AppRuntime } from '../app/types'

export function createCollabRuntime(options: {
  wsUrl: string
  documentId: string
  userId: string
  initialDocument: AppDocument
}): AppRuntime {
  const collab = createCollaboration<AppDocument, AppCommand>({
    url: options.wsUrl,
    documentId: options.documentId,
    actorId: options.userId,
    initialState: options.initialDocument,
    command(command) {
      switch (command.type) {
        case 'document.rename': return json.set('/title', command.title)
        case 'card.add': return json.create('cards', command.card.id, command.card)
        case 'card.delete': return json.delete('cards', command.cardId)
        case 'card.move': return json.move('cards', command.cardId, command.afterId)
        default: throw new Error(`Command is not connected yet: ${command.type}`)
      }
    },
  })

  return {
    subscribe: collab.subscribe,
    getSnapshot: () => collab.getSnapshot() as AppDocument,
    execute: (command) => collab.execute(command),
    close: () => collab.close(),
  }
}
```

Common commands are ready to use:

| Your app does | Use |
|---|---|
| Change a field | `json.set('/title', value)` |
| Add an item | `json.create('cards', id, card)` |
| Delete an item | `json.delete('cards', id)` |
| Reorder items | `json.move('cards', id, afterId)` |

The SDK handles connection, reconnect, and reloading after a gap.

### 3. Choose collaboration or REST when the app starts

```tsx
const runtime = import.meta.env.VITE_COLLAB_ENABLED === 'true'
  ? createCollabRuntime({
      wsUrl: 'ws://localhost:4100/collab',
      documentId: 'project-123',
      userId: currentUser.id,
      initialDocument,
    })
  : createRestRuntime() // your existing implementation

createRoot(document.getElementById('root')!).render(<App runtime={runtime} />)
```

Your components do not need to know which runtime is active:

```tsx
import { useSyncExternalStore } from 'react'

function App({ runtime }: { runtime: AppRuntime }) {
  const document = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)

  return <button onClick={() => runtime.execute({
    type: 'document.rename',
    title: 'New title',
  })}>{document.title}</button>
}
```

Turn off `VITE_COLLAB_ENABLED` to use REST again. Components, `AppDocument`, and `AppCommand` stay unchanged.

### 4. Where custom logic goes

| What you want to change | Put it here |
|---|---|
| Add a normal field, item, delete, or reorder command | The `switch` in `src/collab/create-collab-runtime.ts` |
| One action must update several fields together | `server/app-domain-pack.ts` |
| Check whether data is valid | `server/app-domain-pack.ts` |
| Decide whether an older edit can still run | `server/app-domain-pack.ts` |
| Check whether a user may open or edit a document | `authenticate` in the server startup file |
| Save documents in your own database | The server `StorageAdapter` |

For example, “rename the document and update its last-modified time” starts as one client command:

```ts
// src/collab/create-collab-runtime.ts
return json.custom({
  operationType: 'document.renameAndTouch',
  strategyId: 'app.rename-and-touch',
  strategyVersion: '1.0',
  payload: { title: command.title },
})
```

The shared rule runs on the server so every client receives the same result:

```ts
// server/app-domain-pack.ts
const renameAndTouch = {
  id: 'app.rename-and-touch',
  version: '1.0',
  supports: (type: string) => type === 'document.renameAndTouch',
  resolve({ operation }: any) {
    const { title } = operation.payload
    if (!title.trim()) {
      return { kind: 'reject', reason: { code: 'emptyTitle', message: 'Title is required' } }
    }
    return {
      kind: 'accept',
      patches: [
        { op: 'set', path: '/title', value: title },
        { op: 'set', path: '/updatedAt', value: new Date().toISOString() },
      ],
    }
  },
}
```

Add it to the server's `strategies` array. This server-side rule configuration is called a `Domain Pack` in the API. See the runnable [TODO List server rule](examples/todo-list-app/server/draft-domain-pack.ts) and the full [existing React app guide](docs/getting-started.md).

For either the standalone or distributed image, application rules do not have to be compiled into CollabHub:

- mount a JSON file with `COLLABHUB_DOMAIN_PACK_CONFIG` for initial state, built-in strategies, and stale-operation rules;
- mount a reviewed ESM file with `COLLABHUB_DOMAIN_PACK_MODULE` for linked fields, validation, and custom conflict handling.

See [external Domain Packs](docs/deployment/domain-pack.en.md). The same file works in local Docker; AWS and Alibaba Cloud stacks distribute it read-only to every Gateway and Worker.

To inspect a complete generated project:

```bash
npm create @collabhub/react@0.1.3 my-collab-app
```

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
deploy/
  docker/             Distributed, standalone, and demo images
  local/              Local PostgreSQL/Redis cluster
  kubernetes/         Cloud-neutral Kustomize base
  aws/ alicloud/      VM + managed database Terraform stacks
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
docker compose -f deploy/local/docker-compose.yml up --build -d
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
- [AWS VM deployment](deploy/aws/README.md) · [Alibaba Cloud VM deployment](deploy/alicloud/README.md)
- [JSON configuration and ESM Domain Pack files](docs/deployment/domain-pack.en.md)
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
