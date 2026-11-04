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
  │                           ├─▶ lib/pose/twin-3d: 3D Movement Twin rig, biomechanical vectors & agent fit pins (Three.js, on-device)
  │                           ├─▶ lib/hero: best frame → hero card (canvas, on-device)
  │                           └─▶ fitting-notes: footfall stills → /api/vision (opt-in, resolved vision model)
  ▼
lib/fitting (browser)         stage flow + confirmed brief: size, budget, calibrated height, goal, surface
  │                           └─▶ synthetic example bypasses this path and calls no APIs
  ▼
/api/agent                    gear agent (AI SDK + resolved model per `lib/agent/models.ts`, currently Featherless), streams tool steps to the UI
  │  tools: buildGearProfile → research / stock / rider reports / athletes (Tavily) → recommendProducts
  ▼
Picks ──▶ /api/stock-check     signed product target + user-submitted size → retailer policy/rate limit/cache → Solari (UK egress) → page verification → vision-model verdict + screenshot
     │                         └─▶ /api/stock-check/replay  polls for the session recording
     ├──▶ /api/basket/[runId]  agent-started Browser Use check, stops before checkout
     ├──▶ /api/passport        signed Fit Passport for the active fitting size → REST + /api/mcp for other agents
     ├──▶ /api/tryon           opt-in FLUX Kontext impression of the user in a pick
     └──▶ /api/outcome/link    issues a clickref + signed follow-up link just before the click-out
                │
                └──▶ /fit/[token] ──▶ /api/outcome   weeks later: how it fitted, or why it was not bought
