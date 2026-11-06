#!/usr/bin/env node
/**
 * Minimal mock Switch server for local development of room-agent.mjs.
 * NOT the real protocol — just enough to drive the agent end-to-end against
 * the live vertiqal endpoints before Switch Console/Docker is set up.
 *
 *   node switch/mock-server.mjs            # listens on :8787
 *   curl -X POST localhost:8787/inject -H 'content-type: application/json' \
 *     -d '{"body":"fit http://localhost:3000/api/passport/demo-running"}'
 *
 * Implements:
 *   POST /agents                        → {id, api_key} (registration)
 *   POST /agents/{id}/ops/*             → {result: null}
 *   POST /agents/{id}/message           → prints the agent's room posts
 *   GET  /agents/{id}/connection/ws     → WebSocket: connection_state, ping, message events
 *   POST /inject {body, addressed?, sender_name?, room_id?}  → emits a room message event
 */
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'

const PORT = Number(process.env.MOCK_PORT ?? 8787)
const API_KEY = 'mock-agent-key'
const AGENT_ID = 'mock-agent-1'
const ROOM_ID = 'room-1'
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

let socket = null
let seq = 0
let cursor = 0

const encode = (text) => {
  const payload = Buffer.from(text)
  const len = payload.length
  const header = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 0xff]) : null
  if (!header) throw new Error('frame too big for mock')
  return Buffer.concat([header, payload])
}

const send = (frame) => {
  if (socket && !socket.destroyed) socket.write(encode(JSON.stringify(frame)))
}

const emitMessage = ({ body, addressed = true, sender_name = 'coach', sender = '@switch-user-coach:local', room_id = ROOM_ID }) =>
  send({
    id: ++seq,
    type: 'message',
    room_id,
    payload: {
      addressed,
      sender,
      sender_name,
      message_id: randomUUID(),
      body,
      timestamp: Date.now(),
      thread_id: null,
      attachments: [],
    },
  })

const json = async (req) => {
  let data = ''
  for await (const chunk of req) data += chunk
  try {
    return JSON.parse(data)
  } catch {
    return {}
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const reply = (status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(obj))
  }

  if (req.method === 'POST' && url.pathname === '/agents') {
    return reply(200, { id: AGENT_ID, api_key: API_KEY })
  }
  if (req.method === 'POST' && url.pathname === '/inject') {
    emitMessage(await json(req))
    return reply(200, { ok: true })
  }
  const msgMatch = url.pathname.match(/^\/agents\/[^/]+\/message$/)
  if (req.method === 'POST' && msgMatch) {
    const { content, room_id } = await json(req)
    console.log(`\n── agent → ${room_id} ──\n${content}\n`)
    // Real Switch delivers an agent's own posts back to its connection.
    emitMessage({ body: content, room_id: room_id ?? ROOM_ID, addressed: false, sender_name: 'Forma', sender: '@switch-agent-1:local' })
    return reply(200, { message_id: randomUUID() })
  }
  if (req.method === 'POST' && url.pathname.match(/^\/agents\/[^/]+\/ops\//)) {
    return reply(200, { result: null })
  }
  reply(404, { error: 'mock: unknown route' })
})

server.on('upgrade', (req, sock) => {
  if (!req.url.includes('/connection/ws')) return sock.destroy()
  const key = req.headers['sec-websocket-key']
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${createHash('sha1').update(key + WS_GUID).digest('base64')}\r\n\r\n`,
  )
  socket = sock
  console.log('agent connected')
  send({ type: 'connection_state', cursor: 0, generation: 1, rooms: [{ id: ROOM_ID, name: 'relay-fitting' }] })
  const ping = setInterval(() => send({ type: 'ping' }), 2000)

  let buf = Buffer.alloc(0)
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    for (;;) {
      if (buf.length < 2) return
      const len7 = buf[1] & 0x7f
      let off = 2
      let len = len7
      if (len7 === 126) {
        if (buf.length < 4) return
        len = buf.readUInt16BE(2)
        off = 4
      }
      const masked = (buf[1] & 0x80) !== 0
      const maskOff = off
      if (masked) off += 4
      if (buf.length < off + len) return
      let payload = buf.subarray(off, off + len)
      if (masked) {
        const mask = buf.subarray(maskOff, maskOff + 4)
        payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]))
      }
      const opcode = buf[0] & 0x0f
      buf = buf.subarray(off + len)
      if (opcode === 0x8) {
        sock.end()
        return
      }
      if (opcode !== 0x1) continue
      try {
        const frame = JSON.parse(payload.toString())
        if (frame.type === 'pong') cursor = Math.max(cursor, frame.cursor ?? 0)
      } catch {
        /* ignore */
      }
    }
  })
  sock.on('close', () => {
    clearInterval(ping)
    socket = null
    console.log('agent disconnected')
  })
  sock.on('error', () => {})
})

server.listen(PORT, () => {
  console.log(`mock switch on :${PORT} — room "${ROOM_ID}"`)
  console.log(`register:  SWITCH_BASE_URL=http://localhost:${PORT} SWITCH_REGISTRATION_KEY=x pnpm switch:register`)
  console.log(`inject:    curl -X POST localhost:${PORT}/inject -H 'content-type: application/json' -d '{"body":"..."}'`)
})
