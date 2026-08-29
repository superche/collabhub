import { describe, expect, it } from 'vitest'
import { defineDomainPack, migrateDomainState } from './index.js'

describe('domain schema migrations', () => {
  it('applies a deterministic forward chain', () => {
    const pack = defineDomainPack({
      id: 'test.migrations',
      schemaVersion: '3',
      strategies: [],
      initialState: () => ({ count: 0 }),
      migrations: [
        { fromVersion: '1', toVersion: '2', migrate: (state) => ({ ...state, enabled: true }) },
        { fromVersion: '2', toVersion: '3', migrate: (state) => ({ ...state, label: 'ready' }) },
      ],
    })

    expect(migrateDomainState(pack, '1', { count: 1 })).toEqual({
      state: { count: 1, enabled: true, label: 'ready' },
      schemaVersion: '3',
      applied: [
        { fromVersion: '1', toVersion: '2' },
        { fromVersion: '2', toVersion: '3' },
      ],
    })
  })

  it('fails closed when no path reaches the active schema', () => {
    const pack = defineDomainPack({ id: 'test.missing', schemaVersion: '2', strategies: [], initialState: () => ({}) })
    expect(() => migrateDomainState(pack, '1', {})).toThrow(/no schema migration/)
  })

  it('rejects ambiguous migration graphs', () => {
    expect(() => defineDomainPack({
      id: 'test.ambiguous', schemaVersion: '2', strategies: [], initialState: () => ({}),
      migrations: [
        { fromVersion: '1', toVersion: '2', migrate: (state) => ({ ...state }) },
        { fromVersion: '1', toVersion: '3', migrate: (state) => ({ ...state }) },
      ],
    })).toThrow(/multiple schema migrations/)
  })
})
