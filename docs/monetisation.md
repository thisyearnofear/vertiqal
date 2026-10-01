# Monetisation and free-stage cost controls

Status: **plan, not implemented.** As of 2026-10-01 vertiqal has no revenue path: the Buy button is a plain retailer link, there is no paywall or pricing, and the Fit Passport REST/MCP endpoints are free. Every fitting costs money; nothing earns it.

## Where cost comes from today

| Surface | Paid calls | Current guard |
| --- | --- | --- |
| `/api/agent` (gear agent) | Grok 4.7 multi-step tool loop + Tavily searches (more at Deep: research, athletes) | None server-side. Measurement/brief gating is client-only; the route accepts arbitrary `messages` with no size cap. |
| `/api/stock-check` | Solari browser session + Grok judge | 6 checks / 10 min per client key, **in-memory per serverless instance** |
| `/api/tryon` | FLUX Kontext Pro image generation | None |
| `/api/vision`, `/api/brief` | Grok vision / text | None |
| `/api/voice` | Grok TTS per spoken line | None (240-char cap) |
| `/api/pose/vlmrun` | VLM Run keypoint refinement | None beyond key presence |
| `/api/wassist/webhook` | Grok reply agent (≤3 steps, may search) per inbound WhatsApp message | Webhook token |
| `/api/wassist/checkin` | Daily cron, one message per eligible shopper | `CRON_SECRET` |
| `/api/mcp`, `/api/passport/*/fit` | Fit checks (no model calls) | Signed tokens |

On-device measurement (MediaPipe) and the example walkthrough cost nothing per visit beyond CDN bandwidth.

## Free stage: goals

The free stage exists to learn two things: **how people use it** (funnel drop-off, which extras they use) and **how good the build is** (are picks and measurements trusted). Cost controls should therefore be generous for a real shopper doing one or two fittings, tight for abuse, and should degrade gracefully rather than break the on-device experience.

## Free stage: cost controls (proposed, in order)

1. **Hard caps at each provider (no code).** Treat these as the backstop that bounds the worst case regardless of bugs:
   - AI Gateway: use prepaid credits with auto top-up off (or a team budget alert) so a runaway loop stops at the balance.
   - Tavily, Solari, VLM Run, Wassist: set the plan's monthly credit or spend limit and an alert at ~50% and ~80%.
   - Vercel: Spend Management on the project, and Firewall rate-limit rules on `/api/*` (dashboard-configured, applies before functions run).
2. **Close the open endpoint.** `/api/agent` should validate its input server-side: at most one user brief message of bounded size, a known depth, and an explicit `stopWhen` step cap on `gearAgent`. Without this, the client-side gating is advisory and anyone can drive Grok and Tavily directly.
   - **Implemented:** the route parses `{ brief, prefs }` against `agentRequestSchema` (bounded brief, known depth, capped notes), rejects bodies over 32 KB with 413, builds the prompt itself and ignores client `messages`; `gearAgent` has `stopWhen: stepCountIs(10)`.
3. **Durable, shared limits.** The in-memory limiter resets per instance, so it does not bound spend at scale. Move counters to a shared store (Upstash Redis via the Vercel Marketplace is the lightest option) and apply two kinds of limit per route:
   - **Per visitor** (IP + a signed anonymous cookie): starting points — 3 agent runs/day, 1 Deep run/day, 6 stock checks/day, 2 try-ons/day, 5 brief parses/day.
   - **Global daily budget per route** (a kill switch): when a route's daily count is reached it returns `503 { reason: 'capacity' }`, and the UI says "Forma is at capacity today — your measurement still works" while keeping on-device analysis available.
   Tune the numbers from the funnel data; they are starting guesses, not measured.
4. **Instant switches for expensive extras.** Feature flags (Edge Config, so no redeploy is needed) for try-on, Deep, stock checks, voice and hosted pose. Flip one off if a provider bill spikes.
5. **Spend less per fitting without hurting quality.**
   - Cache shortlists for identical brief + prefs for a few hours (Tavily is the main repeat cost).
   - Pre-render Forma's templated mood lines to static audio per voice, so TTS is only called for dynamic text.
   - Keep Considered as the default depth (Deep only on request, capped as above).
6. **Measure cost per fitting.** Log usage per agent run (steps, tool calls, input/output tokens from the AI SDK `onFinish` usage) alongside the funnel. Add `limit_hit` and pick feedback events. This gives the two numbers the revenue decision needs: cost per completed fitting and fittings → `buy_clicked` conversion.
   - **Implemented:** `lib/cost-log.ts` emits one JSON line per event to function logs — `agent_run` (steps, per-tool counts, tokens, Tavily call estimate, finish reason, outcome) plus `paid_call` on every paid route. `limit_hit` fires on stock-check 429s and `shortlist_feedback` collects one-tap verdicts on the picks.

## Learning how good the build is

- Funnel events already cover sample → capture → lock → shopping → pick → buy → WhatsApp.
- Add a one-tap "Does this shortlist look right?" (yes / not really + reason) on the picks, and record the 12-day check-in reply as a satisfaction signal.
- Real-footage accuracy validation (see *Motion validation* in the README) remains the gate for any claim about measurement quality.

## Revenue options, ranked

1. **Affiliate commission on Buy (first).** Most UK running and climbing retailers are on affiliate networks (e.g. Awin, Rakuten). Rules:
   - Apply the affiliate wrapper **at click time, after ranking**, so commission can never influence which shoes are recommended — the same principle the agent already applies to sponsored athletes.
   - Visible disclosure near Buy (ASA/CMA): "We may earn a commission. It never changes the ranking."
   - Tag `buy_clicked` with whether the link was affiliated.
   - When going commercial, prefer network product feeds (price/stock) over stealth-browser checks on partner retailers, which may conflict with their terms.
2. **B2B fit data: Fit Passport / API.** Retailers pay to reduce returns via per-check API pricing or a "check against my fit" widget. Blocked on accuracy validation — the measurements are still experimental.
3. **Licensing to running shops and climbing gyms.** In-store movement analyser, with staff interpreting results; less exposed to accuracy risk.
4. **Consumer subscription.** Weak alone given low purchase frequency; possible later around progress tracking and the WhatsApp coach.
5. **Paid brand placement.** Rejected: it contradicts the receipted, independent-recommendation premise.

## Next steps

1. Provider caps and alerts (step 1 above) — before any promotion.
2. Server-side `/api/agent` validation and step cap (step 2).
3. Shared limits, global budgets and the capacity message (step 3), plus flags (step 4).
4. Cost-per-fitting logging and pick feedback (step 6); review after a few weeks of funnel data.
5. Affiliate wrapping and disclosure once network accounts exist; run real-footage validation in parallel to unlock B2B.
