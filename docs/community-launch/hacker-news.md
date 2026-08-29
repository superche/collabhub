# Hacker News — Show HN

## Submission

**Title**

```text
Show HN: CollabHub – add multiplayer to an existing React app
```

**URL**

```text
https://collabhub-demo.onrender.com/
```

Submit it as a link. Post the comment below immediately after the submission becomes visible.

## First comment

```text
Hi HN — I built CollabHub because adding multiplayer to an existing React app often starts with a much larger rewrite than the feature seems to justify.

The project assumes the app already has components, a store, business commands, login, REST endpoints, and a database. Those remain application-owned. You add one model file that describes commands, validation, linked updates, and stale-command behavior; a client boundary sends those commands to a self-hosted service. The service runs the same rules, orders accepted changes, and sends incremental patches back to connected clients. Components do not import CollabHub, and the composition root can still select the original REST implementation.

The repo includes a scaffold command, standalone Docker image, PostgreSQL + Redis deployment, and runnable TODO List, BlockNote, React Flow, and Yjs-hybrid examples. The live demo needs no signup: copy its room URL into another tab to try two-client editing, drag coalescing, and offline replay.

This is deliberately for structured application data, not character-level rich-text merging. If a document body needs concurrent character edits, the intended design is Yjs for that field and CollabHub for titles, workflow, permissions, and other business data.

I would especially value feedback from people who have added collaboration to an existing product: does the one-model-file boundary fit how your React app is already organized, and what would still stop you from self-hosting it?

Source: https://github.com/superche/collabhub
Getting started: https://github.com/superche/collabhub/blob/main/docs/getting-started.md
```

## Final checks

- The title starts with `Show HN:` and contains no version number or marketing adjectives.
- The submitted URL opens something people can try without an account.
- The maker remains available to answer technical questions for several hours.
- Do not ask friends to vote or leave coordinated comments.
- If the Render service is waking up, wait until the demo is responsive before submitting.
