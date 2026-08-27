import { chromium } from '@playwright/test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const rawDir = resolve(root, 'output/playwright/todo-list-smoke')
const finalVideo = resolve(root, 'docs/assets/collabhub-todo-list-smoke.mp4')
const poster = resolve(root, 'docs/assets/collabhub-todo-list-smoke-poster.jpg')
const documentId = `todo-list-smoke-${Date.now()}`
const trace = []
let lastCanonicalVersion = 0

await rm(rawDir, { recursive: true, force: true })
await mkdir(rawDir, { recursive: true })
await Promise.all([waitForHttp('http://127.0.0.1:5173'), waitForHttp('http://127.0.0.1:5174')])

const browser = await chromium.launch({ headless: true })
const contextOptions = {
  viewport: { width: 960, height: 1080 },
  recordVideo: { dir: rawDir, size: { width: 960, height: 1080 } },
}
const [aliceContext, bobContext] = await Promise.all([
  browser.newContext(contextOptions),
  browser.newContext(contextOptions),
])
const [alice, bob] = await Promise.all([aliceContext.newPage(), bobContext.newPage()])
const aliceVideo = alice.video()
const bobVideo = bob.video()

try {
  await Promise.all([
    alice.goto(`http://127.0.0.1:5173/?client=alice&draft=${documentId}`),
    bob.goto(`http://127.0.0.1:5174/?client=bob&draft=${documentId}`),
  ])
  await Promise.all([
    alice.getByText('online', { exact: true }).waitFor(),
    bob.getByText('online', { exact: true }).waitFor(),
  ])
  await Promise.all([installCursor(alice, '#d94b3f'), installCursor(bob, '#287a56')])
  await pause(1_500)

  await activate(alice, bob, 'Alice renames the list')
  await humanClick(alice, alice.getByTestId('draft-title'))
  await alice.keyboard.press('Meta+A')
  await alice.keyboard.type('Launch checklist — Alice', { delay: 82 })
  await alice.keyboard.press('Tab')
  await waitForInputValue(bob, 'Launch checklist — Alice')
  await waitForMatchingVersions(alice, bob, lastCanonicalVersion)
  lastCanonicalVersion = await versionOf(bob)
  record('alice_title_converged', await diagnostics(alice, bob))
  await pause(1_300)

  await activate(bob, alice, 'Bob adds a task')
  await humanClick(bob, bob.getByTestId('add-section'))
  await Promise.all([
    alice.getByRole('button', { name: /^Delete / }).nth(2).waitFor(),
    bob.getByRole('button', { name: /^Delete / }).nth(2).waitFor(),
  ])
  await waitForMatchingVersions(alice, bob, lastCanonicalVersion)
  lastCanonicalVersion = await versionOf(bob)
  record('bob_task_converged', await diagnostics(alice, bob))
  await pause(1_300)

  await activate(alice, bob, 'Alice goes offline and keeps editing')
  await aliceContext.setOffline(true)
  await alice.getByText('offline', { exact: true }).waitFor()
  await humanClick(alice, alice.getByTestId('draft-title'))
  await alice.keyboard.press('Meta+A')
  await alice.keyboard.type('Alice offline checklist', { delay: 84 })
  await alice.keyboard.press('Tab')
  await waitForPending(alice, 1)
  record('alice_offline_pending', await diagnostics(alice, bob))
  await pause(1_500)

  await activate(bob, alice, 'Bob remains online')
  await humanClick(bob, bob.getByTestId('draft-title'))
  await bob.keyboard.press('Meta+A')
  await bob.keyboard.type('Bob online update', { delay: 86 })
  await bob.keyboard.press('Tab')
  await waitForVersionGreaterThan(bob, lastCanonicalVersion)
  lastCanonicalVersion = await versionOf(bob)
  record('bob_advances_canonical', await diagnostics(alice, bob))
  await pause(1_500)

  await activate(alice, bob, 'Alice reconnects and replays pending work')
  await aliceContext.setOffline(false)
  await alice.getByText('online', { exact: true }).waitFor()
  await waitForPending(alice, 0)
  await waitForInputValue(bob, 'Alice offline checklist')
  await waitForMatchingVersions(alice, bob, lastCanonicalVersion)
  lastCanonicalVersion = await versionOf(bob)
  record('reconnect_replay_converged', await diagnostics(alice, bob))
  await pause(1_700)

  await activate(bob, alice, 'Bob moves the new task to the top')
  await humanClick(bob, bob.getByRole('button', { name: /^Move .* first$/ }).last())
  await waitForMatchingVersions(alice, bob, lastCanonicalVersion)
  record('task_order_converged', await diagnostics(alice, bob))
  await pause(3_000)
} finally {
  await Promise.all([aliceContext.close(), bobContext.close()])
  await browser.close()
}

