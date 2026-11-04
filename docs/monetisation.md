# Monetisation and free-stage cost controls

See [STRATEGY.md](STRATEGY.md) for the wedge, the economic loop and the kill criteria. This file covers cost controls and the revenue options it ranks.

Status: **plan, not implemented.** As of 2026-10-01 vertiqal has no revenue path: the Buy button is a plain retailer link, there is no paywall or pricing, and the Fit Passport REST/MCP endpoints are free. Every fitting costs money; nothing earns it.

## Where cost comes from today

| Surface | Paid calls | Current guard |
| --- | --- | --- |
| `/api/agent` (gear agent) | Resolved model (currently Featherless `Qwen/Qwen2.5-72B-Instruct`, ~$0.37/$0.40 per M tokens) multi-step tool loop + Tavily searches (more at Deep: research, athletes) | Server-side `agentRequestSchema` validation (`{ brief, prefs }`, ≤32 KB body, ignores client `messages`), `stopWhen: stepCountIs(14)`, cost-logged (`agent_run`), plus `lib/rate-limit.ts` per-visitor (6/day; 2/day Deep) and global daily capacity caps (`250`/day; `80`/day Deep). |
| `/api/stock-check` | Solari browser session + `vision` model judge (screenshot) | Signed product target + retailer allowlist + 6 checks / 10 min per client key, **in-memory per serverless instance** |
| `/api/tryon` | FLUX Kontext Pro image generation | `lib/rate-limit.ts` (3/visitor/day, 60 global/day), cost-logged via `paid_call` |
| `/api/vision`, `/api/brief` (surface) | `vision` model (Featherless `Qwen3-VL-32B-Instruct`, ~$0.10/M) | `lib/rate-limit.ts` (`vision`: 6/visitor/day, 150 global/day; `brief`: 10/visitor/day, 300 global/day), cost-logged via `paid_call` |
| `/api/brief` (text) | `agent` model text extraction | cost-logged via `paid_call` |
| Hero frame caption + narration | **Zero** — rule-based caption (`lib/hero/narrator.ts`) and browser speech synthesis (`lib/voice/speak.ts`); comparison cards likewise | No guard needed |
| `/api/voice` | Grok TTS per spoken line | 240-char cap + `lib/rate-limit.ts` (30/visitor/day, 600 global/day), cost-logged via `paid_call` |
| `/api/pose/vlmrun` | VLM Run keypoint refinement | Key presence + `lib/rate-limit.ts` (24/visitor/day, 300 global/day), cost-logged via `paid_call` |
| `/api/mcp` (`get_fit_passport`), `/api/passport/[token]` | Read passport (no model calls) | HMAC-signed tokens (`mcp_call` logged) |
| `/api/mcp` (`check_fit`), `/api/passport/[token]/fit` | Structured LLM fit check (`resolveModel('agent')`) | HMAC-signed passport token + `lib/rate-limit.ts` (15/visitor or passport/day, 300 global/day), cost-logged via `paid_call` & `mcp_call` |

On-device measurement (MediaPipe) and the example walkthrough cost nothing per visit beyond CDN bandwidth.

## Free stage: goals

The free stage exists to learn two things: **how people use it** (funnel drop-off, which extras they use) and **how good the build is** (are picks and measurements trusted). Cost controls should therefore be generous for a real shopper doing one or two fittings, tight for abuse, and should degrade gracefully rather than break the on-device experience.

## Free stage: cost controls (proposed, in order)

1. **Hard caps at each provider (no code).** Treat these as the backstop that bounds the worst case regardless of bugs:
   - AI Gateway: use prepaid credits with auto top-up off (or a team budget alert) so a runaway loop stops at the balance.
   - Tavily, Solari, VLM Run, and your LLM provider / AI Gateway: set the plan's monthly credit or spend limit and an alert at ~50% and ~80%.
   - Vercel: Spend Management on the project, and Firewall rate-limit rules on `/api/*` (dashboard-configured, applies before functions run).
2. **Close the open endpoint.** `/api/agent` should validate its input server-side: at most one user brief message of bounded size, a known depth, and an explicit `stopWhen` step cap on `gearAgent`. Without this, the client-side gating is advisory and anyone can drive Grok and Tavily directly.
   - **Implemented:** the route parses `{ brief, prefs }` against `agentRequestSchema` (bounded brief, known depth, capped notes), rejects bodies over 32 KB with 413, builds the prompt itself and ignores client `messages`; `gearAgent` has `stopWhen: stepCountIs(14)`.
3. **Per-visitor and global daily limits.**
   - **Implemented (`lib/rate-limit.ts`; shared across instances when a Redis/KV store is configured, otherwise per instance):** Every paid route (`agent`, `deep`, `tryon`, `vision`, `brief`, `voice`, `pose-vlmrun`, `passport-fit`) enforces both a per-visitor daily window (`FORMA_VISITOR_LIMIT_<SURFACE>`) and a global daily route budget (`FORMA_BUDGET_<SURFACE>`). When a route hits global capacity it returns `503 { reason: 'capacity', error: 'Forma is at capacity today — your measurement still works.' }` and logs `limit_hit`. Move counters to a shared store (e.g. Upstash Redis) if multi-instance horizontal scaling requires cross-instance enforcement.
