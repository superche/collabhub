import { applyCanonicalPatches } from '@collabhub/domain-json'
import {
  assertOperationEnvelope,
  type CanonicalEvent,
  type CanonicalPatch,
  type CollaborationOperation,
  type JsonObject,
  type OperationResult,
  type SnapshotMessage,
} from '@collabhub/protocol'
import {
  StrategyRegistry,
  type CommittedOperation,
  type DomainPack,
  type ResolveResult,
} from '@collabhub/strategy-sdk'

export interface StoredSnapshot<TState extends JsonObject = JsonObject> {
  tenantId: string
  documentId: string
  version: number
  schemaVersion: string
  state: TState
  snapshotRef: string
}

export interface WalRecord {
  tenantId: string
  documentId: string
  version: number
  operation: CollaborationOperation
  patches: CanonicalPatch[]
  committedAt: string
}

export interface StorageAdapter<TState extends JsonObject = JsonObject> {
  loadSnapshot(tenantId: string, documentId: string): Promise<StoredSnapshot<TState> | undefined>
  loadWal(tenantId: string, documentId: string, afterVersion: number): Promise<WalRecord[]>
  appendWal(record: WalRecord): Promise<void>
  saveSnapshot(snapshot: StoredSnapshot<TState>): Promise<void>
  /** Optional because durable production stores normally retain cold room data. */
  deleteDocument?(tenantId: string, documentId: string): Promise<void>
}

export class InMemoryStorageAdapter<TState extends JsonObject = JsonObject> implements StorageAdapter<TState> {
  private readonly snapshots = new Map<string, StoredSnapshot<TState>>()
  private readonly wal = new Map<string, WalRecord[]>()
  private key(tenantId: string, documentId: string) { return `${tenantId}\u0000${documentId}` }

  async loadSnapshot(tenantId: string, documentId: string) {
    return this.snapshots.get(this.key(tenantId, documentId))
  }
  async loadWal(tenantId: string, documentId: string, afterVersion: number) {
    return (this.wal.get(this.key(tenantId, documentId)) ?? []).filter((record) => record.version > afterVersion)
  }
  async appendWal(record: WalRecord) {
    const key = this.key(record.tenantId, record.documentId)
    this.wal.set(key, [...(this.wal.get(key) ?? []), record])
  }
  async saveSnapshot(snapshot: StoredSnapshot<TState>) {
    this.snapshots.set(this.key(snapshot.tenantId, snapshot.documentId), snapshot)
  }
  async deleteDocument(tenantId: string, documentId: string) {
    const key = this.key(tenantId, documentId)
    this.snapshots.delete(key)
    this.wal.delete(key)
  }
}

export interface RoomCachePolicy {
  idleTtlMs: number
  maxWarmRooms: number
  scanIntervalMs: number
}

export const DEFAULT_ROOM_CACHE_POLICY: Readonly<RoomCachePolicy> = {
  idleTtlMs: 60_000,
  maxWarmRooms: 1000,
  scanIntervalMs: 3000,
}

export type RoomDataRetention = 'retain' | 'delete'

export interface RoomCacheEntry {
  key: string
  lastAccessAt: number
  activeConnections: number
  queuedOperations: number
}

export interface RoomEvictionDecision {
  key: string
  reason: 'idle' | 'capacity'
}

