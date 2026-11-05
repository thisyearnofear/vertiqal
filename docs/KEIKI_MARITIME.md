# Keiki × Maritime — Vertiqal (Forma) entry

## Programme

| Field | Value |
|-------|-------|
| **Programme** | Keiki × Maritime — build an always-on personal or business agent |
| **Goal** | Reach 1,000 users in six weeks |
| **Programme starts** | October 20, 2026 |
| **Programme ends** | December 1, 2026 |
| **Duration** | Six weeks |
| **Prize** | Up to $20,000 LLM credits + three-day trip to San Francisco (top 3 qualifying projects) |
| **Application** | Completed — accepted into the programme |
| **Competition** | https://competition.maritime.sh/ |

## User baseline (transparent)

| Metric | Value |
|--------|-------|
| **Users at programme start (Oct 20)** | 0 |
| **Users as of today** | 0 |
| **Target by Dec 1** | 1,000 |

We are starting from zero. Every user count below is real, instrumented, and updated weekly. No dashboard is invented until analytics exist (Vercel Analytics funnel events already cover `sample_started` → `clip_uploaded` → `measurements_locked` → `shopping_started` → `pick_chosen` → `buy_clicked`).

## Weekly tracking

| Week | Starts | Users at start | Users at end | New this week | Cumulative | Milestone |
|------|--------|----------------|--------------|---------------|------------|-----------|
| 1 | Oct 20 | 0 | 0 | 0 | 0 | Core fitting loop, MCP server & cost logging live; baseline instrumented (Oct 23 check-in) |
| 2 | Oct 27 | 0 | 0 | 0 | 0 | ChatGPT Plugin eval verified + real consented clip validation + first 50 users (not reached — see gap note) |
| 3 | Nov 3 | 0 | | | | 3D Movement Twin live (AI Builder Hackathon) + Hero card share loop (200 cumulative users) |
| 4 | Nov 10 | | | | | Run club / climbing gym community rollout + return users ≥ 10% of base |
| 5 | Nov 17 | | | | | 500 cumulative users + affiliate Buy link wrapping live |
| 6 | Nov 24 | | | | | 1,000 cumulative users |

Update this table every Friday. The "Users at end" for a week becomes "Users at start" for the next.

## Project-specific metrics (feed the weekly table)

| # | Metric | What good looks like |
|---|--------|---------------------|
| 1 | Samples started / week | User opens the movement screen / starts the example walkthrough |
| 2 | Clips uploaded / week | Real user footage submitted for measurement |
| 3 | Measurements locked / week | Movement metrics confirmed (cadence, foot strike, reach, hip position) |
| 4 | Shopping started / week | Brief confirmed → "Find my shoes" → retailer research begins |
| 5 | Pick chosen / week | User selects a shoe from the shortlist |
| 6 | Return users / week | ≥2 fittings in 7 days (same device / stable client id if logged) |

## Mapping to existing docs

- `docs/monetisation.md` — cost controls and per-fitting cost logging. This Keiki × Maritime board is the **user-growth** board; monetisation is the **unit-economics** board. Both roll up into the same weekly user count.
- `docs/CHATGPT_PLUGIN_PLAYBOOK.md` — "Usage-only scoreboard (Plugin Lane)" tracks the ChatGPT MCP wedge (`get_fit_passport`, `check_fit`). Distribution board, not growth.
- `AGENTS.md` — Next.js breaking-changes notice; unrelated to this initiative.

## Notes

- This file is the single source of truth for Keiki × Maritime user tracking in Vertiqal. Do not restate the user-count table elsewhere.
- Cost warning: every fitting costs money (Grok + Tavily + Solari + Grok TTS / FLUX Kontext). User growth must be paced against the $20k credit grant — see `docs/monetisation.md` for per-route caps.
- Update weekly. If a week is missed, note the gap honestly rather than backfilling.
- Journey tracking: every funnel event carries `vid` (random first-party cookie) and `returning: true` when a remembered brief exists; `agent_run` and `stock-check` cost logs carry the same `vid`, so journeys join across Analytics and the cost report. Metric #6 = events with `returning: true`.

## Gap note (week 2, closed Nov 3)

Week 2 shipped the 3D Movement Twin rig, hero-card share loop, and a run of agent-reliability fixes (tool-call repair, shortlist grounding, stuck-loop rescue with model escalation, provider fallback for `/api/brief`) — but no distribution work ran, so the "first 50 users" milestone was not reached. User acquisition starts in week 3.
