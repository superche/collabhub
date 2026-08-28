# @collabhub/server-distributed

PostgreSQL/Redis runtime with stateless Gateways, fenced single-writer Room Workers, transactional outbox, snapshot recovery, JWT/JWKS authentication, and warm-room eviction.

The bundled CLI accepts a declarative JSON Domain Pack through `COLLABHUB_DOMAIN_PACK_CONFIG`, or a reviewed ESM module through `COLLABHUB_DOMAIN_PACK_MODULE`. Set only one. The standalone CLI uses the same loader; without either setting, both retain their built-in JSON fallback.

See the [horizontal scaling guide](https://github.com/superche/collabhub/blob/main/docs/architecture/horizontal-scaling.en.md).
