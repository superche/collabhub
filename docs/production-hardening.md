# Production hardening

Render is the public demo: it proves HTTPS/WSS, Origin filtering, shareable rooms, reconnects, and room cleanup on the public internet. It intentionally uses memory storage. The production reference is the same runtime with PostgreSQL, Redis, verified JWTs, private networking, and backups.

## Smallest useful production shape

- Two Linux VMs, each 2 vCPU / 4 GiB, each running one Gateway and one Room Worker.
- One private PostgreSQL 16 database. This is the durable source of snapshots, operations, idempotency receipts, and outbox events.
- One private Redis 7 service. This holds leases, routing, presence, pub/sub, and cluster-wide rate-limit buckets; it is rebuildable.
- One HTTPS/WSS load balancer forwarding public traffic only to Gateway port `7000`. Worker port `7100`, PostgreSQL, Redis, and metrics stay private.
- Your existing backend issues short-lived JWTs. The simplest path uses one backend-only HS256 secret; Clerk/Auth0/Supabase-style setups can use JWKS. CollabHub validates issuer, audience, tenant, actor, and document grants in both modes.

Use [the generic VM Compose path](../deploy/vm/README.md) on any provider, or [the Alibaba Cloud Terraform reference](../deploy/alicloud/README.md). Kubernetes and AWS remain optional adapters, not runtime requirements.

## Data upgrades

Database DDL is forward-only and recorded in `collabhub_database_migration` with a checksum. Every node can run `migrate()` safely; a PostgreSQL advisory lock allows only one migrator.

Business state upgrades live beside the Domain Pack:

```ts
export default defineDomainPack({
  id: 'my-app',
  schemaVersion: '2',
  migrations: [{
    fromVersion: '1',
    toVersion: '2',
    migrate: state => ({ ...state, archived: false }),
  }],
  // strategies, initialState, invariants...
})
```

The Worker replays the stored WAL, runs the deterministic migration without I/O, and transactionally writes the upgraded snapshot, schema pointer, checksum, and audit row while holding the room owner epoch. Missing or ambiguous paths fail closed. Standalone uses the same migration function.

Before a schema release: stop writes for the affected app, wait for client pending queues to reach zero, take a database backup, deploy all Workers, then deploy clients. Operations from an older schema receive snapshot recovery instead of being guessed or transformed. After a room reaches a new schema, rollback means a tested database restore or a new forward migration—not starting an older binary against upgraded data.

Deploy immutable image digests one VM at a time. The generic VM upgrade script restores the previous local image when readiness fails. Schema rollback remains a database restore or forward migration; container rollback alone is intentionally not treated as a data rollback.

## Retention and recovery

Defaults:

| Data | Default | Meaning |
|---|---:|---|
| WAL | 1,000 versions/document | Recent rebase and catch-up window |
| Operation receipts | 7 days | Idempotent retry window |
| Delivered outbox | 24 hours | Troubleshooting window after delivery |
| Snapshots | 3/document | Recent recovery points; active head is never deleted |
| Compaction | every 10 minutes | One Worker wins a PostgreSQL advisory lock |

WAL is deleted only below a persisted snapshot and outside the retained version window. Presence is never written to WAL or snapshots. Set `WAL_RETENTION_VERSIONS`, `RECEIPT_TTL_MS`, `DELIVERED_OUTBOX_TTL_MS`, `SNAPSHOTS_PER_DOCUMENT`, and `COMPACTION_INTERVAL_MS` to change the policy.

Back up PostgreSQL daily with point-in-time logs for at least seven days. Once per release, restore the latest backup into an isolated database, start one Worker against it, fetch representative snapshots, and compare canonical versions and state checksums. Redis restore is not required for correctness; restart all nodes so leases are rebuilt.

## Security and operations

- Put credentials in files and set `DATABASE_URL_FILE`, `REDIS_URL_FILE`, and `INTERNAL_TOKEN_FILE`. Docker, Kubernetes, AWS, and Alibaba Cloud references use this path.
- For the simple auth path, also set `JWT_SHARED_SECRET_FILE`; only the application backend and CollabHub receive it. React fetches a short-lived token from the application backend. Use `JWT_JWKS_URL` instead when an identity provider already publishes signing keys.
- `NODE_ENV=production` removes all development connection-string/token fallbacks and requires an internal token of at least 32 characters.
- Use TLS at the public load balancer and TLS connections to managed PostgreSQL/Redis. Security groups allow `7000` from the load balancer and `7100` only from CollabHub VMs.
- The Alibaba Cloud stack retrieves KMS secrets through a least-privilege ECS RAM role; no permanent AccessKey or runtime secret is embedded in cloud-init.
- HTTP and WebSocket messages default to 128 KiB. JSON depth, node count, and collection width are bounded.
- Connection limits are local to a Gateway. Operation and HTTP token buckets use Redis, so adding Gateways does not multiply the public rate limit. Redis errors fail the request closed by default.
- `/healthz` is a process liveness check. `/readyz` checks PostgreSQL/Redis and returns `503` while draining. `/metrics` requires the internal token header and must remain private.
- SIGTERM first removes readiness, rejects new work, drains queued room operations, snapshots warm rooms, releases leases, and then closes dependencies.

Alert on readiness failures, process restarts, RSS, mailbox depth, rejected authentication, rate limits, retry responses, schema migration failures, compaction failures, PostgreSQL storage/connection saturation, Redis latency, and outbox growth.

## Verification

```bash
pnpm test:unit
pnpm smoke:postgres-hardening
pnpm smoke:todo-cluster
```

The PostgreSQL smoke proves idempotent DDL migration, transactional Domain Pack migration, safe WAL/snapshot/receipt/outbox compaction, recovery after compaction, and a Redis rate limit shared by two independent clients. The local cluster smoke proves two Gateways, two Workers, failover, duplicate delivery, presence isolation, REST routing, and snapshot recovery.
