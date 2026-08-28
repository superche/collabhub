# CollabHub 0.1.2 technical preview

This patch makes the WebSocket edge safer and the existing-React-app setup easier to follow.

- `@collabhub/server-ws` now rejects untrusted Origins before completing the WebSocket upgrade.
- The public live smoke verifies the HTTP 403 response and exits cleanly in hosted CI.
- The English and Chinese READMEs now show the three-file integration path in plain language and point to the exact files for custom rules, access checks, and storage.
- `createCollaboration` now accepts ordinary application interfaces and entity objects without requiring a `JsonObject` intersection.

All nine npm packages, the distributed image, and the standalone image are built from the same commit. This remains a technical preview for structured React state. Read the [integration checklist](https://github.com/superche/collabhub/blob/v0.1.2/docs/integration/readiness.en.md) and [known limitations](https://github.com/superche/collabhub/blob/v0.1.2/docs/known-limitations.en.md) before production use. `v1.0.0` still requires repository-owner approval.
