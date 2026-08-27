import type { CanonicalPatch, JsonObject, JsonValue } from '@collabhub/protocol'
import type { ConflictStrategy, ResolveContext, ResolveResult } from '@collabhub/strategy-sdk'

type PropertyPayload = { path: string; value?: JsonValue }
type EntityPayload = { collection: string; id: string; value?: JsonObject }
type ListPayload = { collection: string; id: string; afterId?: string }
type TransactionPayload = { patches: CanonicalPatch[] }

const unsafePropertyNames = new Set(['__proto__', 'prototype', 'constructor'])

function isSafePropertyName(value: string): boolean {
  return value.length > 0 && value.length <= 256 && !unsafePropertyNames.has(value)
}

function payload<T>(context: ResolveContext): T {
  return context.operation.payload as T
}

function invalid(message: string): ResolveResult {
  return { kind: 'reject', reason: { code: 'invalidOperation', message } }
}

export const propertyLwwStrategy: ConflictStrategy = {
  id: 'json.property-lww',
  version: '1.0',
  supports: (type) => type === 'property.set' || type === 'property.unset',
  resolve(context) {
    const data = payload<PropertyPayload>(context)
    try { pointerSegments(data.path) }
    catch (error) { return invalid(error instanceof Error ? error.message : String(error)) }
    if (context.operation.operationType === 'property.unset') return { kind: 'accept', patches: [{ op: 'remove', path: data.path }] }
    if (data.value === undefined) return invalid('property.set requires value')
    return { kind: 'accept', patches: [{ op: 'set', path: data.path, value: data.value }] }
  },
}

export const entityLifecycleStrategy: ConflictStrategy = {
  id: 'json.entity-lifecycle',
  version: '1.0',
  supports: (type) => type === 'entity.create' || type === 'entity.delete' || type === 'entity.restore',
  resolve(context) {
    const data = payload<EntityPayload>(context)
    if (!isSafePropertyName(data.collection) || !data.id) return invalid('entity operation requires a safe collection and id')
    const collection = context.currentState[data.collection]
    const existing = Array.isArray(collection)
      ? collection.find((item) => item && typeof item === 'object' && !Array.isArray(item) && (item as JsonObject).id === data.id)
      : undefined
    if (context.operation.operationType === 'entity.delete') {
      if (!existing) return invalid(`entity ${data.id} does not exist`)
      return { kind: 'accept', patches: [{ op: 'entityDelete', collection: data.collection, id: data.id }] }
    }
    if (!data.value) return invalid(`${context.operation.operationType} requires value`)
    if (context.operation.operationType === 'entity.create' && existing) return invalid(`entity ${data.id} already exists`)
    return { kind: 'accept', patches: [{ op: 'entityUpsert', collection: data.collection, id: data.id, value: { ...data.value, id: data.id } }] }
  },
}

function rankBetween(before?: string, after?: string): string {
  const left = before ? Number(before) : 0
  const right = after ? Number(after) : left + 2048
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return String(left + 0.5)
  return String((left + right) / 2)
}

