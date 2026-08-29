# Add collaboration to an existing React app

CollabHub adds a shared room to the store/API boundary. Your components keep reading the same document and sending the same business commands.

## 1. Generate the integration

From the React project root:

```bash
npx @collabhub/create-react@1.0.0 init .
npm install
npm run collabhub:doctor
```

Generated files:

| File | Purpose |
|---|---|
| `collabhub.model.ts` | Document type, commands, linked updates, validation, late-command behavior |
| `src/collab/collabhub.ts` | Browser connection and React-compatible store |
| `server/collabhub.ts` | WebSocket service using the same rules |
| `Dockerfile.collabhub` | Service image for this app |

The command does not edit `App.tsx` or other components.

## 2. Adapt the rules file

Replace the generated sample types with the app's document and command types. Each `reduce` branch describes one existing business command.

```ts
export const collabModel = defineCollaborationModel<Project, ProjectCommand>({
  id: 'project',
  initialState: id => ({ id, tasks: [], completed: 0 }),
  reduce(draft, command) {
    if (command.type === 'task.toggled') {
      const task = draft.tasks.find(item => item.id === command.taskId)
      if (!task) throw new Error('task not found')
      task.done = !task.done
      draft.completed = draft.tasks.filter(item => item.done).length
    }
  },
  validate: project => project.completed <= project.tasks.length || 'invalid count',
  stale: command => command.type === 'payment.captured' ? 'reject' : 'rebase',
})
```

`reduce` runs first in the browser for immediate feedback. The service runs it again against the latest document, checks `validate`, stores the result, and sends only changed fields to every client.

Late commands use `rebase` by default. Choose `reject` for one-shot or financial operations, and `resync` when the UI must reload before retrying.

## 3. Connect at app startup

Wrap the generated CollabHub store in the same interface as the current REST store. Choose once at the composition root:

```ts
const runtime = flags.collaboration
  ? createAppCollaboration(documentId, currentUser.id)
  : createRestRuntime(documentId)
```

Components stay unchanged:

```tsx
const project = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
await runtime.execute({ type: 'task.toggled', taskId })
```

## 4. Run and verify

```bash
npm run collabhub:server
npm run collabhub:verify
```

`verify` opens two independent WebSocket clients in a new room. It submits a command from Alice and confirms Bob receives the server-computed linked field. Add an application browser test for a real command, reconnect, and pending-count recovery.

## Existing data

`initialState` is only the shape for a new/loading document. For records already in a database:

1. Implement the server `StorageAdapter` to read and save them.
2. Use the app's authenticated tenant, document, and actor identity in the WebSocket handshake.
3. While a room has an active writer, make REST `PUT/PATCH` reject writes to the same document.
4. Keep REST reads or a read-only projection if the app needs them.

The standalone Docker image stores snapshots/WAL on its volume and suits evaluation or a single node. Multi-node production uses PostgreSQL + Redis. See [deployment](../deploy/README.md).

## Production checklist

- WSS/TLS and short-lived authentication tokens
- allowed Origin list and gateway rate limits
- durable storage, backups, retention, and room capacity
- metrics for connections, pending work, rejects, reloads, and queue lag
- a deploy-time two-client smoke
- [full readiness checklist](integration/readiness.en.md)
