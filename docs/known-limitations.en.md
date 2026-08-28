# v0.1 known limitations

- `v1.0.0` requires explicit repository-owner approval after full acceptance; `0.1.1` remains a technical preview.
- Render Free sleeps, cold-starts, and resets in-memory demo data on restart or deploy.
- The distributed runtime is single-region; it has no active-active multi-region control plane.
- PostgreSQL snapshots use JSONB; WAL/receipt/outbox compaction, object storage, and automated PITR tooling are not included.
- Atomic linked patches are limited to one document. External databases and cross-document transactions need host coordination.
- Strategies are trusted in-process code, without WASM/process isolation or signed rollout governance.
- There is no Yjs/OT text subdocument, shared undo/redo, schema migration runner, or operation-history compaction.
- JWT/JWKS authentication and document grants are available for the distributed Gateway, but tenant RLS, issuer operations, audit, and application-specific authorization remain deployment responsibilities. Examples use explicit development identity.
- Pending client intent is memory-only and does not survive a page refresh.
- Fractional ranks have no background rebalance.
- Diagnostics are application-local, not a complete observability control plane.
- Published 2C4G figures are scheduling baselines, not production SLOs; no managed-cloud soak report is included.
- BlockNote resolves concurrent edits at top-level block granularity with LWW, not character-level CRDT merging.

## Next priorities

1. Durable pending intent, WAL/outbox retention, object snapshots, backup/restore, and crash-injection soak tests.
2. Tenant authorization/RLS, audit, payload schemas, and OpenTelemetry.
3. Rank rebalance, schema migration, richer data types, and independent DevTools timeline.
4. Multi-region failover and tenant placement.
