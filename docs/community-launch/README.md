# CollabHub v1.0 community launch kit

Use this kit for the technical-community launch on Monday, August 31, 2026. Each community gets its own angle; do not paste one announcement everywhere.

## Launch position

**One sentence**

CollabHub adds multiplayer to an existing React app without replacing its components, store, commands, login, or database.

**What is stable in v1.0**

- Structured collaboration for forms, lists, workflow data, and graph-style editors.
- One application-owned model file for commands, validation, linked updates, and stale-command behavior.
- React client SDK plus a self-hosted service.
- Reconnect, pending replay, snapshots, idempotency, diagnostics, and REST fallback.
- Standalone Docker for evaluation and PostgreSQL + Redis for persistent or multi-node deployments.

**Say the limits clearly**

- CollabHub is not a character-level text CRDT or OT engine. Use Yjs for a rich-text body that needs concurrent character merging.
- The public Render instance is a demo, not a managed-service SLA or durability reference.
- Authentication UI and application permissions stay in the host application.
- Multi-region active-active is not included in v1.0.

## Canonical links

| Destination | URL |
|---|---|
| Landing page | https://collabhub-demo.onrender.com/ |
| Live React Flow demo | https://collabhub-demo.onrender.com/demo.html |
| GitHub | https://github.com/superche/collabhub |
| Five-minute guide | https://github.com/superche/collabhub/blob/main/docs/getting-started.md |
| AI Coding guide | https://github.com/superche/collabhub/blob/main/docs/ai-coding-guide.md |
| Deploy guide | https://github.com/superche/collabhub/blob/main/deploy/README.md |
| Known limitations | https://github.com/superche/collabhub/blob/main/docs/known-limitations.en.md |
| npm client | https://www.npmjs.com/package/@collabhub/client-core |
| Integration feedback | https://github.com/superche/collabhub/issues/new?template=integration-feedback.yml |

## Reusable assets

| Use | File |
|---|---|
| 30-second demo | [`../product-hunt/assets/collabhub-product-hunt.mp4`](../product-hunt/assets/collabhub-product-hunt.mp4) |
| Product hero | [`../product-hunt/assets/gallery-01-hero.png`](../product-hunt/assets/gallery-01-hero.png) |
| Live demo proof | [`../product-hunt/assets/gallery-02-live-demo.png`](../product-hunt/assets/gallery-02-live-demo.png) |
| Integration code | [`../product-hunt/assets/gallery-03-integration.png`](../product-hunt/assets/gallery-03-integration.png) |
| Square thumbnail | [`../product-hunt/assets/collabhub-thumbnail-240.png`](../product-hunt/assets/collabhub-thumbnail-240.png) |

## Publishing order — Beijing time

| Time | Channel | Material |
|---|---|---|
| 09:00 | Release check | Run the live smoke and verify every canonical link signed out |
| 09:30 | V2EX / 分享创造 | [`v2ex.md`](v2ex.md) |
| 15:00 | DEV Community | [`dev-community.md`](dev-community.md) |
| 20:30 | Hacker News / Show HN | [`hacker-news.md`](hacker-news.md) |
| Tuesday or later | Reddit | [`reddit.md`](reddit.md) |
| After each primary post | Personal social accounts | [`social.md`](social.md) |

Do not coordinate votes or ask people to upvote. Ask them to try the integration, inspect the source, and tell you what remains confusing.

## Before publishing

- [ ] Freeze feature work; only fix a reproducible P0.
- [ ] Confirm the latest public deployment identifies the v1.0 behavior.
- [ ] Run `pnpm smoke:live-demo`.
- [ ] Open the landing page, demo, GitHub, npm, and guides in a signed-out browser.
- [ ] Record GitHub stars, visitors, clones, npm downloads, open issues, and Render request volume.
- [ ] Read each platform draft aloud and remove language that does not sound like the maker.
- [ ] For V2EX, write the final prose personally; its rules prohibit AI-generated posts.
- [ ] Keep [`responses.md`](responses.md) open while replying.

## Success criteria

The primary launch goal is integration evidence, not impressions:

- Three independent developers start CollabHub locally.
- One developer attempts to add it to an existing React app.
- Five concrete integration questions or problems are recorded.
- Every reproducible problem becomes a GitHub issue.

Capture the same metrics again after 24 hours and 72 hours. Summarize what developers tried, where they stopped, and which documentation or API changes would remove that friction.
