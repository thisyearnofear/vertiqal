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

Every language-model call goes through `lib/agent/models.ts`, which resolves one of three roles — `agent` (multi-step tool loop), `fast` (cheap text extraction/judging) and `vision` (image-bearing calls). An OpenAI-compatible provider (`FORMA_LLM_BASE_URL` / `FORMA_LLM_API_KEY` / `FORMA_LLM_MODEL`) serves `agent` and `fast` when configured; `vision` uses `FORMA_LLM_VISION_MODEL` when set, else falls back to the agent chain. Current production on Featherless: `Qwen/Qwen2.5-72B-Instruct` (agent + fast) and `Qwen/Qwen3-VL-32B-Instruct` (vision — the 72B text model cannot read images). A second OpenAI-compatible provider (`FORMA_LLM2_BASE_URL` / `FORMA_LLM2_API_KEY` / `FORMA_LLM2_NAME`, e.g. a self-hosted Hetzner box) can be layered in via explicit chains — a `<name>:<model-id>` spec addresses it — and an explicit `FORMA_AGENT_MODELS` / `FORMA_FAST_MODELS` chain is authoritative (nothing auto-prepended). Without a compatible provider, Vercel AI Gateway chains run per role: `agent` (default `grok-4.7 → gemini-2.5-flash → gpt-5-mini → deepseek-v3.1`) and `fast` (default `grok-4.20-non-reasoning → gemini-2.5-flash-lite → nova-2-lite → gpt-5-nano`), both multimodal-first so images are covered. The first model answering a probe is cached for the instance; a total miss is retried after 60s. Chains are env-overridable via `FORMA_AGENT_MODELS` / `FORMA_FAST_MODELS` (prefix `compatible:` to force the OpenAI-compatible provider for one role), so a restricted or unfunded model degrades to a working one instead of halting the fitting. A mid-run `resolveModel(role, { skip })` probes the rest of the chain for one request without re-pinning the cached winner — used for the agent rescue escalation and the `/api/brief` retry. Single-purpose models with no substitute (Grok TTS, FLUX Kontext) fail with shopper-readable copy, never raw gateway errors.

Callers: `agent` → `/api/agent` gear loop, `/api/brief` text parse, passport `check_fit`; `fast` → none currently (stock judge moved to vision because it carries a screenshot); `vision` → `/api/vision`, `/api/brief?kind=surface`, and the Solari stock judge.

