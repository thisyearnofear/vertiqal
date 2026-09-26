'use client'

import { memo, useEffect } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import type { Mood, Shape } from '@/lib/persona'

/**
 * Procedural avatar: a body primitive plus two eyes. Expressions are offsets from the
 * neutral eye, so every shape shares the same behaviour. High-frequency values live in
 * Motion values, so mood changes and blinking never re-render React.
 */
interface Expression {
  open: number
  width: number
  lookX: number
  lookY: number
  tilt: number
  smile: number
}

const NEUTRAL: Expression = { open: 1, width: 1, lookX: 0, lookY: 0, tilt: 0, smile: 0 }

const EXPRESSIONS: Record<Mood, Partial<Expression>> = {
  asleep: { open: 0.12, lookY: 3 },
  watching: { lookX: -4, lookY: 3 },
  ready: { open: 1.15, width: 1.05 },
  thinking: { open: 0.7, lookX: 5, lookY: -5, tilt: 8 },
  searching: { open: 0.9 },
  pleased: { smile: 1 },
  asking: { open: 1.25, width: 1.1, tilt: -7 },
  working: { open: 0.8, tilt: 10 },
  sad: { open: 0.6, lookY: 4, tilt: -14 },
}

const SCANNING: Partial<Record<Mood, number>> = { searching: 1.2, working: 2.2 }

const BODY: Record<Shape, { d: string; eyeY: number; eyeGap: number }> = {
  pebble: { d: 'M30 20 H70 A24 24 0 0 1 94 44 V58 A24 24 0 0 1 70 82 H30 A24 24 0 0 1 6 58 V44 A24 24 0 0 1 30 20 Z', eyeY: 50, eyeGap: 14 },
  orb: { d: 'M50 14 A37 37 0 1 1 49.99 14 Z', eyeY: 50, eyeGap: 13 },
  visor: { d: 'M22 30 H78 A18 18 0 0 1 96 48 V54 A18 18 0 0 1 78 72 H22 A18 18 0 0 1 4 54 V48 A18 18 0 0 1 22 30 Z', eyeY: 51, eyeGap: 18 },
  crag: { d: 'M48 12 L80 24 L94 56 L72 88 L30 90 L8 62 L18 26 Z', eyeY: 52, eyeGap: 13 },
}

function Eye({
  cx,
  cy,
  side,
  open,
  blink,
  width,
  tilt,
  smile,
}: {
  cx: number
  cy: number
  side: 1 | -1
  open: MotionValue<number>
  blink: MotionValue<number>
  width: MotionValue<number>
  tilt: MotionValue<number>
  smile: MotionValue<number>
}) {
  const scaleY = useTransform([open, blink], ([o, b]: number[]) => o * b)
  const rotate = useTransform(tilt, (t) => t * side)
  const eyeOpacity = useTransform(smile, (s) => 1 - s)

  return (
    <motion.g style={{ scaleX: width, rotate, transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}>
      <motion.rect
        x={cx - 5}
        y={cy - 8}
        width={10}
        height={16}
        rx={5}
        fill="currentColor"
        style={{ scaleY, opacity: eyeOpacity, transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}
      />
      <motion.path
        d={`M${cx - 6} ${cy + 3} Q${cx} ${cy - 7} ${cx + 6} ${cy + 3}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        style={{ opacity: smile }}
      />
    </motion.g>
  )
}

export const FormaAvatar = memo(function FormaAvatar({
  mood,
  shape,
  className,
}: {
  mood: Mood
  shape: Shape
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const open = useMotionValue(NEUTRAL.open)
  const width = useMotionValue(NEUTRAL.width)
  const lookX = useMotionValue(NEUTRAL.lookX)
  const lookY = useMotionValue(NEUTRAL.lookY)
  const tilt = useMotionValue(NEUTRAL.tilt)
  const smile = useMotionValue(NEUTRAL.smile)
  const blink = useMotionValue(1)
  const bob = useMotionValue(0)

  useEffect(() => {
    const target = { ...NEUTRAL, ...EXPRESSIONS[mood] }
    const spring = { type: 'spring' as const, stiffness: 260, damping: 22 }
    const controls = [
      animate(open, target.open, spring),
      animate(width, target.width, spring),
      animate(lookY, target.lookY, spring),
      animate(tilt, target.tilt, spring),
      animate(smile, target.smile, { duration: 0.25 }),
    ]
    const scan = SCANNING[mood]
    controls.push(
      scan && !reduceMotion
        ? animate(lookX, [-6, 6, -6], { duration: scan, repeat: Infinity, ease: 'easeInOut' })
        : animate(lookX, target.lookX, spring),
    )
    return () => controls.forEach((c) => c.stop())
  }, [mood, reduceMotion, open, width, lookX, lookY, tilt, smile])

  useEffect(() => {
    if (reduceMotion) return
    const controls = animate(bob, [0, mood === 'asleep' ? 2.5 : 1.5, 0], {
      duration: mood === 'asleep' ? 4 : 2.6,
      repeat: Infinity,
      ease: 'easeInOut',
    })
    return () => controls.stop()
  }, [mood, reduceMotion, bob])

  useEffect(() => {
    if (mood === 'asleep' || mood === 'pleased') return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        animate(blink, [1, 0.08, 1], { duration: 0.18 })
        schedule()
      }, 2200 + Math.random() * 3200)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [mood, blink])

  const body = BODY[shape]

  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={`Forma, feeling ${mood}`}>
      <motion.g style={{ y: bob }}>
        <path
          d={body.d}
          fill="currentColor"
          fillOpacity={0.12}
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 4px currentColor)' }}
        />
        <motion.g style={{ x: lookX, y: lookY, filter: 'drop-shadow(0 0 3px currentColor)' }}>
          <Eye cx={50 - body.eyeGap} cy={body.eyeY} side={1} {...{ open, blink, width, tilt, smile }} />
          <Eye cx={50 + body.eyeGap} cy={body.eyeY} side={-1} {...{ open, blink, width, tilt, smile }} />
        </motion.g>
      </motion.g>
    </svg>
  )
})
