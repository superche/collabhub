# Acceptance evidence

## v1.0 production-hardening candidate — 2026-08-29

The source still reports `0.2.0`: no `v1.0.0` tag or v1 npm package has been published. Current owner-approval evidence:

- `pnpm release:check`: 24 Vitest files / 87 tests; ten package artifact audits; 1,000-section patch p95 0.007 ms against a 4 ms budget.
- `pnpm test:e2e`: five real-browser TODO List, BlockNote, and React Flow cases.
- `pnpm smoke:todo-cluster`: two independent Gateways and Workers; cross-Gateway convergence, real writer termination/takeover, offline replay, and fresh-browser snapshot recovery; PostgreSQL ended at canonical v5 / owner epoch 2.
- `pnpm smoke:postgres-hardening`: idempotent database migrations 1/2; transactional business schema `1.0 -> 2.0`; compaction removed 3 WAL, 5 receipts, 5 delivered outbox rows, and 2 snapshots; recovery returned v5; two independent Redis clients observed one shared bucket as `[true,true,false]`.
- `pnpm smoke:demo`: two-client v2 convergence, Origin rejection, connection capacity, active-room protection, expired-room deletion, blue theme, favicon, and GitHub Star link.
- Local builds passed for distributed, demo, and standalone images. Alibaba Cloud/AWS provider validation, Kustomize rendering, and generic VM Compose parsing passed.
- `pnpm publish:dry-run` found all ten `0.2.0` packages already published and did not publish a new version.

Render remains the real public HTTPS/WSS demo. Alibaba Cloud multi-node persistence certification still requires identity review, a Terraform plan, explicit apply approval, failure/recovery drills, and a short soak; local evidence does not replace that gate.

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

The deploy-configuration gate renders Docker Compose and the 11-resource Kustomize base, then initializes and validates the AWS and Alibaba Cloud Terraform stacks against their real provider schemas. Both cloud-init templates were also rendered locally with complete inputs. No managed-cloud resources were created and no cloud soak result is claimed.

Detailed traces, payload sizes, process IDs, performance samples, and historical recordings remain in the [full Chinese acceptance log](acceptance.md). Read [known limitations](known-limitations.en.md) before adoption.
