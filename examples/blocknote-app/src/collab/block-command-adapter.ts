import type { CanonicalPatch, JsonObject } from '@collabhub/protocol'
import type { BlockCommand, BlockDocument, PortableBlockRecord } from '../domain/block-document.js'

export interface AdaptedBlockOperation {
  operationType: string
  strategyId: 'block-document.sequence'
  strategyVersion: '1.0'
  payload: unknown
  intent: BlockCommand
  optimisticPatches: CanonicalPatch[]
}

function rankFor(document: BlockDocument, blockId: string, afterId?: string): string {
  const ordered = document.blocks
    .filter((record) => record.id !== blockId)
    .sort((left, right) => Number(left.orderKey) - Number(right.orderKey))
  const index = afterId ? ordered.findIndex((record) => record.id === afterId) + 1 : 0
  if (afterId && index === 0) throw new Error(`after block ${afterId} does not exist`)
  const left = index > 0 ? Number(ordered[index - 1]?.orderKey) : 0
  const right = index < ordered.length ? Number(ordered[index]?.orderKey) : left + 2048
  return String((left + right) / 2)
}

export function adaptBlockCommand(command: BlockCommand, document: BlockDocument): AdaptedBlockOperation {
  if (command.type === 'block.insert') {
    const id = String(command.block.id ?? '')
    if (!id) throw new Error('block.insert requires a block id')
    const record: PortableBlockRecord = { id, orderKey: rankFor(document, id, command.afterId), block: command.block }
    const patch: CanonicalPatch = { op: 'entityUpsert', collection: 'blocks', id, value: record as unknown as JsonObject }
    return { operationType: command.type, strategyId: 'block-document.sequence', strategyVersion: '1.0', payload: command, intent: command, optimisticPatches: [patch] }
  }
  if (command.type === 'block.update') {
    const id = String(command.block.id ?? '')
    const existing = document.blocks.find((record) => record.id === id)
    if (!existing) throw new Error(`block ${id} does not exist`)
    const record: PortableBlockRecord = { ...existing, block: command.block }
    const patch: CanonicalPatch = { op: 'entityUpsert', collection: 'blocks', id, value: record as unknown as JsonObject }
    return { operationType: command.type, strategyId: 'block-document.sequence', strategyVersion: '1.0', payload: command, intent: command, optimisticPatches: [patch] }
  }
  if (command.type === 'block.delete') {
    const patch: CanonicalPatch = { op: 'entityDelete', collection: 'blocks', id: command.blockId }
    return { operationType: command.type, strategyId: 'block-document.sequence', strategyVersion: '1.0', payload: command, intent: command, optimisticPatches: [patch] }
  }
  const patch: CanonicalPatch = { op: 'listOrder', collection: 'blocks', id: command.blockId, position: rankFor(document, command.blockId, command.afterId) }
  return { operationType: command.type, strategyId: 'block-document.sequence', strategyVersion: '1.0', payload: command, intent: command, optimisticPatches: [patch] }
}
