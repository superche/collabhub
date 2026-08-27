import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

test('two real browser clients converge, recover, enforce one writer, and switch to REST', async ({ browser, request }) => {
  const draftId = `e2e-${Date.now()}`
  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()
  const bobFrames: string[] = []
  bob.on('websocket', (socket) => socket.on('framereceived', (frame) => bobFrames.push(String(frame.payload))))
  await Promise.all([
    alice.goto(`http://127.0.0.1:5173/?client=alice&draft=${draftId}`),
    bob.goto(`http://127.0.0.1:5174/?client=bob&draft=${draftId}`),
  ])
  await Promise.all([
    expect(alice.getByText('online', { exact: true })).toBeVisible(),
    expect(bob.getByText('online', { exact: true })).toBeVisible(),
  ])

  await alice.getByTestId('draft-title').fill('Alice canonical title')
  await alice.getByTestId('draft-title').blur()
  await expect(bob.getByTestId('draft-title')).toHaveValue('Alice canonical title')
  await expect(alice.getByTestId('canonical-version')).toHaveText('1')
  await expect(bob.getByTestId('canonical-version')).toHaveText('1')

  await alice.getByTestId('complete-intro').check()
  await expect(bob.getByTestId('complete-intro')).toBeChecked()
  await expect(alice.getByTestId('completion-summary')).toContainText('1/2 completed')
  await expect(bob.getByTestId('completion-summary')).toContainText('1/2 completed')
  await expect(alice.getByTestId('completion-percent')).toHaveText('50%')
  await expect(bob.getByTestId('completion-percent')).toHaveText('50%')
  await expect(alice.getByTestId('canonical-version')).toHaveText('2')
  await expect(bob.getByTestId('canonical-version')).toHaveText('2')
  await expect.poll(() => bobFrames.some((raw) => {
    const message = JSON.parse(raw) as { kind?: string; patches?: Array<{ op: string; path?: string; collection?: string }> }
    return message.kind === 'canonical'
      && message.patches?.some((patch) => patch.op === 'entityUpsert' && patch.collection === 'sections')
      && message.patches?.some((patch) => patch.path === '/completion/percent')
      && message.patches?.some((patch) => patch.path === '/revision')
  })).toBe(true)

  const lockedPut = await request.put(`http://127.0.0.1:4100/api/drafts/${draftId}`, {
    data: { id: draftId, revision: 2, title: 'Bypass', status: 'draft', sections: [], completion: { completed: 0, total: 0, percent: 0 }, metadata: {} },
  })
  expect(lockedPut.status()).toBe(409)
  expect((await lockedPut.json()).reason).toBe('collaborativeSessionActive')

  await aliceContext.setOffline(true)
  await alice.getByTestId('draft-title').fill('Alice queued intent')
  await alice.getByTestId('draft-title').blur()
  await expect(alice.getByText('offline', { exact: true })).toBeVisible()
  await expect(alice.getByTestId('pending-count')).toContainText('1')
  await bob.getByTestId('draft-title').fill('Bob while Alice offline')
  await bob.getByTestId('draft-title').blur()
  await expect(bob.getByTestId('canonical-version')).toHaveText('3')
  await aliceContext.setOffline(false)
  await expect(alice.getByText('online', { exact: true })).toBeVisible()
  await expect(bob.getByTestId('draft-title')).toHaveValue('Alice queued intent')
  await expect(alice.getByTestId('pending-count')).toContainText('0')
  await expect(alice.getByTestId('recovery-counts')).toHaveText(/1 \/ 0/)

  if (process.env.COLLABHUB_EVIDENCE_DIR) {
    await mkdir(process.env.COLLABHUB_EVIDENCE_DIR, { recursive: true })
    await Promise.all([
      alice.screenshot({ path: join(process.env.COLLABHUB_EVIDENCE_DIR, 'collabhub-v0.1-alice.png'), fullPage: true }),
      bob.screenshot({ path: join(process.env.COLLABHUB_EVIDENCE_DIR, 'collabhub-v0.1-bob.png'), fullPage: true }),
    ])
  }

  await Promise.all([
    alice.getByTestId('collab-toggle').uncheck(),
    bob.getByTestId('collab-toggle').uncheck(),
  ])
  await expect(alice.getByText('REST', { exact: true })).toBeVisible()
  await expect(bob.getByText('REST', { exact: true })).toBeVisible()
  await expect.poll(async () => (await request.get(`http://127.0.0.1:4100/api/drafts/${draftId}`)).status()).toBe(200)
  await alice.getByTestId('draft-title').fill('REST single-writer title')
  await alice.getByTestId('draft-title').blur()
  await expect.poll(async () => (await (await request.get(`http://127.0.0.1:4100/api/drafts/${draftId}`)).json()).title).toBe('REST single-writer title')

  await aliceContext.close()
  await bobContext.close()
})
