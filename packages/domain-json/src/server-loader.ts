import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { jsonStrategies } from '@collabhub/domain-json'
import type { JsonObject, JsonValue } from '@collabhub/protocol'
import { defineDomainPack, type ConflictStrategy, type DomainPack, type OperationVersionDecision } from '@collabhub/strategy-sdk'

/** Server-only loader shared by standalone and distributed runtimes. */
const MAX_CONFIG_BYTES = 1024 * 1024
const MAX_JSON_DEPTH = 64
const MAX_JSON_NODES = 100_000
const documentIdPlaceholder = '$documentId'

export type StaleOperationAction = 'resolve' | 'reject' | 'resync'

export interface JsonDomainPackConfig {
  formatVersion: 1
  id: string
  schemaVersion: string
  initialState: JsonObject
  /** Exact `$documentId` string values are replaced for each new document. */
  strategies?: string[]
  stalePolicy?: {
    default: StaleOperationAction
    byOperationType?: Record<string, StaleOperationAction>
  }
}

export interface DomainPackModuleApi {
  jsonStrategies: readonly ConflictStrategy<JsonObject>[]
  defineDomainPack: typeof defineDomainPack
}

export type DomainPackModuleFactory = (api: DomainPackModuleApi) => DomainPack<JsonObject> | Promise<DomainPack<JsonObject>>

function boundedString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) throw new Error(`${name} must be a non-empty string up to 256 characters`)
  return value
}

function assertJson(value: unknown): asserts value is JsonValue {
  let nodes = 0
  const visit = (current: unknown, depth: number): void => {
    nodes += 1
    if (nodes > MAX_JSON_NODES) throw new Error(`domain pack JSON exceeds ${MAX_JSON_NODES} nodes`)
    if (depth > MAX_JSON_DEPTH) throw new Error(`domain pack JSON exceeds depth ${MAX_JSON_DEPTH}`)
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return
    if (typeof current === 'number' && Number.isFinite(current)) return
    if (Array.isArray(current)) {
      for (const item of current) visit(item, depth + 1)
      return
    }
    if (!current || typeof current !== 'object') throw new Error('domain pack state must contain only JSON values')
    for (const [key, child] of Object.entries(current)) {
      if (!key || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`domain pack state contains unsafe key ${key}`)
      visit(child, depth + 1)
    }
  }
  visit(value, 0)
}

function replaceDocumentId(value: JsonValue, documentId: string): JsonValue {
  if (value === documentIdPlaceholder) return documentId
  if (Array.isArray(value)) return value.map((item) => replaceDocumentId(item, documentId))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceDocumentId(child, documentId)]))
  }
  return value
}

function staleDecision(action: StaleOperationAction, operationType: string, submittedVersion: number, currentVersion: number): OperationVersionDecision {
  if (action === 'resolve') return { kind: 'resolve' }
  const message = `${operationType} was submitted at version ${submittedVersion}; current version is ${currentVersion}`
  if (action === 'reject') return { kind: 'reject', reason: { code: 'staleVersion', message } }
  return { kind: 'resync', reason: message }
}

function parseJsonDomainPackConfig(value: unknown): JsonDomainPackConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('domain pack config must be a JSON object')
  const raw = value as Record<string, unknown>
  if (raw.formatVersion !== 1) throw new Error('domain pack config formatVersion must be 1')
  const id = boundedString(raw.id, 'domain pack id')
  const schemaVersion = boundedString(raw.schemaVersion, 'domain pack schemaVersion')
  if (!raw.initialState || typeof raw.initialState !== 'object' || Array.isArray(raw.initialState)) throw new Error('domain pack initialState must be a JSON object')
  assertJson(raw.initialState)

  let strategies: string[] | undefined
  if (raw.strategies !== undefined) {
    if (!Array.isArray(raw.strategies) || raw.strategies.some((strategy) => typeof strategy !== 'string')) throw new Error('domain pack strategies must be an array of strategy IDs')
    strategies = raw.strategies.map((strategy) => boundedString(strategy, 'strategy ID'))
  }

  let stalePolicy: JsonDomainPackConfig['stalePolicy']
  if (raw.stalePolicy !== undefined) {
    if (!raw.stalePolicy || typeof raw.stalePolicy !== 'object' || Array.isArray(raw.stalePolicy)) throw new Error('stalePolicy must be an object')
    const policy = raw.stalePolicy as Record<string, unknown>
    const actions = new Set<StaleOperationAction>(['resolve', 'reject', 'resync'])
    if (!actions.has(policy.default as StaleOperationAction)) throw new Error('stalePolicy.default must be resolve, reject, or resync')
    let byOperationType: Record<string, StaleOperationAction> | undefined
    if (policy.byOperationType !== undefined) {
      if (!policy.byOperationType || typeof policy.byOperationType !== 'object' || Array.isArray(policy.byOperationType)) throw new Error('stalePolicy.byOperationType must be an object')
      byOperationType = {}
      for (const [operationType, action] of Object.entries(policy.byOperationType as Record<string, unknown>)) {
        boundedString(operationType, 'operation type')
        if (!actions.has(action as StaleOperationAction)) throw new Error(`invalid stale action for ${operationType}`)
        byOperationType[operationType] = action as StaleOperationAction
      }
    }
    stalePolicy = { default: policy.default as StaleOperationAction, byOperationType }
  }
  return { formatVersion: 1, id, schemaVersion, initialState: raw.initialState as JsonObject, strategies, stalePolicy }
}

