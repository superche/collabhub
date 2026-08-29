# Reddit launch drafts

Do not publish both drafts on the same day. Read the live subreddit rules immediately before posting and choose the closest available flair.

## r/reactjs

Post only after contributing to ordinary React discussions. This community allows self-promotion but expects source code, a runnable demo, and a technical discussion rather than a link drop.

**Suggested title**

```text
I built an open-source collaboration SDK for existing React apps — feedback on the integration boundary?
```

**Body**

```text
I have been working on CollabHub, an open-source client/server collaboration layer for React apps that already have their own store, commands, REST API, and database.

The design goal is that components do not import the collaboration SDK. They keep reading from an AppRuntime and sending business commands. The composition root selects either the existing REST runtime or a collaborative runtime:

const runtime = collaborationEnabled
  ? createModelCollaboration({
      url,
      documentId,
      actorId: currentUser.id,
      getAuthToken,
      model: collabModel,
      initialState: collabModel.initialState(documentId),
    })
  : createRestRuntime()

Application-specific behavior lives in one model file: reducer-style commands, validation, linked field updates, and whether a stale command should run against the newest document or be rejected. The service runs those rules again before it accepts a change.

The repo includes runnable TODO List, BlockNote, React Flow, and Yjs-hybrid examples. The React Flow demo shows incremental node moves, drag coalescing, offline replay, and linked-edge deletion. Character-level text merging is intentionally left to Yjs rather than sending the same field through two systems.

Live demo: https://collabhub-demo.onrender.com/demo.html
Source: https://github.com/superche/collabhub
Integration guide: https://github.com/superche/collabhub/blob/main/docs/getting-started.md

I would appreciate feedback on the React-facing API in particular: does the runtime/model boundary fit how you organize an existing app, or does it still require too much collaboration-specific knowledge?
```

## r/selfhosted

Post only after checking that the current rules still allow a documented, released, self-hostable project.

**Suggested title**

```text
CollabHub 1.0 — a self-hosted collaboration service for existing React apps
```

**Body**

```text
CollabHub is an Apache-2.0 React SDK and server for adding structured multiplayer editing to an application that already has its own domain model and database.

It is not a hosted SaaS and does not require one cloud provider. The smallest installation is a single persistent container with a mounted data volume:

docker run -p 4100:4100 -v collabhub-data:/data \
  -e COLLABHUB_ALLOWED_ORIGINS=https://app.example.com \
  -e COLLABHUB_AUTH_TOKEN=replace-me \
  ghcr.io/superche/collabhub-standalone:1.0.0

The repository also includes PostgreSQL + Redis, existing-VM, AWS Lightsail, Alibaba Cloud, and Kubernetes paths. Authentication can use a backend-only shared secret or an existing JWKS provider. The host app still owns users, document permissions, and business data.

Features include versioned commands, incremental patches, idempotent retries, reconnect and pending replay, snapshots, room eviction, Origin restrictions, diagnostics, and graceful shutdown. The public Render instance is only a disposable demo; it is not presented as a durability or SLA reference.

Source and deployment docs: https://github.com/superche/collabhub
Live demo: https://collabhub-demo.onrender.com/demo.html
Known limitations: https://github.com/superche/collabhub/blob/main/docs/known-limitations.en.md

I would value an operator's view of the deployment defaults: what would you want changed before running this beside one of your own applications?
```

## Moderation-safe checklist

- Include the GitHub source and runnable demo in the post body.
- State that you are the maker.
- Disclose the Render demo's non-durable role.
- Do not post the same body to multiple subreddits.
- Do not ask for votes, awards, stars, or artificial engagement.
- If a post is removed, read the moderator reason before attempting a different community; do not repost unchanged.
