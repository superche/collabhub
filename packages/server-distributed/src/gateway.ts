import { createServer, type Server } from 'node:http'
import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import {
  PROTOCOL_VERSION,
  type CanonicalEvent,
  type CapabilityHello,
  type ClientWireMessage,
  type CollaborationOperation,
  type JsonObject,
  type OperationResult,
  type PresenceMessage,
  type ServerWireMessage,
  type SnapshotMessage,
} from '@collabhub/protocol'
import type { CommitStore, ConnectionContext, InternalRoomEvent, OwnerRecord, OwnershipCoordinator, RoomIdentity, WorkerRouter } from './types.js'

interface GatewayConnection {
  socket: WebSocket
  context?: ConnectionContext
  phase: 'new' | 'syncing' | 'ready'
  lastSentVersion: number
  queuedEvents: CanonicalEvent[]
  catchup?: Promise<void>
}

interface RoomHub {
  room: RoomIdentity
  connections: Set<GatewayConnection>
  cursor: number
}

export interface GatewayOptions<TState extends JsonObject> {
  instanceId: string
  port: number
  internalToken: string
  coordinator: OwnershipCoordinator
  store: CommitStore<TState>
  router: WorkerRouter
  maxBufferedBytes?: number
}

export class CollaborationGateway<TState extends JsonObject = JsonObject> {
  private readonly hubs = new Map<string, RoomHub>()
  private server?: Server
  private sockets?: WebSocketServer
  private unsubscribe?: () => Promise<void>
  private watermarkTimer?: ReturnType<typeof setInterval>
  private readonly metrics = { submissions: 0, accepted: 0, rejected: 0, retries: 0, recoveries: 0, slowClients: 0 }

  constructor(private readonly options: GatewayOptions<TState>) {}

