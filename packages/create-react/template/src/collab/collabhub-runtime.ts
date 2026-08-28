import { createModelCollaboration } from '@collabhub/client-core'
import type { AppRuntime, DocumentCommand, DocumentState } from '../application.js'
import { collabModel } from '../../collabhub.model.js'

export function createCollabRuntime(options: { actorId: string; documentId: string }): AppRuntime {
  const store = createModelCollaboration<DocumentState, DocumentCommand>({
    url: 'ws://127.0.0.1:4100/collab',
    tenantId: 'demo',
    documentId: options.documentId,
    actorId: options.actorId,
    clientId: `${options.actorId}-${crypto.randomUUID()}`,
    authToken: import.meta.env.VITE_COLLABHUB_AUTH_TOKEN,
    initialState: collabModel.initialState(options.documentId),
    model: collabModel,
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