```

The **share loop** is client-side and free: the locked readout picks a best frame (`lib/hero/frame.ts`), `lib/hero/narrator.ts` writes a headline, caption and standout metric from sport-specific rules (no LLM), and `render-card.ts` draws the 1080×1350 social card; `lib/voice/speak.ts` narrates it with browser speech synthesis. Pinning a card as a baseline and filming again runs `lib/hero/comparison.ts` → `render-compare.ts` (1080×1080 before/after card), and the outcome page offers a film-again CTA with a 30-day `.ics` calendar reminder.

Measurement always comes from untouched frames. The hero card grade and try-on image are separate outputs and never feed back into metrics.

### Model resolution

Every language-model call goes through `lib/agent/models.ts`, which resolves one of three roles — `agent` (multi-step tool loop), `fast` (cheap text extraction/judging) and `vision` (image-bearing calls). An OpenAI-compatible provider (`FORMA_LLM_BASE_URL` / `FORMA_LLM_API_KEY` / `FORMA_LLM_MODEL`) serves `agent` and `fast` when configured; `vision` uses `FORMA_LLM_VISION_MODEL` when set, else falls back to the agent chain. Current production on Featherless: `Qwen/Qwen2.5-72B-Instruct` (agent + fast) and `Qwen/Qwen3-VL-32B-Instruct` (vision — the 72B text model cannot read images). Without a compatible provider, Vercel AI Gateway chains run per role: `agent` (default `grok-4.7 → gemini-2.5-flash → gpt-5-mini → deepseek-v3.1`) and `fast` (default `grok-4.20-non-reasoning → gemini-2.5-flash-lite → nova-2-lite → gpt-5-nano`), both multimodal-first so images are covered. The first model answering a probe is cached for the instance; a total miss is retried after 60s. Chains are env-overridable via `FORMA_AGENT_MODELS` / `FORMA_FAST_MODELS` (prefix `compatible:` to force the OpenAI-compatible provider for one role), so a restricted or unfunded model degrades to a working one instead of halting the fitting. Single-purpose models with no substitute (Grok TTS, FLUX Kontext) fail with shopper-readable copy, never raw gateway errors.

Callers: `agent` → `/api/agent` gear loop, `/api/brief` text parse, passport `check_fit`; `fast` → none currently (stock judge moved to vision because it carries a screenshot); `vision` → `/api/vision`, `/api/brief?kind=surface`, and the Solari stock judge.

**Featherless quirks (current provider):**
- No `json_schema` structured outputs, only `json_object`. The brief, vision, surface and stock-judge calls pass `providerOptions: { openaiCompatible: { structuredOutputs: false } }`, spell the exact JSON keys in the system prompt, and rely on tolerant Zod validation. `briefParseSchema` (`lib/fitting/brief-parse.ts`) additionally preprocesses small-model output: alias keys (`budget`, `foot_width`, `current_shoe`), numbers inside strings like `"under 150 pounds"`, and still rejects goal/surface/width values outside the listed options.
- `Qwen/Qwen2-7B-Instruct` parses briefs fine but will **not** drive the multi-step tool loop. The agent role needs a larger tool-capable model.
- **Known limit — full agent reliability:** `Qwen/Qwen2.5-72B-Instruct` reliably does brief extraction and vision, but its multi-step fitting loop is flaky (observed ~1 pass in 4 runs on 2026-11-04): it sometimes grounds a pick to a review/community URL instead of a `searchProducts` product page, and the `shortlistProblem` guard then rejects it until the 120 s budget runs out. Stronger tool models on Featherless (`meta-llama/Llama-3.3-70B-Instruct`) are gated behind HuggingFace OAuth; `Mistral-Small-3.2-24B` answers in prose instead of calling tools. If agent reliability matters, point the `agent` role at a gateway model (`FORMA_AGENT_MODELS=gateway:google/gemini-2.5-flash`) or unlock the Llama model.

## Fitting-state rules

`lib/fitting/` owns client-side gates that would otherwise be spread through the UI:

- `session.ts` derives the visible stage, supplies the next-action rail, decides whether a measurement can submit, and plans a re-analysis or recapture when height/provider inputs change.
- `prefs.ts` validates the required brief (size, budget, 120–220 cm height, goal and surface) before `/api/agent` runs. Foot width and niggles remain optional.
- `example.ts` supplies the synthetic, clearly labelled six-stage walkthrough (AI-generated running clip fixture plus synthetic measurements, brief, concepts and an un-run receipt template; see README for attribution). The running example draws a local 2D pose overlay over the generated clip — at most 12 fps while it plays and the tab is visible — but reports framing only and never touches measurements, hosted providers or TTS. Example mode cannot authorise research, stock or passport calls.
- `stock.ts` separates a typed draft size from the explicitly submitted size and carries the server-issued product token, so an old verdict, passport or arbitrary URL cannot be applied to a new request.
- `camera.ts` releases late `getUserMedia` streams that resolve after capture is stopped or superseded.

## Workspace and example tracking

`components/stride-lab/stride-lab.tsx` leads with a full-width movement stage — `PoseStage` (idle attract figure, clip or live camera) or `ExampleObserver` in example mode — followed by the sport choice and upload/capture controls. `components/forma/forma-dock.tsx` renders the Forma strip under the stage (current step, next action, and a settings sheet holding the tuner, privacy line and pose-provider picker); the same element becomes a fixed bar at the bottom on mobile, where the sheet opens above the bar and scrolls within a max height. The brief is gathered conversationally: `lib/fitting/brief-flow.ts` orders the required questions (height, goal, surface, size, budget) and picks the next unanswered, unskipped one, leaving height to the idle screen's `HeightDial`. `components/stride-lab/brief-strip.tsx` renders one question's chip controls inside the strip and the editable `BriefSentence` beneath it; `FittingBrief` survives as the *Show all fields* fallback. Questions are asked automatically only in the capture (not during live recording) and confirm stages; elsewhere they open when a sentence blank or agent-panel link is chosen. Height commits explicitly because each committed change re-analyses the clip. The optional *tell Forma in a sentence* panel POSTs the text to `/api/brief` and merges the result through `applyParsedBrief` (nulls change nothing, height is never touched); the surface question can likewise suggest — never select — a surface from a captured keyframe. `lib/fitting/remembered-brief.ts` keeps the confirmed brief (size, budget, height, width and per-sport goal/surface — never niggles or clip data) in a `vertiqal-brief` cookie via `saveBrief`/`forgetBrief` server actions; `app/page.tsx` parses it into `initialBrief` so the sentence starts pre-filled and the initial tracker calibrates to the remembered height. Once a readout locks, `PoseStage` pins the locked metrics along the bottom of the screen (`lockedMetrics`) and shrinks to a denser height while results are shown (`dense`). The walkthrough, readouts and research results follow in a single column below.

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
| `/api/vision` | POST | Vision notes on footfall stills via the `vision` model role (opt-in; `Qwen/Qwen3-VL-32B-Instruct` in production). |
| `/api/brief` | POST | `kind: 'text'` parses one shopper sentence into draft brief fields (`lib/fitting/brief-parse.ts`; the schema preprocesses small-model output — alias keys, money strings — and rejects out-of-list values); `kind: 'surface'` suggests a surface from one clip still. Both opt-in per button press; example mode never calls it. |
| `/api/voice` | POST | Grok TTS for Forma's spoken lines. |
| `/api/pose/vlmrun` | GET, POST | GET reports whether the key is configured; POST refines keypoints for sampled frames. |
| `/api/tryon` | POST | One-frame try-on impression via AI Gateway. Nothing is stored. |
| `/api/stock-check` | POST | Solari stealth-browser check of one size on one signed, allowlisted product target. Applies an in-process per-client request window, active-check cap, in-flight dedupe and short result cache. `lib/agent/stock-page.ts` gates the model judge: disallowed redirect targets, missing/non-2xx responses, bot walls, pages that never present the requested product, and pages with no size controls return blocked/unclear without a model call. Returns verdict, evidence, final URL, HTTP status, screenshot, source label and session id. |
| `/api/stock-check/replay` | GET | Replay URL for a stock-check session (`?session=`). Returns `null` until the upload finishes. |
| `/api/basket/[runId]` | GET | Status of a user-approved Browser Use basket check. |
| `/api/passport` | POST | Issues a signed Fit Passport. |
| `/api/passport/[token]` | GET | Reads a passport. |
| `/api/passport/[token]/fit` | POST | Checks a given shoe against a passport. |
| `/api/outcome/link` | POST | Issues an opaque Awin `clickref` and a signed follow-up URL for one shoe and size. Stores nothing. |
| `/api/outcome` | POST | Records a fit outcome (or why it was not bought) for a signed follow-up link. Logged, and stored in Redis when configured. |
| `/fit/[token]` | page | The follow-up page the shopper returns to; the token carries the shoe context, so it needs no account. |
| `/api/mcp` | GET, POST, DELETE | MCP server exposing passport fit checks to other agents. |

Every paid route (`agent`, `deep`, `tryon`, `vision`, `brief`, `voice`, `pose-vlmrun`, `passport-fit`) passes through `lib/rate-limit.ts` (`guardRequest` / `guardSurfaceKey`, both async), backed by a shared Redis counter store (`lib/rate-limit/store.ts`; per-instance memory when none is configured, and a store outage fails open), enforcing per-visitor daily limits, global daily route capacity caps (`503` with `Forma is at capacity today — your measurement still works.`), and instant feature kill-switches (`FORMA_DISABLED_FEATURES`), while emitting structured cost and `limit_hit` events via `lib/cost-log.ts`.

## Extension points

- **New pose provider:** implement `PoseProvider` in `lib/pose/types.ts` and register it in `lib/pose/providers/index.ts`. Use `onStatus` for background progress. See `vlmrun.ts` for a hybrid provider that wraps MediaPipe.
- **New sport:** add metrics in `lib/metrics/`, a hero score branch in `lib/hero/frame.ts`, and the sport to the agent's profile tool.
- **New agent tool:** add it in `lib/agent/` and register it with the gear agent in `lib/agent/gear-agent.ts`. The UI renders tool steps from their part type.

## Data and privacy

- No database. Passports are signed tokens (`lib/passport/token.ts`), so they carry their own data.
- Shopper memory is limited to the `vertiqal-brief` cookie (confirmed brief answers, never niggles or video). There are no accounts.
- Stock checks send only the product URL and size to Solari. Screenshots are returned inline and not stored.
- Video stays in the browser. Only frames the user explicitly sends (vision notes, VLM Run refinement, try-on) leave the device, one request at a time.
