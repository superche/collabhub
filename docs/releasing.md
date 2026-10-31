# Release process

CollabHub 1.x is the stable structured-collaboration line. Every release must preserve the public API baseline or explicitly document a major-version compatibility break.

## CI and certification

Development goes through pull requests into `main`. Branch protection requires all six CI checks before merging, including for `superche`. CI covers builds, unit tests, React integration, E2E, local cluster recovery, deployment configuration, and the three container images.

The scheduled Live Demo workflow checks the running Render deployment separately. Remote cloud certification is run when deployment or recovery behavior changes; it requires an approved environment and is not an automatic prerequisite for every package release.

Useful local and environment checks:

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

CI and publication are separate workflows. Publication runs manually from `main` after the version and release notes have been merged. It does not query CI run IDs or trigger another CI workflow. The publication job performs its own build and smoke checks before publishing.

The `release-approval` environment allows only `main` and requires repository-owner approval. Every public package trusts `superche/collabhub`, workflow `publish-release.yml`, environment `release-approval`, and the `npm publish` action. No long-lived npm write token is used.

The release job uses a GitHub-hosted runner, Node.js 24, npm 11.16.0, `id-token: write`, and disabled package-manager caching. Run **Publish stable release**, enter the committed version explicitly, and use confirmation `PUBLISH_STABLE_RELEASE`. The prepare-only workflow also requires an explicit version. Certification images are built from `main`.

The workflow builds and inspects the tarballs, creates a GitHub draft release targeting the exact workflow commit, publishes them with native `npm publish` and provenance, and pushes amd64/arm64 GHCR images with SBOM. It publishes the draft only after those steps succeed. GitHub Actions concurrency serializes stable publications.

Version protection uses existing platform features:

- npm rejects attempts to overwrite a package name and version. No custom skip-existing or integrity-comparison publisher is used.
- `gh release create` rejects an existing release before npm or image publication begins. GitHub release immutability locks the tag and assets when the draft is published. This repository setting applies to future releases; it does not retroactively lock the existing `v1.0.0` release.
- GHCR tags such as `1` and `latest` intentionally move. Pin an image's `sha256` digest when a deployment needs fixed content; GitHub Release immutability does not lock container tags.

References: [npm publish](https://docs.npmjs.com/cli/commands/npm-publish/), [GitHub release immutability](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes), and [GHCR digests](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

For a local non-publishing audit of all ten tarballs:

```bash
pnpm pack:packages
```

For an unpublished version, also exercise native npm publication without uploading:

```bash
pnpm publish:dry-run
```

npm also rejects an already-published version during this dry-run. On the currently released `1.0.0`, that rejection is expected; use `pnpm pack:packages` for an artifact-only audit.

There is no atomic transaction across npm, GHCR, and GitHub Releases. A failure can leave some packages published or a draft retained. Inspect the failed run and use a new patch version; do not resume publishing changed content under an existing version.

## 1.0 approval evidence

The repository owner approved the 1.0 work on 2026-08-29. That release's Alibaba Cloud, backup/restore, restart, and fresh-registry evidence is recorded in the acceptance documents. This historical certification is separate from future CI and publication runs.
