import type { CanonicalPatch } from '@collabhub/protocol'
import type { DraftCommand, DraftDocument, DraftSection } from '../domain/draft.js'

export interface AdaptedDraftOperation {
  operationType: string
  strategyId: string
  strategyVersion: string
  payload: unknown
  intent: DraftCommand
  optimisticPatches: CanonicalPatch[]
}

export function adaptDraftCommand(command: DraftCommand, draft: DraftDocument): AdaptedDraftOperation {
  if (command.type === 'draft.rename') {
    const patch: CanonicalPatch = { op: 'set', path: '/title', value: command.title }
    return { operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0', payload: { path: '/title', value: command.title }, intent: command, optimisticPatches: [patch] }
  }
  if (command.type === 'section.add') {
    const ordered = [...draft.sections].sort((a, b) => Number(a.orderKey) - Number(b.orderKey))
    const index = command.after ? ordered.findIndex((section) => section.id === command.after) + 1 : 0
    const left = index > 0 ? Number(ordered[index - 1]?.orderKey) : 0
    const right = index < ordered.length ? Number(ordered[index]?.orderKey) : left + 2048
    const section: DraftSection = { id: command.sectionId, heading: command.heading, body: '', orderKey: String((left + right) / 2) }
    const patch: CanonicalPatch = { op: 'entityUpsert', collection: 'sections', id: section.id, value: section as unknown as Record<string, any> }
    return { operationType: 'entity.create', strategyId: 'json.entity-lifecycle', strategyVersion: '1.0', payload: { collection: 'sections', id: section.id, value: section }, intent: command, optimisticPatches: [patch] }
  }
  if (command.type === 'section.update') {
    const current = draft.sections.find((section) => section.id === command.sectionId)
    if (!current) throw new Error('section does not exist')
    const next = { ...current, ...command.patch }
    const patch: CanonicalPatch = { op: 'entityUpsert', collection: 'sections', id: next.id, value: next as unknown as Record<string, any> }
    return { operationType: 'entity.restore', strategyId: 'json.entity-lifecycle', strategyVersion: '1.0', payload: { collection: 'sections', id: next.id, value: next }, intent: command, optimisticPatches: [patch] }
  }
  if (command.type === 'section.move') {
    return { operationType: 'list.move', strategyId: 'json.list-order', strategyVersion: '1.0', payload: { collection: 'sections', id: command.sectionId, afterId: command.after }, intent: command, optimisticPatches: [] }
  }
  if (command.type === 'section.delete') {
    const patch: CanonicalPatch = { op: 'entityDelete', collection: 'sections', id: command.sectionId }
    return { operationType: 'entity.delete', strategyId: 'json.entity-lifecycle', strategyVersion: '1.0', payload: { collection: 'sections', id: command.sectionId }, intent: command, optimisticPatches: [patch] }
  }
  const patch: CanonicalPatch = { op: 'set', path: '/status', value: 'reviewing' }
  return { operationType: 'transaction.apply', strategyId: 'json.reject-if-stale', strategyVersion: '1.0', payload: { patches: [patch] }, intent: command, optimisticPatches: [] }
}
