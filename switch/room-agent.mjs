#!/usr/bin/env node
/**
 * Vertiqal room agent for the Flip the Switch hackathon.
 *
 * Speaks the Switch agent protocol directly — WebSocket in, HTTP ops out —
 * so no Claude Code/Codex credits are needed. It is a thin state machine:
 * the only model calls happen inside the vertiqal endpoints it orchestrates.
 *
 *   passport URL in chat → GET /api/passport/<token>      → summary + "approve?"
 *   "approve"            → POST /api/agent {brief, prefs} → picks (+stockTokens)
 *                        → POST /api/stock-check         → size verdicts
 *                        → final plan with receipts
 *
 * Requires Node >= 22 (built-in WebSocket + fetch). Zero dependencies.
 *
 * Env:
 *   SWITCH_BASE_URL        server address, e.g. http://localhost:8080   (or from switch/.agent.json)
 *   SWITCH_AGENT_ID / SWITCH_AGENT_API_KEY                                  (or from switch/.agent.json)
 *   VERTIQAL_BASE_URL      default http://localhost:3000
 *   SWITCH_ROOM_ID         optional — only act in this room
 *   DEFAULT_BUDGET         default "£150"     AGENT_DEPTH  default "quick"
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
let saved = {}
try {
  saved = JSON.parse(readFileSync(join(DIR, '.agent.json'), 'utf8'))
} catch {
  /* env can supply everything */
}

const SELFTEST = process.argv.includes('--selftest')

const BASE = (process.env.SWITCH_BASE_URL ?? saved.base ?? '').replace(/\/+$/, '')
const AGENT_ID = process.env.SWITCH_AGENT_ID ?? saved.id
const API_KEY = process.env.SWITCH_AGENT_API_KEY ?? saved.api_key
const AGENT_NAME = process.env.SWITCH_AGENT_NAME ?? saved.name ?? 'vertiqal-forma'
const VERTIQAL = (process.env.VERTIQAL_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const ROOM_FILTER = process.env.SWITCH_ROOM_ID ?? null
const DEFAULT_BUDGET = process.env.DEFAULT_BUDGET ?? '£150'
const DEPTH = process.env.AGENT_DEPTH ?? 'quick'

if (!SELFTEST && (!BASE || !AGENT_ID || !API_KEY)) {
  console.error('Need SWITCH_BASE_URL, SWITCH_AGENT_ID, SWITCH_AGENT_API_KEY (env or switch/.agent.json)')
  process.exit(1)
}

// ---------------------------------------------------------------- vertiqal API

async function fetchPassport(token) {
  const res = await fetch(`${VERTIQAL}/api/passport/${encodeURIComponent(token)}`)
  if (!res.ok) return null
  return res.json()
}

async function stockCheck({ name, url, stockToken }, size) {
  try {
    const res = await fetch(`${VERTIQAL}/api/stock-check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productName: name, productUrl: url, size, stockToken: stockToken ?? '' }),
    })
    if (!res.ok) return { error: `${res.status}` }
    return res.json()
  } catch (e) {
    return { error: String(e?.message ?? e) }
  }
}

async function* sseJson(res) {
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buf += dec.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') return
        try {
          yield JSON.parse(data)
        } catch {
          /* keepalive / malformed line */
        }
      }
    }
  }
}

/** Consume the AI SDK UI-message stream from POST /api/agent into {profile, picks, text}. */
async function runGearAgent(brief, prefs) {
  const res = await fetch(`${VERTIQAL}/api/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brief, prefs }),
  })
  if (!res.ok || !res.body) {
    const detail = res.ok ? '' : ` ${(await res.text()).slice(0, 200)}`
    throw new Error(`agent endpoint ${res.status}${detail}`)
  }
  let text = ''
  let profile = null
  let picks = null
  const toolNames = new Map() // toolCallId -> toolName
  for await (const c of sseJson(res)) {
    if ((c.type === 'tool-input-start' || c.type === 'tool-input-available') && c.toolCallId) {
      toolNames.set(c.toolCallId, c.toolName)
    } else if (c.type === 'tool-output-available') {
      const name = c.toolName ?? toolNames.get(c.toolCallId)
      if (name === 'recommendProducts' && c.output?.picks?.length) picks = c.output.picks
      if (name === 'buildGearProfile' && c.output) profile = c.output
    } else if (c.type === 'tool-recommendProducts' && c.state === 'output-available' && c.output?.picks?.length) {
      picks = c.output.picks
    } else if (c.type === 'tool-buildGearProfile' && c.state === 'output-available') {
      profile = c.output
    } else if (c.type === 'text-delta' && typeof c.delta === 'string') {
      text += c.delta
    }
  }
  return { profile, picks, text: text.trim() }
}

