# v1.0 known limitations

- v1.0 stabilizes the structured-data APIs; it is not a character-level editor engine or a managed service SLA.
- The shared model is JSON-only. Dates, maps, class instances, binary data, and cyclic objects need application encoding.
- Generic array changes from reducer-style models may replace that array in one patch. Use built-in entity/list commands for large hot lists.
- IndexedDB pending operations survive refresh and atomically merge queues from tabs in one browser profile; they do not provide cross-device offline merge and can be lost when site data is cleared.
- Character-level rich-text CRDT merge, shared undo/redo, operation-payload transformation across schema releases, and multi-region active-active writes are not included.
- Snapshot schema migrations are deterministic, forward-only, and run when a room activates. Releases must drain old-client pending queues and deploy Workers before clients; automatic mixed-version operation translation is not included.
- BlockNote concurrent edits inside one top-level block remain LWW.
- The public Render demo uses memory storage and deletes idle demo rooms; it is not a durability reference.
- Standalone file storage is single-node. Multi-node production needs PostgreSQL + Redis, authentication, TLS, backups, monitoring, and tested recovery.

## Next priorities

1. Multi-node managed-cloud soak and regional failover certification.
2. Packaged operational dashboards.
3. Hybrid Yjs field adapter remains optional; built-in character-level OT/CRDT is not planned for this release.
