import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { WebSocketServer, type WebSocket } from 'ws'
import { PROTOCOL_VERSION, type ClientWireMessage, type PresenceMessage } from '@collabhub/protocol'
import { CollaborationServerCore } from '@collabhub/server-core'
import { DraftDomainPack } from './draft-domain-pack.js'
import { registerDraftApi } from './draft-api.js'
import { DraftRepository } from './draft-repository.js'
import { DraftRepositoryStorageAdapter } from './draft-storage-adapter.js'

const port = Number(process.env.COLLABHUB_PORT ?? 4100)
const dataFile = process.env.COLLABHUB_DATA_FILE ?? fileURLToPath(new URL('../.data/drafts.json', import.meta.url))
const repository = new DraftRepository(dataFile)
const storage = new DraftRepositoryStorageAdapter(repository)
const core = new CollaborationServerCore({ domainPack: DraftDomainPack, storage, snapshotInterval: 1, maxRecoveryGap: 50 })
const activeCounts = new Map<string, number>()
const socketsByDocument = new Map<string, Set<WebSocket>>()

const app = express()
app.use(cors())
app.use(express.json({ limit: '64kb' }))
registerDraftApi(app, repository, (id) => (activeCounts.get(id) ?? 0) > 0)
const server = createServer(app)
const webSockets = new WebSocketServer({ server, path: '/collab', maxPayload: 64 * 1024 })

webSockets.on('connection', (socket) => {
  let documentId: string | undefined
  let unsubscribe: () => void = () => undefined
  socket.on('message', async (raw) => {
    let message: ClientWireMessage
    try { message = JSON.parse(raw.toString()) as ClientWireMessage }
    catch { socket.close(1003, 'invalid JSON'); return }
    if (message.kind === 'hello') {
      if (message.protocolVersion !== PROTOCOL_VERSION) { socket.close(1002, 'protocol mismatch'); return }
      documentId = message.documentId
      activeCounts.set(documentId, (activeCounts.get(documentId) ?? 0) + 1)
      const roomSockets = socketsByDocument.get(documentId) ?? new Set<WebSocket>()
      roomSockets.add(socket)
      socketsByDocument.set(documentId, roomSockets)
      const session = await core.session(message.tenantId, message.documentId)
      unsubscribe = session.subscribe((event) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event)) })
      console.log(`[collabhub:trace] ${JSON.stringify({ event: 'client_connected', documentId, actorId: message.actorId, clientId: message.clientId, lastKnownVersion: message.lastKnownVersion, canonicalVersion: session.canonicalVersion, snapshotRecovery: message.lastKnownVersion !== session.canonicalVersion })}`)
      socket.send(JSON.stringify(session.snapshot()))
      socket.send(JSON.stringify({ kind: 'ready', canonicalVersion: session.canonicalVersion }))
      return
    }
    if (!documentId) { socket.close(1008, 'hello required'); return }
    if (message.kind === 'submit') {
      const session = await core.session(message.operation.tenantId, message.operation.documentId)
      const started = performance.now()
      const result = await session.submit(message.operation)
      console.log(`[collabhub:trace] ${JSON.stringify({ event: 'operation_result', documentId, operationId: message.operation.operationId, operationType: message.operation.operationType, baseVersion: message.operation.baseVersion, result: result.kind, canonicalVersion: result.canonicalVersion, duplicate: result.kind === 'accepted' && result.duplicate === true, latencyMs: Number((performance.now() - started).toFixed(2)) })}`)
      socket.send(JSON.stringify(result))
      return
    }
    if (message.kind === 'recover') {
      const session = await core.session(message.tenantId, message.documentId)
      console.log(`[collabhub:trace] ${JSON.stringify({ event: 'snapshot_recovery', documentId, sinceVersion: message.sinceVersion, canonicalVersion: session.canonicalVersion })}`)
      socket.send(JSON.stringify(session.snapshot()))
      return
    }
    const presence = message as PresenceMessage
    for (const peer of socketsByDocument.get(documentId) ?? []) if (peer !== socket && peer.readyState === peer.OPEN) peer.send(JSON.stringify(presence))
  })
  socket.on('close', () => {
    unsubscribe()
    if (!documentId) return
    const next = Math.max(0, (activeCounts.get(documentId) ?? 1) - 1)
    if (next === 0) activeCounts.delete(documentId); else activeCounts.set(documentId, next)
    socketsByDocument.get(documentId)?.delete(socket)
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[collabhub] server pid=${process.pid} http=127.0.0.1:${port} ws=ws://127.0.0.1:${port}/collab data=${dataFile}`)
})
