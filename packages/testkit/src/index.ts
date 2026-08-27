import type { CollaborationOperation, JsonObject, OperationResult } from '@collabhub/protocol'
import { AuthoritativeDocumentSession, InMemoryStorageAdapter } from '@collabhub/server-core'
import type { DomainPack } from '@collabhub/strategy-sdk'

export interface TraceStep {
  label: string
  operation: CollaborationOperation
  repeat?: number
}

export interface TraceResult<TState extends JsonObject> {
  results: Array<{ label: string; result: OperationResult }>
  state: Readonly<TState>
  version: number
}

export async function runGoldenTrace<TState extends JsonObject>(domainPack: DomainPack<TState>, steps: readonly TraceStep[]): Promise<TraceResult<TState>> {
  const session = new AuthoritativeDocumentSession({
    tenantId: 'trace', documentId: 'golden', domainPack,
    storage: new InMemoryStorageAdapter<TState>(), snapshotInterval: 2,
  })
  await session.initialize()
  const results: Array<{ label: string; result: OperationResult }> = []
  for (const step of steps) {
    for (let index = 0; index < (step.repeat ?? 1); index++) results.push({ label: step.label, result: await session.submit(step.operation) })
  }
  return { results, state: session.canonicalState, version: session.canonicalVersion }
}

export function operation(input: Partial<CollaborationOperation> & Pick<CollaborationOperation, 'operationId' | 'operationType' | 'strategyId' | 'payload'>): CollaborationOperation {
  return {
    tenantId: 'trace', documentId: 'golden', actorId: 'actor', clientId: 'client',
    baseVersion: 0, schemaVersion: '1.0', strategyVersion: '1.0', ...input,
  }
}
