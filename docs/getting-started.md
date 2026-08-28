# Add collaboration to an existing React app

The default path has two concepts:

1. **Authoritative service** — owns room order, WAL, snapshots, and recovery.
2. **React collaboration store** — maps your commands to incremental JSON intents.

Your domain types, components, and REST fallback remain application-owned.

## 1. Deploy the service

For evaluation, run the standalone image with a persistent volume:

```bash
docker run --name collabhub -p 4100:4100 -v collabhub-data:/data \
  -e COLLABHUB_ALLOWED_ORIGINS=http://localhost:5173 \
  -e COLLABHUB_ALLOW_INSECURE_DEVELOPMENT_IDENTITY=true \
  -e COLLABHUB_INITIAL_STATE_JSON='{"title":"Untitled"}' \
  ghcr.io/superche/collabhub-standalone:0.1.2
```

The container exposes `/collab` and `/healthz`. `/data` stores snapshots and WAL. Copy [the Dockerfile](../deploy/standalone.Dockerfile) when the host needs a custom Domain Pack.

Development identity is deliberately explicit. A real deployment supplies `authenticate`, tenant/document authorization, TLS, backups, and a retention policy.

### Existing server-owned documents

Browser `initialState` prevents an empty first render; it does not import data into the authority. For an existing REST-backed document:

1. Embed `startJsonCollaborationServer` in the host service.
2. Implement `StorageAdapter.loadSnapshot` from the existing repository and persist later WAL/snapshots through that adapter.
3. Route shared mutations through the collaboration command gateway; keep REST only as the disabled/fallback transport, never a concurrent writer.
4. Add a Domain Pack when one command must validate invariants or update linked fields atomically.

The [TODO List migration](integration/todo-list-tutorial.en.md) is the complete reference. The standalone image remains the shortest path when documents are new or CollabHub-owned.

## 2. Add one SDK package

```bash
npm add @collabhub/client-core@0.1.2
```

If the app defaults to a private registry, add `@collabhub:registry=https://registry.npmjs.org` to its `.npmrc`.

Create `src/collab/document-collaboration.ts`:

```ts
import { createCollaboration, json } from '@collabhub/client-core'
import type { AppCommand, AppDocument } from '../domain'

export function createDocumentCollaboration(options: {
  url: string
  documentId: string
  actorId: string
  initialState: AppDocument
}) {
  return createCollaboration<AppDocument, AppCommand>({
    ...options,
    command(command) {
      switch (command.type) {
        case 'document.rename': return json.set('/title', command.title)
        case 'item.add': return json.create('items', command.item.id, command.item)
        case 'item.delete': return json.delete('items', command.itemId)
        case 'item.move': return json.move('items', command.itemId, command.afterId)
      }
    },
  })
}
```

`json.*` hides operation envelopes, strategy ids, base versions, optimistic patches, and canonical patch application. The returned object implements the `subscribe/getSnapshot` shape used by `useSyncExternalStore`.

## 3. Switch only in the composition root

```ts
export function createAppRuntime(options: RuntimeOptions): AppRuntime {
  if (!options.collaborationEnabled) return createRestRuntime(options)

  const collaboration = createDocumentCollaboration(options)
  return {
    subscribe: collaboration.subscribe,
    getSnapshot: collaboration.getSnapshot,
    execute: (command) => collaboration.execute(command),
    diagnostics: () => collaboration.diagnostics,
    close: () => collaboration.close(),
  }
}
```

React components continue to depend on `AppRuntime`, not CollabHub:

```tsx
function Title({ runtime }: { runtime: AppRuntime }) {
  const document = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  return <input defaultValue={document.title} onBlur={(event) => runtime.execute({ type: 'document.rename', title: event.currentTarget.value })} />
}
```

## When business rules link fields

Built-in `json.*` operations cover LWW properties, entity lifecycle, list ordering, and strict transactions. When one command must update several derived fields, send one custom intent and resolve it in a Domain Pack. Every returned patch commits and broadcasts under one canonical version.

The [TODO List migration](integration/todo-list-tutorial.en.md) demonstrates REST fallback, command/projection adapters, linked updates, stale-intent policy, and prevention of REST/Collab double writes.

## Inspect a complete project

```bash
npm create @collabhub/react@0.1.2 my-collab-app
cd my-collab-app
npm install
npm run dev
```

This is a learning fixture, not the primary product assumption. The release gate installs its two CollabHub dependencies in a clean directory and proves Alice/Bob synchronization in Chromium.

Before production use, read [integration readiness](integration/readiness.en.md), [architecture](architecture/overview.en.md), and [known limitations](known-limitations.en.md).
