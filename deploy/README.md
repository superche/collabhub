# Deployment

```text
deploy/
  docker/       Distributed, standalone, and public-demo images
  domain-pack/  Declarative JSON and trusted ESM examples
  local/        Local PostgreSQL/Redis cluster and Nginx
  indie/        Single-VM persistent deployment for independent developers
  vm/           Cloud-neutral existing-VM Docker Compose
  kubernetes/   Cloud-neutral Kustomize base
  aws/          $12/month AWS Lightsail single-VM Terraform stack
  alicloud/     Alibaba Cloud ECS + RDS + Tair Terraform stack
```

Choose one path:

- Evaluation or a small internal tool: `docker/standalone.Dockerfile`.
- Independent-developer production or a one-month certification environment: follow `indie/README.md`.
- Observable local failover: `local/docker-compose.yml`.
- Existing Linux VMs with managed PostgreSQL/Redis: follow `vm/README.md`.
- Kubernetes platform: `kubectl apply -k deploy/kubernetes/base` after creating managed PostgreSQL/Redis and secrets.
- AWS single-VM deployment: follow `aws/README.md` (default Lightsail list price: $12/month in us-east-1).
- Alibaba Cloud VM baseline: follow `alicloud/README.md`.

The distributed image starts either a Gateway or Worker according to `COLLABHUB_ROLE`. Every process in one deployment must load the same Domain Pack and schema version.

Never use the local Compose credentials or insecure identity setting in production. The Indie profile provides HTTPS, verified JWTs, durable PostgreSQL, backup/restore, and strict internal networking on one VM, but it does not claim failover. The AWS path automates this profile on Lightsail. HA deployments use the cloud-neutral VM/Kubernetes paths with managed databases and at least two nodes.

Render remains the real public demo deployment. It validates internet-facing TLS/WSS and collaboration behavior, while the VM/cloud paths add persistent storage, multi-node failover, backups, and secret management. See [production hardening](../docs/production-hardening.md).
