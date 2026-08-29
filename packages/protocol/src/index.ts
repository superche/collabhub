export const PROTOCOL_VERSION = '0.1' as const

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject { [key: string]: JsonValue }

export interface CollaborationOperation<TPayload = unknown> {
  tenantId: string
  documentId: string
  actorId: string
  clientId: string
  operationId: string
  /** Canonical version observed when this immutable operation was created. */
  baseVersion: number
  schemaVersion: string
  operationType: string
  strategyId: string
  strategyVersion: string
  payload: TPayload
  intent?: unknown
  traceId?: string
}

export type CanonicalPatch =
  | { op: 'set'; path: string; value: JsonValue }
  | { op: 'remove'; path: string }
  | { op: 'entityUpsert'; collection: string; id: string; value: JsonObject }
  | { op: 'entityDelete'; collection: string; id: string }
  | { op: 'listOrder'; collection: string; id: string; position: string }

export interface RejectReason {
  code:
    | 'invalidOperation'
    | 'unauthorized'
    | 'staleVersion'
    | 'invariantViolation'
    | 'backpressure'
    | 'strategyFailure'
    | 'collaborativeSessionActive'
  message: string
  details?: Record<string, unknown>
}

export type OperationResult =
  | {
      kind: 'accepted'
      operationId: string
      canonicalVersion: number
      patches: CanonicalPatch[]
      duplicate?: boolean
    }
  | {
      kind: 'rejected'
      operationId: string
      canonicalVersion: number
      reason: RejectReason
      correctivePatches?: CanonicalPatch[]
    }
  | {
      kind: 'resyncRequired'
      operationId: string
      canonicalVersion: number
      snapshotRef: string
      reason: string
    }
  | {
      kind: 'retryLater'
      operationId: string
      canonicalVersion: number
      retryAfterMs: number
      reason: 'ownerChanging' | 'temporarilyUnavailable' | 'backpressure'
    }

export interface SnapshotMessage<T = JsonObject> {
  kind: 'snapshot'
  tenantId: string
  documentId: string
  canonicalVersion: number
  schemaVersion: string
  snapshot: T
  snapshotRef: string
}

export interface CanonicalEvent {
  kind: 'canonical'
  operationId: string
  actorId: string
  canonicalVersion: number
  patches: CanonicalPatch[]
}

export interface PresenceMessage {
  kind: 'presence'
  tenantId?: string
  documentId: string
  actorId: string
  clientId: string
  data: Record<string, unknown>
}

export interface CapabilityHello {
  kind: 'hello'
  protocolVersion: typeof PROTOCOL_VERSION
  tenantId: string
  documentId: string
  actorId: string
  clientId: string
  lastKnownVersion: number
  /** Optional bearer token. Production gateways should authenticate and bind identity from its claims. */
  authToken?: string
}

export interface SubmitMessage {
  kind: 'submit'
  operation: CollaborationOperation
}

export interface RecoveryRequest {
  kind: 'recover'
  tenantId: string
  documentId: string
  sinceVersion: number
}

export type ClientWireMessage = CapabilityHello | SubmitMessage | PresenceMessage | RecoveryRequest
export type ServerWireMessage = SnapshotMessage | CanonicalEvent | OperationResult | PresenceMessage | { kind: 'ready'; canonicalVersion: number }

export function roomKey(tenantId: string, documentId: string): string {
  return `${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`
}

export function assertOperationEnvelope(value: unknown): asserts value is CollaborationOperation {
  if (!value || typeof value !== 'object') throw new Error('operation must be an object')
  const operation = value as Record<string, unknown>
  for (const key of ['tenantId', 'documentId', 'actorId', 'clientId', 'operationId', 'schemaVersion', 'operationType', 'strategyId', 'strategyVersion']) {
    if (typeof operation[key] !== 'string' || operation[key] === '') throw new Error(`${key} must be a non-empty string`)
    if ((operation[key] as string).length > 256) throw new Error(`${key} must be at most 256 characters`)
  }
  if (!Number.isSafeInteger(operation.baseVersion) || (operation.baseVersion as number) < 0) throw new Error('baseVersion must be a non-negative integer')
  if (!Object.hasOwn(operation, 'payload')) throw new Error('payload is required')
  assertJsonComplexity(operation.payload)
}

export interface JsonComplexityLimits {
  maxDepth?: number
  maxNodes?: number
  maxCollectionLength?: number
}

/** Bounds JSON shape independently of transport byte limits to avoid parser-safe CPU/memory amplification. */
export function assertJsonComplexity(value: unknown, limits: JsonComplexityLimits = {}): void {
  const maxDepth = limits.maxDepth ?? 32
  const maxNodes = limits.maxNodes ?? 10_000
  const maxCollectionLength = limits.maxCollectionLength ?? 1000
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  let nodes = 0
  while (pending.length) {
    const current = pending.pop()!
    nodes++
    if (nodes > maxNodes) throw new Error(`JSON value exceeds ${maxNodes} nodes`)
    if (current.depth > maxDepth) throw new Error(`JSON value exceeds depth ${maxDepth}`)
    if (current.value === null || ['string', 'boolean'].includes(typeof current.value)) continue
    if (typeof current.value === 'number' && Number.isFinite(current.value)) continue
    if (typeof current.value !== 'object') throw new Error('value must contain JSON-compatible data')
    const children = Array.isArray(current.value) ? current.value : Object.values(current.value as Record<string, unknown>)
    if (children.length > maxCollectionLength) throw new Error(`JSON collection exceeds ${maxCollectionLength} entries`)
    for (const child of children) pending.push({ value: child, depth: current.depth + 1 })
  }
}
