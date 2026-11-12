# PayPal AI Hackathon — plan of action

Deadline: **12 Nov 2026 @ 8:00pm GMT** (~5 days). Judging: technical implementation, design, impact, innovation, presentation. Prizes: $12k/8k/5k overall + $5k each for Most Creative / Impactful / Demo Delivery / PayPal+AI / Agentic Commerce, plus sponsor ladders (AG Grid, APIMatic, Bryntum, Channel3, Render, KERNEL, Postman, Zapier, Astropods, Elastic).

## Where we start

PayPal is already partially integrated: orders + refunds via direct REST (`lib/paypal/orders.ts`), Pro subscriptions via REST (`lib/paypal/subscription.ts`), the Agent Toolkit whitelisted in `lib/paypal/toolkit.ts`, `/api/mcp`, and `scripts/agent-shop.mjs` (passport → fit verdict → order). See `docs/paypal-integration.md` for the architecture and boundaries (consent stays with the shopper, server verifies COMPLETED, tool whitelist is the permission boundary).

## Sponsor research summary

| Sponsor | What it is | Fit | Prize |
|---|---|---|---|
| PayPal | Orders, subscriptions, refunds, shipment tracking, disputes, insights, Agent Toolkit, `@paypal/mcp` | Core | $12k/8k/5k + named awards |
| Channel3 | Real-time product catalog API built for agents — search, variants, merchant offers, outbound purchase links | Stock-check/gear-picks upgrade; agent-native | $1,500 |
| APIMatic | Context Plugins / MCP-server generation for accurate agent API context | MCP server for our API or PayPal's surface | $1k ×3 + sub |
| AG Grid | React data grid | "Fit Lab" ops dashboard; Pro movement history | $5k/2k/1k×3 |
| Render | Hosting, free tier | Hosted demo URL for judges | credits |
| KERNEL | Cloud browser infra for agents | Stock-check browsing at scale | tool credit |
| Zapier | MCP → 9,000 apps | Post-purchase follow-ups | listed tool |
| Astropods | Agent hosting/observability | Host the fitting agent | listed tool |
| Bryntum | Gantt/scheduler/Kanban | Weak fit — stretch only | $1k ×3 |
| Postman / Elastic | API client / search | Publish collection; low signal | listed tools |

## Status (2026-11-07)

- **P0 done**: shipment tracking route + checkout wiring + outcome-page delivery nudge; `/api/paypal/activity` (transactions); `agent-shop-mcp.mjs` verified end-to-end (env autoload, token minting, correct `@paypal/mcp` schema, catalog step). Fixed a real bug: `check_fit` failed on openai-compatible providers without structured-output support — now uses `structuredOutputs: false` + explicit JSON contract.
- **P1 live (2026-11-11)**: `CHANNEL3_API_KEY` configured in `.env.local` and Vercel (Production + Preview — needs a redeploy to take effect). Fixed a real bug on first live call: the API returns `products`, the client read `data`, so catalog results were silently empty. `node scripts/channel3-check.mjs "query"` verifies end-to-end — real UK offers (asos, johnlewis, jdsports) with per-merchant prices and commission rates. Catalog offers merge into `searchProducts`; `find_products` MCP tool exposes them to external agents; `agent-shop-mcp` prices orders from real offers.
- **P2 done (2026-11-11)**: APIMatic PayPal Context Plugin installed (`npx context-plugins install paypal`) into Cursor + VS Code — SDK-grounded PayPal Orders/Billing context for the coding agent, documented in README "Built with". `/lab` Fit Lab dashboard live — AG Grid 36.2 over `/api/lab`, joining PayPal transactions with recorded fit outcomes. `docs/openapi.yaml` specs the agent/commerce surface.
- **PayPal protagonist (2026-11-11)**: **The till** section on the landing page (`components/commerce/till-section.tsx`) — one-click sandbox demo checkout (Orders v2 create → PayPal approve → server-verified capture → shipment tracking) beside a live 30-day transaction ledger. Judges touch PayPal in three clicks without a fitting; the README leads with agentic commerce.

## P0 — deepen the PayPal core

1. **Refund loop**: on "they didn't fit" (`OutcomeForm`), agent calls `create_refund` on the captured order and re-opens the fitting. The agent that fitted you also unwinds you — the pitch's punchline, in code.
2. **Shipment tracking → retention**: `create_shipment_tracking` on purchase; delivery status feeds the film-again reminder ("shoes arrived? re-measure").
3. **Two-server MCP demo**: `scripts/agent-shop.mjs --mcp` connected to vertiqal `/api/mcp` AND `npx @paypal/mcp` in one run — passport → fit verdict → PayPal order. Demo-video centerpiece; the Agentic Commerce claim.
4. **One more surface**: `list_transactions`/`get_merchant_insights` feeding a merchant view, or fit-related disputes surfacing through the toolkit whitelist.

