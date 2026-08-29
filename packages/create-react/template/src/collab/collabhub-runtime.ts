import { createModelCollaboration } from '@collabhub/client-core'
import type { AppRuntime, DocumentCommand, DocumentState } from '../application.js'
import { collabModel } from '../../collabhub.model.js'

export function createCollabRuntime(options: { actorId: string; documentId: string }): AppRuntime {
  const tokenEndpoint = import.meta.env.VITE_COLLABHUB_TOKEN_ENDPOINT
  const store = createModelCollaboration<DocumentState, DocumentCommand>({
    url: import.meta.env.VITE_COLLABHUB_URL ?? 'ws://127.0.0.1:4100/collab',
    tenantId: 'demo',
    documentId: options.documentId,
    actorId: options.actorId,
    clientId: `${options.actorId}-${crypto.randomUUID()}`,
    getAuthToken: tokenEndpoint ? async () => {
      const response = await fetch(tokenEndpoint, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: 'demo', documentId: options.documentId, actorId: options.actorId }),
      })
      if (!response.ok) throw new Error(`CollabHub token request failed (${response.status})`)
      const body = await response.json() as { token?: unknown }
      if (typeof body.token !== 'string' || !body.token) throw new Error('CollabHub token response is missing token')
      return body.token
    } : undefined,
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
