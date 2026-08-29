import { createServer, type Server } from 'node:http'
import express from 'express'
import { applyCanonicalPatches } from '@collabhub/domain-json'
import { assertOperationEnvelope, type CollaborationOperation, type JsonObject, type OperationResult, type SnapshotMessage } from '@collabhub/protocol'
import {
  AuthoritativeOperationPipeline,
  planRoomEvictions,
  resolveRoomCachePolicy,
  type OperationPipelineHook,
  type RoomCachePolicy,
  type RoomEvictionDecision,
} from '@collabhub/server-core'
import { migrateDomainState, type CommittedOperation, type DomainPack } from '@collabhub/strategy-sdk'
import { operationFingerprint } from './identity.js'
import type { CommitStore, ConnectionContext, DurableRetentionPolicy, OwnerRecord, OwnershipCoordinator, RoomIdentity } from './types.js'

interface WarmRoom<TState extends JsonObject> {
  room: RoomIdentity
  owner: OwnerRecord
  schemaVersion: string
  version: number
  state: TState
  recentOperations: CommittedOperation[]
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
  roomCachePolicy?: Partial<RoomCachePolicy>
  /** @deprecated Use roomCachePolicy.maxWarmRooms. */
  maxWarmRooms?: number
  /** @deprecated Use roomCachePolicy.idleTtlMs. */
  idleRoomMs?: number
  clock?: () => number
  hooks?: readonly OperationPipelineHook<TState>[]
  retentionPolicy?: Partial<DurableRetentionPolicy> & { compactionIntervalMs?: number }
  maxPayloadBytes?: number
}

const DEFAULT_RETENTION_POLICY: DurableRetentionPolicy & { compactionIntervalMs: number } = {
  walVersions: 1000,
  receiptTtlMs: 7 * 24 * 60 * 60 * 1000,
  deliveredOutboxTtlMs: 24 * 60 * 60 * 1000,
  snapshotsPerDocument: 3,
  compactionIntervalMs: 10 * 60 * 1000,
}

export class DistributedRoomWorker<TState extends JsonObject> {
  private readonly sessions = new Map<string, WarmRoom<TState>>()
  private readonly activating = new Map<string, Promise<WarmRoom<TState>>>()
  private readonly pipeline: AuthoritativeOperationPipeline<TState>
  private readonly cachePolicy: RoomCachePolicy
  private readonly retentionPolicy: DurableRetentionPolicy & { compactionIntervalMs: number }
  private server?: Server
  private unregisterWorker?: () => Promise<void>
  private maintenanceTimer?: ReturnType<typeof setInterval>
  private outboxTimer?: ReturnType<typeof setInterval>
  private dispatching = false
  private compacting = false
  private draining = false
  private lastCompactionAt = 0
  private readonly metrics = {
    schemaMigrations: 0,
    schemaMigrationFailures: 0,
    compactionRuns: 0,
    compactionFailures: 0,
    walDeleted: 0,
    receiptsDeleted: 0,
    outboxDeleted: 0,
    snapshotsDeleted: 0,
  }

