import type { HeroFrame, Point } from '@/lib/hero/frame'
import type { MetricReading, Sport } from '@/lib/metrics/readout'
import type { OverlayTheme } from '../draw-overlay'
import type { HeroCaption } from '@/lib/hero/narrator'

export type Grade = 'film' | 'mono' | 'clean'

export const GRADES: Record<Grade, { label: string; filter: string; tint: number }> = {
  film: { label: 'Film', filter: 'contrast(1.12) saturate(0.82) sepia(0.18) brightness(1.02)', tint: 0.28 },
  mono: { label: 'Mono', filter: 'grayscale(1) contrast(1.28) brightness(1.04)', tint: 0.12 },
  clean: { label: 'Clean', filter: 'contrast(1.05) saturate(1.06)', tint: 0 },
}

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350
// Photo takes 75% of the card — social-first layout. Bottom band is 25%.
const PHOTO_RATIO = 0.75
const PHOTO_HEIGHT = Math.round(CARD_HEIGHT * PHOTO_RATIO)
const BAND_HEIGHT = CARD_HEIGHT - PHOTO_HEIGHT
const MARGIN = 56

export interface CardInput {
  photo: HTMLImageElement
  frame: HeroFrame
  grade: Grade
  theme: OverlayTheme
  metrics: MetricReading[]
  sport: Sport
  caption: HeroCaption
  pick: string | null
  impression: boolean
  date: string
}

function cropFor(frame: HeroFrame, pw: number, ph: number) {
  const aspect = CARD_WIDTH / PHOTO_HEIGHT
  const bw = frame.box.w * pw
  const bh = frame.box.h * ph
  const CROP_PADDING = 0.32
  const pad = CROP_PADDING * Math.max(bw, bh)
  let cw = Math.max(bw + pad * 2, (bh + pad * 2) * aspect)
  let ch = cw / aspect
  if (cw > pw) [cw, ch] = [pw, pw / aspect]
  if (ch > ph) [cw, ch] = [ph * aspect, ph]
  const cx = (frame.box.x + frame.box.w / 2) * pw
  const cy = (frame.box.y + frame.box.h / 2) * ph
  const sx = Math.min(Math.max(cx - cw / 2, 0), pw - cw)
  const sy = Math.min(Math.max(cy - ch / 2, 0), ph - ch)
  return { sx, sy, cw, ch }
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

// fit() was removed — card no longer shows per-metric labels in the bottom band.

function drawTrail(ctx: CanvasRenderingContext2D, points: Point[], color: string) {
  if (points.length < 2) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 22
  for (let i = 1; i < points.length; i++) {
    const t = i / (points.length - 1)
    ctx.globalAlpha = 0.08 + t * 0.62
    ctx.lineWidth = 3 + t * 11
    ctx.beginPath()
    ctx.moveTo(points[i - 1].x, points[i - 1].y)
    ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
  }
  ctx.restore()
}

function tag(ctx: CanvasRenderingContext2D, theme: OverlayTheme, x: number, y: number, text: string, align: 'left' | 'right') {
  ctx.save()
  ctx.font = `400 30px ${theme.font}`
  const w = ctx.measureText(text).width + 24
  const left = align === 'right' ? x - w : x
  ctx.globalAlpha = 0.82
  ctx.fillStyle = theme.labelBg
  ctx.beginPath()
  ctx.roundRect(left, y, w, 46, 6)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = theme.labelText
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = theme.labelText
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + 12, y + 23)
  ctx.restore()
}

