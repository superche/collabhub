import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { PROTOCOL_VERSION, type CapabilityHello, type ClientWireMessage, type JsonObject, type PresenceMessage } from '@collabhub/protocol'
import { jsonStrategies } from '@collabhub/domain-json'
import { createModelDomainPack, type CollaborationModel, type ModelCommand } from '@collabhub/model'
import {
  CollaborationServerCore,
  InMemoryStorageAdapter,
  type RoomCachePolicy,
  type RoomDataRetention,
  type StorageAdapter,
} from '@collabhub/server-core'
import { defineDomainPack, type DomainPack } from '@collabhub/strategy-sdk'
import { WebSocket, WebSocketServer } from 'ws'

export { FileStorageAdapter } from './file-storage.js'
export { jsonStrategies } from '@collabhub/domain-json'
export { defineDomainPack } from '@collabhub/strategy-sdk'
export type { DomainPack } from '@collabhub/strategy-sdk'
export type { JsonObject } from '@collabhub/protocol'
export { defineCollaborationModel } from '@collabhub/model'
export type { CollaborationModel, ModelCommand } from '@collabhub/model'

export interface StandaloneConnectionIdentity {
  tenantId: string
  documentId: string
  actorId: string
  clientId: string
}

export interface StandaloneWebSocketServerOptions<TState extends JsonObject> {
  domainPack: DomainPack<TState>
  storage?: StorageAdapter<TState>
  server?: Server
  host?: string
  port?: number
  path?: string
  snapshotInterval?: number
  maxRecoveryGap?: number
  roomCachePolicy?: Partial<RoomCachePolicy>
  roomDataRetention?: RoomDataRetention
  maxPayloadBytes?: number
  maxConnections?: number
  maxConnectionsPerIp?: number
  maxActiveRooms?: number
  messageRatePerSecond?: number
  messageBurst?: number
  allowedOrigins?: readonly string[]
  /** Trust only when the immediately upstream proxy removes client-supplied forwarding headers. */
  trustProxyHeaders?: boolean
  authenticate?(hello: CapabilityHello, request: IncomingMessage): Promise<StandaloneConnectionIdentity> | StandaloneConnectionIdentity
  /** Required when authenticate is omitted, so insecure identity is never accidental. */
  allowInsecureDevelopmentIdentity?: boolean
}

export interface StandaloneWebSocketServerHandle<TState extends JsonObject> {
  readonly core: CollaborationServerCore<TState>
  readonly server: Server
  readonly port: number
  readonly webSocketUrl: string
  close(): Promise<void>
}

export interface JsonCollaborationServerOptions<TState extends JsonObject> extends Omit<
  StandaloneWebSocketServerOptions<TState>,
  'domainPack' | 'authenticate' | 'allowInsecureDevelopmentIdentity'
> {
  initialState(documentId: string): TState
  domainPack?: DomainPack<TState>
  domainPackId?: string
  schemaVersion?: string
  authToken?: string
  authenticate?: StandaloneWebSocketServerOptions<TState>['authenticate']
  allowInsecureDevelopmentIdentity?: boolean
}

export interface ModelCollaborationServerOptions<TState extends object, TCommand extends ModelCommand>
  extends Omit<StandaloneWebSocketServerOptions<TState & JsonObject>, 'domainPack' | 'storage'> {
  model: CollaborationModel<TState, TCommand>
  storage?: StorageAdapter<JsonObject>
  /** Simple shared token for small deployments. Use authenticate for application identity and permissions. */
  authToken?: string
}

/** Starts a server from the same small model file used by the React client. */
export function startModelCollaborationServer<TState extends object, TCommand extends ModelCommand>(
  options: ModelCollaborationServerOptions<TState, TCommand>,
): Promise<StandaloneWebSocketServerHandle<TState & JsonObject>> {
  const { model, authToken, authenticate, storage, ...serverOptions } = options
  const tokenAuthentication = authToken
    ? (hello: CapabilityHello) => {
      if (!hello.authToken || !sameSecret(hello.authToken, authToken)) throw new Error('unauthorized')
      return pickIdentity(hello)
    }
    : undefined
  return startStandaloneWebSocketServer({
    ...serverOptions,
    domainPack: createModelDomainPack(model),
    storage: storage as StorageAdapter<TState & JsonObject> | undefined,
    authenticate: authenticate ?? tokenAuthentication,
  })
}

