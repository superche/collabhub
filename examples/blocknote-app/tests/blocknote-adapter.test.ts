import type { Block } from '@blocknote/core'
import { describe, expect, it } from 'vitest'
import { jsonFingerprint } from '../src/application/json-fingerprint.js'
import { initialBlockDocument } from '../src/domain/block-document.js'
import { documentToBlockNoteBlocks } from '../src/collab/block-projection-adapter.js'
import { diffBlockNoteDocuments } from '../src/collab/blocknote-change-adapter.js'

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }

describe('BlockNote change adapter', () => {
  it('treats BlockNote prop key normalization as the same semantic block', () => {
    expect(jsonFingerprint({ props: { textColor: 'default', backgroundColor: 'default' } }))
      .toBe(jsonFingerprint({ props: { backgroundColor: 'default', textColor: 'default' } }))
    const previous = documentToBlockNoteBlocks(initialBlockDocument('doc'))
    const reordered = clone(previous)
    const welcome = reordered.find((block) => block.id === 'welcome')!
    welcome.props = { backgroundColor: 'default', textColor: 'default', textAlignment: 'left', level: 1, isToggleable: false }
    expect(diffBlockNoteDocuments(previous, reordered)).toEqual([])
  })

  it('turns a rich-text edit into one incremental block update', () => {
    const previous = documentToBlockNoteBlocks(initialBlockDocument('doc'))
    const next = clone(previous)
    const intro = next.find((block) => block.id === 'intro')!
    intro.content = [{ type: 'text', text: 'Changed in BlockNote', styles: {} }]

    const commands = diffBlockNoteDocuments(previous, next)

    expect(commands).toEqual([{ type: 'block.update', block: clone(intro) }])
    expect(JSON.stringify(commands)).not.toContain('Changes travel as incremental block operations.')
  })

  it('maps insert, delete, and reorder without replacing the document', () => {
    const previous = documentToBlockNoteBlocks(initialBlockDocument('doc'))
    const inserted = { id: 'new', type: 'paragraph', props: {}, content: [], children: [] } as unknown as Block
    const next = [previous[2]!, previous[0]!, inserted]

    const commands = diffBlockNoteDocuments(previous, next)

    expect(commands.map((command) => command.type)).toEqual(['block.delete', 'block.insert', 'block.move'])
    expect(commands).not.toContainEqual(expect.objectContaining({ type: 'document.replace' }))
  })
})
