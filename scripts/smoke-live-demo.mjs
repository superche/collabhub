import { WebSocket } from 'ws'
import { chromium, expect } from '@playwright/test'

const origin = process.env.COLLABHUB_LIVE_ORIGIN ?? 'https://collabhub-demo.onrender.com'
const webSocketUrl = origin.replace(/^http/, 'ws') + '/collab'
const health = await fetch(`${origin}/healthz`)
if (!health.ok) throw new Error(`healthz returned ${health.status}`)
const healthBody = await health.json()
if (typeof healthBody.warmRooms !== 'number') throw new Error('deployed demo does not expose warmRooms')
if (healthBody.originRestricted !== true) throw new Error('deployed demo does not enforce an Origin allowlist')

const rejected = new WebSocket(webSocketUrl, { headers: { Origin: 'https://untrusted.example' } })
const rejectedStatus = await upgradeRejectionStatus(rejected, 10_000)
if (rejectedStatus !== 403) throw new Error(`untrusted Origin upgrade returned ${rejectedStatus}, expected 403`)

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

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
  await page.goto(origin)
  await expect(page.getByRole('heading', { name: 'Multiplayer, without rewriting your React app.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Try two-client demo' })).toHaveAttribute('href', '/demo.html')

  await page.goto(`${origin}/demo.html?room=${documentId}`)
  const alice = page.frameLocator('iframe[title="Alice"]')
  const bob = page.frameLocator('iframe[title="Bob"]')
  await Promise.all([
    expect(alice.getByText('online', { exact: true })).toBeVisible(),
    expect(bob.getByText('online', { exact: true })).toBeVisible(),
  ])

  await alice.getByTestId('add-node').click()
  await expect(bob.locator('.react-flow__node')).toHaveCount(3)
  await expect(bob.getByTestId('react-flow-version')).toHaveText('1')

  await alice.locator('[data-id="build"]').dragTo(alice.locator('[data-id="ship"]'))
  await expect(alice.getByTestId('react-flow-moves')).toHaveText('1')
  await expect(bob.getByTestId('react-flow-version')).toHaveText('2')

  await bob.getByTestId('network-toggle').click()
  await expect(bob.getByText('offline', { exact: true })).toBeVisible()
  await bob.getByTestId('add-node').click()
  await expect(bob.getByTestId('react-flow-pending')).toHaveText('1')
  await alice.getByTestId('add-node').click()
  await expect(alice.getByTestId('react-flow-version')).toHaveText('3')
  await bob.getByTestId('network-toggle').click()
  await expect(bob.getByText('online', { exact: true })).toBeVisible()
  await expect(bob.getByTestId('react-flow-pending')).toHaveText('0')
  await expect(alice.locator('.react-flow__node')).toHaveCount(5)
  await expect(bob.locator('.react-flow__node')).toHaveCount(5)
  await expect(alice.getByTestId('react-flow-version')).toHaveText('4')

  console.log(JSON.stringify({
    event: 'live_demo_smoke_passed',
    origin,
    documentId,
    warmRooms: healthBody.warmRooms,
    originRestricted: healthBody.originRestricted,
    untrustedOriginStatus: rejectedStatus,
    landingVerified: true,
    clients: ['alice', 'bob'],
    canonicalVersion: 4,
    nodeCount: 5,
    dragCommits: 1,
    offlineReplay: true,
  }))
} finally {
  await browser.close()
}

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

function upgradeRejectionStatus(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.terminate(); reject(new Error('untrusted Origin upgrade remained open')) }, timeoutMs)
    socket.once('unexpected-response', (_request, response) => {
      clearTimeout(timeout)
      response.destroy()
      resolve(response.statusCode)
    })
    socket.once('open', () => { clearTimeout(timeout); socket.terminate(); reject(new Error('untrusted Origin completed the WebSocket upgrade')) })
    socket.once('error', reject)
  })
}

async function closeSocket(socket) {
  const closed = closeCode(socket, 5_000)
  socket.close()
  await closed
}
