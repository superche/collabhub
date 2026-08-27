# Free public demo

The public TODO demo runs two React clients side by side against one server-authoritative room. It uses the same REST, WebSocket, Domain Pack, and Client Core paths as the repository example.

## Deploy on Render Free

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/superche/collabhub)

The root `render.yaml` builds `deploy/demo.Dockerfile`. One container serves the static React build, REST API, and WebSocket endpoint.

After deployment, open:

```text
https://<your-service>.onrender.com/demo.html
```

Render Free currently provides 750 instance hours per workspace each month. A service sleeps after 15 minutes without inbound HTTP or WebSocket traffic; the next connection can take about one minute to wake it. The filesystem is ephemeral, so demo documents can reset after restart or deploy. See [Render's official free-service limits](https://render.com/docs/free).

This topology is for public evaluation only. Production deployments should use the PostgreSQL/Redis distributed runtime, authentication, tenant isolation, and managed persistence.

## Local production-bundle acceptance

```bash
pnpm smoke:demo
```

The smoke builds the same static assets and bundled Node server, opens `/demo.html` in Chromium, edits through Alice, verifies Bob convergence and linked progress, then cleans up.
