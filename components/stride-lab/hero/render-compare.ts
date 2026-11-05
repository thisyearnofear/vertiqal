import type { HeroFrame, Point } from '@/lib/hero/frame'
import type { MetricReading } from '@/lib/metrics/readout'
import type { OverlayTheme } from '../draw-overlay'
import type { ComparisonResult } from '@/lib/hero/comparison'

export type CompareGrade = 'film' | 'mono' | 'clean'

export const COMPARE_GRADES: Record<CompareGrade, { label: string; filter: string }> = {
  film: { label: 'Film', filter: 'contrast(1.12) saturate(0.82) sepia(0.18) brightness(1.02)' },
  mono: { label: 'Mono', filter: 'grayscale(1) contrast(1.28) brightness(1.04)' },
  clean: { label: 'Clean', filter: 'contrast(1.05) saturate(1.06)' },
}

/**
 * Square card (1080×1080) — optimized for Instagram feed and cross-platform sharing.
 * Shows before/after split with the headline and key changes.
 */
export const COMPARE_WIDTH = 1080
export const COMPARE_HEIGHT = 1080
const HALF = COMPARE_HEIGHT / 2
const MARGIN = 52
const FOOTER_HEIGHT = 180

export interface CompareCardInput {
  beforePhoto: HTMLImageElement
  afterPhoto: HTMLImageElement
  beforeFrame: HeroFrame | null
  afterFrame: HeroFrame | null
  beforeMetrics: MetricReading[]
  afterMetrics: MetricReading[]
  comparison: ComparisonResult
  grade: CompareGrade
  theme: OverlayTheme
  dateBefore: string
  dateAfter: string
}

function cropFor(frame: HeroFrame, pw: number, ph: number) {
  const CROP_PADDING = 0.30
  const halfHeight = ph / 2
  const bw = frame.box.w * pw
  const bh = frame.box.h * ph
  const pad = CROP_PADDING * Math.max(bw, bh)
  let cw = Math.max(bw + pad * 2, (bh + pad * 2) * (COMPARE_WIDTH / halfHeight))
  let ch = cw / (COMPARE_WIDTH / halfHeight)
  if (cw > pw) [cw, ch] = [pw, pw / (COMPARE_WIDTH / halfHeight)]
  const cx = (frame.box.x + frame.box.w / 2) * pw
  const cy = (frame.box.y + frame.box.h / 2) * ph
  const sx = Math.min(Math.max(cx - cw / 2, 0), pw - cw)
  const sy = Math.min(Math.max(cy - ch / 2, 0), ph - ch)
  return { sx, sy: Math.min(sy, halfHeight - ch), cw, ch }
}

let grain: HTMLCanvasElement | null = null
function grainTile() {
  if (grain) return grain
  grain = document.createElement('canvas')
  grain.width = grain.height = 160
  const ctx = grain.getContext('2d')!
  const pixels = ctx.createImageData(160, 160)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = Math.random() * 255
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v
    pixels.data[i + 3] = 255
  }
  ctx.putImageData(pixels, 0, 0)
  return grain
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

function drawTrail(ctx: CanvasRenderingContext2D, points: Point[], color: string, alpha: number = 0.6) {
  if (points.length < 2) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 18
  for (let i = 1; i < points.length; i++) {
    const t = i / (points.length - 1)
    ctx.globalAlpha = alpha * (0.08 + t * 0.92)
    ctx.lineWidth = 2 + t * 8
    ctx.beginPath()
    ctx.moveTo(points[i - 1].x, points[i - 1].y)
    ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
  }
  ctx.restore()
}

function tag(ctx: CanvasRenderingContext2D, theme: OverlayTheme, x: number, y: number, text: string) {
  ctx.save()
  ctx.font = `400 24px ${theme.font}`
  const w = ctx.measureText(text).width + 18
  ctx.globalAlpha = 0.82
  ctx.fillStyle = theme.labelBg
  ctx.beginPath()
  ctx.roundRect(x, y, w, 38, 4)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = theme.labelText
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 9, y + 19)
  ctx.restore()
}