const [aliceRaw, bobRaw] = await Promise.all([aliceVideo.path(), bobVideo.path()])
await run('ffmpeg', [
  '-y', '-i', aliceRaw, '-i', bobRaw,
  '-filter_complex', '[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]hstack=inputs=2[v]',
  '-map', '[v]', '-an', '-r', '30', '-c:v', 'libx264', '-crf', '19', '-preset', 'medium',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalVideo,
])
await run('ffmpeg', ['-y', '-ss', '1.5', '-i', finalVideo, '-frames:v', '1', '-update', '1', '-q:v', '2', poster])
await writeFile(resolve(rawDir, 'trace.json'), `${JSON.stringify({ documentId, trace }, null, 2)}\n`)
console.log(JSON.stringify({ finalVideo, poster, documentId, trace }, null, 2))

async function waitForHttp(url) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch { /* service is still starting */ }
    await pause(500)
  }
  throw new Error(`Timed out waiting for ${url}. Start it with: pnpm dev`)
}

async function installCursor(page, color) {
  await page.evaluate((cursorColor) => {
    const cursor = document.createElement('div')
    cursor.id = 'collabhub-recording-cursor'
    cursor.innerHTML = '<span></span>'
    Object.assign(cursor.style, {
      position: 'fixed', left: '0', top: '0', width: '22px', height: '22px', zIndex: '2147483647',
      pointerEvents: 'none', opacity: '0', transform: 'translate(48px, 86px)',
      transition: 'transform 800ms cubic-bezier(.22,.75,.2,1), opacity 180ms ease',
    })
    Object.assign(cursor.firstElementChild.style, {
      display: 'block', width: '16px', height: '16px', borderRadius: '50%', background: cursorColor,
      border: '3px solid white', boxShadow: '0 2px 10px #0008',
    })
    document.body.append(cursor)
    const caption = document.createElement('div')
    caption.id = 'collabhub-recording-caption'
    Object.assign(caption.style, {
      position: 'fixed', left: '20px', bottom: '18px', zIndex: '2147483646', padding: '9px 13px',
      borderRadius: '9px', background: '#17231ce8', color: '#f2f6f3', font: '600 12px ui-monospace, monospace',
      boxShadow: '0 8px 24px #0003', opacity: '0', transition: 'opacity 180ms ease', pointerEvents: 'none',
    })
    document.body.append(caption)
  }, color)
}

async function activate(active, inactive, caption) {
  await Promise.all([
    active.evaluate((label) => {
      document.querySelector('#collabhub-recording-cursor').style.opacity = '1'
      const badge = document.querySelector('#collabhub-recording-caption')
      badge.textContent = label
      badge.style.opacity = '1'
    }, caption),
    inactive.evaluate(() => {
      document.querySelector('#collabhub-recording-cursor').style.opacity = '0'
      document.querySelector('#collabhub-recording-caption').style.opacity = '0'
    }),
  ])
  await pause(350)
}

async function humanClick(page, locator, duration = 850) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Target is not visible')
  const x = box.x + box.width * 0.5
  const y = box.y + box.height * 0.5
  await page.evaluate(({ x, y, duration }) => {
    const cursor = document.querySelector('#collabhub-recording-cursor')
    cursor.style.transitionDuration = `${duration}ms, 180ms`
    cursor.style.transform = `translate(${x - 8}px, ${y - 8}px)`
  }, { x, y, duration })
  await page.mouse.move(x, y, { steps: 24 })
  await pause(duration + 180)
  await page.mouse.down()
  await pause(110)
  await page.mouse.up()
  await pause(220)
}

async function waitForInputValue(page, value) {
  await page.waitForFunction((expected) => document.querySelector('[data-testid="draft-title"]')?.value === expected, value)
}

async function waitForPending(page, expected) {
  await page.waitForFunction((value) => {
    const current = Number(document.querySelector('[data-testid="pending-count"]')?.textContent?.split('·')[0]?.trim())
    return value === 0 ? current === 0 : current >= value
  }, expected)
}

async function waitForMatchingVersions(alicePage, bobPage, minimumExclusive) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const [aliceVersion, bobVersion] = await Promise.all([versionOf(alicePage), versionOf(bobPage)])
    if (aliceVersion === bobVersion && aliceVersion > minimumExclusive) return
    await pause(100)
  }
  throw new Error('TODO List clients did not converge')
}

async function waitForVersionGreaterThan(page, minimumExclusive) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (await versionOf(page) > minimumExclusive) return
    await pause(100)
  }
  throw new Error(`Canonical version did not advance past ${minimumExclusive}`)
}

async function versionOf(page) {
  return Number((await page.getByTestId('canonical-version').textContent())?.trim())
}

async function diagnostics(alicePage, bobPage) {
  return {
    aliceVersion: await versionOf(alicePage),
    bobVersion: await versionOf(bobPage),
    alicePending: (await alicePage.getByTestId('pending-count').textContent())?.trim(),
    bobPending: (await bobPage.getByTestId('pending-count').textContent())?.trim(),
    aliceRecovery: (await alicePage.getByTestId('recovery-counts').textContent())?.trim(),
  }
}

function record(event, evidence) {
  trace.push({ atMs: Math.round(performance.now()), event, ...evidence })
}

function pause(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)))
  })
}
