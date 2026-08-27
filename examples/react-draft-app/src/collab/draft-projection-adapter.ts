import { applyCanonicalPatches } from '@collabhub/domain-json'
import type { CanonicalPatch, JsonObject } from '@collabhub/protocol'
import type { DraftDocument } from '../domain/draft.js'

export function applyDraftPatches(draft: DraftDocument, patches: readonly CanonicalPatch[]): DraftDocument {
  const next = applyCanonicalPatches(draft as unknown as JsonObject, patches) as unknown as DraftDocument
  return { ...next, sections: [...next.sections].sort((a, b) => Number(a.orderKey) - Number(b.orderKey)) }
}
