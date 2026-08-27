# React quick start

CollabHub keeps your React components and domain model. Put collaboration in one adapter and the composition root.

## Fastest path: create a working app

```bash
npm create @collabhub/react@0.1.0 my-collab-app
cd my-collab-app
npm install
npm run dev
```

This starts one standalone authoritative server plus Alice and Bob clients. Open `http://127.0.0.1:5173/?client=alice` and `http://127.0.0.1:5174/?client=bob`, then edit the title in either window.

The generated project demonstrates:

- a business-facing React store based on `useSyncExternalStore`;
- incremental `property.set` operations instead of whole-document writes;
- pending operations, reconnect, canonical version, and diagnostics;
- a secure-by-default server adapter, with insecure identity enabled explicitly for local development.

The release gate runs the same generator in a temporary directory, installs only packed public packages, builds it, and verifies Alice/Bob synchronization in Chromium:

```bash
pnpm smoke:fresh-react
```

## Add CollabHub to an existing React app

Install the client packages:

```bash
npm add @collabhub/client-core @collabhub/domain-json @collabhub/protocol
```

Create one collaboration adapter outside your components:

```ts
// src/collab/document-collaboration.ts
import { CollaborationStore } from '@collabhub/client-core'
import { applyCanonicalPatches } from '@collabhub/domain-json'

export const documentStore = new CollaborationStore({
  url: 'ws://localhost:4100/collab',
  tenantId: 'example',
  documentId: new URLSearchParams(location.search).get('document') ?? 'welcome',
  actorId: crypto.randomUUID(),
  clientId: crypto.randomUUID(),
  schemaVersion: '1.0',
  initialState: { title: 'Untitled' },
  applyPatches: applyCanonicalPatches,
  adaptCommand: (command: { type: 'rename'; title: string }) => ({
    operation: {
      operationType: 'property.set',
      strategyId: 'json.property-lww',
      strategyVersion: '1.0',
      payload: { path: '/title', value: command.title },
    },
    optimisticPatches: [{ op: 'set', path: '/title', value: command.title }],
  }),
})
```

Expose only your application runtime to React:

```tsx
function Title({ runtime }: { runtime: AppRuntime }) {
  const document = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)

  return (
    <input
      defaultValue={document.title}
      onBlur={(event) => runtime.execute({ type: 'rename', title: event.currentTarget.value })}
    />
  )
}
```

Existing REST applications can keep their `CommandTransport` interface. Select the REST or CollabHub transport only in the composition root; the [TODO List tutorial](integration/todo-list-tutorial.md) shows this production-shaped migration.

## Start a standalone server

```bash
npm add @collabhub/server-ws @collabhub/domain-json
```

```ts
import { createJsonDomainPack } from '@collabhub/domain-json'
import { startStandaloneWebSocketServer } from '@collabhub/server-ws'

const server = await startStandaloneWebSocketServer({
  port: 4100,
  domainPack: createJsonDomainPack(),
  authenticate: async ({ authToken }) => verifyYourToken(authToken),
})
```

`authenticate` must return trusted `tenantId`, `actorId`, and allowed document IDs. Local examples may opt into `allowInsecureDevelopmentIdentity`; production cannot do so accidentally.

For linked fields or invariants, provide a Domain Pack strategy that emits multiple patches. One accepted operation publishes all patches under one canonical version.

Before production use, read the [integration readiness checklist](integration/readiness.en.md), [architecture](architecture/overview.en.md), and [known limitations](known-limitations.en.md).
