import type { JsonObject } from '@collabhub/protocol'
import { jsonStrategies } from '@collabhub/domain-json'
import { startStandaloneWebSocketServer } from '@collabhub/server-ws'
import { defineDomainPack } from '@collabhub/strategy-sdk'

const domainPack = defineDomainPack<JsonObject>({
  id: 'starter.document',
  schemaVersion: '1.0',
  strategies: jsonStrategies,
  initialState: (documentId) => ({ id: documentId, title: 'Shared document' }),
})

const server = await startStandaloneWebSocketServer({
  domainPack,
  host: '127.0.0.1',
  port: 4100,
  allowInsecureDevelopmentIdentity: true,
})

console.log(`CollabHub server: ${server.webSocketUrl}`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void server.close().finally(() => process.exit(0)) })
