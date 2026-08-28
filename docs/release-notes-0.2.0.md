# CollabHub 0.2.0 technical preview

v0.2 makes CollabHub easier to add to an existing React app while preserving server-side control.

## Highlights

- `create-collabhub-react init .` adds collaboration beside an existing app without editing UI components.
- `collabhub.model.ts` holds reducer-style commands, linked updates, validation, and late-command policy.
- `createModelCollaboration` defaults to an IndexedDB pending queue, so unfinished commands survive a page refresh.
- `collabhub doctor` checks the generated integration.
- `collabhub verify` runs two real WebSocket clients and proves a server-computed linked update reaches both.
- `llms.txt` and the AI Coding guide give coding agents explicit boundaries and acceptance criteria.
- Documentation states where CollabHub is a better fit than Yjs and where it is not.

## Compatibility

- Wire protocol remains `0.1`; existing v0.1 clients and servers remain protocol-compatible.
- Existing `createCollaboration` and built-in `json.*` intents remain available.
- The shared model API is additive.

## Known limits

- Character-level CRDT rich-text merge and shared undo are not included.
- The browser queue is device-local and not a replacement for server storage.
- Production deployments still require application authentication, durable PostgreSQL/Redis or a storage adapter, Origin restrictions, TLS, backups, and monitoring.