/** Starts the built-in JSON collaboration service without Domain Pack plumbing. */
export function startJsonCollaborationServer<TState extends JsonObject>(
  options: JsonCollaborationServerOptions<TState>,
): Promise<StandaloneWebSocketServerHandle<TState>> {
  const {
    initialState,
    domainPack: configuredDomainPack,
    domainPackId = 'collabhub.json',
    schemaVersion = '1.0',
    authToken,
    authenticate,
    allowInsecureDevelopmentIdentity,
    ...serverOptions
  } = options
  const domainPack = configuredDomainPack ?? defineDomainPack<TState>({ id: domainPackId, schemaVersion, strategies: jsonStrategies, initialState })
  const tokenAuthentication = authToken
    ? (hello: CapabilityHello) => {
      if (!hello.authToken || !sameSecret(hello.authToken, authToken)) throw new Error('unauthorized')
      return pickIdentity(hello)
    }
    : undefined
  return startStandaloneWebSocketServer({
    ...serverOptions,
    domainPack,
    authenticate: authenticate ?? tokenAuthentication,
    allowInsecureDevelopmentIdentity,
  })
}

export async function startStandaloneWebSocketServer<TState extends JsonObject>(
  options: StandaloneWebSocketServerOptions<TState>,
): Promise<StandaloneWebSocketServerHandle<TState>> {
  if (!options.authenticate && !options.allowInsecureDevelopmentIdentity) {
    throw new Error('authenticate is required unless allowInsecureDevelopmentIdentity=true')
  }
  const storage = options.storage ?? new InMemoryStorageAdapter<TState>()
  const core = new CollaborationServerCore<TState>({
    domainPack: options.domainPack,
    storage,
    snapshotInterval: options.snapshotInterval,
    maxRecoveryGap: options.maxRecoveryGap,
    roomCachePolicy: options.roomCachePolicy ?? { idleTtlMs: 30 * 60_000, maxWarmRooms: 500, scanIntervalMs: 60_000 },
    roomDataRetention: options.roomDataRetention ?? 'retain',
  })
  const ownsServer = !options.server
  const server = options.server ?? createServer((request, response) => {
    if (request.url === '/healthz') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ status: 'ok', warmRooms: core.warmRoomCount }))
      return
    }
    response.statusCode = 404
    response.end('not found')
  })
  const path = options.path ?? '/collab'
  const allowedOrigins = new Set(options.allowedOrigins ?? [])
  const originAllowed = (origin: string | undefined) => allowedOrigins.size === 0 || (typeof origin === 'string' && allowedOrigins.has(origin))
  const sockets = new WebSocketServer({
    server,
    path,
    maxPayload: options.maxPayloadBytes ?? 128 * 1024,
    verifyClient: ({ req }, done) => {
      if (!originAllowed(req.headers.origin)) { done(false, 403, 'Origin not allowed'); return }
      done(true)
    },
  })
  const socketsByRoom = new Map<string, Set<WebSocket>>()
  const connectionsByIp = new Map<string, number>()

  sockets.on('connection', (socket, request) => {
    const ip = requestIp(request, options.trustProxyHeaders ?? false)
    const origin = request.headers.origin
    if (!originAllowed(origin)) return socket.close(1008, 'origin not allowed')
    if (sockets.clients.size > (options.maxConnections ?? 10_000)) return socket.close(1013, 'connection capacity reached')
    if ((connectionsByIp.get(ip) ?? 0) >= (options.maxConnectionsPerIp ?? 50)) return socket.close(1013, 'connection limit reached')
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1)
    let tokens = options.messageBurst ?? 60
    let tokenUpdatedAt = Date.now()
    let identity: StandaloneConnectionIdentity | undefined
    let roomKey: string | undefined
    let lease: Awaited<ReturnType<typeof core.acquireRoom>> | undefined
    let generation = 0
    let unsubscribe: () => void = () => undefined

    const leaveRoom = () => {
      generation++
      unsubscribe()
      unsubscribe = () => undefined
      lease?.release()
      lease = undefined
      identity = undefined
      if (!roomKey) return
      const peers = socketsByRoom.get(roomKey)
      peers?.delete(socket)
      if (peers?.size === 0) socketsByRoom.delete(roomKey)
      roomKey = undefined
    }

    socket.on('message', async (raw) => {
      const now = Date.now()
      const rate = options.messageRatePerSecond ?? 30
      const burst = options.messageBurst ?? 60
      tokens = Math.min(burst, tokens + ((now - tokenUpdatedAt) / 1000) * rate)
      tokenUpdatedAt = now
      if (tokens < 1) return socket.close(1013, 'message rate exceeded')
      tokens--
      let message: ClientWireMessage
      try { message = JSON.parse(String(raw)) as ClientWireMessage }
      catch { return socket.close(1003, 'invalid JSON') }

      if (message.kind === 'hello') {
        if (message.protocolVersion !== PROTOCOL_VERSION) return socket.close(1002, 'protocol version mismatch')
        let nextIdentity: StandaloneConnectionIdentity
        try {
          nextIdentity = options.authenticate
            ? await options.authenticate(message, request)
            : pickIdentity(message)
          validateIdentity(nextIdentity)
        } catch { return socket.close(1008, 'unauthorized') }
        leaveRoom()
        const expectedGeneration = generation
        const nextRoomKey = key(nextIdentity)
        if (!socketsByRoom.has(nextRoomKey) && socketsByRoom.size >= (options.maxActiveRooms ?? 1000)) return socket.close(1013, 'room capacity reached')
        identity = nextIdentity
        roomKey = nextRoomKey
        const peers = socketsByRoom.get(nextRoomKey) ?? new Set<WebSocket>()
        peers.add(socket)
        socketsByRoom.set(nextRoomKey, peers)
        const nextLease = await core.acquireRoom(nextIdentity.tenantId, nextIdentity.documentId)
        if (generation !== expectedGeneration || roomKey !== nextRoomKey || socket.readyState !== WebSocket.OPEN) {
          nextLease.release()
          peers.delete(socket)
          if (peers.size === 0 && socketsByRoom.get(nextRoomKey) === peers) socketsByRoom.delete(nextRoomKey)
          return
        }
        lease = nextLease
        unsubscribe = lease.session.subscribe((event) => send(socket, event))
        send(socket, lease.session.snapshot())
        send(socket, { kind: 'ready', canonicalVersion: lease.session.canonicalVersion })
        return
      }

      if (!identity || !roomKey || !lease) return socket.close(1008, 'hello required')
      if (message.kind === 'submit') {
        const operation = { ...message.operation, ...identity }
        send(socket, await lease.session.submit(operation))
        return
      }
      if (message.kind === 'recover') {
        send(socket, lease.session.snapshot())
        return
      }
      const presence: PresenceMessage = { ...message, ...identity, kind: 'presence' }
      for (const peer of socketsByRoom.get(roomKey) ?? []) if (peer !== socket) send(peer, presence)
    })

    socket.on('close', () => {
      leaveRoom()
      const remaining = Math.max(0, (connectionsByIp.get(ip) ?? 1) - 1)
      if (remaining === 0) connectionsByIp.delete(ip)
      else connectionsByIp.set(ip, remaining)
    })
  })

  if (ownsServer) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve)
    })
  } else if (!server.listening) {
    throw new Error('the supplied HTTP server must already be listening')
  }
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('server did not expose a TCP address')
  const port = (address as AddressInfo).port
  const host = options.host ?? '127.0.0.1'
  return {
    core,
    server,
    port,
    webSocketUrl: `ws://${host}:${port}${path}`,
    async close() {
      for (const socket of sockets.clients) socket.close(1001, 'server closing')
      await new Promise<void>((resolve) => sockets.close(() => resolve()))
      await core.close()
      if (ownsServer) await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function pickIdentity(hello: CapabilityHello): StandaloneConnectionIdentity {
  return { tenantId: hello.tenantId, documentId: hello.documentId, actorId: hello.actorId, clientId: hello.clientId }
}

function sameSecret(received: string, expected: string): boolean {
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function validateIdentity(identity: StandaloneConnectionIdentity): void {
  for (const value of Object.values(identity)) if (!value || value.length > 256) throw new Error('invalid connection identity')
}

function requestIp(request: IncomingMessage, trustProxyHeaders: boolean): string {
  const forwarded = trustProxyHeaders ? request.headers['x-forwarded-for'] : undefined
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return first?.trim() || request.socket.remoteAddress || 'unknown'
}

function key(identity: Pick<StandaloneConnectionIdentity, 'tenantId' | 'documentId'>): string {
  return `${identity.tenantId}\u0000${identity.documentId}`
}
