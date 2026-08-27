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
  initialState(documentId: string): TState
}

export function defineDomainPack<TState extends JsonObject>(pack: DomainPack<TState>): DomainPack<TState> {
  return pack
}

export class StrategyRegistry<TState extends JsonObject = JsonObject> {
  constructor(private readonly strategies: readonly ConflictStrategy<TState>[]) {}

  resolve(operation: CollaborationOperation): ConflictStrategy<TState> | undefined {
    return this.strategies.find(
      (strategy) => strategy.id === operation.strategyId && strategy.version === operation.strategyVersion && strategy.supports(operation.operationType, operation.schemaVersion),
    )
  }
}
