import { createMetadataRuntime } from '../collab/metadata-runtime.js'
import { YjsBodyRuntime } from '../collab/yjs-body-runtime.js'

export function createHybridApplication() {
  const query = new URLSearchParams(location.search)
  const actorId = query.get('client') ?? crypto.randomUUID().slice(0, 8)
  let documentId = query.get('document')
  if (!documentId) {
    documentId = `hybrid-${crypto.randomUUID()}`
    query.set('document', documentId)
    history.replaceState(null, '', `${location.pathname}?${query.toString()}${location.hash}`)
  }
  const yjsUrl = import.meta.env.VITE_YJS_WS_URL ?? `ws://${location.hostname}:4401`
  return {
    actorId,
    documentId,
    metadata: createMetadataRuntime(documentId, actorId),
    body: new YjsBodyRuntime(yjsUrl, `demo:${documentId}:body`),
  }
}

export type HybridApplication = ReturnType<typeof createHybridApplication>
