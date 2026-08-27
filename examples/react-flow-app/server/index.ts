import { createServer } from 'node:http'
import { resolve } from 'node:path'
import express from 'express'
import { WebSocketServer, type WebSocket } from 'ws'
import { PROTOCOL_VERSION, type ClientWireMessage, type PresenceMessage } from '@collabhub/protocol'
import { CollaborationServerCore, InMemoryStorageAdapter } from '@collabhub/server-core'
import { GraphDocumentDomainPack } from './graph-domain-pack.js'

const port = Number(process.env.PORT ?? process.env.COLLABHUB_REACT_FLOW_PORT ?? 4300)
const host = process.env.COLLABHUB_HOST ?? '127.0.0.1'
const staticDirectory = process.env.COLLABHUB_DEMO_STATIC_DIR
const core = new CollaborationServerCore({ domainPack: GraphDocumentDomainPack, storage: new InMemoryStorageAdapter(), snapshotInterval: 10, maxRecoveryGap: 50 })
const socketsByDocument = new Map<string, Set<WebSocket>>()
const app = express()
app.get('/health', (_request, response) => response.json({ ok: true, example: 'react-flow' }))
app.get('/healthz', (_request, response) => response.json({ status: 'ok', version: '0.1.0', example: 'react-flow' }))
if (staticDirectory) {
  app.use(express.static(staticDirectory, { index: 'index.html', maxAge: '1h' }))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || !request.accepts('html')) return next()
    response.sendFile(resolve(staticDirectory, 'index.html'))
  })
}
const server = createServer(app)
server.keepAliveTimeout = 120_000
server.headersTimeout = 121_000
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
      console.log(`[react-flow:trace] ${JSON.stringify({ event: 'client_connected', documentId: message.documentId, actorId: message.actorId, lastKnownVersion: message.lastKnownVersion, canonicalVersion: session.canonicalVersion })}`)
      socket.send(JSON.stringify(session.snapshot()))
      socket.send(JSON.stringify({ kind: 'ready', canonicalVersion: session.canonicalVersion }))
      return
    }
    if (!roomKey) { socket.close(1008, 'hello required'); return }
    if (message.kind === 'submit') {
      const session = await core.session(message.operation.tenantId, message.operation.documentId)
      const result = await session.submit(message.operation)
      console.log(`[react-flow:trace] ${JSON.stringify({ event: 'operation_result', operationType: message.operation.operationType, operationId: message.operation.operationId, result: result.kind, canonicalVersion: result.canonicalVersion, payloadBytes: JSON.stringify(message.operation.payload).length })}`)
      socket.send(JSON.stringify(result))
      return
    }
    if (message.kind === 'recover') {
      const session = await core.session(message.tenantId, message.documentId)
      console.log(`[react-flow:trace] ${JSON.stringify({ event: 'snapshot_recovery', documentId: message.documentId, sinceVersion: message.sinceVersion, canonicalVersion: session.canonicalVersion })}`)
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

server.listen(port, host, () => {
  console.log(`[collabhub:react-flow] server pid=${process.pid} http=${host}:${port} ws=ws://${host}:${port}/collab static=${staticDirectory ?? 'disabled'}`)
})
