import { startJsonCollaborationServer } from '@collabhub/server-ws'

const server = await startJsonCollaborationServer({
  initialState: (documentId) => ({ id: documentId, title: 'Shared document' }),
  host: '127.0.0.1',
  port: 4100,
  allowedOrigins: ['http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
  allowInsecureDevelopmentIdentity: true,
})

console.log(`CollabHub server: ${server.webSocketUrl}`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void server.close().finally(() => process.exit(0)) })
