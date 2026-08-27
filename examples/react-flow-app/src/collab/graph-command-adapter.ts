import type { CanonicalPatch } from '@collabhub/protocol'
import type { GraphCommand, GraphDocument } from '../domain/graph-document.js'
import { buildGraphCommandPatches } from './graph-canonical-patches.js'

export interface AdaptedGraphOperation {
  operationType: string
  strategyId: 'graph.document'
  strategyVersion: '1.0'
  payload: GraphCommand
  intent: GraphCommand
  optimisticPatches: CanonicalPatch[]
}

export function adaptGraphCommand(command: GraphCommand, document: GraphDocument): AdaptedGraphOperation {
  return {
    operationType: command.type,
    strategyId: 'graph.document',
    strategyVersion: '1.0',
    payload: command,
    intent: command,
    optimisticPatches: buildGraphCommandPatches(document, command),
  }
}
