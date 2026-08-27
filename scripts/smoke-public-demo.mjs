import { chromium, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  await bob.locator('[data-id="build"]').click()
  await bob.getByTestId('node-label').fill('Build together')
  await bob.getByTestId('node-label').press('Enter')
  await expect(alice.getByText('Build together', { exact: true })).toBeVisible()
  await expect(bob.getByTestId('react-flow-version')).toHaveText('2')
  console.log(JSON.stringify({ event: 'react_flow_public_demo_smoke_passed', url: `http://127.0.0.1:${port}/demo.html`, documentId, canonicalVersion: 2, nodeCount: 3, starLink: true }))
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
