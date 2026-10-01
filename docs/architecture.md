# Architecture

## Request flow

```
Phone clip / live camera
  │
  ▼
lib/pose (browser)            MediaPipe every frame ── optional VLM Run refinement (/api/pose/vlmrun)
  │
  ▼
lib/metrics (browser)         cadence, foot strike, overstride │ reach, hip position, precision │ framing quality
  │                           ├─▶ lib/hero: best frame → hero card (canvas, on-device)
  │                           └─▶ fitting-notes: footfall stills → /api/vision (opt-in, Grok vision)
  ▼
lib/fitting (browser)         stage flow + confirmed brief: size, budget, calibrated height, goal, surface
  │                           └─▶ synthetic example bypasses this path and calls no APIs
  ▼
/api/agent                    gear agent (AI SDK + Grok 4.7), streams tool steps to the UI
  │  tools: buildGearProfile → research / stock / rider reports / athletes (Tavily) → recommendProducts
  ▼
Picks ──▶ /api/stock-check     signed product target + user-submitted size → retailer policy/rate limit/cache → Solari (UK egress) → page verification → Grok verdict + screenshot
     │                         └─▶ /api/stock-check/replay  polls for the session recording
     ├──▶ /api/basket/[runId]  agent-started Browser Use check, stops before checkout
     ├──▶ /api/passport        signed Fit Passport for the active fitting size → REST + /api/mcp for other agents
     ├──▶ /api/tryon           opt-in FLUX Kontext impression of the user in a pick
     └──▶ /api/wassist/handoff sends fitting + chosen pick to WhatsApp, writes the member cookie
                                   │
WhatsApp shopper ──▶ /api/wassist/webhook  (Wassist BYOA, text and/or photo) → "typing…" → reply agent (Grok vision + Tavily) → reply_callback
Vercel Cron ─────▶ /api/wassist/checkin   daily: quiet ~12 days since their pick → one templated break-in check-in
                                   │
Next visit ──▶ /api/member         reads the cookie + shopper's recent WhatsApp lines → fed into the next scan
```

Measurement always comes from untouched frames. The hero card grade and try-on image are separate outputs and never feed back into metrics.

## Fitting-state rules

`lib/fitting/` owns client-side gates that would otherwise be spread through the UI:

- `session.ts` derives the visible stage, supplies the next-action rail, decides whether a measurement can submit, and plans a re-analysis or recapture when height/provider inputs change.
- `prefs.ts` validates the required brief (size, budget, 120–220 cm height, goal and surface) before `/api/agent` runs. Foot width and niggles remain optional.
- `example.ts` supplies the synthetic, clearly labelled six-stage walkthrough (AI-generated running clip fixture plus synthetic measurements, brief, concepts and an un-run receipt template; see README for attribution). The running example draws a local 2D pose overlay over the generated clip — at most 12 fps while it plays and the tab is visible — but reports framing only and never touches measurements, hosted providers or TTS. Example mode cannot authorise research, stock, passport or WhatsApp calls.
- `stock.ts` separates a typed draft size from the explicitly submitted size and carries the server-issued product token, so an old verdict, passport or arbitrary URL cannot be applied to a new request.
- `camera.ts` releases late `getUserMedia` streams that resolve after capture is stopped or superseded.

## Workspace and example tracking

`components/stride-lab/stride-lab.tsx` leads with a full-width movement stage — `PoseStage` (idle attract figure, clip or live camera) or `ExampleObserver` in example mode — followed by the sport choice and upload/capture controls. `components/forma/forma-dock.tsx` renders the Forma strip under the stage (current step, next action, options and tuning); the same element becomes a fixed bar at the bottom on mobile. The brief is gathered conversationally: `lib/fitting/brief-flow.ts` orders the required questions (height, goal, surface, size, budget) and picks the next unanswered, unskipped one, leaving height to the idle screen's `HeightDial`. `components/stride-lab/brief-strip.tsx` renders one question's chip controls inside the strip and the editable `BriefSentence` beneath it; `FittingBrief` survives as the *Show all fields* fallback. Questions are asked automatically only in the capture (not during live recording) and confirm stages; elsewhere they open when a sentence blank or agent-panel link is chosen. Height commits explicitly because each committed change re-analyses the clip. The walkthrough, readouts and research results follow in a single column below.

`example-observer.tsx` renders the synthetic example media. For running it tracks a framing-only MediaPipe session on the generated clip: a session borrowed from the provider picker is never disposed by the observer, while a separately loaded owned session is disposed on teardown (and late resolutions are disposed without reporting ready). Scheduling lives in `lib/pose/example-scheduler.ts`: an injected clock makes the first eligible frame infer immediately and enforces the minimum interval afterwards; at most one frame callback is ever pending, cancel/dispose invalidates the outstanding callback by token so a stale invocation cannot infer or reschedule, and an inference error stops the loop and reports `unavailable`. Document visibility and intersection observers gate the loop independently — hiding the tab or scrolling the panel away pauses the clip and tracking, overlay toggling updates the reported status through the same sync path, and nothing auto-resumes playback.

