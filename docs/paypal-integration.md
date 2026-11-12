# PayPal integration plan — core, not bolted-on

**Status**: steps 1–6 landed — `lib/paypal/toolkit.ts` wraps the toolkit singleton for orders/refunds; `lib/paypal/subscription.ts` runs Pro subscriptions on **direct REST** (`orders.ts`'s client) because the toolkit's `paypalRun` silently refused the billing-plans/subscription actions; the tier claim in the brief cookie is HMAC-signed (`lib/fitting/tier-proof.ts`) so only the verified payment paths can mint Pro. The refund loop ships through `/api/paypal/refund` on fit-fail outcomes; `/api/paypal/shipment` registers tracking at capture and feeds the film-again nudge on the outcome page; `/api/paypal/activity` exposes recent transactions for the merchant view; `scripts/agent-shop-mcp.mjs` runs the two-server demo (vertiqal `/api/mcp` + `npx @paypal/mcp`) end-to-end against sandbox.

## The story

Vertiqal's pitch for the PayPal AI Hackathon is **agentic commerce in both directions**:

- **Outbound**: Forma measures you, verifies your size in stock, and closes the transaction it used to leave open — via `create_order` the agent itself can call.
- **Inbound**: your signed Fit Passport is consumable by any agent — `scripts/agent-shop.mjs` walks the whole loop: read passport → judge fit → prepare PayPal order. Consent always stays with the shopper; the server verifies `COMPLETED` before anything counts as paid.
- **Returns — the punchline**: footwear is the most-returned category and fit is our product. When fit fails, the same agent unwinds the purchase (`create_refund`) and re-opens the fitting.

## What the toolkit gives us (grounded in the official README)

- `PayPalAgentToolkit` (ai-sdk) → `getTools()` returns AI-SDK `Tool` objects — same shape as `gearTools`.
- Scoped permissions via `configuration.actions` — whitelist exactly what the agent may call.
- Actions: `orders.{create,get,pay}`, `create_refund`, `get_refund`, `disputes`, `shipment_tracking`, `products` catalog, `subscriptionPlans` + `create_subscription`/`cancel_subscription`, `list_transactions`, `get_merchant_insights`.
- `PayPalWorkflows.generateOrder(llm, transactionInfo, merchantInfo)` — LLM-driven order construction from natural-language transaction detail.
- `@paypal/mcp` — a ready MCP server (`npx @paypal/mcp --tools=all`) usable alongside vertiqal's own `/api/mcp`.

## Plan (ordered)

1. **`lib/paypal/toolkit.ts`** — singleton `PayPalAgentToolkit` from `PAYPAL_CLIENT_ID`/`SECRET`, `context.sandbox = PAYPAL_ENV !== 'live'`, `configuration.actions` whitelisting only what we use: `orders.{create,get}`, `createRefund`, `subscriptionPlans`, `shipment`, `products`. `getPayPalTools(scope)` returns the filtered `Tool` map.
2. **Gear agent calls PayPal's own tools** — replace the hand-written `prepareCheckout` with `toolkit.getTools()` filtered to `orders.create`, spread into `gearTools`. Gated by the same instructions + `GEAR_TOOL_NAMES`; tool result (`orderId`, approve link) surfaces in the decision panel. The claim "built with the PayPal Agent Toolkit" becomes true in code.
3. **Pro as a real subscription** — ✅ landed via direct REST (`/v1/catalogs/products` + `/v1/billing/plans` once, pinned by `PAYPAL_PRO_PLAN_ID`) → `/v1/billing/subscriptions` → approve link → `/api/paypal/subscription/status` verifies `ACTIVE` server-side → `tier: 'pro'` + signed `tierProof` in the brief cookie. Only those verified routes mint Pro. `/api/paypal/activity` and `/api/lab` return amount, status, date and items, never the payer's name or email.
4. **Return/refund loop** — on "they didn't fit" from the existing `OutcomeForm`, the agent calls `create_refund` on the captured order and re-opens the fitting. The agent that fitted you also unwinds you.
5. **Shipment tracking → retention** — `create_shipment_tracking` on purchase → delivery status feeds the film-again reminder ("shoes arrived? re-measure").
6. **`agent-shop --mcp`** — one MCP client connected to two servers: vertiqal `/api/mcp` (`get_fit_passport`, `check_fit`) and `npx @paypal/mcp`. One run = read passport → judge fit → create PayPal order. Two vendors' agentic surfaces interoperating — the headline demo.

## Boundaries (consistent with the product's honesty rules)

- The agent never spends without an explicit approve step — PayPal's popup is the consent.
- Server verifies `COMPLETED` before any state flips; Pro is checked against the exact price, purchases just need the verdict.
- Tool whitelist is the permission boundary: no `delete`, no `cancel_subscription` for shoppers, nothing off-action.
- `tier` rides the brief cookie and is HMAC-signed. Only the verified PayPal routes can mint Pro.

## Env

`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_ENV=sandbox` (hackathon runs sandbox), `PAYPAL_PRO_PLAN_ID` (optional — auto-created and reused when unset). Without them `/upgrade` says checkout is not configured, and the in-panel PayPal button stays hidden.
