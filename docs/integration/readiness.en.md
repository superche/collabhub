# Integration readiness

Do not call an application directly compatible unless every condition holds.

| Condition | Host commitment |
|---|---|
| Stable identity | Tenant/document IDs are never reused |
| One write authority | Every shared mutation enters the collaboration mutation gateway while a room is active |
| Operation-shaped domain | UI actions map to versioned operations |
| Stable entity IDs | IDs do not depend on ordering and may be client-generated |
| Versioned schema | Snapshots and operations declare compatible schema versions |
| Canonical projection | The store handles accept, reject, and resync |
| Idempotent retries | Client and operation IDs remain stable |
| Bounded working set | Payload, pending queue, history window, and room memory have limits |
| Network recovery | WebSocket reconnect and snapshot recovery are available |

Production also requires trusted authentication, document authorization, tenant isolation, rate limits, backups, audit, and a measured capacity model. CollabHub cannot prevent another host endpoint from writing the same database; the host must route REST/HTTP mutations through the same authority or reject them.
