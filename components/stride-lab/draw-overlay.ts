import type { ClimbSnapshot } from '@/lib/metrics/climb'
import type { Side } from '@/lib/metrics/gait'
import type { MovementSnapshot } from '@/lib/metrics/readout'
import type { Keypoint, KeypointName, Pose } from '@/lib/pose/types'

export interface OverlayTheme {
  bone: string
  highlight: string
  joint: string
  shadow: string
  labelBg: string
  labelText: string
  font: string
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const MIN_SCORE = 0.5

const TORSO_AND_ARMS: [KeypointName, KeypointName][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
]

const legBones = (side: Side): [KeypointName, KeypointName][] => [
  [`${side}_hip`, `${side}_knee`],
  [`${side}_knee`, `${side}_ankle`],
  [`${side}_ankle`, `${side}_heel`],
  [`${side}_heel`, `${side}_foot`],
  [`${side}_ankle`, `${side}_foot`],
]

export function readOverlayTheme(el: HTMLElement): OverlayTheme {
  const css = getComputedStyle(el)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    bone: v('--stage-foreground'),
    highlight: v('--primary'),
    joint: v('--stage'),
    shadow: v('--stage'),
    labelBg: v('--stage'),
    labelText: v('--stage-foreground'),
    font: v('--font-vt323') || 'ui-monospace, monospace',
  }
}

export function videoContentRect(cw: number, ch: number, vw: number, vh: number): Rect {
  if (!vw || !vh) return { x: 0, y: 0, w: cw, h: ch }
  const scale = Math.min(cw / vw, ch / vh)
  const w = vw * scale
  const h = vh * scale
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
}

function pill(
  ctx: CanvasRenderingContext2D,
  theme: OverlayTheme,
  x: number,
  y: number,
  text: string,
  opts: { accent?: string; align?: 'left' | 'right' | 'center'; size?: number } = {},
) {
  const size = (opts.size ?? 13) * 1.45
  ctx.font = `400 ${size}px ${theme.font}`
  const padX = 8
  const w = ctx.measureText(text).width + padX * 2 + (opts.accent ? 10 : 0)
  const h = size + 6
  const left = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x
  const top = y - h / 2
  const edge = opts.accent ?? theme.labelText

  ctx.save()
  ctx.globalAlpha *= 0.85
  ctx.fillStyle = theme.labelBg
  ctx.beginPath()
  ctx.roundRect(left, top, w, h, 3)
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.shadowColor = edge
  ctx.shadowBlur = 8
  ctx.strokeStyle = edge
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(left + 0.5, top + 0.5, w - 1, h - 1, 3)
  ctx.stroke()

  let textX = left + padX
  if (opts.accent) {
    ctx.fillStyle = opts.accent
    ctx.fillRect(left + padX, y - 3, 6, 6)
    textX += 10
  }
  ctx.shadowColor = theme.labelText
  ctx.shadowBlur = 6
  ctx.fillStyle = theme.labelText
  ctx.textBaseline = 'middle'
  ctx.fillText(text, textX, y + 1)
  ctx.restore()
}

const recentPlacementSide = (s: ClimbSnapshot): Side | null =>
  s.lastPlacement && s.timeSec - s.lastPlacement.timeSec < 0.8 ? s.lastPlacement.side : null

