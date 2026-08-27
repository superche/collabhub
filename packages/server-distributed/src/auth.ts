import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import type { ConnectionContext } from './types.js'

export interface GatewayAuthRequest {
  transport: 'websocket' | 'http'
  token?: string
  requested: ConnectionContext
}

export interface GatewayAuthAdapter {
  authenticate(request: GatewayAuthRequest): Promise<ConnectionContext>
}

/** Explicit opt-in for local examples. Never use this adapter on a public gateway. */
export class InsecureDevelopmentAuthAdapter implements GatewayAuthAdapter {
  async authenticate(request: GatewayAuthRequest): Promise<ConnectionContext> { return request.requested }
}

export interface JwtGatewayAuthOptions {
  jwksUrl: string
  issuer: string
  audience: string
  tenantClaim?: string
  documentsClaim?: string
}

/** Verifies JWTs and derives tenant/actor identity from signed claims. */
export class JwtGatewayAuthAdapter implements GatewayAuthAdapter {
  private readonly keySet

  constructor(private readonly options: JwtGatewayAuthOptions) {
    this.keySet = createRemoteJWKSet(new URL(options.jwksUrl))
  }

  async authenticate(request: GatewayAuthRequest): Promise<ConnectionContext> {
    if (!request.token) throw new Error('bearer token is required')
    const { payload } = await jwtVerify(request.token, this.keySet, {
      issuer: this.options.issuer,
      audience: this.options.audience,
    })
    const tenantId = claimString(payload, this.options.tenantClaim ?? 'tenant_id')
    const actorId = claimString(payload, 'sub')
    if (tenantId !== request.requested.tenantId) throw new Error('token does not grant the requested tenant')
    const allowedDocuments = payload[this.options.documentsClaim ?? 'collabhub_documents']
    if (!Array.isArray(allowedDocuments) || !allowedDocuments.every((value) => typeof value === 'string')) {
      throw new Error('token must include a collabhub_documents claim')
    }
    if (!allowedDocuments.includes('*') && !allowedDocuments.includes(request.requested.documentId)) {
      throw new Error('token does not grant the requested document')
    }
    return { ...request.requested, tenantId, actorId }
  }
}

function claimString(payload: JWTPayload, key: string): string {
  const value = payload[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`token claim ${key} is required`)
  return value
}

export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]
}
