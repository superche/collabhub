import { applyCanonicalPatches } from '@collabhub/domain-json'
import type { CanonicalPatch, JsonObject } from '@collabhub/protocol'
import type { GraphDocument } from '../domain/graph-document.js'

export function applyGraphPatches(document: GraphDocument, patches: readonly CanonicalPatch[]): GraphDocument {
  return applyCanonicalPatches(document as unknown as JsonObject, patches) as unknown as GraphDocument
}
