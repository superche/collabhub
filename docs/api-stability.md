# API stability

CollabHub 1.x keeps the public TypeScript exports of the published `@collabhub/*` packages backward compatible. New optional fields and new exports may be added in a minor release. Removing an export, changing a required field, or changing wire meaning requires a major release.

The versioned wire envelope remains `protocolVersion: "0.1"` throughout CollabHub 1.x. A server must reject an unsupported protocol instead of guessing. Domain Pack schema changes use explicit migrations; an older client receives snapshot recovery when its schema can no longer be accepted.

`public-api-baseline.json` records the declaration hashes approved for 1.0. `pnpm release:check` rebuilds every package and fails when the declarations move without an explicit baseline review.

Compatibility covers public package exports. Files under `dist/` that are not exported by a package, example internals, scripts, diagnostics copy, and experimental fields explicitly documented as such are not stable APIs.
