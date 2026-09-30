'use client'

import { memo, useEffect, useId, type PointerEvent } from 'react'
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
  mouth: number
  mouthOpen: number
  arm: number
}

const NEUTRAL: Expression = {
  open: 1,
  width: 1,
  lookX: 0,
  lookY: 0,
  tilt: 0,
  smile: 0,
  mouth: 0,
  mouthOpen: 0,
  arm: 0,
}

const EXPRESSIONS: Record<Mood, Partial<Expression>> = {
  asleep: { open: 0.1, lookY: 4, tilt: -4, mouth: -0.1 },
  watching: { lookY: 1, arm: 0.15 },
  ready: { open: 1.18, width: 1.08, smile: 0.2, mouth: 0.45, mouthOpen: 0.12, arm: 0.35 },
  thinking: { open: 0.72, lookX: 5, lookY: -5, tilt: 9, mouth: -0.15, arm: 0.45 },
  searching: { open: 0.95, mouth: 0.05, arm: 0.5 },
  pleased: { open: 1.05, smile: 1, mouth: 1, arm: 1, tilt: -3 },
  asking: { open: 1.25, width: 1.1, tilt: -8, mouth: 0.25, arm: 0.75 },
  working: { open: 0.82, lookY: 1, tilt: 8, mouth: 0.15, arm: 1 },
  sad: { open: 0.58, lookY: 5, tilt: -14, mouth: -0.8 },
}

const SCANNING: Partial<Record<Mood, number>> = { searching: 1.35, working: 2.1, thinking: 2.8 }
const BUSY: Mood[] = ['thinking', 'searching', 'working']

interface BodyShape {
  shell: string
  face: { x: number; y: number; width: number; height: number; rx: number }
  eyeY: number
  eyeGap: number
  mouthY: number
  antenna: number
  arms: { left: string; right: string }
}

