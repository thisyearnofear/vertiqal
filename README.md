# Forma (vertiqal)

**Agentic commerce for footwear, end to end.** An agent measures how you move from a short clip, confirms the fitting brief, checks research and live stock, then moves real money with PayPal — verified checkout, shipment tracking, and a refund when the fit fails. A signed **Fit Passport** lets any other shopping agent spend against your body-measured profile, over REST or MCP.

Live: [vertiqal.vercel.app](https://vertiqal.vercel.app) — scroll to **The till** to watch a sandbox order, capture and ledger entry without doing a fitting.

## The problem

Footwear is bought on keywords and shop-floor rules of thumb, and it is one of the most-returned categories in commerce. The information that actually matters, how *you* move, never reaches the checkout — and the checkout never learns why the shoes came back.

## What Forma does

1. **Shows the loop first.** The home page opens on the movement screen as the hero: an idle pose figure demonstrates what Forma watches for, with a "Show me a sample fitting" action on the screen itself. The same screen then plays the example footage, the live camera or your uploaded clip. Directly under it sit the running/climbing choice, upload and live-camera actions, and a Forma strip that announces the current step and holds the settings sheet (tuning, privacy and the pose-provider picker); on mobile a fixed compact Forma/action bar sits at the bottom. The six-stage labelled example walkthrough, readouts and results follow below the screen; the footage attribution renders under the strip in example mode. Once a clip is measured, the locked metrics stay pinned along the bottom of the screen, and the screen shrinks once shopping results arrive. Local validation lives in its own disclosure. The example never calls agent, stock or shopper APIs — see *Example assets and limits* below for the footage source and its limits.
2. **Measures on-device.** MediaPipe pose tracking runs in the browser on a phone clip or live camera: cadence, foot strike and overstride for running; reach, hip position and precision for climbing. Live capture shows real pose-derived person, hips and feet framing checks. Video never leaves the device unless you opt in.
3. **Confirms the brief before searching.** Movement cannot establish size, budget, goal, surface or comfort needs, so those shopper details are confirmed explicitly before a personal research run. Height is set on the idle screen itself; while a clip is measured, Forma asks the remaining questions one at a time in its strip, answered with chips (size, budget, goal, surface, optional foot width) or a short text for niggles. Answers build an editable one-sentence brief whose blanks reopen their question, and **Find my shoes** on that sentence is the confirmation. A full form remains under *Show all fields*. Optionally, *tell Forma in a sentence* sends one typed sentence to the fitting LLM to pre-fill the brief, and the surface question can guess from one clip still — both fire only on an explicit button press. Confirmed brief answers (never niggles, never video) are remembered in a `vertiqal-brief` cookie on this browser, so a returning shopper's sentence is pre-filled — tapping **Find my shoes** over it is still the confirmation, and a *Forget saved answers* link clears them. Changing height or the pose provider invalidates a stale measurement.
4. **Turns movement into fit requirements.** A gear agent (resolved per `lib/agent/models.ts` — currently Featherless `Qwen/Qwen2.5-72B-Instruct`, Vercel AI Gateway as fallback) builds a movement profile, then works through visible steps: research, live retailer stock, rider reports and athletes who wear the shoe. Each claim carries a citation checked against the publisher. Picks land as a small showroom — real product photography from the catalog plus "the shoe's story", a craft line on what the maker was solving for — because a fitting should celebrate shoes, not flatten them into search results.
5. **You choose how far to dig.** Search starts at Considered; **Look harder** moves to Deep and adds research and athlete evidence.
6. **Asks before acting, then does the obvious thing.** No live search starts until a real measurement and required brief are present. Once results land, Forma narrates one step at a time from a bar that follows you down the page, with at most one main action. Picking a running shoe starts the size check for your confirmed size straight away (climbers enter the shop's size, since climbing shoes run small); if that size is sold out, Forma says so and checks the next pick once by itself. A small "Forma's browser" window shows the address being checked, a clock, then the screenshot and verdict. The size check submits one explicit size to Solari's stealth browser with UK egress by default; a vision model reads the size controls, structured offers and a screenshot to decide whether that size is in stock. Checks are limited to approved retailers, authorized product targets and per-client quotas, with a short-lived per-instance cache and honest live/cached/shared labels. Receipts include the observed URL and HTTP status, plus a screenshot and session replay when available; these show execution evidence, not proof of stock. The older Browser Use basket check still exists as an agent tool. Both stop before checkout.
7. **Carries your fit elsewhere — and closes the loop.** A signed **Fit Passport** lets any other shopping agent check a shoe against your profile, over REST (`GET /api/passport/<token>`, `POST /api/passport/<token>/fit`) or MCP (`get_fit_passport`, `check_fit`). Forma Pro and verified in-stock picks check out inside the app via **PayPal Orders v2 + the JS SDK**: `prepareCheckout` is a gear-agent tool, and the server captures and verifies COMPLETED before anything counts as paid. `pnpm agent-shop -- --product "La Sportiva Solution Comp" --price 175` runs an external agent through the whole loop: read passport → judge fit → prepare PayPal order. `pnpm agent-shop:mcp` runs the same loop over two MCP servers — vertiqal's `/api/mcp` and PayPal's own `@paypal/mcp` — in one agent client.
8. **Remembers your brief, not you.** Confirmed brief answers (never niggles, never video) are kept in a cookie on this browser so a returning shopper's sentence is pre-filled. There are no accounts and no database.
9. **Shows the money moving.** The landing page ends with **The till**: a one-click demo checkout that opens a real sandbox PayPal order (no fitting needed — approve it in the PayPal window and the server verifies the capture), next to a live ledger of the last 30 days of sandbox transactions. Judges can watch PayPal work in three clicks; shoppers see where a fitting ends.
10. **Lets you see yourself — and prove change.** Once the readout locks, Forma offers the **hero frame**: a 1080×1350 social card grading your best stride or reach — one bold metric, a short caption generated on-device (no LLM), and auto-narration via the browser's speech synthesis. Pin the card as your baseline, film again any time, and Forma renders a before/after **comparison card** (1080×1080) with the changes worth talking about plus a 30-day calendar reminder to re-film. The opt-in **See yourself in them** shows you wearing the top pick (FLUX Kontext), clearly labelled as an AI impression, not a fit check.

## Built with

| Service | Role |
| --- | --- |
| Featherless AI | Primary LLM host via `FORMA_LLM_*`: `Qwen/Qwen2.5-72B-Instruct` for the agent tool loop and brief parsing, `Qwen/Qwen3-VL-32B-Instruct` for image calls (vision notes, surface guess, stock-judge screenshot). Hero-card captions and narration are generated on-device and cost nothing. The full agent loop completes in ~40–60 s when the provider is responsive but intermittently times out on shared-infra latency — see [architecture](docs/architecture.md#model-resolution). |
| Vercel AI Gateway | Fallback LLM chains when the OpenAI-compatible provider is down (`FORMA_AGENT_MODELS` / `FORMA_FAST_MODELS`), plus Grok TTS (Forma's spoken lines) and FLUX Kontext (try-on). See [architecture](docs/architecture.md#model-resolution). |
| MediaPipe Pose | On-device keypoints, every frame. |
| VLM Run (Orion) | Optional hosted keypoint refinement on sampled frames of uploaded clips. |
| PayPal | Agentic commerce: Forma Pro subscription (`/upgrade`) via Billing Plans REST — plan → subscribe → server-verified ACTIVE → signed `tier: 'pro'` cookie — plus a `prepareCheckout` agent tool that opens a PayPal order once a pick's size is verified in stock, and refund-on-misfit. Sandbox config: `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` (server) and `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (client), `PAYPAL_ENV=sandbox`, `PAYPAL_PRO_PLAN_ID` optional. PayPal Agent Toolkit handles order/refund actions. |
| Tavily | Live retailer, research, community and athlete search. Product search runs at advanced depth and filters out corporate/homepage URLs so picks cite real product pages. |
| Solari | Stealth browser with UK residential egress for size and stock checks, with screenshot and session replay receipts. |
| Browser Use | User-approved basket availability checks (agent tool). |
| Channel3 | Structured product catalog for agents: the gear agent's `searchProducts` merges live web results with Channel3 offers (per-merchant price, availability, stockist, commission rate), and the MCP `find_products` tool exposes the same catalog to external shopping agents. `CHANNEL3_API_KEY`; verify with `node scripts/channel3-check.mjs "Nike Vomero"`. |
| APIMatic | PayPal Context Plugin (`npx context-plugins install paypal`) grounded the PayPal work — SDK-accurate Orders/Billing context for the coding agent instead of remembered API shapes. |
| AG Grid | `/lab` merchant view (`components/lab/fit-lab.tsx`): PayPal transactions joined with recorded fit outcomes, sortable and filterable. |
| Vercel Analytics | Funnel events only — `sample_started`, `film_started`, `clip_uploaded`, `measurements_locked`, `shopping_started`, `pick_chosen`, `buy_clicked`, `shortlist_feedback`, `limit_hit` — carrying sport/retailer flags, no PII. |
| Next.js 16 + AI SDK | App, route handlers, tool-calling agent. |

## ChatGPT plugin — "will these fit me"

Thin packaging over the live Fit Passport MCP (directory at [chatgpt.com/plugins](https://chatgpt.com/plugins)). Description in user words. **Free wedge first:** `get_fit_passport` + `check_fit`. Live Solari size/stock checks and Fit Passport **issuance** stay on the product — not in-plugin deep actions. No digital checkout inside ChatGPT (see playbook commerce constraints).

| | |
| --- | --- |
| MCP | [`https://vertiqal.vercel.app/api/mcp`](https://vertiqal.vercel.app/api/mcp) (`app/api/mcp` · tools `get_fit_passport`, `check_fit`) |
| Live app | [vertiqal.vercel.app](https://vertiqal.vercel.app) |
| Playbook | [`docs/CHATGPT_PLUGIN_PLAYBOOK.md`](docs/CHATGPT_PLUGIN_PLAYBOOK.md) |
| Connect | [`docs/CHATGPT_PLUGIN_CONNECT.md`](docs/CHATGPT_PLUGIN_CONNECT.md) |
| Eval set | [`docs/CHATGPT_PLUGIN_EVAL.md`](docs/CHATGPT_PLUGIN_EVAL.md) |
| Starter prompts | [`docs/CHATGPT_PLUGIN_STARTER_PROMPTS.md`](docs/CHATGPT_PLUGIN_STARTER_PROMPTS.md) |
| Scoreboard | Usage-only funnel (connect → free tool → return) in [`docs/CHATGPT_PLUGIN_PLAYBOOK.md`](docs/CHATGPT_PLUGIN_PLAYBOOK.md#usage-only-scoreboard-plugin-lane) — usage-first; don’t chase ARPU yet |
| Virality | Hero-frame cards and shareable Fit Passports are the share loop (pick → card → friend → back). Run the K-factor worksheet on shared picks → new fittings, then a 48-hour test on the card CTA. |

## Monetisation and costs

On-device measurement stays free. Hosted vision, brief parsing, surface guesses and try-on are metered: free monthly quotas, then Forma Pro via a verified PayPal subscription (`lib/fitting/entitlements.ts`). Affiliate wrapping switches on with the Awin env. Nothing has been charged yet, and B2B pricing waits on a consented motion validation. The cost model is in [docs/monetisation.md](docs/monetisation.md).

## Programme: Keiki × Maritime

Accepted into the Keiki × Maritime programme (Oct 20 – Dec 1, 2026): build an always-on personal agent, reach 1,000 users in six weeks. Transparent user tracking starts at zero: [`docs/KEIKI_MARITIME.md`](./docs/KEIKI_MARITIME.md).

## Run locally

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test:fitting # fitting-state, capture and preference rules
pnpm test:pose    # example tracking lifecycle, local export and annotation-comparison unit tests
pnpm smoke        # end-to-end checks against BASE_URL (add --llm or --full to exercise the model; --full spends real money)
pnpm cost:report  # unit economics from `vercel logs --json` (see script header for price assumptions)
pnpm typecheck
pnpm build
```

**Fastest way to see the product:** on the invite stage press **"Run a demo fitting"** — it sends the example's illustrative metrics through the real `/api/agent` (live picks, no camera). To complete the Pro loop, PayPal approval needs a *sandbox* account — use a `sb-…@business.example.com` / personal sandbox login from developer.paypal.com → Testing Tools → Sandbox Accounts.

## Motion validation (running first)

Forma's movement estimates are experimental. This workflow compares detected foot-contact events against independently supplied annotations; it does not certify biomechanics, shoe fit or clinical validity.

1. Record a real, consented side-on clip with the full body and both feet visible, a stationary camera and known height. Keep the original video privately so contact times can be reviewed. AI-generated footage can exercise the interface but cannot validate real-person measurement accuracy.
2. Upload the clip, open the local validation controls and explicitly start collecting data. Select the source honestly: unclassified, consent-confirmed real footage, or synthetic/debug. Nothing is collected by this control until you start it. Stop and export the JSON locally. It contains keypoints, entered height, provider, source declaration, original video timestamps and detected contacts, but no video/images, clip name, source URL or account information. Keypoints and height can still be identifying; keep exports outside the repository and share only with permission.
3. Independently inspect every contact in a chosen interval of the original clip. Record left/right contacts at their original `video.currentTime` timestamps; do not copy detected contacts into the reference. Explicitly exclude intervals you cannot judge and document why. Mark the annotation set complete only after reviewing the entire evaluation interval.
4. Compare the export with your annotation JSON using the CLI below. Select and document the matching window before looking at the results. The example `80` ms is an invocation example, not a recommended accuracy threshold.

```bash
pnpm validate:motion /path/to/capture.json /path/to/annotations.json --tolerance-ms 80
```

Annotation template (replace the capture id and interval with values from your export, fill contacts, then set `complete` to `true`):

```json
{
  "schemaVersion": 1,
  "captureId": "replace-with-exported-captureId",
  "source": "manual",
  "referenceNotes": "Describe how contact frames were independently reviewed and any timing uncertainty.",
  "complete": false,
  "interval": { "startSec": 0, "endSec": 10 },
  "excludedIntervals": [],
  "contacts": []
}
```

Each contact is `{ "timeSec": <number>, "side": "left" | "right" }`. Each exclusion is `{ "startSec": <number>, "endSec": <number>, "reason": <string> }`; its endpoints are inclusive. The CLI refuses incomplete annotations, mismatched capture ids, invalid timelines, duplicate contacts and resource-truncated captures. Matching is one-to-one and same-side: maximise the number of contacts within the supplied window, then minimise total absolute timing error. Reports include precision/recall with explicit counts, misses, extra detections, timing errors and processed-frame visibility counts. An empty denominator is `null`, not perfect accuracy. Source declarations are not independently verified; synthetic and unclassified captures are labelled `debug-only`. There is no accuracy pass/fail threshold or aggregate leaderboard.

The recorder retains the first continuous segment and stops on rewind or dimensions changes. It records all frames actually processed by Forma, not every source-video frame; visibility counts are frame counts, not elapsed-time coverage. Resource caps are 18,000 processed frames and 2,000 contacts, with no subsampling; a cap-stopped export is marked truncated and refused by the comparison tool. Live capture exports no video, so uploaded clips are preferable for independent annotation. Height, provider, sport or clip changes discard the in-memory trace. The provider identifier records the selected mode, not per-frame backend provenance; the optional hosted mode may fall back to MediaPipe.

### FreeMoCap's role

Use [FreeMoCap](https://github.com/freemocap/freemocap) as a separate offline reference workflow, not a runtime dependency. Its [multi-camera guide](https://freemocap.github.io/documentation/multi-camera-calibration.html) describes calibrated, overlapping camera views. Capture the same real movement simultaneously and compare a single-view Forma export against independently reviewed reference events; align timestamps and record calibration/synchronisation quality. Such annotations may use `source: "calibrated-multicamera"` with those details in `referenceNotes`. Native FreeMoCap files are not directly imported by this CLI, and FreeMoCap itself is not automatically ground truth. Review its AGPL-3.0 licensing before incorporating software; review recording/data permissions separately. A single-camera 3D-shaped export is not proof of measured depth.

**Pending:** no consented human dataset, manual-reference results or calibrated multi-camera comparison has been completed. The automated tests exercise synthetic code fixtures only. Do not present their passing results as motion-capture accuracy evidence.

## Example assets and limits

The six-stage walkthrough is an illustrated journey, not a genuine recorded fitting.

- **Footage (running only):** a 12-second AI-generated clip served from `public/examples/generated-runner.mp4`, produced once with [Seedance 1.5 Pro on fal.ai](https://fal.ai/models/fal-ai/bytedance/seedance/v1.5/pro/text-to-video) (fal lists the model for commercial use). Full generation details — request id, seed, input and media metadata — ship with the app at `public/examples/generated-runner-provenance.json`. The runner is synthetic and is not a real person; a local pose overlay observes the generated frames (at most 12 fps while the clip plays), and the overlay pauses when it is switched off, the panel leaves the viewport or the tab is hidden. The clip itself pauses when hidden or scrolled out of view and stays paused until the user resumes it; playback is independent of walkthrough progression. The fitting metrics remain fixtures and no real-person accuracy is established.
- **Everything else is synthetic:** measurements, brief, direction concepts and the receipt template are fixtures, clearly labelled "not measured from this generated clip". The receipt says `Template — not a completed stock check` — it shows what a real check reports, it does not simulate a verdict. The climbing example uses an inline illustration, not footage.
- **Cost:** the walkthrough calls no APIs; the ~1.6 MB clip is served from `public/` so it only costs ordinary CDN bandwidth per visitor — there is no paid call per view. One generation was approved and run once; the recorded figure ($0.31104) is a preflight unit-price estimate, not an actual billed amount. `FAL_KEY` lives server-only in `.env.local` (mode 600) and was needed solely to author the asset — the demo does not depend on fal at runtime. Genuine saved research and stock outputs still require further assets and live verification.
- **Previous archive asset retained (not used in the walkthrough):** `public/examples/archival-runner.mp4` — a 3-second clip (7:55–7:58) from *Orientation to Physical Efficiency Battery* (1986), Federal Law Enforcement Training Center, via the [Moving Image Archive](https://www.movingimagearchive.com/sources/orientation-to-physical-efficiency-battery-a4d3e5b5?clip=e9224f58-34ac-5ab8-9f9c-e5d5baed3804) and originally published on the [Internet Archive](https://archive.org/details/gov.ntis.ava18914vnb1), labelled public domain by both archives.
- Fixture and credit live in `lib/fitting/example.ts` (`EXAMPLE_FOOTAGE`).

### Compact workspace verification

Automated checks last run 2026-11-04: `pnpm typecheck` clean, `pnpm test:fitting` 73/73, `pnpm test:pose` 34/34, `pnpm build` clean, `git diff --check` clean. Production smoke: base + brief-parse + vision checks pass reliably; the **full agent fitting (`pnpm smoke --full`) completes in ~40–60 s when Featherless is responsive but intermittently times out** under shared-infra latency — crash and grounding bugs are fixed, see [architecture](docs/architecture.md#model-resolution). Manual browser checklist still pending: desktop/mobile dock overlap and scrolling plus settings sheet; example play/pause, overlay toggle, tab hide and scroll-away behaviour; closing the example restores action-button focus, and camera setup focuses the height field; running and climbing upload and capture countdown. The synthetic examples do not establish measurement accuracy; genuine footage, research and stock evidence, calibrated comparison and revenue validation remain separate pending workstreams.

## Solari cookbook patterns applied

The stock-check browser work in `lib/agent/solari.ts` was reviewed against the pinned Solari cookbook examples:

- [browser-stealth-proxy-ts](https://github.com/solari-sdk/solari-cookbook/tree/a435d2ac5ae87bdf9ee4f6c91f97da9501359560/examples/browser-stealth-proxy-ts) — the pre-existing stealth launch, GB residential egress and smart-proxy retry on bot walls match the documented configuration/lifecycle.
- [browser-session-recording-py](https://github.com/solari-sdk/solari-cookbook/tree/a435d2ac5ae87bdf9ee4f6c91f97da9501359560/examples/browser-session-recording-py) — the pre-existing per-session recording, release-and-wait and replay-polling receipts (`/api/stock-check/replay`) match the documented configuration/lifecycle.
- [browser-page-assertions-py](https://github.com/solari-sdk/solari-cookbook/tree/a435d2ac5ae87bdf9ee4f6c91f97da9501359560/examples/browser-page-assertions-py) — page verification in `lib/agent/stock-page.ts` was newly adapted from this example: after navigation, the final URL, HTTP status, `h1` identity, structured `Product` names and size controls are checked before the model judge is allowed to interpret the page. In-flight navigation to disallowed hosts is aborted via request routing, and a refused redirect invalidates the whole read.

These patterns were reviewed and adapted; this project is not a cookbook fork, and the earlier stealth/recording implementation was not originally derived from it.

Verification and limits: `inspectStockPage` in `lib/agent/stock-page.ts` is a conservative heuristic — matching headings provide identity evidence, not proof of product correctness or stock, and navigation, screenshot and replay evidence prove execution happened, not the verdict. The identity check can refuse a real product page (conservative by design) rather than assert stock on the wrong one. Tests cover the pure gate and a mock judge; the navigation/redirect interception has no live or browser QA yet. See `lib/fitting/fitting.test.ts` for the covered cases. Live end-to-end verification through the paid Solari API has not yet been run, and rate limits and caches are per-instance.

## Where things live

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Entry point; renders the Stride Lab. |
| `app/api/` | Route handlers (see [architecture](docs/architecture.md#api-routes)). Thin: parse, call `lib/`, respond. |
| `components/stride-lab/` | Fitting bench: header, synthetic example, brief form, camera/video stage, pose overlay and readouts. |
| `components/stride-lab/agent/` | Agent conversation, depth dial, picks, explicit stock checks, basket checks, Fit Passport UI. |
| `components/stride-lab/hero/` | Hero card, before/after comparison card, social-first canvas renderers (`render-card.ts`, `render-compare.ts`) and try-on UI. |
| `lib/voice/` | Browser speech narration (Web Speech API, zero cost) for hero cards. |
| `components/stride-lab/twin/` | Interactive 3D Movement Twin (Three.js WebGL rig, 3D biomechanical vectors, agent fit pins, and 3D snapshot export). |
| `components/forma/` | Forma avatar and console personalisation. |
| `lib/fitting/` | Client-side fitting rules: stage flow, preference validation, example scripts, stock-size and camera-stream semantics. |
| `lib/pose/` | Pose provider contract (`MediaPipe`, `VLM Run`) and 3D Movement Twin retargeting (`lib/pose/twin-3d.ts`). |
| `lib/metrics/` | Sport-specific measurements and readouts. |
| `lib/agent/` | Gear agent, tools, evidence checks, and the Tavily, Browser Use and Solari clients. |
| `lib/hero/` | Hero frame scoring and capture, rule-based caption generation with speech scripts (`narrator.ts`), and baseline comparison (`comparison.ts`). |
| `lib/passport/` | Passport schema, signing and fit checks. |
| `lib/rate-limit.ts` | Per-visitor daily limits, global daily route budgets and instant feature switches (`FORMA_DISABLED_FEATURES`). Counters live in Redis when `KV_REST_API_URL`/`UPSTASH_REDIS_REST_URL` is set (`lib/rate-limit/store.ts`), else per instance. |
| `lib/secrets.ts` | `requireSecret` / `MissingSecretError`: signing secrets are required, never borrowed from a vendor key. |
| `lib/agent/models.ts` | Provider-aware model resolution: an OpenAI-compatible provider (`FORMA_LLM_*`) first, Vercel AI Gateway as fallback. |

Business rules live in `lib/`; components and routes stay thin. See [docs/architecture.md](docs/architecture.md) for the request flow and extension points.

## Configuration

Server-side only (Vercel **Vars** or an uncommitted `.env.local`). Never expose these as `NEXT_PUBLIC_*`.

| Variable | Used for | Without it |
| --- | --- | --- |
| `TAVILY_API_KEY` | Live search tools | Agent skips live research and stock |
| `BROWSER_USE_API_KEY` | Basket checks | Basket check unavailable |
| `SOLARI_API_KEY` | Stock checks and session replays | Check my size returns an error |
| `STOCK_CHECK_SECRET` | **Required.** Signing secret for stock-check product targets (`openssl rand -base64 32`) | Size checks return 503; picks carry no stock token |
| `STOCK_CHECK_EXTRA_HOSTS` | Comma-separated extra approved retailer hosts (optional) | Built-in footwear retailer list only |
| `PASSPORT_SECRET` | **Required.** Signing secret for Fit Passports (`openssl rand -base64 32`). Never reuses a vendor key | Passport issue/read returns 503 (demo passports still work) |
| `FORMA_LLM_BASE_URL`, `FORMA_LLM_API_KEY`, `FORMA_LLM_MODEL` | Any OpenAI-compatible provider. When all three are set it is tried first for the agent/fast roles; optional `FORMA_LLM_NAME` labels it. **Production currently uses Featherless** (`https://api.featherless.ai/v1`, `Qwen/Qwen2.5-72B-Instruct`). Small models (e.g. Qwen2-7B) parse briefs fine but won't drive the agent tool loop. Featherless supports `json_object` but not `json_schema`; the routes already compensate (`providerOptions.openaiCompatible.structuredOutputs=false` plus tolerant schemas) | Gateway only |
| `FORMA_LLM_VISION_MODEL` | Optional model id for image-bearing calls on the same provider (production: `Qwen/Qwen3-VL-32B-Instruct`). Falls back to the agent chain when unset | Vision uses the agent chain |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway (needs a positive credit balance; 402 otherwise). Set `FORMA_DISABLE_GATEWAY=1` to skip it | Gateway candidates are skipped |
| `FORMA_AGENT_MODELS`, `FORMA_FAST_MODELS` | Ordered fallback chains, e.g. `compatible:grok-4,gateway:openai/gpt-5-mini` (bare ids mean the gateway) | Built-in gateway chains |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) | Shared rate-limit counters so daily caps hold across serverless instances | Per-instance counters (warned at startup) |
| `ERROR_WEBHOOK_URL` | Slack/Discord-style incoming webhook that receives one line per unhandled server error (`instrumentation.ts`); errors are always logged too (optional) | Logs only |
| `VLMRUN_API_KEY` | VLM Run pose refinement | Provider falls back to MediaPipe only |
| `FORMA_DISABLED_FEATURES` | Comma-separated kill-switch for paid surfaces (`agent`, `deep`, `tryon`, `vision`, `brief`, `voice`, `pose-vlmrun`, `passport-fit`) (optional) | All configured surfaces enabled |
| `FORMA_BUDGET_<SURFACE>` | Global daily call budget per surface, e.g. `FORMA_BUDGET_TRYON=60` (optional) | Uses built-in daily defaults in `lib/rate-limit.ts` |
| `FORMA_VISITOR_LIMIT_<SURFACE>` | Per-visitor daily call limit per surface, e.g. `FORMA_VISITOR_LIMIT_AGENT=6` (optional) | Uses built-in visitor defaults in `lib/rate-limit.ts` |

Without any model provider configured, every LLM-backed route returns 503 and measurement still works on-device.

## Flip the Switch Hackathon

Vertiqal (Forma) runs as a **team decision-support agent** in a Switch room. The scenario: a running club's crew is picking shoes for a shared event — each athlete measures privately in their own browser, shares a signed fit passport into the channel, a human approves a budget, and the agent returns picks, honest stock verdicts and a final plan with receipts.

- **Agent connected:** a custom Switch-protocol client (`switch/room-agent.mjs`) — raw WebSocket in for room events, HTTP ops out for posts — not Claude Code/Codex; model calls happen inside vertiqal's own endpoints (Featherless/Nebius chain).
- **Channel:** `#relay-fitting` in the Switch-bundled Mattermost; two teammates work with the agent there (share passports, `approve £140`, `check <shoe>`).
- **Demo video (78s):** https://youtu.be/ofyeq-lI8S8 — the agent working the full loop in the real room.
- **How to run it:** [`switch/README.md`](./switch/README.md) — registration, mock harness (`pnpm switch:mock`, no Switch needed to try it), and the live verification log. Design + demo context in [`docs/SWITCH_HACKATHON.md`](./docs/SWITCH_HACKATHON.md).
