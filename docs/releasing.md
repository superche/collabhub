# Release process

CollabHub 1.x is the stable structured-collaboration line. Every release must preserve the public API baseline or explicitly document a major-version compatibility break.

## Required gates

```bash
pnpm release:check
pnpm smoke:fresh-react
pnpm test:e2e
pnpm smoke:demo
pnpm smoke:live-demo
pnpm smoke:todo-cluster
pnpm smoke:postgres-hardening
pnpm smoke:remote-react-flow # requires an approved remote certification environment
```

CI also builds distributed, standalone, and demo Dockerfiles. Package audit verifies compiled ESM, declarations, metadata, rewritten workspace dependencies, and exclusion of package source/tests. The fresh-project smoke generates an app outside the repository, installs only the two top-level integration packages, builds it, and verifies two Chromium clients. The scheduled live smoke verifies the deployed Origin allowlist.

## Prepare-only workflow

Run **Prepare release artifacts** with the committed version and confirmation `PREPARE_ONLY`. It uploads inspected npm tarballs but cannot publish them, create a tag, or create a Release.

## Stable publication

Configure the GitHub `release-approval` environment with the repository owner as required reviewer. Every public package trusts `superche/collabhub`, workflow `publish-release.yml`, environment `release-approval`, and the `npm publish` action. No long-lived npm write token is used.

The release job uses a GitHub-hosted runner, Node.js 24, npm 11.16.0, `id-token: write`, and disabled package-manager caching. Run **Publish stable release** with confirmation `PUBLISH_STABLE_RELEASE`.

The workflow reruns every release gate, publishes packages in dependency order through npm Trusted Publishing with automatic provenance, pushes amd64/arm64 distributed and standalone GHCR images with SBOM, creates an immutable annotated tag, and attaches tarballs to a GitHub Release. It can resume a partial npm publication: an already-existing exact version is verified and skipped.

For a local non-publishing audit:

```bash
pnpm publish:dry-run
```

Never reuse or overwrite a published version. Follow a failed release with a new patch version.

## 1.0 approval evidence

The repository owner approved the 1.0 work on 2026-08-29. The exact release commit must still pass the local, CI, remote Alibaba Cloud, backup/restore, restart, and fresh-registry gates before publication.
