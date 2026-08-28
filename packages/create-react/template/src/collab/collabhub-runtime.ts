import { createCollaboration, json } from '@collabhub/client-core'
import type { AppRuntime, DocumentCommand, DocumentState } from '../application.js'

export function createCollabRuntime(options: { actorId: string; documentId: string }): AppRuntime {
  const store = createCollaboration<DocumentState, DocumentCommand>({
    url: 'ws://127.0.0.1:4100/collab',
    tenantId: 'demo',
    documentId: options.documentId,
    actorId: options.actorId,
    clientId: `${options.actorId}-${crypto.randomUUID()}`,
    initialState: { id: options.documentId, title: 'Shared document' },
    command: (command) => json.set('/title', command.title),
  })

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    getDiagnostics: () => store.diagnostics,
    subscribeDiagnostics: (listener) => store.subscribeDiagnostics(listener),
    execute: (command) => store.execute(command),
    close: () => store.close(),
  }
}
