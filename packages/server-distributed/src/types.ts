import type {
  CanonicalEvent,
  CanonicalPatch,
  CollaborationOperation,
  JsonObject,
  OperationResult,
  SnapshotMessage,
} from '@collabhub/protocol'

export interface RoomIdentity {
  tenantId: string
  documentId: string
}

export interface ConnectionContext extends RoomIdentity {
  actorId: string
  clientId: string
}

export interface OwnerRecord {
  instanceId: string
  internalUrl: string
  epoch: number
}

export interface LoadedRoom<TState extends JsonObject = JsonObject> extends RoomIdentity {
  schemaVersion: string
  version: number
  ownerEpoch: number
  ownerInstanceId: string | null
  snapshotVersion: number
  state: TState
  wal: PersistedOperation[]
}

export interface PersistedOperation extends RoomIdentity {
  version: number
  operation: CollaborationOperation
  patches: CanonicalPatch[]
  committedAt: string
}

export interface CommitRequest extends RoomIdentity {
  ownerEpoch: number
  ownerInstanceId: string
  resolvedAtVersion: number
  operation: CollaborationOperation
  patches: CanonicalPatch[]
  fingerprint: string
}

export interface DocumentMigrationRequest<TState extends JsonObject = JsonObject> extends RoomIdentity {
  ownerEpoch: number
  ownerInstanceId: string
  version: number
  fromSchemaVersion: string
  toSchemaVersion: string
  state: TState
  applied: readonly { fromVersion: string; toVersion: string }[]
}

export type DocumentMigrationOutcome =
  | { kind: 'migrated' }
  | { kind: 'alreadyCurrent' }
  | { kind: 'fenced' }
  | { kind: 'versionConflict'; canonicalVersion: number; schemaVersion: string }

export interface DurableRetentionPolicy {
  /** Minimum number of most-recent canonical operations kept per document. */
  walVersions: number
  /** Idempotency receipts older than this window may be removed. */
  receiptTtlMs: number
  /** Delivered outbox rows older than this window may be removed. */
  deliveredOutboxTtlMs: number
  /** Number of newest snapshots kept; the active head snapshot is always protected as well. */
  snapshotsPerDocument: number
}

export interface CompactionResult {
  acquired: boolean
  walDeleted: number
  receiptsDeleted: number
  outboxDeleted: number
  snapshotsDeleted: number
}

export type CommitOutcome =
  | { kind: 'committed'; result: Extract<OperationResult, { kind: 'accepted' }>; event: CanonicalEvent }
  | { kind: 'duplicate'; result: OperationResult }
  | { kind: 'collision'; canonicalVersion: number }
  | { kind: 'versionConflict'; canonicalVersion: number }
  | { kind: 'fenced'; canonicalVersion: number }

export interface StoredReceipt {
  fingerprint: string
  result: OperationResult
}

export interface CommitStore<TState extends JsonObject = JsonObject> {
  migrate(): Promise<void>
  ensureDocument(room: RoomIdentity, schemaVersion: string, initialState: TState): Promise<void>
  claimOwnership(room: RoomIdentity, instanceId: string): Promise<number>
  loadRoom(room: RoomIdentity): Promise<LoadedRoom<TState>>
  lookupReceipt(room: RoomIdentity, operationId: string): Promise<StoredReceipt | undefined>
  recordReceipt(room: RoomIdentity, owner: { epoch: number; instanceId: string }, fingerprint: string, result: OperationResult): Promise<'stored' | 'exists' | 'fenced'>
  commit(request: CommitRequest): Promise<CommitOutcome>
  migrateDocument(request: DocumentMigrationRequest<TState>): Promise<DocumentMigrationOutcome>
  saveSnapshot(room: RoomIdentity, version: number, schemaVersion: string, state: TState): Promise<void>
  compact(policy: DurableRetentionPolicy): Promise<CompactionResult>
  snapshot(room: RoomIdentity): Promise<SnapshotMessage<TState>>
  eventsAfter(room: RoomIdentity, afterVersion: number, limit?: number): Promise<CanonicalEvent[]>
  headVersion(room: RoomIdentity): Promise<number>
  claimOutbox(instanceId: string, limit: number): Promise<Array<{ id: string; event: InternalRoomEvent }>>
  markOutboxDelivered(id: string): Promise<void>
  ping(): Promise<void>
  close(): Promise<void>
}

export interface InternalRoomEvent extends RoomIdentity {
  event: CanonicalEvent
}

export interface OwnershipCoordinator {
  start(): Promise<void>
  registerWorker(instanceId: string, internalUrl: string): Promise<() => Promise<void>>
  listWorkers(): Promise<Array<{ instanceId: string; internalUrl: string }>>
  owner(room: RoomIdentity): Promise<OwnerRecord | undefined>
  publishOwner(room: RoomIdentity, owner: OwnerRecord): Promise<void>
  renewOwner(room: RoomIdentity, owner: OwnerRecord): Promise<boolean>
  releaseOwner(room: RoomIdentity, owner: OwnerRecord): Promise<void>
  publishEvent(event: InternalRoomEvent): Promise<void>
  publishPresence(message: Record<string, unknown>): Promise<void>
  subscribe(onEvent: (event: InternalRoomEvent) => void, onPresence: (message: Record<string, unknown>) => void): Promise<() => Promise<void>>
  /** Optional cluster-wide token bucket. Gateways fall back to a process-local limiter when absent. */
  consumeRateLimit?(key: string, ratePerSecond: number, burst: number): Promise<boolean>
  ping(): Promise<void>
  close(): Promise<void>
}

export interface WorkerRouter {
  resolve(room: RoomIdentity): Promise<OwnerRecord>
  invalidate(room: RoomIdentity, owner: OwnerRecord): Promise<void>
}
