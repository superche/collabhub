import { startModelCollaborationServer } from '@collabhub/server-ws'
import { documentMetadataModel } from '../src/shared/document-model.js'

const port = Number(process.env.COLLABHUB_YJS_METADATA_PORT ?? 4400)

const handle = await startModelCollaborationServer({
  model: documentMetadataModel,
  host: '127.0.0.1',
  port,
  path: '/collab',
  allowInsecureDevelopmentIdentity: true,
  roomCachePolicy: { idleTtlMs: 30 * 60_000, maxWarmRooms: 500, scanIntervalMs: 60_000 },
  roomDataRetention: 'delete',
})

console.log(`[collabhub:yjs-hybrid] metadata=${handle.webSocketUrl} yjs=ws://127.0.0.1:4401`)
