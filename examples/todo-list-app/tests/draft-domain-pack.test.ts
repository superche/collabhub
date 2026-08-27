import { describe, expect, it } from 'vitest'
import type { CollaborationOperation, JsonObject } from '@collabhub/protocol'
import { AuthoritativeDocumentSession, InMemoryStorageAdapter } from '@collabhub/server-core'
import { DraftDomainPack } from '../server/draft-domain-pack.js'
import type { DraftDocument } from '../src/domain/draft.js'

function operation(operationId: string, operationType: string, payload: unknown, baseVersion = 0): CollaborationOperation {
  return {
    tenantId: 'demo', documentId: 'linked', actorId: operationId, clientId: operationId,
    operationId, baseVersion, schemaVersion: '1.0', operationType,
    strategyId: 'draft.section-command', strategyVersion: '1.0', payload,
  }
}

describe('DraftDomainPack linked canonical patches', () => {
  it('commits the task and all derived completion fields under one canonical version', async () => {
    const session = new AuthoritativeDocumentSession({
      tenantId: 'demo', documentId: 'linked', domainPack: DraftDomainPack,
      storage: new InMemoryStorageAdapter<JsonObject>(),
    })
    const result = await session.submit(operation('complete-intro', 'section.setCompleted', {
      type: 'section.setCompleted', sectionId: 'intro', completed: true,
    }))

    expect(result.kind).toBe('accepted')
    expect(result.kind === 'accepted' && result.canonicalVersion).toBe(1)
    expect(result.kind === 'accepted' && result.patches).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'entityUpsert', collection: 'sections', id: 'intro' }),
      { op: 'set', path: '/completion/completed', value: 1 },
      { op: 'set', path: '/completion/total', value: 2 },
      { op: 'set', path: '/completion/percent', value: 50 },
      { op: 'set', path: '/revision', value: 1 },
    ]))
    const state = session.canonicalState as unknown as DraftDocument
    expect(state.sections.find((section) => section.id === 'intro')?.completed).toBe(true)
    expect(state.completion).toEqual({ completed: 1, total: 2, percent: 50 })
    expect(state.revision).toBe(1)
  })

  it('recomputes linked progress from authoritative state for concurrent commands', async () => {
    const session = new AuthoritativeDocumentSession({
      tenantId: 'demo', documentId: 'linked', domainPack: DraftDomainPack,
      storage: new InMemoryStorageAdapter<JsonObject>(),
    })
    await Promise.all([
      session.submit(operation('complete-intro', 'section.setCompleted', { type: 'section.setCompleted', sectionId: 'intro', completed: true })),
      session.submit(operation('complete-plan', 'section.setCompleted', { type: 'section.setCompleted', sectionId: 'plan', completed: true })),
    ])
    const state = session.canonicalState as unknown as DraftDocument
    expect(state.completion).toEqual({ completed: 2, total: 2, percent: 100 })
    expect(state.revision).toBe(2)
    expect(session.canonicalVersion).toBe(2)
  })

  it('uses the business version policy to rebase a stale linked command on authoritative state', async () => {
    const session = new AuthoritativeDocumentSession({
      tenantId: 'demo', documentId: 'linked', domainPack: DraftDomainPack,
      storage: new InMemoryStorageAdapter<JsonObject>(), maxRecoveryGap: 0,
    })
    await session.submit(operation('complete-intro', 'section.setCompleted', {
      type: 'section.setCompleted', sectionId: 'intro', completed: true,
    }))
    const stale = await session.submit(operation('complete-plan-stale', 'section.setCompleted', {
      type: 'section.setCompleted', sectionId: 'plan', completed: true,
    }, 0))
    expect(stale.kind).toBe('accepted')
    const state = session.canonicalState as unknown as DraftDocument
    expect(state.completion).toEqual({ completed: 2, total: 2, percent: 100 })
    expect(state.revision).toBe(2)
  })

  it('keeps totals consistent when tasks are added and deleted', async () => {
    const session = new AuthoritativeDocumentSession({
      tenantId: 'demo', documentId: 'linked', domainPack: DraftDomainPack,
      storage: new InMemoryStorageAdapter<JsonObject>(),
    })
    await session.submit(operation('add-task', 'section.add', {
      type: 'section.add', sectionId: 'ship', heading: 'Ship release', after: 'plan',
    }))
    expect((session.canonicalState as unknown as DraftDocument).completion).toEqual({ completed: 0, total: 3, percent: 0 })
    await session.submit(operation('delete-task', 'section.delete', {
      type: 'section.delete', sectionId: 'intro',
    }, 1))
    expect((session.canonicalState as unknown as DraftDocument).completion).toEqual({ completed: 0, total: 2, percent: 0 })
  })

  it('deduplicates a linked command without applying derived fields twice', async () => {
    const session = new AuthoritativeDocumentSession({
      tenantId: 'demo', documentId: 'linked', domainPack: DraftDomainPack,
      storage: new InMemoryStorageAdapter<JsonObject>(),
    })
    const linked = operation('same', 'section.setCompleted', { type: 'section.setCompleted', sectionId: 'intro', completed: true })
    await session.submit(linked)
    const duplicate = await session.submit(linked)
    expect(duplicate.kind === 'accepted' && duplicate.duplicate).toBe(true)
    expect(session.canonicalVersion).toBe(1)
    expect((session.canonicalState as unknown as DraftDocument).completion.completed).toBe(1)
  })

  it('executes review transition rules on the authoritative server state', async () => {
    const session = new AuthoritativeDocumentSession({
      tenantId: 'demo', documentId: 'linked', domainPack: DraftDomainPack,
      storage: new InMemoryStorageAdapter<JsonObject>(),
    })
    const result = await session.submit({
      ...operation('submit-review', 'draft.submitReview', { type: 'draft.submitReview', expectedRevision: 0 }),
      strategyId: 'draft.submit-review',
    })
    expect(result.kind).toBe('accepted')
    expect((session.canonicalState as unknown as DraftDocument).status).toBe('reviewing')
    expect((session.canonicalState as unknown as DraftDocument).revision).toBe(1)
  })
})
