# DEV Community article

## Editor settings

- **Title:** Adding multiplayer to an existing React app without replacing its data model
- **Tags:** `react`, `opensource`, `webdev`, `javascript`
- **Cover image:** [`../product-hunt/assets/gallery-01-hero.png`](../product-hunt/assets/gallery-01-hero.png)
- **AI disclosure:** Select the option that truthfully describes how the final article was prepared.
- **Canonical URL:** Leave empty unless this full article is first published elsewhere.

## Article

Adding real-time collaboration to a new prototype is one problem. Adding it to an application that already has components, a store, commands, REST endpoints, authentication, and production data is a different one.

The risky part is not opening a WebSocket. It is deciding who owns the data after collaboration is enabled.

I built [CollabHub](https://github.com/superche/collabhub) around a narrow assumption: **your application should keep owning its domain model**. Collaboration is an additional transport and server, not a replacement application architecture.

## Start from the React app you already have

Imagine an application that already exposes a runtime like this:

```ts
type AppRuntime = {
  getSnapshot(): AppDocument
  subscribe(listener: () => void): () => void
  execute(command: AppCommand): void
}
```

Components read the current document and send business commands:

```tsx
const document = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)

<button onClick={() => runtime.execute({
  type: 'task.completed',
  taskId,
})}>
  Complete
</button>
```

That component should not need to know whether the command travels through REST or a collaboration connection.

## Add the integration boundary

The starter adds the collaboration files beside an existing application:

```bash
npx @collabhub/create-react@1.0.0 init .
npm install
npm run collabhub:doctor
```

The main file to customize is `collabhub.model.ts`. It contains the business rules that must produce the same result on the browser and service:

```ts
import { defineCollaborationModel } from '@collabhub/client-core'

export const collabModel = defineCollaborationModel<AppDocument, AppCommand>({
  id: 'my-app',
  initialState: documentId => loadEmptyDocument(documentId),

  reduce(draft, command) {
    if (command.type === 'task.completed') {
      const task = draft.tasks.find(item => item.id === command.taskId)
      if (!task) return

      task.done = true
      draft.completedCount = draft.tasks.filter(item => item.done).length
      draft.progress = draft.completedCount / draft.tasks.length
    }
  },

  validate(document) {
    return document.progress <= 1 || 'invalid progress'
  },

  stale(command) {
    return command.type === 'invoice.paid' ? 'reject' : 'rebase'
  },
})
```

This is also where application-specific logic belongs:

- A command that updates several linked fields does so in one reducer execution.
- Validation rejects a result before other clients receive it.
- A late command can run again against the newest document, be rejected, or request a reload.
- Domain-specific ordering and deletion behavior stay with the application rather than the React component.

## Keep the REST implementation

The application chooses the runtime once, in its composition root:

```ts
const runtime = collaborationEnabled
  ? createModelCollaboration({
      url: 'wss://collab.example.com/collab',
      documentId,
      actorId: currentUser.id,
      getAuthToken,
      model: collabModel,
      initialState: collabModel.initialState(documentId),
    })
  : createRestRuntime()
```

Existing components continue calling `runtime.execute`. Turning collaboration off selects the previous REST path.

The host application must still prevent two writers from modifying the same collaborative document through REST and CollabHub at the same time. The example apps demonstrate that boundary explicitly.

## Reuse the login you already have

CollabHub does not provide another login screen. The existing backend returns a short-lived token for the current user and document:

```ts
const getAuthToken = async () => {
  const response = await fetch('/api/collabhub/token', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ documentId }),
  })

  return (await response.json()).token
}
```

The SDK requests a fresh token when it reconnects. The service can verify a backend-only shared secret or a JWKS endpoint from an existing identity provider.

## Deploy one service first

For evaluation or a small single-node installation:

```bash
docker run -p 4100:4100 -v collabhub-data:/data \
  -e COLLABHUB_ALLOWED_ORIGINS=https://app.example.com \
  -e COLLABHUB_AUTH_TOKEN=replace-me \
  ghcr.io/superche/collabhub-standalone:1.0.0
```

Persistent and multi-node deployments use PostgreSQL and Redis. The repository includes Docker, existing-VM, AWS, Alibaba Cloud, and Kubernetes paths rather than requiring one cloud provider.

## What happens during concurrent edits?

The service receives a versioned command, runs the application rules, and accepts or rejects the resulting change. Accepted changes receive a new document version and an incremental patch.

Late commands run against the newest document by default. Two accepted changes to the same property therefore resolve in service acceptance order, while sensitive commands can use `reject` instead. Operation IDs make retries idempotent; reconnecting clients replay pending commands or recover from a snapshot when their history is too old.

Presence is separate from durable edits, so cursor or online-state traffic does not enter snapshots or the operation log.

## Why not use Yjs for everything?

Yjs is a strong choice for character-level text, local-first state, and CRDT merge semantics. CollabHub targets a different integration problem: structured business data with application commands, validation, permissions, and an existing database.

Some products need both. The repository includes a hybrid example where Yjs owns the rich-text body and CollabHub owns the title and workflow. Each field has exactly one synchronization owner.

## Try it

The [live React Flow demo](https://collabhub-demo.onrender.com/demo.html) requires no account. Copy the room URL into a second tab, then move a node, simulate an offline client, and reconnect it.

The repository also contains TODO List and BlockNote examples, two-client smoke recordings, deployment templates, and production-readiness notes.

- [Source](https://github.com/superche/collabhub)
- [Five-minute guide](https://github.com/superche/collabhub/blob/main/docs/getting-started.md)
- [AI Coding guide](https://github.com/superche/collabhub/blob/main/docs/ai-coding-guide.md)
- [Known limitations](https://github.com/superche/collabhub/blob/main/docs/known-limitations.en.md)

I am looking for feedback from developers who already have a React application: **where does this integration still ask you to understand or change too much?**
