# Existing VM

This is the cloud-neutral production path: one Linux VM runs one Gateway and one Room Worker. PostgreSQL and Redis stay external so a second VM can join without changing application data.

Requirements: Docker Engine with Compose v2, a private PostgreSQL 16 endpoint, a private Redis 7 endpoint, and an HTTPS/WSS load balancer that forwards to port `7000`. Open port `7100` only between CollabHub VMs.

```bash
cd deploy/vm
cp .env.example .env
cp ../domain-pack/domain-pack.example.json domain-pack.json
mkdir -p secrets
printf '%s' 'postgresql://USER:PASSWORD@HOST:5432/collabhub?sslmode=require' > secrets/database-url
printf '%s' 'rediss://default:PASSWORD@HOST:6379' > secrets/redis-url
openssl rand -hex 32 > secrets/internal-token
# Edit .env: PRIVATE_IP, JWT_* and ALLOWED_ORIGINS.
./install.sh
```

Repeat on a second VM with the same three secrets and a different `NODE_NAME`/`PRIVATE_IP`, then add both port-7000 targets to the load balancer. Upgrade by changing `COLLABHUB_IMAGE` to an immutable version or digest and running `./upgrade.sh` one VM at a time. The script verifies readiness and restores the previous local image if the new container fails.

For a certification run before a numbered release, the repository can publish `ghcr.io/superche/collabhub:sha-<commit>` through the **Publish certification image** workflow. It does not publish npm packages, create a Git tag, or claim a release.

The runtime is not tied to Alibaba Cloud or AWS. The managed services only need PostgreSQL, Redis, private networking, and TLS at the load balancer.
