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
openssl rand -hex 32 > secrets/jwt-shared-secret
# Edit .env: PRIVATE_IP, JWT_ISSUER/JWT_AUDIENCE and ALLOWED_ORIGINS.
./install.sh
```

Your existing backend signs a short-lived HS256 JWT with `sub`, `tenant_id`, `collabhub_documents`, issuer, audience, and expiry; React fetches that token and never receives the shared secret. If the app already uses Clerk, Auth0, Supabase, or another JWKS provider, remove the three `JWT_SHARED_SECRET_FILE` entries and the `jwt_shared_secret` secret from `docker-compose.yml`, then set `JWT_JWKS_URL` in the Gateway environment. The two modes are intentionally mutually exclusive.

```ts
// Your existing backend route: GET /api/collabhub-token?documentId=...
const token = await new SignJWT({ tenant_id: user.teamId, collabhub_documents: [documentId] })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(user.id).setIssuer('my-app').setAudience('collabhub').setExpirationTime('5m')
  .sign(new TextEncoder().encode(process.env.COLLABHUB_JWT_SECRET!))
```

Repeat on a second VM with the same four secrets and a different `NODE_NAME`/`PRIVATE_IP`, then add both port-7000 targets to the load balancer. Upgrade by changing `COLLABHUB_IMAGE` to an immutable version or digest and running `./upgrade.sh` one VM at a time. The script verifies readiness and restores the previous local image if the new container fails.

For a certification run before a numbered release, the repository can publish `ghcr.io/superche/collabhub:sha-<commit>` through the **Publish certification image** workflow. It does not publish npm packages, create a Git tag, or claim a release.

The runtime is not tied to Alibaba Cloud or AWS. The managed services only need PostgreSQL, Redis, private networking, and TLS at the load balancer.
