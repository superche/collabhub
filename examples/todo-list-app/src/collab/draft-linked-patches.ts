import type { CanonicalPatch, JsonObject } from '@collabhub/protocol'
import { applyDraftCommand, type DraftCommand, type DraftDocument } from '../domain/draft.js'

export type ServerSectionCommand = Extract<DraftCommand,
  { type: 'section.add' | 'section.update' | 'section.delete' | 'section.setCompleted' }
>

export function isServerSectionCommand(command: unknown): command is ServerSectionCommand {
  if (!command || typeof command !== 'object') return false
  const type = (command as { type?: unknown }).type
  return type === 'section.add' || type === 'section.update' || type === 'section.delete' || type === 'section.setCompleted'
}

export function buildSectionCommandPatches(draft: DraftDocument, command: ServerSectionCommand): CanonicalPatch[] {
  const next = applyDraftCommand(draft, command)
  let entityPatch: CanonicalPatch

  if (command.type === 'section.add') {
    const section = next.sections.find((candidate) => candidate.id === command.sectionId)
    if (!section) throw new Error('section was not created')
    entityPatch = { op: 'entityUpsert', collection: 'sections', id: section.id, value: section as unknown as JsonObject }
  } else if (command.type === 'section.delete') {
    entityPatch = { op: 'entityDelete', collection: 'sections', id: command.sectionId }
  } else if (command.type === 'section.update') {
    entityPatch = {
      op: 'entityUpsert', collection: 'sections', id: command.sectionId,
      value: { id: command.sectionId, ...command.patch },
    }
  } else {
    entityPatch = {
      op: 'entityUpsert', collection: 'sections', id: command.sectionId,
      value: { id: command.sectionId, completed: command.completed },
    }
  }

  if (command.type === 'section.update') return [entityPatch]

  return [
    entityPatch,
    { op: 'set', path: '/completion/completed', value: next.completion.completed },
    { op: 'set', path: '/completion/total', value: next.completion.total },
    { op: 'set', path: '/completion/percent', value: next.completion.percent },
  ]
}