  constructor(private readonly options: RoomWorkerOptions<TState>) {
    this.pipeline = new AuthoritativeOperationPipeline(options)
    this.cachePolicy = resolveRoomCachePolicy({
      idleTtlMs: options.roomCachePolicy?.idleTtlMs ?? options.idleRoomMs ?? 60_000,
      maxWarmRooms: options.roomCachePolicy?.maxWarmRooms ?? options.maxWarmRooms ?? 1000,
      scanIntervalMs: options.roomCachePolicy?.scanIntervalMs ?? 3000,
    })
    this.retentionPolicy = {
      ...DEFAULT_RETENTION_POLICY,
      ...options.retentionPolicy,
    }
    for (const [name, value] of Object.entries(this.retentionPolicy)) {
      if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative finite number`)
    }
    if (this.retentionPolicy.snapshotsPerDocument < 1) throw new Error('snapshotsPerDocument must be at least 1')
  }

  get warmRoomCount(): number { return this.sessions.size }

  async start(): Promise<void> {
    await this.options.store.migrate()
    this.unregisterWorker = await this.options.coordinator.registerWorker(this.options.instanceId, this.options.internalUrl)
    const app = express()
    app.use(express.json({ limit: this.options.maxPayloadBytes ?? 128 * 1024 }))
    app.use((request, response, next) => {
      if (request.path === '/healthz' || request.path === '/readyz') return next()
      if (this.draining) return response.status(503).json({ error: 'draining' })
      if (request.header('x-collabhub-internal-token') !== this.options.internalToken) return response.status(401).json({ error: 'unauthorized' })
      next()
    })
    app.get('/healthz', (_request, response) => response.json({ ok: true, role: 'worker', instanceId: this.options.instanceId }))
    app.get('/readyz', async (_request, response) => {
      if (this.draining) return response.status(503).json({ ready: false, draining: true })
      try {
        await Promise.all([this.options.store.ping(), this.options.coordinator.ping()])
        response.json({ ready: true, warmRooms: this.sessions.size })
      } catch (error) { response.status(503).json({ ready: false, error: String(error) }) }
    })
    app.get('/metrics', (_request, response) => response.type('text/plain').send([
      `collabhub_worker_warm_rooms ${this.sessions.size}`,
      `collabhub_worker_mailbox_depth ${[...this.sessions.values()].reduce((sum, session) => sum + session.queued, 0)}`,
      `collabhub_worker_process_rss_bytes ${process.memoryUsage().rss}`,
      `collabhub_worker_schema_migrations_total ${this.metrics.schemaMigrations}`,
      `collabhub_worker_schema_migration_failures_total ${this.metrics.schemaMigrationFailures}`,
      `collabhub_worker_compaction_runs_total ${this.metrics.compactionRuns}`,
      `collabhub_worker_compaction_failures_total ${this.metrics.compactionFailures}`,
      `collabhub_worker_compaction_wal_deleted_total ${this.metrics.walDeleted}`,
      `collabhub_worker_compaction_receipts_deleted_total ${this.metrics.receiptsDeleted}`,
      `collabhub_worker_compaction_outbox_deleted_total ${this.metrics.outboxDeleted}`,
      `collabhub_worker_compaction_snapshots_deleted_total ${this.metrics.snapshotsDeleted}`,
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
    this.maintenanceTimer = setInterval(() => { void this.maintainSessions() }, this.cachePolicy.scanIntervalMs)
    this.maintenanceTimer.unref()
    this.outboxTimer = setInterval(() => { void this.dispatchOutbox() }, 100)
    this.outboxTimer.unref()
  }

  async close(): Promise<void> {
    this.draining = true
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer)
    if (this.outboxTimer) clearInterval(this.outboxTimer)
    const serverClosed = this.server
      ? new Promise<void>((resolve) => {
          this.server!.close(() => resolve())
          this.server!.closeIdleConnections?.()
        })
      : Promise.resolve()
    for (const session of this.sessions.values()) {
      await session.serial.catch(() => undefined)
      await this.options.store.saveSnapshot(session.room, session.version, session.schemaVersion, session.state).catch(() => undefined)
      await this.options.coordinator.releaseOwner(session.room, session.owner).catch(() => undefined)
    }
    this.sessions.clear()
    if (this.unregisterWorker) await this.unregisterWorker().catch(() => undefined)
    await serverClosed
  }

  async activate(room: RoomIdentity): Promise<WarmRoom<TState>> {
    const key = this.key(room)
    const current = this.sessions.get(key)
    if (current) { current.lastAccessAt = this.now(); return current }
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
    try { return await task } finally { session.queued--; session.lastAccessAt = this.now() }
  }

  async snapshot(room: RoomIdentity): Promise<SnapshotMessage<TState>> {
    const session = await this.activate(room)
    await session.serial
    return this.snapshotOf(session)
  }

  private async doActivate(room: RoomIdentity): Promise<WarmRoom<TState>> {
    if (this.sessions.size >= this.cachePolicy.maxWarmRooms) await this.evictOldest()
    await this.options.store.ensureDocument(room, this.options.domainPack.schemaVersion, this.options.domainPack.initialState(room.documentId))
    const epoch = await this.options.store.claimOwnership(room, this.options.instanceId)
    const loaded = await this.options.store.loadRoom(room)
    let state = loaded.state
    for (const entry of loaded.wal) state = applyCanonicalPatches(state, entry.patches)
    const owner: OwnerRecord = { instanceId: this.options.instanceId, internalUrl: this.options.internalUrl, epoch }
    let schemaVersion = loaded.schemaVersion
    let recentOperations = loaded.wal.slice(-500).map((entry) => ({ canonicalVersion: entry.version, operation: entry.operation }))
    if (schemaVersion !== this.options.domainPack.schemaVersion) {
      try {
        const migrated = migrateDomainState(this.options.domainPack, schemaVersion, state)
        const outcome = await this.options.store.migrateDocument({
          ...room,
          ownerEpoch: epoch,
          ownerInstanceId: this.options.instanceId,
          version: loaded.version,
          fromSchemaVersion: schemaVersion,
          toSchemaVersion: migrated.schemaVersion,
          state: migrated.state,
          applied: migrated.applied,
        })
        if (outcome.kind === 'fenced') throw new Error('room ownership changed during schema migration')
        if (outcome.kind === 'versionConflict') {
          throw new Error(`room changed during schema migration: version=${outcome.canonicalVersion} schema=${outcome.schemaVersion}`)
        }
        state = migrated.state
        schemaVersion = migrated.schemaVersion
        recentOperations = []
        if (outcome.kind === 'migrated') this.metrics.schemaMigrations++
      } catch (error) {
        this.metrics.schemaMigrationFailures++
        await this.options.coordinator.releaseOwner(room, owner).catch(() => undefined)
        throw error
      }
    }
    const session: WarmRoom<TState> = {
      room: { tenantId: room.tenantId, documentId: room.documentId }, owner,
      schemaVersion, version: loaded.version, state, recentOperations,
      queued: 0, serial: Promise.resolve(), lastAccessAt: this.now(),
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
    for (let attempt = 0; attempt < 2; attempt++) {
      const prepared = await this.pipeline.prepare({
        operation,
        state: session.state,
        currentVersion: session.version,
        committedOperations: session.recentOperations,
        snapshotRef: this.snapshotRef(session),
      })
      if (prepared.kind === 'rejected') return this.persistRejection(session, fingerprint, prepared)
      if (prepared.kind === 'resyncRequired') return prepared
      const outcome = await this.options.store.commit({
        ...session.room, ownerEpoch: session.owner.epoch, ownerInstanceId: session.owner.instanceId,
        resolvedAtVersion: prepared.resolvedAtVersion, operation, patches: prepared.patches, fingerprint,
      })
      if (outcome.kind === 'committed') {
        session.state = prepared.nextState
        session.version = outcome.result.canonicalVersion
        session.recentOperations.push({ canonicalVersion: session.version, operation })
        if (session.recentOperations.length > 500) session.recentOperations.shift()
        if (session.version % (this.options.snapshotInterval ?? 100) === 0) {
          void this.options.store.saveSnapshot(session.room, session.version, session.schemaVersion, session.state).catch(() => undefined)
        }
        try { await this.pipeline.afterCommit(prepared, session.state) } catch { /* commit is already durable */ }
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
    session.recentOperations = loaded.wal.slice(-500).map((entry) => ({ canonicalVersion: entry.version, operation: entry.operation }))
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
    await this.sweepRooms(this.now())
    for (const [key, session] of this.sessions) {
      const renewed = await this.options.coordinator.renewOwner(session.room, session.owner).catch(() => false)
      if (!renewed) this.sessions.delete(key)
    }
    if (this.now() - this.lastCompactionAt >= this.retentionPolicy.compactionIntervalMs) void this.compactDurableData()
  }

  async compactDurableData(): Promise<void> {
    if (this.compacting) return
    this.compacting = true
    this.lastCompactionAt = this.now()
    try {
      const result = await this.options.store.compact(this.retentionPolicy)
      if (!result.acquired) return
      this.metrics.compactionRuns++
      this.metrics.walDeleted += result.walDeleted
      this.metrics.receiptsDeleted += result.receiptsDeleted
      this.metrics.outboxDeleted += result.outboxDeleted
      this.metrics.snapshotsDeleted += result.snapshotsDeleted
    } catch (error) {
      this.metrics.compactionFailures++
      console.error(JSON.stringify({ level: 'error', message: 'durable compaction failed', error: error instanceof Error ? error.message : String(error) }))
    } finally { this.compacting = false }
  }

  async sweepRooms(now = this.now()): Promise<{ evicted: RoomEvictionDecision[]; warmRooms: number }> {
    const decisions = planRoomEvictions([...this.sessions.entries()].map(([key, session]) => ({
      key,
      lastAccessAt: session.lastAccessAt,
      activeConnections: 0,
      queuedOperations: session.queued,
    })), this.cachePolicy, now)
    const evicted: RoomEvictionDecision[] = []
    for (const decision of decisions) {
      const session = this.sessions.get(decision.key)
      if (session && await this.evictSession(session)) evicted.push(decision)
    }
    return { evicted, warmRooms: this.sessions.size }
  }

  private async evictOldest(): Promise<void> {
    const oldest = [...this.sessions.values()].filter((session) => session.queued === 0).sort((a, b) => a.lastAccessAt - b.lastAccessAt)[0]
    if (!oldest) throw new Error('all room mailboxes are busy')
    if (!await this.evictSession(oldest)) throw new Error('oldest room became busy during eviction')
  }

  private async evictSession(session: WarmRoom<TState>): Promise<boolean> {
    const key = this.key(session.room)
    if (this.sessions.get(key) !== session || session.queued > 0) return false
    await session.serial
    if (this.sessions.get(key) !== session || session.queued > 0) return false
    await this.options.store.saveSnapshot(session.room, session.version, session.schemaVersion, session.state)
    if (this.sessions.get(key) !== session || session.queued > 0) return false
    this.sessions.delete(key)
    await this.options.coordinator.releaseOwner(session.room, session.owner).catch(() => undefined)
    return true
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
  private now(): number { return this.options.clock?.() ?? Date.now() }
}
