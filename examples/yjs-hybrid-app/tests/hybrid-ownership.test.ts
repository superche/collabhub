import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { runModelCommand } from '@collabhub/model'
import { documentMetadataModel } from '../src/shared/document-model.js'

describe('CollabHub + Yjs ownership boundary', () => {
  it('keeps body text out of the CollabHub business model', () => {
    const initial = documentMetadataModel.initialState('doc-1')
    const result = runModelCommand(documentMetadataModel, initial, {
      type: 'metadata.statusChanged', status: 'review',
    })

    expect(result.state).toEqual({ documentId: 'doc-1', title: 'Shared product brief', status: 'review' })
    expect('body' in result.state).toBe(false)
  })

  it('merges concurrent character inserts through Yjs', () => {
    const alice = new Y.Doc()
    const bob = new Y.Doc()
    const aliceText = alice.getText('body')
    const bobText = bob.getText('body')
    aliceText.insert(0, 'Ship')
    Y.applyUpdate(bob, Y.encodeStateAsUpdate(alice))

    const aliceUpdates: Uint8Array[] = []
    const bobUpdates: Uint8Array[] = []
    alice.on('update', update => aliceUpdates.push(update))
    bob.on('update', update => bobUpdates.push(update))

    aliceText.insert(4, ' today')
    bobText.insert(4, ' safely')
    for (const update of aliceUpdates) Y.applyUpdate(bob, update)
    for (const update of bobUpdates) Y.applyUpdate(alice, update)

    expect(aliceText.toString()).toBe(bobText.toString())
    expect(aliceText.toString()).toContain(' today')
    expect(aliceText.toString()).toContain(' safely')
  })
})
