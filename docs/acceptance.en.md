# Acceptance evidence

CollabHub is promoted as a `0.1.1` technical preview, not a production SLO. The release gate validates the following on Node.js 22/24 and Playwright Chromium.

## Existing React adoption

`pnpm smoke:fresh-react` runs the consumer path in a fresh temporary directory:

1. scaffold an ordinary React app;
2. assert that only `@collabhub/client-core` and `@collabhub/server-ws` are exposed;
3. install packed npm artifacts from scratch;
4. build the app and start the server plus two independent clients;
5. edit in Alice and assert Bob converges to canonical version 1 with no pending operation;
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

The production-bundle smoke rejects an untrusted Origin with code `1008`, applies connection limits, keeps active rooms warm, and reclaims disconnected rooms after TTL. Reopening an expired public-demo URL starts a clean graph.

The scheduled live smoke checks the deployed `/healthz`, requires the Origin allowlist to be observable as active, rejects an untrusted WebSocket Origin, and completes an allowed handshake.

## Scale and containers

CI builds the demo, standalone, and PostgreSQL/Redis distributed images. The local cluster acceptance starts two Gateways and two Room Workers as independent processes, kills the current writer, and verifies fenced takeover, linked updates, pending replay, and snapshot recovery.

Detailed traces, payload sizes, process IDs, performance samples, and historical recordings remain in the [full Chinese acceptance log](acceptance.md). Read [known limitations](known-limitations.en.md) before adoption.
