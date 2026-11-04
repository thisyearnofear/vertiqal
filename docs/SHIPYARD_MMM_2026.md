# Shipyard × Make Me Money 2026 — vertiqal Plan

**Event:** Shipyard "Make Me Money" — 2 Nov → 18 Nov 6pm (freeze), Demo Day 21 Nov (London). £100 team budget to make real money from real strangers. Stripe sales count automatically via `/stripe connect`; affiliate/other sales self-reported + audited.
**Live URL:** https://vertiqal.vercel.app
**Repo:** https://github.com/thisyearnofear/vertiqal
**Budget (~£100):** TikTok/Instagram Reels ads (£80) + Tavily trend research (£20); product infra already on Vercel.

## Status check (straight from `docs/monetisation.md`)

> "Status: **plan, not implemented.** As of 2026-10-01 vertiqal has no revenue path: the Buy button is a plain retailer link, there is no paywall or pricing, and the Fit Passport REST/MCP endpoints are free."

Key constraint: **"Both stop before checkout"** is a deliberate product guardrail, not a bug. For Shipyard we have to *opt-in* to converting the purchase step.

## Why vertiqal can still work (and how hard it is)

`docs/monetisation.md` ranks revenue options 1–5:

1. **Affiliate commission on Buy** — ✅ already coded (`lib/agent/affiliate.ts` + `wrapAffiliateUrl` + disclosure copy + `buy_clicked{affiliated:true}`), just not switched on.
2. B2B fit-data API — ❌ blocked on accuracy validation.
3. Licensing to shops — slow.
4. Consumer subscription — ❌ "weak alone given low purchase frequency; possible later".
5. Paid brand placement — ❌ "rejected: it contradicts the … independent-recommendation premise."

So Shipyard = **affiliate commission + a Stripe-billed digital upsell**. No B2B, no brand placement, no subscription.

## The Shipyard SKU: affiliate × £29 "Size Guaranteed" report

**Hook:** A shoe-buyer shares their vertiqal fit passport / roast card ("I'm a size 9 runner and these keep coming up"). They click **Buy → affiliate link** (Awin: Foot Locker, ASOS, Zalando, Ellis Brigham) or buy the **£29 Size Guaranteed** report via Stripe Checkout. Both convert strangers into paying users.

**How the build lands (Build 5–13 Nov):**

| Day | Work | Cursor |
|---|---|---|
| 5 Nov | @Organiser pre-approval ping — footwear affiliate is a grey area on "incentivised buying" | yes |
| 6 Nov | Add `price_fit_guarantee_q4` to Stripe dashboard | yes |
| 7 Nov | `src/app/pro/checkout-fit.tsx` — £29 report Checkout Session (reuse databard's `route.ts` pattern) + webhook `checkout.session.completed` → mark `guarantee_purchased` | yes |
| 8 Nov | Flip the guardrail: add a "Shop via our link (we may earn a commission)" CTA so `buy_clicked` routes through `wrapAffiliateUrl`; keep the ASA/CMA disclosure verbatim | yes |
| 9 Nov | Join Awin + add `NEXT_PUBLIC_AWIN_AFFILIATE_ID`/`MERCHANTS` env; wire `buy_clicked{affiliated:true}` to the dashboard | yes |
| 10 Nov | Tavily trend research (hot colorways/silhouettes this week) + 2–3 Reels creative assets (recorded Figure cost ≈ £0.31, CDN only) | yes |
| 11 Nov | TikTok/Instagram Reels ad set (£80) → vertiqal.roast + vertiqal.fit passports | yes |
| 12–13 Nov | End-to-end test: roast → Size Guaranteed Checkout → affiliate Buy | yes |

## Earn (5–18 Nov)

- `/spend` each ad creative / Awin fee / API call against the £100 budget; keep receipts.
- `/touch` every human step in the funnel (creative copy, audience tweak, approval).
- `/stripe connect` (read-only `rk_live_…`) — the **£29 report** counts automatically.
- Affiliate commission (2–8%/sale) is **self-reported**: export Awin performance CSV daily → post running total + proof to team channel before 6pm. Slower than Stripe auto-count; log a `/touch` and keep the export.
- Vercel Analytics `buy_clicked` + `shortlist_feedback` already fire — use them as the conversion proof.

## Audit prep (evidence pack due 19 Nov)

- Git repo shows: `affiliate.ts` wrap commit, the Checkout Session commit, the disclosure-copy commit.
- Agent/`buy_clicked` logs + the Awin export CSV + Stripe reconciliation.
- Receipts for every £ spent (£80 ads + any Awin network fee).

## Red lines — stayed away from the disqualified pile

| Disallowed for Shipyard | How vertiqal stays on the right side |
|---|---|
| launching memecoins/tokens for resale | no tokens; affiliate links to real retailers only |
| fake sales / round-tripping | real strangers; affiliate network tracks distinct referrers |
| regulated goods | no weapons/alcohol/drugs; footwear only |
| money from people you know | ad traffic = strangers from TikTok, not friends |

## Hard parts vs. databard (be honest)

| | databard | vertiqal |
|---|---|---|
| Auto-counted Stripe | ✅ live Checkout; one new price | ❌ none; add price + route (product change to a guardrail) |
| Viral hook | ✅ `/roath` — strangers share themselves | ⚠️ funnel exists, no auto-share; `buy_clicked` is currently a dead-end |
| Category risk | ✅ data audit (safe) | ⚠️ footwear affiliate → "incentivised buying" grey area → @Organiser check |
| Revenue mode | B2B £99/£40 (fast close) | Affiliate % (depends on strangers buying shoes) + £29 upsell |
| Funnel ownership | ✅ you bring + bill | ⚠️ last click owned by the retailer's affiliate cookie |

**Takeaway:** vertiqal is viable but slower and audit-riskier than databard. Use it only if databard hits the @Organiser red line on market-data adjacency.
