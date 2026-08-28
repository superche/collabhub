import { FileStorageAdapter, startModelCollaborationServer } from '@collabhub/server-ws'
import { collabModel } from './collabhub.model.js'

const authToken = process.env.COLLABHUB_AUTH_TOKEN
if (process.env.NODE_ENV === 'production' && !authToken) throw new Error('COLLABHUB_AUTH_TOKEN is required in production')
const allowedOrigins = process.env.COLLABHUB_ALLOWED_ORIGINS?.split(',').filter(Boolean)
if (process.env.NODE_ENV === 'production' && !allowedOrigins?.length) throw new Error('COLLABHUB_ALLOWED_ORIGINS is required in production')

const server = await startModelCollaborationServer({
  model: collabModel,
  storage: new FileStorageAdapter(process.env.COLLABHUB_DATA_DIR ?? '.collabhub-data'),
  host: process.env.COLLABHUB_HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 4100),
  allowedOrigins: allowedOrigins ?? ['http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
  allowInsecureDevelopmentIdentity: !authToken,
  authToken,
})

console.log(`CollabHub server: ${server.webSocketUrl}`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void server.close().finally(() => process.exit(0)) })
