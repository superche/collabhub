import { createServer, type Server } from 'node:http'
import express from 'express'
import { applyCanonicalPatches } from '@collabhub/domain-json'
import { assertOperationEnvelope, type CollaborationOperation, type JsonObject, type OperationResult, type SnapshotMessage } from '@collabhub/protocol'
import { StrategyRegistry, type DomainPack } from '@collabhub/strategy-sdk'
import { operationFingerprint } from './identity.js'
import type { CommitStore, ConnectionContext, OwnerRecord, OwnershipCoordinator, RoomIdentity } from './types.js'

interface WarmRoom<TState extends JsonObject> {
  room: RoomIdentity
  owner: OwnerRecord
  schemaVersion: string
  version: number
  state: TState
  recentOperations: CollaborationOperation[]
  queued: number
  serial: Promise<unknown>
  lastAccessAt: number
}

export interface RoomWorkerOptions<TState extends JsonObject> {
  instanceId: string
  internalUrl: string
  port: number
  internalToken: string
  store: CommitStore<TState>
  coordinator: OwnershipCoordinator
  domainPack: DomainPack<TState>
  snapshotInterval?: number
  maxRecoveryGap?: number
  maxMailbox?: number
  maxWarmRooms?: number
  idleRoomMs?: number
}

export class DistributedRoomWorker<TState extends JsonObject> {
  private readonly sessions = new Map<string, WarmRoom<TState>>()
  private readonly activating = new Map<string, Promise<WarmRoom<TState>>>()
  private readonly registry: StrategyRegistry<TState>
  private server?: Server
  private unregisterWorker?: () => Promise<void>
  private maintenanceTimer?: ReturnType<typeof setInterval>
  private outboxTimer?: ReturnType<typeof setInterval>
  private dispatching = false

  constructor(private readonly options: RoomWorkerOptions<TState>) {
    this.registry = new StrategyRegistry(options.domainPack.strategies)
  }

