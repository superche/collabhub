# CollabHub 0.1.3 technical preview

This patch makes the distributed server deployable without rebuilding CollabHub for each application.

- Mount a validated JSON Domain Pack for built-in field, entity, list, and stale-operation rules.
- Mount a reviewed ESM Domain Pack for linked fields, validation, or custom conflict handling.
- Deploy a two-zone VM baseline on AWS or Alibaba Cloud with managed PostgreSQL, Redis, and HTTPS load balancing.
- Use the reorganized Docker, Kubernetes, and local-cluster assets under `deploy/`.

All nine npm packages and both container images are built from the same commit. This remains a technical preview for structured React state; `v1.0.0` still requires repository-owner approval.