**Featherless quirks (current provider):**
- No `json_schema` structured outputs, only `json_object`. The brief, vision, surface and stock-judge calls pass `providerOptions: { openaiCompatible: { structuredOutputs: false } }`, spell the exact JSON keys in the system prompt, and rely on tolerant Zod validation. `briefParseSchema` (`lib/fitting/brief-parse.ts`) additionally preprocesses small-model output: alias keys (`budget`, `foot_width`, `current_shoe`), numbers inside strings like `"under 150 pounds"`, and still rejects goal/surface/width values outside the listed options.
- `Qwen/Qwen2-7B-Instruct` parses briefs fine but will **not** drive the multi-step tool loop. The agent role needs a larger tool-capable model.
- **Known limit — full agent reliability (measured 2026-11-04, updated after the rescue landings same day).** Brief extraction and vision are reliable. The multi-step fitting loop completes in ~40–60 s when Featherless is responsive; the small-model stall modes below are now mitigated, leaving shared-infra latency as the dominant failure.
  - *Fixed — grounding:* the model used to cite review/community URLs (or invent shoes the search never returned) and die on the guard. `recommendProducts` now repairs stray URLs against the real `searchProducts` hits (`reconcileUrl`/`sameShoe` in `lib/agent/picks.ts`) and, on rejection, hands the model the actual `availableProductPages` to copy from.
  - *Fixed — fatal tool-choice crash:* `prepareStep` used to force a specific tool per phase; when the model answered in text the AI SDK threw `AI_ToolChoiceViolationError` and killed the run. `prepareStep` now only restricts `activeTools` and leaves `toolChoice` auto, so a text answer ends the loop gracefully.
  - *Mitigated — stuck loops:* open-weight models used to spin on searches or hallucinated tools until the 16-step budget died (observed: 15 searches, ~90k input tokens, zero picks). `repairToolCall` (`lib/agent/tool-repair.ts`) executes any call that maps to a real tool with fixable args — but enforces the run budgets too: single-use tools (evidence, profile, community, athletes) can't be repaired twice, and once the run is stuck only `recommendProducts` repairs, so refused calls become error-text phantoms that feed the rescue instead of the loop (earlier, executed off-phase calls never reached the stuck thresholds — a 132 s run died at the step cap without recommending). `prepareStep` yields hidden tools back at most 3× per run, hard-caps corrective searches at 6 after a rejected shortlist, and past ≥3 phantom calls or ≥6 searches with no shortlist it gates to `recommendProducts`, appends a `FORMA-RESCUE:` user-turn directive listing the real product pages found (the SDK rejects system-role directives mid-conversation — `AI_InvalidPromptError`), and escalates the remaining steps to the next chain candidate via `resolveModel('agent', { skip })`. `/api/brief` retries a failed call once on the next chain candidate.
  - *Bounded generation:* `maxOutputTokens` is 4k (a measured runaway emitted 8.4k output tokens over ~200 s before the provider errored) and every provider call carries a 90 s fetch timeout (`AbortSignal.any`), so a hung upstream call fails fast — the client retries — instead of silently consuming the whole `maxDuration` budget.
  - *Residual gaps (known):* `resolveModel` pins the first answering model for the instance lifetime and a provider that fails mid-run is not demoted (the `/api/agent` loop has no call-level fallback, unlike `/api/brief`). Depth search budgets now cover three distinct picks (quick 3 / considered 3 / deep 4).
  - *Remaining — shared-infra latency:* on Featherless a realistic mid-loop call takes ~8–10 s and grows with context (search results accumulate), so a ~12-step fitting needs 100–300 s and competes with other tenants. Context was trimmed (5 results / 240-char snippets) to help. Under sustained back-to-back load the provider also degrades and even single brief calls can transiently 502/503; they recover within a minute.
  - Stronger tool models are not currently reachable: `meta-llama/Llama-3.3-70B-Instruct` is gated behind HuggingFace OAuth (no HF account is connected), `Mistral-Small-3.2-24B` answers in prose instead of calling tools, and `Qwen/Qwen3-32B` grounds well but its reasoning either blows the time budget (thinking on) or emits tool calls as plain text (thinking off). The Vercel AI Gateway fallback needs a credit balance this account doesn't have. **If agent reliability matters, the levers are: add gateway credits, connect HuggingFace on Featherless to unlock Llama-3.3-70B, or move the agent role to a dedicated/faster endpoint.**

**Ops note — serverless tracing:** `/api/stock-check` (and `/replay`) 500'd on every request in prod while identical code 400'd locally: `@solarisdk/browser` → `patchright-core`, a nested pnpm dep, was dropped from the traced function bundle so the module never loaded. `next.config.mjs` now pins both into `outputFileTracingIncludes` for those routes, and `patchright-core` is also a direct dependency for a top-level link.

## Fitting-state rules

`lib/fitting/` owns client-side gates that would otherwise be spread through the UI:

