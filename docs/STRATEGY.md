# Strategy: the wedge and the economic loop

Written 2026-11-03. Market figures come from web-search snippets (Tavily), not from reading the full reports, and several sources disagree with each other by 2–5×. Treat every number below as an order of magnitude. Cost-per-fitting figures are **modelled on assumed prices and token counts**, not measured; the first real run replaces them (`pnpm cost:report`).

## The honest starting point

- 0 users, no revenue path switched on, and the LLM provider is currently unavailable.
- The pose measurement is unvalidated against real footage (see README, *Motion validation*).
- The evidence that gait analysis predicts the right shoe is weak. The best-supported criterion in the literature is the "comfort filter" (pick what feels most comfortable); studies of gait-based recommendation are mixed, with at least one reporting improved *perceived comfort* ([PMC12782347](https://pmc.ncbi.nlm.nih.gov/articles/PMC12782347), [PMC8959543](https://pmc.ncbi.nlm.nih.gov/articles/PMC8959543)). Read from search snippets only.

Implication: **do not sell "we measure your biomechanics and prescribe a shoe".** Sell what is verifiable and valuable regardless: the right *size*, in a *suitable type*, *verified in stock*, with receipts. The video measurement is the hook that makes the fitting feel personal; the size/stock/outcome loop is where the value and the data are.

## Market (order of magnitude)

| Fact | Figure | Source quality |
| --- | --- | --- |
| Global running shoes | $48–55B (one report says $19.5B) | Three reports, 2.8× spread |
| UK share of athletic footwear | ~4.4% | GMInsights |
| Online share of running shoe sales | ~30% | One report |
| Online footwear return rate | ~18%, fit is the main cause | Multiple retail-stats sites |
| Cost of a return to the retailer | 15–30% of the order value | Retail survey summaries |
| Global climbing shoes | $460M (Dataintelo) vs $2.48B (Insight Partners) | 5× spread, do not build on it |
| Climbing gyms | $3.2–3.8B, growing faster than shoes | Four reports agree broadly |
| Fit-tech vendor claim | Volumental: ~18% fewer returns, 20–30% more sales | **Vendor marketing**, unverified |

I am not computing a TAM from these; the inputs are too inconsistent. The number that matters is per purchase: a £130 shoe at 2.4–5% commission is £3–6.50 (Sports Direct pays 2.4%; On pays 2–20% with a 30-day cookie and 30-day validation; Janji 14%; Ellis Brigham and Zalando rates were not found).

## Competitors (five searches, not exhaustive)

- **In-store**: Runners Need gait analysis is free with a shoe purchase (£15 otherwise). For running, the incumbent alternative is nearly free and trusted.
- **Gait apps**: Ochy, RunForm AI. They sell form analysis, not purchase outcomes.
- **Retail fit-tech (B2B)**: Volumental, Fleet Feet Fit Engine. In-store scanners sold to retailers.
- **Phone foot scan**: Nike Fit (2019), Aetrex SizeRight. Size from foot shape.
- **Climbing**: nothing found that fits climbers to shoes, but five searches is absence of evidence, not proof.

## Where the wedge is

**Climbing shoes, UK, gym climbers buying their first or second pair.**

1. Wrong size is a sunk cost. Several brands refuse returns once a shoe has been climbed in (Evolv: not returnable; Butora: not returnable even after one move), so the fear of getting it wrong is higher than in running, where returns are routine.
2. Sizing is tribal and confusing: Reddit threads (r/climbingshoes, r/climbergirls) are full of "size up? down? by how much?" with contradictory answers.
3. The community is concentrated (gyms, subreddits, Instagram), so distribution is reachable without paid ads.
4. Running is the demo, not the wedge: the free in-store alternative and the weak gait-to-shoe evidence make it the harder market to win first.

Caveat I should not hide: for climbing, the pose video says little about *size*. The useful knowledge there is brand/model sizing relative to street size plus foot shape and style, and that comes from outcome data, not from the video.

## The core economic loop

Today the loop is: spend (LLM, search, browser) → user → maybe a click → maybe an untracked commission. That is not a loop.

The loop that can compound:

```
free fitting  →  verified-in-stock pick  →  tracked click-out  →  purchase
      ▲                                                              │
      │            size-by-model priors  ◀──  fit outcome  ◀─────────┘
      │                     │                (user feedback + Awin declined/partial-adjust)
      │                     ▼
      └──── better picks  →  proof: "orders we send are returned less"  →  retailers/brands pay per fit-verified order
```

Two things make this a loop and not a funnel:

1. **Outcome data.** Awin reports approved *and declined* transactions and carries a `clickref` field per click ([Awin transaction report](https://success.awin.com/s/article/Publisher-Transaction-Report)); a returned order may be partially adjusted ([why rejected](https://success.awin.com/s/article/Why-was-my-transaction-rejected)). With a random per-fitting `clickref`, the affiliate network becomes the instrument that measures whether Forma-referred purchases are returned less. That measurement is the only honest basis for the B2B pitch (an 18% industry return rate costing 15–30% of order value is the retailer's real pain).
2. **The follow-up that produced fit outcomes was deleted with Wassist** (the 12-day "how are they feeling" check-in). It needs a replacement that needs no accounts: a one-tap "how did they fit?" link tied to the Fit Passport URL the user already holds, stored in the KV store.

### Unit economics (modelled; verify with `pnpm cost:report`)

- Assumed cost of a fitting that reaches a size check: roughly £0.10–0.15 (LLM + ~6 searches + one browser check). This is cheap; **cost is not the problem.**
- Assumed revenue per purchase: £130 × 5% × (1 − 18% reversed) × 60% attributed ≈ £3.20.
- Break-even: about 4% of fittings must end in a tracked purchase just to cover marginal cost, with **zero** acquisition cost.
- Consequence: **affiliate income cannot fund paid acquisition.** An £80 TikTok budget is ~£80 of pure spend unless a click costs under a few pence. Growth must be organic until revenue per user rises. This is the real answer to "spend for spend's sake": the spend is small, but the revenue per user is also small, and only B2B per-order fees or a paid product raise it.

### Paying for the product directly

The untracked `SHIPYARD_MMM_2026.md` proposes a £29 "Size Guaranteed" report. A guarantee means underwriting returns: at an ~18% baseline return rate, refunding or replacing is a real liability, and the Awin commission on a £130 shoe does not cover it. If anything is sold to users, test a small fee for the *fitting* (£3–5, where the cost is pennies) before a guarantee, and only after the shortlists have proven trustworthy.

## Through two lenses

### Thiel: is there a monopoly here?

- **The secret.** Not yet. "Phone video → shoe" is not a secret and the science is soft. The candidate secret is *proprietary size-by-model outcome data* in a category where returns are impossible. It only exists if the loop above runs.
- **Start small.** UK gym climbers is a market one team can dominate. It is small; the climbing-shoe market estimates disagree 5×, so size it by counting gyms and members, not by reports.
- **Timing and distribution.** AI assistants increasingly recommend shoes (ASICS appears in ~83% of AI answers in one study, 5WPR, *AI Search Visibility for Running Shoes 2026*). The Fit Passport over MCP is a bet that assistants need a trusted fit source. That is a plausible long-term position but no assistant calls it today.
- **Risk to name:** if Awin data shows no return-rate improvement, the B2B story collapses and the business is a small affiliate site. Find that out early.

### Graham: did you make something people want?

- You have zero users. More features cannot answer that. **Do things that don't scale:** personally fit 20 climbers (r/climbingshoes, one London gym, a climbing club) over video call or in person. Watch them, ask what they would have bought otherwise, and track whether they buy and whether it fits.
- The question to answer in two weeks is not "does the agent work", it is "would five of them be upset if it vanished".
- Ramen-profitable here means each fitting earns more than it costs. At pennies of cost that is reachable with a few hundred tracked purchases a month, so the near-term target is organic users and a tracked-purchase rate, not revenue.
- Growth is the share loop that already exists (hero card, Fit Passport). Measure how many fittings come from a shared card.

## Staged plan with kill criteria

| Stage | Build / do | Pass if | Else |
| --- | --- | --- | --- |
| 0 | First real full run on a real clip; read the logs; `pnpm cost:report` | Three distinct, sensible, size-verified picks; modelled cost holds | Fix quality before any user |
| 1 | 20 hand-held climber fittings; join Awin; `clickref` on links | ≥8 of 20 say they would use it again; ≥25% click out | Change the product or the wedge |
| 2 | One-tap fit-outcome link + KV storage | ≥40% of buyers report an outcome | Fit data will not accumulate; rethink |
| 3 | 100+ tracked purchases | Commission per fitting ≥ cost per fitting; returns of Forma-referred orders measurably below ~18% | Do not pitch B2B on it |
| 4 | Pitch two UK climbing retailers per-order fit-verified pricing | A paid pilot | Remain an affiliate site |

## Not decided

- Whether to launch running at all before climbing is proven.
- Whether to add direct retailer deals (higher commission than the public Awin rates).
- Whether to charge users. Test it in Stage 1 with a real price, not a survey.
