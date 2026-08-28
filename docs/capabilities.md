# Capability matrix

CollabHub `0.2.0` targets structured application state. “Supported” means the behavior has automated conformance or real multi-client evidence.

| Scenario | Status | Semantics / evidence |
|---|---|---|
| Property editing | Supported | Server-ordered LWW; concurrent tests |
| Entity add/update/delete | Supported | Stable IDs and lifecycle strategy |
| List / section ordering | Supported | Fractional rank; concurrent move tests |
| Atomic linked updates | Supported | One intent, multiple patches, one canonical version |
| Strict stale rejection | Supported | `reject-if-stale` strategy |
| Business-defined stale resolution | Supported | Domain Pack chooses resolve/reject/resync; operation identity stays immutable |
| Duplicate delivery | Supported | Persistent operation receipt and collision rejection |
| Reconnect / offline replay | Supported | In-memory pending queue and real browser recovery |
| Refresh-safe pending replay | Supported | `createModelCollaboration` persists pending operations in IndexedDB; restart test preserves operation id |
| Snapshot + WAL recovery | Supported | Single-node and PostgreSQL runtime evidence |
| Presence transport | Supported | Ephemeral channel; never persisted or versioned |
| Horizontal scaling | Supported | Stateless Gateway, fenced single-writer Worker, PostgreSQL/Redis; shared operation pipeline |
| Controlled graph editors | Supported | React Flow incremental node/edge operations |
| Block editors | Limited | Block-level LWW; not character-level rich-text merge |
| Collaborative cursors UI | Adapter required | Presence primitives exist; no packaged cursor UI |
| Shared undo / redo | Not supported | Requires canonical inverse-operation policy |
| Cross-device offline merge | Not supported | IndexedDB queue is browser-local and settles through the service |
| Multi-document atomic transaction | Not supported | Atomicity is scoped to one document |

See [acceptance evidence](acceptance.md) and [known limitations](known-limitations.md) for exact boundaries.
