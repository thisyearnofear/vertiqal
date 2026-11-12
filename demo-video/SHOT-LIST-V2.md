# Forma V2 — Shot list + VO timing sheet (QuickTime session)

Target: `forma-v2-master.mp4` 16:9, 115s. Record at 2560×1440 (or 1920×1080
minimum), Chrome, fresh profile, camera/mic granted. Serve the **pushed**
build: `http://localhost:3002` (prod mode, commit `5bfc6e4`). Restarting the
server resets the demo-fitting quota (in-process counters when no Redis is
configured) — restart before the first agent take and you get a fresh budget.

Font rule: terminal shots ≥16px (JetBrains Mono, 80-col). No frame may have a
disclaimer as its largest text. Captions burned in (sound-off watchable).

## VO timing (115s master — read at ~140wpm, pause at the | marks)

| # | TC | VO line | On screen |
|---|----|---------|-----------|
| 0 | 0–3 | "Your shoes are guessing." | Runner's feet, phone filming. Burned caption, 2s hook. |
| 1 | 3–12 | "Forty-one million runners. Seventy percent in the wrong shoes. Footwear is the most returned thing we buy." | One stat per card, 9:16-safe. |
| 2 | 12–25 | "Forma watches how you move. Forty-five seconds, one camera, nothing leaves your browser." | Pose overlay → 3 metrics lock (cadence / overstride / knee). |
| 3 | 25–35 | "Tell it your size, your budget, where you run." | 3 chip taps. 10s, no raw footage. |
| 4 | 35–55 | "Then the agent goes shopping — real pages, real stockists, runners who've been there." | Reading tray fills (real domains), Channel3 offers, community quotes. 1.5x. Cut before any HALT tail; the rescue is the story, not the error. |
| 5 | 55–68 | "Three shoes. In your size. From shops that actually sell them." | Showroom, 3 distinct picks, craft + rider note. Pick-travel shortlist→decision (View Transition). |
| 6 | 68–80 | "And it checks the shelf before you pay." | Stock check LIVE on hero pick: in_stock verdict + receipt expand + price. |
| 7 | 80–90 | "PayPal settles it — order, approval, capture. Verified, and in the ledger before the page settles." | Create → approve → COMPLETED + captureId short → /lab row lands <5s. |
| 8 | 90–100 | "Any agent can shop this way. Ours read the fit passport, judged the shoe, and staged the order." | shopper-agent terminal, `check_fit 92/100 great-fit`, sandbox order `6E631964L2805320A` legible (shot 2026-11-12, real staged order). |
| 9 | 100–108 | "And the agent that fitted you unwinds you. Wrong pair? Refunded." | `create_refund` → REFUNDED on screen. The punchline. |
| 10 | 108–115 | "Forma. Agents sell. Agents buy. PayPal settles." | End card 5s hold: FORMA + vertiqal URL + QR. |

Cuts: 0–12 = social hook (9:16 crop). 68–90 = 22s PayPal TV skeleton.
90–108 = refund sting. TV30: beats 1→2→7→10.

## Shoot order (dependencies matter)

1. **Statics** (no agent, no quota): landing, brief chips, empty till, empty lab.
   Film the empties — empty→row-lands is the story of beat 7.
2. **Agent run** (restart :3002 first for fresh quota): beats 2–6 in one session
   if possible (RUN → demo → tray → 3 picks → travel → receipt). Budget 2–3
   takes; runs complete ~45s, one in three may `tool-calls` fail — cut, retry.
3. **Till + capture** (sandbox, human PayPal approval — cannot be automated):
   create → approve → COMPLETED + captureId. Film the capture response.
4. **Lab grid**: same session, row must land <5s (instant ledger, no index wait).
5. **Refund** on that capture: REFUNDED on screen (beat 9).
6. **shopper-agent** terminal against prod: readable font, order id legible.
7. **End card** + QR to live demo.

## Cut list (from V1 — do not re-shoot)

Ken Burns stills as evidence, 2-min brief raw, 167s agent raw with HALT tail,
PayPal login stall, black terminal gap, "template, not verified" as hero copy,
dual FORMA/vertiqal branding in one frame.

## Verification before you call it wrapped

- [x] Demo yields 3 distinct allowed-domain picks (no HALT in the take — take 4, 2026-11-12).
- [ ] Hero stock-check `in_stock` live, receipt + price visible.
- [ ] Capture COMPLETED + captureId; lab row <5s.
- [ ] Refund REFUNDED on that capture.
- [x] Shopper-agent order id legible at 720p (`6E631964L2805320A`, 92/100 great-fit).

## Shoot log (ego timelapse + ffmpeg assembly — renders stay local, never committed)

- 2026-11-12: beats 4–5 filmed (35-frame agent-run timelapse, decision travel, size check).
  Honest receipts kept: LD "no size options", Sportsshoes HTTP 403, Outside "Vapour≠Vapor"
  mismatch — the last one exposed the stock-gate recall bug, fixed same day
  (`nearToken` + space-joined headings) and proven live: re-check returned HTTP 200
  with the page correctly identified, verdict genuinely `out_of_stock`.
- 2026-11-12: beat 8 filmed — full shopper-agent run, terminal scroll-rendered at
  1080p, real sandbox order id. Rough-cut `vq-rough-v2.mp4` (44s, 6 scenes, music
  bed) assembled on disk. Still open: hero `in_stock`, beats 7/9 (need human PayPal
  approval), VO record.
- [ ] Loudness: -16 LUFS web, -23 LUFS broadcast stem.
- [ ] Exports: master 115s 16:9, vertical 35s 9:16, TV 30s.
