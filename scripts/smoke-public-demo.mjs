import { chromium, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = 4400
const documentId = `public-demo-${Date.now()}`
const server = spawn(process.execPath, [resolve(root, 'examples/react-flow-app/dist-server/collabhub-react-flow-demo.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    COLLABHUB_HOST: '127.0.0.1',
    COLLABHUB_DEMO_STATIC_DIR: resolve(root, 'examples/react-flow-app/dist'),
    COLLABHUB_DEMO_ROOM_IDLE_TTL_MS: '200',
    COLLABHUB_DEMO_MAX_WARM_ROOMS: '2',
    COLLABHUB_DEMO_ROOM_SCAN_INTERVAL_MS: '50',
    COLLABHUB_DEMO_MAX_CONNECTIONS_PER_IP: '2',
    COLLABHUB_DEMO_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.pipe(process.stdout)
server.stderr.pipe(process.stderr)

let browser
try {
  await waitFor(`http://127.0.0.1:${port}/healthz`)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
  await page.goto(`http://127.0.0.1:${port}/demo.html?room=${documentId}`)
  const alice = page.frameLocator('iframe[title="Alice"]')
  const bob = page.frameLocator('iframe[title="Bob"]')
  await Promise.all([
    expect(alice.getByText('online', { exact: true })).toBeVisible(),
    expect(bob.getByText('online', { exact: true })).toBeVisible(),
  ])
  await expect(page.getByRole('link', { name: 'Star CollabHub on GitHub' })).toHaveAttribute('href', 'https://github.com/superche/collabhub')
  await alice.getByTestId('add-node').click()
  await expect(bob.locator('.react-flow__node')).toHaveCount(3)
  await expect(bob.getByText('Selected node', { exact: true })).toHaveCount(0)
  await bob.locator('[data-id="build"]').dragTo(bob.locator('[data-id="ship"]'))
  await expect(bob.getByTestId('react-flow-moves')).toHaveText('1')
  await expect(alice.getByTestId('react-flow-version')).toHaveText('2')
  await expect(bob.getByText('Selected node', { exact: true })).toHaveCount(0)
  await expect(bob.getByTestId('react-flow-version')).toHaveText('2')
  await new Promise((resolveWait) => setTimeout(resolveWait, 300))
  expect(await warmRoomCount()).toBe(1)

  await page.close()
  await expect.poll(warmRoomCount, { timeout: 5000 }).toBe(0)
  const badOrigin = new WebSocket(`ws://127.0.0.1:${port}/collab`, { headers: { Origin: 'https://untrusted.example' } })
  expect(await upgradeRejectionStatus(badOrigin)).toBe(403)
  const first = await openSocket()
  const second = await openSocket()
  const overLimit = new WebSocket(`ws://127.0.0.1:${port}/collab`, { headers: { Origin: `http://127.0.0.1:${port}` } })
  expect(await closeCode(overLimit)).toBe(1013)
  await Promise.all([closeSocket(first), closeSocket(second)])
  const reopened = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  await reopened.goto(`http://127.0.0.1:${port}/?document=${documentId}&client=reopened`)
  await expect(reopened.getByText('online', { exact: true })).toBeVisible()
  await expect(reopened.locator('.react-flow__node')).toHaveCount(2)
  await expect(reopened.getByTestId('react-flow-version')).toHaveText('0')
  console.log(JSON.stringify({ event: 'react_flow_public_demo_smoke_passed', url: `http://127.0.0.1:${port}/demo.html`, documentId, canonicalVersion: 2, nodeCount: 3, starLink: true, activeRoomProtected: true, expiredRoomDeleted: true, originRejected: true, perIpConnectionLimit: true, reopenedVersion: 0 }))
} finally {
  await browser?.close().catch(() => undefined)
  server.kill('SIGTERM')
  await Promise.race([new Promise((resolveExit) => server.once('exit', resolveExit)), new Promise((resolveWait) => setTimeout(resolveWait, 3000))])
  if (server.exitCode === null) server.kill('SIGKILL')
}

async function waitFor(url) {
  const deadline = Date.now() + 20_000
  let lastError
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return } catch (error) { lastError = error }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(`timed out waiting for ${url}: ${String(lastError)}`)
}

async function warmRoomCount() {
  const response = await fetch(`http://127.0.0.1:${port}/healthz`)
  if (!response.ok) throw new Error(`healthz returned ${response.status}`)
  return (await response.json()).warmRooms
}

async function openSocket() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/collab`, { headers: { Origin: `http://127.0.0.1:${port}` } })
  await new Promise((resolveOpen, reject) => { socket.once('open', resolveOpen); socket.once('error', reject) })
  return socket
}

async function closeCode(socket) {
  return new Promise((resolveClose, reject) => {
    socket.once('close', resolveClose)
    socket.once('error', reject)
  })
}

async function upgradeRejectionStatus(socket) {
  return new Promise((resolveReject, reject) => {
    socket.once('unexpected-response', (_request, response) => {
      response.resume()
      resolveReject(response.statusCode)
    })
    socket.once('open', () => reject(new Error('untrusted Origin completed the WebSocket upgrade')))
    socket.once('error', reject)
  })
}

async function closeSocket(socket) {
  const closed = closeCode(socket)
  socket.close()
  await closed
}