  async start(): Promise<void> {
    await this.options.store.migrate()
    this.unsubscribe = await this.options.coordinator.subscribe(
      (event) => { void this.onRoomEvent(event) },
      (message) => this.onPresence(message),
    )
    const app = express()
    app.use(express.json({ limit: '128kb' }))
    app.get('/healthz', (_request, response) => response.json({ ok: true, role: 'gateway', instanceId: this.options.instanceId }))
    app.get('/readyz', async (_request, response) => {
      try {
        await Promise.all([this.options.store.ping(), this.options.coordinator.ping()])
        response.json({ ready: true, rooms: this.hubs.size })
      } catch (error) { response.status(503).json({ ready: false, error: String(error) }) }
    })
    app.get('/metrics', (_request, response) => {
      response.type('text/plain').send([
        `collabhub_gateway_connections ${[...this.hubs.values()].reduce((sum, hub) => sum + hub.connections.size, 0)}`,
        ...Object.entries(this.metrics).map(([name, value]) => `collabhub_gateway_${name}_total ${value}`),
      ].join('\n') + '\n')
    })
    app.get('/v1/tenants/:tenantId/documents/:documentId/snapshot', async (request, response) => {
      try { response.json(await this.fetchSnapshot({ tenantId: request.params.tenantId, documentId: request.params.documentId })) }
      catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : String(error) }) }
    })
    app.post('/v1/tenants/:tenantId/documents/:documentId/operations', async (request, response) => {
      const actorId = request.header('x-collabhub-actor-id')
      const clientId = request.header('x-collabhub-client-id')
      if (!actorId || !clientId) return response.status(400).json({ error: 'actor and client headers are required' })
      const context: ConnectionContext = { tenantId: request.params.tenantId, documentId: request.params.documentId, actorId, clientId }
      try {
        const result = await this.submit(context, this.bindOperation(context, request.body as CollaborationOperation))
        response.status(result.kind === 'retryLater' ? 503 : 200).json(result)
      } catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : String(error) }) }
    })

    this.server = createServer(app)
    this.sockets = new WebSocketServer({ server: this.server, path: '/collab', maxPayload: 128 * 1024 })
    this.sockets.on('connection', (socket) => this.attachSocket(socket))
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.options.port, '0.0.0.0', resolve)
    })
    this.watermarkTimer = setInterval(() => { void this.checkWatermarks() }, 1000)
    this.watermarkTimer.unref()
  }

  async close(): Promise<void> {
    if (this.watermarkTimer) clearInterval(this.watermarkTimer)
    if (this.unsubscribe) await this.unsubscribe().catch(() => undefined)
    if (this.sockets) {
      for (const socket of this.sockets.clients) socket.close(1012, 'gateway restarting')
      await new Promise<void>((resolve) => this.sockets!.close(() => resolve()))
    }
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()))
  }

  private attachSocket(socket: WebSocket): void {
    const connection: GatewayConnection = { socket, phase: 'new', lastSentVersion: 0, queuedEvents: [] }
    socket.on('message', (raw) => {
      let message: ClientWireMessage
      try { message = JSON.parse(String(raw)) as ClientWireMessage }
      catch { return socket.close(1003, 'invalid JSON') }
      void this.handle(connection, message).catch(() => {
        this.send(connection, { kind: 'retryLater', operationId: message.kind === 'submit' ? message.operation.operationId : 'connection', canonicalVersion: connection.lastSentVersion, retryAfterMs: 200, reason: 'temporarilyUnavailable' })
      })
    })
    socket.on('close', () => this.detach(connection))
  }

  private async handle(connection: GatewayConnection, message: ClientWireMessage): Promise<void> {
    if (message.kind === 'hello') return this.hello(connection, message)
    if (!connection.context) return connection.socket.close(1008, 'hello required')
    if (message.kind === 'submit') {
      const operation = this.bindOperation(connection.context, message.operation)
      this.send(connection, await this.submit(connection.context, operation))
      return
    }
    if (message.kind === 'recover') return this.synchronize(connection)
    if (message.kind === 'presence') {
      const presence: PresenceMessage & { tenantId: string } = {
        kind: 'presence', tenantId: connection.context.tenantId, documentId: connection.context.documentId,
        actorId: connection.context.actorId, clientId: connection.context.clientId, data: message.data,
      }
      await this.options.coordinator.publishPresence(presence as unknown as Record<string, unknown>)
    }
  }

  private async hello(connection: GatewayConnection, hello: CapabilityHello): Promise<void> {
    if (connection.context) return connection.socket.close(1008, 'connection identity is immutable')
    if (hello.protocolVersion !== PROTOCOL_VERSION) return connection.socket.close(1002, 'protocol version mismatch')
    for (const value of [hello.tenantId, hello.documentId, hello.actorId, hello.clientId]) if (!value) return connection.socket.close(1008, 'identity is required')
    connection.context = { tenantId: hello.tenantId, documentId: hello.documentId, actorId: hello.actorId, clientId: hello.clientId }
    const hub = this.hub(connection.context)
    hub.connections.add(connection)
    await this.synchronize(connection)
  }

  private async synchronize(connection: GatewayConnection): Promise<void> {
    if (!connection.context) return
    this.metrics.recoveries++
    connection.phase = 'syncing'
    connection.queuedEvents = []
    const snapshot = await this.fetchSnapshot(connection.context)
    this.send(connection, snapshot)
    connection.lastSentVersion = snapshot.canonicalVersion
    const hub = this.hub(connection.context)
    hub.cursor = Math.max(hub.cursor, snapshot.canonicalVersion)
    await this.sendEventsAfter(connection, snapshot.canonicalVersion)
    connection.phase = 'ready'
    for (const event of connection.queuedEvents.sort((a, b) => a.canonicalVersion - b.canonicalVersion)) this.deliverEvent(connection, event)
    connection.queuedEvents = []
    this.send(connection, { kind: 'ready', canonicalVersion: connection.lastSentVersion })
  }

  private async fetchSnapshot(room: RoomIdentity): Promise<SnapshotMessage<TState>> {
    let owner = await this.options.router.resolve(room)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.workerCall<SnapshotMessage<TState>>(owner, '/internal/snapshot', room)
      } catch (error) {
        await this.options.router.invalidate(room, owner).catch(() => undefined)
        if (attempt === 1) throw error
        owner = await this.options.router.resolve(room)
      }
    }
    throw new Error('snapshot routing failed')
  }

  private async submit(context: ConnectionContext, operation: CollaborationOperation): Promise<OperationResult> {
    this.metrics.submissions++
    let owner = await this.options.router.resolve(context)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await this.workerCall<OperationResult>(owner, '/internal/submit', { context, operation })
        if (result.kind === 'accepted') this.metrics.accepted++
        else if (result.kind === 'retryLater') this.metrics.retries++
        else this.metrics.rejected++
        if (result.kind === 'retryLater' && result.reason === 'ownerChanging' && attempt === 0) {
          await this.options.router.invalidate(context, owner).catch(() => undefined)
          owner = await this.options.router.resolve(context)
          continue
        }
        return result
      } catch (error) {
        await this.options.router.invalidate(context, owner).catch(() => undefined)
        if (attempt === 1) throw error
        owner = await this.options.router.resolve(context)
      }
    }
    return { kind: 'retryLater', operationId: operation.operationId, canonicalVersion: operation.baseVersion, retryAfterMs: 200, reason: 'temporarilyUnavailable' }
  }

  private async workerCall<T>(owner: OwnerRecord, path: string, body: unknown): Promise<T> {
    const response = await fetch(`${owner.internalUrl}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-collabhub-internal-token': this.options.internalToken },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`worker request failed (${response.status})`)
    return response.json() as Promise<T>
  }

  private bindOperation(context: ConnectionContext, operation: CollaborationOperation): CollaborationOperation {
    return { ...operation, tenantId: context.tenantId, documentId: context.documentId, actorId: context.actorId, clientId: context.clientId }
  }

  private async onRoomEvent(message: InternalRoomEvent): Promise<void> {
    const hub = this.hubs.get(this.key(message))
    if (!hub) return
    if (message.event.canonicalVersion > hub.cursor + 1) {
      await this.catchupHub(hub)
      return
    }
    if (message.event.canonicalVersion <= hub.cursor) return
    hub.cursor = message.event.canonicalVersion
    for (const connection of hub.connections) this.deliverEvent(connection, message.event)
  }

  private deliverEvent(connection: GatewayConnection, event: CanonicalEvent): void {
    if (connection.phase === 'syncing') {
      connection.queuedEvents.push(event)
      return
    }
    if (event.canonicalVersion <= connection.lastSentVersion) return
    if (event.canonicalVersion !== connection.lastSentVersion + 1) {
      if (!connection.catchup) connection.catchup = this.sendEventsAfter(connection, connection.lastSentVersion).finally(() => { connection.catchup = undefined })
      return
    }
    this.send(connection, event)
    connection.lastSentVersion = event.canonicalVersion
  }

  private async sendEventsAfter(connection: GatewayConnection, afterVersion: number): Promise<void> {
    if (!connection.context) return
    let cursor = afterVersion
    while (true) {
      const events = await this.options.store.eventsAfter(connection.context, cursor, 1000)
      if (!events.length) break
      for (const event of events) {
        if (event.canonicalVersion <= connection.lastSentVersion) continue
        if (event.canonicalVersion !== connection.lastSentVersion + 1) return this.synchronize(connection)
        this.send(connection, event)
        connection.lastSentVersion = event.canonicalVersion
        cursor = event.canonicalVersion
      }
      if (events.length < 1000) break
    }
  }

  private async catchupHub(hub: RoomHub): Promise<void> {
    let cursor = hub.cursor
    while (true) {
      const events = await this.options.store.eventsAfter(hub.room, cursor, 1000)
      if (!events.length) break
      for (const event of events) {
        if (event.canonicalVersion <= hub.cursor) continue
        hub.cursor = event.canonicalVersion
        cursor = event.canonicalVersion
        for (const connection of hub.connections) this.deliverEvent(connection, event)
      }
      if (events.length < 1000) break
    }
  }

  private onPresence(message: Record<string, unknown>): void {
    if (typeof message.tenantId !== 'string' || typeof message.documentId !== 'string') return
    const hub = this.hubs.get(this.key({ tenantId: message.tenantId, documentId: message.documentId }))
    if (!hub) return
    for (const connection of hub.connections) this.send(connection, message as unknown as PresenceMessage)
  }

  private async checkWatermarks(): Promise<void> {
    for (const hub of this.hubs.values()) {
      try {
        const head = await this.options.store.headVersion(hub.room)
        if (head > hub.cursor) await this.catchupHub(hub)
      } catch { /* readiness reports durable dependency failures */ }
    }
  }

  private send(connection: GatewayConnection, message: ServerWireMessage): void {
    if (connection.socket.readyState !== WebSocket.OPEN) return
    if (connection.socket.bufferedAmount > (this.options.maxBufferedBytes ?? 512 * 1024)) {
      this.metrics.slowClients++
      connection.socket.close(1013, 'slow client')
      return
    }
    connection.socket.send(JSON.stringify(message))
  }

  private detach(connection: GatewayConnection): void {
    if (!connection.context) return
    const key = this.key(connection.context)
    const hub = this.hubs.get(key)
    hub?.connections.delete(connection)
    if (hub?.connections.size === 0) this.hubs.delete(key)
  }

  private hub(room: RoomIdentity): RoomHub {
    const key = this.key(room)
    let hub = this.hubs.get(key)
    if (!hub) {
      hub = { room: { tenantId: room.tenantId, documentId: room.documentId }, connections: new Set(), cursor: 0 }
      this.hubs.set(key, hub)
    }
    return hub
  }

  private key(room: RoomIdentity): string { return `${room.tenantId}\u0000${room.documentId}` }
}
