#!/usr/bin/env node
import { createJsonDomainPack, loadDomainPackFromEnvironment } from '@collabhub/domain-json/server-loader'
import type { JsonObject } from '@collabhub/protocol'
import { FileStorageAdapter } from './file-storage.js'
import { startJsonCollaborationServer } from './index.js'

const initialState = parseInitialState(process.env.COLLABHUB_INITIAL_STATE_JSON)
const hasExternalDomainPack = Boolean(process.env.COLLABHUB_DOMAIN_PACK_CONFIG || process.env.COLLABHUB_DOMAIN_PACK_MODULE)
if (hasExternalDomainPack && process.env.COLLABHUB_INITIAL_STATE_JSON) {
  throw new Error('COLLABHUB_INITIAL_STATE_JSON cannot be combined with an external Domain Pack')
}
const loadedDomainPack = hasExternalDomainPack
  ? await loadDomainPackFromEnvironment()
  : {
      pack: createJsonDomainPack({
        formatVersion: 1,
        id: 'collabhub.json',
        schemaVersion: '1.0',
        initialState: { ...initialState, id: '$documentId' },
      }),
      source: process.env.COLLABHUB_INITIAL_STATE_JSON ? 'environment:COLLABHUB_INITIAL_STATE_JSON' : 'built-in:json',
    }
const allowInsecure = process.env.COLLABHUB_ALLOW_INSECURE_DEVELOPMENT_IDENTITY === 'true'
const allowedOrigins = values(process.env.COLLABHUB_ALLOWED_ORIGINS)
if (allowedOrigins.length === 0 && process.env.COLLABHUB_ALLOW_ANY_ORIGIN !== 'true') {
  throw new Error('COLLABHUB_ALLOWED_ORIGINS is required unless COLLABHUB_ALLOW_ANY_ORIGIN=true')
}
if (!process.env.COLLABHUB_AUTH_TOKEN && !allowInsecure) {
  throw new Error('COLLABHUB_AUTH_TOKEN is required unless COLLABHUB_ALLOW_INSECURE_DEVELOPMENT_IDENTITY=true')
}

const handle = await startJsonCollaborationServer({
  host: process.env.COLLABHUB_HOST ?? '0.0.0.0',
  port: positiveInteger(process.env.PORT ?? process.env.COLLABHUB_PORT, 4100),
  initialState: loadedDomainPack.pack.initialState,
  domainPack: loadedDomainPack.pack,
  storage: new FileStorageAdapter(process.env.COLLABHUB_DATA_DIR ?? '/data'),
  allowedOrigins,
  authToken: process.env.COLLABHUB_AUTH_TOKEN,
  allowInsecureDevelopmentIdentity: allowInsecure,
  trustProxyHeaders: process.env.COLLABHUB_TRUST_PROXY_HEADERS === 'true',
  roomCachePolicy: {
    idleTtlMs: positiveInteger(process.env.COLLABHUB_ROOM_IDLE_TTL_MS, 30 * 60_000),
    maxWarmRooms: positiveInteger(process.env.COLLABHUB_MAX_WARM_ROOMS, 500),
    scanIntervalMs: positiveInteger(process.env.COLLABHUB_ROOM_SCAN_INTERVAL_MS, 60_000),
  },
})

console.log(JSON.stringify({ event: 'collabhub_standalone_ready', port: handle.port, path: '/collab', domainPack: loadedDomainPack.pack.id, domainPackSource: loadedDomainPack.source }))
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { void handle.close().finally(() => process.exit(0)) })
}

function parseInitialState(value: string | undefined): JsonObject {
  if (!value) return {}
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('COLLABHUB_INITIAL_STATE_JSON must be a JSON object')
  return parsed as JsonObject
}

function values(value: string | undefined): string[] {
  return value?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? []
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
