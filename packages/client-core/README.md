# @collabhub/client-core

React-facing collaboration SDK and framework-neutral external store. `createCollaboration` plus `json.*` is the default existing-app entry; it manages optimistic pending operations, reconnect, replay, resync, presence, diagnostics, and backpressure without owning the application domain model.

```ts
import { createCollaboration, json } from '@collabhub/client-core'

const collaboration = createCollaboration({
  url, documentId, actorId, initialState,
  command: (command) => json.set('/title', command.title),
})
```

See the [React quick start](https://github.com/superche/collabhub/blob/main/docs/getting-started.md).
