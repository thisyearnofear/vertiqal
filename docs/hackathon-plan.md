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
- **P1 built, awaiting key**: `lib/agent/channel3.ts` client; catalog offers merged into the gear agent's `searchProducts`; `find_products` MCP tool; `agent-shop-mcp` shops the catalog before ordering. Needs `CHANNEL3_API_KEY` (free at trychannel3.com → Developers) in `.env.local` to go live.
- **P2 partial**: `/lab` Fit Lab dashboard live — AG Grid 36.2 (pinned; 36.3 is <7 days old) over `/api/lab`, which joins PayPal transactions (`lib/paypal/activity.ts`) with recorded fit outcomes (`lib/outcome/read.ts`, Redis `vq:outcomes` hash). Verified in headless Chromium: both grids render, no console errors. `docs/openapi.yaml` specs the agent/commerce surface for APIMatic MCP generation once we have account access.

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
