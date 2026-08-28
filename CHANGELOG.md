# Changelog

All notable changes are recorded here. CollabHub follows Semantic Versioning after `1.0.0`.

## Unreleased

## 0.1.3 — deployable Domain Packs and cloud baselines

- Load the distributed JSON Domain Pack from a validated JSON file or a reviewed ESM module mounted read-only at runtime.
- Add production-baseline Terraform stacks for two-zone AWS and Alibaba Cloud VM deployments with managed PostgreSQL, Redis, HTTPS load balancing, and at least two 2C4G nodes.
- Move all Docker, local-cluster, and Kubernetes assets under a single `deploy/` hierarchy.
- Validate Docker Compose, Kustomize, and both Terraform providers in CI.

## 0.1.2 — safer WebSocket edge and clearer React onboarding

- Reject untrusted WebSocket origins before the HTTP upgrade in the public demo and `@collabhub/server-ws`.
- Make the live deployment smoke close rejected upgrade responses cleanly so hosted checks cannot hang after success.
- Rewrite the README integration path around an existing React runtime, with copyable code and a clear map of where custom rules, access checks, and storage belong.
- Let `createCollaboration` accept ordinary application interfaces and ordinary entity objects without a `JsonObject` intersection.

## 0.1.1 — lower-friction technical preview

- Added `createCollaboration` and `json.*` as the default React-facing API.
- Added a persistent standalone service, container image, and generated Dockerfile.
- Reduced the generated starter to two CollabHub dependencies.
- Added live Origin-policy smoke coverage and public-demo lifecycle controls.

- Prepared nine ESM/type package artifacts with provenance-ready metadata.
- Added a React-compatible `CollaborationStore` while preserving application-owned commands and domain state.
- Added CI, release artifact preparation, package audits, and a free Render demo blueprint.
- Added TODO List, BlockNote, React Flow, local multi-process, and distributed acceptance evidence.

## 0.1.0 — validation baseline

- Server-authoritative operation/canonical-patch protocol.
- Client reconnect, pending replay, diagnostics, and snapshot recovery.
- JSON LWW, entity lifecycle, list ordering, and reject-if-stale strategies.
- PostgreSQL/Redis horizontal runtime with fencing, WAL, receipts, outbox, and snapshots.

`0.1.0` remains a validation version. No `1.0.0` release has been approved.
