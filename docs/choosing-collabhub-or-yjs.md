# CollabHub or Yjs?

They solve different default problems.

| Question | CollabHub | Yjs |
|---|---|---|
| Existing structured React app | Add beside the current store and commands | Usually model shared data as Y types |
| Server business validation | The service recomputes every command | Add a separate trusted validation/write layer |
| Conflict behavior | Choose per business command | CRDT merge semantics |
| Character-level rich text | Not provided | Strong fit with editor bindings |
| Local-first/offline multi-copy merge | Limited; queued commands need the service to settle | Strong fit |
| Existing SQL/document database | Storage adapter keeps it central | Requires persistence/provider design |
| Operations | Standalone or PostgreSQL + Redis runtime included | Provider, persistence, auth, awareness, and scaling are selected separately |

Choose CollabHub when the app already has document types, commands, permissions, and server-owned records. The integration cost is mostly mapping existing commands and deploying the service.

Choose Yjs when the shared object itself should be a CRDT, especially for character-level editors or local-first products.

For mixed products, keep business objects, workflow state, and permissions in CollabHub; embed a Yjs document for the rich-text field. Do not mirror the same field through both systems.
