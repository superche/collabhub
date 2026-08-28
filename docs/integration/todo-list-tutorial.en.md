# TODO List: from REST baseline to collaboration

The example begins as a conventional React application. `DraftDocument`, `DraftStore`, `DraftCommandBus`, the REST Draft API, and `DraftRepository` remain host-owned.

## Boundary

```text
React components -> DraftCommandBus -> DraftCommandTransport
                                      |- RestDraftTransport
                                      `- CollabHubDraftTransport
```

Only `src/collab`, the composition root, and the server Domain Pack know about CollabHub. Import-boundary tests prevent `components`, `application`, and `domain` from importing CollabHub packages.

## Migration

1. Keep `DraftCommandTransport` as the application port.
2. Map each `DraftCommand` to one versioned intent in the command adapter.
3. Apply canonical patches through the projection adapter.
4. Select REST or collaboration only in the composition root.
5. Route every shared write through the authoritative gateway while a collaborative room is active.

The collaboration transport owns reconnect, pending replay, canonical version, reject/resync diagnostics, and presence. The React components still read `DraftStore` and send business commands.

## Linked update

`section.setCompleted` is one client intent. The server Domain Pack derives patches for:

- the task entity;
- completed and total counts;
- progress percentage;
- canonical revision.

All patches commit and broadcast under one canonical version, so another device never observes a partially updated summary.

## Stale commands

The operation keeps its submitted `baseVersion`. The Domain Pack allows safe commands to resolve against current canonical state, while `draft.submitReview` retains strict stale semantics. A recovery-window miss can resolve, reject, or request resync according to the business policy.

## REST double-write guard

The Draft API returns `409 collaborativeSessionActive` for shared REST mutations while the room has an active writer. After both collaborative clients leave, the same application can switch back to REST mode.

## Run

```bash
pnpm dev
```

- Server / REST / WebSocket: `http://127.0.0.1:4100`
- Alice: `http://127.0.0.1:5173/?client=alice`
- Bob: `http://127.0.0.1:5174/?client=bob`
- REST baseline: add `&collab=0`

See [acceptance evidence](../acceptance.md) for linked-patch frames, offline recovery, and transport switching.
