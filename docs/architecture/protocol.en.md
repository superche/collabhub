# v0.1 protocol and operation pipeline

## Operation envelope

Every operation carries document identity, actor/client identity, a stable idempotency `operationId`, the canonical `baseVersion` observed when it was created, and independent schema/strategy identifiers and versions. Reconnect and snapshot recovery never rewrite `baseVersion`.

Server results are:

- `accepted`: canonical version plus incremental patches; duplicate delivery returns the original result.
- `rejected`: no version change and a structured reason.
- `resyncRequired`: the recovery window or schema is incompatible, with a snapshot reference.
- `retryLater`: temporary ownership or backpressure failure; the client retains the operation identity.

After hello, the Gateway binds an immutable connection identity. Submit, recovery, and presence messages cannot override its tenant, document, actor, or client.

## Canonical patches and strategies

v0.1 patches are `set`, `remove`, `entityUpsert`, `entityDelete`, and `listOrder`. JSON pointer input is bounded and rejects prototype-mutating segments.

| Operation | Strategy | Concurrent behavior |
|---|---|---|
| `property.set/unset` | `json.property-lww@1.0` | Server-receive-order LWW per property |
| `entity.create/delete/restore` | `json.entity-lifecycle@1.0` | Stable IDs; explicit lifecycle |
| `list.move/insert` | `json.list-order@1.0` | Recompute fractional rank against current order |
| `transaction.apply` | `json.reject-if-stale@1.0` | Submitted `baseVersion` must equal current version |

## Version policy

Server history records the canonical version at which each operation committed. For an operation submitted from v7, concurrent history is every operation committed after v7. It is incorrect to infer this from another operation's own `baseVersion`.

`DomainPack.operationVersionPolicy` decides `resolve`, `reject`, or `resync`. The selected strategy then performs the merge. This supports both optimistic structured collaboration and strict stale-write rejection without changing operation identity.

Standalone sessions and distributed Room Workers use the same `AuthoritativeOperationPipeline`; only their commit adapters differ. Pipeline hooks cover authentication, authorization, schema validation, normalization, invariants, and commit lifecycle. Strategies are trusted, deterministic, in-process extensions in v0.1.
