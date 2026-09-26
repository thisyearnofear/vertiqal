'use client'

import { useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { easing } from 'maath'
import type { MotionValue } from 'motion/react'
import { Suspense, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { HERO_SHOE, SHOE_IMAGES, beatAt, type BeatName } from './story'

const COLS = 13
const ROWS = 5
const RADIUS = 7
const TILE = 1.1
const COL_GAP = 1.28
const ROW_GAP = 1.2

/** Where the wall settles for each beat; every value is damped toward, never jumped to. */
const WALL: Record<BeatName, { opacity: number; z: number; speed: number; focus: number }> = {
  intro: { opacity: 0.42, z: -1.4, speed: 0.16, focus: 0 },
  problem: { opacity: 0.95, z: 0.5, speed: 0.5, focus: 0 },
  scan: { opacity: 0.05, z: -9, speed: 0.12, focus: 0 },
  match: { opacity: 0.1, z: -2.5, speed: 0, focus: 1 },
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const easeOut = (t: number) => 1 - (1 - t) ** 3

function configure(loaded: THREE.Texture | THREE.Texture[]) {
  for (const texture of [loaded].flat()) {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
  }
}

/** Soft-edged mask so each product shot dissolves into the stage instead of reading as a square. */
function useSoftMask() {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const g = canvas.getContext('2d')
    if (g) {
      g.fillStyle = '#000'
      g.fillRect(0, 0, 128, 128)
      g.filter = 'blur(9px)'
      g.fillStyle = '#fff'
      g.fillRect(8, 22, 112, 84)
    }
    return new THREE.CanvasTexture(canvas)
  }, [])
}

function Wall({ progress }: { progress: MotionValue<number> }) {
  const textures = useTexture(SHOE_IMAGES, configure)
  const mask = useSoftMask()
  const geometry = useMemo(() => new THREE.PlaneGeometry(TILE, TILE), [])
  const tiles = useMemo(
    () =>
      Array.from({ length: COLS * ROWS }, (_, i) => ({
        col: i % COLS,
        row: Math.floor(i / COLS),
        texture: (i * 7 + Math.floor(i / COLS) * 2) % SHOE_IMAGES.length,
        delay: (((i * 9301 + 49297) % 233280) / 233280) * 0.8,
      })),
    [],
  )
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const state = useRef({ offset: 0, speed: WALL.intro.speed, opacity: WALL.intro.opacity, z: WALL.intro.z, born: -1 })

  useFrame(({ clock }, delta) => {
    const s = state.current
    if (s.born < 0) s.born = clock.elapsedTime
    const age = clock.elapsedTime - s.born
    const target = WALL[beatAt(progress.get())]
    easing.damp(s, 'speed', target.speed, 0.6, delta)
    easing.damp(s, 'opacity', target.opacity, 0.35, delta)
    easing.damp(s, 'z', target.z, 0.5, delta)
    s.offset += s.speed * delta

    tiles.forEach((tile, i) => {
      const mesh = meshes.current[i]
      if (!mesh) return
      const u = ((((tile.col + s.offset) % COLS) + COLS) % COLS) - (COLS - 1) / 2
      const theta = (u * COL_GAP) / RADIUS
      const enter = easeOut(clamp01((age - tile.delay) / 1.2))
      const edge = 1 - smoothstep(COLS / 2 - 2.4, COLS / 2 - 0.5, Math.abs(u))
      mesh.position.set(
        RADIUS * Math.sin(theta),
        (tile.row - (ROWS - 1) / 2) * ROW_GAP,
        RADIUS * (1 - Math.cos(theta)) + s.z - (1 - enter) * 7,
      )
      mesh.rotation.y = -theta
      const material = mesh.material as THREE.MeshBasicMaterial
      material.opacity = s.opacity * enter * edge
      mesh.visible = material.opacity > 0.004
    })
  })

  return (
    <group>
      {tiles.map((tile, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el
          }}
          geometry={geometry}
          visible={false}
        >
          <meshBasicMaterial map={textures[tile.texture]} alphaMap={mask} transparent opacity={0} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function FocusShoe({ progress }: { progress: MotionValue<number> }) {
  const texture = useTexture(HERO_SHOE, configure)
  const mask = useSoftMask()
  const mesh = useRef<THREE.Mesh>(null)
  const state = useRef({ focus: 0 })
  const size = useThree((s) => s.size)

  useFrame(({ clock, pointer }, delta) => {
    const m = mesh.current
    if (!m) return
    easing.damp(state.current, 'focus', WALL[beatAt(progress.get())].focus, 0.4, delta)
    const v = state.current.focus
    const narrow = size.width < 768
    m.position.set(narrow ? 0 : 1.8, (narrow ? 1.25 : 0.2) + Math.sin(clock.elapsedTime * 1.1) * 0.05, 2.4 - (1 - v) * 5)
    m.scale.setScalar((narrow ? 2.6 : 3.8) * (0.85 + 0.15 * v))
    m.rotation.set(pointer.y * 0.06, -0.12 + pointer.x * 0.12, 0)
    const material = m.material as THREE.MeshBasicMaterial
    material.opacity = v
    m.visible = v > 0.004
  })

  return (
    <mesh ref={mesh} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} alphaMap={mask} transparent opacity={0} toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

/** Weighted parallax: the camera leans toward the pointer rather than snapping to it. */
function Rig() {
  useFrame(({ camera, pointer, size }, delta) => {
    easing.damp3(camera.position, [pointer.x * 0.45, pointer.y * 0.3, size.width < 768 ? 10.5 : 8], 0.6, delta)
    camera.lookAt(0, 0, 0)
  })
  return null
}

export function ShoeWall({
  progress,
  active,
  eventSource,
}: {
  progress: MotionValue<number>
  active: boolean
  eventSource: RefObject<HTMLElement | null>
}) {
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 8], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      eventSource={eventSource as RefObject<HTMLElement>}
      eventPrefix="client"
    >
      <Suspense fallback={null}>
        <Wall progress={progress} />
        <FocusShoe progress={progress} />
      </Suspense>
      <Rig />
    </Canvas>
  )
}
