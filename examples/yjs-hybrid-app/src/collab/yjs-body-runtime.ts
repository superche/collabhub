import * as Y from 'yjs'

export type YjsConnection = 'connecting' | 'connected' | 'disconnected'

/** Character-level body state. CollabHub never reads or writes this field. */
export class YjsBodyRuntime {
  private readonly document = new Y.Doc()
  private readonly body = this.document.getText('body')
  private socket?: WebSocket
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private manuallyClosed = false
  private readonly textListeners = new Set<() => void>()
  private readonly connectionListeners = new Set<() => void>()
  private connectionValue: YjsConnection = 'connecting'
  private syncedValue = false

  constructor(serverUrl: string, roomName: string) {
    this.body.observe(() => { for (const listener of this.textListeners) listener() })
    this.document.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE_ORIGIN && this.socket?.readyState === WebSocket.OPEN) this.socket.send(update)
    })
    this.connect(`${serverUrl}/${encodeURIComponent(roomName)}`)
  }

  readonly getSnapshot = (): string => this.body.toString()
  readonly subscribe = (listener: () => void): (() => void) => {
    this.textListeners.add(listener)
    return () => this.textListeners.delete(listener)
  }
  readonly getConnectionSnapshot = (): string => `${this.connectionValue}:${this.syncedValue ? 'synced' : 'syncing'}`
  readonly subscribeConnection = (listener: () => void): (() => void) => {
    this.connectionListeners.add(listener)
    return () => this.connectionListeners.delete(listener)
  }

  /** Convert a textarea edit into one minimal Y.Text delete/insert transaction. */
  replace(next: string): void {
    const previous = this.body.toString()
    if (previous === next) return
    const prefix = commonPrefixLength(previous, next)
    const suffix = commonSuffixLength(previous, next, prefix)
    const deleteLength = previous.length - prefix - suffix
    const insert = next.slice(prefix, next.length - suffix)
    this.document.transact(() => {
      if (deleteLength > 0) this.body.delete(prefix, deleteLength)
      if (insert) this.body.insert(prefix, insert)
    }, 'local-textarea')
  }

  close(): void {
    this.manuallyClosed = true
    clearTimeout(this.reconnectTimer)
    this.socket?.close()
    this.document.destroy()
    this.textListeners.clear()
    this.connectionListeners.clear()
  }

  private connect(url: string): void {
    if (this.manuallyClosed) return
    this.setConnection('connecting', false)
    const socket = new WebSocket(url)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return
      socket.send(Y.encodeStateAsUpdate(this.document))
      this.setConnection('connected', false)
    })
    socket.addEventListener('message', event => {
      if (this.socket !== socket || !(event.data instanceof ArrayBuffer)) return
      Y.applyUpdate(this.document, new Uint8Array(event.data), REMOTE_ORIGIN)
      this.setConnection('connected', true)
    })
    socket.addEventListener('close', () => {
      if (this.socket !== socket || this.manuallyClosed) return
      this.setConnection('disconnected', false)
      this.reconnectTimer = setTimeout(() => this.connect(url), 500)
    })
  }

  private setConnection(connection: YjsConnection, synced: boolean): void {
    this.connectionValue = connection
    this.syncedValue = synced
    for (const listener of this.connectionListeners) listener()
  }
}

const REMOTE_ORIGIN = Symbol('remote-yjs-update')

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length)
  let index = 0
  while (index < limit && left[index] === right[index]) index++
  return index
}

function commonSuffixLength(left: string, right: string, prefix: number): number {
  const limit = Math.min(left.length, right.length) - prefix
  let offset = 0
  while (offset < limit && left[left.length - 1 - offset] === right[right.length - 1 - offset]) offset++
  return offset
}
