import type { HeroFrame, Point } from '@/lib/hero/frame'
import type { MetricReading, Sport } from '@/lib/metrics/readout'
import type { OverlayTheme } from '../draw-overlay'

export type Grade = 'film' | 'mono' | 'clean'

export const GRADES: Record<Grade, { label: string; filter: string; tint: number }> = {
  film: { label: 'Film', filter: 'contrast(1.12) saturate(0.82) sepia(0.18) brightness(1.02)', tint: 0.28 },
  mono: { label: 'Mono', filter: 'grayscale(1) contrast(1.28) brightness(1.04)', tint: 0.12 },
  clean: { label: 'Clean', filter: 'contrast(1.05) saturate(1.06)', tint: 0 },
}

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350
const BAND_HEIGHT = 300
const PHOTO_HEIGHT = CARD_HEIGHT - BAND_HEIGHT
const MARGIN = 60
const CROP_PADDING = 0.32

export interface CardInput {
  photo: HTMLImageElement
  frame: HeroFrame
  grade: Grade
  theme: OverlayTheme
  metrics: MetricReading[]
  sport: Sport
  pick: string | null
  impression: boolean
  date: string
}

function cropFor(frame: HeroFrame, pw: number, ph: number) {
  const aspect = CARD_WIDTH / PHOTO_HEIGHT
  const bw = frame.box.w * pw
  const bh = frame.box.h * ph
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

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

const formatValue = (value: number) => (Math.abs(value) >= 10 ? String(Math.round(value)) : value.toFixed(1))

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
  ctx.font = `400 34px ${theme.font}`
  const w = ctx.measureText(text).width + 28
  const left = align === 'right' ? x - w : x
  ctx.globalAlpha = 0.82
  ctx.fillStyle = theme.labelBg
  ctx.beginPath()
  ctx.roundRect(left, y, w, 50, 6)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = theme.labelText
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = theme.labelText
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + 14, y + 27)
  ctx.restore()
}

export function renderCard(ctx: CanvasRenderingContext2D, input: CardInput) {
  const { photo, frame, grade, theme, metrics, sport, pick, impression, date } = input
  const pw = photo.naturalWidth
  const ph = photo.naturalHeight
  const { sx, sy, cw, ch } = cropFor(frame, pw, ph)
  const scale = CARD_WIDTH / cw

  ctx.save()
  ctx.fillStyle = theme.shadow
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  ctx.filter = GRADES[grade].filter
  ctx.drawImage(photo, sx, sy, cw, ch, 0, 0, CARD_WIDTH, PHOTO_HEIGHT)
  ctx.filter = 'none'

  if (GRADES[grade].tint > 0) {
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = GRADES[grade].tint
    ctx.fillStyle = theme.bone
    ctx.fillRect(0, 0, CARD_WIDTH, PHOTO_HEIGHT)
  }

  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 0.07
  ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat')!
  ctx.fillRect(0, 0, CARD_WIDTH, PHOTO_HEIGHT)

  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 0.8
  const vignette = ctx.createRadialGradient(CARD_WIDTH / 2, PHOTO_HEIGHT * 0.45, PHOTO_HEIGHT * 0.3, CARD_WIDTH / 2, PHOTO_HEIGHT * 0.45, PHOTO_HEIGHT * 0.85)
  vignette.addColorStop(0, 'transparent')
  vignette.addColorStop(1, theme.shadow)
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, CARD_WIDTH, PHOTO_HEIGHT)
  ctx.restore()

  for (const trail of frame.trails) {
    drawTrail(
      ctx,
      trail.map((p) => ({ x: (p.x * pw - sx) * scale, y: (p.y * ph - sy) * scale })),
      theme.highlight,
    )
  }

  tag(ctx, theme, MARGIN - 20, 40, `${sport.toUpperCase()} · HERO FRAME`, 'left')
  if (impression) tag(ctx, theme, CARD_WIDTH - MARGIN + 20, 40, 'AI IMPRESSION', 'right')

  ctx.save()
  ctx.fillStyle = theme.shadow
  ctx.fillRect(0, PHOTO_HEIGHT, CARD_WIDTH, BAND_HEIGHT)
  ctx.globalAlpha = 0.45
  ctx.fillStyle = theme.bone
  ctx.fillRect(0, PHOTO_HEIGHT, CARD_WIDTH, 2)
  ctx.globalAlpha = 1

  ctx.fillStyle = theme.bone
  ctx.shadowColor = theme.bone
  ctx.shadowBlur = 14
  ctx.textBaseline = 'alphabetic'
  ctx.font = `400 84px ${theme.font}`
  ctx.fillText('vertiqal', MARGIN, PHOTO_HEIGHT + 86)
  ctx.shadowBlur = 6
  ctx.globalAlpha = 0.7
  ctx.font = `400 36px ${theme.font}`
  ctx.textAlign = 'right'
  ctx.fillText(date, CARD_WIDTH - MARGIN, PHOTO_HEIGHT + 80)
  ctx.textAlign = 'left'
  ctx.globalAlpha = 1

  const shown = metrics.filter((m) => m.value !== null).slice(0, 3)
  const column = (CARD_WIDTH - MARGIN * 2) / 3
  shown.forEach((metric, i) => {
    const x = MARGIN + column * i
    ctx.font = `400 72px ${theme.font}`
    const value = formatValue(metric.value!)
    ctx.fillText(value, x, PHOTO_HEIGHT + 180)
    const valueWidth = ctx.measureText(value).width
    ctx.globalAlpha = 0.7
    ctx.font = `400 32px ${theme.font}`
    ctx.fillText(metric.unit, x + valueWidth + 10, PHOTO_HEIGHT + 180)
    ctx.fillText(fit(ctx, metric.label.toUpperCase(), column - 24), x, PHOTO_HEIGHT + 220)
    ctx.globalAlpha = 1
  })

  ctx.font = `400 34px ${theme.font}`
  ctx.fillStyle = theme.highlight
  ctx.shadowColor = theme.highlight
  const footer = pick ? `> FORMA PICK · ${pick.toUpperCase()}` : '> YOUR BODY IS THE SEARCH QUERY'
  ctx.fillText(fit(ctx, footer, CARD_WIDTH - MARGIN * 2), MARGIN, PHOTO_HEIGHT + 272)
  ctx.restore()
}
