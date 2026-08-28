import { chromium } from '@playwright/test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const rawDir = resolve(root, 'output/playwright/react-flow-smoke')
const finalVideo = resolve(root, 'docs/assets/collabhub-react-flow-smoke.mp4')
const poster = resolve(root, 'docs/assets/collabhub-react-flow-smoke-poster.jpg')
const traceFile = resolve(rawDir, 'trace.json')
const documentId = `react-flow-smoke-${Date.now()}`
const trace = []

await rm(rawDir, { recursive: true, force: true })
await mkdir(rawDir, { recursive: true })
await Promise.all([waitForHttp('http://127.0.0.1:5193'), waitForHttp('http://127.0.0.1:5194')])

const browser = await chromium.launch({ headless: true })
const contextOptions = {
  viewport: { width: 960, height: 820 },
  recordVideo: { dir: rawDir, size: { width: 960, height: 820 } },
}
const [aliceContext, bobContext] = await Promise.all([browser.newContext(contextOptions), browser.newContext(contextOptions)])
const [alice, bob] = await Promise.all([aliceContext.newPage(), bobContext.newPage()])
const aliceVideo = alice.video()
const bobVideo = bob.video()

try {
  await Promise.all([
    alice.goto(`http://127.0.0.1:5193/room?client=alice&document=${documentId}`),
    bob.goto(`http://127.0.0.1:5194/room?client=bob&document=${documentId}`),
  ])
  await Promise.all([waitForText(alice, '.status', 'online'), waitForText(bob, '.status', 'online')])
  await Promise.all([installCursor(alice, '#d94b3f'), installCursor(bob, '#287a56')])
  await pause(1_200)

  await activate(alice, bob, 'Alice adds one node')
  await humanClick(alice, alice.getByTestId('add-node'))
  await waitForNodeCount(bob, 3)
  await converge(alice, bob)
  record('node_add_converged', await diagnostics(alice, bob))
  await pause(1_000)

  await activate(alice, bob, 'Alice drags Build; pointer-up submits once')
  await humanDrag(alice, alice.locator('[data-id="build"]'), 120, 58)
  await waitForText(alice, '[data-testid="react-flow-moves"]', '1')
  await converge(alice, bob)
  record('drag_stop_converged', await diagnostics(alice, bob))
  await pause(1_100)

  await activate(bob, alice, 'Bob goes offline and adds a node')
  await humanClick(bob, bob.getByTestId('network-toggle'))
  await waitForText(bob, '.status', 'offline')
  await humanClick(bob, bob.getByTestId('add-node'))
  await waitForText(bob, '[data-testid="react-flow-pending"]', '1')
  record('offline_pending', await diagnostics(alice, bob))
  await pause(1_300)

  await activate(alice, bob, 'Alice keeps editing online')
  await humanClick(alice, alice.getByTestId('add-node'))
  await waitForNodeCount(alice, 4)
  record('online_client_advanced', await diagnostics(alice, bob))
  await pause(1_200)

  await activate(bob, alice, 'Bob reconnects and replays pending work')
  await humanClick(bob, bob.getByTestId('network-toggle'))
  await waitForText(bob, '[data-testid="react-flow-pending"]', '0')
  await Promise.all([waitForNodeCount(alice, 5), waitForNodeCount(bob, 5)])
  await converge(alice, bob)
  record('reconnect_converged', await diagnostics(alice, bob))
  await pause(1_300)

  await activate(alice, bob, 'Delete Build + linked edge atomically')
  await humanClick(alice, alice.locator('[data-id="build"]'))
  await humanClick(alice, alice.getByTestId('delete-selection'))
  await Promise.all([waitForSummary(alice, '4 nodes · 0 edges'), waitForSummary(bob, '4 nodes · 0 edges')])
  await converge(alice, bob)
  record('linked_delete_converged', await diagnostics(alice, bob))
  await pause(2_400)
} finally {
  await Promise.all([aliceContext.close(), bobContext.close()])
  await browser.close()
}

const [aliceRaw, bobRaw] = await Promise.all([aliceVideo.path(), bobVideo.path()])
await run('ffmpeg', [
  '-y', '-i', aliceRaw, '-i', bobRaw,
  '-filter_complex', '[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]hstack=inputs=2:shortest=1[v]',
  '-map', '[v]', '-an', '-r', '30', '-c:v', 'libx264', '-crf', '19', '-preset', 'medium',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalVideo,
])
await run('ffmpeg', ['-y', '-ss', '1.5', '-i', finalVideo, '-frames:v', '1', '-q:v', '2', poster])
await writeFile(traceFile, `${JSON.stringify({ documentId, trace }, null, 2)}\n`)
console.log(JSON.stringify({ finalVideo, poster, traceFile, documentId, trace }, null, 2))

