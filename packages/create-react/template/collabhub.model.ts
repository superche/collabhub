import { defineCollaborationModel } from '@collabhub/client-core'
import type { DocumentCommand, DocumentState } from './src/application.js'

export const collabModel = defineCollaborationModel<DocumentState, DocumentCommand>({
  id: 'starter',
  initialState: (documentId) => ({ id: documentId, title: 'Shared document', wordCount: 2 }),
  reduce(draft, command) {
    draft.title = command.title
    draft.wordCount = command.title.trim().split(/\s+/).filter(Boolean).length
  },
  validate: (state) => state.title.trim() ? true : 'title cannot be empty',
})
