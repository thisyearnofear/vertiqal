# vertiqal

Forma is a video-based running and climbing shoe fitter. It reads movement on-device, turns the measurements into fit requirements, then checks live stock and optional research/community context before presenting a short list. Fit Passports let another shopping agent check a shoe against the same profile.

## Run locally

Use the repository's pinned package manager, pnpm 12.3.4:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Before opening a pull request or publishing, run the explicit TypeScript check and production build:

```bash
pnpm typecheck
pnpm build
```

The Next.js config currently allows builds to ignore TypeScript errors, so `pnpm typecheck` is the reliable type gate.

## Where to work

- `app/` — App Router entry points and HTTP route handlers. Keep handlers focused on parsing requests, invoking domain code, and shaping responses.
- `components/stride-lab/` — camera/video, pose display, and fitting workflow UI.
- `components/stride-lab/agent/` — gear-agent conversation, depth controls, product picks, basket checks, and Fit Passport UI.
- `components/forma/` — Forma avatar and console/personalization UI.
- `lib/metrics/` — sport-specific measurements and readouts.
- `lib/pose/` — provider contract and pose implementations.
- `lib/agent/` — fitting brief, recommendation tools, evidence, search, and optional browser automation.
- `lib/passport/` — passport schema, signing, and fit checks.
- `lib/wassist/` — WhatsApp integration and fitting handoff.
- `public/` — static assets and the local MediaPipe model/WASM files.
- `docs/architecture.md` — request flow, API route map, integrations, and extension points.

Start at `app/page.tsx` for the page entry point. Follow the imported feature component into its folder; keep business rules in the matching `lib/` domain rather than adding them to the page or route handler.

## Runtime configuration

Set server-side credentials in Vercel project **Vars** or in a local, uncommitted `.env.local` file. Never expose these as `NEXT_PUBLIC_*` variables.

| Variable | Used for |
| --- | --- |
| `TAVILY_API_KEY` | Live retailer, community, research, and athlete searches. |
| `BROWSER_USE_API_KEY` | User-approved product-page basket availability checks. The automation stops before checkout. |
| `WASSIST_API_KEY` | WhatsApp handoff, webhook authentication, and passport signing fallback. |
| `PASSPORT_SECRET` | Optional dedicated Fit Passport signing secret; falls back to `WASSIST_API_KEY`. |
| `VLMRUN_API_KEY` | **Not currently consumed.** The VLM Run pose provider is a disabled scaffold; adding this variable alone does not enable it. |

AI Gateway is used for the vision and speech models and is available in Vercel without a project API key. MediaPipe pose tracking runs in the browser using the checked-in model/WASM assets.

## Product and v0 workflow

This repository is connected to the [vertiqal v0 project](https://v0.app/chat/projects/prj_NGuSzfx1fUR11tMuWaGpUmLYGA38). Continue editing through v0 or the connected GitHub repository. Merges to `main` deploy through the project configuration.

For deeper implementation context, see [the architecture guide](docs/architecture.md).

## Useful references

- [Next.js documentation](https://nextjs.org/docs)
- [Vercel AI SDK documentation](https://ai-sdk.dev/docs)
- [v0 documentation](https://v0.app/docs)
- [Tavily search API](https://docs.tavily.com/)
- [Wassist API](https://wassist.app/)
- [Browser Use API](https://docs.browser-use.com/)

> **Documentation maintenance:** Update the architecture guide when routes, external services, data storage, or module boundaries change. Keep the environment-variable table aligned with actual `process.env` references; configured-but-unused credentials should be labeled as such.