/** Render the headline as text over the photo (upper third, safe from IG UI). */
function renderHeadline(ctx: CanvasRenderingContext2D, theme: OverlayTheme, caption: HeroCaption) {
  const x = MARGIN
  const y = PHOTO_HEIGHT * 0.2
  const maxWidth = CARD_WIDTH - MARGIN * 2

  ctx.save()
  ctx.fillStyle = theme.bone
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 2
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 72px ${theme.font}`
  const wrapped = wrapText(ctx, caption.headline, maxWidth)
  // Headline may be multi-line; render with line height
  wrapped.forEach((line, i) => {
    ctx.fillText(line, x, y + i * 86)
  })
  ctx.restore()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''
  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = test
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines.length > 0 ? lines : ['']
}

export function renderCard(ctx: CanvasRenderingContext2D, input: CardInput) {
  const { photo, frame, grade, theme, sport, caption, impression, date } = input
  const pw = photo.naturalWidth
  const ph = photo.naturalHeight
  const { sx, sy, cw, ch } = cropFor(frame, pw, ph)
  const scale = CARD_WIDTH / cw

  // ── PHOTO LAYER ──────────────────────────────────────────────────
  ctx.save()
  ctx.fillStyle = theme.shadow
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  ctx.filter = GRADES[grade].filter
  ctx.drawImage(photo, sx, sy, cw, ch, 0, 0, CARD_WIDTH, PHOTO_HEIGHT)
  ctx.filter = 'none'

  // Warm film tint
  if (GRADES[grade].tint > 0) {
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = GRADES[grade].tint
    ctx.fillStyle = theme.bone
    ctx.fillRect(0, 0, CARD_WIDTH, PHOTO_HEIGHT)
  }

  // Grain overlay
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 0.07
  ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat')!
  ctx.fillRect(0, 0, CARD_WIDTH, PHOTO_HEIGHT)

  // Vignette — focus on the figure, darken edges
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 0.8
  const vignette = ctx.createRadialGradient(
    CARD_WIDTH / 2, PHOTO_HEIGHT * 0.4, PHOTO_HEIGHT * 0.35,
    CARD_WIDTH / 2, PHOTO_HEIGHT * 0.4, PHOTO_HEIGHT * 0.9,
  )
  vignette.addColorStop(0, 'transparent')
  vignette.addColorStop(1, theme.shadow)
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, CARD_WIDTH, PHOTO_HEIGHT)
  ctx.restore()

  // Skeleton trails
  for (const trail of frame.trails) {
    drawTrail(
      ctx,
      trail.map((p) => ({ x: (p.x * pw - sx) * scale, y: (p.y * ph - sy) * scale })),
      theme.highlight,
    )
  }

  // Top tags
  tag(ctx, theme, MARGIN, 40, `${sport.toUpperCase()} · HERO FRAME`, 'left')
  if (impression) tag(ctx, theme, CARD_WIDTH - MARGIN, 40, 'AI IMPRESSION', 'right')

  // Headline on the photo — upper third, safe from Instagram UI
  renderHeadline(ctx, theme, caption)

  // ── BOTTOM BAND ──────────────────────────────────────────────────
  ctx.save()
  ctx.fillStyle = theme.shadow
  ctx.fillRect(0, PHOTO_HEIGHT, CARD_WIDTH, BAND_HEIGHT)

  // Thin divider line
  ctx.globalAlpha = 0.45
  ctx.fillStyle = theme.bone
  ctx.fillRect(0, PHOTO_HEIGHT, CARD_WIDTH, 1.5)
  ctx.globalAlpha = 1

  // ONE BOLD METRIC — the standout that defines this user
  const { value, unit, description } = caption.standoutMetric
  ctx.fillStyle = theme.bone
  ctx.textBaseline = 'alphabetic'

  // Metric value — massive
  ctx.font = `400 140px ${theme.font}`
  ctx.fillText(value, MARGIN, PHOTO_HEIGHT + 130)

  // Unit — small, next to value
  ctx.font = `400 52px ${theme.font}`
  const valueWidth = ctx.measureText(value).width
  ctx.globalAlpha = 0.7
  ctx.fillText(unit, MARGIN + valueWidth + 12, PHOTO_HEIGHT + 128)
  ctx.globalAlpha = 1

  // Metric label — below value
  ctx.font = `400 30px ${theme.font}`
  ctx.globalAlpha = 0.6
  ctx.fillText(description, MARGIN, PHOTO_HEIGHT + 170)
  ctx.globalAlpha = 1

  // BRAND LINE — right side, date + brand
  ctx.textAlign = 'right'
  ctx.font = `400 32px ${theme.font}`
  ctx.fillStyle = theme.bone
  ctx.globalAlpha = 0.5
  ctx.fillText(date, CARD_WIDTH - MARGIN, PHOTO_HEIGHT + 55)
  ctx.globalAlpha = 0.85
  ctx.font = `400 36px ${theme.font}`
  ctx.fillText('forma · vertiqal.vercel.app', CARD_WIDTH - MARGIN, PHOTO_HEIGHT + 100)
  ctx.textAlign = 'left'

  // FOOTER — CTA line
  ctx.font = `400 28px ${theme.font}`
  ctx.fillStyle = theme.highlight
  const footer = caption.sport === 'running'
    ? '> YOUR BODY IS THE SEARCH QUERY'
    : '> YOUR BODY IS THE SEARCH QUERY'
  ctx.fillText(footer, MARGIN, PHOTO_HEIGHT + BAND_HEIGHT - 36)

  ctx.restore()
}
