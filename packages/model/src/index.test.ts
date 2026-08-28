import { describe, expect, it } from 'vitest'
import { createModelDomainPack, defineCollaborationModel, runModelCommand } from './index.js'

type State = { subtotal: number; tax: number; total: number; label: string }
type Command = { type: 'price.changed'; subtotal: number }

const model = defineCollaborationModel<State, Command>({
  id: 'invoice',
  initialState: () => ({ subtotal: 0, tax: 0, total: 0, label: 'Draft' }),
  reduce(draft, command) {
    draft.subtotal = command.subtotal
    draft.tax = command.subtotal * 0.1
    draft.total = draft.subtotal + draft.tax
  },
  validate: (state) => state.total >= 0 || 'total cannot be negative',
})

describe('collaboration model', () => {
  it('turns linked changes into one patch set without replacing the document', () => {
    const result = runModelCommand(model, model.initialState('a'), { type: 'price.changed', subtotal: 100 })
    expect(result.state).toMatchObject({ subtotal: 100, tax: 10, total: 110 })
    expect(result.patches).toEqual([
      { op: 'set', path: '/subtotal', value: 100 },
      { op: 'set', path: '/tax', value: 10 },
      { op: 'set', path: '/total', value: 110 },
    ])
  })

  it('re-runs stale commands on the current server state', () => {
    const pack = createModelDomainPack(model)
    const result = pack.strategies[0]!.resolve({
      currentVersion: 8,
      currentState: { subtotal: 20, tax: 2, total: 22, label: 'Current' },
      concurrentOperations: [],
      historyComplete: true,
      operation: {
        tenantId: 't', documentId: 'd', actorId: 'a', clientId: 'c', operationId: 'o', baseVersion: 2,
        schemaVersion: '1.0', operationType: 'model.command', strategyId: 'invoice.commands', strategyVersion: '1.0',
        payload: { command: { type: 'price.changed', subtotal: 50 } },
      },
    })
    expect(result.kind).toBe('accept')
    if (result.kind === 'accept') expect(result.patches).toContainEqual({ op: 'set', path: '/total', value: 55 })
  })
})
