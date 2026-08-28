# BlockNote integration

BlockNote remains the editor. CollabHub provides server ordering, canonical state, incremental recovery, and broadcast without enabling BlockNote's Yjs provider.

```text
BlockNote onChange
  -> change adapter
  -> block.insert | block.update | block.delete | block.move
  -> CollabHub client
  -> BlockDocument Domain Pack
  -> canonical block patches
  -> BlockNote projection
```

## Dependency boundary

- `src/components` depends on React, BlockNote, and the application runtime.
- `src/domain` defines `BlockDocument` without BlockNote or CollabHub.
- `src/collab` owns BlockNote change conversion and CollabHub transport.
- The server Domain Pack depends on the canonical block domain, not BlockNote rendering types.

Import-boundary tests enforce these rules.

## Incremental behavior

Text changes submit one `block.update` for one top-level block. Insert, delete, and reorder use dedicated operations; the hot path never sends the complete document. Continuous input is coalesced before submission, and remote projection suppresses echo updates.

## Recovery

An offline client keeps pending block intents in page memory. On reconnect it receives a canonical snapshot, preserves the original operation id and base version, and replays the intent. Refreshing the page does not preserve pending intents in v0.1.

## Conflict boundary

Concurrent edits to the same top-level block use LWW. This example is not character-level CRDT/Yjs merge and does not provide shared undo/redo or collaborative cursors.

## Run

```bash
pnpm dev:blocknote
```

- Server: `http://127.0.0.1:4200`
- Alice: `http://127.0.0.1:5183/?client=alice`
- Bob: `http://127.0.0.1:5184/?client=bob`

See [acceptance evidence](../acceptance.md) for the two-browser trace and payload assertions.
