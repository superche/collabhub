import { defineCollaborationModel } from '@collabhub/model'

export interface DocumentMetadata {
  documentId: string
  title: string
  status: 'draft' | 'review' | 'published'
}

export type MetadataCommand =
  | { type: 'metadata.titleChanged'; title: string }
  | { type: 'metadata.statusChanged'; status: DocumentMetadata['status'] }

/**
 * CollabHub owns business metadata only. The document body intentionally does
 * not exist in this model; Yjs is its single writer and source of truth.
 */
export const documentMetadataModel = defineCollaborationModel<DocumentMetadata, MetadataCommand>({
  id: 'example.yjs-hybrid.metadata',
  initialState: documentId => ({ documentId, title: 'Shared product brief', status: 'draft' }),
  reduce(draft, command) {
    if (command.type === 'metadata.titleChanged') draft.title = command.title
    if (command.type === 'metadata.statusChanged') draft.status = command.status
  },
  validate(document) {
    if (!document.title.trim()) return 'Title is required'
    if (document.title.length > 120) return 'Title must be at most 120 characters'
    return true
  },
  stale: 'rebase',
})
