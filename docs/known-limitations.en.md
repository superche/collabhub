# v0.2 known limitations

- `0.2.0` remains a technical preview. `v1.0.0` requires explicit repository-owner approval.
- The shared model is JSON-only. Dates, maps, class instances, binary data, and cyclic objects need application encoding.
- Generic array changes from reducer-style models may replace that array in one patch. Use built-in entity/list commands for large hot lists.
- IndexedDB pending operations survive refresh on one browser profile; they do not provide cross-device offline merge and can be lost when site data is cleared.
- Character-level rich-text CRDT merge, shared undo/redo, schema migration orchestration, and multi-region active-active writes are not included.
- BlockNote concurrent edits inside one top-level block remain LWW.
- The public Render demo uses memory storage and deletes idle demo rooms; it is not a durability reference.
- Standalone file storage is single-node. Multi-node production needs PostgreSQL + Redis, authentication, TLS, backups, monitoring, and tested recovery.

## Next priorities

1. First-class schema migrations and persistent operation compaction.
2. Cross-tab pending-queue coordination and crash-injection soak tests.
3. Hybrid Yjs field adapter for character-level rich text.
4. Operational dashboards and production deployment verification jobs.
