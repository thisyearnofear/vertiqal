# SWITCH_HACKATHON.md — Flip the Switch Hackathon (WeMakeDevs x DevTools Academy x Switch)

> Project: **Vertiqal (Forma)** — movement analysis + shoe recommendation with receipts
> Event: Flip the Switch Hackathon (Nov 4–7, 2026, online)
> Prize pool: $10,000
> Requirement: **Switch must be central**; workflow built during the hackathon
> Repo: https://github.com/thisyearnofear/vertiqal
> Live: https://vertiqal.vercel.app

## 1. Event essentials
- Build window: **Nov 4 12:01 AM IST → Nov 7 11:59 PM IST, 2026**.
- Format: online, solo or team up to 4.
- Core challenge: turn a solo AI agent into a teammate in Slack/Teams/Discord/Telegram/Mattermost using Switch.
- Switch must be central; README must show how Switch is used.
- Existing agents/projects are allowed; Switch setup + workflow must be built during the hackathon.
- Judging: technical execution, creativity/impact, presentation.
- Tracks include workflow, core Switch PRs, best blog, Code with Wispr, etc.

## 2. Why Vertiqal can work on Switch
Vertiqal already has an agent loop:
- measures movement from a short clip,
- confirms the fitting brief with the user,
- checks research and real stock,
- returns a shoe recommendation with receipts.

For Switch, reframe this as a **team task in chat**: a team drops movement clips, the agent analyzes them, proposes a brief, checks stock, and posts recommendations/receipts for team approval.

## 3. Imaginative team-task concepts

### Primary concept: Relay Team Balancing (Olympics-style)
A relay team needs to assign legs and footwear based on each runner’s biomechanics.

**Room workflow:**
1. Each runner posts a movement clip.
2. Agent measures stride, cadence, stability, and fatigue signals.
3. Agent proposes a relay order + shoe recommendation to balance strengths.
4. Coach/captain approves or tweaks.
5. Agent checks stock and posts a race plan + receipts.

**Why it wins differentiation:** turns gait analysis into a team performance decision, not just shopping.

### Fallback concept: Christmas Team Gifting
A family/friend/office team buys shoes as gifts without guessing sizes.

**Room workflow:**
1. Each person posts a movement clip.
2. Agent proposes a fitting brief for each person.
3. Humans approve/adjust preferences.
4. Agent checks research + stock.
5. Agent posts a gift list with recommendations, evidence, and receipts.
6. Team approves purchases.

**Why it wins differentiation:** fun, time-bound, real approvals, clear receipts.

### Other angles
- Retail floor assistant: store team handles customer fittings in chat.
- Coaching staff: coaches/physios coordinate athlete footwear with approvals.

## 4. Recommended Switch integration
- Create a team room (e.g. `relay-fitting` or `gift-fitting`).
- Add the Vertiqal agent as a teammate with its own name/avatar.
- Use chat messages for clip submission, brief confirmation, approvals, and receipts.
- Use tasks/decisions in the room to track approval state.
- Keep the agent’s analysis and stock checks as tool calls behind the room workflow.

## 5. Minimum viable win (4 days)
Scope to **one room, 2–3 movement clips, one recommendation output**.

1. User posts movement clip(s).
2. Agent analyzes movement and proposes brief.
3. Human approves/adjusts brief.
4. Agent checks stock/research.
5. Agent posts recommendation + receipts in the room.
6. Team approves final plan.

Out of scope: full e-commerce checkout, multi-store inventory, production auth.

## 6. Demo script (do X, see Y)
1. Coach posts 3 runner clips → agent analyzes each runner.
2. Agent proposes relay order + shoe recommendations → team sees evidence.
3. Coach approves order → agent checks stock.
4. Agent posts final race plan + receipts → team sees “ready to execute.”

## 7. Differentiation thesis
Vertiqal becomes a **team decision-support agent**, not a solo shopping assistant:
- gait-informed recommendations,
- human-in-the-loop approvals,
- stock/research checks,
- receipt-backed outputs,
- all coordinated in a shared team room via Switch.

## 8. Risks and fallbacks
- **Risk:** movement analysis is too complex for 4 days.  
  **Fallback:** use precomputed/seeded movement profiles and focus on the room workflow.
- **Risk:** stock/research integration slips.  
  **Fallback:** show cached research/stock results and clearly label demo data.
- **Risk:** Switch setup takes too long.  
  **Fallback:** use Mattermost local setup from the quickstart and keep the demo simple.

## 9. Submission checklist
- [ ] Switch central to the project
- [ ] README shows how Switch is used
- [ ] Working room workflow demo
- [ ] Demo video/screenshots
- [ ] Public repo
- [ ] Submission completed by Nov 7 11:59 PM IST
