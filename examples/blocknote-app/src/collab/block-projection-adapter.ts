import type { Block } from '@blocknote/core'
import { applyCanonicalPatches } from '@collabhub/domain-json'
import type { CanonicalPatch, JsonObject } from '@collabhub/protocol'
import type { BlockDocument, PortableBlockRecord } from '../domain/block-document.js'

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function blockNoteBlockToRecord(block: Block, orderKey: string): PortableBlockRecord {
  const value = cloneJson(block) as unknown as Record<string, unknown>
  return { id: block.id, orderKey, block: value }
}

export function documentToBlockNoteBlocks(document: BlockDocument): Block[] {
  return [...document.blocks]
    .sort((left, right) => Number(left.orderKey) - Number(right.orderKey))
    .map((record) => cloneJson(record.block) as unknown as Block)
}

export function applyBlockPatches(document: BlockDocument, patches: readonly CanonicalPatch[]): BlockDocument {
  const next = applyCanonicalPatches(document as unknown as JsonObject, patches) as unknown as BlockDocument
  return { ...next, blocks: [...next.blocks].sort((left, right) => Number(left.orderKey) - Number(right.orderKey)) }
}
