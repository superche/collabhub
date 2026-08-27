import type { GraphApplicationRuntime } from '../application/runtime.js'
import { CollabHubGraphTransport } from '../collab/collabhub-graph-transport.js'
import { ReactFlowCollaborationRuntime } from '../collab/react-flow-collaboration-runtime.js'

export function createGraphApplication(): GraphApplicationRuntime {
  const query = new URLSearchParams(location.search)
  const actorId = query.get('client') ?? crypto.randomUUID().slice(0, 8)
  const documentId = query.get('document') ?? 'react-flow-demo'
  const clientId = `${actorId}-${crypto.randomUUID().slice(0, 6)}`
  document.documentElement.classList.toggle('embedded-demo', query.get('embedded') === '1')
  const defaultWebSocketUrl = import.meta.env.DEV
    ? `ws://${location.hostname}:4300/collab`
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/collab`
  return new ReactFlowCollaborationRuntime(
    actorId,
    new CollabHubGraphTransport(import.meta.env.VITE_COLLABHUB_WS_URL ?? defaultWebSocketUrl, documentId, actorId, clientId),
  )
}
