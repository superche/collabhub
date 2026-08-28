# CollabHub 0.1.1 technical preview

This release makes the existing-React-app path the primary product surface.

- React applications install one SDK entry package: `@collabhub/client-core`.
- `createCollaboration` and `json.*` hide protocol and strategy plumbing.
- `@collabhub/server-ws` now includes a secure standalone CLI, file-backed recovery, and a deployable Docker image.
- The starter depends on two CollabHub packages instead of five.
- Public Demo origin controls and live post-deploy verification are part of the release gate.
- TODO List, BlockNote, and React Flow remain the reference integration cases.

This remains a technical preview for structured React state, not a production SLO or character-level CRDT platform. Read the [integration readiness checklist](https://github.com/superche/collabhub/blob/v0.1.1/docs/integration/readiness.en.md) and [known limitations](https://github.com/superche/collabhub/blob/v0.1.1/docs/known-limitations.en.md) before adoption. `v1.0.0` still requires repository-owner approval.
