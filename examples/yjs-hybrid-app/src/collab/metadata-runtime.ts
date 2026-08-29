import { createModelCollaboration } from '@collabhub/client-core'
import { documentMetadataModel } from '../shared/document-model.js'

export function createMetadataRuntime(documentId: string, actorId: string) {
  const defaultUrl = `ws://${location.hostname}:4400/collab`
  return createModelCollaboration({
    url: import.meta.env.VITE_COLLABHUB_WS_URL ?? defaultUrl,
    documentId,
    actorId,
    model: documentMetadataModel,
    initialState: documentMetadataModel.initialState(documentId),
  })
}

export type MetadataRuntime = ReturnType<typeof createMetadataRuntime>
