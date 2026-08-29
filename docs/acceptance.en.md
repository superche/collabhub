# Acceptance evidence

## v1.0 certification — 2026-08-29

The source and all ten public packages report `1.0.0`. Stable `v1.0.0` was published from `main@77ef617f154d1c739a419c7bc1f1d109c5be9b92` on 2026-08-29 after the exact release commit passed CI and the remote checks below.

- [Main CI run 33249380314](https://github.com/superche/collabhub/actions/runs/33249380314) passed all six jobs, including the full quality, local-cluster, container, and deploy-configuration gates.
- [Stable release run 33249539483](https://github.com/superche/collabhub/actions/runs/33249539483) repeated the release gates, published all ten packages through npm Trusted Publishing with provenance, built both multi-architecture GHCR images with attestations, and created the immutable [v1.0.0 release](https://github.com/superche/collabhub/releases/tag/v1.0.0).
- A post-release clean Vite React project installed `@collabhub/create-react@1.0.0` from the public npm registry; init, doctor, dependency install, TypeScript, and Vite production build all passed with zero reported vulnerabilities.
- Render manually deployed exact source `77ef617`; `/healthz` reports `1.0.0`. The post-deploy live smoke passed Alice/Bob convergence, one coalesced drag, offline replay to canonical v4, untrusted-Origin rejection, bilingual landing content, blue theme, favicon, and GitHub link.

- `pnpm release:check`: 24 Vitest files / 90 tests; ten package artifact audits; 1,000-section patch p95 0.011 ms against a 4 ms budget.
- Production authentication accepts either managed JWKS or a backend-only 32+ byte HS256 secret. Real signed-token tests prove issuer, audience, tenant, document grant, and subject enforcement; file-backed secret loading is also covered. React never receives the signing secret.
- `pnpm test:e2e`: five real-browser TODO List, BlockNote, and React Flow cases.
- `pnpm smoke:todo-cluster`: two independent Gateways and Workers; cross-Gateway convergence, real writer termination/takeover, offline replay, and fresh-browser snapshot recovery; PostgreSQL ended at canonical v5 / owner epoch 2.
- `pnpm smoke:postgres-hardening`: idempotent database migrations 1/2; transactional business schema `1.0 -> 2.0`; compaction removed 3 WAL, 5 receipts, 5 delivered outbox rows, and 2 snapshots; recovery returned v5; two independent Redis clients observed one shared bucket as `[true,true,false]`.
- `pnpm smoke:demo`: two-client v2 convergence, Origin rejection, connection capacity, active-room protection, expired-room deletion, blue theme, favicon, and GitHub Star link.
- Local builds passed for distributed, demo, and standalone images. Alibaba Cloud/AWS provider validation, Kustomize rendering, and generic VM Compose parsing passed. Alibaba Cloud planning now refuses local state and requires encrypted OSS state plus Tablestore locking.
- `pnpm publish:dry-run` packed and audited all ten `1.0.0` packages without publishing them.
- [GitHub Actions run 33249111502](https://github.com/superche/collabhub/actions/runs/33249111502) built the exact-release amd64/arm64 candidate `ghcr.io/superche/collabhub:sha-77ef617f154d1c739a419c7bc1f1d109c5be9b92`.
- A real 2C2G Alibaba Cloud SWAS VM in Hong Kong upgraded from the prior immutable image through `deploy/indie/upgrade.sh`; the script created a backup first and both Gateway and Worker became healthy on the candidate image.
- A locally started Alice/Bob React Flow pair connected directly to `wss://47.82.72.49/collab` with short-lived document-scoped tokens. The human-speed trace reached canonical v5 through add, coalesced drag, offline pending replay, reconnect, and linked-edge deletion. The recording is [`docs/assets/collabhub-react-flow-smoke.mp4`](assets/collabhub-react-flow-smoke.mp4).
- Fresh clients recovered the same document at v5 / 4 nodes / 0 edges after both a Gateway+Worker restart and a full VM reboot. PostgreSQL retained head v5 and five WAL rows.
- `backup.sh` created a private custom-format dump; `verify-backup.sh` restored it into a temporary database and verified all seven public tables.
- A 600.3-second public HTTPS/WSS soak accepted and broadcast 961/961 incremental graph operations with zero retries, 19 successful readiness samples, and p50/p95/p99 latency of 344.10/386.35/430.69 ms from the developer machine. PostgreSQL ended at canonical v961 / snapshot v900 / 961 WAL / 961 receipts. Final container memory was 83 MiB Gateway, 122 MiB Worker, 61 MiB PostgreSQL, 59 MiB Caddy, and 25 MiB Redis; host swap remained unused.

This certifies the budget single-VM KISS profile and its public WSS, persistence, backup, and restart path. Render remains the public demo and intentionally uses ephemeral storage. The AWS single-VM and Alibaba Cloud HA templates are provider-validated deployment baselines; neither validation is a managed-service SLA or a completed regional failover certification.

CollabHub `0.2.0` is a technical preview, not a production SLO. The 2026-08-28 local release gate produced this evidence:

- `pnpm release:check`: 20 Vitest files / 70 tests; all packages and three examples built; 1,000-section patch p95 0.010 ms against a 4 ms budget.
- Ten `@collabhub/*@0.2.0` tarballs passed ESM/type/export/source-leak/workspace-dependency audits and npm publish dry-run.
- `smoke:existing-react`: init left `App.tsx` unchanged; doctor, TypeScript build, and a two-client server-computed linked value (`42`) passed.
- `smoke:fresh-react`: clean tarball install exposed two runtime packages and zero UI imports; linked word count `3` arrived at v1, then an offline operation survived page close/reopen through IndexedDB and both clients reached v2 with pending `0`.
- Playwright: five TODO List, BlockNote, and React Flow browser tests passed; public-demo lifecycle/Origin/capacity smoke passed.
- Local cluster: two Gateways, two Workers, separate Alice/Bob browser processes, writer failover, offline replay, snapshot recovery, WAL/receipt/outbox evidence, final canonical v5.
- Local Docker builds passed for `standalone:0.2.0` and PostgreSQL/Redis `0.2.0` images.

The release workflow repeats these gates, publishes npm packages through Trusted Publishing with provenance, builds amd64/arm64 GHCR images with attestations, and creates the immutable `v0.2.0` prerelease. Public Render evidence is recorded only after that deployment finishes.

## Historical v0.1.3 release

All nine `@collabhub/*@0.1.3` packages were published through npm Trusted Publishing with provenance. Tag `v0.1.3` resolves to commit `b9093372faa14456148a1f104871486186336fd9`.

## Existing React adoption

`pnpm smoke:fresh-react` runs the new-project consumer path in a fresh temporary directory. `pnpm smoke:existing-react` separately starts with an ordinary React project and proves that init does not change its component.

1. scaffold an ordinary React app;
2. assert that only `@collabhub/client-core` and `@collabhub/server-ws` are exposed;
3. install packed npm artifacts from scratch;
4. build the app and start the server plus two independent clients;
5. edit in Alice and assert Bob converges with the same linked word count;
6. take Alice offline, submit, close the page, reopen the same browser profile, and assert IndexedDB replay reaches canonical version 2 with pending zero;
6. assert business files import no CollabHub package and the generated standalone Dockerfile exists.

The default production shape is one React SDK entry plus one persistent authoritative service. Advanced protocol, strategy, storage, and distributed-runtime packages remain available behind those entries.

## Collaboration matrix

| Scenario | Automated evidence |
|---|---|
| Concurrent property LWW | Server Core tests converge by authoritative commit order |
| Concurrent section move | Fractional positions remain unique and deterministic |
| Duplicate delivery | Same `operationId` returns the stored result without a new version |
| Reject if stale | Strict transactions reject stale base versions |
| Business-defined stale resolution | Domain Pack policy may re-evaluate safe intent against canonical state |
| Snapshot and WAL recovery | Snapshot restore plus later WAL replay reconstructs canonical state |
| Offline pending replay | Client retains operation identity and replays after reconnect |
| Linked business update | One TODO intent atomically patches entity, counters, progress, and revision |
| REST/Collab switch | The same React components run through REST when collaboration is disabled |
| Double-write prevention | REST mutation returns 409 while the collaborative writer is active |
| BlockNote | Incremental block edit, insert, move, offline recovery, and coalescing |
| React Flow | Incremental node/edge edits, drag-stop coalescing, and linked-edge deletion |
| Presence | Delivered ephemerally; absent from WAL, snapshot, and canonical version |

## Public edge and room lifecycle

The production-bundle smoke rejects an untrusted Origin with HTTP `403` before the WebSocket upgrade, applies connection limits, keeps active rooms warm, and reclaims disconnected rooms after TTL. Reopening an expired public-demo URL starts a clean graph.

The scheduled live smoke checks the deployed `/healthz`, requires the Origin allowlist to be observable as active, rejects an untrusted WebSocket Origin, and completes an allowed handshake.

## Scale and containers

CI builds the demo, standalone, and PostgreSQL/Redis distributed images. The local cluster acceptance starts two Gateways and two Room Workers as independent processes, kills the current writer, and verifies fenced takeover, linked updates, pending replay, and snapshot recovery.

The deploy-configuration gate renders Docker Compose and the 11-resource Kustomize base, then initializes and validates the AWS single-VM and Alibaba Cloud HA Terraform stacks against their real provider schemas. Both cloud-init templates were also rendered locally with complete inputs. Those Terraform stacks were not applied; the separate real Indie Alibaba Cloud VM and its bounded soak are documented above.

Detailed traces, payload sizes, process IDs, performance samples, and historical recordings remain in the [full Chinese acceptance log](acceptance.md). Read [known limitations](known-limitations.en.md) before adoption.
