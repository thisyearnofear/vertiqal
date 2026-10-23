'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Box, Camera, Download, Orbit, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { HeroFrame } from '@/lib/hero/frame'
import type { MovementSnapshot, Readout, Sport } from '@/lib/metrics/readout'
import { retargetPoseTo3D, type TwinJointName } from '@/lib/pose/twin-3d'
import type { Pose } from '@/lib/pose/types'
import { cn } from '@/lib/utils'
import { attractClimb } from '../attract-climber'
import { attractPose } from '../attract-runner'

type CameraPreset = 'isometric' | 'sagittal' | 'front' | 'orbit'

const PRESET_ANGLES: Record<Exclude<CameraPreset, 'orbit'>, { azimuth: number; elevation: number }> = {
  isometric: { azimuth: 0.62, elevation: 0.24 },
  sagittal: { azimuth: 0, elevation: 0.08 },
  front: { azimuth: Math.PI / 2, elevation: 0.14 },
}

const PHOSPHOR_HEX: Record<string, { primary: number; accent: number; dim: number }> = {
  amber: { primary: 0xf59e0b, accent: 0xfef08a, dim: 0x78350f },
  green: { primary: 0x22c55e, accent: 0xbbf7d0, dim: 0x14532d },
  ice: { primary: 0x38bdf8, accent: 0xe0f2fe, dim: 0x0c4a6e },
}

const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'

export interface MovementTwinProps {
  sport: Sport
  pose: Pose | null
  snapshot: MovementSnapshot | null
  readout: Readout
  requirements?: { attribute: string; target: string; evidence?: string }[]
  themeKey: string
  onCaptureHero?: (hero: HeroFrame) => void
}

