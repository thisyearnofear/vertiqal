# Forma V2 — hackathon-winning cut (from first principles)

## First principles

Judges score: PayPal centrality, technical implementation, agentic commerce both ways,
innovation, design, presentation. Social needs: hook in 2s, sound-off, human, 9:16.
TV needs: 30s, clearances, one idea, brand recall. V1 failed all three because it was
one 114s advert trying to be everything.

V2 rule: **every scene must show working product, no apology on screen.**
If a disclaimer dominates the frame, the scene is cut until the product earns it.

## What we fixed in product before re-recording (do not film until these are live)

1. **Retailer allowlist** (`lib/agent/domains.ts`): added laced.com, endclothing.com,
   asos.com, johnlewis.com, size.co.uk, schuh.co.uk, footlocker.co.uk, office.co.uk,
   soletrader.co.uk. Before: Channel3/catalog picks 403'd stock-check as
   "not an approved retailer" → on-camera "AVAILABILITY UNCERTAIN". Now picks and
   stock-check share the same allowlist.
2. **Instant ledger** (`lib/captures/` + `/api/lab` + `/api/paypal/capture`):
   verified captures are recorded at capture time and lead the lab feed.
   Before: lab/till looked empty for minutes–hour while PayPal sandbox index lagged.
   Now: capture → lab row in same session, filmable.
3. **Depth budgets** (`lib/agent/depth.ts`): quick 1→3, considered 2→3, deep 2→4 searches.
   Before: demo fitting on considered could not reliably get 3 distinct models
   (one-search-per-model instruction vs 2-search budget = HALT/reject loop).
   Now: demo path can actually shortlist 3 distinct shoes on camera.

Verified: `pnpm typecheck` clean, `pnpm test:fitting` 78/78, `pnpm lint` clean,
`smoke.mjs` 8/8 against localhost.

## V2 scene spine (90s hackathon master — all filmable now)

| # | Sec | What we show (working product only) | Why it wins |
|---|-----|--------------------------------------|-------------|
| 0 | 0–3 | Hook: real runner's feet, phone filming, "Your shoes are guessing." Burned caption. | Relatability + size of problem. No CRT, no mono tiny text. |
| 1 | 3–12 | Problem size card: "41M runners · 70% in wrong shoes · footwear #1 returned category." One stat per card, 9:16-safe. | Opportunity. Cuttable for social/TV. |
| 2 | 12–25 | Measure: side-on clip → pose overlay → 3 metrics lock (cadence/overstride/knee). No "ILLUSTRATION" dominating frame; move disclaimer to 10px footer. | Passion: movement, not measurements. |
| 3 | 25–35 | Brief: 3 chip taps (size/budget/surface). Real UI, no 2-min raw. | Pacing: 10s, not 30s. |
| 4 | 35–55 | Agent works: "Forma is reading" tray fills with REAL pages (Brooks/Ghost etc.), Channel3 offers merge, community quotes. 1.5x speed, no HALT frame — cut before error, show rescue working. | Technical implementation. |
| 5 | 55–68 | Showroom: 3 distinct picks, allowed retailers only, real photos, craft + rider note each. Pick travels shortlist→decision (View Transition, re-capture in Chrome+QuickTime, not Ken Burns). | Motion design moment. |
| 6 | 68–80 | Decision + stock: size check runs LIVE (allowed domain → in_stock verdict + screenshot receipt + price). No "unsure" on hero pick. Film the receipt expand. | Honest verification that actually verifies. |
| 7 | 80–90 | PayPal: order created → approve → **verified capture response on screen** → instant lab row lands (no index wait). Show captureId short. | PayPal protagonist, not handoff implication. |
| 8 | 90–100 | Agent-to-agent: shopper-agent terminal re-recorded with readable font (JetBrains Mono 16+, 80-col), `check_fit 70/100 workable` + staged order id visible. No black frames. | Agentic commerce both ways. |
| 9 | 100–108 | Refund beat (new — the punchline): fit-fail → `create_refund` → REFUNDED on screen. One line: "The agent that fitted you unwinds you." | Impact + memorability. Currently missing from all cuts. |
| 10 | 108–115 | End card 5s hold: FORMA wordmark + vertiqal URL + "Agents sell. Agents buy. PayPal settles." + QR to live demo. One name, one URL. | Brand recall. |

Total 115s. Every beat cuttable: 0–12 = social hook, 68–90 = 22s PayPal TV skeleton, 90–100 = refund sting.

## Recording checklist (mercenary bar)

- [ ] Demo fitting on `considered` yields 3 distinct allowed-domain picks 3/3 runs (no HALT, no stray-URL reject). Log `agent_run` to prove.
- [ ] Hero pick stock-check returns `in_stock` live with screenshot + finalUrl on allowed domain. No 403, no "template, not verified" on hero.
- [ ] Till: create → approve → capture returns COMPLETED + captureId; `/api/lab` shows instant row in <5s (capturesAvailable true).
- [ ] Refund: `/api/paypal/refund` on that capture returns REFUNDED; film it.
- [ ] Shopper-agent: `node scripts/shopper-agent.mjs --base https://vertiqal.vercel.app` stages real sandbox order; terminal font ≥16px, no empty frames, order id legible at 720p.
- [ ] No frame has a disclaimer as the largest text. Footers ≤10px, ≤1 line.
- [ ] All audio: VO per-beat files regenerable, music bed ducked, burned-in captions (sound-off watchable), loudness -16 LUFS for web, -23 LUFS stem for broadcast.
- [ ] Exports: `forma-v2-master.mp4` (16:9, 115s), `forma-v2-vertical.mp4` (9:16, 35s hook+showroom+till), `forma-v2-tv30.mp4` (30s: problem→measure→PayPal→end card).

## What to delete from V1

- Ken Burns stills as primary evidence (use only as B-roll under live motion).
- 2-min brief raw, 167s agent raw with HALT tail, PayPal login stall, black terminal gap.
- "template, not verified" as hero copy (keep as footer receipt, never as verdict).
- Dual branding (pick FORMA, relegate vertiqal to URL only).
