export type DraftStatus = 'draft' | 'reviewing' | 'published'

export interface DraftSection {
  id: string
  heading: string
  body: string
  orderKey: string
  completed: boolean
}

export interface DraftCompletion {
  completed: number
  total: number
  percent: number
}

export interface DraftDocument {
  id: string
  revision: number
  title: string
  status: DraftStatus
  sections: DraftSection[]
  completion: DraftCompletion
  metadata: Record<string, unknown>
}

export type DraftCommand =
  | { type: 'draft.rename'; title: string }
  | { type: 'section.add'; sectionId: string; heading: string; after?: string }
  | { type: 'section.update'; sectionId: string; patch: Partial<Pick<DraftSection, 'heading' | 'body'>> }
  | { type: 'section.setCompleted'; sectionId: string; completed: boolean }
  | { type: 'section.move'; sectionId: string; after?: string }
  | { type: 'section.delete'; sectionId: string }
  | { type: 'draft.submitReview'; expectedRevision: number }

export type DraftDomainEvent =
  | { type: 'draft.replaced'; draft: DraftDocument }
  | { type: 'draft.changed'; draft: DraftDocument }

export interface DraftCommandResult {
  ok: boolean
  revision: number
  reason?: string
}

export function initialDraft(id: string): DraftDocument {
  return {
    id, revision: 0, title: 'Launch checklist', status: 'draft', metadata: {},
    sections: [
      { id: 'intro', heading: 'Write introduction', body: 'Coordinate the first task together.', orderKey: '1024', completed: false },
      { id: 'plan', heading: 'Plan milestones', body: 'Assign owners and due dates.', orderKey: '2048', completed: false },
    ],
    completion: { completed: 0, total: 2, percent: 0 },
  }
}

export function calculateDraftCompletion(sections: readonly DraftSection[]): DraftCompletion {
  const completed = sections.filter((section) => section.completed).length
  const total = sections.length
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) }
}

export function normalizeDraftDocument(draft: DraftDocument): DraftDocument {
  const sections = draft.sections.map((section) => ({ ...section, completed: section.completed === true }))
  return { ...draft, sections, completion: calculateDraftCompletion(sections) }
}

function withSections(draft: DraftDocument, sections: DraftSection[]): DraftDocument {
  return { ...draft, revision: draft.revision + 1, sections, completion: calculateDraftCompletion(sections) }
}

export function applyDraftCommand(draft: DraftDocument, command: DraftCommand): DraftDocument {
  if (command.type === 'draft.rename') return { ...draft, title: command.title, revision: draft.revision + 1 }
  if (command.type === 'section.add') {
    if (draft.sections.some((section) => section.id === command.sectionId)) throw new Error('section already exists')
    const ordered = [...draft.sections].sort((a, b) => Number(a.orderKey) - Number(b.orderKey))
    const index = command.after ? ordered.findIndex((section) => section.id === command.after) + 1 : 0
    const left = index > 0 ? Number(ordered[index - 1]?.orderKey) : 0
    const right = index < ordered.length ? Number(ordered[index]?.orderKey) : left + 2048
    return withSections(draft, [...draft.sections, { id: command.sectionId, heading: command.heading, body: '', orderKey: String((left + right) / 2), completed: false }])
  }
  if (command.type === 'section.update') {
    if (!draft.sections.some((section) => section.id === command.sectionId)) throw new Error('section does not exist')
    return { ...draft, revision: draft.revision + 1, sections: draft.sections.map((section) => section.id === command.sectionId ? { ...section, ...command.patch } : section) }
  }
  if (command.type === 'section.setCompleted') {
    if (!draft.sections.some((section) => section.id === command.sectionId)) throw new Error('section does not exist')
    return withSections(draft, draft.sections.map((section) => section.id === command.sectionId ? { ...section, completed: command.completed } : section))
  }
  if (command.type === 'section.move') {
    const moving = draft.sections.find((section) => section.id === command.sectionId)
    if (!moving) throw new Error('section does not exist')
    const ordered = draft.sections.filter((section) => section.id !== command.sectionId).sort((a, b) => Number(a.orderKey) - Number(b.orderKey))
    const index = command.after ? ordered.findIndex((section) => section.id === command.after) + 1 : 0
    if (command.after && index === 0) throw new Error('after section does not exist')
    const left = index > 0 ? Number(ordered[index - 1]?.orderKey) : 0
    const right = index < ordered.length ? Number(ordered[index]?.orderKey) : left + 2048
    return { ...draft, revision: draft.revision + 1, sections: draft.sections.map((section) => section.id === command.sectionId ? { ...section, orderKey: String((left + right) / 2) } : section) }
  }
  if (command.type === 'section.delete') {
    if (!draft.sections.some((section) => section.id === command.sectionId)) throw new Error('section does not exist')
    return withSections(draft, draft.sections.filter((section) => section.id !== command.sectionId))
  }
  if (draft.revision !== command.expectedRevision) throw new Error('stale revision')
  if (draft.status !== 'draft') throw new Error('only a draft can enter review')
  return { ...draft, revision: draft.revision + 1, status: 'reviewing' }
}
