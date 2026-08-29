import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const port = 4410
const origin = `http://127.0.0.1:${port}`
const assetsDir = resolve(root, 'docs/product-hunt/assets')
const publicGallery = resolve(root, 'examples/react-flow-app/public/product-hunt/gallery-01.png')
const galleryHero = resolve(assetsDir, 'gallery-01-hero.png')
const galleryDemo = resolve(assetsDir, 'gallery-02-live-demo.png')
const galleryIntegration = resolve(assetsDir, 'gallery-03-integration.png')
const thumbnail = resolve(assetsDir, 'collabhub-thumbnail-240.png')

await mkdir(assetsDir, { recursive: true })
const server = spawn(process.execPath, [resolve(root, 'examples/react-flow-app/dist-server/collabhub-react-flow-demo.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    COLLABHUB_HOST: '127.0.0.1',
    COLLABHUB_DEMO_STATIC_DIR: resolve(root, 'examples/react-flow-app/dist'),
    COLLABHUB_DEMO_ALLOWED_ORIGINS: origin,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.pipe(process.stdout)
server.stderr.pipe(process.stderr)

let browser
try {
  await waitFor(`${origin}/healthz`)
  browser = await chromium.launch({ headless: true })

  const landing = await browser.newPage({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: 1 })
  await landing.goto(origin)
  await landing.getByRole('heading', { name: 'Multiplayer, without rewriting your React app.' }).waitFor()
  await landing.screenshot({ path: galleryHero })
  await landing.evaluate(() => {
    const section = document.querySelector('.integration-section')
    if (!section) throw new Error('integration section not found')
    window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY - 24)
  })
  await landing.screenshot({ path: galleryIntegration })

  const demo = await browser.newPage({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: 1 })
  await demo.goto(`${origin}/demo.html?room=product-hunt-${Date.now()}`)
  const alice = demo.frameLocator('iframe[title="Alice"]')
  const bob = demo.frameLocator('iframe[title="Bob"]')
  await Promise.all([
    alice.getByText('online', { exact: true }).waitFor(),
    bob.getByText('online', { exact: true }).waitFor(),
  ])
  await demo.screenshot({ path: galleryDemo })

  const mark = await browser.newPage({ viewport: { width: 240, height: 240 }, deviceScaleFactor: 1 })
  await mark.goto(`${origin}/product-hunt/thumbnail.html`)
  await mark.screenshot({ path: thumbnail })

  await copyFile(galleryHero, publicGallery)
  console.log(JSON.stringify({ event: 'product_hunt_assets_captured', galleryHero, galleryDemo, galleryIntegration, thumbnail }))
} finally {
  await browser?.close().catch(() => undefined)
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolveExit) => server.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 3000)),
  ])
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