export function MovementTwin({
  sport,
  pose,
  snapshot,
  readout,
  requirements = [],
  themeKey,
  onCaptureHero,
}: MovementTwinProps) {
  const id = useId()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [preset, setPreset] = useState<CameraPreset>('isometric')
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [simPose, setSimPose] = useState<Pose | null>(null)
  const [exportedNote, setExportedNote] = useState<string | null>(null)

  const angleRef = useRef<{ azimuth: number; elevation: number }>({ ...PRESET_ANGLES.isometric })
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; baseAz: number; baseEl: number }>({
    active: false,
    startX: 0,
    startY: 0,
    baseAz: PRESET_ANGLES.isometric.azimuth,
    baseEl: PRESET_ANGLES.isometric.elevation,
  })

  // Drive a smooth 12fps synthetic motion loop when no live pose is present or when the user toggles motion replay
  useEffect(() => {
    if (pose && !simulating) {
      setSimPose(null)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const updatePose = (tSec: number) => {
      if (sport === 'climbing') {
        const climb = attractClimb(tSec / 0.9, { centerX: 0.5, height: 0.62, anchorY: 0.52, aspect: 1 })
        setSimPose(climb.pose)
      } else {
        setSimPose(attractPose(tSec, { centerX: 0.5, height: 0.62, groundY: 0.84, aspect: 1 }))
      }
    }
    updatePose(0.25)
    if (reduced) return
    const start = performance.now()
    const timer = window.setInterval(() => {
      updatePose((performance.now() - start) / 1000)
    }, 84) // ~12 fps cap matching example-scheduler
    return () => window.clearInterval(timer)
  }, [pose, simulating, sport])

  const activePose = (!simulating && pose) ? pose : simPose
  const frame3D = useMemo(
    () =>
      retargetPoseTo3D(activePose, {
        sport,
        snapshot,
        readout,
        requirements,
      }),
    [activePose, sport, snapshot, readout, requirements],
  )

  const selectedPin = useMemo(
    () => frame3D.pins.find((p) => p.id === selectedPinId) ?? frame3D.pins[0] ?? null,
    [frame3D.pins, selectedPinId],
  )

  useEffect(() => {
    if (preset === 'orbit') return
    angleRef.current = { ...PRESET_ANGLES[preset] }
  }, [preset])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: false,
      })
    } catch {
      return
    }

    const palette = PHOSPHOR_HEX[themeKey] ?? PHOSPHOR_HEX.amber
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0d0e)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30)

    const ambient = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambient)
    const keyLight = new THREE.DirectionalLight(palette.accent, 1.4)
    keyLight.position.set(2.5, 4, 3)
    scene.add(keyLight)

    const root = new THREE.Group()
    scene.add(root)

    // Ground grid & optional climbing wall plane
    const grid = new THREE.GridHelper(3.2, 16, palette.primary, palette.dim)
    grid.position.y = frame3D.groundY
    root.add(grid)

    if (sport === 'climbing') {
      const wallGeo = new THREE.PlaneGeometry(2.2, 2.4, 8, 8)
      const wallMat = new THREE.MeshBasicMaterial({
        color: palette.dim,
        wireframe: true,
        transparent: true,
        opacity: 0.32,
      })
      const wall = new THREE.Mesh(wallGeo, wallMat)
      wall.position.set(0, 0.15, -0.24)
      root.add(wall)
    }

    // Joints
    const jointMat = new THREE.MeshStandardMaterial({
      color: palette.primary,
      emissive: palette.primary,
      emissiveIntensity: 0.45,
      roughness: 0.3,
    })
    const highlightMat = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.95,
      roughness: 0.15,
    })
    const leftBoneMat = new THREE.MeshStandardMaterial({
      color: palette.primary,
      emissive: palette.primary,
      emissiveIntensity: 0.25,
      roughness: 0.4,
    })
    const rightBoneMat = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.dim,
      emissiveIntensity: 0.3,
      roughness: 0.45,
      transparent: true,
      opacity: 0.82,
    })

    const highlightedJoint: TwinJointName | null = selectedPin?.joint ?? null

    for (const [name, pos] of Object.entries(frame3D.joints) as [TwinJointName, { x: number; y: number; z: number }][]) {
      if (!pos) continue
      const isHead = name === 'head_center'
      const isHighlighted = name === highlightedJoint
      const radius = isHead ? 0.095 : isHighlighted ? 0.052 : 0.034
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 16),
        isHighlighted ? highlightMat : jointMat,
      )
      sphere.position.set(pos.x, pos.y, pos.z)
      root.add(sphere)

      if (isHighlighted) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(radius * 1.45, radius * 1.85, 24),
          new THREE.MeshBasicMaterial({ color: palette.accent, side: THREE.DoubleSide }),
        )
        ring.position.set(pos.x, pos.y, pos.z)
        root.add(ring)
      }
    }

    // Bones as oriented 3D cylinders
    const up = new THREE.Vector3(0, 1, 0)
    for (const bone of frame3D.bones) {
      const a = frame3D.joints[bone.from]
      const b = frame3D.joints[bone.to]
      if (!a || !b) continue
      const start = new THREE.Vector3(a.x, a.y, a.z)
      const end = new THREE.Vector3(b.x, b.y, b.z)
      const diff = new THREE.Vector3().subVectors(end, start)
      const length = diff.length()
      if (length < 0.005) continue
      const cylGeo = new THREE.CylinderGeometry(0.022, 0.018, length, 10)
      const mesh = new THREE.Mesh(
        cylGeo,
        bone.side === 'right' ? rightBoneMat : leftBoneMat,
      )
      mesh.position.copy(start).add(end).multiplyScalar(0.5)
      mesh.quaternion.setFromUnitVectors(up, diff.clone().normalize())
      root.add(mesh)
    }

    // 3D Metric Vectors (overstride, foot strike, trunk lean, reach envelope, hip offset, toe-down)
    for (const vec of frame3D.vectors) {
      const origin = new THREE.Vector3(vec.origin.x, vec.origin.y, vec.origin.z)
      const target = new THREE.Vector3(vec.target.x, vec.target.y, vec.target.z)
      const dir = new THREE.Vector3().subVectors(target, origin)
      const length = Math.max(0.12, dir.length())
      const arrowColor = vec.flagged ? palette.accent : palette.primary
      const arrow = new THREE.ArrowHelper(
        dir.normalize(),
        origin,
        length,
        arrowColor,
        Math.min(0.09, length * 0.32),
        0.055,
      )
      root.add(arrow)
    }

    let animId = 0
    const render = () => {
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()

      if (preset === 'orbit' && !dragRef.current.active) {
        angleRef.current.azimuth += 0.012
      }
      const dist = 2.85
      const { azimuth, elevation } = angleRef.current
      camera.position.set(
        dist * Math.cos(elevation) * Math.sin(azimuth),
        0.12 + dist * Math.sin(elevation),
        dist * Math.cos(elevation) * Math.cos(azimuth),
      )
      camera.lookAt(0, 0.05, 0)
      renderer.render(scene, camera)

      if (preset === 'orbit') {
        animId = requestAnimationFrame(render)
      }
    }

    render()
    const resizeObserver = new ResizeObserver(() => render())
    resizeObserver.observe(canvas)

    return () => {
      if (animId) cancelAnimationFrame(animId)
      resizeObserver.disconnect()
      renderer.dispose()
    }
  }, [frame3D, preset, selectedPin?.joint, sport, themeKey])

  const exportSnapshot = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `vertiqal-3d-twin-${sport}.png`
    link.click()
    setExportedNote('Saved 3D Movement Twin PNG.')
  }

  const sendToHeroCard = () => {
    const canvas = canvasRef.current
    if (!canvas || !onCaptureHero || !activePose) return
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    onCaptureHero({
      id: Date.now(),
      sport,
      dataUrl,
      score: 100,
      box: { x: 0.2, y: 0.1, w: 0.6, h: 0.8 },
      trails: [],
      pose: activePose,
    })
    setExportedNote('Pinned 3D Twin snapshot to your Hero Frame Card.')
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="housing flex flex-col gap-5 rounded-2xl p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className={cn(LABEL, 'flex items-center gap-2')}>
            <span className="led" data-state={pose ? 'on' : 'busy'} aria-hidden />
            CH-3D · Movement Twin
          </p>
          <h2 id={`${id}-heading`} className="text-balance text-xl font-semibold text-foreground">
            {sport === 'running' ? '3D Stride & Vector Twin' : '3D Wall Reach & Hip Twin'}
          </h2>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {pose
              ? 'Retargeted on-device from your captured pose keypoints into 3D space. Drag to orbit or select a Forma pin to inspect the exact joint and vector behind your fit.'
              : 'Live 3D biomechanical preview driven on-device. Drag to orbit around the sagittal and lateral planes.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'isometric', label: '3/4 View' },
              { id: 'sagittal', label: 'Side-on' },
              { id: 'front', label: sport === 'climbing' ? 'Wall' : 'Front' },
              { id: 'orbit', label: 'Orbit' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={preset === item.id}
              onClick={() => setPreset(item.id)}
              className={cn(
                'well rounded-md px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                preset === item.id ? 'text-foreground ring-1 ring-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="relative flex flex-col gap-2">
          <div className="screen relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-stage-foreground/30 bg-stage">
            <canvas
              ref={canvasRef}
              aria-label={`Interactive 3D Movement Twin for ${sport}`}
              className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                dragRef.current = {
                  active: true,
                  startX: e.clientX,
                  startY: e.clientY,
                  baseAz: angleRef.current.azimuth,
                  baseEl: angleRef.current.elevation,
                }
              }}
              onPointerMove={(e) => {
                if (!dragRef.current.active) return
                const dx = (e.clientX - dragRef.current.startX) * 0.01
                const dy = (e.clientY - dragRef.current.startY) * 0.008
                angleRef.current = {
                  azimuth: dragRef.current.baseAz - dx,
                  elevation: Math.max(-0.5, Math.min(0.85, dragRef.current.baseEl + dy)),
                }
                if (preset !== 'orbit') {
                  // Trigger a re-render via state nudge or resize
                  window.dispatchEvent(new Event('resize'))
                }
              }}
              onPointerUp={() => {
                dragRef.current.active = false
              }}
            />

            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between gap-2 font-mono text-xs uppercase text-stage-foreground phosphor">
              <span className="flex items-center gap-1.5 rounded bg-stage/80 px-2 py-1">
                <Box className="size-3.5" aria-hidden />
                {pose && !simulating ? 'MEASURED POSE RIG' : 'SYNTHETIC 3D RIG · 12 FPS'}
              </span>
              <span className="rounded bg-stage/80 px-2 py-1">
                {`${Object.keys(frame3D.joints).length} JOINTS · ${frame3D.vectors.length} VECTORS`}
              </span>
            </div>

            {frame3D.vectors.length > 0 && (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap gap-2 font-mono text-xs text-stage-foreground">
                {frame3D.vectors.map((vec) => (
                  <div
                    key={vec.id}
                    className={cn(
                      'rounded border px-2.5 py-1 backdrop-blur-xs',
                      vec.flagged
                        ? 'border-primary/80 bg-stage/90 text-primary phosphor'
                        : 'border-stage-foreground/35 bg-stage/80 text-stage-foreground',
                    )}
                  >
                    <span className="opacity-70">{`${vec.label}: `}</span>
                    <span className="font-semibold tabular-nums">{vec.valueLabel}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportSnapshot}>
                <Download className="size-3.5" aria-hidden />
                Save 3D PNG
              </Button>
              {onCaptureHero && (
                <Button variant="outline" size="sm" onClick={sendToHeroCard}>
                  <Camera className="size-3.5" aria-hidden />
                  Use 3D in Hero Card
                </Button>
              )}
              {pose && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSimulating((s) => !s)}
                >
                  {simulating ? <RotateCcw className="size-3.5" aria-hidden /> : <Orbit className="size-3.5" aria-hidden />}
                  {simulating ? 'Back to captured pose' : 'Animate 3D stride'}
                </Button>
              )}
            </div>
            {exportedNote && (
              <p role="status" className="text-xs text-muted-foreground">
                {exportedNote}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-3">
            <p className={cn(LABEL, 'flex items-center gap-1.5')}>
              <Sparkles className="size-3.5" aria-hidden />
              {requirements.length > 0 ? 'Forma 3D Fit Pins (from your gear profile)' : '3D Biomechanical Signals & Vectors'}
            </p>

            {frame3D.pins.length > 0 ? (
              <div className="flex flex-col gap-2" role="listbox" aria-label="3D anatomical pins">
                {frame3D.pins.map((pin) => {
                  const active = selectedPin?.id === pin.id
                  return (
                    <button
                      key={pin.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelectedPinId(pin.id)}
                      className={cn(
                        'well flex flex-col gap-1 rounded-xl p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        active ? 'ring-2 ring-primary' : 'hover:text-foreground',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{pin.title}</span>
                        <span className="rounded bg-stage px-2 py-0.5 font-mono text-[11px] uppercase text-stage-foreground phosphor">
                          {pin.joint.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{pin.detail}</p>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="well flex flex-col gap-2 rounded-xl p-4">
                <p className="text-sm font-medium text-foreground">
                  {sport === 'running'
                    ? 'Watching sagittal overstride, strike angle, and trunk lean in 3D'
                    : 'Watching reach elbow angle, hip-to-wall offset, and toe-down edging in 3D'}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Once your clip locks 6 events, Forma pins your movement signals and shoe requirements directly onto the 3D joints above.
                </p>
              </div>
            )}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            3D vectors are retargeted locally in your browser from 2D pose landmarks and calibrated height. Single-camera depth is an anatomical projection, not multi-camera clinical motion capture.
          </p>
        </div>
      </div>
    </section>
  )
}
