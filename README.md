<h1 align="center">CollabHub</h1>

<p align="center"><strong>Add multiplayer to an existing React app without replacing its data model.</strong></p>

<p align="center">Keep your components, store, commands, and REST fallback. Add one shared rules file, one React SDK, and one deployable service.</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.2.0-1f6f4a">
  <a href="https://github.com/superche/collabhub/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/superche/collabhub/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@collabhub/client-core"><img alt="npm" src="https://img.shields.io/npm/v/@collabhub/client-core?logo=npm"></a>
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-4c566a">
</p>

<p align="center"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>

<p align="center">
  <a href="https://collabhub-demo.onrender.com/demo.html">Live React Flow demo</a> ·
  <a href="docs/getting-started.md">5-minute guide</a> ·
  <a href="docs/ai-coding-guide.md">AI Coding guide</a> ·
  <a href="deploy/README.md">Deploy</a>
</p>

> **v0.2 technical preview.** Built for structured React state. Production security, storage, and operations still need application-owned configuration. `v1.0.0` requires a separate owner approval.

## Features

- **Low intrusion:** React components do not import CollabHub. Switch back to REST at app startup.
- **Business commands:** write familiar reducer-style rules; the server runs them again before accepting data.
- **Linked updates:** one command can update several fields and every client receives them together.
- **Better concurrent editing:** late commands re-run on current data by default; choose reject or reload per command.
- **Recovery:** reconnect, snapshot recovery, idempotent retries, backpressure, and an IndexedDB pending queue.
- **Typical UI patterns:** property changes, entity create/delete, list ordering, React Flow, and block editors.
- **Deployable service:** standalone Docker for evaluation; PostgreSQL + Redis runtime, Kubernetes, AWS, and Alibaba Cloud for production.
- **Diagnostics:** connection, pending work, document version, rejects, reconnects, and resyncs.

## Examples

### 1. TODO List

Classic React domain/store/command bus + REST fallback. Demonstrates atomic progress/count updates, ordering, offline recovery, and double-write protection. [Code](examples/todo-list-app) · [Guide](docs/integration/todo-list-tutorial.en.md)

https://github.com/user-attachments/assets/58963835-fffe-43ff-875b-617e635ec282

### 2. BlockNote

Block-level collaboration without replacing BlockNote's editor API. Demonstrates insert/delete/reorder, coalesced input, offline replay, and recovery. Concurrent text inside one block is LWW, not character-level CRDT merge. [Code](examples/blocknote-app) · [Guide](docs/integration/blocknote.en.md)

https://github.com/user-attachments/assets/6a90ca9d-ef9b-4d1b-a105-2e542c80b189

### 3. React Flow

A controlled React Flow canvas backed by the app's own `GraphDocument`. Demonstrates incremental node/edge changes, drag coalescing, offline replay, and linked-edge deletion. [Live demo](https://collabhub-demo.onrender.com/demo.html) · [Code](examples/react-flow-app) · [Guide](docs/integration/react-flow.en.md)

https://github.com/user-attachments/assets/cc5117cb-3bff-49fd-82f9-bb1f8ece80bb

### 4. CollabHub + Yjs

Some apps have both structured business data and a rich-text body that needs character-level collaboration; one sync model is not ideal for both. CollabHub handles fields and workflow, while Yjs handles the document body, with exactly one owner per field. [Code](examples/yjs-hybrid-app) · [Guide](docs/integration/yjs-hybrid.md)

## Integration

### Add it to an existing React app

```bash
npx @collabhub/create-react@0.2.0 init .
npm install
npm run collabhub:doctor
```

This adds collaboration files without editing your React components. The only file most apps customize is `collabhub.model.ts`:

```ts
import { defineCollaborationModel } from '@collabhub/client-core'

export const collabModel = defineCollaborationModel<AppDocument, AppCommand>({
  id: 'my-app',
  initialState: (documentId) => loadEmptyDocument(documentId),

  // Use your normal business commands. Mutate the draft like a reducer.
  reduce(draft, command) {
    if (command.type === 'task.completed') {
      draft.tasks.find(task => task.id === command.taskId)!.done = true
      draft.completedCount = draft.tasks.filter(task => task.done).length
      draft.progress = draft.completedCount / draft.tasks.length
    }
  },

  // Put app-specific validation here. The server checks it too.
  validate: (document) => document.progress <= 1 || 'invalid progress',

  // Default is "rebase": run late commands on the newest document.
  stale: command => command.type === 'invoice.paid' ? 'reject' : 'rebase',
})
```

Create the collaboration runtime once, where your app currently chooses its store/API implementation:

```tsx
import { createModelCollaboration } from '@collabhub/client-core'

const runtime = collaborationEnabled
  ? createModelCollaboration({
      url: 'wss://collab.example.com/collab',
      documentId,
      actorId: currentUser.id,
      authToken: currentUser.collabToken,
      model: collabModel,
      initialState: collabModel.initialState(documentId),
    })
  : createRestRuntime()
```

Your existing components keep reading state and sending commands:

```tsx
const document = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
runtime.execute({ type: 'task.completed', taskId })
```

Start the generated service and run a real two-client linked-update check:

```bash
npm run collabhub:server
npm run collabhub:verify
```

For existing database records, implement a `StorageAdapter` and prevent REST from writing a document while its collaboration session is active. See [existing data](docs/getting-started.md#existing-data) and [production readiness](docs/integration/readiness.en.md).

### Deploy the service

```bash
docker run -p 4100:4100 -v collabhub-data:/data \
  -e COLLABHUB_ALLOWED_ORIGINS=https://app.example.com \
  -e COLLABHUB_AUTH_TOKEN=replace-me \
  ghcr.io/superche/collabhub-standalone:0.2.0
```

Standalone is for evaluation and small single-node installs. Use the [PostgreSQL + Redis image](deploy/docker/distributed.Dockerfile) for multiple VMs. Deployment baselines: [Kubernetes](deploy/kubernetes), [AWS](deploy/aws), [Alibaba Cloud](deploy/alicloud), [Render demo](render.yaml).

### CollabHub or Yjs?

Choose CollabHub when you already have structured React data, business commands, server validation, and a database. Choose Yjs for character-level rich text, local-first data, and peer/offline merge semantics. A hybrid app can use CollabHub for business objects and Yjs for a rich-text field. [Runnable example](examples/yjs-hybrid-app) · [Guide](docs/integration/yjs-hybrid.md) · [Detailed comparison](docs/choosing-collabhub-or-yjs.md)

## Repository structure

```text
packages/       protocol, client SDK, shared model, server runtimes, strategies, testkit
examples/       TODO List, BlockNote, React Flow, CollabHub + Yjs
deploy/         Docker, Kubernetes, AWS, Alibaba Cloud
docs/           integration, architecture, operations, acceptance
scripts/        smoke tests, benchmarks, release checks
```

## Development

```bash
pnpm install
pnpm check
pnpm dev:react-flow
```

`pnpm check` builds all packages and examples, runs unit/integration tests, and records a repeatable benchmark. See [architecture](docs/architecture/overview.en.md), [release process](docs/releasing.md), and [acceptance evidence](docs/acceptance.en.md).

## Documentation

- [Getting started](docs/getting-started.md)
- [AI Coding integration guide](docs/ai-coding-guide.md)
- [Capabilities](docs/capabilities.md)
- [Deployment](deploy/README.md)
- [Horizontal scaling](docs/architecture/horizontal-scaling.md)
- [Known limitations](docs/known-limitations.en.md)
- [v0.2 release notes](docs/release-notes-0.2.0.md)

## License

[Apache License 2.0](LICENSE)
