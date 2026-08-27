# Free React Flow demo

The public demo runs two React Flow clients side by side against one server-authoritative graph. Node edits, drag commits, offline replay, and linked-edge deletion use the repository's real Client Core, WebSocket, and Domain Pack paths.

## Deploy on Render Free

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/superche/collabhub)

The root `render.yaml` builds `deploy/demo.Dockerfile`. One container serves the React Flow build and WebSocket endpoint.

Public deployment:

```text
https://collabhub-demo.onrender.com/demo.html
```

Blueprint dashboard: `exs-da83itn10e5c73eaagp0`; Web Service: `srv-da83vqs9v7es739jcn50`. The service tracks `main`.

Render Free currently provides 750 instance hours per workspace each month. A service sleeps after 15 minutes without inbound HTTP or WebSocket traffic; the next connection can take about one minute to wake it. Graph state is in memory and resets after restart or deploy. See [Render's official free-service limits](https://render.com/docs/free).

This topology is for public evaluation only. Production deployments should use the PostgreSQL/Redis distributed runtime, authentication, tenant isolation, and managed persistence.

## Local production-bundle acceptance

```bash
pnpm smoke:demo
```

The smoke builds the same static assets and bundled Node server, opens `/demo.html` in Chromium, verifies the GitHub Star link, then edits through Alice and Bob and checks canonical convergence.
