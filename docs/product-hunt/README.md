# Product Hunt launch kit

This directory contains the listing copy, launch assets, and launch-day checklist for CollabHub `v1.0.0`. CollabHub is free, open source, and Apache-2.0 licensed. There is no pricing page or paid plan.

## Listing

| Field | Copy |
|---|---|
| Name | CollabHub |
| Tagline | Add multiplayer collaboration to any React app |
| URL | https://collabhub-demo.onrender.com/ |
| Status | Free and open source · stable structured-collaboration APIs |
| Topics | Open Source · Developer Tools · Collaboration |

**Description**

CollabHub adds real-time multiplayer to an existing React app without moving your data model into a collaboration library. Keep your components, store, commands, and REST fallback. Add one client integration boundary and deploy one open-source service. Includes reconnect and recovery, linked updates, custom conflict rules, diagnostics, Docker, Kubernetes, AWS, and Alibaba Cloud baselines.

**Maker comment**

Hi Product Hunt — I built CollabHub after seeing the same trade-off in React projects: teams wanted multiplayer features, but adopting them often meant reshaping the app around a collaboration library.

CollabHub takes a smaller-integration approach. Your components and business data stay yours. You add a client boundary for commands and deploy an open-source service that orders changes, runs your rules, and sends small updates back to connected clients. The repo includes TODO List, BlockNote, and React Flow examples, plus a real two-client demo with offline recovery.

`v1.0.0` stabilizes the structured-data integration path. It is not a character-level editor engine or a managed-service SLA. I would especially value feedback on the existing-project setup: where does the first integration still feel harder than it should?

## Upload assets

| Product Hunt slot | File | Size |
|---|---|---|
| Thumbnail | [`assets/collabhub-thumbnail-240.png`](assets/collabhub-thumbnail-240.png) | 240 × 240 |
| Gallery 1 | [`assets/gallery-01-hero.png`](assets/gallery-01-hero.png) | 1270 × 760 |
| Gallery 2 | [`assets/gallery-02-live-demo.png`](assets/gallery-02-live-demo.png) | 1270 × 760 |
| Gallery 3 | [`assets/gallery-03-integration.png`](assets/gallery-03-integration.png) | 1270 × 760 |
| Video master | [`assets/collabhub-product-hunt.mp4`](assets/collabhub-product-hunt.mp4) | 1920 × 1080 · 30 s |

Product Hunt accepts a YouTube link for the video rather than a direct MP4 upload. Upload the current master as an unlisted video, then paste that URL into the launch draft.

## Launch-day checklist

- [ ] Use a personal Product Hunt account that has been active for at least one week.
- [ ] Create the launch draft with the exact copy and assets above.
- [ ] Upload the current video master to YouTube and add its URL to the draft.
- [ ] Confirm the live landing page, two-client demo, GitHub repository, npm packages, and docs from a signed-out browser.
- [ ] Run `pnpm smoke:live-demo` after the Render deployment is live.
- [ ] Schedule for 12:01 a.m. Pacific unless a different audience window is intentional.
- [ ] Be available to answer every substantive comment and turn reports into issues.
- [ ] Share the launch to ask for feedback. Do not ask for upvotes or coordinate voting.
- [ ] Track demo opens, starter completions, GitHub visits, npm downloads, issues, and integration-guide drop-off.

## Honest launch boundaries

- The hosted Render service is a public demo, not a production SLA.
- `v1.0.0` stabilizes structured collaboration; character-level rich-text merge remains an explicit Yjs integration choice.
- Multi-region active-active, end-user authentication UI, and a managed hosted control plane are not included.
- External testimonials must come from real users. Use [`beta-feedback.md`](beta-feedback.md); do not invent quotes or usage numbers.

Product Hunt references: [prepare your launch](https://www.producthunt.com/launch/preparing-for-launch), [before launch](https://www.producthunt.com/launch/before-launch), and [sharing your launch](https://www.producthunt.com/launch/sharing-your-launch).

## Rebuild the video

```bash
# Terminal 1: record the latest two-client React Flow proof.
pnpm dev:react-flow

# Terminal 2: refresh README footage and Product Hunt stills.
pnpm record:react-flow
cp docs/assets/collabhub-react-flow-smoke.mp4 \
  docs/product-hunt/launch-video/collabhub-react-flow-smoke-render.mp4
pnpm capture:product-hunt

cd docs/product-hunt/launch-video
npm ci
npm run check
npm run render:release
```

The composition source, fonts, prompt, and actual React Flow smoke footage are kept in `launch-video/` so the result is reproducible.
