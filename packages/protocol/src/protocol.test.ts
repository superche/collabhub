import { describe, expect, it } from 'vitest'
import { assertJsonComplexity, assertOperationEnvelope } from './index.js'

const operation = {
  tenantId: 'tenant', documentId: 'document', actorId: 'actor', clientId: 'client', operationId: 'operation',
  baseVersion: 0, schemaVersion: '1', operationType: 'property.set', strategyId: 'json.property-lww',
  strategyVersion: '1', payload: { path: '/title', value: 'Hello' },
}

describe('protocol resource bounds', () => {
  it('accepts a normal operation envelope', () => {
    expect(() => assertOperationEnvelope(operation)).not.toThrow()
  })

  it('rejects oversized identifiers and missing payloads', () => {
    expect(() => assertOperationEnvelope({ ...operation, documentId: 'x'.repeat(257) })).toThrow(/at most 256/)
    const { payload: _payload, ...missingPayload } = operation
    expect(() => assertOperationEnvelope(missingPayload)).toThrow(/payload is required/)
  })

  it('rejects deeply nested and excessively wide JSON', () => {
    expect(() => assertJsonComplexity({ a: { b: { c: true } } }, { maxDepth: 2 })).toThrow(/depth/)
    expect(() => assertJsonComplexity([1, 2, 3], { maxCollectionLength: 2 })).toThrow(/collection/)
  })
})