const BODY: Record<Shape, BodyShape> = {
  pebble: {
    shell: 'M50 10 C72 10 86 28 86 51 V67 C86 85 71 96 50 96 C29 96 14 85 14 67 V51 C14 28 28 10 50 10 Z',
    face: { x: 23, y: 31, width: 54, height: 43, rx: 18 },
    eyeY: 50,
    eyeGap: 13,
    mouthY: 65,
    antenna: 10,
    arms: { left: 'M18 59 C9 61 6 68 8 75', right: 'M82 59 C91 61 94 68 92 75' },
  },
  orb: {
    shell: 'M50 9 A41 41 0 1 1 49.99 9 Z',
    face: { x: 27, y: 34, width: 46, height: 39, rx: 19 },
    eyeY: 51,
    eyeGap: 12,
    mouthY: 64,
    antenna: 9,
    arms: { left: 'M16 59 C8 62 6 69 9 76', right: 'M84 59 C92 62 94 69 91 76' },
  },
  visor: {
    shell: 'M27 25 H73 C87 25 98 38 98 53 V62 C98 80 84 92 68 92 H32 C16 92 2 80 2 62 V53 C2 38 13 25 27 25 Z',
    face: { x: 14, y: 42, width: 72, height: 28, rx: 14 },
    eyeY: 55,
    eyeGap: 18,
    mouthY: 64,
    antenna: 25,
    arms: { left: 'M11 61 C5 64 4 70 8 75', right: 'M89 61 C95 64 96 70 92 75' },
  },
  crag: {
    shell: 'M48 8 L76 20 L91 50 L78 88 L62 96 H38 L10 82 L7 48 L20 22 Z',
    face: { x: 26, y: 37, width: 48, height: 34, rx: 11 },
    eyeY: 52,
    eyeGap: 12,
    mouthY: 64,
    antenna: 8,
    arms: { left: 'M15 58 C8 61 6 68 10 75', right: 'M85 58 C92 61 94 68 90 75' },
  },
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
        y={cy - 10}
        width={12}
        height={20}
        rx={6}
        fill="currentColor"
        style={{ scaleY, opacity: eyeOpacity, transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}
      />
      <motion.circle
        cx={cx + side * 1.5}
        cy={cy - 4}
        r={1.7}
        fill="var(--stage)"
        style={{ opacity: eyeOpacity, scaleY }}
      />
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
  const clipId = `${useId().replaceAll(':', '')}-face`
  const open = useMotionValue(NEUTRAL.open)
  const width = useMotionValue(NEUTRAL.width)
  const lookX = useMotionValue(NEUTRAL.lookX)
  const lookY = useMotionValue(NEUTRAL.lookY)
  const tilt = useMotionValue(NEUTRAL.tilt)
  const smile = useMotionValue(NEUTRAL.smile)
  const mouth = useMotionValue(NEUTRAL.mouth)
  const mouthOpen = useMotionValue(NEUTRAL.mouthOpen)
  const arm = useMotionValue(NEUTRAL.arm)
  const blink = useMotionValue(1)
  const bob = useMotionValue(0)
  const impact = useMotionValue(0)
  const scanX = useMotionValue(0)
  const scanOpacity = useMotionValue(0)
  const beacon = useMotionValue(0.65)
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
  const mouthSmile = useTransform(mouth, (value) => Math.max(0, value))
  const mouthFrown = useTransform(mouth, (value) => Math.max(0, -value))
  const mouthFlat = useTransform(mouth, (value) => Math.max(0, 1 - Math.abs(value)))
  const armLeft = useTransform(arm, (value) => -value * 20)
  const armRight = useTransform(arm, (value) => value * 20)

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
    const spring = { type: 'spring' as const, stiffness: 250, damping: 22 }
    const controls = [
      animate(open, target.open, spring),
      animate(width, target.width, spring),
      animate(lookY, target.lookY, spring),
      animate(tilt, target.tilt, spring),
      animate(smile, target.smile, { duration: 0.25 }),
      animate(mouth, target.mouth, { duration: 0.28 }),
      animate(mouthOpen, target.mouthOpen, spring),
      animate(arm, target.arm, spring),
      animate(impact, reduceMotion ? 0 : [0, 1, 0], reduceMotion ? { duration: 0 } : { duration: 0.58, ease: ['easeOut', 'easeIn'] }),
      animate(scanOpacity, SCANNING[mood] ? 0.32 : 0, { duration: 0.22 }),
      animate(beacon, BUSY.includes(mood) && !reduceMotion ? [0.3, 1, 0.3] : 0.65, {
        duration: BUSY.includes(mood) && !reduceMotion ? 1.2 : 0.25,
        repeat: BUSY.includes(mood) && !reduceMotion ? Infinity : 0,
        ease: 'easeInOut',
      }),
    ]
    const scan = SCANNING[mood]
    controls.push(
      scan && !reduceMotion
        ? animate(lookX, [-7, 7, -7], { duration: scan, repeat: Infinity, ease: 'easeInOut' })
        : animate(lookX, target.lookX, spring),
    )
    controls.push(
      scan && !reduceMotion
        ? animate(scanX, [-22, 22, -22], { duration: scan, repeat: Infinity, ease: 'easeInOut' })
        : animate(scanX, 0, { duration: 0.2 }),
    )
    return () => controls.forEach((control) => control.stop())
  }, [mood, reduceMotion, open, width, lookX, lookY, tilt, smile, mouth, mouthOpen, arm, impact, scanX, scanOpacity, beacon])

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
      viewBox="0 0 100 104"
      className={className}
      role="img"
      aria-label={`Forma, feeling ${mood}`}
      onPointerEnter={wakePointer}
      onPointerMove={trackPointer}
      onPointerDown={poke}
      onPointerLeave={releasePointer}
    >
      <defs>
        <clipPath id={clipId}>
          <rect {...body.face} />
        </clipPath>
      </defs>

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
          d={`M50 ${body.antenna} V4`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.75}
        />
        <motion.circle cx={50} cy={4} r={3.3} fill="currentColor" style={{ opacity: beacon }} />

        <path
          d="M35 91 C28 91 23 95 23 101 H47 C47 96 42 91 35 91 Z"
          fill="currentColor"
          fillOpacity={0.16}
          stroke="currentColor"
          strokeWidth={2}
        />
        <path
          d="M65 91 C72 91 77 95 77 101 H53 C53 96 58 91 65 91 Z"
          fill="currentColor"
          fillOpacity={0.16}
          stroke="currentColor"
          strokeWidth={2}
        />

        <motion.path
          d={body.arms.left}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          style={{ rotate: armLeft, transformBox: 'fill-box', originX: 1, originY: 0.5 }}
        />
        <motion.path
          d={body.arms.right}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          style={{ rotate: armRight, transformBox: 'fill-box', originX: 0, originY: 0.5 }}
        />

        <path
          d={body.shell}
          fill="currentColor"
          fillOpacity={0.18}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 5px currentColor)' }}
        />
        <rect
          {...body.face}
          fill="var(--stage)"
          fillOpacity={0.88}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeOpacity={0.45}
        />
        <rect {...body.face} fill="none" stroke="currentColor" strokeWidth={0.8} strokeOpacity={0.18} transform="translate(1 1)" />

        <g clipPath={`url(#${clipId})`}>
          <motion.rect
            x={50}
            y={body.face.y - 3}
            width={7}
            height={body.face.height + 6}
            fill="currentColor"
            style={{ x: scanX, opacity: scanOpacity }}
          />
        </g>

        <motion.g style={{ x: eyeX, y: eyeY, filter: 'drop-shadow(0 0 3px currentColor)' }}>
          <Eye cx={50 - body.eyeGap} cy={body.eyeY} side={1} {...{ open: eyeOpen, blink, width, tilt, smile }} />
          <Eye cx={50 + body.eyeGap} cy={body.eyeY} side={-1} {...{ open: eyeOpen, blink, width, tilt, smile }} />
        </motion.g>

        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={3}>
          <motion.path d={`M43 ${body.mouthY} H57`} style={{ opacity: mouthFlat }} />
          <motion.path d={`M42 ${body.mouthY - 1} Q50 ${body.mouthY + 7} 58 ${body.mouthY - 1}`} style={{ opacity: mouthSmile }} />
          <motion.path d={`M42 ${body.mouthY + 4} Q50 ${body.mouthY - 3} 58 ${body.mouthY + 4}`} style={{ opacity: mouthFrown }} />
          <motion.circle cx={50} cy={body.mouthY + 1} r={3.5} style={{ opacity: mouthOpen }} />
        </g>
      </motion.g>
    </svg>
  )
})