- `session.ts` derives the visible stage, supplies the next-action rail, decides whether a measurement can submit, and plans a re-analysis or recapture when height/provider inputs change.
- `prefs.ts` validates the required brief (size, budget, 120–220 cm height, goal and surface) before `/api/agent` runs. Foot width and niggles remain optional.
- `example.ts` supplies the synthetic, clearly labelled six-stage walkthrough (AI-generated running clip fixture plus synthetic measurements, brief, concepts and an un-run receipt template; see README for attribution). The running example draws a local 2D pose overlay over the generated clip — at most 12 fps while it plays and the tab is visible — but reports framing only and never touches measurements, hosted providers or TTS. Example mode cannot authorise research, stock or passport calls.
- `stock.ts` separates a typed draft size from the explicitly submitted size and carries the server-issued product token, so an old verdict, passport or arbitrary URL cannot be applied to a new request.
- Retailer allowlist (`lib/agent/domains.ts`) covers showroom and catalog merchants (laced, endclothing, asos, johnlewis, size, schuh, footlocker, office, soletrader) so catalog picks never 403 the live check.
- Verified PayPal captures are recorded at capture time (`lib/captures/`) and lead the `/api/lab` feed, so the ledger shows money before the transaction-search index catches up. Local validation stays a lab instrument — off the shopper page.
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
| `/api/paypal/order` | POST | Creates a PayPal order via the Agent Toolkit (`create_order`); returns `{ id, approveUrl }`. |
| `/api/paypal/capture` | POST | Captures an approved order and verifies COMPLETED server-side; `purpose: 'pro'` mints the signed `tier: 'pro'` claim, `purpose: 'purchase'` returns the `captureId` the refund/shipment routes key on. |
| `/api/paypal/refund` | POST | Refunds a capture when a fit outcome reports failure (`create_refund`). |
| `/api/paypal/shipment` | GET, POST | POST registers shipment tracking on a capture; GET reads delivery status for the film-again nudge. |
| `/api/paypal/subscription` | POST, GET | POST creates a Billing Plans subscription (direct REST — the toolkit refused subscription actions); GET `/status` verifies ACTIVE before the tier claim signs. |
| `/api/paypal/activity` | GET | Recent successful transactions via `list_transactions`; feeds the landing-page ledger and `/lab`. |
| `/api/lab` | GET | Joins PayPal transactions with recorded fit outcomes for the AG Grid Fit Lab. |
| `/api/mcp` | GET, POST, DELETE | MCP server exposing `get_fit_passport`, `check_fit` and `find_products` (Channel3 catalog) to other agents. |

Every paid route (`agent`, `deep`, `tryon`, `vision`, `brief`, `voice`, `pose-vlmrun`, `passport-fit`) passes through `lib/rate-limit.ts` (`guardRequest` / `guardSurfaceKey`, both async), backed by a shared Redis counter store (`lib/rate-limit/store.ts`; per-instance memory when none is configured, and a store outage fails open), enforcing per-visitor daily limits, global daily route capacity caps (`503` with `Forma is at capacity today — your measurement still works.`), and instant feature kill-switches (`FORMA_DISABLED_FEATURES`), while emitting structured cost and `limit_hit` events via `lib/cost-log.ts`.

## Viewport and staged intent

One viewport = one job, one primary action, at most five data chunks (Miller 5±2).
Above-the-fold carries ~57% of viewing time, top two screenfuls ~74% (NN/G); mobile
sees 80% less per viewport than desktop (Baymard), so the page must stage work by
purchase intent instead of stacking it.

- `invite/capture/confirm`: movement + 2–3 decisive brief questions only. Full gait
  table, twin replay, validation trace, community/prices/till stay collapsed.
- `research/choose`: activity line + 3 progress ticks + up to 3 source cards, then 3
  pick cards + 1 pick CTA. Readout, twin, validation unmount once `hasOutputs`.
- `decision`: pick hero + live size-check receipt + sticky buy/PayPal first; passport,
  baseline, film-again and till ledger reveal only after `stockChecked`/`bought`.
- Till and fit-notes never mount before a choice exists; the lab grid lives at `/lab`,
  not under the fitting. Intent signals (`stock.phase`, `bought`, `takeAway`,
  `shortlist_feedback`) gate each reveal — each stage earns the next question by
  giving value first. See `lib/fitting/session.ts` `visibilityFor` + `stride-lab.tsx`
  mount gates; guided-selling target is 2–3 questions, one at a time (quiz finishers
  ~5.5% vs ~2% baseline).

### Progressive disclosure without drawer graveyards

