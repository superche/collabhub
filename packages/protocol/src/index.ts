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
  }
  if (!Number.isSafeInteger(operation.baseVersion) || (operation.baseVersion as number) < 0) throw new Error('baseVersion must be a non-negative integer')
}
