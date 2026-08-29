import type { CanonicalPatch, CollaborationOperation, JsonObject, RejectReason } from '@collabhub/protocol'

export interface CommittedOperation {
  readonly canonicalVersion: number
  readonly operation: Readonly<CollaborationOperation>
}

export interface ResolveContext<TState extends JsonObject = JsonObject> {
  currentVersion: number
  currentState: Readonly<TState>
  operation: Readonly<CollaborationOperation>
  /** Operations committed after operation.baseVersion, ordered by canonical version. */
  concurrentOperations: readonly CommittedOperation[]
  /** False when the runtime retained only a suffix of the required history. */
  historyComplete: boolean
}

export type ResolveResult =
  | { kind: 'accept'; patches: CanonicalPatch[] }
  | { kind: 'reject'; reason: RejectReason; correctivePatches?: CanonicalPatch[] }
  | { kind: 'resync'; reason: string }

export interface ConflictStrategy<TState extends JsonObject = JsonObject> {
  readonly id: string
  readonly version: string
  supports(operationType: string, schemaVersion: string): boolean
  resolve(context: ResolveContext<TState>): ResolveResult
}

export interface OperationVersionContext<TState extends JsonObject = JsonObject> extends ResolveContext<TState> {
  /** The canonical version observed and submitted by the client. */
  submittedVersion: number
  versionGap: number
  recoveryWindowExceeded: boolean
}

export type OperationVersionDecision =
  | { kind: 'resolve' }
  | { kind: 'reject'; reason: RejectReason; correctivePatches?: CanonicalPatch[] }
  | { kind: 'resync'; reason: string }

export interface OperationVersionPolicy<TState extends JsonObject = JsonObject> {
  decide(context: OperationVersionContext<TState>): OperationVersionDecision
}

export interface Invariant<TState extends JsonObject = JsonObject> {
  readonly id: string
  check(state: Readonly<TState>, operation: Readonly<CollaborationOperation>): true | string
}

export interface DomainSchemaMigration<TState extends JsonObject = JsonObject> {
  readonly fromVersion: string
  readonly toVersion: string
  /** Forward-only, deterministic state transform. Migrations must not perform I/O. */
  migrate(state: Readonly<TState>): TState
}

export interface DomainMigrationResult<TState extends JsonObject = JsonObject> {
  state: TState
  schemaVersion: string
  applied: readonly { fromVersion: string; toVersion: string }[]
}

export interface DomainPack<TState extends JsonObject = JsonObject> {
  readonly id: string
  readonly schemaVersion: string
  readonly strategies: readonly ConflictStrategy<TState>[]
  /**
   * Optional business policy for stale canonical versions. Without it,
   * operations outside maxRecoveryGap require snapshot recovery.
   */
  readonly operationVersionPolicy?: OperationVersionPolicy<TState>
  readonly invariants?: readonly Invariant<TState>[]
  /** Forward-only snapshot migrations used when a persisted room is activated. */
  readonly migrations?: readonly DomainSchemaMigration<TState>[]
  initialState(documentId: string): TState
}

export function defineDomainPack<TState extends JsonObject>(pack: DomainPack<TState>): DomainPack<TState> {
  validateMigrationGraph(pack)
  return pack
}

/** Applies the single forward migration chain from a stored schema to the pack schema. */
export function migrateDomainState<TState extends JsonObject>(
  pack: DomainPack<TState>,
  fromVersion: string,
  state: TState,
): DomainMigrationResult<TState> {
  validateMigrationGraph(pack)
  if (fromVersion === pack.schemaVersion) return { state, schemaVersion: fromVersion, applied: [] }
  const migrations = new Map((pack.migrations ?? []).map((migration) => [migration.fromVersion, migration]))
  const applied: Array<{ fromVersion: string; toVersion: string }> = []
  const visited = new Set<string>()
  let currentVersion = fromVersion
  let currentState = state
  while (currentVersion !== pack.schemaVersion) {
    if (visited.has(currentVersion)) throw new Error(`schema migration cycle detected at ${currentVersion}`)
    visited.add(currentVersion)
    const migration = migrations.get(currentVersion)
    if (!migration) throw new Error(`no schema migration from ${currentVersion} to ${pack.schemaVersion}`)
    const nextState = migration.migrate(currentState)
    if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) {
      throw new Error(`schema migration ${migration.fromVersion} -> ${migration.toVersion} returned a non-object state`)
    }
    currentState = nextState
    applied.push({ fromVersion: migration.fromVersion, toVersion: migration.toVersion })
    currentVersion = migration.toVersion
  }
  return { state: currentState, schemaVersion: currentVersion, applied }
}

function validateMigrationGraph<TState extends JsonObject>(pack: DomainPack<TState>): void {
  const outgoing = new Set<string>()
  for (const migration of pack.migrations ?? []) {
    if (!migration.fromVersion || !migration.toVersion) throw new Error('schema migration versions must be non-empty')
    if (migration.fromVersion === migration.toVersion) throw new Error(`schema migration ${migration.fromVersion} cannot target itself`)
    if (outgoing.has(migration.fromVersion)) throw new Error(`multiple schema migrations start at ${migration.fromVersion}`)
    outgoing.add(migration.fromVersion)
  }
}

export class StrategyRegistry<TState extends JsonObject = JsonObject> {
  constructor(private readonly strategies: readonly ConflictStrategy<TState>[]) {}

  resolve(operation: CollaborationOperation): ConflictStrategy<TState> | undefined {
    return this.strategies.find(
      (strategy) => strategy.id === operation.strategyId && strategy.version === operation.strategyVersion && strategy.supports(operation.operationType, operation.schemaVersion),
    )
  }
}
