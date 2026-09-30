# Forma (vertiqal)

**Film a short clip. An agent measures how you move, confirms the fitting brief with you, checks research and real stock, and hands you a running or climbing shoe recommendation, with receipts.**

Live: [vertiqal.vercel.app](https://vertiqal.vercel.app)

## The problem

Footwear is bought on keywords and shop-floor rules of thumb, and it is one of the most-returned categories in commerce. The information that actually matters, how *you* move, never reaches the checkout.

## What Forma does

1. **Shows the loop first.** The home page opens on the fitting bench with a clearly labelled synthetic example, upload and live-camera actions, the running/climbing choice, and a stage-aware next-step prompt. The illustrative example never calls agent, stock or shopper APIs.
2. **Measures on-device.** MediaPipe pose tracking runs in the browser on a phone clip or live camera: cadence, foot strike and overstride for running; reach, hip position and precision for climbing. Live capture shows real pose-derived person, hips and feet framing checks. Video never leaves the device unless you opt in.
3. **Confirms the brief before searching.** Movement cannot establish size, budget, goal, surface or comfort needs, so those shopper details are confirmed explicitly before a personal research run. Changing height or the pose provider invalidates a stale measurement.
4. **Turns movement into fit requirements.** A gear agent (Grok via Vercel AI Gateway) builds a movement profile, then works through visible steps: research, live retailer stock, rider reports and athletes who wear the shoe. Each claim carries a citation checked against the publisher.
5. **You choose how far to dig.** Search starts at Considered; **Look harder** moves to Deep and adds research and athlete evidence.
6. **Asks before acting.** No live search starts until a real measurement and required brief are present. **Check my size** submits one explicit size to Solari's stealth UK browser; Grok reads the size controls, structured offers and a screenshot to decide whether that size is in stock. Checks are limited to approved retailers, authorized product targets and per-client quotas, with a short-lived per-instance cache and honest live/cached/shared labels. Each verdict comes with the screenshot and a session replay as proof. The older Browser Use basket check still exists as an agent tool. Both stop before checkout.
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
| Wassist | WhatsApp handoff (Bring Your Own Agent), reply webhook and the conversation transcript that serves as shopper memory. |
| Next.js 16 + AI SDK | App, route handlers, tool-calling agent. |

## Run locally

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test:fitting # fitting-state and preference rules
pnpm typecheck    # the real type gate: next.config ignores TS errors during build
pnpm build
```

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
