<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Verify

- `pnpm typecheck` · `pnpm lint` · `pnpm test:fitting` (node:test, ~1s) — run all three before committing.
- `pnpm build` before pushing.
- Browser checks: use `agent-browser --session <task>` and close the same session when done.

## Frontend structure

- `components/stride-lab/stride-lab.tsx` orchestrates only — state + derivations + JSX. Machinery lives in hooks: `use-brief-flow` (guided brief), `use-validation-capture` (local trace recorder), `use-pose-provider` (engine session), `use-pose-loop` / `use-attract-mode` (stage canvas loops), `use-live-camera`, `use-voice`, `use-gear-agent`.
- Stage JSX splits into `boot-screen`, `progress-hud`, `stage-controls`, `hero/take-away`. The `narration`/`stripAction` cluster stays in `stride-lab.tsx` — it is view derivation, not logic worth extracting.
- `PrefDraft` is the single source of truth for goal/surface/size/budget/height; `FittingNotesState` holds width/current/niggles/vision findings only.
- Reach DOM nodes via refs passed down (`buyLinkRef`, `actionButtonsRef`, `panelRef`…), never `getElementById`/`querySelectorAll`.
- `MovementTwin` (three.js) is `next/dynamic` `ssr: false` — keep it out of the initial bundle.
- Blob downloads go through `lib/downloads.ts` (`downloadBlob` revokes after 1s — synchronous revoke can cancel the download).

## Product strategy (2026-01)

Positioning: **the gait lab in your browser that shows its work.** The space is all in-store hardware (Runners Need, Fit2Run) or B2B-to-retailers (Ochy) — nobody owns browser-based self-serve single-camera movement fitting with personality.

Differentiators to defend: movement-not-measurements (the baseline-compare loop compounds), on-device privacy ("video never leaves this browser"), honest stock verification ("template, not verified"), shareable artifacts (hero/compare cards carry `?ref=` links, attributed via `share_landing` funnel step).

Revenue model: **web app first, affiliate is a bonus.** Freemium boundary = on-device (free) vs hosted AI (metered — sole-wear vision, keyframe review, free-text brief parse, surface guess, try-on, TTS voice). Metering infra exists: `limit_hit` funnel step, `lib/fitting/surface-guard`, `lib/agent/stock-policy`.

Tier sketch: free = measure + brief + stock check + one baseline (the funnel). Pro = longitudinal movement profile (multi-baseline history/trends), unlimited vision features, all personas, exportable fit passport.

Engagement mechanics: persona/voice unlocks as fitting rewards; streak/cadence on the film-again loop (persisted baseline in `lib/fitting/baseline.ts` is the raw material).

Do NOT: paywall the measurement itself (it's acquisition), sponsored picks (honest framing is the moat), per-user fit data sales (violates the privacy line).
