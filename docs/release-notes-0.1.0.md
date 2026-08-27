# CollabHub 0.1.0 technical preview

Server-authoritative collaboration for structured React applications while the host keeps its domain model and components.

## Included

- Protocol, Client Core, Server Core, Strategy SDK, JSON Domain Pack, Testkit
- minimal standalone WebSocket server and `npm create @collabhub/react` starter
- property LWW, entity lifecycle, list ordering, strict stale rejection, and custom version policy
- idempotency, reconnect, snapshot/WAL recovery, ephemeral presence, diagnostics
- PostgreSQL/Redis horizontal-scaling reference runtime
- TODO List, BlockNote, and React Flow integrations

## Status

This is a technical preview, not a production SLO. Read the [integration readiness checklist](https://github.com/superche/collabhub/blob/v0.1.0/docs/integration/readiness.en.md) and [known limitations](https://github.com/superche/collabhub/blob/v0.1.0/docs/known-limitations.en.md) before adoption. `v1.0.0` requires separate repository-owner approval.
