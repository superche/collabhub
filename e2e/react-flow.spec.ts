import { expect, test } from '@playwright/test'

test('React Flow root creates a stable URL that joins another client to the same room', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()

  await host.goto('http://127.0.0.1:5193/')
  await expect(host).toHaveURL(/\?document=graph-[0-9a-f-]{36}$/)
  const shareUrl = host.url()
  await guest.goto(shareUrl)
  await Promise.all([
    expect(host.getByText('online', { exact: true })).toBeVisible(),
    expect(guest.getByText('online', { exact: true })).toBeVisible(),
  ])

  await host.getByTestId('add-node').click()
  await expect(guest.locator('.react-flow__node')).toHaveCount(3)
  await expect(guest.getByTestId('react-flow-version')).toHaveText('1')
  await host.reload()
  await expect(host).toHaveURL(shareUrl)

  await hostContext.close()
  await guestContext.close()
})

test('React Flow converges incremental graph operations and offline replay', async ({ browser }) => {
  test.setTimeout(45_000)
  const documentId = `react-flow-e2e-${Date.now()}`
  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()

  await Promise.all([
    alice.goto(`http://127.0.0.1:5193/?client=alice&document=${documentId}`),
    bob.goto(`http://127.0.0.1:5194/?client=bob&document=${documentId}`),
  ])
  await Promise.all([
    expect(alice.getByText('online', { exact: true })).toBeVisible(),
    expect(bob.getByText('online', { exact: true })).toBeVisible(),
  ])

  await alice.getByTestId('add-node').click()
  await expect(bob.locator('.react-flow__node')).toHaveCount(3)
  await expect(bob.getByTestId('react-flow-version')).toHaveText('1')

  const node = alice.locator('[data-id="build"]')
  const box = await node.boundingBox()
  if (!box) throw new Error('build node is not visible')
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await alice.mouse.move(start.x, start.y)
  await alice.mouse.down()
  await alice.mouse.move(start.x + 100, start.y + 55, { steps: 20 })
  await alice.mouse.up()
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

  await alice.locator('[data-id="build"]').click()
  await alice.getByTestId('delete-selection').click()
  await expect(alice.getByText('4 nodes · 0 edges', { exact: true })).toBeVisible()
  await expect(bob.getByText('4 nodes · 0 edges', { exact: true })).toBeVisible()
  await expect(bob.getByTestId('react-flow-version')).toHaveText('5')

  await aliceContext.close()
  await bobContext.close()
})
