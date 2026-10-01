# Forma (vertiqal)

**Film a short clip. An agent measures how you move, confirms the fitting brief with you, checks research and real stock, and hands you a running or climbing shoe recommendation, with receipts.**

Live: [vertiqal.vercel.app](https://vertiqal.vercel.app)

## The problem

Footwear is bought on keywords and shop-floor rules of thumb, and it is one of the most-returned categories in commerce. The information that actually matters, how *you* move, never reaches the checkout.

## What Forma does

1. **Shows the loop first.** The home page opens on the movement screen as the hero: an idle pose figure demonstrates what Forma watches for, with a "Show me a sample fitting" action on the screen itself. The same screen then plays the example footage, the live camera or your uploaded clip. Directly under it sit the running/climbing choice, upload and live-camera actions, and a Forma strip that announces the current step and holds the settings sheet (tuning, privacy and the pose-provider picker); on mobile a fixed compact Forma/action bar sits at the bottom. The six-stage labelled example walkthrough, readouts and results follow below the screen; the footage attribution renders under the strip in example mode. Once a clip is measured, the locked metrics stay pinned along the bottom of the screen, and the screen shrinks once shopping results arrive. Local validation lives in its own disclosure. The example never calls agent, stock or shopper APIs — see *Example assets and limits* below for the footage source and its limits.
2. **Measures on-device.** MediaPipe pose tracking runs in the browser on a phone clip or live camera: cadence, foot strike and overstride for running; reach, hip position and precision for climbing. Live capture shows real pose-derived person, hips and feet framing checks. Video never leaves the device unless you opt in.
3. **Confirms the brief before searching.** Movement cannot establish size, budget, goal, surface or comfort needs, so those shopper details are confirmed explicitly before a personal research run. Height is set on the idle screen itself; while a clip is measured, Forma asks the remaining questions one at a time in its strip, answered with chips (size, budget, goal, surface, optional foot width) or a short text for niggles. Answers build an editable one-sentence brief whose blanks reopen their question, and **Find my shoes** on that sentence is the confirmation. A full form remains under *Show all fields*. Optionally, *tell Forma in a sentence* sends one typed sentence to Grok (xAI) to pre-fill the brief, and the surface question can guess from one clip still — both fire only on an explicit button press. Confirmed brief answers (never niggles, never video) are remembered in a `vertiqal-brief` cookie on this browser, so a returning shopper's sentence is pre-filled — tapping **Find my shoes** over it is still the confirmation, and a *Forget saved answers* link clears them. Changing height or the pose provider invalidates a stale measurement.
4. **Turns movement into fit requirements.** A gear agent (Grok via Vercel AI Gateway) builds a movement profile, then works through visible steps: research, live retailer stock, rider reports and athletes who wear the shoe. Each claim carries a citation checked against the publisher.
5. **You choose how far to dig.** Search starts at Considered; **Look harder** moves to Deep and adds research and athlete evidence.
6. **Asks before acting.** No live search starts until a real measurement and required brief are present. **Check my size** submits one explicit size to Solari's stealth browser with UK egress by default; Grok reads the size controls, structured offers and a screenshot to decide whether that size is in stock. Checks are limited to approved retailers, authorized product targets and per-client quotas, with a short-lived per-instance cache and honest live/cached/shared labels. Receipts include the observed URL and HTTP status, plus a screenshot and session replay when available; these show execution evidence, not proof of stock. The older Browser Use basket check still exists as an agent tool. Both stop before checkout.
7. **Carries your fit elsewhere.** A signed **Fit Passport** lets any other shopping agent check a shoe against your profile, over REST or MCP. It is only shown when it matches the size in the decision form.
8. **Hands off to WhatsApp and remembers you.** Your fitting and chosen pick land in WhatsApp through Wassist. A Grok reply agent answers follow-ups in your chosen Forma voice and can run live product searches. Once you've linked WhatsApp, a signed cookie remembers your number and last pick. The app then reads what you've said on WhatsApp since, so your next scan builds on it. You can send Forma a photo of worn soles or a sore spot and it reads the wear or the likely fit cause. About 12 days after you pick a shoe, Forma checks in once to ask how it's breaking in.
9. **Lets you see yourself.** A **hero frame** card grades your best stride or reach into a shareable image, and the opt-in **See yourself in them** shows you wearing the top pick (FLUX Kontext), clearly labelled as an AI impression, not a fit check.

## Built with

| Service | Role |
| --- | --- |
| Vercel AI Gateway | Grok 4.7 (agent + vision), Grok TTS (voice), FLUX Kontext (try-on). No per-provider keys. |
| MediaPipe Pose | On-device keypoints, every frame. |
| VLM Run (Orion) | Optional hosted keypoint refinement on sampled frames of uploaded clips. |
| Tavily | Live retailer, research, community and athlete search. |
| Solari | Stealth browser with UK residential egress for size and stock checks, with screenshot and session replay receipts. |
| Browser Use | User-approved basket availability checks (agent tool). |
| Vercel Analytics | Funnel events only — `sample_started`, `film_started`, `clip_uploaded`, `measurements_locked`, `shopping_started`, `pick_chosen`, `buy_clicked`, `whatsapp_sent` — carrying sport/retailer flags, no PII. |
| Wassist | WhatsApp handoff (Bring Your Own Agent), reply webhook and the conversation transcript that serves as shopper memory. |
| Next.js 16 + AI SDK | App, route handlers, tool-calling agent. |

## Run locally

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test:fitting # fitting-state, capture and preference rules
pnpm test:pose    # example tracking lifecycle, local export and annotation-comparison unit tests
pnpm typecheck    # the real type gate: next.config ignores TS errors during build
pnpm build
```

## Motion validation (running first)

Forma's movement estimates are experimental. This workflow compares detected foot-contact events against independently supplied annotations; it does not certify biomechanics, shoe fit or clinical validity.

1. Record a real, consented side-on clip with the full body and both feet visible, a stationary camera and known height. Keep the original video privately so contact times can be reviewed. AI-generated footage can exercise the interface but cannot validate real-person measurement accuracy.
2. Upload the clip, open the local validation controls and explicitly start collecting data. Select the source honestly: unclassified, consent-confirmed real footage, or synthetic/debug. Nothing is collected by this control until you start it. Stop and export the JSON locally. It contains keypoints, entered height, provider, source declaration, original video timestamps and detected contacts, but no video/images, clip name, source URL or account information. Keypoints and height can still be identifying; keep exports outside the repository and share only with permission.
3. Independently inspect every contact in a chosen interval of the original clip. Record left/right contacts at their original `video.currentTime` timestamps; do not copy detected contacts into the reference. Explicitly exclude intervals you cannot judge and document why. Mark the annotation set complete only after reviewing the entire evaluation interval.
4. Compare the export with your annotation JSON using the CLI below. Select and document the matching window before looking at the results. The example `80` ms is an invocation example, not a recommended accuracy threshold.

```bash
pnpm validate:motion /path/to/capture.json /path/to/annotations.json --tolerance-ms 80
```

Annotation template (replace the capture id and interval with values from your export, fill contacts, then set `complete` to `true`):

```json
{
  "schemaVersion": 1,
  "captureId": "replace-with-exported-captureId",
  "source": "manual",
  "referenceNotes": "Describe how contact frames were independently reviewed and any timing uncertainty.",
  "complete": false,
  "interval": { "startSec": 0, "endSec": 10 },
  "excludedIntervals": [],
  "contacts": []
}
```

Each contact is `{ "timeSec": <number>, "side": "left" | "right" }`. Each exclusion is `{ "startSec": <number>, "endSec": <number>, "reason": <string> }`; its endpoints are inclusive. The CLI refuses incomplete annotations, mismatched capture ids, invalid timelines, duplicate contacts and resource-truncated captures. Matching is one-to-one and same-side: maximise the number of contacts within the supplied window, then minimise total absolute timing error. Reports include precision/recall with explicit counts, misses, extra detections, timing errors and processed-frame visibility counts. An empty denominator is `null`, not perfect accuracy. Source declarations are not independently verified; synthetic and unclassified captures are labelled `debug-only`. There is no accuracy pass/fail threshold or aggregate leaderboard.

The recorder retains the first continuous segment and stops on rewind or dimensions changes. It records all frames actually processed by Forma, not every source-video frame; visibility counts are frame counts, not elapsed-time coverage. Resource caps are 18,000 processed frames and 2,000 contacts, with no subsampling; a cap-stopped export is marked truncated and refused by the comparison tool. Live capture exports no video, so uploaded clips are preferable for independent annotation. Height, provider, sport or clip changes discard the in-memory trace. The provider identifier records the selected mode, not per-frame backend provenance; the optional hosted mode may fall back to MediaPipe.

### FreeMoCap's role

Use [FreeMoCap](https://github.com/freemocap/freemocap) as a separate offline reference workflow, not a runtime dependency. Its [multi-camera guide](https://freemocap.github.io/documentation/multi-camera-calibration.html) describes calibrated, overlapping camera views. Capture the same real movement simultaneously and compare a single-view Forma export against independently reviewed reference events; align timestamps and record calibration/synchronisation quality. Such annotations may use `source: "calibrated-multicamera"` with those details in `referenceNotes`. Native FreeMoCap files are not directly imported by this CLI, and FreeMoCap itself is not automatically ground truth. Review its AGPL-3.0 licensing before incorporating software; review recording/data permissions separately. A single-camera 3D-shaped export is not proof of measured depth.

**Pending:** no consented human dataset, manual-reference results or calibrated multi-camera comparison has been completed. The automated tests exercise synthetic code fixtures only. Do not present their passing results as motion-capture accuracy evidence.

## Example assets and limits

The six-stage walkthrough is an illustrated journey, not a genuine recorded fitting.

- **Footage (running only):** a 12-second AI-generated clip served from `public/examples/generated-runner.mp4`, produced once with [Seedance 1.5 Pro on fal.ai](https://fal.ai/models/fal-ai/bytedance/seedance/v1.5/pro/text-to-video) (fal lists the model for commercial use). Full generation details — request id, seed, input and media metadata — ship with the app at `public/examples/generated-runner-provenance.json`. The runner is synthetic and is not a real person; a local pose overlay observes the generated frames (at most 12 fps while the clip plays), and the overlay pauses when it is switched off, the panel leaves the viewport or the tab is hidden. The clip itself pauses when hidden or scrolled out of view and stays paused until the user resumes it; playback is independent of walkthrough progression. The fitting metrics remain fixtures and no real-person accuracy is established.
- **Everything else is synthetic:** measurements, brief, direction concepts and the receipt template are fixtures, clearly labelled "not measured from this generated clip". The receipt says `Template — not a completed stock check` — it shows what a real check reports, it does not simulate a verdict. The climbing example uses an inline illustration, not footage.
- **Cost:** the walkthrough calls no APIs; the ~1.6 MB clip is served from `public/` so it only costs ordinary CDN bandwidth per visitor — there is no paid call per view. One generation was approved and run once; the recorded figure ($0.31104) is a preflight unit-price estimate, not an actual billed amount. `FAL_KEY` lives server-only in `.env.local` (mode 600) and was needed solely to author the asset — the demo does not depend on fal at runtime. Genuine saved research and stock outputs still require further assets and live verification.
- **Previous archive asset retained (not used in the walkthrough):** `public/examples/archival-runner.mp4` — a 3-second clip (7:55–7:58) from *Orientation to Physical Efficiency Battery* (1986), Federal Law Enforcement Training Center, via the [Moving Image Archive](https://www.movingimagearchive.com/sources/orientation-to-physical-efficiency-battery-a4d3e5b5?clip=e9224f58-34ac-5ab8-9f9c-e5d5baed3804) and originally published on the [Internet Archive](https://archive.org/details/gov.ntis.ava18914vnb1), labelled public domain by both archives.
- Fixture and credit live in `lib/fitting/example.ts` (`EXAMPLE_FOOTAGE`).

### Compact workspace verification

Code-only checks last run 2026-10-01: `pnpm typecheck` clean, `pnpm exec eslint` on the touched files 0 errors / 4 warnings, `pnpm test:fitting` 38/38, `pnpm test:pose` 34/34, `git diff --check` clean. A production build and browser checks were not run. Manual checklist still pending: desktop/mobile dock overlap and scrolling plus settings sheet; example play/pause, overlay toggle, tab hide and scroll-away behaviour; closing the example restores action-button focus, and camera setup focuses the height field; running and climbing upload and capture countdown. The synthetic examples do not establish measurement accuracy; genuine footage, research and stock evidence, calibrated comparison and revenue validation remain separate pending workstreams.

## Solari cookbook patterns applied

The stock-check browser work in `lib/agent/solari.ts` was reviewed against the pinned Solari cookbook examples:

- [browser-stealth-proxy-ts](https://github.com/solari-sdk/solari-cookbook/tree/a435d2ac5ae87bdf9ee4f6c91f97da9501359560/examples/browser-stealth-proxy-ts) — the pre-existing stealth launch, GB residential egress and smart-proxy retry on bot walls match the documented configuration/lifecycle.
- [browser-session-recording-py](https://github.com/solari-sdk/solari-cookbook/tree/a435d2ac5ae87bdf9ee4f6c91f97da9501359560/examples/browser-session-recording-py) — the pre-existing per-session recording, release-and-wait and replay-polling receipts (`/api/stock-check/replay`) match the documented configuration/lifecycle.
- [browser-page-assertions-py](https://github.com/solari-sdk/solari-cookbook/tree/a435d2ac5ae87bdf9ee4f6c91f97da9501359560/examples/browser-page-assertions-py) — page verification in `lib/agent/stock-page.ts` was newly adapted from this example: after navigation, the final URL, HTTP status, `h1` identity, structured `Product` names and size controls are checked before the model judge is allowed to interpret the page. In-flight navigation to disallowed hosts is aborted via request routing, and a refused redirect invalidates the whole read.

These patterns were reviewed and adapted; this project is not a cookbook fork, and the earlier stealth/recording implementation was not originally derived from it.

Verification and limits: `inspectStockPage` in `lib/agent/stock-page.ts` is a conservative heuristic — matching headings provide identity evidence, not proof of product correctness or stock, and navigation, screenshot and replay evidence prove execution happened, not the verdict. The identity check can refuse a real product page (conservative by design) rather than assert stock on the wrong one. Tests cover the pure gate and a mock judge; the navigation/redirect interception has no live or browser QA yet. See `lib/fitting/fitting.test.ts` for the covered cases. Live end-to-end verification through the paid Solari API has not yet been run, and rate limits and caches are per-instance.

## Where things live

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Entry point; renders the Stride Lab. |
| `app/api/` | Route handlers (see [architecture](docs/architecture.md#api-routes)). Thin: parse, call `lib/`, respond. |
| `components/stride-lab/` | Fitting bench: header, synthetic example, brief form, camera/video stage, pose overlay and readouts. |
| `components/stride-lab/agent/` | Agent conversation, depth dial, picks, explicit stock checks, basket checks, Fit Passport UI. |
| `components/stride-lab/hero/` | Hero frame card and try-on UI. |
| `components/forma/` | Forma avatar and console personalisation. |
| `lib/fitting/` | Client-side fitting rules: stage flow, preference validation, example scripts, stock-size and camera-stream semantics. |
| `lib/pose/` | Pose provider contract; MediaPipe and VLM Run providers. |
| `lib/metrics/` | Sport-specific measurements and readouts. |
| `lib/agent/` | Gear agent, tools, evidence checks, and the Tavily, Browser Use and Solari clients. |
| `lib/hero/` | Hero frame scoring and capture. |
| `lib/passport/` | Passport schema, signing and fit checks. |
| `lib/member/` | Signed member cookie: linked WhatsApp number and last pick. |
| `lib/wassist/` | WhatsApp client, fitting messages, and the reply agent. |

Business rules live in `lib/`; components and routes stay thin. See [docs/architecture.md](docs/architecture.md) for the request flow and extension points.

## Configuration

Server-side only (Vercel **Vars** or an uncommitted `.env.local`). Never expose these as `NEXT_PUBLIC_*`.

| Variable | Used for | Without it |
| --- | --- | --- |
| `TAVILY_API_KEY` | Live search tools | Agent skips live research and stock |
| `BROWSER_USE_API_KEY` | Basket checks | Basket check unavailable |
| `SOLARI_API_KEY` | Stock checks and session replays | Check my size returns an error |
| `STOCK_CHECK_SECRET` | Dedicated signing secret for stock-check product targets (optional) | Falls back to `SOLARI_API_KEY` |
| `STOCK_CHECK_EXTRA_HOSTS` | Comma-separated extra approved retailer hosts (optional) | Built-in footwear retailer list only |
| `WASSIST_API_KEY` | WhatsApp handoff, webhook auth, passport and member cookie signing fallback | Handoff hidden |
| `PASSPORT_SECRET` | Dedicated signing secret for passports and the member cookie (optional) | Falls back to `WASSIST_API_KEY` |
| `WASSIST_CHECKIN_TEMPLATE` | Name of the approved WhatsApp template for the break-in check-in (optional) | Check-in job skips |
| `CRON_SECRET` | Authenticates Vercel Cron calls to the check-in job | Check-in job returns 401 |
| `VLMRUN_API_KEY` | VLM Run pose refinement | Provider falls back to MediaPipe only |

### WhatsApp setup notes

- Production and preview deployments each get their own Wassist agent (`Forma · vertiqal` and `Forma · vertiqal · preview`). Opening a preview never replaces the live agent.
- The break-in check-in (`vercel.json` cron, daily 09:00 UTC) messages shoppers after their 24-hour window has closed, which WhatsApp only allows through an approved template. Create a UTILITY template on your own WhatsApp Business number (the Wassist sandbox can't send templates). Give it one body variable, `{{1}}` = shoe name, and keep the phrase **"vertiqal check-in"** in the body, because the job uses it to avoid sending twice. For example: *"Hi, it's Forma with your vertiqal check-in. How are your {{1}} feeling now you've worn them in? Tell me what's working and anything that rubs, and I'll factor it into your next scan."*

AI Gateway authenticates automatically on Vercel; no key is needed.
