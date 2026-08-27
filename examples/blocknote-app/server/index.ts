import { createServer } from 'node:http'
import express from 'express'
import { WebSocketServer, type WebSocket } from 'ws'
import { PROTOCOL_VERSION, type ClientWireMessage, type PresenceMessage } from '@collabhub/protocol'
import { CollaborationServerCore, InMemoryStorageAdapter } from '@collabhub/server-core'
import { BlockDocumentDomainPack } from './block-domain-pack.js'

const port = Number(process.env.COLLABHUB_BLOCKNOTE_PORT ?? 4200)
const core = new CollaborationServerCore({ domainPack: BlockDocumentDomainPack, storage: new InMemoryStorageAdapter(), snapshotInterval: 10, maxRecoveryGap: 50 })
const socketsByDocument = new Map<string, Set<WebSocket>>()
const app = express()
app.get('/health', (_request, response) => response.json({ ok: true, example: 'blocknote' }))
const server = createServer(app)
const webSockets = new WebSocketServer({ server, path: '/collab', maxPayload: 128 * 1024 })

webSockets.on('connection', (socket) => {
  let roomKey: string | undefined
  let unsubscribe: () => void = () => undefined
  socket.on('message', async (raw) => {
    let message: ClientWireMessage
    try { message = JSON.parse(raw.toString()) as ClientWireMessage }
    catch { socket.close(1003, 'invalid JSON'); return }
    if (message.kind === 'hello') {
      if (message.protocolVersion !== PROTOCOL_VERSION) { socket.close(1002, 'protocol mismatch'); return }
      roomKey = `${message.tenantId}\u0000${message.documentId}`
      const roomSockets = socketsByDocument.get(roomKey) ?? new Set<WebSocket>()
      roomSockets.add(socket)
      socketsByDocument.set(roomKey, roomSockets)
      const session = await core.session(message.tenantId, message.documentId)
      unsubscribe = session.subscribe((event) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event)) })
      console.log(`[blocknote:trace] ${JSON.stringify({ event: 'client_connected', documentId: message.documentId, actorId: message.actorId, lastKnownVersion: message.lastKnownVersion, canonicalVersion: session.canonicalVersion })}`)
      socket.send(JSON.stringify(session.snapshot()))
      socket.send(JSON.stringify({ kind: 'ready', canonicalVersion: session.canonicalVersion }))
      return
    }
    if (!roomKey) { socket.close(1008, 'hello required'); return }
    if (message.kind === 'submit') {
      const session = await core.session(message.operation.tenantId, message.operation.documentId)
      const result = await session.submit(message.operation)
      console.log(`[blocknote:trace] ${JSON.stringify({ event: 'operation_result', operationType: message.operation.operationType, operationId: message.operation.operationId, result: result.kind, canonicalVersion: result.canonicalVersion, payloadBytes: JSON.stringify(message.operation.payload).length })}`)
      socket.send(JSON.stringify(result))
      return
    }
    if (message.kind === 'recover') {
      const session = await core.session(message.tenantId, message.documentId)
      console.log(`[blocknote:trace] ${JSON.stringify({ event: 'snapshot_recovery', documentId: message.documentId, sinceVersion: message.sinceVersion, canonicalVersion: session.canonicalVersion })}`)
      socket.send(JSON.stringify(session.snapshot()))
      return
    }
    const presence = message as PresenceMessage
    for (const peer of socketsByDocument.get(roomKey) ?? []) if (peer !== socket && peer.readyState === peer.OPEN) peer.send(JSON.stringify(presence))
  })
  socket.on('close', () => {
    unsubscribe()
    if (roomKey) socketsByDocument.get(roomKey)?.delete(socket)
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[collabhub:blocknote] server pid=${process.pid} http=127.0.0.1:${port} ws=ws://127.0.0.1:${port}/collab`)
})
