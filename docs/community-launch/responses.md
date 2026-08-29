# Launch response bank

Keep replies conversational and adapt them to the exact question. Do not paste the same answer repeatedly.

## What is CollabHub?

It is an open-source React SDK and self-hosted service for adding structured multiplayer editing to an existing application. The app keeps its components, domain model, login, database, and optional REST implementation.

## How is this different from Yjs?

Yjs is a strong fit for character-level text and local-first CRDT state. CollabHub is aimed at structured business data where the application already has commands, validation, permissions, workflow, and a database. A hybrid app can use Yjs for the document body and CollabHub for metadata and workflow, with one owner per field.

## Is conflict resolution LWW?

For two accepted updates to the same property, the default rebase behavior produces a last-accepted result in service order. That is not the only policy: an application can re-run a late command against the latest document, reject it, or request a reload. Domain rules can also turn one command into several linked updates.

## Where do custom business rules go?

In the application-owned `collabhub.model.ts` file. Its reducer handles commands, validation checks the resulting document, and the stale policy decides what to do with late commands. React components keep using the app's normal runtime interface.

## Does it replace my database?

No. The host application still owns its business data. For existing records, implement the storage adapter and define when a document is in a collaboration session. REST must not remain a second writer for the same document while that session is active.

## How does authentication work?

The existing backend issues a short-lived token for the current user and document. The SDK asks for a fresh token on connection and reconnect. The service can verify a backend-only shared secret or a JWKS endpoint from the application's identity provider.

## What happens offline?

The client queues bounded pending commands, reconnects, and replays them with stable operation IDs. The service deduplicates retries. If the client's history is too old, it recovers from a snapshot and resumes from the current document version.

## Does presence enter the operation log?

No. Presence is an ephemeral channel. Durable edits use versioned operations and incremental patches; presence is not written into the WAL or snapshots.

## Can I deploy it on one VM?

Yes. Standalone Docker is the evaluation and small single-node path. A persistent single-VM stack is documented for existing VMs and AWS Lightsail; PostgreSQL + Redis and Kubernetes cover multi-node deployments. The public Render instance is only a demo.

## Is v1.0 production ready?

The structured-data APIs are stable and the repository includes authentication, Origin checks, persistence, retries, recovery, rate limits, graceful drain, metrics, deployment templates, and acceptance evidence. It is still self-hosted software rather than a managed SLA. Teams must operate backups, secrets, monitoring, capacity, and their own authorization policy.

## How much code changes in the React app?

The intended path adds one shared model file and one runtime selection at the composition root. Components continue reading snapshots and sending business commands. The exact migration cost depends on whether the existing app already has a clean store/command boundary.

## Why a central service instead of P2P?

Business applications often need one ordered result, server-side validation, permissions, auditability, and a database integration point. A central service makes those responsibilities explicit and keeps clients from independently deciding the canonical result.

## What feedback is most useful?

Try the five-minute guide against a real React app and report the first place where the model, authentication, storage, or deployment boundary is unclear. Include the app's state-management approach and the smallest reproducible command if possible.
