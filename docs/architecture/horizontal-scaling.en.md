# Horizontal scaling

```text
Client -> Gateway x N -> Room Worker x N
             |                |
             + Redis          + PostgreSQL
```

Gateways hold no authoritative document state. One Room Worker owns a document at a time; PostgreSQL `owner_epoch` fencing rejects stale writers. Redis stores replaceable route leases, worker discovery, presence, and wake-ups. PostgreSQL atomically commits WAL, operation receipt, document head, and outbox.

Warm-room eviction and durable retention are separate. Standalone and distributed runtimes share `RoomCachePolicy`, protect active or queued rooms, snapshot before TTL/LRU eviction, and bound retained in-memory rooms. Distributed eviction releases memory and the owner lease while PostgreSQL data remains authoritative.

## Local cluster acceptance

```bash
docker compose -f deploy/local/docker-compose.yml up --build -d
pnpm smoke:distributed
docker compose -f deploy/local/docker-compose.yml down
```

For observable local Node processes with only PostgreSQL and Redis in Docker:

```bash
pnpm smoke:todo-cluster
```

The smoke connects Alice and Bob through different Gateways, kills the current writer process, verifies fenced takeover, linked updates, offline replay, and snapshot recovery.

## Cloud baseline

The OCI image targets Node.js 22, PostgreSQL 15/16, Redis 7.2+, and Kubernetes 1.29+. The Kustomize base is portable to EKS, GKE, AKS, and ACK. Two VM-oriented Terraform stacks are also included:

```bash
# AWS: ALB + Auto Scaling 2C4G VMs + Multi-AZ RDS + ElastiCache
cd deploy/aws/terraform && terraform init && terraform apply

# Alibaba Cloud: ALB + 2C4G ECS + HA RDS + Tair/Redis
cd deploy/alicloud/terraform && terraform init && terraform apply
```

Every VM runs one Gateway and one Worker. Both stacks enforce HTTPS/JWT inputs and distribute the selected JSON or ESM Domain Pack to every process. See [deployment layout](../../deploy/README.md) and [external Domain Packs](../deployment/domain-pack.en.md).

The published 2C4G numbers are conservative scheduling inputs—not production SLOs. Capacity must be retested with the real Domain Pack, snapshot size, and managed database. A successful Terraform validation is not a managed-cloud soak test.

Production Gateways require JWT/JWKS configuration:

| Variable | Purpose |
|---|---|
| `JWT_JWKS_URL` | Trusted signing keys |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Token verification |
| `ALLOWED_ORIGINS` | Comma-separated WebSocket origins |
| `MAX_GATEWAY_CONNECTIONS` / `MAX_CONNECTIONS_PER_IP` | Connection caps |
| `OPERATION_RATE_PER_SECOND` / `OPERATION_BURST` | Per-IP submit limits |
| `TRUST_PROXY_HEADERS` | Enable only behind a sanitizing load balancer |
| `COLLABHUB_DOMAIN_PACK_CONFIG` | Read-only declarative JSON pack |
| `COLLABHUB_DOMAIN_PACK_MODULE` | Read-only trusted ESM pack; mutually exclusive with JSON |

`ALLOW_INSECURE_IDENTITY=true` exists only for explicit local development. Production must additionally provide TLS, tenant authorization/isolation, database backups/PITR, payload schemas, audit, PgBouncer, and autoscaling signals based on connections, mailbox depth, commit latency, and outbox age.
