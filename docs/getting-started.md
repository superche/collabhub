# React quick start

This guide integrates a structured React state object without moving the domain model into CollabHub. WebSocket, pending operations, reconnect, recovery, and diagnostics stay inside the SDK.

> Registry packages are prepared but intentionally unpublished while `0.1.0` validation is in progress. Use the repository workspace or locally packed tarballs until a release is explicitly approved.

## 1. Start a local server

From the CollabHub repository:

```bash
pnpm install --frozen-lockfile
docker compose -f deploy/docker-compose.yml up --build -d
```

The local WebSocket endpoint is `ws://127.0.0.1:7090/collab`.

## 2. Prepare installable packages

```bash
pnpm pack:packages
```

Install the generated `client-core`, `domain-json`, and `protocol` tarballs in your React application. After an approved registry release, the equivalent command will be:

```bash
pnpm add @collabhub/client-core @collabhub/domain-json @collabhub/protocol
```

## 3. Add one collaboration module

```ts
// src/collab/document-collaboration.ts
import { CollaborationStore } from '@collabhub/client-core'
import { applyCanonicalPatches } from '@collabhub/domain-json'
import type { JsonObject } from '@collabhub/protocol'

type DocumentState = JsonObject & { title: string }
type DocumentCommand = { type: 'document.rename'; title: string }

export function createDocumentCollaboration(documentId: string, actorId: string) {
  return new CollaborationStore<DocumentState, DocumentCommand>({
    url: 'ws://127.0.0.1:7090/collab',
    tenantId: 'demo',
    documentId,
    actorId,
    clientId: `${actorId}-${crypto.randomUUID()}`,
    schemaVersion: '1.0',
    initialState: { title: 'Untitled' },
    applyPatches: applyCanonicalPatches,
    adaptCommand: (command) => ({
      operation: {
        operationType: 'property.set',
        strategyId: 'json.property-lww',
        strategyVersion: '1.0',
        payload: { path: '/title', value: command.title },
      },
      optimisticPatches: [{ op: 'set', path: '/title', value: command.title }],
    }),
  })
}
```

## 4. Keep React business-facing

Pass the store through your application runtime. The component only knows `getSnapshot`, `subscribe`, and a business command:

```tsx
function DocumentTitle({ runtime }: { runtime: AppRuntime }) {
  const document = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.getSnapshot,
  )

  return (
    <input
      value={document.title}
      onChange={(event) => runtime.execute({
        type: 'document.rename',
        title: event.target.value,
      })}
    />
  )
}
```

For an existing REST application, keep its `CommandTransport` interface and select `RestTransport` or the CollabHub-backed transport at the composition root. The complete production-shaped diff is the [TODO List integration](integration/todo-list-tutorial.md).

## 5. Add domain semantics

Built-in JSON strategies cover properties, entities, and ordering. Put linked business rules and invariants in a server Domain Pack. One accepted operation can publish multiple patches in one canonical version; clients never observe a partial linked update.

Before production integration, review the [capability matrix](capabilities.md), [integration readiness](integration/readiness.md), and [known limitations](known-limitations.md).
