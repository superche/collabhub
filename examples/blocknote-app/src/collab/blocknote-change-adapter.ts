import type { Block } from '@blocknote/core'
import { jsonFingerprint } from '../application/json-fingerprint.js'
import type { BlockCommand } from '../domain/block-document.js'

function jsonBlock(block: Block): Record<string, unknown> {
  return JSON.parse(JSON.stringify(block)) as Record<string, unknown>
}

function equal(left: unknown, right: unknown): boolean {
  return jsonFingerprint(left) === jsonFingerprint(right)
}

export function diffBlockNoteDocuments(previous: readonly Block[], next: readonly Block[]): BlockCommand[] {
  const previousById = new Map(previous.map((block) => [block.id, jsonBlock(block)]))
  const nextById = new Map(next.map((block) => [block.id, jsonBlock(block)]))
  const commands: BlockCommand[] = []
  const virtualOrder = previous.map((block) => block.id)

  for (const id of [...virtualOrder]) {
    if (nextById.has(id)) continue
    commands.push({ type: 'block.delete', blockId: id })
    virtualOrder.splice(virtualOrder.indexOf(id), 1)
  }

  for (let index = 0; index < next.length; index++) {
    const block = next[index]!
    if (previousById.has(block.id)) continue
    const afterId = next[index - 1]?.id
    commands.push({ type: 'block.insert', block: nextById.get(block.id)!, afterId })
    virtualOrder.splice(index, 0, block.id)
  }

  for (let index = 0; index < next.length; index++) {
    const id = next[index]!.id
    if (virtualOrder[index] === id) continue
    const currentIndex = virtualOrder.indexOf(id)
    if (currentIndex === -1) continue
    virtualOrder.splice(currentIndex, 1)
    virtualOrder.splice(index, 0, id)
    commands.push({ type: 'block.move', blockId: id, afterId: next[index - 1]?.id })
  }

  for (const block of next) {
    const before = previousById.get(block.id)
    const after = nextById.get(block.id)!
    if (before && !equal(before, after)) commands.push({ type: 'block.update', block: after })
  }
  return commands
}
