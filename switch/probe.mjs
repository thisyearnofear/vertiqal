import { readFileSync } from 'node:fs'
const { id, api_key: key } = JSON.parse(readFileSync(new URL('./.agent.json', import.meta.url), 'utf8'))
const url = `ws://localhost:18000/agents/${id}/connection/ws?connection_id=${crypto.randomUUID()}&rooms=60970745-0b3f-473e-9965-df3d21487866`
const ws = new WebSocket(url, { headers: { authorization: `Bearer ${key}` } })
ws.onmessage = (e) => {
  const d = JSON.parse(e.data)
  if (d.event === 'ping') return void ws.send(JSON.stringify({ type: 'pong', cursor: 9999 }))
  console.log('FRAME:', JSON.stringify(d).slice(0, 600))
}
ws.onerror = (e) => console.log('ERR', e.message || e)
ws.onclose = (e) => console.log('CLOSE', e.code, e.reason)
setTimeout(() => process.exit(0), 15000)
