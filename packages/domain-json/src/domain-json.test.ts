import { describe, expect, it } from 'vitest'
import type { CollaborationOperation, JsonObject } from '@collabhub/protocol'
import { applyCanonicalPatch, rejectIfStaleStrategy } from './index.js'

describe('safe canonical JSON paths', () => {
  it.each(['/__proto__/polluted', '/constructor/prototype/polluted', '/safe/prototype'])('rejects unsafe JSON pointer %s', (path) => {
    expect(() => applyCanonicalPatch({ safe: {} }, { op: 'set', path, value: true })).toThrow(/unsafe/)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('rejects unsafe patches inside strict transactions', () => {
    const operation = {
      tenantId: 'tenant', documentId: 'document', actorId: 'alice', clientId: 'client', operationId: 'operation',
      baseVersion: 0, schemaVersion: '1.0', operationType: 'transaction.apply',
      strategyId: 'json.reject-if-stale', strategyVersion: '1.0',
      payload: { patches: [{ op: 'set', path: '/__proto__/polluted', value: true }] },
    } as CollaborationOperation
    const result = rejectIfStaleStrategy.resolve({ currentVersion: 0, currentState: {} as JsonObject, operation, concurrentOperations: [], historyComplete: true })
    expect(result.kind).toBe('reject')
    if (result.kind === 'reject') expect(result.reason.message).toMatch(/unsafe/)
  })
})