Drawers are a promise, not a pattern: NN/G, Baymard and drawer-usability studies agree
that tall accordions lose scroll position, hide comparison, and go unopened — expand
rates under ~5% with flat conversion mean delete the content, not hide it better. Two
layers is the practical ceiling. Prefer, in order:

1. **Trim by frequency, not importance.** If everyone opens it, it was never secondary.
   Lab instruments (`Local validation`) live at `/lab` or `?debug`, never on the shopper
   page. Empty states (athletes with no coverage, replay links before upload) render
   nothing — no drawer that says nothing.
2. **Staged disclosure over accordions.** The fitting stage is the disclosure:
   readout/twin/validation unmount once `hasOutputs`; till/notes mount only in
   `decision`. Content absent until its stage needs no drawer.
3. **Inline receipt over proof drawer.** Verdict + screenshot + observed URL stay
   visible (`StockProof` is a div, not `<details>`); the drawer holds nothing. Papers
   collapse to at most 2 inline DOI links on requirements that cite them.
4. **Conditional over generic.** Width/niggles surface when the verdict is `unsure`
   or feedback is negative — not as an always-open bucket. New branches get their own
   conditional fields, never a broad bucket.
5. **Drawer rules when one remains:** shorter than the viewport, labelled with the
   payoff (`Research · 3 findings · 2 papers`), trigger and payoff in the same viewport,
   independent open state, `Expand all` where scanning matters. `How Forma decided`
   defaults open after outputs because it is the receipt, not secondary detail.

## Cohesion, holistic flow and performance

- **One voice:** product is `forma` (lowercase wordmark + `The right shoe…` tagline);
  `vertiqal` is the repo/URL only. Metadata, headers and receipts all lead with forma.
- **One material language:** `housing` (raised putty), `screen` (+`screen-readable` at
  12% scanlines for text), `phosphor`/`engraved`/`led`/`well` — no new panel styles.
  Focus stays visible (`focus-visible:ring`), motion is reduced-motion gated
  (`motion-reduce:animate-none` on every `animate-in`; global kill for `animate-in`
  under `prefers-reduced-motion`).
- **One flow:** stage owns what mounts (`visibilityFor` + choice gates). Money and notes
  mount only in `decision`; readout/twin/validation unmount once `hasOutputs`; lab
  grid lives at `/lab`. Empty/error/loading copy names the next action, never a dead end.
- **Performance budget:** three.js twin and AG Grid are `next/dynamic` (`ssr:false`);
  retailer thumbnails are `loading=lazy decoding=async sizes=100vw/50vw`; below-fold panels use
  `.below-fold` (`content-visibility:auto`); replay polling caps at 12×3s; till
  refetches only after a paid event (+5s). `motion/react` is out of the stage critical
  path (CSS `animate-in` instead); `optimizePackageImports` covers lucide/motion/ai;
  PayPal preconnected, Channel3 dns-prefetched. Build stays green; total client chunks
  ~3.3M with the pose/AI floor (MediaPipe + agent stream) isolated from first paint.

## Extension points

- **New pose provider:** implement `PoseProvider` in `lib/pose/types.ts` and register it in `lib/pose/providers/index.ts`. Use `onStatus` for background progress. See `vlmrun.ts` for a hybrid provider that wraps MediaPipe.
- **New sport:** add metrics in `lib/metrics/`, a hero score branch in `lib/hero/frame.ts`, and the sport to the agent's profile tool.
- **New agent tool:** add it in `lib/agent/` and register it with the gear agent in `lib/agent/gear-agent.ts`. The UI renders tool steps from their part type.

## Data and privacy

- No database. Passports are signed tokens (`lib/passport/token.ts`), so they carry their own data.
- Shopper memory is limited to the `vertiqal-brief` cookie (confirmed brief answers, never niggles or video). There are no accounts.
- Stock checks send only the product URL and size to Solari. Screenshots are returned inline and not stored.
- Video stays in the browser. Only frames the user explicitly sends (vision notes, VLM Run refinement, try-on) leave the device, one request at a time.
