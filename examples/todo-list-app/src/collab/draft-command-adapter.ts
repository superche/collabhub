import type { CanonicalPatch } from '@collabhub/protocol'
import type { DraftCommand, DraftDocument } from '../domain/draft.js'
import { buildSectionCommandPatches, isServerSectionCommand } from './draft-linked-patches.js'

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
  if (isServerSectionCommand(command)) {
    return { operationType: command.type, strategyId: 'draft.section-command', strategyVersion: '1.0', payload: command, intent: command, optimisticPatches: buildSectionCommandPatches(draft, command) }
  }
  if (command.type === 'section.move') {
    return { operationType: 'list.move', strategyId: 'json.list-order', strategyVersion: '1.0', payload: { collection: 'sections', id: command.sectionId, afterId: command.after }, intent: command, optimisticPatches: [] }
  }
  return { operationType: command.type, strategyId: 'draft.submit-review', strategyVersion: '1.0', payload: command, intent: command, optimisticPatches: [] }
}
