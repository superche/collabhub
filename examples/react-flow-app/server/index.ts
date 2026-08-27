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
const storage = new InMemoryStorageAdapter()
const core = new CollaborationServerCore({
  domainPack: GraphDocumentDomainPack,
  storage,
  snapshotInterval: 10,
  maxRecoveryGap: 50,
  roomCachePolicy: {
    idleTtlMs: positiveInteger('COLLABHUB_DEMO_ROOM_IDLE_TTL_MS', 30 * 60_000),
    maxWarmRooms: positiveInteger('COLLABHUB_DEMO_MAX_WARM_ROOMS', 500),
    scanIntervalMs: positiveInteger('COLLABHUB_DEMO_ROOM_SCAN_INTERVAL_MS', 60_000),
  },
  roomDataRetention: 'delete',
})
const socketsByDocument = new Map<string, Set<WebSocket>>()
const app = express()
app.get('/health', (_request, response) => response.json({ ok: true, example: 'react-flow' }))
app.get('/healthz', (_request, response) => response.json({ status: 'ok', version: '0.1.0', example: 'react-flow', warmRooms: core.warmRoomCount }))
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
  let roomLease: Awaited<ReturnType<typeof core.acquireRoom>> | undefined
  let roomGeneration = 0
  let unsubscribe: () => void = () => undefined
  const leaveRoom = () => {
    roomGeneration++
    unsubscribe()
    unsubscribe = () => undefined
    roomLease?.release()
    roomLease = undefined
    if (!roomKey) return
    const roomSockets = socketsByDocument.get(roomKey)
    roomSockets?.delete(socket)
    if (roomSockets?.size === 0) socketsByDocument.delete(roomKey)
    roomKey = undefined
  }
  socket.on('message', async (raw) => {
    let message: ClientWireMessage
    try { message = JSON.parse(raw.toString()) as ClientWireMessage }
    catch { socket.close(1003, 'invalid JSON'); return }
    if (message.kind === 'hello') {
      if (message.protocolVersion !== PROTOCOL_VERSION) { socket.close(1002, 'protocol mismatch'); return }
      leaveRoom()
      const expectedGeneration = roomGeneration
      const nextRoomKey = `${message.tenantId}\u0000${message.documentId}`
      roomKey = nextRoomKey
      const roomSockets = socketsByDocument.get(nextRoomKey) ?? new Set<WebSocket>()
      roomSockets.add(socket)
      socketsByDocument.set(nextRoomKey, roomSockets)
      const nextLease = await core.acquireRoom(message.tenantId, message.documentId)
      if (roomGeneration !== expectedGeneration || roomKey !== nextRoomKey || socket.readyState !== socket.OPEN) {
        nextLease.release()
        roomSockets.delete(socket)
        if (roomSockets.size === 0 && socketsByDocument.get(nextRoomKey) === roomSockets) socketsByDocument.delete(nextRoomKey)
        return
      }
      roomLease = nextLease
      const session = nextLease.session
      unsubscribe = session.subscribe((event) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event)) })
      console.log(`[react-flow:trace] ${JSON.stringify({ event: 'client_connected', documentId: message.documentId, actorId: message.actorId, lastKnownVersion: message.lastKnownVersion, canonicalVersion: session.canonicalVersion })}`)
      socket.send(JSON.stringify(session.snapshot()))
      socket.send(JSON.stringify({ kind: 'ready', canonicalVersion: session.canonicalVersion }))
      return
    }
    if (!roomKey || !roomLease) { socket.close(1008, 'hello required'); return }
    if (message.kind === 'submit') {
      const result = await roomLease.session.submit(message.operation)
      console.log(`[react-flow:trace] ${JSON.stringify({ event: 'operation_result', operationType: message.operation.operationType, operationId: message.operation.operationId, result: result.kind, canonicalVersion: result.canonicalVersion, payloadBytes: JSON.stringify(message.operation.payload).length })}`)
      socket.send(JSON.stringify(result))
      return
    }
    if (message.kind === 'recover') {
      const session = roomLease.session
      console.log(`[react-flow:trace] ${JSON.stringify({ event: 'snapshot_recovery', documentId: message.documentId, sinceVersion: message.sinceVersion, canonicalVersion: session.canonicalVersion })}`)
      socket.send(JSON.stringify(session.snapshot()))
      return
    }
    const presence = message as PresenceMessage
    for (const peer of socketsByDocument.get(roomKey) ?? []) if (peer !== socket && peer.readyState === peer.OPEN) peer.send(JSON.stringify(presence))
  })
  socket.on('close', leaveRoom)
})

server.listen(port, host, () => {
  console.log(`[collabhub:react-flow] server pid=${process.pid} http=${host}:${port} ws=ws://${host}:${port}/collab static=${staticDirectory ?? 'disabled'}`)
})

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}
