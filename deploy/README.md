# Deployment

```text
deploy/
  docker/       Distributed, standalone, and public-demo images
  domain-pack/  Declarative JSON and trusted ESM examples
  local/        Local PostgreSQL/Redis cluster and Nginx
  kubernetes/   Cloud-neutral Kustomize base
  aws/          AWS VM + RDS + ElastiCache Terraform stack
  alicloud/     Alibaba Cloud ECS + RDS + Tair Terraform stack
```

Choose one path:

- Evaluation or a small internal tool: `docker/standalone.Dockerfile`.
- Observable local failover: `local/docker-compose.yml`.
- Kubernetes platform: `kubectl apply -k deploy/kubernetes/base` after creating managed PostgreSQL/Redis and secrets.
- AWS VM baseline: follow `aws/README.md`.
- Alibaba Cloud VM baseline: follow `alicloud/README.md`.

The distributed image starts either a Gateway or Worker according to `COLLABHUB_ROLE`. Every process in one deployment must load the same Domain Pack and schema version.

Never use the local Compose credentials or insecure identity setting in production. Cloud stacks require HTTPS, JWT/JWKS, managed databases, and at least two VM nodes.
