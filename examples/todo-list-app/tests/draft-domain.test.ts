import { describe, expect, it } from 'vitest'
import { applyDraftCommand, initialDraft } from '../src/domain/draft.js'
import { adaptDraftCommand } from '../src/collab/draft-command-adapter.js'

describe('classic draft domain baseline', () => {
  it('runs without CollabHub and preserves immutable structural sharing', () => {
    const initial = initialDraft('draft')
    const next = applyDraftCommand(initial, { type: 'section.update', sectionId: 'intro', patch: { body: 'Changed' } })
    expect(next).not.toBe(initial)
    expect(next.sections[1]).toBe(initial.sections[1])
    expect(next.revision).toBe(1)
  })

  it('updates task completion and its linked aggregate in the REST domain baseline', () => {
    const initial = initialDraft('draft')
    const next = applyDraftCommand(initial, { type: 'section.setCompleted', sectionId: 'intro', completed: true })
    expect(next.sections.find((section) => section.id === 'intro')?.completed).toBe(true)
    expect(next.completion).toEqual({ completed: 1, total: 2, percent: 50 })
    expect(next.revision).toBe(1)
  })

  it('maps all commands at the narrow collaboration adapter boundary', () => {
    const draft = initialDraft('draft')
    expect(adaptDraftCommand({ type: 'draft.rename', title: 'New' }, draft).operationType).toBe('property.set')
    expect(adaptDraftCommand({ type: 'section.setCompleted', sectionId: 'intro', completed: true }, draft).strategyId).toBe('draft.section-command')
    expect(adaptDraftCommand({ type: 'section.move', sectionId: 'plan' }, draft).strategyId).toBe('json.list-order')
    expect(adaptDraftCommand({ type: 'draft.submitReview', expectedRevision: 0 }, draft).strategyId).toBe('draft.submit-review')
  })
})
