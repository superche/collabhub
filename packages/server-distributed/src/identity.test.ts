import { describe, expect, it } from 'vitest'
import type { CollaborationOperation } from '@collabhub/protocol'
import { operationFingerprint, stableStringify } from './identity.js'

const operation: CollaborationOperation = {
  tenantId: 'tenant', documentId: 'document', actorId: 'alice', clientId: 'browser-a', operationId: 'op-1',
  baseVersion: 0, schemaVersion: '1.0', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0',
  payload: { path: '/title', value: 'Hello' },
}

describe('operation identity', () => {
  it('is independent of object property insertion order', () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 4 }, b: 2 }))
  })

  it('detects operationId reuse with a changed payload', () => {
    expect(operationFingerprint(operation)).not.toBe(operationFingerprint({ ...operation, payload: { path: '/title', value: 'Changed' } }))
  })
})