// ---------------------------------------------------------------- formatting

const metricLine = (p) =>
  p.metrics
    .map((m) => `${m.label} ${m.value ?? '—'}${m.unit === 'deg' ? '°' : ` ${m.unit}`}`)
    .join(' · ')

function passportSummary(token, { passport }) {
  return [
    `**Passport read** — ${passport.sport}, ${passport.profile.category} profile`,
    `> ${passport.profile.summary}`,
    ``,
    `Metrics: ${metricLine(passport)}`,
    ...passport.signals.slice(0, 2).map((s) => `- ${s}`),
    ``,
    `Size ${passport.size}, height ${passport.heightCm}cm. Reply **approve** to run the recommendation (or **approve £140** to set a budget — default ${DEFAULT_BUDGET}). Receipt: ${VERTIQAL}/api/passport/${token}`,
  ].join('\n')
}

const VERDICT_LABEL = {
  in_stock: 'in stock',
  out_of_stock: 'out of stock',
  size_not_listed: 'size not listed',
  blocked: 'page blocked',
  unclear: 'unclear',
}

function pickBlock(pick, i) {
  return [
    `${i + 1}. **${pick.name}** — ${pick.retailer}, ${pick.price}`,
    `   ${pick.why}`,
    `   ${pick.url}`,
  ].join('\n')
}

// ---------------------------------------------------------------- state machine

/** Per-room fitting state. */
const rooms = new Map()
const roomState = (id) => {
  if (!rooms.has(id)) rooms.set(id, { passports: new Map(), busy: false })
  return rooms.get(id)
}

// Passport tokens are `<base64url-body>.<signature>` — they contain a dot.
const PASSPORT_URL = /\/api\/passport\/([^/?#\s]+)/g
const BARE_TOKEN = /\b(demo-[a-z0-9-]+|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{8,})\b/g
const APPROVE = /\b(approve[ds]?|yes|go ahead|lgtm|ship it|run it)\b/i
const RESET = /\b(cancel|reset|start over|never ?mind)\b/i
const BUDGET = /£\s?(\d{1,4})/
const ANALYZE = /\b(analy[sz]e|process (this|it|them)|run (the )?fitting|go ahead|take a look)\b/i
const FITCHECK = /^(?:fit.?check|check|does)\s+["']?(.{2,80})["']?\s*(?:fit.*)?$/im

/** Most recent passport token in room history — for "analyze this" replies after a room-share post (Switch doesn't echo an agent's own posts to its connection). */
async function lastPassportFromContext(roomId) {
  const res = await fetch(`${BASE}/agents/${AGENT_ID}/ops/read_context`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ room_id: roomId, limit: 30 }),
  })
  if (!res.ok) return null
  const { result } = await res.json().catch(() => ({}))
  const texts = (result?.threads ?? []).flatMap((t) => [t.root?.body ?? '', ...(t.replies ?? []).map((r) => r.body ?? '')])
  for (let i = texts.length - 1; i >= 0; i--) {
    const tokens = extractTokens(texts[i])
    if (tokens.length) return tokens[tokens.length - 1]
  }
  return null
}

function extractTokens(body) {
  const tokens = new Set()
  for (const re of [PASSPORT_URL, BARE_TOKEN]) {
    re.lastIndex = 0
    // Strip trailing punctuation the regex may have eaten from sentence ends/URLs.
    for (const m of body.matchAll(re)) tokens.add(m[1].replace(/[^A-Za-z0-9_-]+$/, ''))
  }
  return [...tokens]
}

