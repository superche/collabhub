# React Flow integration

React Flow is a controlled renderer. The host keeps a renderer-independent `GraphDocument`, business commands, and canonical rules.

```text
React Flow callbacks
  -> GraphCommand adapter
  -> node.* | edge.* intent
  -> CollabHub client
  -> GraphDocument Domain Pack
  -> canonical entity patches
  -> React Flow projection
```

## Dependency boundary

- `src/components` depends on React Flow and the application runtime.
- `src/domain` defines nodes, edges, and commands without React Flow or CollabHub.
- `src/collab` converts renderer events to incremental intents.
- The server Domain Pack owns graph invariants and linked deletion.

Import-boundary tests enforce these rules.

## Incremental behavior

Drag frames stay local. Pointer-up submits one `node.move`; rename, add, connect, and delete use small operation payloads instead of the full graph. Deleting one node produces canonical patches for the node and every linked edge under one version.

## Recovery and sharing

The `/room` Demo creates a `?document=graph-<UUID>` room id. Sharing the complete URL joins another client to the same graph. Pending operations replay after snapshot recovery with their original operation id and base version.

## Run

```bash
pnpm dev:react-flow
```

- Server: `http://127.0.0.1:4300`
- Alice: `http://127.0.0.1:5193/room?client=alice`
- Bob: `http://127.0.0.1:5194/room?client=bob`
- Public workspace: `https://collabhub-demo.onrender.com/room`

See [acceptance evidence](../acceptance.md) for drag coalescing, shared-room, offline replay, and linked-edge deletion assertions.