function drawClimbAnnotations(
  ctx: CanvasRenderingContext2D,
  theme: OverlayTheme,
  snapshot: ClimbSnapshot,
  ok: (name: KeypointName) => Keypoint | null,
  at: (k: Keypoint) => { x: number; y: number },
  unit: number,
  labelSize: number,
) {
  // Elbow angle on whichever arm is reaching overhead.
  for (const side of ['left', 'right'] as const) {
    const shoulder = ok(`${side}_shoulder`)
    const elbow = ok(`${side}_elbow`)
    const wrist = ok(`${side}_wrist`)
    const angle = snapshot.elbowAngle[side]
    if (!shoulder || !elbow || !wrist || angle === undefined || wrist.y >= shoulder.y) continue
    const pe = at(elbow)
    const outward = pe.x < at(shoulder).x ? -1 : 1
    pill(ctx, theme, pe.x + outward * 18 * unit, pe.y, `ELBOW ${Math.round(angle)}°`, {
      align: outward === 1 ? 'left' : 'right',
      size: labelSize,
      accent: angle < 140 ? theme.highlight : theme.bone,
    })
    break
  }

  const placement = snapshot.lastPlacement
  if (placement) {
    const age = snapshot.timeSec - placement.timeSec
    const foot = ok(`${placement.side}_ankle`)
    if (age >= 0 && age < 1.4 && foot) {
      ctx.globalAlpha = age < 0.6 ? 1 : Math.max(0.25, 1 - (age - 0.6) / 0.8)
      const p = at(foot)
      const r = 14 * unit
      ctx.strokeStyle = placement.readjust ? theme.highlight : theme.bone
      ctx.lineWidth = 2 * unit
      ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2)
      ctx.beginPath()
      ctx.moveTo(p.x - r * 1.6, p.y)
      ctx.lineTo(p.x - r, p.y)
      ctx.moveTo(p.x + r, p.y)
      ctx.lineTo(p.x + r * 1.6, p.y)
      ctx.stroke()
      const toe =
        placement.toeDownDeg === null
          ? ''
          : ` · TOE ${placement.toeDownDeg >= 0 ? '+' : '−'}${Math.abs(placement.toeDownDeg).toFixed(0)}°`
      pill(ctx, theme, p.x, p.y + r + 16 * unit, placement.readjust ? `RE-ADJUST${toe}` : `PLACED${toe}`, {
        align: 'center',
        size: labelSize,
        accent: placement.readjust ? theme.highlight : theme.bone,
      })
      ctx.globalAlpha = 1
    }
  }

  const nose = ok('nose')
  if (nose && snapshot.movesPerMin) {
    const p = at(nose)
    pill(ctx, theme, p.x, p.y - 32 * unit, `${snapshot.movesPerMin.toFixed(1)} MOVES/MIN`, {
      align: 'center',
      size: labelSize,
      accent: theme.bone,
    })
  }
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  pose: Pose | null,
  snapshot: MovementSnapshot | null,
  theme: OverlayTheme,
) {
  if (!pose) return

  const at = (k: Keypoint) => ({ x: rect.x + k.x * rect.w, y: rect.y + k.y * rect.h })
  const ok = (name: KeypointName) => {
    const k = pose[name]
    return k && k.score >= MIN_SCORE ? k : null
  }
  const unit = Math.max(1, rect.h / 540)
  const activeSide =
    snapshot?.sport === 'climbing'
      ? (snapshot.movingFoot ?? recentPlacementSide(snapshot))
      : (snapshot?.lastStrike?.side ?? null)

  const strokeBones = (bones: [KeypointName, KeypointName][], color: string, width: number) => {
    for (const [a, b] of bones) {
      const ka = ok(a)
      const kb = ok(b)
      if (!ka || !kb) continue
      const pa = at(ka)
      const pb = at(kb)
      ctx.lineCap = 'round'
      ctx.strokeStyle = theme.shadow
      ctx.globalAlpha = 0.55
      ctx.lineWidth = width + 4 * unit
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.save()
      ctx.shadowColor = color
      ctx.shadowBlur = 14 * unit
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
      ctx.restore()
    }
  }

  strokeBones(TORSO_AND_ARMS, theme.bone, 3 * unit)
  for (const side of ['left', 'right'] as const) {
    strokeBones(legBones(side), side === activeSide ? theme.highlight : theme.bone, 4 * unit)
  }

  const nose = ok('nose')
  const joints: KeypointName[] = [
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
    'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
  ]
  for (const name of joints) {
    const k = ok(name)
    if (!k) continue
    const p = at(k)
    ctx.fillStyle = theme.joint
    ctx.strokeStyle = theme.bone
    ctx.lineWidth = 2 * unit
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4.5 * unit, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  if (nose) {
    const p = at(nose)
    ctx.strokeStyle = theme.bone
    ctx.lineWidth = 2 * unit
    ctx.beginPath()
    ctx.arc(p.x, p.y, 9 * unit, 0, Math.PI * 2)
    ctx.stroke()
  }

  const labelSize = Math.round(12 * unit)

  if (snapshot?.sport === 'climbing') {
    drawClimbAnnotations(ctx, theme, snapshot, ok, at, unit, labelSize)
    return
  }

  const direction = snapshot?.direction ?? 1

  // Knee angle, anchored at the knee with an arc between thigh and shin.
  const kneeSide: Side | null =
    activeSide && snapshot?.kneeAngle[activeSide] !== undefined
      ? activeSide
      : snapshot?.kneeAngle.left !== undefined
        ? 'left'
        : snapshot?.kneeAngle.right !== undefined
          ? 'right'
          : null
  if (kneeSide && snapshot) {
    const hip = ok(`${kneeSide}_hip`)
    const knee = ok(`${kneeSide}_knee`)
    const ankle = ok(`${kneeSide}_ankle`)
    const angle = snapshot.kneeAngle[kneeSide]
    if (hip && knee && ankle && angle !== undefined) {
      const pk = at(knee)
      const ph = at(hip)
      const pa = at(ankle)
      const a1 = Math.atan2(ph.y - pk.y, ph.x - pk.x)
      const a2 = Math.atan2(pa.y - pk.y, pa.x - pk.x)
      let delta = a2 - a1
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      ctx.strokeStyle = theme.highlight
      ctx.lineWidth = 2.5 * unit
      ctx.beginPath()
      ctx.arc(pk.x, pk.y, 22 * unit, a1, a1 + delta, delta < 0)
      ctx.stroke()
      pill(ctx, theme, pk.x - direction * 30 * unit, pk.y, `KNEE ${Math.round(angle)}°`, {
        align: direction === 1 ? 'right' : 'left',
        size: labelSize,
        accent: theme.highlight,
      })
    }
  }

  // Overstride dimension at the most recent foot contact.
  const strike = snapshot?.lastStrike
  if (strike && snapshot) {
    const age = snapshot.timeSec - strike.timeSec
    if (age >= 0 && age < 1.2) {
      ctx.globalAlpha = age < 0.5 ? 1 : Math.max(0.25, 1 - (age - 0.5) / 0.7)
      const ground = rect.y + strike.ankle.y * rect.h + 16 * unit
      const hipX = rect.x + strike.hipX * rect.w
      const ankleX = rect.x + strike.ankle.x * rect.w
      const hipK = ok('left_hip') ?? ok('right_hip')
      const hipY = hipK ? at(hipK).y : ground - rect.h * 0.3

      ctx.setLineDash([4 * unit, 4 * unit])
      ctx.strokeStyle = theme.bone
      ctx.lineWidth = 1.5 * unit
      ctx.beginPath()
      ctx.moveTo(hipX, hipY)
      ctx.lineTo(hipX, ground + 6 * unit)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.strokeStyle = theme.highlight
      ctx.lineWidth = 2.5 * unit
      ctx.beginPath()
      ctx.moveTo(hipX, ground)
      ctx.lineTo(ankleX, ground)
      ctx.moveTo(hipX, ground - 6 * unit)
      ctx.lineTo(hipX, ground + 6 * unit)
      ctx.moveTo(ankleX, ground - 6 * unit)
      ctx.lineTo(ankleX, ground + 6 * unit)
      ctx.stroke()

      const cm = strike.overstrideCm
      const text = `${cm >= 0 ? '+' : '−'}${Math.abs(cm).toFixed(0)} CM AHEAD OF HIPS`
      pill(ctx, theme, (hipX + ankleX) / 2, ground + 20 * unit, text, {
        align: 'center',
        size: labelSize,
        accent: theme.highlight,
      })
      ctx.globalAlpha = 1
    }
  }

  // Cadence, anchored at the head.
  if (nose && snapshot?.cadenceSpm) {
    const p = at(nose)
    pill(ctx, theme, p.x, p.y - 32 * unit, `${Math.round(snapshot.cadenceSpm)} SPM`, {
      align: 'center',
      size: labelSize,
      accent: theme.bone,
    })
  }
}
