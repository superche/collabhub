# Indie Alibaba Cloud acceptance — 2026-08-29

This run certifies the one-VM Indie deployment path against a real Alibaba Cloud server. It covers deployment, public HTTPS/WSS, a real React Flow integration, offline recovery, idempotency, process and VM restart recovery, sustained traffic, and backup restoration.

## Environment

| Item | Value |
| --- | --- |
| Account | Verified before purchase; account identifier intentionally not published |
| Region | Hong Kong (`cn-hongkong`) |
| Instance | `collabhub-indie-cert` |
| Public endpoint | `https://47.82.72.49` / `wss://47.82.72.49/collab` |
| VM | 2 vCPU, 2 GiB RAM, 40 GB ESSD, Ubuntu 24.04 |
| Purchase | CNY 39 for one month; `ManualRenewal` |
| Expiry | 2026-09-29 16:00 UTC |
| Application image | `ghcr.io/superche/collabhub:sha-ebd517d00f028474671dea7592f69f8f3ecfb9fa` |
| Image workflow | [GitHub Actions run 33247777280](https://github.com/superche/collabhub/actions/runs/33247777280) |

The preferred 2 vCPU / 4 GiB plan was unavailable in Hong Kong at purchase time. This certification VM therefore uses the documented low-memory override plus 2 GiB swap. It certifies functionality and durability, not the published 2C4G performance envelope.

## Security and network

- Public firewall: TCP 80, TCP 443, and ICMP only. TCP 22 is closed.
- PostgreSQL, Redis, and the room worker are attached only to the internal Docker network.
- Gateway diagnostics bind to `127.0.0.1:17000`; Caddy is the only public application entry point.
- Browser Origin allowlist: `https://collabhub-demo.onrender.com`. Localhost origins were added only for the recorded browser acceptance, then removed.
- JWTs are document-scoped and signed from a server-side file secret. Acceptance tokens expired after ten minutes.
- Publicly trusted six-day Let's Encrypt certificate with IP SAN `47.82.72.49`.
- A systemd timer checks the certificate twice daily and renews it with Certbot when fewer than three days remain.

## Evidence

### Public service

`GET /readyz` returned HTTP/2 200 through the public IP and valid TLS certificate. This check used the literal IP address with no DNS or browser resolver override:

```json
{"ready":true,"rooms":0}
```

All five containers reported healthy: PostgreSQL 16, Redis 7.2, room worker, gateway, and Caddy. The root URL returns a small JSON service card; it does not expose the admin API or secrets.

### Public two-client protocol smoke

Two independent WebSocket clients connected through public WSS with the Render Demo origin:

```text
two_clients_ready: alice v0, bob v0
canonical_convergence: v1
idempotent_duplicate: accepted at v1 without version advance
presence_ephemeral: Alice observed by Bob
durable_snapshot: v1, title read back from PostgreSQL
```

The final run used the literal `wss://47.82.72.49/collab` endpoint and did not set `COLLABHUB_CONNECT_IP` or any DNS/browser resolver override. The smoke ran in a disposable Node container and used a fresh document, `indie-direct-ip-smoke-20260829`.

### Real React Flow integration

Two local React Flow pages, Alice and Bob, connected directly to the Alibaba Cloud server through public WSS. This was the real example application and its real Domain Pack—not a protocol-only test.

```text
document: react-flow-v1-20260829183326
add node: canonical v1 on both clients
coalesced drag: canonical v2 on both clients
offline edit: pending locally while disconnected
reconnect: pending operation replayed, canonical v4 on both clients
linked delete: canonical v5, 4 nodes, 0 edges on both clients
```

The recording is stored at `docs/assets/collabhub-react-flow-smoke.mp4`. A fresh verifier later recovered the same document at v5 directly from the public endpoint.

### Certificate renewal

The systemd timer was enabled and its first real check completed successfully:

```text
Certificate will not expire
IP certificate remains valid for more than three days.
collabhub-ip-certificate.service: status=0/SUCCESS
next check: approximately 12 hours
```

The certificate is valid from 2026-08-29 through 2026-09-05 and contains the critical IP SAN `47.82.72.49`.

### Process and VM restart recovery

The complete Compose stack was stopped and recreated without deleting volumes. The same document then produced:

```text
two_clients_ready: alice v2, bob v2
canonical_convergence: v3
idempotent_duplicate: accepted at v3 without version advance
durable_snapshot: v3
```

The React Flow document was also checked after a worker/gateway restart and after a full Alibaba Cloud VM reboot. Both times a new client recovered exactly v5 with 4 nodes and 0 edges. PostgreSQL reported canonical v5, snapshot v0, and WAL v5 before the full reboot; replay rebuilt the same state after boot. This proves recovery from durable data rather than an in-memory room.

### Backup restoration

The final post-smoke backup was restored into an isolated verification database:

```text
backups/collabhub-20260829T103739Z.dump
Backup restore verified (7 public tables)
```

### Ten-minute sustained run

A remote graph workload ran continuously through public WSS for 600.3 seconds:

```text
document: react-flow-v1-soak-20260829184134
accepted operations: 961
retries: 0
canonical events observed: 961
readiness checks: 19/19
final canonical version: 961
latency: p50 344.10 ms, p95 386.35 ms, p99 430.69 ms
PostgreSQL: canonical 961, snapshot 900, WAL 961, receipts 961
```

This is a bounded release certification for the low-cost single-VM shape, not a capacity or SLA claim.

### Idle resource snapshot

```text
Caddy      59.39 MiB
Gateway    82.93 MiB
Worker     121.8 MiB
PostgreSQL 60.8 MiB
Redis      25.06 MiB
Swap used  0 MiB / 2047 MiB
Host available memory approximately 1008 MiB / 1613 MiB
```

## Re-run

Install from a clean Ubuntu VM:

```bash
cd deploy/indie
cp .env.example .env
# Set COLLABHUB_HOST, ALLOWED_ORIGINS, and JWT_ISSUER.
# For a bare IP, also set COLLABHUB_CADDYFILE=./Caddyfile.ip.
./issue-ip-certificate.sh # bare IP only
./install.sh
sudo ./install-ip-renewal-timer.sh # bare IP only
```

Run the public protocol smoke from a checkout. `COLLABHUB_CONNECT_IP` is optional for diagnostics, but the final user-path acceptance must run without it.

```bash
COLLABHUB_HTTP_ORIGIN=https://203.0.113.10 \
COLLABHUB_WS_URL=wss://203.0.113.10/collab \
COLLABHUB_ALLOWED_ORIGIN=https://app.example.com \
COLLABHUB_ALICE_TOKEN='<short-lived-token>' \
COLLABHUB_BOB_TOKEN='<short-lived-token>' \
pnpm smoke:indie
```

Recover a known graph snapshot or run a sustained graph workload with the release scripts:

```bash
COLLABHUB_REMOTE_WS_URL=wss://203.0.113.10/collab \
COLLABHUB_REMOTE_ORIGIN=https://app.example.com \
COLLABHUB_REMOTE_TOKEN='<document-scoped-token>' \
COLLABHUB_REMOTE_DOCUMENT_ID='<document-id>' \
pnpm smoke:remote-snapshot

# The soak script defaults to ten minutes; use an isolated document.
COLLABHUB_REMOTE_WS_URL=wss://203.0.113.10/collab \
COLLABHUB_REMOTE_ORIGIN=https://app.example.com \
COLLABHUB_REMOTE_TOKEN='<document-scoped-token>' \
COLLABHUB_REMOTE_DOCUMENT_ID='<new-document-id>' \
pnpm smoke:remote-soak
```