async function waitForHttp(url) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return } catch { /* starting */ }
    await pause(500)
  }
  throw new Error(`Timed out waiting for ${url}. Start it with: pnpm dev:react-flow`)
}

async function installCursor(page, color) {
  await page.evaluate((cursorColor) => {
    const cursor = document.createElement('div')
    cursor.id = 'collabhub-recording-cursor'
    cursor.innerHTML = '<span></span>'
    Object.assign(cursor.style, { position: 'fixed', left: '0', top: '0', width: '22px', height: '22px', zIndex: '2147483647', pointerEvents: 'none', opacity: '0', transform: 'translate(48px, 86px)', transition: 'transform 760ms cubic-bezier(.22,.75,.2,1), opacity 180ms ease' })
    Object.assign(cursor.firstElementChild.style, { display: 'block', width: '16px', height: '16px', borderRadius: '50%', background: cursorColor, border: '3px solid white', boxShadow: '0 2px 10px #0008' })
    document.body.append(cursor)
    const caption = document.createElement('div')
    caption.id = 'collabhub-recording-caption'
    Object.assign(caption.style, { position: 'fixed', left: '18px', bottom: '16px', zIndex: '2147483646', padding: '9px 13px', borderRadius: '9px', background: '#17231ce8', color: '#f2f6f3', font: '600 12px ui-monospace, monospace', boxShadow: '0 8px 24px #0003', opacity: '0', transition: 'opacity 180ms ease', pointerEvents: 'none' })
    document.body.append(caption)
  }, color)
}

async function activate(active, inactive, caption) {
  await Promise.all([
    active.evaluate((label) => { document.querySelector('#collabhub-recording-cursor').style.opacity = '1'; const badge = document.querySelector('#collabhub-recording-caption'); badge.textContent = label; badge.style.opacity = '1' }, caption),
    inactive.evaluate(() => { document.querySelector('#collabhub-recording-cursor').style.opacity = '0'; document.querySelector('#collabhub-recording-caption').style.opacity = '0' }),
  ])
  await pause(280)
}

async function humanClick(page, locator, duration = 760) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Target is not visible')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await moveCursor(page, x, y, duration)
  await page.mouse.move(x, y, { steps: 22 })
  await pause(duration + 120)
  await page.mouse.down(); await pause(95); await page.mouse.up(); await pause(220)
}

async function humanDrag(page, locator, deltaX, deltaY) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Node is not visible')
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const end = { x: start.x + deltaX, y: start.y + deltaY }
  await moveCursor(page, start.x, start.y, 720)
  await page.mouse.move(start.x, start.y, { steps: 20 }); await pause(780); await page.mouse.down(); await pause(130)
  await moveCursor(page, end.x, end.y, 900)
  await page.mouse.move(end.x, end.y, { steps: 30 }); await pause(950); await page.mouse.up(); await pause(300)
}

async function moveCursor(page, x, y, duration) {
  await page.evaluate(({ x, y, duration }) => { const cursor = document.querySelector('#collabhub-recording-cursor'); cursor.style.transitionDuration = `${duration}ms, 180ms`; cursor.style.transform = `translate(${x - 8}px, ${y - 8}px)` }, { x, y, duration })
}

async function waitForText(page, selector, expected) {
  await page.waitForFunction(({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected, { selector, expected })
}

async function waitForNodeCount(page, expected) {
  await page.waitForFunction((count) => document.querySelectorAll('.react-flow__node').length === count, expected)
}

async function waitForSummary(page, expected) {
  await page.getByText(expected, { exact: true }).waitFor()
}

async function converge(alice, bob) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const current = await diagnostics(alice, bob)
    if (current.aliceVersion === current.bobVersion && current.alicePending === '0' && current.bobPending === '0') return
    await pause(100)
  }
  throw new Error('React Flow clients did not converge')
}

async function diagnostics(alice, bob) {
  return {
    aliceVersion: await text(alice, 'react-flow-version'), bobVersion: await text(bob, 'react-flow-version'),
    alicePending: await text(alice, 'react-flow-pending'), bobPending: await text(bob, 'react-flow-pending'),
    aliceMoves: await text(alice, 'react-flow-moves'), bobRecovery: await text(bob, 'react-flow-recovery'),
  }
}

async function text(page, testId) { return (await page.getByTestId(testId).textContent())?.trim() }
function record(event, evidence) { trace.push({ atMs: Math.round(performance.now()), event, ...evidence }) }
function pause(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)) }
function run(command, args) { return new Promise((resolvePromise, reject) => { const child = spawn(command, args, { stdio: 'inherit' }); child.once('error', reject); child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`))) }) }
