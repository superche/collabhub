# Contributing

## Setup

Requires Node.js 22+, pnpm 10+, Docker 24+, and Chromium for browser acceptance.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
```

For distributed changes, also run:

```bash
pnpm smoke:todo-cluster
pnpm smoke:distributed
```

## Architecture boundaries

- `protocol`, `client-core`, and `server-core` must not expose a concrete room runtime.
- Example components and domains must not import `@collabhub/*`.
- Collaboration dependencies belong in `src/collab`, the composition root, and the server Domain Pack.
- Presence stays ephemeral; ordinary edits stay incremental.
- REST mutations must not bypass an active collaborative writer.

Add conformance tests for new strategies and real two-client acceptance for new integration behavior. Keep commits focused and explain protocol compatibility in the pull request.

## Release changes

Do not change versions, create tags, publish packages, or create GitHub Releases in an ordinary pull request. Follow [the release process](docs/releasing.md); `v1.0.0` requires explicit maintainer approval.
