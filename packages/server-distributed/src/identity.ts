import { createHash } from 'node:crypto'
import type { CollaborationOperation } from '@collabhub/protocol'

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`
}

export function operationFingerprint(operation: CollaborationOperation): string {
  return createHash('sha256').update(stableStringify(operation)).digest('hex')
}
