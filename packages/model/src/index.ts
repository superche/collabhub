import type { CanonicalPatch, CollaborationOperation, JsonObject, JsonValue } from '@collabhub/protocol'
import type { ConflictStrategy, DomainPack, OperationVersionPolicy } from '@collabhub/strategy-sdk'

export type ModelCommand = { type: string }
export type StaleCommandPolicy = 'rebase' | 'reject' | 'resync'

export interface CollaborationModelOptions<TState extends object, TCommand extends ModelCommand> {
  id: string
  schemaVersion?: string
  initialState(documentId: string): TState
  /** Mutate the draft or return a replacement. The server always runs this again on current state. */
  reduce(draft: TState, command: TCommand): TState | void
  validate?(nextState: Readonly<TState>, command: Readonly<TCommand>): true | string
  stale?: StaleCommandPolicy | ((command: Readonly<TCommand>) => StaleCommandPolicy)
}

export interface CollaborationModel<TState extends object, TCommand extends ModelCommand>
  extends Required<Pick<CollaborationModelOptions<TState, TCommand>, 'id' | 'initialState' | 'reduce'>> {
  schemaVersion: string
  validate?: CollaborationModelOptions<TState, TCommand>['validate']
  stale: NonNullable<CollaborationModelOptions<TState, TCommand>['stale']>
}

export function defineCollaborationModel<TState extends object, TCommand extends ModelCommand>(
  options: CollaborationModelOptions<TState, TCommand>,
): CollaborationModel<TState, TCommand> {
  if (!options.id.trim()) throw new Error('model id is required')
  return { ...options, schemaVersion: options.schemaVersion ?? '1.0', stale: options.stale ?? 'rebase' }
}

export function runModelCommand<TState extends object, TCommand extends ModelCommand>(
  model: CollaborationModel<TState, TCommand>,
  state: Readonly<TState>,
  command: Readonly<TCommand>,
): { state: TState; patches: CanonicalPatch[] } {
  if (!command || typeof command.type !== 'string' || !command.type.trim()) throw new Error('command.type is required')
  assertJsonObject(command)
  const draft = cloneJson(state) as TState
  const replacement = model.reduce(draft, command as TCommand)
  const next = (replacement ?? draft) as TState
  assertJsonObject(next)
  const validation = model.validate?.(next, command)
  if (typeof validation === 'string') throw new Error(validation)
  return { state: next, patches: diffJsonObjects(state, next) }
}

export function adaptModelCommand<TState extends object, TCommand extends ModelCommand>(
  model: CollaborationModel<TState, TCommand>,
  command: TCommand,
  currentState: Readonly<TState>,
): { operation: Omit<CollaborationOperation, 'tenantId' | 'documentId' | 'actorId' | 'clientId' | 'operationId' | 'baseVersion' | 'schemaVersion'>; optimisticPatches: CanonicalPatch[] } {
  const { patches } = runModelCommand(model, currentState, command)
  return {
    operation: {
      operationType: 'model.command',
      strategyId: `${model.id}.commands`,
      strategyVersion: '1.0',
      payload: { command },
    },
    optimisticPatches: patches,
  }
}

export function createModelDomainPack<TState extends object, TCommand extends ModelCommand>(
  model: CollaborationModel<TState, TCommand>,
): DomainPack<TState & JsonObject> {
  const strategy: ConflictStrategy<TState & JsonObject> = {
    id: `${model.id}.commands`,
    version: '1.0',
    supports: (operationType, schemaVersion) => operationType === 'model.command' && schemaVersion === model.schemaVersion,
    resolve(context) {
      const command = readCommand<TCommand>(context.operation.payload)
      if (!command) return invalid('model.command requires a JSON command with a type')
      try { return { kind: 'accept', patches: runModelCommand(model, context.currentState, command).patches } }
      catch (error) { return invalid(error instanceof Error ? error.message : String(error)) }
    },
  }
  const operationVersionPolicy: OperationVersionPolicy<TState & JsonObject> = {
    decide(context) {
      const command = readCommand<TCommand>(context.operation.payload)
      if (!command) return { kind: 'resolve' }
      const policy = typeof model.stale === 'function' ? model.stale(command) : model.stale
      if (context.versionGap === 0 || policy === 'rebase') return { kind: 'resolve' }
      if (policy === 'resync') return { kind: 'resync', reason: `command ${command.type} requires current state` }
      return { kind: 'reject', reason: { code: 'staleVersion', message: `command ${command.type} was based on version ${context.submittedVersion}; current version is ${context.currentVersion}` } }
    },
  }
  return {
    id: model.id,
    schemaVersion: model.schemaVersion,
    strategies: [strategy],
    operationVersionPolicy,
    initialState: (documentId) => asJsonState(model.initialState(documentId)),
  }
}

export function diffJsonObjects(before: Readonly<object>, after: Readonly<object>): CanonicalPatch[] {
  assertJsonObject(before)
  assertJsonObject(after)
  const patches: CanonicalPatch[] = []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of [...keys].sort()) diffValue(before[key], after[key], `/${escapePointer(key)}`, patches)
  return patches
}

function diffValue(before: JsonValue | undefined, after: JsonValue | undefined, path: string, patches: CanonicalPatch[]): void {
  if (jsonEqual(before, after)) return
  if (after === undefined) { patches.push({ op: 'remove', path }); return }
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of [...keys].sort()) diffValue(before[key], after[key], `${path}/${escapePointer(key)}`, patches)
    return
  }
  patches.push({ op: 'set', path, value: cloneJson(after) })
}

function readCommand<TCommand extends ModelCommand>(payload: unknown): TCommand | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const command = (payload as { command?: unknown }).command
  if (!command || typeof command !== 'object' || typeof (command as { type?: unknown }).type !== 'string') return undefined
  return command as TCommand
}

function invalid(message: string) {
  return { kind: 'reject' as const, reason: { code: 'invalidOperation' as const, message } }
}

function escapePointer(value: string): string {
  if (!value || value === '__proto__' || value === 'prototype' || value === 'constructor') throw new Error(`unsafe state key: ${value}`)
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function jsonEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) return true
  if (left === undefined || right === undefined || typeof left !== 'object' || typeof right !== 'object') return false
  return JSON.stringify(left) === JSON.stringify(right)
}

function cloneJson<T>(value: T): T {
  return structuredClone(value)
}

function assertJsonObject(value: unknown): asserts value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('model state must be a JSON object')
  JSON.stringify(value)
}

function asJsonState<TState extends object>(state: TState): TState & JsonObject {
  assertJsonObject(state)
  return state as TState & JsonObject
}
