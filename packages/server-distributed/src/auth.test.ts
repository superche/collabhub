import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { JwtGatewayAuthAdapter, SharedSecretJwtGatewayAuthAdapter, bearerToken } from './auth.js'

describe('gateway authentication', () => {
  const servers: ReturnType<typeof createServer>[] = []
  afterEach(async () => {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  })

  it('parses bearer tokens without accepting other authorization schemes', () => {
    expect(bearerToken('Bearer token')).toBe('token')
    expect(bearerToken('Basic token')).toBeUndefined()
  })

  it('binds actor and tenant from verified JWT claims and enforces document grants', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', use: 'sig', alg: 'RS256' }
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ keys: [jwk] }))
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const token = await new SignJWT({ tenant_id: 'tenant-a', collabhub_documents: ['document-a'] })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('verified-user')
      .setIssuer('https://issuer.example')
      .setAudience('collabhub')
      .setExpirationTime('5m')
      .sign(privateKey)
    const auth = new JwtGatewayAuthAdapter({
      jwksUrl: `http://127.0.0.1:${port}/jwks`, issuer: 'https://issuer.example', audience: 'collabhub',
    })
    const base = { transport: 'websocket' as const, token, requested: { tenantId: 'tenant-a', documentId: 'document-a', actorId: 'spoofed', clientId: 'browser' } }
    await expect(auth.authenticate(base)).resolves.toEqual({ tenantId: 'tenant-a', documentId: 'document-a', actorId: 'verified-user', clientId: 'browser' })
    await expect(auth.authenticate({ ...base, requested: { ...base.requested, documentId: 'document-b' } })).rejects.toThrow(/does not grant/)
  })

  it('supports a backend-owned shared secret without weakening claim checks', async () => {
    const secret = 'a-production-secret-that-is-at-least-32-bytes'
    const token = await new SignJWT({ tenant_id: 'tenant-a', collabhub_documents: ['document-a'] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('verified-user')
      .setIssuer('my-app')
      .setAudience('collabhub')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret))
    const auth = new SharedSecretJwtGatewayAuthAdapter({ secret, issuer: 'my-app', audience: 'collabhub' })
    const base = { transport: 'websocket' as const, token, requested: { tenantId: 'tenant-a', documentId: 'document-a', actorId: 'spoofed', clientId: 'browser' } }

    await expect(auth.authenticate(base)).resolves.toEqual({ tenantId: 'tenant-a', documentId: 'document-a', actorId: 'verified-user', clientId: 'browser' })
    await expect(auth.authenticate({ ...base, requested: { ...base.requested, documentId: 'document-b' } })).rejects.toThrow(/does not grant/)
    expect(() => new SharedSecretJwtGatewayAuthAdapter({ secret: 'too-short', issuer: 'my-app', audience: 'collabhub' })).toThrow(/32 bytes/)
  })
})