Observation output is status plus framing booleans only; it never feeds the trackers, the validation recorder or the agent, and media controls are independent of walkthrough progression.

## Local motion validation

The running workflow optionally records per-processed-frame keypoints and accepted contacts in memory after an explicit user action. `PoseStage` sends the unthrottled frame timestamp and snapshot to `createValidationRecorder` in `lib/pose/validation.ts`; exports contain no video, images, clip names, source URLs or account information, but keypoints and height can still be identifying. The illustrated example never enters this path. The recorder stops at the first rewind, source-dimension change or resource cap; changing clip, height, provider or sport clears the trace. These bounds prevent repeat passes from being presented as independent evidence.

`lib/pose/validation-cli.ts` compares saved contacts against complete, independently supplied same-timeline annotations. The caller must supply the matching tolerance. Same-side, one-to-one matching maximises cardinality before minimising timing error; explicit excluded intervals affect both denominators. Reports include misses, extras, timing errors and visibility counts for processed frames, not elapsed-time coverage. There are no accuracy acceptance thresholds, 3D claims or shoe-fit validity claims. Synthetic and unclassified sources are marked debug-only. See README for the annotation contract and privacy/capture protocol.

FreeMoCap remains a separate, optional offline reference system. No FreeMoCap code or dependency is incorporated, and no native-file importer exists. Multi-camera comparison requires calibrated, synchronised real recordings and reference-quality review; real-human validation remains pending.

## API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/agent` | POST | Streams the gear agent run. |
| `/api/vision` | POST | Grok vision notes on footfall stills (opt-in). |
| `/api/voice` | POST | Grok TTS for Forma's spoken lines. |
| `/api/pose/vlmrun` | GET, POST | GET reports whether the key is configured; POST refines keypoints for sampled frames. |
| `/api/tryon` | POST | One-frame try-on impression via AI Gateway. Nothing is stored. |
| `/api/stock-check` | POST | Solari stealth-browser check of one size on one signed, allowlisted product target. Applies an in-process per-client request window, active-check cap, in-flight dedupe and short result cache. `lib/agent/stock-page.ts` gates the model judge: disallowed redirect targets, missing/non-2xx responses, bot walls, pages that never present the requested product, and pages with no size controls return blocked/unclear without a model call. Returns verdict, evidence, final URL, HTTP status, screenshot, source label and session id. |
| `/api/stock-check/replay` | GET | Replay URL for a stock-check session (`?session=`). Returns `null` until the upload finishes. |
| `/api/basket/[runId]` | GET | Status of a user-approved Browser Use basket check. |
| `/api/member` | GET, POST, DELETE | Linked shopper (masked number, last pick, recent WhatsApp lines), record a pick, or forget. |
| `/api/passport` | POST | Issues a signed Fit Passport. |
| `/api/passport/[token]` | GET | Reads a passport. |
| `/api/passport/[token]/fit` | POST | Checks a given shoe against a passport. |
| `/api/mcp` | GET, POST, DELETE | MCP server exposing passport fit checks to other agents. |
| `/api/wassist/handoff` | POST | Ensures this environment's BYOA agent exists for this origin, then sends the fitting, or returns a `connectUrl` if the number hasn't linked yet. |
| `/api/wassist/webhook` | POST | Inbound WhatsApp messages, optionally with a photo (Wassist-hosted JPEG/PNG/WebP up to 5 MB only). Returns a silent response right away, shows "typing…" every 8 s, and replies through `reply_callback` inside `after()`. Authenticated by an HMAC token in the URL. |
| `/api/wassist/checkin` | GET | Vercel Cron job. Sends the break-in check-in template to shoppers with a pick whose chat has been quiet for 12–13 days. Requires `Authorization: Bearer $CRON_SECRET` and does nothing without `WASSIST_CHECKIN_TEMPLATE`. |

## Extension points

- **New pose provider:** implement `PoseProvider` in `lib/pose/types.ts` and register it in `lib/pose/providers/index.ts`. Use `onStatus` for background progress. See `vlmrun.ts` for a hybrid provider that wraps MediaPipe.
- **New sport:** add metrics in `lib/metrics/`, a hero score branch in `lib/hero/frame.ts`, and the sport to the agent's profile tool.
- **New agent tool:** add it in `lib/agent/` and register it with the gear agent in `lib/agent/gear-agent.ts`. The UI renders tool steps from their part type.

## Data and privacy

- No database. Passports are signed tokens (`lib/passport/token.ts`), so they carry their own data.
- Shopper memory is a signed, httpOnly `vq_member` cookie (`lib/member/cookie.ts`) holding the WhatsApp number and last pick. The Wassist conversation is the long-term memory, and guests are never tracked. The number is masked in every response.
- WhatsApp photos are downloaded only from Wassist hosts, passed to Grok for that one reply, and never stored. Later turns see them as `[sent a photo]`.
- The check-in is sent at most once per shopper. The template text in the transcript is the marker, so no extra state is kept.
- Stock checks send only the product URL and size to Solari. Screenshots are returned inline and not stored.
- Video stays in the browser. Only frames the user explicitly sends (vision notes, VLM Run refinement, try-on) leave the device, one request at a time.
