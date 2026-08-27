import type { BlockNoteApplicationRuntime } from '../application/runtime.js'
import { BlockNoteCollaborationRuntime } from '../collab/blocknote-collaboration-runtime.js'
import { CollabHubBlockTransport } from '../collab/collabhub-block-transport.js'

export function createBlockNoteApplication(): BlockNoteApplicationRuntime {
  const query = new URLSearchParams(location.search)
  const actorId = query.get('client') ?? crypto.randomUUID().slice(0, 8)
  const documentId = query.get('document') ?? 'blocknote-demo'
  const clientId = `${actorId}-${crypto.randomUUID().slice(0, 6)}`
  return new BlockNoteCollaborationRuntime(
    actorId,
    new CollabHubBlockTransport('ws://127.0.0.1:4200/collab', documentId, actorId, clientId),
  )
}
