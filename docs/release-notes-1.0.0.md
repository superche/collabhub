# CollabHub 1.0.0

CollabHub 1.0 is the first stable release for adding server-controlled collaboration to an existing React application without replacing its domain model.

## Stable integration path

- `npx @collabhub/create-react@1.0.0 init .` adds one shared model, a React-compatible store boundary, a server entry, Dockerfile, doctor, and two-client verifier without editing existing components.
- `getAuthToken` obtains a short-lived token on every connection and reconnect. The React app keeps its existing login; its backend grants the current user access to one document.
- Domain rules, linked updates, validation, and stale-command choices remain in one application-owned model file.
- The generated runtime can be selected beside an existing REST runtime at the composition root.

## Runtime and operations

- Standalone file storage for evaluation and small single-node installs.
- PostgreSQL + Redis Gateway/Worker runtime with room ownership, failover, idempotency, compaction, schema migration, shared rate limits, metrics, readiness, and graceful drain.
- Docker, generic VM, Kubernetes, AWS, Alibaba Cloud, and a budget single-VM profile.
- JWT through backend-only HS256 secrets or managed JWKS; tenant/document grants and Origin restrictions are enforced.

## Verified examples

TODO List, BlockNote, React Flow, and CollabHub + Yjs demonstrate structured updates, linked fields, ordering, coalescing, offline replay, snapshot recovery, and REST fallback. Character-level rich-text merge remains intentionally delegated to Yjs.

Read [API stability](api-stability.md), [known limitations](known-limitations.en.md), [production hardening](production-hardening.md), and [acceptance evidence](acceptance.en.md) before production rollout.