export function resolveRoomCachePolicy(
  input: Partial<RoomCachePolicy> = {},
  defaults: Readonly<RoomCachePolicy> = DEFAULT_ROOM_CACHE_POLICY,
): RoomCachePolicy {
  const policy = { ...defaults, ...input }
  for (const [key, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`)
  }
  return policy
}

/** Shared TTL/LRU selection; persistence and ownership release stay runtime-specific. */
export function planRoomEvictions(
  entries: readonly RoomCacheEntry[],
  policy: Pick<RoomCachePolicy, 'idleTtlMs' | 'maxWarmRooms'>,
  now: number,
): RoomEvictionDecision[] {
  const evictable = entries
    .filter((entry) => entry.activeConnections === 0 && entry.queuedOperations === 0)
    .sort((left, right) => left.lastAccessAt - right.lastAccessAt || left.key.localeCompare(right.key))
  const decisions: RoomEvictionDecision[] = []
  const selected = new Set<string>()
  for (const entry of evictable) {
    if (now - entry.lastAccessAt < policy.idleTtlMs) continue
    decisions.push({ key: entry.key, reason: 'idle' })
    selected.add(entry.key)
  }
  let remaining = entries.length - decisions.length
  for (const entry of evictable) {
    if (remaining <= policy.maxWarmRooms) break
    if (selected.has(entry.key)) continue
    decisions.push({ key: entry.key, reason: 'capacity' })
    remaining--
  }
  return decisions
}

export type PipelineStage = 'authenticate' | 'authorize' | 'schemaValidate' | 'normalize' | 'beforeResolve' | 'invariantCheck' | 'beforeCommit' | 'afterCommit'

export interface PipelineContext<TState extends JsonObject = JsonObject> {
  operation: CollaborationOperation
  state: Readonly<TState>
  currentVersion: number
  result?: ResolveResult
}

export interface OperationPipelineHook<TState extends JsonObject = JsonObject> {
  readonly stage: PipelineStage
  run(context: PipelineContext<TState>): void | Promise<void>
}

export interface PrepareOperationInput<TState extends JsonObject = JsonObject> {
  operation: CollaborationOperation
  state: TState
  currentVersion: number
  committedOperations: readonly CommittedOperation[]
  snapshotRef: string
}

export interface PreparedOperation<TState extends JsonObject = JsonObject> {
  kind: 'prepared'
  operation: CollaborationOperation
  resolvedAtVersion: number
  patches: CanonicalPatch[]
  nextState: TState
  context: PipelineContext<TState>
}

export type PrepareOperationResult<TState extends JsonObject = JsonObject> =
  | PreparedOperation<TState>
  | Extract<OperationResult, { kind: 'rejected' | 'resyncRequired' }>

export interface AuthoritativeOperationPipelineOptions<TState extends JsonObject = JsonObject> {
  domainPack: DomainPack<TState>
  maxRecoveryGap?: number
  hooks?: readonly OperationPipelineHook<TState>[]
}

/** Shared operation semantics used by standalone sessions and distributed workers. */
export class AuthoritativeOperationPipeline<TState extends JsonObject = JsonObject> {
  private readonly registry: StrategyRegistry<TState>

  constructor(private readonly options: AuthoritativeOperationPipelineOptions<TState>) {
    this.registry = new StrategyRegistry(options.domainPack.strategies)
  }

  async prepare(input: PrepareOperationInput<TState>): Promise<PrepareOperationResult<TState>> {
    const { operation, state, currentVersion, snapshotRef } = input
    const context: PipelineContext<TState> = { operation, state, currentVersion }
    try {
      for (const stage of ['authenticate', 'authorize'] as const) await this.runHooks(stage, context)
      if (operation.schemaVersion !== this.options.domainPack.schemaVersion) {
        return this.resync(operation, currentVersion, snapshotRef, `schema ${operation.schemaVersion} is not supported`)
      }
      await this.runHooks('schemaValidate', context)
      await this.runHooks('normalize', context)
      if (operation.baseVersion > currentVersion) {
        return this.resync(operation, currentVersion, snapshotRef, `submitted version ${operation.baseVersion} is ahead of canonical version ${currentVersion}`)
      }

      const committedOperations = [...input.committedOperations].sort((a, b) => a.canonicalVersion - b.canonicalVersion)
      const earliestAvailableVersion = committedOperations[0]?.canonicalVersion ?? currentVersion + 1
      const historyComplete = operation.baseVersion >= earliestAvailableVersion - 1
      const concurrentOperations = committedOperations.filter((entry) => entry.canonicalVersion > operation.baseVersion)
      const versionGap = currentVersion - operation.baseVersion
      const recoveryWindowExceeded = versionGap > (this.options.maxRecoveryGap ?? 100)

      if (versionGap > 0) {
        const decision = this.options.domainPack.operationVersionPolicy?.decide({
          currentVersion,
          submittedVersion: operation.baseVersion,
          versionGap,
          recoveryWindowExceeded,
          currentState: state,
          operation,
          concurrentOperations,
          historyComplete,
        }) ?? (recoveryWindowExceeded || !historyComplete
          ? { kind: 'resync' as const, reason: 'client is outside the recoverable operation history' }
          : { kind: 'resolve' as const })
        if (decision.kind === 'reject') {
          return {
            kind: 'rejected', operationId: operation.operationId, canonicalVersion: currentVersion,
            reason: decision.reason, correctivePatches: decision.correctivePatches,
          }
        }
        if (decision.kind === 'resync') return this.resync(operation, currentVersion, snapshotRef, decision.reason)
      }

      await this.runHooks('beforeResolve', context)
      const strategy = this.registry.resolve(operation)
      if (!strategy) return this.rejected(operation, currentVersion, 'invalidOperation', `strategy ${operation.strategyId}@${operation.strategyVersion} does not support ${operation.operationType}`)
      const resolution = strategy.resolve({ currentVersion, currentState: state, operation, concurrentOperations, historyComplete })
      context.result = resolution
      if (resolution.kind === 'reject') {
        return {
          kind: 'rejected', operationId: operation.operationId, canonicalVersion: currentVersion,
          reason: resolution.reason, correctivePatches: resolution.correctivePatches,
        }
      }
      if (resolution.kind === 'resync') return this.resync(operation, currentVersion, snapshotRef, resolution.reason)
      await this.runHooks('invariantCheck', context)
      const nextState = applyCanonicalPatches(state, resolution.patches)
      for (const invariant of this.options.domainPack.invariants ?? []) {
        const verdict = invariant.check(nextState, operation)
        if (verdict !== true) return this.rejected(operation, currentVersion, 'invariantViolation', `${invariant.id}: ${verdict}`)
      }
      await this.runHooks('beforeCommit', { ...context, state: nextState })
      return { kind: 'prepared', operation, resolvedAtVersion: currentVersion, patches: resolution.patches, nextState, context }
    } catch (error) {
      return this.rejected(operation, currentVersion, 'strategyFailure', error instanceof Error ? error.message : String(error))
    }
  }

  async afterCommit(prepared: PreparedOperation<TState>, committedState: TState): Promise<void> {
    await this.runHooks('afterCommit', { ...prepared.context, state: committedState })
  }

  private rejected(
    operation: CollaborationOperation,
    canonicalVersion: number,
    code: 'invalidOperation' | 'invariantViolation' | 'strategyFailure',
    message: string,
  ): Extract<OperationResult, { kind: 'rejected' }> {
    return { kind: 'rejected', operationId: operation.operationId, canonicalVersion, reason: { code, message } }
  }

  private resync(
    operation: CollaborationOperation,
    canonicalVersion: number,
    snapshotRef: string,
    reason: string,
  ): Extract<OperationResult, { kind: 'resyncRequired' }> {
    return { kind: 'resyncRequired', operationId: operation.operationId, canonicalVersion, snapshotRef, reason }
  }

  private async runHooks(stage: PipelineStage, context: PipelineContext<TState>) {
    for (const hook of this.options.hooks ?? []) if (hook.stage === stage) await hook.run(context)
  }
}

export interface AuthoritativeSessionOptions<TState extends JsonObject> {
  tenantId: string
  documentId: string
  domainPack: DomainPack<TState>
  storage: StorageAdapter<TState>
  snapshotInterval?: number
  maxRecoveryGap?: number
  hooks?: readonly OperationPipelineHook<TState>[]
}

type CanonicalListener = (event: CanonicalEvent) => void

export class AuthoritativeDocumentSession<TState extends JsonObject = JsonObject> {
  private state!: TState
  private version = 0
  private readonly pipeline: AuthoritativeOperationPipeline<TState>
  private readonly results = new Map<string, OperationResult>()
  private readonly operations: CommittedOperation[] = []
  private readonly listeners = new Set<CanonicalListener>()
  private serial: Promise<unknown> = Promise.resolve()
  private initialized = false
  private initialization?: Promise<void>
  private queuedOperations = 0

  constructor(private readonly options: AuthoritativeSessionOptions<TState>) {
    this.pipeline = new AuthoritativeOperationPipeline(options)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initialization) return this.initialization
    this.initialization = this.load().finally(() => { this.initialization = undefined })
    return this.initialization
  }

  private async load(): Promise<void> {
    const snapshot = await this.options.storage.loadSnapshot(this.options.tenantId, this.options.documentId)
    this.state = snapshot?.state ?? this.options.domainPack.initialState(this.options.documentId)
    this.version = snapshot?.version ?? 0
    const wal = await this.options.storage.loadWal(this.options.tenantId, this.options.documentId, -1)
    for (const record of wal.sort((a, b) => a.version - b.version)) {
      if (record.version > this.version) {
        this.state = applyCanonicalPatches(this.state, record.patches)
        this.version = record.version
      }
      this.operations.push({ canonicalVersion: record.version, operation: record.operation })
      this.results.set(record.operation.operationId, {
        kind: 'accepted',
        operationId: record.operation.operationId,
        canonicalVersion: record.version,
        patches: record.patches,
      })
    }
    this.initialized = true
  }

  get canonicalVersion(): number { return this.version }
  get canonicalState(): Readonly<TState> { return this.state }
  get queuedOperationCount(): number { return this.queuedOperations }

  subscribe(listener: CanonicalListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot(): SnapshotMessage<TState> {
    return {
      kind: 'snapshot',
      tenantId: this.options.tenantId,
      documentId: this.options.documentId,
      canonicalVersion: this.version,
      schemaVersion: this.options.domainPack.schemaVersion,
      snapshot: this.state,
      snapshotRef: this.snapshotRef(),
    }
  }

  submit(operation: CollaborationOperation): Promise<OperationResult> {
    this.queuedOperations++
    const task = this.serial.then(() => this.process(operation), () => this.process(operation))
    this.serial = task.catch(() => undefined)
    return task.finally(() => { this.queuedOperations-- })
  }

  private async process(operation: CollaborationOperation): Promise<OperationResult> {
    await this.initialize()
    try {
      assertOperationEnvelope(operation)
    } catch (error) {
      return this.rejected(operation.operationId || 'unknown', 'invalidOperation', error instanceof Error ? error.message : String(error))
    }
    if (operation.tenantId !== this.options.tenantId || operation.documentId !== this.options.documentId) {
      return this.rejected(operation.operationId, 'invalidOperation', 'operation targets another document')
    }
    const prior = this.results.get(operation.operationId)
    if (prior) return prior.kind === 'accepted' ? { ...prior, duplicate: true } : prior
    const prepared = await this.pipeline.prepare({
      operation,
      state: this.state,
      currentVersion: this.version,
      committedOperations: this.operations,
      snapshotRef: this.snapshotRef(),
    })
    if (prepared.kind !== 'prepared') {
      if (prepared.kind === 'rejected') this.results.set(operation.operationId, prepared)
      return prepared
    }
    try {
      const nextVersion = this.version + 1
      const record: WalRecord = {
        tenantId: this.options.tenantId,
        documentId: this.options.documentId,
        version: nextVersion,
        operation,
        patches: prepared.patches,
        committedAt: new Date().toISOString(),
      }
      await this.options.storage.appendWal(record)
      this.state = prepared.nextState
      this.version = nextVersion
      this.operations.push({ canonicalVersion: nextVersion, operation })
      const result: OperationResult = { kind: 'accepted', operationId: operation.operationId, canonicalVersion: nextVersion, patches: prepared.patches }
      this.results.set(operation.operationId, result)
      const event: CanonicalEvent = { kind: 'canonical', operationId: operation.operationId, actorId: operation.actorId, canonicalVersion: nextVersion, patches: prepared.patches }
      // appendWal is the commit boundary. Post-commit failures cannot turn an
      // accepted operation into a rejection; durable recovery replays the WAL.
      try {
        if (nextVersion % (this.options.snapshotInterval ?? 25) === 0) await this.persistSnapshot()
        for (const listener of this.listeners) {
          try { listener(event) } catch { /* observer failure is post-commit */ }
        }
        await this.pipeline.afterCommit(prepared, this.state)
      } catch {
        // Distributed runtimes retry these effects through their outbox.
      }
      return result
    } catch (error) {
      return this.rejected(operation.operationId, 'strategyFailure', error instanceof Error ? error.message : String(error))
    }
  }

  async persistSnapshot(): Promise<void> {
    await this.initialize()
    await this.options.storage.saveSnapshot({
      tenantId: this.options.tenantId,
      documentId: this.options.documentId,
      version: this.version,
      schemaVersion: this.options.domainPack.schemaVersion,
      state: this.state,
      snapshotRef: this.snapshotRef(),
    })
  }

  private snapshotRef() { return `snapshot://${encodeURIComponent(this.options.tenantId)}/${encodeURIComponent(this.options.documentId)}/${this.version}` }
  private rejected(operationId: string, code: 'invalidOperation' | 'invariantViolation' | 'strategyFailure', message: string): OperationResult {
    return { kind: 'rejected', operationId, canonicalVersion: this.version, reason: { code, message } }
  }
}

export interface SessionFactoryOptions<TState extends JsonObject> {
  domainPack: DomainPack<TState>
  storage: StorageAdapter<TState>
  snapshotInterval?: number
  maxRecoveryGap?: number
  hooks?: readonly OperationPipelineHook<TState>[]
  /** Omit to preserve the legacy unbounded standalone cache. */
  roomCachePolicy?: Partial<RoomCachePolicy>
  /** Warm-room eviction and durable data retention are intentionally separate. */
  roomDataRetention?: RoomDataRetention
  clock?: () => number
}

export interface RoomSessionLease<TState extends JsonObject> {
  session: AuthoritativeDocumentSession<TState>
  release(): void
}

export interface WarmRoomStats {
  tenantId: string
  documentId: string
  activeConnections: number
  queuedOperations: number
  lastAccessAt: number
  evicting: boolean
}

export interface RoomSweepResult {
  evicted: RoomEvictionDecision[]
  warmRooms: number
}

interface ManagedDocumentSession<TState extends JsonObject> {
  tenantId: string
  documentId: string
  session: AuthoritativeDocumentSession<TState>
  activeConnections: number
  lastAccessAt: number
  initializing: boolean
  eviction?: Promise<boolean>
}

export class CollaborationServerCore<TState extends JsonObject = JsonObject> {
  private readonly sessions = new Map<string, ManagedDocumentSession<TState>>()
  private readonly cachePolicy?: RoomCachePolicy
  private readonly roomDataRetention: RoomDataRetention
  private maintenanceTimer?: ReturnType<typeof setInterval>
  private maintenance?: Promise<RoomSweepResult>

  constructor(private readonly options: SessionFactoryOptions<TState>) {
    this.cachePolicy = options.roomCachePolicy ? resolveRoomCachePolicy(options.roomCachePolicy) : undefined
    this.roomDataRetention = options.roomDataRetention ?? 'retain'
    if (this.roomDataRetention === 'delete' && !options.storage.deleteDocument) {
      throw new Error('roomDataRetention=delete requires StorageAdapter.deleteDocument')
    }
    if (this.cachePolicy) {
      this.maintenanceTimer = setInterval(() => { void this.sweepRooms().catch(() => undefined) }, this.cachePolicy.scanIntervalMs)
      ;(this.maintenanceTimer as unknown as { unref?: () => void }).unref?.()
    }
  }

  get warmRoomCount(): number { return this.sessions.size }

  warmRooms(): WarmRoomStats[] {
    return [...this.sessions.values()].map((entry) => ({
      tenantId: entry.tenantId,
      documentId: entry.documentId,
      activeConnections: entry.activeConnections,
      queuedOperations: entry.session.queuedOperationCount,
      lastAccessAt: entry.lastAccessAt,
      evicting: entry.eviction !== undefined,
    }))
  }

  async session(tenantId: string, documentId: string): Promise<AuthoritativeDocumentSession<TState>> {
    const key = this.key(tenantId, documentId)
    while (true) {
      let entry = this.sessions.get(key)
      if (entry?.eviction) {
        await entry.eviction
        continue
      }
      if (!entry) {
        if (this.cachePolicy && this.sessions.size >= this.cachePolicy.maxWarmRooms) {
          await this.runSweep(this.now(), Math.max(0, this.cachePolicy.maxWarmRooms - 1))
        }
        const session = new AuthoritativeDocumentSession({
          tenantId,
          documentId,
          domainPack: this.options.domainPack,
          storage: this.options.storage,
          snapshotInterval: this.options.snapshotInterval,
          maxRecoveryGap: this.options.maxRecoveryGap,
          hooks: this.options.hooks,
        })
        entry = { tenantId, documentId, session, activeConnections: 0, lastAccessAt: this.now(), initializing: true }
        this.sessions.set(key, entry)
      } else {
        entry.lastAccessAt = this.now()
      }
      try {
        await entry.session.initialize()
        entry.initializing = false
        return entry.session
      } catch (error) {
        if (this.sessions.get(key) === entry) this.sessions.delete(key)
        throw error
      }
    }
  }

  async acquireRoom(tenantId: string, documentId: string): Promise<RoomSessionLease<TState>> {
    const session = await this.session(tenantId, documentId)
    const key = this.key(tenantId, documentId)
    const entry = this.sessions.get(key)
    if (!entry || entry.session !== session) return this.acquireRoom(tenantId, documentId)
    entry.activeConnections++
    entry.lastAccessAt = this.now()
    let released = false
    return {
      session,
      release: () => {
        if (released) return
        released = true
        if (this.sessions.get(key) !== entry) return
        entry.activeConnections = Math.max(0, entry.activeConnections - 1)
        entry.lastAccessAt = this.now()
      },
    }
  }

  async sweepRooms(now = this.now()): Promise<RoomSweepResult> {
    if (!this.cachePolicy) return { evicted: [], warmRooms: this.sessions.size }
    if (this.maintenance) return this.maintenance
    this.maintenance = this.runSweep(now, this.cachePolicy.maxWarmRooms).finally(() => { this.maintenance = undefined })
    return this.maintenance
  }

  async close(): Promise<void> {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer)
    await this.maintenance?.catch(() => undefined)
    for (const entry of this.sessions.values()) await entry.session.persistSnapshot()
    this.sessions.clear()
  }

  private async runSweep(now: number, maxWarmRooms: number): Promise<RoomSweepResult> {
    if (!this.cachePolicy) return { evicted: [], warmRooms: this.sessions.size }
    const decisions = planRoomEvictions(this.cacheEntries(), { ...this.cachePolicy, maxWarmRooms }, now)
    const evicted: RoomEvictionDecision[] = []
    for (const decision of decisions) if (await this.evict(decision.key)) evicted.push(decision)
    return { evicted, warmRooms: this.sessions.size }
  }

  private cacheEntries(): RoomCacheEntry[] {
    return [...this.sessions.entries()].map(([key, entry]) => ({
      key,
      lastAccessAt: entry.lastAccessAt,
      activeConnections: entry.activeConnections,
      queuedOperations: entry.session.queuedOperationCount + (entry.initializing ? 1 : 0),
    }))
  }

  private async evict(key: string): Promise<boolean> {
    const entry = this.sessions.get(key)
    if (!entry) return false
    if (entry.eviction) return entry.eviction
    const eviction = this.finishEviction(key, entry).finally(() => {
      if (this.sessions.get(key) === entry) entry.eviction = undefined
    })
    entry.eviction = eviction
    return eviction
  }

  private async finishEviction(key: string, entry: ManagedDocumentSession<TState>): Promise<boolean> {
    if (entry.initializing || entry.activeConnections > 0 || entry.session.queuedOperationCount > 0) return false
    await entry.session.persistSnapshot()
    if (this.sessions.get(key) !== entry || entry.initializing || entry.activeConnections > 0 || entry.session.queuedOperationCount > 0) return false
    if (this.roomDataRetention === 'delete') await this.options.storage.deleteDocument!(entry.tenantId, entry.documentId)
    if (this.sessions.get(key) !== entry) return false
    this.sessions.delete(key)
    return true
  }

  private now(): number { return this.options.clock?.() ?? Date.now() }
  private key(tenantId: string, documentId: string): string { return `${tenantId}\u0000${documentId}` }
}
