# Switch Hackathon integration plan — Vertiqal (Forma)

Build frame of reference for adapting Vertiqal to the Flip the Switch Hackathon (WeMakeDevs × DevTools Academy × Switch, Nov 4–7 2026, submissions close Nov 7 11:59 PM IST).

## Goal

Show a team room where an AI movement-fitting agent helps a group make a footwear decision with evidence, using Switch.

**The scene:** a running club's relay crew is picking shoes for race weekend. The chat fills with confident opinions — Pegasus vs Hokas, size guesses — but nobody has data on how each runner actually moves. Each athlete measures privately in their own browser (video never leaves the device), shares a signed fit passport into the room, and the agent turns those receipts into a shared, auditable decision: summaries, a human-approved budget, live picks, honest stock verdicts ("unclear" when blocked — it never guesses), and a final plan.

**Pitch discipline (post-review feedback):** lead with the concrete scenario, not the thesis — "every team decision happens in group chat" overclaims. Name who, why they're deciding together, and what the demo demonstrably does; let the honest-verification beat carry the credibility rather than stacking six big claims up front.

## Track and concept

- **Track 02** — Best Personal or Creative Workflow ($2,000). (Track 01 arguable if framed as club/team procurement; Track 02 is the honest fit.)
- Primary concept: **Relay Team Balancing** — a coach posts runners' fit passports, Forma proposes shoe picks per runner plus a relay order, the team approves at each gate.
- Submission requires: public repo, short demo video, README explaining the Switch setup (which agents, how the channel is wired, how to run it).
- Cheap side entries: Best Blog (AirPods 5), #HowISwitch posts (top 5 get keyboards).

## Architecture decision — custom protocol agent, no coding-agent credits

No Claude Code/Codex subscription needed. The room agent is a small Node service in `switch/` that speaks the Switch agent protocol directly (WebSocket in, HTTP ops out) and orchestrates the existing vertiqal endpoints. The only model calls happen inside `/api/agent` and `/api/stock-check`, which the Next app already serves via its own model layer (AI Gateway / FORMA_LLM_*).

```
Mattermost channel  ←→  Switch server (Docker, via Console)
                              │ WebSocket + HTTP ops
                        switch/room-agent.mjs   ← thin state machine, zero deps
                              │ HTTP
                        vertiqal Next app (localhost:3000)
                          GET  /api/passport/<token>   signed fit passport → brief
                          POST /api/agent              {brief, prefs} → gear picks (+stockTokens)
                          POST /api/stock-check        per-pick size availability verdict
```

## Why passports, not clips

Posting movement video into a chat room would break the product's core line — "video never leaves this browser." The fit passport is the artifact designed for exactly this: an HMAC-signed token carrying metrics, signals, size, voice and profile. The room sees the receipt; the video stays on-device. It also makes the demo deterministic — `demo-running` and `demo-climbing` passports are already seeded in `lib/passport/token.ts`.

## Agent workflow

1. Coach posts a passport URL (or bare token) in the room — or clicks **Send to team room** on the app's `PassportCard`, which POSTs `/api/room-share` → the agent posts the link into the room itself (the app→room handoff; self-messages can ingest passports but approvals still require a human).
2. Agent fetches the passport, posts the runner's summary (sport, category, metrics, signals) and asks for approval — `approve` or `approve £140` to set budget.
3. On approval, agent calls `POST /api/agent` and posts Forma's profile + 3 picks with why-lines and retailer links.
4. Agent runs `POST /api/stock-check` per pick and posts size verdicts with evidence sentences.
5. Agent posts the final plan — picks + stock receipts. With ≥2 passports it also proposes a relay order (cadence-desc heuristic, labelled as such).
6. `reset` clears room state.

## Files

- `switch/register.mjs` — one-time `POST /agents` registration; writes `switch/.agent.json` (gitignored) and sets `addressing: anyone`.
- `switch/room-agent.mjs` — the client: WebSocket connection, ping/pong liveness, cursor resume, per-room state machine, `/api/agent` UI-stream parser, stock-check loop.
- `switch/mock-server.mjs` — dev harness: minimal Switch stand-in for local iteration (`pnpm switch:mock`, `/inject` fakes room messages).
- `app/api/room-share/route.ts` + `Send to team room` on `PassportCard` — posts the issued passport into the room as the agent.
- `switch/README.md` — setup runbook and demo script.
- `pnpm switch:register` / `pnpm switch:mock` / `pnpm switch:agent`.

## Verified end-to-end (2026-11-06, real Switch 0.31.0 on nuncio-vultr)

Full loop proven live: human posts passport in Mattermost `relay-fitting` → agent summarizes → `approve` → live gear run via Nebius → stock verdicts → plan. Protocol gotchas found and fixed: `{event,data}` frames (not `{type,payload}`), `rooms=` claim required at open, message fields nest under `data.payload`, own posts don't echo (context fallback), `addressing` set via `PUT /gateway/agents/{id}/addressing-policy` cookie auth. Details in `switch/README.md`.

## Remaining run order

- [x] Switch server deployed (nuncio-vultr, loopback, SSH tunnel) + room created + agent registered.
- [x] Agent connected + answering in the real room.
- [ ] Full approve→run cycle in the real room (pipeline verified; one live pass for confidence).
- [ ] Record the video; write submission README; submit early (before Nov 7 11:59 PM IST).
- [ ] Optional: blog draft + #HowISwitch post.

## Demo script

1. Coach posts `demo-running` and `demo-climbing` passport URLs → agent summarizes each athlete.
2. Coach: `approve £140` → agent runs the gear agent per runner, posts picks with why-lines.
3. Agent runs stock checks → posts verdicts ("in stock, UK 9, £135 — evidence: …").
4. Agent posts the final plan: per-runner pick + relay order + receipt links. Room shows "ready to execute."

## Risks and fallbacks

- **Protocol drift** — the docs are the spec; log every frame. If a field name differs (`room_id` vs `room`), the client already reads defensively.
- **`/api/agent` stream parsing** — chunk names are read defensively (`tool-output-available` and `tool-*` part shapes). If parsing fails, the agent still posts the narrative text; stock check can run from the passport's own seeded picks as a fallback.
- **Model/provider outage** — wired and verified: `FORMA_LLM_*` = Featherless (Qwen2.5-72B), `FORMA_LLM2_*` = Nebius Token Factory (Nemotron-3-Ultra), gateway disabled (key unfunded). Nebius leads the chain while Featherless shared infra is flaky. If the run still dies, the room agent degrades to the passport's signed shortlist — honest "template, not verified" framing.
- **Stock check unavailable** (no SOLARI_API_KEY / busy) — the agent posts "stock verification unavailable" and continues; the workflow is what's judged.
- **Switch setup drags** — keep the room on the bundled Mattermost; don't burn time on Slack/Teams connectors.
