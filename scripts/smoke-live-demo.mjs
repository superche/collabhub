import { WebSocket } from 'ws'

const origin = process.env.COLLABHUB_LIVE_ORIGIN ?? 'https://collabhub-demo.onrender.com'
const webSocketUrl = origin.replace(/^http/, 'ws') + '/collab'
const health = await fetch(`${origin}/healthz`)
if (!health.ok) throw new Error(`healthz returned ${health.status}`)
const healthBody = await health.json()
if (typeof healthBody.warmRooms !== 'number') throw new Error('deployed demo does not expose warmRooms')
if (healthBody.originRestricted !== true) throw new Error('deployed demo does not enforce an Origin allowlist')

const rejected = new WebSocket(webSocketUrl, { headers: { Origin: 'https://untrusted.example' } })
const rejectedCode = await closeCode(rejected, 10_000)
if (rejectedCode !== 1008) throw new Error(`untrusted Origin closed with ${rejectedCode}, expected 1008`)

const documentId = `live-smoke-${Date.now()}`
const allowed = new WebSocket(webSocketUrl, { headers: { Origin: origin } })
await opened(allowed)
const ready = nextKind(allowed, 'ready')
allowed.send(JSON.stringify({
  kind: 'hello', protocolVersion: '0.1', tenantId: 'public-demo', documentId,
  actorId: 'live-smoke', clientId: `live-smoke-${Date.now()}`, lastKnownVersion: 0,
}))
await ready
await closeSocket(allowed)

console.log(JSON.stringify({ event: 'live_demo_smoke_passed', origin, documentId, warmRooms: healthBody.warmRooms, originRestricted: healthBody.originRestricted, untrustedOriginCloseCode: rejectedCode }))

function opened(socket) {
  return new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
}

function nextKind(socket, kind) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timed out waiting for ${kind}`)), 10_000)
    const listener = (raw) => {
      const message = JSON.parse(String(raw))
      if (message.kind !== kind) return
      clearTimeout(timeout)
      socket.off('message', listener)
      resolve(message)
    }
    socket.on('message', listener)
  })
}

function closeCode(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.terminate(); reject(new Error('socket remained open')) }, timeoutMs)
    socket.once('close', (code) => { clearTimeout(timeout); resolve(code) })
    socket.once('error', reject)
  })
}

async function closeSocket(socket) {
  const closed = closeCode(socket, 5_000)
  socket.close()
  await closed
}