async function handleMessage(roomId, payload, fromSelf = false) {
  const body = String(payload.body ?? '')
  const state = roomState(roomId)
  const thread = payload.thread_id ?? payload.message_id ?? null
  const reply = (content) => say(roomId, content, thread)

  if (!fromSelf && RESET.test(body)) {
    state.passports.clear()
    state.busy = false
    await reply('Cleared. Post a fit passport to start again.')
    return
  }

  // `check <shoe>` → signed fit verdict against the latest passport — a second evidence beat.
  const fitMatch = !fromSelf && state.passports.size > 0 ? body.match(FITCHECK) : null
  if (fitMatch) {
    const [token, passport] = [...state.passports].pop()
    const product = fitMatch[1].replace(/\s*fit.*$/i, '').trim()
    const res = await fetch(`${VERTIQAL}/api/passport/${encodeURIComponent(token)}/fit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product }),
    }).catch(() => null)
    const verdict = res?.ok ? await res.json() : null
    await reply(
      verdict
        ? `**${verdict.verdict}** — ${verdict.score}/100 for "${verdict.product ?? product}" vs the ${passport.sport} passport:\n${(verdict.reasons ?? []).map((r) => `- ${r}`).join('\n')}`
        : `Fit check unavailable right now (${res?.status ?? 'no response'}).`,
    )
    return
  }

  const tokens = extractTokens(body)
  // "analyze this" after a room-share: the link lives in our own earlier post — read it back.
  if (tokens.length === 0 && ANALYZE.test(body)) {
    const fromContext = await lastPassportFromContext(roomId)
    if (fromContext) tokens.push(fromContext)
  }

  const budgetMatch = body.match(BUDGET)
  if (budgetMatch) state.budget = `£${budgetMatch[1]}`

  for (const token of tokens) {
    if (state.passports.has(token)) continue
    const data = await fetchPassport(token).catch(() => null)
    if (!data?.passport) {
      await reply( `That passport didn't verify — tampered or unknown token.`)
      continue
    }
    state.passports.set(token, data.passport)
    await reply( passportSummary(token, data))
  }

  if (fromSelf || !APPROVE.test(body) || state.busy || state.passports.size === 0) return

  state.busy = true
  const budget = state.budget ?? DEFAULT_BUDGET
  try {
    const results = []
    for (const [token, passport] of state.passports) {
      const brief = {
        sport: passport.sport,
        events: 24, // passports carry no footfall count; schema needs MIN_EVENTS+
        metrics: passport.metrics.map(({ label, value, unit }) => ({ label, value, unit })),
        signals: passport.signals,
      }
      const prefs = {
        size: passport.size,
        budget,
        heightCm: passport.heightCm,
        voice: passport.voice,
        depth: DEPTH,
      }
      await reply( `Approved. Running the fitting for the ${passport.sport} profile (budget ${budget})…`)

      // Live path: the gear agent. Degraded path: the passport's own shortlist —
      // honest "template, not verified" framing matches the brand.
      let profile = null
      let picks = null
      let text = ''
      let degraded = false
      try {
        ;({ profile, picks, text } = await runGearAgent(brief, prefs))
      } catch (e) {
        degraded = true
        picks = passport.picks?.length ? passport.picks.map((p) => ({ ...p, why: `From the signed passport shortlist: ${passport.profile.summary}` })) : null
        await reply( `Fitting model unreachable (${String(e?.message ?? e).slice(0, 140)}) — posting the passport's shortlist instead. *Template, not freshly verified.*`)
      }
      results.push({ token, passport, profile, picks, text, degraded })

      const lines = []
      if (profile?.summary) lines.push(`**${profile.category ?? passport.sport} profile** — ${profile.summary}`)
      else if (degraded) lines.push(`**${passport.profile.category} profile** — ${passport.profile.summary}`)
      if (picks?.length) lines.push('', ...picks.map(pickBlock))
      else lines.push('_No shortlist came back — posting what the agent said._')
      if (text) lines.push('', `> ${text.split('\n').pop()}`)
      await reply( lines.join('\n'))

      // Stock verification — the honest-receipts beat.
      if (picks?.length) {
        const checks = await Promise.all(picks.map((p) => (p.stockToken ? stockCheck(p, passport.size) : Promise.resolve(null))))
        const stock = picks.map((p, i) => {
          if (!p.stockToken) return `- ${p.name}: not verifiable — passport shortlist carries no signed stock token`
          const c = checks[i]
          if (!c || c.error) return `- ${p.name}: verification unavailable (${c?.error ?? 'no result'})`
          const bits = [`**${VERDICT_LABEL[c.verdict] ?? c.verdict}**`]
          if (c.sizeFound) bits.push(`size ${c.sizeFound}`)
          if (c.price) bits.push(c.price)
          return `- ${p.name}: ${bits.join(', ')} — ${c.evidence ?? ''}`
        })
        await reply( `**Stock check** (${passport.size}):\n${stock.join('\n')}`)
      }
    }

    // Final plan — the decision the room was convened for.
    const plan = ['**Final plan — ready to execute**']
    for (const r of results) {
      const top = r.picks?.[0]
      plan.push(
        `- ${r.passport.sport}: ${top ? `**${top.name}** (${top.retailer}, ${top.price})` : 'no pick'}${r.degraded ? ' *(passport shortlist — model offline)*' : ''} — receipt ${VERTIQAL}/api/passport/${r.token}`,
      )
    }
    if (results.length >= 2) {
      const order = [...results].sort(
        (a, b) => (b.passport.metrics.find((m) => /cadence/i.test(m.label))?.value ?? 0) - (a.passport.metrics.find((m) => /cadence/i.test(m.label))?.value ?? 0),
      )
      plan.push(
        '',
        `Relay order (highest cadence runs anchor — heuristic, coach decides): ${order
          .map((r) => `${r.passport.sport} runner (${r.passport.metrics.find((m) => /cadence/i.test(m.label))?.value ?? '—'}spm)`)
          .join(' → ')}`,
      )
    }
    await reply( plan.join('\n'))
  } catch (e) {
    await reply( `The fitting run failed: ${e?.message ?? e}. Check the vertiqal dev server and model keys, then say **approve** to retry.`)
  } finally {
    state.busy = false
  }
}

