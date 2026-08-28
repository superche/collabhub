# @collabhub/server-ws

Standalone authoritative service for existing React applications. The bundled `collabhub-server` CLI provides origin controls, connection limits, file-backed WAL/snapshots, room lifecycle, and health checks. `startJsonCollaborationServer` covers built-in JSON collaboration; advanced applications can still provide a Domain Pack and storage.

```bash
COLLABHUB_ALLOWED_ORIGINS=http://localhost:5173 \
COLLABHUB_ALLOW_INSECURE_DEVELOPMENT_IDENTITY=true \
collabhub-server
```

See the [React quick start](https://github.com/superche/collabhub/blob/main/docs/getting-started.md).
