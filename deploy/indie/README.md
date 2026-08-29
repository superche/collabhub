# Indie single-VM deployment

Real-cloud acceptance evidence: [Alibaba Cloud, 2026-08-29](../../docs/acceptance-indie-alicloud-2026-08-29.md).

This profile runs the persistent CollabHub runtime, PostgreSQL, Redis, and TLS on one 2 vCPU / 4 GiB Linux VM. It targets independent developers and certification environments with a hard monthly budget. It is intentionally single-node: a VM outage interrupts service, but PostgreSQL data survives ordinary container and process restarts.

Only ports `80` and `443` are public. Restrict SSH to an administrator IP. PostgreSQL, Redis, Gateway port `7000`, and Worker port `7100` remain inside Docker networks.

```bash
cd deploy/indie
cp .env.example .env
# Set the public host, browser Origin, JWT issuer, audience, and an immutable image.
./install.sh
./smoke.sh
```

If the VM has only a public IPv4 address, CollabHub can use a publicly trusted
Let's Encrypt IP certificate without a domain or dynamic-DNS service:

```bash
# .env
COLLABHUB_HOST=203.0.113.10
COLLABHUB_CADDYFILE=./Caddyfile.ip

./issue-ip-certificate.sh
./install.sh
sudo ./install-ip-renewal-timer.sh
```

IP certificates are short-lived. The timer checks twice daily and renews when
fewer than three days remain. Port `80` must remain reachable for renewal.

Do not silently fall back to an old image. The example pins the production-hardening certification image used by this repository; replace it with the next immutable release or digest after that release passes the same acceptance.

The application backend signs short-lived HS256 tokens using `secrets/jwt-shared-secret`, or the Compose file can be adapted to an existing JWKS provider. Tokens must include `sub`, `tenant_id`, `collabhub_documents`, issuer, audience, and expiry. Never expose the shared secret to React.

Create and verify a database backup:

```bash
./backup.sh
./verify-backup.sh
```

Backups remain local until an operator copies them to private object storage. For a long-lived deployment, schedule `backup.sh`, upload the encrypted result off-host, and run a restore drill monthly.

This profile does not provide multi-node failover, zero-downtime upgrades, a managed database SLA, or cross-region disaster recovery. Move to `deploy/vm`, `deploy/kubernetes`, or a cloud Terraform baseline when those properties are required.
