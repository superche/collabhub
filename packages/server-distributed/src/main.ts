import type { JsonObject } from '@collabhub/protocol'
import { jsonStrategies } from '@collabhub/domain-json'
import { defineDomainPack } from '@collabhub/strategy-sdk'
import { installDistributedNodeSignalHandlers, startDistributedNodeFromEnvironment } from './bootstrap.js'

const domainPack = defineDomainPack<JsonObject>({
  id: 'collabhub.distributed-json',
  schemaVersion: '1.0',
  strategies: jsonStrategies,
  initialState: (documentId) => ({
    id: documentId,
    title: 'CollabHub distributed document',
    status: 'draft',
    items: [],
    sections: [],
  }),
})

installDistributedNodeSignalHandlers(await startDistributedNodeFromEnvironment(domainPack))
