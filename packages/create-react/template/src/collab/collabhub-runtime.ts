import { CollaborationStore } from '@collabhub/client-core'
import { applyCanonicalPatches } from '@collabhub/domain-json'
import type { JsonObject } from '@collabhub/protocol'
import type { AppRuntime, DocumentCommand, DocumentState } from '../application.js'

type CanonicalDocument = JsonObject & DocumentState

export function createCollabRuntime(options: { actorId: string; documentId: string }): AppRuntime {
  const store = new CollaborationStore<CanonicalDocument, DocumentCommand>({
    url: 'ws://127.0.0.1:4100/collab',
    tenantId: 'demo',
    documentId: options.documentId,
    actorId: options.actorId,
    clientId: `${options.actorId}-${crypto.randomUUID()}`,
    schemaVersion: '1.0',
    initialState: { id: options.documentId, title: 'Shared document' },
    applyPatches: applyCanonicalPatches,
    adaptCommand: (command) => ({
      operation: {
        operationType: 'property.set',
        strategyId: 'json.property-lww',
        strategyVersion: '1.0',
        payload: { path: '/title', value: command.title },
      },
      optimisticPatches: [{ op: 'set', path: '/title', value: command.title }],
    }),
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
