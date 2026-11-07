# Movement Profile — the subscription-shaped product

**Thesis**: the measurement is free (it's the funnel). The *profile* is the product — and it pays from day one, not after months of history.

## Day-one value, not deferred value

Five moves that make the profile pay immediately:

1. **Population benchmarks** — compare this session's metrics to population cut points (cadence, stride, reach) — "you're bottom-third on cadence" — instant, no second clip needed.
2. **The prescription** — a "film this again and see" plan tied to the worst metric (2-3 cues, the 30-day loop is the re-check). Sell what-to-change, not what-changed.
3. **The accumulating artifact** — "MOVEMENT PROFILE V-01" card stamping a new column per session — a character sheet for your gait. The artifact is the product.
4. **Forma's memory** — narrating deltas across sessions ("cadence up 6%") — coach-continuity, not just answers.
5. **The living passport** — the Fit Passport evolves from point-in-time receipt to a history-carrying profile handed to a PT/coach/agent.

**Status**: steps 1, 4 (lock → `appendSession`), 6 (`profileSummary` in in-stock + film-again lines) and 7 (`profile-history` retention gate — free keeps the latest pin, pro accumulates to 24; the tier claim is HMAC-signed, see `lib/fitting/tier-proof.ts`) are landed. Benchmarks, the profile card and the "film this again" plan are still ahead.

## Implementation plan (ordered)

1. **`lib/fitting/profile.ts`** — the profile type: `{ sessions: [{ at, metrics[], summary }], benchmarks: Record<metric, percentile> }`. Persists metrics-only in localStorage (same privacy stance as `baseline.ts`).
2. **Population benchmarks** — static cut points per metric (`lib/fitting/benchmarks.ts`); first session renders "you sit at the ~30th percentile on cadence" — day-one value with zero history.
3. **Profile card** — the `TakeAway`/hero flow renders the profile artifact: this session's column + prior stamps. Reuses `render-card.ts` canvas.
4. **`profile.ts` update on lock** — `lockMeasurement` appends a session; the UI surfaces deltas (delta badge per metric: "+6%").
5. **The "film this again" plan** — derived from the worst-scoring metric: 2-3 cues + the .ics reminder already exists.
6. **Forma's memory** — `narrate` gets the prior session: in-stock/film-again lines name the delta ("cadence up 6% — whatever changed is working").
7. **Pro gate** — history beyond the single latest pin + benchmarks detail + the living passport sit behind `allowed(feature, tier, used)` in `lib/fitting/entitlements.ts` — new `Feature` entries: `profile-history`, `benchmark-detail`.

## Boundaries

- Metrics only — no video/photos persist, ever (the privacy line is the brand).
- Benchmarks are honest ranges, not medical claims.
- Free tier gets this-session profile + one baseline; Pro is history/benchmarks/plan/memory — not a paywalled meter.