// ---------------------------------------------------------------- switch client

let ws = null
let cursor = 0
let generation = null
const connectionId = randomUUID()

async function say(roomId, content, threadId = null) {
  const res = await fetch(`${BASE}/agents/${AGENT_ID}/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ room_id: roomId, content, ...(threadId ? { thread_id: threadId } : {}) }),
  })
  if (!res.ok) console.error(`post_message ${res.status}: ${await res.text()}`)
}

function onFrame(frame) {
  // Deployed servers emit {event, data}; docs describe {type, payload} — accept both.
  const type = frame.event ?? frame.type
  const data = frame.data && typeof frame.data === 'object' ? frame.data : frame

  if (type === 'ping') {
    ws?.send(JSON.stringify({ type: 'pong', cursor }))
    return
  }
  if (type === 'connection_state') {
    cursor = Math.max(cursor, data.cursor ?? 0)
    generation = data.generation ?? generation
    console.log(`connected. generation=${generation} rooms=${JSON.stringify(data.rooms ?? [])}`)
    return
  }
  if (type === 'refused') {
    console.error(`connection refused: ${data.status ?? frame.status} ${data.detail ?? frame.detail ?? ''}`)
    return
  }
  if (type === 'evicted') {
    const code = data.code ?? frame.code
    console.error(`evicted: ${code ?? 'unknown'}${code === 'taken_over' ? ' — not reconnecting' : ''}`)
    return
  }
  if (type === 'gap') {
    console.warn('event gap — some room history missed; continuing')
    return
  }
  // Domain event (message | command | room_join): carries the sequence id.
  const seq = frame.id ?? frame.seq ?? data.id ?? data.seq
  if (typeof seq === 'number') cursor = Math.max(cursor, seq)
  if (type !== 'message') return

  // Fields nest under frame.data.payload on this server revision — merge all three levels.
  const payload = { ...frame, ...data, ...(frame.payload && typeof frame.payload === 'object' ? frame.payload : {}), ...(data.payload && typeof data.payload === 'object' ? data.payload : {}) }
  const sender = `${payload.sender_name ?? ''} ${payload.sender ?? ''}`
  const fromSelf = sender.includes(AGENT_NAME) || sender.includes('Forma')
  const body = String(payload.body ?? '')

  const roomId = payload.room_id ?? payload.roomId ?? payload.room ?? ROOM_FILTER
  if (!roomId || (ROOM_FILTER && roomId !== ROOM_FILTER)) return

  // Act on addressed messages, on human approval/reset while a fitting is pending, and on
  // any message carrying a passport (incl. our own room-share posts). Dedupe stops the
  // receipt URLs in our replies from retriggering; approvals still require a human.
  const state = rooms.get(roomId)
  const pendingReply = !fromSelf && state && state.passports.size > 0 && (APPROVE.test(body) || RESET.test(body) || FITCHECK.test(body))
  const hasPassport = extractTokens(body).length > 0
  if (!payload.addressed && !pendingReply && !hasPassport) return

  handleMessage(roomId, payload, fromSelf).catch((e) => console.error('handleMessage failed:', e))
}

function connect() {
  const wsBase = BASE.replace(/^http/, 'ws')
  // Claim the room at open when we know it: an all-scope connection with no rooms
  // to cover gets closed on this server revision.
  const params = new URLSearchParams({ connection_id: connectionId, scope: ROOM_FILTER ? 'single' : 'all', filter: 'all' })
  if (ROOM_FILTER) params.set('rooms', ROOM_FILTER)
  if (cursor > 0) params.set('start_from', String(cursor))
  if (generation != null) params.set('expected_generation', String(generation))
  const url = `${wsBase}/agents/${AGENT_ID}/connection/ws?${params}`
  ws = new WebSocket(url, { headers: { authorization: `Bearer ${API_KEY}` } })

  ws.onopen = () => console.log(`room-agent online → ${url.split('?')[0]}`)
  ws.onmessage = (ev) => {
    try {
      onFrame(JSON.parse(ev.data))
    } catch (e) {
      console.error('bad frame:', e, String(ev.data).slice(0, 300))
    }
  }
  ws.onerror = (ev) => console.error('ws error:', ev?.message ?? ev)
  ws.onclose = (ev) => {
    if (ev.code === 4401 || ev.code === 4409) {
      console.error(`closed ${ev.code} (${ev.reason || 'auth/takeover'}) — fix credentials or kill the other client; not retrying`)
      process.exit(1)
    }
    console.log(`closed ${ev.code}; reconnecting in 3s`)
    setTimeout(connect, 3000)
  }
}

// ---------------------------------------------------------------- selftest

async function selftest() {
  const assert = (cond, msg) => {
    if (!cond) {
      console.error(`FAIL ${msg}`)
      process.exitCode = 1
    } else console.log(`ok   ${msg}`)
  }

  assert(extractTokens('fit http://localhost:3000/api/passport/demo-running please').join() === 'demo-running', 'url token')
  assert(extractTokens('see http://x/api/passport/abc123.signaturepart.').join() === 'abc123.signaturepart', 'strips trailing dot')
  assert(extractTokens('token eJxyzk2_Pz8vts3KSSx2rM9LKc4vSgUA.dGVzdHNpZw').join() === 'eJxyzk2_Pz8vts3KSSx2rM9LKc4vSgUA.dGVzdHNpZw', 'bare signed token')
  assert(extractTokens('approved').length === 0, '"approved" is not a token')
  assert(extractTokens('reset the room').length === 0, 'no false positive on reset')

  // SSE parser against a fake UI-message stream.
  const chunks = [
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: 'Pick one ' },
    { type: 'tool-input-available', toolCallId: 'c1', toolName: 'recommendProducts', input: {} },
    { type: 'tool-output-available', toolCallId: 'c1', output: { picks: [{ name: 'Shoe A' }] } },
    { type: 'text-delta', id: 't1', delta: 'and go.' },
    { type: 'finish' },
  ]
  const body = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(ch)}\n\n`))
      c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
      c.close()
    },
  })
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(body, { status: 200 })
  const { picks, text } = await runGearAgent({}, {})
  globalThis.fetch = realFetch
  assert(picks?.[0]?.name === 'Shoe A', 'parses recommendProducts output')
  assert(text === 'Pick one and go.', 'accumulates text deltas')
}

if (SELFTEST) {
  await selftest()
  process.exit(process.exitCode ?? 0)
}

connect()
