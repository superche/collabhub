import { installDistributedNodeSignalHandlers, startDistributedNodeFromEnvironment } from '@collabhub/server-distributed'
import { DraftDomainPack } from './draft-domain-pack.js'

installDistributedNodeSignalHandlers(await startDistributedNodeFromEnvironment(DraftDomainPack))
