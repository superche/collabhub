# CollabHub + Yjs: structured data and character-level text

Use this pattern when an existing React app has both business fields and a rich-text body.

## The rule

Give every field one owner:

| Data | Owner | Why |
|---|---|---|
| title, status, permissions, workflow | CollabHub | server rules and the existing database remain in control |
| document body | Yjs | concurrent character edits and offline merge |

Never send the Yjs body through a CollabHub `set` command as well. Two writers for one field create divergent histories.

## Shared business model

The CollabHub model deliberately has no `body` field:

```ts
export const documentMetadataModel = defineCollaborationModel({
  id: 'my-app.metadata',
  initialState: documentId => ({ documentId, title: 'Untitled', status: 'draft' }),
  reduce(draft, command) {
    if (command.type === 'metadata.titleChanged') draft.title = command.title
    if (command.type === 'metadata.statusChanged') draft.status = command.status
  },
  validate: document => document.title.trim() ? true : 'Title is required',
})
```

Use a normal CollabHub runtime for those fields:

```ts
const metadata = createModelCollaboration({
  url: 'wss://collab.example.com/collab',
  documentId,
  actorId: currentUser.id,
  model: documentMetadataModel,
  initialState: documentMetadataModel.initialState(documentId),
})
```

## Character-level body

Create one Yjs document for the body and use the same room-derived name on every client:

```ts
const ydoc = new Y.Doc()
const body = ydoc.getText('body')
const provider = new WebsocketProvider(
  'wss://yjs.example.com',
  `${documentId}:body`,
  ydoc,
)
```

Bind `body` to your editor with its Yjs binding. The runnable example uses a textarea and converts each input into a minimal `Y.Text` delete/insert transaction. Production rich-text editors should use their official Yjs binding so selections, IME, marks, and undo are mapped correctly.

## Run the example

```bash
pnpm install
pnpm dev:yjs-hybrid
```

Open:

- `http://127.0.0.1:5193/?document=hybrid-demo&client=alice`
- `http://127.0.0.1:5194/?document=hybrid-demo&client=bob`

Edit the title or workflow to exercise CollabHub. Type concurrently in the body to exercise Yjs character merging.

The included Yjs WebSocket server is an in-memory development backend. For production, choose a persistent/scalable Yjs provider, authenticate both connections with the same application identity, and derive both room names from the same authorized document ID.

[Runnable source](../../examples/yjs-hybrid-app)
