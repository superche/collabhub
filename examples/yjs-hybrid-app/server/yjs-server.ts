import { WebSocketServer, WebSocket } from 'ws'
import * as Y from 'yjs'

const host = '127.0.0.1'
const port = Number(process.env.COLLABHUB_YJS_TEXT_PORT ?? 4401)
const rooms = new Map<string, { document: Y.Doc; clients: Set<WebSocket> }>()
const server = new WebSocketServer({ host, port, maxPayload: 256 * 1024 })

server.on('connection', (socket, request) => {
  const roomName = roomFrom(request.url)
  if (!roomName) { socket.close(1008, 'room name required'); return }
  const room = rooms.get(roomName) ?? { document: new Y.Doc(), clients: new Set<WebSocket>() }
  rooms.set(roomName, room)
  room.clients.add(socket)
  socket.send(Y.encodeStateAsUpdate(room.document))

  socket.on('message', (raw, isBinary) => {
    if (!isBinary) { socket.close(1003, 'binary Yjs update required'); return }
    const update = new Uint8Array(raw as Buffer)
    try { Y.applyUpdate(room.document, update, socket) }
    catch { socket.close(1007, 'invalid Yjs update'); return }
    for (const peer of room.clients) {
      if (peer !== socket && peer.readyState === WebSocket.OPEN) peer.send(update)
    }
  })
  socket.on('close', () => room.clients.delete(socket))
})

server.on('listening', () => {
  console.log(`[yjs:hybrid] server pid=${process.pid} ws=ws://${host}:${port}/<room> storage=memory`)
})

function roomFrom(path: string | undefined): string | undefined {
  if (!path) return undefined
  const value = decodeURIComponent(new URL(path, 'http://localhost').pathname.slice(1))
  return value && value.length <= 256 ? value : undefined
}