4. **Instant switches for expensive extras.**
   - **Implemented (`lib/rate-limit.ts`):** Set `FORMA_DISABLED_FEATURES` (comma-separated, e.g. `tryon,deep,voice,pose-vlmrun`) to immediately return `503` with the capacity message on any expensive surface.
5. **Spend less per fitting without hurting quality.**
   - **Implemented (`lib/agent/tavily.ts`):** 6-hour in-memory TTL cache + in-flight deduplication across Tavily product, community, research, and athlete searches so identical queries cost zero repeat search credits.
   - Pre-render Forma's templated mood lines to static audio per voice, so TTS is only called for dynamic text.
   - Keep Considered as the default depth (Deep only on request, capped as above).
6. **Measure cost per fitting.** Log usage per agent run (steps, tool calls, input/output tokens from the AI SDK `onFinish` usage) alongside the funnel. Add `limit_hit` and pick feedback events. This gives the two numbers the revenue decision needs: cost per completed fitting and fittings → `buy_clicked` conversion.
   - **Implemented:** `lib/cost-log.ts` emits one JSON line per event to function logs — `agent_run` (steps, per-tool counts, tokens, Tavily call estimate, finish reason, outcome) plus `paid_call` on every paid route. `limit_hit` fires on stock-check 429s and `shortlist_feedback` collects one-tap verdicts on the picks.

## Learning how good the build is

- Funnel events already cover sample → capture → lock → shopping → pick → buy.
- Add a one-tap "Does this shortlist look right?" (yes / not really + reason) on the picks, and record the 12-day check-in reply as a satisfaction signal.
- Real-footage accuracy validation (see *Motion validation* in the README) remains the gate for any claim about measurement quality.

## Revenue options, ranked

1. **Affiliate commission on Buy (first).** Most UK running and climbing retailers are on affiliate networks (e.g. Awin, Rakuten). Rules:
   - **Implemented (`lib/agent/affiliate.ts` + `DecisionPanel`):** `wrapAffiliateUrl` wraps approved retailer URLs at click/render time on the Buy button when `NEXT_PUBLIC_AWIN_AFFILIATE_ID` and `NEXT_PUBLIC_AWIN_MERCHANTS` (`domain:merchantId,...`) are configured, never altering the canonical `pick.url` used for ranking, stock checks, or Fit Passports.
   - Visible disclosure near Buy (ASA/CMA): `"We may earn a commission. It never changes the ranking."` (shown automatically whenever a link is affiliated, with `rel="noreferrer sponsored"`).
   - `buy_clicked` is tagged with `affiliated: true | false`.
   - When going commercial, prefer network product feeds (price/stock) over stealth-browser checks on partner retailers, which may conflict with their terms.
2. **B2B fit data: Fit Passport / API.** Retailers pay to reduce returns via per-check API pricing or a "check against my fit" widget. Blocked on accuracy validation — the measurements are still experimental.
3. **Licensing to running shops and climbing gyms.** In-store movement analyser, with staff interpreting results; less exposed to accuracy risk.
4. **Consumer subscription.** Weak alone given low purchase frequency; possible later around progress tracking.
5. **Paid brand placement.** Rejected: it contradicts the receipted, independent-recommendation premise.

## Next steps

1. Provider caps and alerts (step 1 above) — before any promotion.
2. ~~Server-side `/api/agent` validation and step cap (step 2).~~ *(Done)*
3. Shared limits (including `/api/tryon`, `/api/vision`, `/api/brief`, `/api/voice`, and `/api/mcp` `check_fit`), global budgets and the capacity message (step 3), plus flags (step 4).
4. ~~Cost-per-fitting logging and pick feedback (step 6)~~ *(Done)*; review after a few weeks of funnel data.
5. Affiliate wrapping and disclosure once network accounts exist; run real-footage validation in parallel to unlock B2B.

## Provider outage runbook

Every LLM-backed route (`agent`, `brief`, `vision`, `passport-fit`, the stock verdict) resolves a model through `lib/agent/models.ts`. If no candidate answers, those routes return 503 and on-device measurement keeps working.

1. Check the logs for `"reason":"no_model_available"`; a `402 insufficient_funds` from the AI Gateway means the credit balance is empty. Production currently runs on Featherless (`FORMA_LLM_BASE_URL=https://api.featherless.ai/v1`, `FORMA_LLM_MODEL=Qwen/Qwen2.5-72B-Instruct`, `FORMA_LLM_VISION_MODEL=Qwen/Qwen3-VL-32B-Instruct`).
2. Point `FORMA_LLM_BASE_URL`, `FORMA_LLM_API_KEY` and `FORMA_LLM_MODEL` at any OpenAI-compatible provider. It is tried first and no code change is needed, only the env vars and a redeploy. Pick a tool-call-capable model — small ones (e.g. Qwen2-7B) parse briefs but never call `recommendProducts`; the 72B drives the loop but is flaky at grounding pick URLs (see [architecture § Model resolution](architecture.md#model-resolution)). Set `FORMA_LLM_VISION_MODEL` to a multimodal model for image calls.
3. Set `FORMA_DISABLE_GATEWAY=1` to stop probing a dead gateway.
4. A total failure is re-probed after 60 s, so recovery does not need a restart.
