import { startLocalTodoCluster } from './lib/local-todo-cluster.mjs'

const cluster = await startLocalTodoCluster()
let stopping = false
async function stop(signal) {
  if (stopping) return
  stopping = true
  console.log(JSON.stringify({ event: 'local_todo_cluster_stopping', signal }))
  await cluster.stop()
  process.exit(0)
}
process.on('SIGINT', () => { void stop('SIGINT') })
process.on('SIGTERM', () => { void stop('SIGTERM') })
await new Promise(() => undefined)