function drawSplitPhoto(
  ctx: CanvasRenderingContext2D,
  before: HTMLImageElement,
  after: HTMLImageElement,
  beforeFrame: HeroFrame | null,
  afterFrame: HeroFrame | null,
  theme: OverlayTheme,
) {
  const bw = before.naturalWidth
  const bh = before.naturalHeight
  const aw = after.naturalWidth
  const ah = after.naturalHeight

  // Before — left half, top
  if (beforeFrame) {
    const crop = cropFor(beforeFrame, bw, bh)
    ctx.filter = COMPARE_GRADES.film.filter
    ctx.drawImage(before, crop.sx, crop.sy, crop.cw, crop.ch, 0, 0, COMPARE_WIDTH / 2, HALF)
    ctx.filter = 'none'

    // Vignette on before
    const vig = ctx.createRadialGradient(
      COMPARE_WIDTH / 4, HALF * 0.5, HALF * 0.25,
      COMPARE_WIDTH / 4, HALF * 0.5, HALF * 0.7,
    )
    vig.addColorStop(0, 'transparent')
    vig.addColorStop(1, theme.shadow)
    ctx.globalAlpha = 0.6
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, COMPARE_WIDTH / 2, HALF)
    ctx.globalAlpha = 1

    // Trails on before
    drawTrail(
      ctx,
      beforeFrame.trails[0].map((p) => ({ x: p.x * (COMPARE_WIDTH / 2), y: Math.min(p.y * HALF, HALF - 10) })),
      theme.highlight,
      0.5,
    )
  }

  // After — right half, top
  if (afterFrame) {
    const crop = cropFor(afterFrame, aw, ah)
    ctx.filter = COMPARE_GRADES.clean.filter
    ctx.drawImage(after, crop.sx, crop.sy, crop.cw, crop.ch, COMPARE_WIDTH / 2, 0, COMPARE_WIDTH / 2, HALF)
    ctx.filter = 'none'

    // Vignette on after
    const vig = ctx.createRadialGradient(
      COMPARE_WIDTH * 0.75, HALF * 0.5, HALF * 0.25,
      COMPARE_WIDTH * 0.75, HALF * 0.5, HALF * 0.7,
    )
    vig.addColorStop(0, 'transparent')
    vig.addColorStop(1, theme.shadow)
    ctx.globalAlpha = 0.6
    ctx.fillStyle = vig
    ctx.fillRect(COMPARE_WIDTH / 2, 0, COMPARE_WIDTH / 2, HALF)
    ctx.globalAlpha = 1

    // Trails on after
    drawTrail(
      ctx,
      afterFrame.trails[0].map((p) => ({ x: COMPARE_WIDTH / 2 + p.x * (COMPARE_WIDTH / 2), y: Math.min(p.y * HALF, HALF - 10) })),
      theme.highlight,
      0.6,
    )
  }

  // Center divider
  ctx.strokeStyle = theme.bone
  ctx.globalAlpha = 0.3
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(COMPARE_WIDTH / 2, 0)
  ctx.lineTo(COMPARE_WIDTH / 2, HALF)
  ctx.stroke()
  ctx.globalAlpha = 1

  // Labels
  tag(ctx, theme, MARGIN, 30, 'BEFORE')
  tag(ctx, theme, COMPARE_WIDTH / 2 + MARGIN, 30, 'AFTER')
}

export function renderCompareCard(ctx: CanvasRenderingContext2D, input: CompareCardInput) {
  const { beforePhoto, afterPhoto, beforeFrame, afterFrame, theme, comparison, dateBefore, dateAfter } = input

  // Background
  ctx.save()
  ctx.fillStyle = theme.shadow
  ctx.fillRect(0, 0, COMPARE_WIDTH, COMPARE_HEIGHT)

  // Split photos
  drawSplitPhoto(ctx, beforePhoto, afterPhoto, beforeFrame, afterFrame, theme)

  // Grain overlay on top
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 0.04
  ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat')!
  ctx.fillRect(0, 0, COMPARE_WIDTH, HALF)
  ctx.globalCompositeOperation = 'source-over'

  // ── BOTTOM BAND ────────────────────────────────────────────
  ctx.fillStyle = theme.shadow
  ctx.fillRect(0, HALF, COMPARE_WIDTH, FOOTER_HEIGHT)

  // Divider
  ctx.globalAlpha = 0.45
  ctx.fillStyle = theme.bone
  ctx.fillRect(0, HALF, COMPARE_WIDTH, 1)
  ctx.globalAlpha = 1

  // Headline
  ctx.fillStyle = theme.bone
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 12
  ctx.font = `600 56px ${theme.font}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(fit(ctx, comparison.headline, COMPARE_WIDTH - MARGIN * 2), MARGIN, HALF + 72)

  // Key change — biggest delta
  const top = comparison.notableChanges[0]
  if (top) {
    ctx.shadowBlur = 0
    ctx.globalAlpha = 0.8
    ctx.font = `400 34px ${theme.font}`
    ctx.fillText(
      `${top.label}: ${top.before}${top.unit} → ${top.after}${top.unit} (${top.delta > 0 ? '+' : ''}${top.delta}${top.unit})`,
      MARGIN,
      HALF + 118,
    )
    ctx.globalAlpha = 1
  }

  // Date line
  ctx.globalAlpha = 0.5
  ctx.font = `400 26px ${theme.font}`
  ctx.textAlign = 'right'
  ctx.fillText(`${dateBefore} → ${dateAfter}`, COMPARE_WIDTH - MARGIN, HALF + 60)
  ctx.textAlign = 'left'

  // Brand + CTA
  ctx.globalAlpha = 0.7
  ctx.font = `400 28px ${theme.font}`
  ctx.fillStyle = theme.highlight
  ctx.fillText('> FILM AGAIN TO SEE WHAT CHANGED', MARGIN, HALF + FOOTER_HEIGHT - 36)

  // Brand
  ctx.globalAlpha = 0.4
  ctx.textAlign = 'right'
  ctx.font = `400 30px ${theme.font}`
  ctx.fillStyle = theme.bone
  ctx.fillText('forma', COMPARE_WIDTH - MARGIN, HALF + FOOTER_HEIGHT - 36)
  ctx.textAlign = 'left'

  ctx.restore()
}