## P1 — Channel3 ($1.5k, best sponsor fit)

5. Channel3 product search → variants → merchant offers → hand the chosen offer to the PayPal order flow. Upgrades "template, not verified" honesty into live catalog data and gives the outbound agent a real catalog to buy from.

## P2 — APIMatic + AG Grid

6. APIMatic Context Plugin / generated MCP server over vertiqal's API (or PayPal's) — also cleanly answers "which AI tools were used".
7. AG Grid "Fit Lab" view: orders × fit verdicts × refund outcomes, sortable/filterable. Doubles as the Pro movement-history table if time is short. Community AG Grid React is free; keep it out of the initial bundle.

## P3 — submission hygiene

8. Deploy to Render (free tier) → hosted demo URL; verify a judge can run from a clean clone.
9. LICENSE file at repo root (required, visible in About).
10. <3 min demo video: measure → fit passport → agent-shop MCP run → PayPal sandbox order → fit-fail refund. Screen recording with captions, public YouTube.

## Stretch (only if P0–P3 land early)

- Zapier MCP post-purchase flow (fit report → Sheets/Email/Notion)
- Postman collection publish
- KERNEL for stock-check browsing
- Astropods-hosted agent
- Bryntum — skip unless a scheduling surface appears naturally

## Judging-criteria mapping

- **Technological implementation**: P0 + P1
- **Impact**: returns story + honest live stock data
- **Innovation**: two-sided agentic commerce — agents buy *and* agents consume the Fit Passport
- **Presentation**: the MCP two-server run on video
- **Design**: existing product surface carries it; AG Grid view must feel native, not bolted on

## Devpost draft (2026-11-11)

**Tagline:** An agent that measures how you move, recommends your shoe, transacts through PayPal — and unwinds itself if the fit fails.

**What it does.** Forma is a gait lab in the browser. Film a short clip; on-device pose analysis builds a movement profile; a brief confirms size, budget and goal; a gear agent researches candidates against your metrics, live rider reports and a real product catalog (Channel3), then lands a three-pick showroom — each pick with the shoe's story, evidence and a stock-verified size check. Choose one and the agent opens a PayPal order; consent stays in PayPal's window, the server captures and verifies COMPLETED before anything counts as paid. If the shoes fail the fit, the same agent refunds the capture and reopens the fitting. A signed Fit Passport carries your movement profile so *other* agents can check a shoe against it over REST or MCP — agentic commerce in both directions: agents that buy for you, and agents that can sell to you.

**Judge path (3 clicks).** Landing page → *The till* → open a real sandbox PayPal order, approve, watch the verified capture land in the live ledger. No camera, no fitting required. `/lab` is the merchant side: an AG Grid view joining PayPal transactions to fit outcomes.

**Known sandbox quirk.** PayPal's sandbox checkout page occasionally stalls on "Continue to Review Order" — the approval still registers server-side. If the UI hangs, note the order id and `POST /api/paypal/capture` with `{ "orderId": "<id>", "purpose": "purchase" }`; the ledger (and `/lab`) reflects the capture once PayPal's transaction-search index catches up (minutes to ~an hour in sandbox).

**PayPal technologies.** Orders v2 create/approve/capture (server-verified), refunds on fit-failure, shipment tracking, Billing Plans for Forma Pro, transaction search powering `/lab`, and `@paypal/mcp` as the second server in the two-MCP agent demo (`pnpm agent-shop:mcp`).

**AI.** MediaPipe pose → movement metrics (on-device, video never leaves the browser); Qwen-72B gear agent (Featherless, AI Gateway fallback) with tool-gated depth layers — research, community, athletes — each pick citing a measurement; Grok vision for keyframes/sole-wear; on-device caption generation for share cards.

**Sponsors.** Channel3 (catalog + offers + product imagery powering the showroom and `find_products` MCP tool), AG Grid (`/lab`), APIMatic PayPal Context Plugin (SDK-accurate PayPal context while building).

**Honesty as design.** Stock checks show screenshot + observed-URL receipts labelled "template, not verified" where applicable; athlete picks disclose paid sponsorship; video never leaves the device; PayPal state flips only after server verification.

## Demo film status (2026-11-12)

Rough-cut `demo-video/vq-rough-v2.mp4` (44s, 6 scenes, music bed) assembled from ego-captured timelapses + a real shopper-agent run (92/100 great-fit, live sandbox order). Rendered video stays on disk and goes to YouTube when approved — never committed (`*.mp4/*.webm` gitignored; only the runtime example clip is tracked). Stock-gate recall fixes (near-match tokens, space-joined headings) landed and proven live. Still open: hero `in_stock` receipt, PayPal approve→capture→lab→refund (needs the owner's sandbox login), VO record, then master/vertical/TV30 exports.
