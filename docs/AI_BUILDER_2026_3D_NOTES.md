# AI Builder Hackathon 2026 - 3D Notes (Vertiqal / Forma)

Entry: separate from SnapFlip. Repo already date-eligible (Sep 27, in Sep 11-Nov 11 window), browser + AI agent + live demo. Gap to close: 3D.

## Concept: Movement Twin
Retarget existing in-browser MediaPipe stream (`lib/pose`, `lib/metrics`) to a Three.js / R3F humanoid in Stride Lab. Overstride, foot-strike, hip-drop, climbing reach envelope rendered as vectors in space. Gear agent (Grok via AI Gateway) narrates and points in 3D. Hero frame becomes shareable 3D stride.

Why it fits brief: multimodal copilot (phone clip -> pose -> 3D -> brief -> stock), intelligent NPC (gear agent), procedural visualization, experimental web UI. Video stays on-device story preserved.

## User loop (keep current, add 3D)
1. Film / upload / live camera as today, pose runs on-device
2. 3D twin mirrors movement, metrics pinned as 3D annotations
3. Confirm brief (chips + sentence) -> Find my shoes
4. Agent researches + Solari stock checks as today, results linked from 3D pins
5. Fit Passport + WhatsApp handoff unchanged, add 3D snapshot to passport

## Tech deltas
- `components/stride-lab/twin/`: R3F avatar, retarget from pose-provider contract, no new pose dep
- Reuse provider fallback (MediaPipe default, VLM Run optional), cap at 12fps overlay logic already proven
- Keep App Router thin: pose in client, agent tools in `lib/agent`, no video upload unless opt-in
- WebGL first, WebGPU materials only if cheap (see trustfall pattern)

## Tasks
- [ ] Twin rig + metric vectors (overstride, strike, hips / reach)
- [ ] Agent narration anchors to 3D pins
- [ ] 3D snapshot export for hero card + passport
- [ ] Mobile perf pass (docked bar, scroll, camera checks already listed in README)
- [ ] Demo clip with real consented footage (synthetic clip cannot validate accuracy)

## Demo / submission checklist
- Runs at vertiqal.vercel.app in browser, backend allowed
- Working demo: measure -> twin -> brief -> picks with receipts
- Note AI use, pose limits, no accuracy claims beyond validation workflow
- Public repo + demo URL submitted before Nov 11

## Risks
- Motion accuracy: keep validation workflow, label synthetic fixtures
- Scope: defer Last Lab procedural shoe morph until Twin ships
