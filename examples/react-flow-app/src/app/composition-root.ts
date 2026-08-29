import type { GraphApplicationRuntime } from '../application/runtime.js'
import { CollabHubGraphTransport } from '../collab/collabhub-graph-transport.js'
import { ReactFlowCollaborationRuntime } from '../collab/react-flow-collaboration-runtime.js'

export function createGraphApplication(): GraphApplicationRuntime {
  const query = new URLSearchParams(location.search)
  const actorId = query.get('client') ?? crypto.randomUUID().slice(0, 8)
  let documentId = query.get('document')
  if (!documentId) {
    documentId = `graph-${crypto.randomUUID()}`
    query.set('document', documentId)
    history.replaceState(null, '', `${location.pathname}?${query.toString()}${location.hash}`)
  }
  const clientId = `${actorId}-${crypto.randomUUID().slice(0, 6)}`
  document.documentElement.classList.toggle('embedded-demo', query.get('embedded') === '1')
  const defaultWebSocketUrl = import.meta.env.DEV
    ? `ws://${location.hostname}:4300/collab`
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/collab`
  const tokenEndpoint = import.meta.env.VITE_COLLABHUB_TOKEN_ENDPOINT
  const smokeToken = import.meta.env.VITE_COLLABHUB_AUTH_TOKEN
  const getAuthToken = tokenEndpoint
    ? async () => {
        const response = await fetch(tokenEndpoint, {
          method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tenantId: 'demo', documentId, actorId }),
        })
        if (!response.ok) throw new Error(`CollabHub token request failed (${response.status})`)
        const body = await response.json() as { token?: unknown }
        if (typeof body.token !== 'string' || !body.token) throw new Error('CollabHub token response is missing token')
        return body.token
      }
    : smokeToken ? () => smokeToken : undefined
  return new ReactFlowCollaborationRuntime(
    actorId,
    new CollabHubGraphTransport(import.meta.env.VITE_COLLABHUB_WS_URL ?? defaultWebSocketUrl, documentId, actorId, clientId, getAuthToken),
  )
}
