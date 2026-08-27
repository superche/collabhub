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
import { StrategyRegistry, type DomainPack, type ResolveResult } from '@collabhub/strategy-sdk'

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
  private readonly registry: StrategyRegistry<TState>
  private readonly results = new Map<string, OperationResult>()
  private readonly operations: CollaborationOperation[] = []
  private readonly listeners = new Set<CanonicalListener>()
  private serial: Promise<unknown> = Promise.resolve()
  private initialized = false

  constructor(private readonly options: AuthoritativeSessionOptions<TState>) {
    this.registry = new StrategyRegistry(options.domainPack.strategies)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    const snapshot = await this.options.storage.loadSnapshot(this.options.tenantId, this.options.documentId)
    this.state = snapshot?.state ?? this.options.domainPack.initialState(this.options.documentId)
    this.version = snapshot?.version ?? 0
    const wal = await this.options.storage.loadWal(this.options.tenantId, this.options.documentId, -1)
    for (const record of wal.sort((a, b) => a.version - b.version)) {
      if (record.version > this.version) {
        this.state = applyCanonicalPatches(this.state, record.patches)
        this.version = record.version
      }
      this.operations.push(record.operation)
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
    const task = this.serial.then(() => this.process(operation), () => this.process(operation))
    this.serial = task.catch(() => undefined)
    return task
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
    if (operation.schemaVersion !== this.options.domainPack.schemaVersion) {
      return this.resync(operation, `schema ${operation.schemaVersion} is not supported`)
    }
    const maxRecoveryGap = this.options.maxRecoveryGap ?? 100
    if (this.version - operation.baseVersion > maxRecoveryGap) return this.resync(operation, 'client is outside the recovery window')

    const context: PipelineContext<TState> = { operation, state: this.state, currentVersion: this.version }
    try {
      for (const stage of ['authenticate', 'authorize', 'schemaValidate', 'normalize', 'beforeResolve'] as const) await this.runHooks(stage, context)
      const strategy = this.registry.resolve(operation)
      if (!strategy) return this.rejected(operation.operationId, 'invalidOperation', `strategy ${operation.strategyId}@${operation.strategyVersion} does not support ${operation.operationType}`)
      const concurrentOperations = this.operations.filter((candidate) => candidate.baseVersion >= operation.baseVersion)
      const resolution = strategy.resolve({ currentVersion: this.version, currentState: this.state, operation, concurrentOperations })
      context.result = resolution
      if (resolution.kind === 'reject') {
        const result: OperationResult = { kind: 'rejected', operationId: operation.operationId, canonicalVersion: this.version, reason: resolution.reason, correctivePatches: resolution.correctivePatches }
        this.results.set(operation.operationId, result)
        return result
      }
      if (resolution.kind === 'resync') return this.resync(operation, resolution.reason)
      await this.runHooks('invariantCheck', context)
      const nextState = applyCanonicalPatches(this.state, resolution.patches)
      for (const invariant of this.options.domainPack.invariants ?? []) {
        const verdict = invariant.check(nextState, operation)
        if (verdict !== true) return this.rejected(operation.operationId, 'invariantViolation', `${invariant.id}: ${verdict}`)
      }
      await this.runHooks('beforeCommit', { ...context, state: nextState })
      const nextVersion = this.version + 1
      const record: WalRecord = {
        tenantId: this.options.tenantId,
        documentId: this.options.documentId,
        version: nextVersion,
        operation,
        patches: resolution.patches,
        committedAt: new Date().toISOString(),
      }
      await this.options.storage.appendWal(record)
      this.state = nextState
      this.version = nextVersion
      this.operations.push(operation)
      const result: OperationResult = { kind: 'accepted', operationId: operation.operationId, canonicalVersion: nextVersion, patches: resolution.patches }
      this.results.set(operation.operationId, result)
      if (nextVersion % (this.options.snapshotInterval ?? 25) === 0) await this.persistSnapshot()
      const event: CanonicalEvent = { kind: 'canonical', operationId: operation.operationId, actorId: operation.actorId, canonicalVersion: nextVersion, patches: resolution.patches }
      for (const listener of this.listeners) listener(event)
      await this.runHooks('afterCommit', { ...context, state: this.state })
      return result
    } catch (error) {
      return this.rejected(operation.operationId, 'strategyFailure', error instanceof Error ? error.message : String(error))
    }
  }

  async persistSnapshot(): Promise<void> {
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
  private resync(operation: CollaborationOperation, reason: string): OperationResult {
    return { kind: 'resyncRequired', operationId: operation.operationId, canonicalVersion: this.version, snapshotRef: this.snapshotRef(), reason }
  }
  private async runHooks(stage: PipelineStage, context: PipelineContext<TState>) {
    for (const hook of this.options.hooks ?? []) if (hook.stage === stage) await hook.run(context)
  }
}

export interface SessionFactoryOptions<TState extends JsonObject> {
  domainPack: DomainPack<TState>
  storage: StorageAdapter<TState>
  snapshotInterval?: number
  maxRecoveryGap?: number
  hooks?: readonly OperationPipelineHook<TState>[]
}

export class CollaborationServerCore<TState extends JsonObject = JsonObject> {
  private readonly sessions = new Map<string, AuthoritativeDocumentSession<TState>>()
  constructor(private readonly options: SessionFactoryOptions<TState>) {}

  async session(tenantId: string, documentId: string): Promise<AuthoritativeDocumentSession<TState>> {
    const key = `${tenantId}\u0000${documentId}`
    let session = this.sessions.get(key)
    if (!session) {
      session = new AuthoritativeDocumentSession({ tenantId, documentId, ...this.options })
      this.sessions.set(key, session)
    }
    await session.initialize()
    return session
  }
}
