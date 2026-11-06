#!/usr/bin/env node
/**
 * One-time registration of the vertiqal room agent with a Switch server.
 *
 * Usage:
 *   SWITCH_BASE_URL=http://localhost:8080 SWITCH_REGISTRATION_KEY=<key> node switch/register.mjs
 *
 * The registration key is an API key of type `registration`, created on the
 * Gateway's API Keys page. The agent's own api_key is returned once and saved
 * to switch/.agent.json (gitignored) — room-agent.mjs reads it from there.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AGENT_FILE = join(dirname(fileURLToPath(import.meta.url)), '.agent.json')

const BASE = (process.env.SWITCH_BASE_URL ?? '').replace(/\/+$/, '')
const REGISTRATION_KEY = process.env.SWITCH_REGISTRATION_KEY

if (!BASE || !REGISTRATION_KEY) {
  console.error('Set SWITCH_BASE_URL and SWITCH_REGISTRATION_KEY')
  process.exit(1)
}

const NAME = process.env.SWITCH_AGENT_NAME ?? 'vertiqal-forma'
const OVERWRITE = process.env.SWITCH_OVERWRITE === '1'

const res = await fetch(`${BASE}/agents`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${REGISTRATION_KEY}` },
  body: JSON.stringify({
    name: NAME,
    display_name: 'Forma',
    description:
      'Vertiqal fitting agent. Reads signed fit passports, proposes shoe picks via the vertiqal gear agent, verifies stock, and posts receipts for team approval.',
    connector_type: 'custom',
    integration_profile: {
      connection_model: 'always_on',
      message_exchange: true,
      pre_invocation_mediation: [],
      post_invocation_mediation: [],
      event_reporting: [],
    },
    ...(OVERWRITE ? { overwrite: true } : {}),
  }),
})

if (!res.ok) {
  console.error(`Registration failed: ${res.status} ${await res.text()}`)
  if (res.status === 409) console.error('Name already registered — re-run with SWITCH_OVERWRITE=1 to rotate the key.')
  process.exit(1)
}

const { id, api_key: apiKey } = await res.json()

// Default addressing is owner-only; let anyone in the room instruct the agent.
const addressing = await fetch(`${BASE}/agents/${id}/ops/update_agent_detail`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({ agent_id: id, addressing: 'anyone' }),
})
if (!addressing.ok) console.warn(`Warning: could not widen addressing (${addressing.status}) — set it in agent settings.`)

writeFileSync(AGENT_FILE, JSON.stringify({ id, name: NAME, api_key: apiKey, base: BASE }, null, 2) + '\n', { mode: 0o600 })
console.log(`Registered "${NAME}" as ${id}. Credentials saved to switch/.agent.json`)
console.log('Next: invite the agent into a room, then run `pnpm switch:agent`.')
