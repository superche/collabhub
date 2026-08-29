# AI Coding guide

Use this page when asking an AI coding agent to add CollabHub to an existing React repository.

## Goal

Keep the application's components, state types, commands, and REST implementation. Add collaboration beside them, then choose REST or CollabHub at the composition root.

## Safe agent workflow

1. Run `npx @collabhub/create-react@1.0.0 init .`.
2. Run `npm install` and `npm run collabhub:doctor`.
3. Read the app's document type and command union.
4. Replace the sample types and reducer in `collabhub.model.ts` with those types and commands.
5. Put linked field updates and validation in that file.
6. Wrap the generated store in the app's existing runtime/store interface.
7. Choose CollabHub or REST only at the composition root. Do not import CollabHub from UI components.
8. Start the generated server and run `npm run collabhub:verify`.
9. Add an Alice/Bob browser test for a real user command, reconnect, and linked updates.
10. Before production, add authentication, durable storage, allowed Origins, metrics, and double-write protection.

## Prompt for an agent

```text
Add CollabHub v1.0 to this existing React app with minimal intrusion.

Preserve the current document types, commands, components, and REST runtime. Run the CollabHub init and doctor commands. Adapt the generated collabhub.model.ts to the existing command union. Put linked updates, validation, and stale-command choices in that one file. Connect the CollabHub runtime only at the app composition root, keeping REST as a feature-flag fallback. Components must not import @collabhub packages.

Use the existing server repository through a StorageAdapter. While a document has an active collaboration session, prevent its REST PUT/PATCH path from writing it. Add a real two-client test that proves one normal command, one linked update, offline recovery, and no pending operations after recovery. Report changed files, commands, and evidence.
```

## Rules file

`collabhub.model.ts` is the application's collaboration contract:

- `initialState`: empty/new document shape; existing records should come from server storage.
- `reduce`: how each existing business command changes the document.
- `validate`: application checks that must also run on the server.
- `stale`: whether a late command runs on current data (`rebase`), fails (`reject`), or reloads (`resync`).

The browser runs `reduce` for instant UI feedback. The service runs it again on the latest stored state and broadcasts only the changed fields.

## Do not do this

- Do not move application state ownership into React components.
- Do not send a full document for normal typing, dragging, or toggling.
- Do not trust client-computed linked values without server recomputation.
- Do not let REST and CollabHub write the same document concurrently.
- Do not use the built-in JSON rules for character-level rich-text merging; use Yjs for that field instead.

## Acceptance

- `npm run collabhub:doctor` passes.
- `npm run collabhub:verify` passes against the deployed service.
- Alice's command appears on Bob without refresh and linked fields arrive together.
- An offline command survives refresh and is submitted once after reconnect.
- Components contain no `@collabhub/*` imports.
- Production uses WSS, authentication, durable storage, and Origin limits.
