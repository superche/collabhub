import type { CanonicalPatch, JsonObject } from '@collabhub/protocol'
import { defineDomainPack, type ConflictStrategy, type ResolveResult } from '@collabhub/strategy-sdk'
import { initialBlockDocument, type BlockDocument, type PortableBlockRecord } from '../src/domain/block-document.js'

type BlockPayload = {
  type: string
  block?: JsonObject
  blockId?: string
  afterId?: string
}

function invalid(message: string): ResolveResult {
  return { kind: 'reject', reason: { code: 'invalidOperation', message } }
}

function orderedBlocks(state: Readonly<JsonObject>): PortableBlockRecord[] {
  const document = state as unknown as BlockDocument
  return [...document.blocks].sort((left, right) => Number(left.orderKey) - Number(right.orderKey))
}

function positionFor(state: Readonly<JsonObject>, blockId: string, afterId?: string): string | undefined {
  const ordered = orderedBlocks(state).filter((record) => record.id !== blockId)
  const index = afterId ? ordered.findIndex((record) => record.id === afterId) + 1 : 0
  if (afterId && index === 0) return undefined
  const left = index > 0 ? Number(ordered[index - 1]?.orderKey) : 0
  const right = index < ordered.length ? Number(ordered[index]?.orderKey) : left + 2048
  return String((left + right) / 2)
}

export const blockSequenceStrategy: ConflictStrategy<JsonObject> = {
  id: 'block-document.sequence',
  version: '1.0',
  supports(operationType, schemaVersion) {
    return schemaVersion === '1.0' && ['block.insert', 'block.update', 'block.delete', 'block.move'].includes(operationType)
  },
  resolve(context) {
    const data = context.operation.payload as BlockPayload
    const id = data.block ? String(data.block.id ?? '') : String(data.blockId ?? '')
    if (!id) return invalid(`${context.operation.operationType} requires a block id`)
    const existing = orderedBlocks(context.currentState).find((record) => record.id === id)

    if (context.operation.operationType === 'block.insert') {
      if (existing) return invalid(`block ${id} already exists`)
      if (!data.block) return invalid('block.insert requires block')
      const orderKey = positionFor(context.currentState, id, data.afterId)
      if (!orderKey) return invalid(`after block ${data.afterId} does not exist`)
      const value = { id, orderKey, block: data.block } as unknown as JsonObject
      return { kind: 'accept', patches: [{ op: 'entityUpsert', collection: 'blocks', id, value }] }
    }
    if (!existing) return invalid(`block ${id} does not exist`)
    if (context.operation.operationType === 'block.update') {
      if (!data.block) return invalid('block.update requires block')
      const value = { ...existing, block: data.block } as unknown as JsonObject
      return { kind: 'accept', patches: [{ op: 'entityUpsert', collection: 'blocks', id, value }] }
    }
    if (context.operation.operationType === 'block.delete') {
      return { kind: 'accept', patches: [{ op: 'entityDelete', collection: 'blocks', id }] }
    }
    const position = positionFor(context.currentState, id, data.afterId)
    if (!position) return invalid(`after block ${data.afterId} does not exist`)
    const patch: CanonicalPatch = { op: 'listOrder', collection: 'blocks', id, position }
    return { kind: 'accept', patches: [patch] }
  },
}

export const BlockDocumentDomainPack = defineDomainPack<JsonObject>({
  id: 'example.block-document',
  schemaVersion: '1.0',
  strategies: [blockSequenceStrategy],
  invariants: [{
    id: 'block-document.unique-ids',
    check(state) {
      const blocks = orderedBlocks(state)
      const ids = blocks.map((record) => record.id)
      if (new Set(ids).size !== ids.length) return 'block ids must be unique'
      if (blocks.some((record) => String(record.block.id ?? '') !== record.id)) return 'record and block ids must match'
      return true
    },
  }],
  initialState(documentId) { return initialBlockDocument(documentId) as unknown as JsonObject },
})
