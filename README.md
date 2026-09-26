# Forma (vertiqal)

**Film yourself for 10 seconds. An agent measures how you move, checks the research and real stock, and hands you the right running or climbing shoe, with receipts.**

Live: [vertiqal.vercel.app](https://vertiqal.vercel.app)

## The problem

Footwear is bought on keywords and shop-floor rules of thumb, and it is one of the most-returned categories in commerce. The information that actually matters, how *you* move, never reaches the checkout.

## What Forma does

1. **Measures on-device.** MediaPipe pose tracking runs in the browser on a phone clip or live camera: cadence, foot strike and overstride for running; reach, hip position and precision for climbing. Video never leaves the device unless you opt in.
2. **Turns movement into fit requirements.** A gear agent (Grok via Vercel AI Gateway) builds a movement profile, then works through visible steps: research, live retailer stock, rider reports and athletes who wear the shoe. Each claim carries a citation checked against the publisher.
3. **You choose speed versus depth.** A Depth dial (Quick, Considered, Deep) decides how much research the agent does before it commits.
4. **Asks before acting.** Nothing touches a retailer until you ask. **Check my size** opens the product page in a stealth UK browser (Solari), and Grok reads the size controls, structured offers and a screenshot to decide whether your size is in stock. Each verdict comes with the screenshot and a session replay as proof. The older Browser Use basket check still exists as an agent tool. Both stop before checkout.
5. **Carries your fit elsewhere.** A signed **Fit Passport** lets any other shopping agent check a shoe against your profile, over REST or MCP.
6. **Hands off to WhatsApp and remembers you.** Your fitting and chosen pick land in WhatsApp through Wassist. A Grok reply agent answers follow-ups in your chosen Forma voice and can run live product searches. Once you've linked WhatsApp, a signed cookie remembers your number and last pick. The app then reads what you've said on WhatsApp since, so your next scan builds on it. You can send Forma a photo of worn soles or a sore spot and it reads the wear or the likely fit cause. About 12 days after you pick a shoe, Forma checks in once to ask how it's breaking in.
7. **Lets you see yourself.** A **hero frame** card grades your best stride or reach into a shareable image, and the opt-in **See yourself in them** shows you wearing the top pick (FLUX Kontext), clearly labelled as an AI impression, not a fit check.

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
pnpm typecheck  # the real type gate: next.config ignores TS errors during build
pnpm build
```

## Where things live

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Entry point; renders the Stride Lab. |
| `app/api/` | Route handlers (see [architecture](docs/architecture.md#api-routes)). Thin: parse, call `lib/`, respond. |
| `components/stride-lab/` | Camera/video stage, pose overlay, readouts, fitting notes. |
| `components/stride-lab/agent/` | Agent conversation, depth dial, picks, basket checks, Fit Passport UI. |
| `components/stride-lab/hero/` | Hero frame card and try-on UI. |
| `components/forma/` | Forma avatar and console personalisation. |
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
| `WASSIST_API_KEY` | WhatsApp handoff, webhook auth, passport and member cookie signing fallback | Handoff hidden |
| `PASSPORT_SECRET` | Dedicated signing secret for passports and the member cookie (optional) | Falls back to `WASSIST_API_KEY` |
| `NEXT_PUBLIC_SAMPLE_CLIP` | URL of the one-click sample clip (optional, public) | Sample button hidden |
| `WASSIST_CHECKIN_TEMPLATE` | Name of the approved WhatsApp template for the break-in check-in (optional) | Check-in job skips |
| `CRON_SECRET` | Authenticates Vercel Cron calls to the check-in job | Check-in job returns 401 |

### WhatsApp setup notes

- Production and preview deployments each get their own Wassist agent (`Forma · vertiqal` and `Forma · vertiqal · preview`). Opening a preview never replaces the live agent.
- The break-in check-in (`vercel.json` cron, daily 09:00 UTC) messages shoppers after their 24-hour window has closed, which WhatsApp only allows through an approved template. Create a UTILITY template on your own WhatsApp Business number (the Wassist sandbox can't send templates). Give it one body variable, `{{1}}` = shoe name, and keep the phrase **"vertiqal check-in"** in the body, because the job uses it to avoid sending twice. For example: *"Hi, it's Forma with your vertiqal check-in. How are your {{1}} feeling now you've worn them in? Tell me what's working and anything that rubs, and I'll factor it into your next scan."*
| `VLMRUN_API_KEY` | VLM Run pose refinement | Provider falls back to MediaPipe only |

AI Gateway authenticates automatically on Vercel; no key is needed.
