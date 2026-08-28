import { loadDomainPackFromEnvironment } from '@collabhub/domain-json/server-loader'
import { installDistributedNodeSignalHandlers, startDistributedNodeFromEnvironment } from './bootstrap.js'

const { pack, source } = await loadDomainPackFromEnvironment()
console.log(JSON.stringify({ level: 'info', message: 'CollabHub Domain Pack loaded', domainPack: pack.id, schemaVersion: pack.schemaVersion, source }))
installDistributedNodeSignalHandlers(await startDistributedNodeFromEnvironment(pack))