  async start(): Promise<void> {
    await this.options.store.migrate()
    this.unregisterWorker = await this.options.coordinator.registerWorker(this.options.instanceId, this.options.internalUrl)
    const app = express()
    app.use(express.json({ limit: '128kb' }))
    app.use((request, response, next) => {
      if (request.path === '/healthz' || request.path === '/readyz' || request.path === '/metrics') return next()
      if (request.header('x-collabhub-internal-token') !== this.options.internalToken) return response.status(401).json({ error: 'unauthorized' })
      next()
    })
    app.get('/healthz', (_request, response) => response.json({ ok: true, role: 'worker', instanceId: this.options.instanceId }))
    app.get('/readyz', async (_request, response) => {
      try {
        await Promise.all([this.options.store.ping(), this.options.coordinator.ping()])
        response.json({ ready: true, warmRooms: this.sessions.size })
      } catch (error) { response.status(503).json({ ready: false, error: String(error) }) }
    })
    app.get('/metrics', (_request, response) => response.type('text/plain').send([
      `collabhub_worker_warm_rooms ${this.sessions.size}`,
      `collabhub_worker_mailbox_depth ${[...this.sessions.values()].reduce((sum, session) => sum + session.queued, 0)}`,
      `collabhub_worker_process_rss_bytes ${process.memoryUsage().rss}`,
    ].join('\n') + '\n'))
    app.post('/internal/activate', async (request, response) => {
      try {
        const room = this.parseRoom(request.body)
        const session = await this.activate(room)
        response.json({ owner: session.owner, snapshot: this.snapshotOf(session) })
      } catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : String(error) }) }
    })
    app.post('/internal/submit', async (request, response) => {
      try {
        const context = request.body?.context as ConnectionContext
        const operation = request.body?.operation as CollaborationOperation
        response.json(await this.submit(context, operation))
      } catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }) }
    })
    app.post('/internal/snapshot', async (request, response) => {
      try { response.json(await this.snapshot(this.parseRoom(request.body))) }
      catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : String(error) }) }
    })
    this.server = createServer(app)
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.options.port, '0.0.0.0', resolve)
    })
    this.maintenanceTimer = setInterval(() => { void this.maintainSessions() }, 3000)
    this.maintenanceTimer.unref()
    this.outboxTimer = setInterval(() => { void this.dispatchOutbox() }, 100)
    this.outboxTimer.unref()
  }

  async close(): Promise<void> {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer)
    if (this.outboxTimer) clearInterval(this.outboxTimer)
    for (const session of this.sessions.values()) await this.options.coordinator.releaseOwner(session.room, session.owner).catch(() => undefined)
    if (this.unregisterWorker) await this.unregisterWorker().catch(() => undefined)
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()))
  }

  async activate(room: RoomIdentity): Promise<WarmRoom<TState>> {
    const key = this.key(room)
    const current = this.sessions.get(key)
    if (current) { current.lastAccessAt = Date.now(); return current }
    const inFlight = this.activating.get(key)
    if (inFlight) return inFlight
    const activation = this.doActivate(room).finally(() => this.activating.delete(key))
    this.activating.set(key, activation)
    return activation
  }

  async submit(context: ConnectionContext, operation: CollaborationOperation): Promise<OperationResult> {
    this.assertBoundIdentity(context, operation)
    const session = await this.activate(context)
    if (session.queued >= (this.options.maxMailbox ?? 256)) {
      return { kind: 'retryLater', operationId: operation.operationId, canonicalVersion: session.version, retryAfterMs: 100, reason: 'backpressure' }
    }
    session.queued++
    const task = session.serial.then(() => this.process(session, operation), () => this.process(session, operation))
    session.serial = task.catch(() => undefined)
    try { return await task } finally { session.queued--; session.lastAccessAt = Date.now() }
  }

  async snapshot(room: RoomIdentity): Promise<SnapshotMessage<TState>> {
    const session = await this.activate(room)
    await session.serial
    return this.snapshotOf(session)
  }

  private async doActivate(room: RoomIdentity): Promise<WarmRoom<TState>> {
    if (this.sessions.size >= (this.options.maxWarmRooms ?? 1000)) await this.evictOldest()
    await this.options.store.ensureDocument(room, this.options.domainPack.schemaVersion, this.options.domainPack.initialState(room.documentId))
    const epoch = await this.options.store.claimOwnership(room, this.options.instanceId)
    const loaded = await this.options.store.loadRoom(room)
    let state = loaded.state
    for (const entry of loaded.wal) state = applyCanonicalPatches(state, entry.patches)
    const owner: OwnerRecord = { instanceId: this.options.instanceId, internalUrl: this.options.internalUrl, epoch }
    const session: WarmRoom<TState> = {
      room: { tenantId: room.tenantId, documentId: room.documentId }, owner,
      schemaVersion: loaded.schemaVersion, version: loaded.version, state,
      recentOperations: loaded.wal.slice(-500).map((entry) => entry.operation),
      queued: 0, serial: Promise.resolve(), lastAccessAt: Date.now(),
    }
    this.sessions.set(this.key(room), session)
    await this.options.coordinator.publishOwner(room, owner)
    return session
  }

  private async process(session: WarmRoom<TState>, operation: CollaborationOperation): Promise<OperationResult> {
    try { assertOperationEnvelope(operation) }
    catch (error) { return this.rejected(operation?.operationId ?? 'unknown', session.version, 'invalidOperation', String(error)) }
    const fingerprint = operationFingerprint(operation)
    const prior = await this.options.store.lookupReceipt(session.room, operation.operationId)
    if (prior) {
      if (prior.fingerprint !== fingerprint) return this.rejected(operation.operationId, session.version, 'invalidOperation', 'operationId was reused with another payload')
      return prior.result.kind === 'accepted' ? { ...prior.result, duplicate: true } : prior.result
    }
    if (operation.schemaVersion !== session.schemaVersion) {
      return { kind: 'resyncRequired', operationId: operation.operationId, canonicalVersion: session.version, snapshotRef: this.snapshotRef(session), reason: 'schema version mismatch' }
    }
    if (session.version - operation.baseVersion > (this.options.maxRecoveryGap ?? 1000)) {
      return { kind: 'resyncRequired', operationId: operation.operationId, canonicalVersion: session.version, snapshotRef: this.snapshotRef(session), reason: 'client is outside the recovery window' }
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const strategy = this.registry.resolve(operation)
      if (!strategy) return this.persistRejection(session, fingerprint, this.rejected(operation.operationId, session.version, 'invalidOperation', 'unsupported strategy or operation type'))
      let resolution
      try {
        resolution = strategy.resolve({
          currentVersion: session.version, currentState: session.state, operation,
          concurrentOperations: session.recentOperations.filter((candidate) => candidate.baseVersion >= operation.baseVersion),
        })
      } catch (error) {
        return this.persistRejection(session, fingerprint, this.rejected(operation.operationId, session.version, 'strategyFailure', error instanceof Error ? error.message : String(error)))
      }
      if (resolution.kind === 'reject') {
        const result: OperationResult = { kind: 'rejected', operationId: operation.operationId, canonicalVersion: session.version, reason: resolution.reason, correctivePatches: resolution.correctivePatches }
        return this.persistRejection(session, fingerprint, result)
      }
      if (resolution.kind === 'resync') {
        return { kind: 'resyncRequired', operationId: operation.operationId, canonicalVersion: session.version, snapshotRef: this.snapshotRef(session), reason: resolution.reason }
      }
      const nextState = applyCanonicalPatches(session.state, resolution.patches)
      for (const invariant of this.options.domainPack.invariants ?? []) {
        const verdict = invariant.check(nextState, operation)
        if (verdict !== true) return this.persistRejection(session, fingerprint, this.rejected(operation.operationId, session.version, 'invariantViolation', `${invariant.id}: ${verdict}`))
      }
      const outcome = await this.options.store.commit({
        ...session.room, ownerEpoch: session.owner.epoch, ownerInstanceId: session.owner.instanceId,
        resolvedAtVersion: session.version, operation, patches: resolution.patches, fingerprint,
      })
      if (outcome.kind === 'committed') {
        session.state = nextState
        session.version = outcome.result.canonicalVersion
        session.recentOperations.push(operation)
        if (session.recentOperations.length > 500) session.recentOperations.shift()
        if (session.version % (this.options.snapshotInterval ?? 100) === 0) {
          void this.options.store.saveSnapshot(session.room, session.version, session.schemaVersion, session.state).catch(() => undefined)
        }
        return outcome.result
      }
      if (outcome.kind === 'duplicate') return outcome.result
      if (outcome.kind === 'collision') return this.rejected(operation.operationId, outcome.canonicalVersion, 'invalidOperation', 'operationId was reused with another payload')
      if (outcome.kind === 'fenced') {
        this.sessions.delete(this.key(session.room))
        return { kind: 'retryLater', operationId: operation.operationId, canonicalVersion: outcome.canonicalVersion, retryAfterMs: 100, reason: 'ownerChanging' }
      }
      await this.reload(session)
    }
    return { kind: 'retryLater', operationId: operation.operationId, canonicalVersion: session.version, retryAfterMs: 50, reason: 'temporarilyUnavailable' }
  }

  private async reload(session: WarmRoom<TState>): Promise<void> {
    const loaded = await this.options.store.loadRoom(session.room)
    let state = loaded.state
    for (const entry of loaded.wal) state = applyCanonicalPatches(state, entry.patches)
    session.state = state
    session.version = loaded.version
    session.recentOperations = loaded.wal.slice(-500).map((entry) => entry.operation)
  }

  private async persistRejection(session: WarmRoom<TState>, fingerprint: string, result: OperationResult): Promise<OperationResult> {
    const stored = await this.options.store.recordReceipt(session.room, { epoch: session.owner.epoch, instanceId: session.owner.instanceId }, fingerprint, result)
    if (stored === 'fenced') {
      this.sessions.delete(this.key(session.room))
      return { kind: 'retryLater', operationId: result.operationId, canonicalVersion: session.version, retryAfterMs: 100, reason: 'ownerChanging' }
    }
    if (stored === 'exists') {
      const prior = await this.options.store.lookupReceipt(session.room, result.operationId)
      if (prior?.fingerprint === fingerprint) return prior.result
      return this.rejected(result.operationId, session.version, 'invalidOperation', 'operationId was reused with another payload')
    }
    return result
  }

  private async dispatchOutbox(): Promise<void> {
    if (this.dispatching) return
    this.dispatching = true
    try {
      for (const item of await this.options.store.claimOutbox(this.options.instanceId, 100)) {
        try {
          await this.options.coordinator.publishEvent(item.event)
          await this.options.store.markOutboxDelivered(item.id)
        } catch { /* lease expiry lets another dispatcher retry */ }
      }
    } finally { this.dispatching = false }
  }

  private async maintainSessions(): Promise<void> {
    const now = Date.now()
    for (const [key, session] of this.sessions) {
      if (now - session.lastAccessAt > (this.options.idleRoomMs ?? 60_000) && session.queued === 0) {
        this.sessions.delete(key)
        await this.options.coordinator.releaseOwner(session.room, session.owner).catch(() => undefined)
        continue
      }
      const renewed = await this.options.coordinator.renewOwner(session.room, session.owner).catch(() => false)
      if (!renewed) this.sessions.delete(key)
    }
  }

  private async evictOldest(): Promise<void> {
    const oldest = [...this.sessions.values()].filter((session) => session.queued === 0).sort((a, b) => a.lastAccessAt - b.lastAccessAt)[0]
    if (!oldest) throw new Error('all room mailboxes are busy')
    this.sessions.delete(this.key(oldest.room))
    await this.options.coordinator.releaseOwner(oldest.room, oldest.owner).catch(() => undefined)
  }

  private snapshotOf(session: WarmRoom<TState>): SnapshotMessage<TState> {
    return {
      kind: 'snapshot', ...session.room, canonicalVersion: session.version, schemaVersion: session.schemaVersion,
      snapshot: session.state, snapshotRef: this.snapshotRef(session),
    }
  }

  private snapshotRef(session: WarmRoom<TState>): string {
    return `pg://${encodeURIComponent(session.room.tenantId)}/${encodeURIComponent(session.room.documentId)}/${session.version}`
  }

  private assertBoundIdentity(context: ConnectionContext, operation: CollaborationOperation): void {
    if (!context || !operation) throw new Error('context and operation are required')
    for (const key of ['tenantId', 'documentId', 'actorId', 'clientId'] as const) {
      if (context[key] !== operation[key]) throw new Error(`${key} does not match the bound connection`)
    }
  }

  private parseRoom(value: unknown): RoomIdentity {
    const body = value as Partial<RoomIdentity>
    if (!body || typeof body.tenantId !== 'string' || !body.tenantId || typeof body.documentId !== 'string' || !body.documentId) throw new Error('tenantId and documentId are required')
    return { tenantId: body.tenantId, documentId: body.documentId }
  }

  private rejected(operationId: string, canonicalVersion: number, code: 'invalidOperation' | 'strategyFailure' | 'invariantViolation', message: string): OperationResult {
    return { kind: 'rejected', operationId, canonicalVersion, reason: { code, message } }
  }

  private key(room: RoomIdentity): string { return `${room.tenantId}\u0000${room.documentId}` }
}
