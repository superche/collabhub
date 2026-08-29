# Indie single-VM deployment

This profile runs the persistent CollabHub runtime, PostgreSQL, Redis, and TLS on one 2 vCPU / 4 GiB Linux VM. It targets independent developers and certification environments with a hard monthly budget. It is intentionally single-node: a VM outage interrupts service, but PostgreSQL data survives ordinary container and process restarts.

Only ports `80` and `443` are public. Restrict SSH to an administrator IP. PostgreSQL, Redis, Gateway port `7000`, and Worker port `7100` remain inside Docker networks.

```bash
cd deploy/indie
cp .env.example .env
# Set the public host, browser Origin, JWT issuer, audience, and an immutable image.
./install.sh
./smoke.sh
```

Do not silently fall back to an old image. The example pins the production-hardening certification image used by this repository; replace it with the next immutable release or digest after that release passes the same acceptance.

The application backend signs short-lived HS256 tokens using `secrets/jwt-shared-secret`, or the Compose file can be adapted to an existing JWKS provider. Tokens must include `sub`, `tenant_id`, `collabhub_documents`, issuer, audience, and expiry. Never expose the shared secret to React.

Create and verify a database backup:

```bash
./backup.sh
./verify-backup.sh
```

Backups remain local until an operator copies them to private object storage. For a long-lived deployment, schedule `backup.sh`, upload the encrypted result off-host, and run a restore drill monthly.

This profile does not provide multi-node failover, zero-downtime upgrades, a managed database SLA, or cross-region disaster recovery. Move to `deploy/vm`, `deploy/kubernetes`, or a cloud Terraform baseline when those properties are required.
