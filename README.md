# Forma (vertiqal)

**Film yourself for 10 seconds. An agent measures how you move, checks the research and real stock, and hands you the right running or climbing shoe, with receipts.**

Live: [vertiqal.vercel.app](https://vertiqal.vercel.app)

## The problem

Footwear is bought on keywords and shop-floor rules of thumb, and it is one of the most-returned categories in commerce. The information that actually matters, how *you* move, never reaches the checkout.

## What Forma does

1. **Measures on-device.** MediaPipe pose tracking runs in the browser on a phone clip or live camera: cadence, foot strike and overstride for running; reach, hip position and precision for climbing. Video never leaves the device unless you opt in.
2. **Turns movement into fit requirements.** A gear agent (Grok via Vercel AI Gateway) builds a movement profile, then works through visible steps: research, live retailer stock, rider reports and athletes who wear the shoe. Each claim carries a citation checked against the publisher.
3. **You choose speed versus depth.** A Depth dial (Quick, Considered, Deep) decides how much research the agent does before it commits.
4. **Asks before acting.** Basket checks on real product pages (Browser Use) run only after you approve, and always stop before checkout.
5. **Carries your fit elsewhere.** A signed **Fit Passport** lets any other shopping agent check a shoe against your profile, over REST or MCP.
6. **Hands off to WhatsApp.** Continue the fitting with a human-style assistant via Wassist.
7. **Lets you see yourself.** A **hero frame** card grades your best stride or reach into a shareable image, and the opt-in **See yourself in them** shows you wearing the top pick (FLUX Kontext), clearly labelled as an AI impression, not a fit check.

## Built with

| Service | Role |
| --- | --- |
| Vercel AI Gateway | Grok 4.7 (agent + vision), Grok TTS (voice), FLUX Kontext (try-on). No per-provider keys. |
| MediaPipe Pose | On-device keypoints, every frame. |
| VLM Run (Orion) | Optional hosted keypoint refinement on sampled frames of uploaded clips. |
| Tavily | Live retailer, research, community and athlete search. |
| Browser Use | User-approved basket availability checks. |
| Wassist | WhatsApp handoff and webhook. |
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
| `lib/agent/` | Gear agent, tools, evidence checks, Tavily and Browser Use clients. |
| `lib/hero/` | Hero frame scoring and capture. |
| `lib/passport/` | Passport schema, signing and fit checks. |
| `lib/wassist/` | WhatsApp client and fitting handoff. |

Business rules live in `lib/`; components and routes stay thin. See [docs/architecture.md](docs/architecture.md) for the request flow and extension points.

## Configuration

Server-side only (Vercel **Vars** or an uncommitted `.env.local`). Never expose these as `NEXT_PUBLIC_*`.

| Variable | Used for | Without it |
| --- | --- | --- |
| `TAVILY_API_KEY` | Live search tools | Agent skips live research and stock |
| `BROWSER_USE_API_KEY` | Basket checks | Basket check unavailable |
| `WASSIST_API_KEY` | WhatsApp handoff, webhook auth, passport signing fallback | Handoff hidden |
| `PASSPORT_SECRET` | Dedicated passport signing secret (optional) | Falls back to `WASSIST_API_KEY` |
| `VLMRUN_API_KEY` | VLM Run pose refinement | Provider falls back to MediaPipe only |

AI Gateway authenticates automatically on Vercel; no key is needed.
