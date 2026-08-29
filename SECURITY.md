# Security policy

## Supported versions

CollabHub is currently validating `0.2.x`. No version is declared production-ready until a signed release is published.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use [GitHub private vulnerability reporting](https://github.com/superche/collabhub/security/advisories/new) and include:

- affected package, version, and deployment mode;
- reproduction steps or a minimal repository;
- expected impact and any known mitigation.

Never include production credentials or personal data. Maintainers will acknowledge a complete report as soon as practical and coordinate disclosure after a fix is available.

## Example security boundary

The examples use query-string identities and local development tokens. They are not authentication implementations. Production adopters must provide authentication, authorization, tenant isolation, rate limits, TLS, and secret management as documented in [integration readiness](docs/integration/readiness.md).

The distributed runtime supports shared-secret or JWKS JWT identity binding, Origin filtering, cluster-wide Redis rate limits, bounded payloads, file-backed secrets, private authenticated metrics, and graceful drain. The full deployment and recovery checklist is in [production hardening](docs/production-hardening.md).
