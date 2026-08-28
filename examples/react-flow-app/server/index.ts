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
const maxConnections = positiveInteger('COLLABHUB_DEMO_MAX_CONNECTIONS', 250)
const maxConnectionsPerIp = positiveInteger('COLLABHUB_DEMO_MAX_CONNECTIONS_PER_IP', 8)
const maxActiveRooms = positiveInteger('COLLABHUB_DEMO_MAX_ACTIVE_ROOMS', 500)
const messageRatePerSecond = positiveInteger('COLLABHUB_DEMO_MESSAGE_RATE_PER_SECOND', 30)
const messageBurst = positiveInteger('COLLABHUB_DEMO_MESSAGE_BURST', 60)
const trustProxyHeaders = process.env.COLLABHUB_DEMO_TRUST_PROXY_HEADERS === 'true'
const allowedOrigins = new Set((process.env.COLLABHUB_DEMO_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean))
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
const connectionsByIp = new Map<string, number>()
const app = express()
app.get('/health', (_request, response) => response.json({ ok: true, example: 'react-flow' }))
app.get('/healthz', (_request, response) => response.json({
  status: 'ok', version: '0.1.2', example: 'react-flow', warmRooms: core.warmRoomCount,
  originRestricted: allowedOrigins.size > 0,
}))
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
const webSockets = new WebSocketServer({
  server,
  path: '/collab',
  maxPayload: 128 * 1024,
  verifyClient: ({ req }, done) => {
    if (!originAllowed(req.headers.origin)) { done(false, 403, 'Origin not allowed'); return }
    done(true)
  },
})

webSockets.on('connection', (socket, request) => {
  const ip = clientIp(trustProxyHeaders ? request.headers['x-forwarded-for'] : undefined, request.socket.remoteAddress)
  const origin = request.headers.origin
  if (!originAllowed(origin)) { socket.close(1008, 'origin not allowed'); return }
  if (webSockets.clients.size > maxConnections || (connectionsByIp.get(ip) ?? 0) >= maxConnectionsPerIp) { socket.close(1013, 'connection limit reached'); return }
  connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1)
  let tokens = messageBurst
  let tokenUpdatedAt = Date.now()
  let roomKey: string | undefined
  let connectionContext: { tenantId: string; documentId: string; actorId: string; clientId: string } | undefined
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
    const now = Date.now()
    tokens = Math.min(messageBurst, tokens + ((now - tokenUpdatedAt) / 1000) * messageRatePerSecond)
    tokenUpdatedAt = now
    if (tokens < 1) { socket.close(1013, 'message rate exceeded'); return }
    tokens--
    let message: ClientWireMessage
    try { message = JSON.parse(raw.toString()) as ClientWireMessage }
    catch { socket.close(1003, 'invalid JSON'); return }
    if (message.kind === 'hello') {
      if (message.protocolVersion !== PROTOCOL_VERSION) { socket.close(1002, 'protocol mismatch'); return }
      if (![message.tenantId, message.documentId, message.actorId, message.clientId].every(validIdentity)) { socket.close(1008, 'invalid identity'); return }
      leaveRoom()
      const expectedGeneration = roomGeneration
      const nextRoomKey = `${message.tenantId}\u0000${message.documentId}`
      if (!socketsByDocument.has(nextRoomKey) && socketsByDocument.size >= maxActiveRooms) { socket.close(1013, 'room capacity reached'); return }
      roomKey = nextRoomKey
      connectionContext = { tenantId: message.tenantId, documentId: message.documentId, actorId: message.actorId, clientId: message.clientId }
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
      const operation = { ...message.operation, ...connectionContext! }
      const result = await roomLease.session.submit(operation)
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
    const presence = { ...(message as PresenceMessage), ...connectionContext }
    for (const peer of socketsByDocument.get(roomKey) ?? []) if (peer !== socket && peer.readyState === peer.OPEN) peer.send(JSON.stringify(presence))
  })
  socket.on('close', () => {
    leaveRoom()
    const remaining = Math.max(0, (connectionsByIp.get(ip) ?? 1) - 1)
    if (remaining === 0) connectionsByIp.delete(ip)
    else connectionsByIp.set(ip, remaining)
  })
})

function originAllowed(origin: string | undefined): boolean {
  return allowedOrigins.size === 0 || (typeof origin === 'string' && allowedOrigins.has(origin))
}

server.listen(port, host, () => {
  console.log(`[collabhub:react-flow] server pid=${process.pid} http=${host}:${port} ws=ws://${host}:${port}/collab static=${staticDirectory ?? 'disabled'}`)
})

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}

function clientIp(forwarded: string | string[] | undefined, remoteAddress: string | undefined): string {
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return value?.trim() || remoteAddress || 'unknown'
}

function validIdentity(value: string): boolean { return value.length > 0 && value.length <= 256 }
