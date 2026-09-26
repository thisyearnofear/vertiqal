# Architecture

## Request flow

```
Phone clip / live camera
  │
  ▼
lib/pose (browser)            MediaPipe every frame ── optional VLM Run refinement (/api/pose/vlmrun)
  │
  ▼
lib/metrics (browser)         cadence, foot strike, overstride │ reach, hip position, precision
  │                           ├─▶ lib/hero: best frame → hero card (canvas, on-device)
  │                           └─▶ fitting-notes: footfall stills → /api/vision (opt-in, Grok vision)
  ▼
/api/agent                    gear agent (AI SDK + Grok 4.7), streams tool steps to the UI
  │  tools: buildGearProfile → research / stock / rider reports / athletes (Tavily) → recommendProducts
  ▼
Picks ──▶ /api/stock-check     user-triggered Solari stealth browser (UK egress) → Grok verdict + screenshot
     │                         └─▶ /api/stock-check/replay  polls for the session recording
     ├──▶ /api/basket/[runId]  agent-started Browser Use check, stops before checkout
     ├──▶ /api/passport        signed Fit Passport → REST + /api/mcp for other agents
     ├──▶ /api/tryon           opt-in FLUX Kontext impression of the user in a pick
     └──▶ /api/wassist/handoff sends fitting + chosen pick to WhatsApp, writes the member cookie
                                   │
WhatsApp shopper ──▶ /api/wassist/webhook  (Wassist BYOA) → reply agent (Grok + Tavily) → reply_callback
                                   │
Next visit ──▶ /api/member         reads the cookie + shopper's recent WhatsApp lines → fed into the next scan
```

Measurement always comes from untouched frames. The hero card grade and try-on image are separate outputs and never feed back into metrics.

## API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/agent` | POST | Streams the gear agent run. |
| `/api/vision` | POST | Grok vision notes on footfall stills (opt-in). |
| `/api/voice` | POST | Grok TTS for Forma's spoken lines. |
| `/api/pose/vlmrun` | GET, POST | GET reports whether the key is configured; POST refines keypoints for sampled frames. |
| `/api/tryon` | POST | One-frame try-on impression via AI Gateway. Nothing is stored. |
| `/api/stock-check` | POST | Solari stealth-browser check of one size on one product page. Returns verdict, evidence, screenshot and session id. |
| `/api/stock-check/replay` | GET | Replay URL for a stock-check session (`?session=`). Returns `null` until the upload finishes. |
| `/api/basket/[runId]` | GET | Status of a user-approved Browser Use basket check. |
| `/api/member` | GET, POST, DELETE | Linked shopper (masked number, last pick, recent WhatsApp lines), record a pick, or forget. |
| `/api/passport` | POST | Issues a signed Fit Passport. |
| `/api/passport/[token]` | GET | Reads a passport. |
| `/api/passport/[token]/fit` | POST | Checks a given shoe against a passport. |
| `/api/mcp` | GET, POST, DELETE | MCP server exposing passport fit checks to other agents. |
| `/api/wassist/handoff` | POST | Ensures the BYOA agent exists for this origin, then sends the fitting, or returns a `connectUrl` if the number hasn't linked yet. |
| `/api/wassist/webhook` | POST | Inbound WhatsApp messages. Returns a silent response right away, then replies through `reply_callback` inside `after()`. Authenticated by an HMAC token in the URL. |

## Extension points

- **New pose provider:** implement `PoseProvider` in `lib/pose/types.ts` and register it in `lib/pose/providers/index.ts`. Use `onStatus` for background progress. See `vlmrun.ts` for a hybrid provider that wraps MediaPipe.
- **New sport:** add metrics in `lib/metrics/`, a hero score branch in `lib/hero/frame.ts`, and the sport to the agent's profile tool.
- **New agent tool:** add it in `lib/agent/` and register it with the gear agent in `lib/agent/gear-agent.ts`. The UI renders tool steps from their part type.

## Data and privacy

- No database. Passports are signed tokens (`lib/passport/token.ts`), so they carry their own data.
- Shopper memory is a signed, httpOnly `vq_member` cookie (`lib/member/cookie.ts`) holding the WhatsApp number and last pick. The Wassist conversation is the long-term memory, and guests are never tracked. The number is masked in every response.
- Stock checks send only the product URL and size to Solari. Screenshots are returned inline and not stored.
- Video stays in the browser. Only frames the user explicitly sends (vision notes, VLM Run refinement, try-on) leave the device, one request at a time.
