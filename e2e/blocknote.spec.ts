import { expect, test, type WebSocket } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

function captureSubmittedFrames(socket: WebSocket, frames: string[]) {
  socket.on('framesent', (event) => {
    const payload = typeof event.payload === 'string' ? event.payload : event.payload.toString()
    try {
      const message = JSON.parse(payload) as { kind?: string }
      if (message.kind === 'submit') frames.push(payload)
    } catch { /* only JSON application frames are relevant */ }
  })
}

test('BlockNote uses incremental CollabHub operations and converges after reconnect', async ({ browser }) => {
  test.setTimeout(45_000)
  const documentId = `blocknote-e2e-${Date.now()}`
  const aliceFrames: string[] = []
  const bobFrames: string[] = []
  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()
  alice.on('websocket', (socket) => captureSubmittedFrames(socket, aliceFrames))
  bob.on('websocket', (socket) => captureSubmittedFrames(socket, bobFrames))

  await Promise.all([
    alice.goto(`http://127.0.0.1:5183/?client=alice&document=${documentId}`),
    bob.goto(`http://127.0.0.1:5184/?client=bob&document=${documentId}`),
  ])
  await Promise.all([
    expect(alice.getByText('online', { exact: true })).toBeVisible(),
    expect(bob.getByText('online', { exact: true })).toBeVisible(),
  ])

  const intro = alice.getByText('Edit this block from either browser.', { exact: true })
  await intro.click()
  await alice.keyboard.press('End')
  await alice.keyboard.type(' Alice typed this', { delay: 20 })
  await expect(bob.getByText(/Alice typed this/)).toBeVisible()
  await expect(alice.getByTestId('blocknote-pending')).toHaveText('0')

  const updateFrames = aliceFrames
    .map((frame) => JSON.parse(frame) as { operation: { operationType: string; payload: Record<string, unknown> } })
    .filter((message) => message.operation.operationType === 'block.update')
  expect(updateFrames.length).toBeGreaterThan(0)
  expect(updateFrames.length).toBeLessThan(' Alice typed this'.length)
  for (const frame of updateFrames) {
    expect(frame.operation.payload).toHaveProperty('block')
    expect(frame.operation.payload).not.toHaveProperty('blocks')
    expect(frame.operation.payload).not.toHaveProperty('document')
  }

  await bob.getByTestId('append-block').click()
  await expect(alice.getByText('New block from bob', { exact: true })).toHaveCount(1)

  await aliceContext.setOffline(true)
  await expect(alice.getByText('offline', { exact: true })).toBeVisible()
  await alice.getByTestId('append-block').click()
  await expect(alice.getByTestId('blocknote-pending')).toHaveText('1')
  await bob.getByTestId('append-block').click()
  await expect(bob.getByText('New block from bob', { exact: true })).toHaveCount(2)

  await aliceContext.setOffline(false)
  await expect(alice.getByText('online', { exact: true })).toBeVisible()
  await expect(alice.getByTestId('blocknote-pending')).toHaveText('0')
  await expect(alice.getByText('New block from bob', { exact: true })).toHaveCount(2)
  await expect(bob.getByText('New block from alice', { exact: true })).toBeVisible()
  await expect(alice.getByTestId('blocknote-recovery')).toHaveText(/1 \/ 0/)
  await alice.waitForTimeout(250)
  expect(bobFrames.map((frame) => JSON.parse(frame).operation.operationType)).not.toContain('block.update')
  expect(aliceFrames.map((frame) => JSON.parse(frame).operation.operationType).filter((type) => type === 'block.update')).toHaveLength(updateFrames.length)
  await expect(alice.getByTestId('blocknote-version')).toHaveText('4')
  await expect(bob.getByTestId('blocknote-version')).toHaveText('4')

  const lastText = await alice.getByTestId('blocknote-editor').locator('.bn-block-content').last().innerText()
  await alice.getByTestId('move-last-first').click()
  await expect(bob.getByTestId('blocknote-editor').locator('.bn-block-content').first()).toContainText(lastText)
  await expect.poll(async () => await alice.getByTestId('blocknote-version').textContent()).toBe(await bob.getByTestId('blocknote-version').textContent())

  if (process.env.COLLABHUB_EVIDENCE_DIR) {
    await mkdir(process.env.COLLABHUB_EVIDENCE_DIR, { recursive: true })
    await Promise.all([
      alice.screenshot({ path: join(process.env.COLLABHUB_EVIDENCE_DIR, 'blocknote-alice.png'), fullPage: true }),
      bob.screenshot({ path: join(process.env.COLLABHUB_EVIDENCE_DIR, 'blocknote-bob.png'), fullPage: true }),
    ])
  }

  await aliceContext.close()
  await bobContext.close()
})
