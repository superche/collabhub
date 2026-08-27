import { chromium } from '@playwright/test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const rawDir = resolve(root, 'output/playwright/blocknote-smoke')
const finalVideo = resolve(root, 'docs/assets/collabhub-blocknote-smoke.mp4')
const poster = resolve(root, 'docs/assets/collabhub-blocknote-smoke-poster.jpg')
const traceFile = resolve(rawDir, 'trace.json')
const documentId = `blocknote-smoke-${Date.now()}`
const trace = []
let lastCanonicalVersion = 0

await rm(rawDir, { recursive: true, force: true })
await mkdir(rawDir, { recursive: true })
await Promise.all([
  waitForHttp('http://127.0.0.1:5183'),
  waitForHttp('http://127.0.0.1:5184'),
])

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
    alice.goto(`http://127.0.0.1:5183/?client=alice&document=${documentId}`),
    bob.goto(`http://127.0.0.1:5184/?client=bob&document=${documentId}`),
  ])
  await Promise.all([
    alice.getByText('online', { exact: true }).waitFor(),
    bob.getByText('online', { exact: true }).waitFor(),
  ])
  await Promise.all([installCursor(alice, '#d94b3f'), installCursor(bob, '#287a56')])
  await pause(1_500)

  const intro = alice.getByText('Edit this block from either browser.', { exact: true })
  await activate(alice, bob, 'Alice edits a block')
  await humanClick(alice, intro, { xRatio: 0.97, duration: 900 })
  await alice.keyboard.press('End')
  await alice.keyboard.type(' — edited by Alice', { delay: 92 })
  await bob.getByText(/edited by Alice/).waitFor()
  await waitForValue(alice.getByTestId('blocknote-pending'), '0')
  await waitForMatchingVersions(alice, bob, lastCanonicalVersion)
  lastCanonicalVersion = Number(await textOf(bob.getByTestId('blocknote-version')))
  record('alice_typing_converged', await versions(alice, bob))
  await pause(1_300)

  await activate(bob, alice, 'Bob inserts a block')
  await humanClick(bob, bob.getByTestId('append-block'), { duration: 850 })
  await alice.getByText('New block from bob', { exact: true }).waitFor()
  await waitForMatchingVersions(alice, bob, lastCanonicalVersion)
  lastCanonicalVersion = Number(await textOf(bob.getByTestId('blocknote-version')))
  record('bob_insert_converged', await versions(alice, bob))
  await pause(1_300)

  await activate(alice, bob, 'Alice goes offline and keeps editing')
  await aliceContext.setOffline(true)
  await alice.getByText('offline', { exact: true }).waitFor()
  await humanClick(alice, alice.getByTestId('append-block'), { duration: 950 })
  await waitForValue(alice.getByTestId('blocknote-pending'), '1')
  record('alice_offline_pending', await diagnostics(alice, bob))
  await pause(1_500)

  await activate(bob, alice, 'Bob remains online')
  await humanClick(bob, bob.getByTestId('append-block'), { duration: 950 })
  await bob.getByText('New block from bob', { exact: true }).nth(1).waitFor()
  await waitForVersionGreaterThan(bob, lastCanonicalVersion)
  lastCanonicalVersion = Number(await textOf(bob.getByTestId('blocknote-version')))
  record('bob_advances_canonical', await diagnostics(alice, bob))
  await pause(1_600)

  await activate(alice, bob, 'Alice reconnects and replays pending work')
  await aliceContext.setOffline(false)
  await alice.getByText('online', { exact: true }).waitFor()
  await waitForValue(alice.getByTestId('blocknote-pending'), '0')
  await Promise.all([
    alice.getByText('New block from bob', { exact: true }).nth(1).waitFor(),
    bob.getByText('New block from alice', { exact: true }).waitFor(),
  ])
  await waitForMatchingVersions(alice, bob, lastCanonicalVersion)
  lastCanonicalVersion = Number(await textOf(bob.getByTestId('blocknote-version')))
  record('reconnect_replay_converged', await diagnostics(alice, bob))
  await pause(2_000)

  const lastBlock = alice.getByTestId('blocknote-editor').locator('.bn-block-content').last()
  const movedText = await lastBlock.innerText()
  await activate(alice, bob, 'Alice moves the last block to the top')
  await humanClick(alice, alice.getByTestId('move-last-first'), { duration: 1_000 })
  await bob.getByTestId('blocknote-editor').locator('.bn-block-content').first().getByText(movedText, { exact: true }).waitFor()
  await waitForMatchingVersions(alice, bob, lastCanonicalVersion)
  record('block_order_converged', { movedText, ...(await diagnostics(alice, bob)) })
  await pause(3_000)
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
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch { /* service is still starting */ }
    await pause(500)
  }
  throw new Error(`Timed out waiting for ${url}. Start it with: pnpm dev:blocknote`)
}

async function installCursor(page, color) {
  await page.evaluate((cursorColor) => {
    const cursor = document.createElement('div')
    cursor.id = 'collabhub-recording-cursor'
    cursor.innerHTML = '<span></span>'
    Object.assign(cursor.style, {
      position: 'fixed', left: '0', top: '0', width: '22px', height: '22px', zIndex: '2147483647',
      pointerEvents: 'none', opacity: '0', transform: 'translate(48px, 86px)', transition: 'transform 800ms cubic-bezier(.22,.75,.2,1), opacity 180ms ease',
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
      const cursor = document.querySelector('#collabhub-recording-cursor')
      const badge = document.querySelector('#collabhub-recording-caption')
      cursor.style.opacity = '1'
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

async function humanClick(page, locator, { xRatio = 0.5, duration = 800 } = {}) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Target is not visible')
  const x = box.x + box.width * xRatio
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
  await pause(240)
}

async function waitForValue(locator, expected) {
  await locator.page().waitForFunction(
    ({ selector, value }) => document.querySelector(selector)?.textContent?.trim() === value,
    { selector: `[data-testid="${await locator.getAttribute('data-testid')}"]`, value: expected },
  )
}

async function waitForMatchingVersions(alicePage, bobPage, minimumExclusive) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const current = await versions(alicePage, bobPage)
    if (current.aliceVersion === current.bobVersion && Number(current.aliceVersion) > minimumExclusive) return
    await pause(100)
  }
  throw new Error('Clients did not converge on the reordered canonical version')
}

async function waitForVersionGreaterThan(page, minimumExclusive) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const current = Number(await textOf(page.getByTestId('blocknote-version')))
    if (current > minimumExclusive) return
    await pause(100)
  }
  throw new Error(`Canonical version did not advance past ${minimumExclusive}`)
}

async function versions(alicePage, bobPage) {
  return {
    aliceVersion: await textOf(alicePage.getByTestId('blocknote-version')),
    bobVersion: await textOf(bobPage.getByTestId('blocknote-version')),
  }
}

async function diagnostics(alicePage, bobPage) {
  return {
    ...(await versions(alicePage, bobPage)),
    alicePending: await textOf(alicePage.getByTestId('blocknote-pending')),
    bobPending: await textOf(bobPage.getByTestId('blocknote-pending')),
    aliceRecovery: await textOf(alicePage.getByTestId('blocknote-recovery')),
  }
}

async function textOf(locator) {
  return (await locator.textContent())?.trim()
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
