import type { Pose, PoseProvider, PoseSession } from '../types'
import { mediapipeProvider } from './mediapipe'

const MAX_SAMPLES = 16
const SAMPLES_PER_SECOND = 2
const CONCURRENCY = 4
const FRAME_WIDTH = 640
/** A hosted keypoint set is used only while playback is this close to the frame it was read from. */
const MATCH_WINDOW_S = 1 / 15

interface Sample {
  time: number
  pose: Pose
}

const once = (target: EventTarget, event: string, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    target.addEventListener(event, () => resolve(), { once: true })
    target.addEventListener('error', () => reject(new Error(`Could not ${event === 'seeked' ? 'seek' : 'load'} the clip`)), {
      once: true,
    })
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

async function captureFrames(src: string, signal: AbortSignal) {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = src
  await once(video, 'loadeddata', signal)

  const duration = Number.isFinite(video.duration) ? video.duration : 0
  const count = Math.max(1, Math.min(MAX_SAMPLES, Math.round(duration * SAMPLES_PER_SECOND)))
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * FRAME_WIDTH)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')

  const frames: { time: number; image: string }[] = []
  for (let i = 0; i < count; i++) {
    const time = ((i + 0.5) / count) * duration
    video.currentTime = time
    await once(video, 'seeked', signal)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    frames.push({ time, image: canvas.toDataURL('image/jpeg', 0.82) })
  }
  video.removeAttribute('src')
  video.load()
  return frames
}

async function readKeypoints(image: string, signal: AbortSignal): Promise<Pose> {
  const res = await fetch('/api/pose/vlmrun', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image }),
    signal,
  })
  const body = (await res.json().catch(() => ({}))) as { pose?: Pose; error?: string }
  if (!res.ok || !body.pose) throw new Error(body.error ?? `Keypoint request failed (${res.status})`)
  return body.pose
}

export const vlmRunProvider: PoseProvider = {
  id: 'vlmrun',
  label: 'VLM Run · Orion pointing',
  detail: 'MediaPipe timing + hosted keypoints on sampled frames',
  available: true,
  async load(): Promise<PoseSession> {
    const check = await fetch('/api/pose/vlmrun')
      .then((res) => res.json() as Promise<{ configured?: boolean }>)
      .catch(() => ({ configured: false }))
    const base = await mediapipeProvider.load()
    if (!check.configured) {
      return {
        poseAt: (video) => base.poseAt(video),
        onStatus: (next) => next('VLMRUN_API_KEY not set on the server: MediaPipe only'),
        dispose: () => base.dispose(),
      }
    }

    let samples: Sample[] = []
    let activeSrc = ''
    let controller: AbortController | null = null
    let listener: ((status: string | null) => void) | null = null
    let lastStatus: string | null = null
    const report = (status: string | null) => {
      lastStatus = status
      listener?.(status)
    }

    const refine = async (src: string) => {
      controller?.abort()
      const current = new AbortController()
      controller = current
      samples = []
      report('Sampling frames for VLM Run…')
      try {
        const frames = await captureFrames(src, current.signal)
        let done = 0
        let failed = 0
        let lastError = ''
        report(`VLM Run: reading 0/${frames.length} frames`)
        const queue = [...frames]
        const worker = async () => {
          for (let frame = queue.shift(); frame; frame = queue.shift()) {
            try {
              const pose = await readKeypoints(frame.image, current.signal)
              if (Object.keys(pose).length > 0) {
                samples = [...samples, { time: frame.time, pose }].sort((a, b) => a.time - b.time)
              }
            } catch (error) {
              if (current.signal.aborted) return
              failed++
              lastError = (error as Error).message
            }
            done++
            report(`VLM Run: read ${done - failed}/${frames.length} frames`)
          }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, worker))
        if (current.signal.aborted) return
        if (samples.length === 0) report(`VLM Run failed (${lastError || 'no keypoints'}): MediaPipe only`)
        else report(`VLM Run: ${samples.length}/${frames.length} frames refined${failed ? `, ${failed} failed` : ''}`)
      } catch (error) {
        if (!current.signal.aborted) report(`VLM Run failed (${(error as Error).message}): MediaPipe only`)
      }
    }

    return {
      poseAt(video) {
        const basePose = base.poseAt(video)
        const src = video.currentSrc
        if (!src) {
          if (activeSrc) {
            activeSrc = ''
            controller?.abort()
            samples = []
            report('Live camera: MediaPipe only, VLM Run refines uploaded clips')
          }
          return basePose
        }
        if (src !== activeSrc) {
          activeSrc = src
          void refine(src)
        }

        const time = video.currentTime
        let nearest: Sample | null = null
        for (const sample of samples) {
          if (!nearest || Math.abs(sample.time - time) < Math.abs(nearest.time - time)) nearest = sample
        }
        if (!nearest || Math.abs(nearest.time - time) > MATCH_WINDOW_S) return basePose
        return { ...basePose, ...nearest.pose }
      },
      onStatus(next) {
        listener = next
        next(lastStatus)
      },
      dispose() {
        controller?.abort()
        listener = null
        base.dispose()
      },
    }
  },
}
