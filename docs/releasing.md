# Release process

CollabHub remains at `0.1.0` while release infrastructure is validated. Preparing artifacts does not authorize a public release.

## Required gates

```bash
pnpm release:check
pnpm test:e2e
pnpm smoke:demo
pnpm smoke:todo-cluster
```

CI must also build the distributed and demo Dockerfiles. The package audit verifies compiled ESM, declarations, package metadata, rewritten workspace dependencies, and exclusion of source/tests.

## Prepare-only workflow

Run **Prepare release artifacts** with the version already committed to every manifest and confirmation `PREPARE_ONLY`. The workflow uploads npm tarballs for inspection. It cannot create a tag, GitHub Release, npm publication, or container publication.

Before using this workflow for a public release, configure the GitHub `release-approval` environment with the repository owner as a required reviewer. The workflow is intentionally useful without that setting for `0.1.0` process validation, but the protected environment is mandatory before any `v1.0.0` release workflow is introduced.

## Approval boundary for 1.0

`v1.0.0` requires explicit approval from the repository owner after all gates pass. Only after approval:

1. update every package and root version together;
2. finalize the changelog and compatibility statement;
3. rerun all gates on the exact commit;
4. create the signed `v1.0.0` tag and GitHub Release;
5. publish npm packages with provenance and immutable versioning;
6. publish multi-architecture container images;
7. verify a fresh external React installation against the public registry.

Never reuse or overwrite a published version. A failed release is followed by a new patch version.
