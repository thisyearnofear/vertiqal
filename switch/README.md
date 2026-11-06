# Vertiqal × Switch — room agent

A custom Switch-protocol agent that puts Forma (the vertiqal fitting agent) in a team room. No coding-agent credits needed — the only model calls happen inside the vertiqal endpoints it orchestrates.

Flow: **passport in → summary → human approval → gear picks → stock verdicts → final plan with receipts.**

## Try it without Switch first

`pnpm switch:mock` starts a minimal mock server on `:8787` (registration, WS connection, message posting, `/inject` for faking room messages). Then:

```sh
SWITCH_BASE_URL=http://localhost:8787 SWITCH_REGISTRATION_KEY=x pnpm switch:register
pnpm switch:agent
curl -X POST localhost:8787/inject -H 'content-type: application/json' \
  -d '{"body":"fit http://localhost:3000/api/passport/demo-running"}'
curl -X POST localhost:8787/inject -H 'content-type: application/json' -d '{"body":"approve £140"}'
```

The agent's room posts print to the mock's stdout. Verified end-to-end on this harness 2026-11-06: passport summaries, approval+budget gating, degraded fallback to the passport shortlist when `/api/agent` is down, stock-check reporting, final plan + relay order.

**Model providers:** the Vercel AI Gateway key is unfunded, so `.env.local` wires `FORMA_LLM_*` → Featherless and `FORMA_LLM2_*` → Nebius Token Factory, with `FORMA_DISABLE_GATEWAY=1`. Explicit chains: `FORMA_AGENT_MODELS=nebius:Nemotron-3-Ultra,featherless:Qwen2.5-72B` (nebius leads while Featherless's shared infra is flaky — verified 2026-11-06: full 9-step run, ~3.4 min; Featherless twice died mid-stream). Flip the chain order back when Featherless is stable (its 72B is ~3× faster). The agent still degrades to the passport shortlist if the endpoint dies — "template, not verified" is the honest story.

**Live verification (2026-11-06):** passport → summary → `approve £140` → real gear-agent run via Nebius (picks with measurement-grounded why-lines + real product URLs) → stock checks (all three `page blocked` — SportsShoes 403'd the bot, honest verdict) → final plan. Stock verdicts depend on whether the retailer tolerates the bot; `in_stock`/`out_of_stock`/`page blocked` are all valid demo beats.

## Setup

1. **Switch** — install Switch Console, start the local server (Docker; bundles Mattermost). Note the **Server address** — that is `SWITCH_BASE_URL`.
2. **Registration key** — in the Gateway, create an API key of type `registration`.
3. **Register the agent** (once):

   ```sh
   SWITCH_BASE_URL=http://localhost:8080 SWITCH_REGISTRATION_KEY=<key> pnpm switch:register
   ```

   Writes `switch/.agent.json` (gitignored) and widens `addressing` to `anyone`.
4. **Room** — create a `relay-fitting` channel on the bundled Mattermost, and invite `vertiqal-forma` to it.
5. **Run**:

   ```sh
   pnpm dev                # vertiqal on :3000
   pnpm switch:agent       # room agent (uses switch/.agent.json)
   ```

## Demo script

1. Post `http://localhost:3000/api/passport/demo-running` (and/or `demo-climbing`), @mentioning the agent → it summarizes the athlete.
2. Reply `approve` (or `approve £140` to set budget) → Forma runs and posts 3 picks with why-lines.
3. The agent stock-checks each pick and posts verdicts + evidence.
4. Final plan lands with per-runner picks and receipt links. `reset` restarts.

## Env

| Var | Default | Purpose |
| - | - | - |
| `SWITCH_BASE_URL` | `.agent.json` | Switch server address |
| `SWITCH_AGENT_ID` / `SWITCH_AGENT_API_KEY` | `.agent.json` | Agent credentials |
| `VERTIQAL_BASE_URL` | `http://localhost:3000` | vertiqal app |
| `SWITCH_ROOM_ID` | all rooms | Restrict the agent to one room |
| `DEFAULT_BUDGET` | `£150` | Budget when the approval doesn't set one |
| `AGENT_DEPTH` | `quick` | `quick` / `considered` / `deep` — deeper runs cost more tool calls |

## Protocol notes — verified against real server 0.31.0 (protocol speaks:9)

Docs describe the intent; the deployed server differs in the details below. Verified live on nuncio-vultr 2026-11-06.

- **Frames are `{event, data}`** — not `{type, payload}`. `connection_state` fields live under `data` (`cursor`, `generation`, `rooms`).
- **Claim a room at open** (`rooms=<id>` in the ws URL). `scope=all` with no covered rooms gets the socket closed with 1000 immediately.
- **Pongs:** `{"type":"pong","cursor":<n>}` text frames are accepted (stayed up >10s).
- **Own posts are NOT echoed back** to the agent's connection — a shared passport posted by the agent (room-share) isn't seen by it. The agent recovers it via `read_context` when a human says "analyze this".
- **Op schemas differ from docs:** `invite_agent_to_room{room_id, agent_name}`, `create_room{..., agent_names, bridge_id}` (creates the Mattermost channel too), `read_context{room_id, limit}` → `result.threads[].root`. Read `GET /agents/{id}/ops` at runtime for the live registry.
- **Ops don't need a socket;** `POST /agents/{id}/message {room_id, content}` posts fine.
- **Events only reach the agent for senders it's permitted to hear.** `addressing=owner_only` meant the human's room messages never arrived — no event, no refusal. Set `addressing: anyone` on the agent's page (Gateway/Console) — `update_agent_detail` can't be self-called (403).

## Deployed dev stack (nuncio-vultr)

`~/switch-stack` — compose profiles `collab`+`gateway`, loopback-bound: API `:18000`, Gateway `:13000`, Mattermost `:18065`, Postgres `:25432`. Reach via `ssh -N -L 18000:localhost:18000 -L 13000:localhost:13000 -L 18065:localhost:18065 nuncio-vultr`. Room `relay-fitting` = `60970745-0b3f-473e-9965-df3d21487866` on the Mattermost bridge; agent `vertiqal-forma` = `fc0b858e-…` (bootstrap-owned — re-register under an admin key to own its settings). Mattermost seeded users: `admin`, `user` (passwords in `~/switch-stack/.env`).
