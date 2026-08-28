import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createJsonDomainPack, loadDomainPackFromEnvironment, loadDomainPackModule, loadJsonDomainPack } from './server-loader.js'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'collabhub-domain-pack-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('distributed Domain Pack loader', () => {
  it('builds a JSON Domain Pack with document placeholders and per-operation stale policy', () => {
    const pack = createJsonDomainPack({
      formatVersion: 1,
      id: 'app.configured',
      schemaVersion: '2.0',
      initialState: { id: '$documentId', title: 'Ready', cards: [] },
      strategies: ['json.property-lww'],
      stalePolicy: { default: 'resync', byOperationType: { 'property.set': 'resolve', 'property.unset': 'reject' } },
    })

    expect(pack.initialState('doc-42')).toEqual({ id: 'doc-42', title: 'Ready', cards: [] })
    expect(pack.strategies.map((strategy) => strategy.id)).toEqual(['json.property-lww'])
    const context = {
      currentVersion: 4, submittedVersion: 2, versionGap: 2, recoveryWindowExceeded: false,
      currentState: pack.initialState('doc-42'), concurrentOperations: [], historyComplete: true,
      operation: { tenantId: 't', documentId: 'doc-42', actorId: 'a', clientId: 'c', operationId: 'op', baseVersion: 2, schemaVersion: '2.0', operationType: 'property.set', strategyId: 'json.property-lww', strategyVersion: '1.0', payload: {} },
    }
    expect(pack.operationVersionPolicy?.decide(context)).toEqual({ kind: 'resolve' })
    expect(pack.operationVersionPolicy?.decide({ ...context, operation: { ...context.operation, operationType: 'property.unset' } })).toMatchObject({ kind: 'reject', reason: { code: 'staleVersion' } })
    expect(pack.operationVersionPolicy?.decide({ ...context, operation: { ...context.operation, operationType: 'entity.create' } })).toMatchObject({ kind: 'resync' })
  })

  it('loads and validates a bounded JSON configuration file', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'domain-pack.json')
    await writeFile(path, JSON.stringify({ formatVersion: 1, id: 'file.pack', schemaVersion: '1.0', initialState: { id: '$documentId', items: [] } }))
    const pack = await loadJsonDomainPack(path)
    expect(pack.id).toBe('file.pack')
    expect(pack.initialState('shared')).toEqual({ id: 'shared', items: [] })
  })

  it('loads a trusted ESM factory without requiring package imports in the mounted file', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'domain-pack.mjs')
    await writeFile(path, `export default ({ jsonStrategies }) => ({ id: 'module.pack', schemaVersion: '1.0', strategies: jsonStrategies, initialState: documentId => ({ id: documentId, linked: true }) })`)
    const pack = await loadDomainPackModule(path)
    expect(pack.id).toBe('module.pack')
    expect(pack.initialState('module-doc')).toEqual({ id: 'module-doc', linked: true })
  })

  it('runs linked-field patches from a mounted ESM strategy', async () => {
    const pack = await loadDomainPackModule(join(process.cwd(), 'deploy/domain-pack/domain-pack.example.mjs'))
    const strategy = pack.strategies.find((candidate) => candidate.id === 'app.rename-and-touch')
    const result = strategy?.resolve({
      currentVersion: 1,
      currentState: pack.initialState('linked-doc'),
      concurrentOperations: [],
      historyComplete: true,
      operation: {
        tenantId: 'tenant', documentId: 'linked-doc', actorId: 'alice', clientId: 'client', operationId: 'rename-1',
        baseVersion: 1, schemaVersion: '1.0', operationType: 'document.renameAndTouch',
        strategyId: 'app.rename-and-touch', strategyVersion: '1.0', payload: { title: 'Ship' },
      },
    })
    expect(result).toMatchObject({ kind: 'accept', patches: [
      { op: 'set', path: '/title', value: 'Ship' },
      { op: 'set', path: '/updatedAt' },
    ] })
  })

  it('rejects ambiguous environment configuration', async () => {
    await expect(loadDomainPackFromEnvironment({ COLLABHUB_DOMAIN_PACK_CONFIG: '/config/a.json', COLLABHUB_DOMAIN_PACK_MODULE: '/config/b.mjs' })).rejects.toThrow('set only one')
  })

  it('keeps the built-in JSON pack as a zero-configuration fallback', async () => {
    const loaded = await loadDomainPackFromEnvironment({})
    expect(loaded.source).toBe('built-in:json')
    expect(loaded.pack.initialState('fallback')).toMatchObject({ id: 'fallback', status: 'draft' })
  })
})
