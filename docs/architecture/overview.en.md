# Architecture and reliability

CollabHub's stable boundary is the authoritative operation protocol, not a room framework, CRDT data structure, or React store. Each document has one server-side ordering point. Clients submit intent, keep a disposable optimistic overlay, and consume canonical patches.

```text
React action -> host CommandBus -> Collab adapter -> Client Core
                                                    | operation
                                                    v
Gateway -> Room Worker -> operation pipeline -> Domain Pack
              |                   |                  |
              |                   |                  + strategy/invariants
              + WAL/receipt/outbox + canonical patches -> every client
```

The public Protocol, Client Core, and Server Core APIs expose no WebSocket, Express, or concrete room-runtime types. `server-core` is embeddable; `server-ws` supplies the minimal standalone transport; `server-distributed` supplies stateless Gateways, single-writer Room Workers, PostgreSQL commits, and Redis routing.

## Commit and recovery

Submissions for one document are serialized:

1. Bind trusted connection identity and validate the envelope/schema.
2. Let the Domain Pack version policy resolve, reject, or request resync.
3. Resolve the selected strategy against canonical state and committed concurrent operations.
4. Apply the complete patch set, check invariants, and commit one new canonical version.
5. Standalone appends WAL before advancing memory; distributed commits WAL, receipt, head, and outbox in one PostgreSQL transaction with writer fencing.

A strategy may emit multiple patches. They are validated and committed as one document-local atomic change, so clients cannot observe a partial linked update. Cross-document or external-database atomicity is outside this boundary.

Recovery loads the newest snapshot and replays later WAL. Operation receipts preserve idempotency across reconnect and restart. Distributed outbox delivery is at least once; Gateways compare PostgreSQL head watermarks and repair missed Redis Pub/Sub events from WAL.

## Client model

```text
projected state = canonical state + pending optimistic patches
```

Accepted results advance canonical state and remove pending intent. Rejection drops its overlay. A version gap or `resyncRequired` requests a snapshot. Pending operations retain their original `operationId` and submitted `baseVersion` when replayed; the business version policy decides whether stale intent is safe to resolve.

Presence uses an ephemeral channel. It does not submit to the authoritative session or enter WAL/snapshots.

## Low-intrusion host boundary

Examples enforce with tests that `components` and `domain` do not import `@collabhub/*`. Collaboration code is concentrated in `src/collab`, the composition root, and the server Domain Pack. A REST application can therefore retain its domain model, store, command bus, and components while switching only the transport composition.
