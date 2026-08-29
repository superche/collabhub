# Indie Alibaba Cloud acceptance — 2026-08-29

This run certifies the one-VM Indie deployment path against a real Alibaba Cloud server. It covers deployment, public HTTPS/WSS, two-client convergence, idempotency, restart recovery, and backup restoration.

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
| Application image | `ghcr.io/superche/collabhub:sha-0a102f042808a0fda7b33476fc7b981f47868d56` |
| Image workflow | [GitHub Actions run 33242474701](https://github.com/superche/collabhub/actions/runs/33242474701) |

The preferred 2 vCPU / 4 GiB plan was unavailable in Hong Kong at purchase time. This certification VM therefore uses the documented low-memory override plus 2 GiB swap. It certifies functionality and durability, not the published 2C4G performance envelope.

## Security and network

- Public firewall: TCP 80, TCP 443, and ICMP only. TCP 22 is closed.
- PostgreSQL, Redis, and the room worker are attached only to the internal Docker network.
- Gateway diagnostics bind to `127.0.0.1:17000`; Caddy is the only public application entry point.
- Browser Origin allowlist: `https://collabhub-demo.onrender.com`.
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

### Certificate renewal

The systemd timer was enabled and its first real check completed successfully:

```text
Certificate will not expire
IP certificate remains valid for more than three days.
collabhub-ip-certificate.service: status=0/SUCCESS
next check: approximately 12 hours
```

The certificate is valid from 2026-08-29 through 2026-09-05 and contains the critical IP SAN `47.82.72.49`.

### Cold restart recovery

The complete Compose stack was stopped and recreated without deleting volumes. The same document then produced:

```text
two_clients_ready: alice v2, bob v2
canonical_convergence: v3
idempotent_duplicate: accepted at v3 without version advance
durable_snapshot: v3
```

This proves the room recovered from PostgreSQL rather than starting again at v0. The current IP certificate is stored in the ignored host-side `certbot` directory and remained usable across a forced Caddy container recreation.

### Backup restoration

The final post-smoke backup was restored into an isolated verification database:

```text
backups/collabhub-20260829T084045Z.dump
Backup restore verified (7 public tables)
```

### Idle resource snapshot

```text
Caddy      56.87 MiB
Gateway    30.95 MiB
Worker     35.25 MiB
PostgreSQL 56.52 MiB
Redis      24.09 MiB
Swap used  0 MiB / 2047 MiB
Disk used  6.0 GiB / 40 GiB
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
