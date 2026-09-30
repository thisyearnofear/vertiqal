'use client'

import { memo, useEffect, type PointerEvent } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react'
import type { Mood, Shape } from '@/lib/persona'

/**
 * Procedural avatar: a shell, faceplate, arms and feet with expression offsets.
 * High-frequency pointer, blink and ambient movement live in Motion values, so
 * interaction never re-renders React.
 */
interface Expression {
  open: number
  width: number
  lookX: number
  lookY: number
  tilt: number
  smile: number
}

const NEUTRAL: Expression = {
  open: 1,
  width: 1,
  lookX: 0,
  lookY: 0,
  tilt: 0,
  smile: 0,
}

const EXPRESSIONS: Record<Mood, Partial<Expression>> = {
  asleep: { open: 0.1, lookY: 4, tilt: -4 },
  watching: { lookY: 1 },
  ready: { open: 1.18, width: 1.08, smile: 0.2 },
  thinking: { open: 0.72, lookX: 5, lookY: -5, tilt: 9 },
  searching: { open: 0.95 },
  pleased: { open: 1.05, smile: 1, tilt: -3 },
  asking: { open: 1.25, width: 1.1, tilt: -8 },
  working: { open: 0.82, lookY: 1, tilt: 8 },
  sad: { open: 0.58, lookY: 5, tilt: -14 },
}

const SCANNING: Partial<Record<Mood, number>> = { searching: 1.35, working: 2.1, thinking: 2.8 }

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
        x={cx - 6}
        y={cy - 9}
        width={12}
        height={18}
        rx={6}
        fill="currentColor"
        style={{ scaleY, opacity: eyeOpacity, transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}
      />
      <motion.circle cx={cx + side * 1.5} cy={cy - 4} r={1.7} fill="var(--stage)" style={{ opacity: eyeOpacity, scaleY }} />
      <motion.path
        d={`M${cx - 7} ${cy + 3} Q${cx} ${cy - 8} ${cx + 7} ${cy + 3}`}
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
  const impact = useMotionValue(0)
  const pointerX = useSpring(0, { stiffness: 260, damping: 24, mass: 0.55 })
  const pointerY = useSpring(0, { stiffness: 260, damping: 24, mass: 0.55 })
  const presence = useSpring(0, { stiffness: 220, damping: 22, mass: 0.6 })

  const eyeOpen = useTransform([open, presence], ([expression, pointer]: number[]) => Math.min(1.35, expression + pointer * 0.45))
  const eyeX = useTransform([lookX, pointerX], ([look, pointer]: number[]) => look + pointer * 3.4)
  const eyeY = useTransform([lookY, pointerY], ([look, pointer]: number[]) => look + pointer * 2.2)
  const bodyX = useTransform(pointerX, (pointer) => pointer * 1.5)
  const bodyY = useTransform([bob, pointerY, impact], ([ambient, pointer, bump]: number[]) => ambient + pointer - bump * 3.5)
  const bodyRotate = useTransform([tilt, pointerX], ([expression, pointer]: number[]) => expression + pointer * 4)
  const bodyScaleX = useTransform([impact, presence], ([bump, pointer]: number[]) => 1 + bump * 0.055 + pointer * 0.018)
  const bodyScaleY = useTransform([impact, presence], ([bump, pointer]: number[]) => 1 - bump * 0.07 - pointer * 0.012)

  const trackPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (reduceMotion) return
    presence.set(1)
    const rect = event.currentTarget.getBoundingClientRect()
    pointerX.set(Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2)))
    pointerY.set(Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2)))
  }

  const wakePointer = () => {
    if (!reduceMotion) presence.set(1)
  }

  const poke = () => {
    if (!reduceMotion) animate(impact, [0, 0.8, 0], { duration: 0.36, ease: 'easeOut' })
  }

  const releasePointer = () => {
    presence.set(0)
    pointerX.set(0)
    pointerY.set(0)
  }

  useEffect(() => {
    const target = { ...NEUTRAL, ...EXPRESSIONS[mood] }
    const spring = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 250, damping: 22 }
    const controls = [
      animate(open, target.open, spring),
      animate(width, target.width, spring),
      animate(lookY, target.lookY, spring),
      animate(tilt, target.tilt, spring),
      animate(smile, target.smile, { duration: reduceMotion ? 0 : 0.25 }),
      animate(impact, reduceMotion ? 0 : [0, 1, 0], reduceMotion ? { duration: 0 } : { duration: 0.58, ease: ['easeOut', 'easeIn'] }),
    ]
    const scan = SCANNING[mood]
    controls.push(
      scan && !reduceMotion
        ? animate(lookX, [-7, 7, -7], { duration: scan, repeat: Infinity, ease: 'easeInOut' })
        : animate(lookX, target.lookX, spring),
    )
    return () => controls.forEach((control) => control.stop())
  }, [mood, reduceMotion, open, width, lookX, lookY, tilt, smile, impact])

  useEffect(() => {
    if (reduceMotion) return
    const controls = animate(bob, [0, mood === 'asleep' ? 2.5 : mood === 'pleased' ? 2.2 : 1.4, 0], {
      duration: mood === 'asleep' ? 4.2 : mood === 'pleased' ? 1.7 : 2.7,
      repeat: Infinity,
      ease: 'easeInOut',
    })
    return () => controls.stop()
  }, [mood, reduceMotion, bob])

  useEffect(() => {
    if (reduceMotion || mood === 'asleep' || mood === 'pleased') return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        animate(blink, [1, 0.08, 1], { duration: 0.18 })
        schedule()
      }, 2200 + Math.random() * 3200)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [mood, blink, reduceMotion])

  const body = BODY[shape]

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`Forma, feeling ${mood}`}
      onPointerEnter={wakePointer}
      onPointerMove={trackPointer}
      onPointerDown={poke}
      onPointerLeave={releasePointer}
    >
      <motion.g
        style={{
          x: bodyX,
          y: bodyY,
          rotate: bodyRotate,
          scaleX: bodyScaleX,
          scaleY: bodyScaleY,
          transformBox: 'fill-box',
          originX: 0.5,
          originY: 0.88,
        }}
      >
        <path
          d={body.d}
          fill="currentColor"
          fillOpacity={0.2}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 5px currentColor)' }}
        />
        <motion.g style={{ x: eyeX, y: eyeY, filter: 'drop-shadow(0 0 3px currentColor)' }}>
          <Eye cx={50 - body.eyeGap} cy={body.eyeY} side={1} {...{ open: eyeOpen, blink, width, tilt, smile }} />
          <Eye cx={50 + body.eyeGap} cy={body.eyeY} side={-1} {...{ open: eyeOpen, blink, width, tilt, smile }} />
        </motion.g>
      </motion.g>
    </svg>
  )
})