export function createJsonDomainPack(config: JsonDomainPackConfig): DomainPack<JsonObject> {
  config = parseJsonDomainPackConfig(config)
  const selectedIds = config.strategies ?? jsonStrategies.map((strategy) => strategy.id)
  const selectedStrategies = selectedIds.map((id) => {
    const strategy = jsonStrategies.find((candidate) => candidate.id === id)
    if (!strategy) throw new Error(`unknown built-in JSON strategy ${id}`)
    return strategy
  })
  if (new Set(selectedIds).size !== selectedIds.length) throw new Error('domain pack strategies must not contain duplicates')

  const pack = defineDomainPack<JsonObject>({
    id: config.id,
    schemaVersion: config.schemaVersion,
    strategies: selectedStrategies,
    initialState(documentId) {
      return replaceDocumentId(config.initialState, documentId) as JsonObject
    },
    ...(config.stalePolicy ? {
      operationVersionPolicy: {
        decide(context) {
          const action = config.stalePolicy!.byOperationType?.[context.operation.operationType] ?? config.stalePolicy!.default
          return staleDecision(action, context.operation.operationType, context.submittedVersion, context.currentVersion)
        },
      },
    } : {}),
  })
  return pack
}

export async function loadJsonDomainPack(path: string): Promise<DomainPack<JsonObject>> {
  const content = await readFile(resolve(path), 'utf8')
  if (Buffer.byteLength(content) > MAX_CONFIG_BYTES) throw new Error(`domain pack config exceeds ${MAX_CONFIG_BYTES} bytes`)
  let parsed: unknown
  try { parsed = JSON.parse(content) }
  catch (error) { throw new Error(`invalid domain pack JSON: ${error instanceof Error ? error.message : String(error)}`) }
  return createJsonDomainPack(parseJsonDomainPackConfig(parsed))
}

function assertDomainPack(value: unknown, source: string): asserts value is DomainPack<JsonObject> {
  if (!value || typeof value !== 'object') throw new Error(`${source} did not return a Domain Pack object`)
  const pack = value as Partial<DomainPack<JsonObject>>
  boundedString(pack.id, 'domain pack id')
  boundedString(pack.schemaVersion, 'domain pack schemaVersion')
  if (!Array.isArray(pack.strategies) || pack.strategies.length === 0) throw new Error('domain pack strategies must be a non-empty array')
  if (typeof pack.initialState !== 'function') throw new Error('domain pack initialState must be a function')
}

export async function loadDomainPackModule(path: string): Promise<DomainPack<JsonObject>> {
  const source = pathToFileURL(resolve(path)).href
  const loaded = await import(source) as { default?: unknown; domainPack?: unknown; createDomainPack?: unknown }
  const exported = loaded.default ?? loaded.domainPack ?? loaded.createDomainPack
  const candidate = typeof exported === 'function'
    ? await (exported as DomainPackModuleFactory)({ jsonStrategies, defineDomainPack })
    : exported
  assertDomainPack(candidate, path)
  return candidate
}

export async function loadDomainPackFromEnvironment(environment: NodeJS.ProcessEnv = process.env): Promise<{ pack: DomainPack<JsonObject>; source: string }> {
  const configPath = environment.COLLABHUB_DOMAIN_PACK_CONFIG
  const modulePath = environment.COLLABHUB_DOMAIN_PACK_MODULE
  if (configPath && modulePath) throw new Error('set only one of COLLABHUB_DOMAIN_PACK_CONFIG or COLLABHUB_DOMAIN_PACK_MODULE')
  if (configPath) return { pack: await loadJsonDomainPack(configPath), source: `config:${resolve(configPath)}` }
  if (modulePath) return { pack: await loadDomainPackModule(modulePath), source: `module:${resolve(modulePath)}` }
  return {
    pack: createJsonDomainPack({
      formatVersion: 1,
      id: 'collabhub.distributed-json',
      schemaVersion: '1.0',
      initialState: { id: documentIdPlaceholder, title: 'CollabHub distributed document', status: 'draft', items: [], sections: [] },
    }),
    source: 'built-in:json',
  }
}