export const listOrderStrategy: ConflictStrategy = {
  id: 'json.list-order',
  version: '1.0',
  supports: (type) => type === 'list.move' || type === 'list.insert',
  resolve(context) {
    const data = payload<ListPayload>(context)
    if (!isSafePropertyName(data.collection)) return invalid('list operation requires a safe collection')
    const rawCollection = context.currentState[data.collection]
    if (!Array.isArray(rawCollection)) return invalid(`collection ${data.collection} is not a list`)
    const entities = rawCollection.filter((item): item is JsonObject => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    const moving = entities.find((item) => item.id === data.id)
    if (!moving) return invalid(`entity ${data.id} does not exist`)
    const withoutMoving = entities
      .filter((item) => item.id !== data.id)
      .sort((a, b) => Number(a.orderKey ?? 0) - Number(b.orderKey ?? 0))
    if (data.afterId && !withoutMoving.some((item) => item.id === data.afterId)) return invalid(`afterId ${data.afterId} does not exist`)
    const insertAt = data.afterId ? withoutMoving.findIndex((item) => item.id === data.afterId) + 1 : 0
    const before = insertAt > 0 ? String(withoutMoving[insertAt - 1]?.orderKey ?? '') : undefined
    const after = insertAt < withoutMoving.length ? String(withoutMoving[insertAt]?.orderKey ?? '') : undefined
    return { kind: 'accept', patches: [{ op: 'listOrder', collection: data.collection, id: data.id, position: rankBetween(before, after) }] }
  },
}

export const rejectIfStaleStrategy: ConflictStrategy = {
  id: 'json.reject-if-stale',
  version: '1.0',
  supports: (type) => type === 'transaction.apply',
  resolve(context) {
    if (context.operation.baseVersion !== context.currentVersion) {
      return {
        kind: 'reject',
        reason: {
          code: 'staleVersion',
          message: `expected version ${context.currentVersion}, received ${context.operation.baseVersion}`,
        },
      }
    }
    const data = payload<TransactionPayload>(context)
    if (!Array.isArray(data.patches)) return invalid('transaction.apply requires patches')
    try { for (const patch of data.patches) assertSafeCanonicalPatch(patch) }
    catch (error) { return invalid(error instanceof Error ? error.message : String(error)) }
    return { kind: 'accept', patches: data.patches }
  },
}

export const jsonStrategies = [propertyLwwStrategy, entityLifecycleStrategy, listOrderStrategy, rejectIfStaleStrategy] as const

function pointerSegments(path: string): string[] {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 4096) throw new Error('property path must be a bounded JSON pointer')
  const segments = path.split('/').slice(1).map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
  if (segments.length === 0 || segments.length > 64) throw new Error('property path depth is outside the supported range')
  if (segments.some((segment) => !isSafePropertyName(segment))) throw new Error('property path contains an unsafe segment')
  return segments
}

export function assertSafeCanonicalPatch(patch: CanonicalPatch): void {
  if (!patch || typeof patch !== 'object') throw new Error('canonical patch must be an object')
  if (patch.op === 'set' || patch.op === 'remove') {
    pointerSegments(patch.path)
    return
  }
  if (!isSafePropertyName(patch.collection)) throw new Error('canonical patch contains an unsafe collection')
  if (!patch.id || patch.id.length > 512) throw new Error('canonical patch requires a bounded entity id')
}

function setPointer(root: JsonObject, path: string, value: JsonValue | undefined): JsonObject {
  const segments = pointerSegments(path)
  if (segments.length === 0) throw new Error('root replacement is not supported')
  const next: JsonObject = { ...root }
  let source: JsonObject = root
  let target: JsonObject = next
  for (const segment of segments.slice(0, -1)) {
    const child = source[segment]
    const nextChild = child && typeof child === 'object' && !Array.isArray(child) ? { ...child } : {}
    target[segment] = nextChild
    source = child && typeof child === 'object' && !Array.isArray(child) ? child : {}
    target = nextChild
  }
  const last = segments.at(-1)!
  if (value === undefined) delete target[last]
  else target[last] = value
  return next
}

export function applyCanonicalPatch<T extends JsonObject>(state: T, patch: CanonicalPatch): T {
  assertSafeCanonicalPatch(patch)
  if (patch.op === 'set') return setPointer(state, patch.path, patch.value) as T
  if (patch.op === 'remove') return setPointer(state, patch.path, undefined) as T
  const collection = state[patch.collection]
  if (!Array.isArray(collection)) throw new Error(`collection ${patch.collection} is not a list`)
  if (patch.op === 'entityDelete') {
    return { ...state, [patch.collection]: collection.filter((item) => !(item && typeof item === 'object' && !Array.isArray(item) && (item as JsonObject).id === patch.id)) } as T
  }
  if (patch.op === 'entityUpsert') {
    const index = collection.findIndex((item) => item && typeof item === 'object' && !Array.isArray(item) && (item as JsonObject).id === patch.id)
    const nextCollection = [...collection]
    if (index === -1) nextCollection.push(patch.value)
    else nextCollection[index] = { ...(nextCollection[index] as JsonObject), ...patch.value }
    return { ...state, [patch.collection]: nextCollection } as T
  }
  const nextCollection = collection.map((item) =>
    item && typeof item === 'object' && !Array.isArray(item) && (item as JsonObject).id === patch.id
      ? { ...(item as JsonObject), orderKey: patch.position }
      : item,
  )
  return { ...state, [patch.collection]: nextCollection } as T
}

export function applyCanonicalPatches<T extends JsonObject>(state: T, patches: readonly CanonicalPatch[]): T {
  return patches.reduce((current, patch) => applyCanonicalPatch(current, patch), state)
}
