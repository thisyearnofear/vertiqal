# Forma — demo video storyboard (~90s, advert-shaped)

Direction: product-first, movement-first. PayPal appears as the moment
intention becomes action — not as a feature list. Show, don't explain.
Music: understated pulse. Captions instead of voiceover keep it tight.

## Shot list

| # | Sec | Shot | Source | Caption overlay |
|---|-----|------|--------|-----------------|
| 1 | 0–4 | Cold open on the stage — pose rig drawing a runner | vq-01-landing | — |
| 2 | 4–10 | "The right shoe, in your size, checked in stock." + Forma dock | vq-01-landing | "What if your gait was the brief?" |
| 3 | 10–22 | Example fitting: pose tracking, measurements locking, archetype badge | vq-02-example | "An agent that watches how you move." |
| 4 | 22–30 | Brief sentence filling: goal → surface → size → budget → height | vq-05-brief (trim to chip clicks) | "You confirm the brief. It does the rest." |
| 5 | 30–44 | Agent searching: "Forma is reading" tray, tool steps, candidates | vq-06-agent (trim 0:05–0:40, cut before halt) | "Research. Community evidence. Real stock." |
| 6 | 44–56 | SHOWROOM: three picks, craft stories, field notes, photos | NEEDS: successful run | "Three shoes. Not thirty." |
| 7 | 56–62 | Pick travels from shortlist → decision panel (View Transition) | NEEDS: successful run | "Watch it think." |
| 8 | 62–70 | Decision panel: size check, stock verdict, evidence | NEEDS: successful run | "Your size. Verified in stock." |
| 9 | 70–80 | THE TILL: click → order created → PayPal approval | vq-04-till | "Then it does the thing most agents can't." |
| 10 | 80–86 | Ledger row lands + /lab merchant grid | vq-03-lab + fresh ledger | "Real money. Real receipts." |
| 11 | 86–98 | AGENT-TO-AGENT: terminal — second agent reads the Fit Passport over MCP, checks the shoe, stages a real PayPal order | shopper-agent.mp4 (17s) | "And your fit? Any agent can shop with it." |
| 12 | 98–104 | End card: Forma wordmark + "agents sell · agents buy · PayPal settles" | title card | "Built on PayPal." |

## Captured run (ego-browser, localhost — 12 Nov)

A full successful agent run was captured as stills (ego has no recorder;
use Ken Burns pans on the PNGs, they're 1438×723 / fullpage 4439px):

- `showroom.png` — the "sorted by you" spec panel: cadence 139spm,
  overstride −20cm, knee 158° → heel cushioning / drop / weight / stack
  requirements derived from the movement profile.
- `showroom-cards.png` — the three cards: **Asics Novablast 4 £140**
  (lead pick, real product photo, craft story, rider notes),
  Saucony Endorphin Speed 4 (laced.com), New Balance 1080v13
  (endclothing.com, £170).
- `decision.png` — pick travelled to decision panel: "a shoe wall sorts
  by colourway/price/bestseller — Forma sorted by YOU: cadence,
  overstride, knee" + BUY AT LACED.COM.
- `till.png` — the PayPal till on the same page.
- `fullpage.png` — entire choose-state page, 4439px tall.

Verified live during the run: "Forma is reading" tray filled with real
candidate pages (Brooks Ghost 16 × startfitness/run4it/brooksrunning);
the pick-hero View Transition flew the Novablast identity block into
the decision panel and back ("BACK TO SHORTLIST" works both ways);
stock check ran live and honestly reported "AVAILABILITY UNCERTAIN —
live checks only for approved footwear retailers" for laced.com.

Still useful but optional: a moving capture of the pick-travel
(~2s) and the reading tray assembling — re-shoot in a normal browser
with QuickTime if wanted, but the stills + Ken Burns cover the edit.

## The closer (shot 11) — proven live

`shopper-agent.mp4` is a real asciinema capture of `scripts/shopper-agent.mjs`
running against **production**: MCP handshake → `get_fit_passport`
(demo-running) → `find_products` (live Channel3) → `check_fit`
("workable 70/100" with reasons) → real PayPal sandbox order
`4VX33017CM346391B` staged with approval link. The refund beat is also
proven: capture `8AP69603PF5719641` → `REFUNDED` via
`/api/paypal/refund` (the misfit self-unwind — worth one line of VO or
a caption if you want to reference it; re-run it live if you want it on
film too).

Run it again anytime: `node scripts/shopper-agent.mjs --base
https://vertiqal.vercel.app` (pass `--product "X"` to vary the shoe,
`--passport demo-climbing` for the climbing profile).

## Edit notes

- All clips are .webm @ 15fps — conform to 30fps timeline, it's fine.
- vq-06 ends on a HALT error — cut at ~0:40 before it appears.
- vq-05 is 2min raw — use only the chip-click moments (0:05–0:35 approx).
- Speed ramp: agent search at 1.5–2×, everything else 1×.
- The till clip ends at the PayPal login page — cut on the handoff,
  imply approval, land on the capture/ledger instead (it exists server-side).

## Rough cut (assembled)

`demo-video/rough-cut.mp4` — 111s, ffmpeg-assembled: title cards (FORMA / "agents sell · agents buy — PayPal settles"), all 6 webm clips trimmed (brief + search beats at 1.67x), Ken Burns on the showroom/decision stills, shopper-agent terminal as the closer. Rebuild: `/tmp/vqcut/finish.sh` pattern — trim offsets are in the concat order documented above. Missing still: voiceover/music bed, and a live pick-travel motion shot if one is re-captured.
