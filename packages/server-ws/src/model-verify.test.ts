import { afterEach, describe, expect, it } from 'vitest'
import { defineCollaborationModel } from '@collabhub/model'
import { verifyTwoClients } from '../../create-react/src/index.js'
import { startModelCollaborationServer, type StandaloneWebSocketServerHandle } from './index.js'

type State = { verification: number; verificationLinked: number }
type Command = { type: 'collabhub.verify'; value: number }

describe('model server two-client verification', () => {
  let handle: StandaloneWebSocketServerHandle<State & Record<string, any>> | undefined
  afterEach(async () => { await handle?.close() })

  it('recomputes a linked field on the server and broadcasts it to Bob', async () => {
    const model = defineCollaborationModel<State, Command>({
      id: 'verify-model',
      initialState: () => ({ verification: 0, verificationLinked: 0 }),
      reduce(draft, command) {
        draft.verification = command.value
        draft.verificationLinked = command.value * 2
      },
    })
    handle = await startModelCollaborationServer({ model, allowInsecureDevelopmentIdentity: true })
    const result = await verifyTwoClients({ url: handle.webSocketUrl, modelId: model.id })
    expect(result).toMatchObject({ ok: true, aliceVersion: 1, bobVersion: 1, linkedValue: 42 })
  })
})
