import type { GraphApplicationRuntime } from '../application/runtime.js'
import { CollabHubGraphTransport } from '../collab/collabhub-graph-transport.js'
import { ReactFlowCollaborationRuntime } from '../collab/react-flow-collaboration-runtime.js'

export function createGraphApplication(): GraphApplicationRuntime {
  const query = new URLSearchParams(location.search)
  const actorId = query.get('client') ?? crypto.randomUUID().slice(0, 8)
  const documentId = query.get('document') ?? 'react-flow-demo'
  const clientId = `${actorId}-${crypto.randomUUID().slice(0, 6)}`
  return new ReactFlowCollaborationRuntime(
    actorId,
    new CollabHubGraphTransport('ws://127.0.0.1:4300/collab', documentId, actorId, clientId),
  )
}
