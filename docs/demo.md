# Free React Flow demo

The public demo runs two React Flow clients side by side against one server-authoritative graph. Node edits, drag commits, offline replay, and linked-edge deletion use the repository's real Client Core, WebSocket, and Domain Pack paths.

## Deploy on Render Free

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/superche/collabhub)

The root `render.yaml` builds `deploy/docker/demo.Dockerfile`. One container serves the React Flow build and WebSocket endpoint.

Public deployment:

```text
https://collabhub-demo.onrender.com/demo.html
```

The root URL creates a random `?document=graph-<UUID>` on first load. Copy that complete URL to share the same room with another browser.

Blueprint dashboard: `exs-da83itn10e5c73eaagp0`; Web Service: `srv-da83vqs9v7es739jcn50`. The service tracks `main`.

Room lifecycle defaults:

| Setting | Default | Behavior |
|---|---:|---|
| `COLLABHUB_DEMO_ROOM_IDLE_TTL_MS` | `1800000` | Start after the last WebSocket disconnect; active rooms are never evicted |
| `COLLABHUB_DEMO_MAX_WARM_ROOMS` | `500` | Evict the least-recently-used inactive room when full |
| `COLLABHUB_DEMO_ROOM_SCAN_INTERVAL_MS` | `60000` | Scan once per minute |

Public-edge defaults:

| Setting | Default | Behavior |
|---|---:|---|
| `COLLABHUB_DEMO_MAX_CONNECTIONS` | `250` | Close excess WebSocket connections |
| `COLLABHUB_DEMO_MAX_CONNECTIONS_PER_IP` | `8` | Bound one source address |
| `COLLABHUB_DEMO_MAX_ACTIVE_ROOMS` | `500` | Reject new active rooms at capacity |
| `COLLABHUB_DEMO_MESSAGE_RATE_PER_SECOND` / `COLLABHUB_DEMO_MESSAGE_BURST` | `30` / `60` | Per-connection token bucket |
| `COLLABHUB_DEMO_TRUST_PROXY_HEADERS` | `true` on Render | Use the platform-sanitized source IP |
| `COLLABHUB_DEMO_ALLOWED_ORIGINS` | Render demo origin | Reject cross-origin WebSocket use |

Eviction first persists a snapshot, releases the in-process session, then deletes the demo snapshot and WAL. Reopening an expired URL creates the initial graph. This delete policy is demo-only; the distributed runtime retains authoritative PostgreSQL data when it evicts a warm room.

Render Free currently provides 750 instance hours per workspace each month. A service sleeps after 15 minutes without inbound HTTP or WebSocket traffic; the next connection can take about one minute to wake it. All graph state is in memory and resets after process restart or deploy. See [Render's official free-service limits](https://render.com/docs/free).

This topology is for public evaluation only. Production deployments should use the PostgreSQL/Redis distributed runtime, authentication, tenant isolation, and managed persistence.

## Local production-bundle acceptance

```bash
pnpm smoke:demo
```

The smoke builds the same static assets and bundled Node server, rejects an invalid Origin and an over-limit third connection, opens `/demo.html` in Chromium, verifies the GitHub Star link, then edits through Alice and Bob and checks canonical convergence.
