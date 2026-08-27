import { jsonStrategies } from '@collabhub/domain-json'
import type { CanonicalPatch, JsonObject } from '@collabhub/protocol'
import { defineDomainPack, type ConflictStrategy, type ResolveResult } from '@collabhub/strategy-sdk'
import { buildSectionCommandPatches, isServerSectionCommand } from '../src/collab/draft-linked-patches.js'
import { applyDraftCommand, calculateDraftCompletion, initialDraft, type DraftCommand, type DraftDocument } from '../src/domain/draft.js'

function invalid(message: string): ResolveResult {
  return { kind: 'reject', reason: { code: 'invalidOperation', message } }
}

function isSubmitReviewCommand(value: unknown): value is Extract<DraftCommand, { type: 'draft.submitReview' }> {
  return Boolean(value && typeof value === 'object'
    && (value as { type?: unknown }).type === 'draft.submitReview'
    && typeof (value as { expectedRevision?: unknown }).expectedRevision === 'number')
}

const sectionCommandStrategy: ConflictStrategy<JsonObject> = {
  id: 'draft.section-command',
  version: '1.0',
  supports(operationType, schemaVersion) {
    return schemaVersion === '1.0' && ['section.add', 'section.update', 'section.delete', 'section.setCompleted'].includes(operationType)
  },
  resolve(context) {
    const command = context.operation.payload
    if (!isServerSectionCommand(command) || command.type !== context.operation.operationType) return invalid('section command payload does not match operation type')
    try {
      return { kind: 'accept', patches: buildSectionCommandPatches(context.currentState as unknown as DraftDocument, command) }
    } catch (error) {
      return invalid(error instanceof Error ? error.message : String(error))
    }
  },
}

const submitReviewStrategy: ConflictStrategy<JsonObject> = {
  id: 'draft.submit-review',
  version: '1.0',
  supports: (operationType, schemaVersion) => schemaVersion === '1.0' && operationType === 'draft.submitReview',
  resolve(context) {
    const command = context.operation.payload
    if (!isSubmitReviewCommand(command)) return invalid('draft.submitReview payload is required')
    try {
      const next = applyDraftCommand(context.currentState as unknown as DraftDocument, command)
      return { kind: 'accept', patches: [{ op: 'set', path: '/status', value: next.status }] }
    } catch (error) {
      return {
        kind: 'reject',
        reason: { code: command.expectedRevision !== context.currentVersion ? 'staleVersion' : 'invalidOperation', message: error instanceof Error ? error.message : String(error) },
      }
    }
  },
}

function withCanonicalRevision(strategy: ConflictStrategy<JsonObject>): ConflictStrategy<JsonObject> {
  return {
    id: strategy.id,
    version: strategy.version,
    supports: (operationType, schemaVersion) => strategy.supports(operationType, schemaVersion),
    resolve(context) {
      const result = strategy.resolve(context)
      if (result.kind !== 'accept') return result
      const revisionPatch: CanonicalPatch = { op: 'set', path: '/revision', value: context.currentVersion + 1 }
      return { kind: 'accept', patches: [...result.patches, revisionPatch] }
    },
  }
}

export const DraftDomainPack = defineDomainPack<JsonObject>({
  id: 'example.draft',
  schemaVersion: '1.0',
  strategies: [...jsonStrategies, sectionCommandStrategy, submitReviewStrategy].map(withCanonicalRevision),
  invariants: [{
    id: 'draft.unique-section-id',
    check(state) {
      const draft = state as unknown as DraftDocument
      const ids = draft.sections.map((section) => section.id)
      return new Set(ids).size === ids.length || 'section ids must be unique'
    },
  }, {
    id: 'draft.valid-status',
    check(state) {
      return ['draft', 'reviewing', 'published'].includes(String(state.status)) || 'invalid draft status'
    },
  }, {
    id: 'draft.completion-consistent',
    check(state) {
      const draft = state as unknown as DraftDocument
      const expected = calculateDraftCompletion(draft.sections)
      return expected.completed === draft.completion.completed && expected.total === draft.completion.total && expected.percent === draft.completion.percent
        ? true
        : 'completion must match sections'
    },
  }],
  initialState(documentId) { return initialDraft(documentId) as unknown as JsonObject },
})
