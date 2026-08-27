import { chromium, expect } from '@playwright/test'
import { startLocalTodoCluster } from './lib/local-todo-cluster.mjs'

const cluster = await startLocalTodoCluster()
const draftId = `local-cluster-${Date.now()}`
const trace = []
let browser

function record(event) {
  trace.push(event)
  console.log(JSON.stringify(event))
}

try {
  browser = await chromium.launch({ headless: true })
  const aliceContext = await browser.newContext()
  const bobContext = await browser.newContext()
  const alice = await aliceContext.newPage()
  const bob = await bobContext.newPage()
  await Promise.all([
    alice.goto(`http://127.0.0.1:5273/?client=alice&draft=${draftId}`),
    bob.goto(`http://127.0.0.1:5274/?client=bob&draft=${draftId}`),
  ])
  await Promise.all([
    expect(alice.getByText('online', { exact: true })).toBeVisible(),
    expect(bob.getByText('online', { exact: true })).toBeVisible(),
  ])
  record({ event: 'two_browsers_on_distinct_gateways', draftId, gateway1: 7011, gateway2: 7012 })

  await alice.getByTestId('draft-title').fill('Local cluster TODO')
  await alice.getByTestId('draft-title').blur()
  await expect(bob.getByTestId('draft-title')).toHaveValue('Local cluster TODO')
  await expect(bob.getByTestId('canonical-version')).toHaveText('1')
  record({ event: 'cross_gateway_title_converged', canonicalVersion: 1 })

  await alice.getByTestId('complete-intro').check()
  await expect(bob.getByTestId('complete-intro')).toBeChecked()
  await expect(bob.getByTestId('completion-summary')).toContainText('1/2 completed')
  await expect(bob.getByTestId('completion-percent')).toHaveText('50%')
  await expect(bob.getByTestId('canonical-version')).toHaveText('2')
  record({ event: 'linked_update_converged', canonicalVersion: 2, completed: 1, total: 2, percent: 50 })

  const previousOwner = cluster.ownerFor('demo', draftId)
  if (!['todo-worker-1', 'todo-worker-2'].includes(previousOwner)) throw new Error(`unexpected owner ${previousOwner}`)
  await cluster.stopProcess(previousOwner)
  record({ event: 'writer_process_stopped', instanceId: previousOwner, pid: cluster.processEvidence[previousOwner] })

  await bob.getByTestId('draft-title').fill('After local worker failover')
  await bob.getByTestId('draft-title').blur()
  await expect(alice.getByTestId('draft-title')).toHaveValue('After local worker failover')
  await expect(alice.getByTestId('canonical-version')).toHaveText('3')
  const nextOwner = cluster.ownerFor('demo', draftId)
  if (!nextOwner || nextOwner === previousOwner) throw new Error(`owner did not migrate: ${previousOwner} -> ${nextOwner}`)
  record({ event: 'writer_failover_converged', from: previousOwner, to: nextOwner, canonicalVersion: 3 })

  await aliceContext.setOffline(true)
  await alice.getByTestId('draft-title').fill('Alice queued locally')
  await alice.getByTestId('draft-title').blur()
  await expect(alice.getByTestId('pending-count')).toContainText('1')
  await bob.getByTestId('draft-title').fill('Bob advances while Alice offline')
  await bob.getByTestId('draft-title').blur()
  await expect(bob.getByTestId('canonical-version')).toHaveText('4')
  await aliceContext.setOffline(false)
  await expect(alice.getByText('online', { exact: true })).toBeVisible()
  await expect(bob.getByTestId('draft-title')).toHaveValue('Alice queued locally')
  await expect(bob.getByTestId('canonical-version')).toHaveText('5')
  await expect(alice.getByTestId('pending-count')).toContainText('0')
  record({ event: 'offline_pending_replayed', canonicalVersion: 5, pending: 0 })

  const charlieContext = await browser.newContext()
  const charlie = await charlieContext.newPage()
  await charlie.goto(`http://127.0.0.1:5273/?client=charlie&draft=${draftId}`)
  await expect(charlie.getByText('online', { exact: true })).toBeVisible()
  await expect(charlie.getByTestId('draft-title')).toHaveValue('Alice queued locally')
  await expect(charlie.getByTestId('canonical-version')).toHaveText('5')
  record({ event: 'fresh_browser_snapshot_recovery', canonicalVersion: 5 })
  await charlieContext.close()
  await aliceContext.close()
  await bobContext.close()

  await new Promise((resolve) => setTimeout(resolve, 300))
  const evidence = cluster.databaseEvidence('demo', draftId).split('|')
  record({
    event: 'postgres_evidence', canonicalVersion: Number(evidence[0]), ownerEpoch: Number(evidence[1]),
    owner: evidence[2], snapshotVersion: Number(evidence[3]), wal: Number(evidence[4]), receipts: Number(evidence[5]), deliveredOutbox: Number(evidence[6]),
  })
  if (trace.at(-1).canonicalVersion !== 5 || trace.at(-1).ownerEpoch < 2 || trace.at(-1).wal !== 5 || trace.at(-1).receipts !== 5) throw new Error(`unexpected database evidence: ${evidence.join('|')}`)
} finally {
  await browser?.close().catch(() => undefined)
  await cluster.stop()
}
