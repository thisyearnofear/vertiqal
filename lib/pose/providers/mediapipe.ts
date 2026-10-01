import type { Keypoint, KeypointName, Pose, PoseProvider, PoseSession } from '../types'

const LANDMARK_INDEX: Record<KeypointName, number> = {
  nose: 0,
  left_ear: 7,
  right_ear: 8,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
  left_heel: 29,
  right_heel: 30,
  left_foot: 31,
  right_foot: 32,
}

async function createLandmarker() {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  // Served from /public so the demo keeps working without network access.
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: '/models/pose_landmarker_full.task', delegate },
    runningMode: 'VIDEO' as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
  try {
    return await PoseLandmarker.createFromOptions(fileset, options('GPU'))
  } catch {
    return await PoseLandmarker.createFromOptions(fileset, options('CPU'))
  }
}

type Landmarker = Awaited<ReturnType<typeof createLandmarker>>

/** Keep an unused landmarker around briefly so switching providers or opening the example reuses it. */
const IDLE_CLOSE_MS = 60_000

/**
 * One landmarker shared by every session (provider switches, the example observer). Building one
 * loads the WASM runtime and a ~9 MB model and initialises the GPU, so doing it per switch is slow.
 */
const shared: {
  landmarker: Promise<Landmarker> | null
  users: number
  closeTimer: ReturnType<typeof setTimeout> | null
  lastTimestamp: number
} = { landmarker: null, users: 0, closeTimer: null, lastTimestamp: 0 }

async function acquireLandmarker() {
  if (shared.closeTimer) clearTimeout(shared.closeTimer)
  shared.closeTimer = null
  const pending = (shared.landmarker ??= createLandmarker())
  try {
    const landmarker = await pending
    shared.users++
    return landmarker
  } catch (error) {
    if (shared.landmarker === pending) shared.landmarker = null
    throw error
  }
}

function releaseLandmarker() {
  shared.users = Math.max(0, shared.users - 1)
  if (shared.users > 0 || !shared.landmarker) return
  const closing = shared.landmarker
  shared.closeTimer = setTimeout(() => {
    if (shared.users > 0 || shared.landmarker !== closing) return
    shared.landmarker = null
    shared.closeTimer = null
    void closing.then((landmarker) => landmarker.close()).catch(() => {})
  }, IDLE_CLOSE_MS)
}

export const mediapipeProvider: PoseProvider = {
  id: 'mediapipe',
  label: 'MediaPipe Pose',
  detail: 'Runs on this device · no upload',
  available: true,
  async load(): Promise<PoseSession> {
    const landmarker = await acquireLandmarker()
    let released = false

    return {
      poseAt(video) {
        // MediaPipe requires strictly increasing timestamps per landmarker, even when the clip loops
        // or another session used it last.
        const timestamp = Math.max(performance.now(), shared.lastTimestamp + 1)
        shared.lastTimestamp = timestamp
        const result = landmarker.detectForVideo(video, timestamp)
        const landmarks = result.landmarks[0]
        if (!landmarks) return null

        const pose: Pose = {}
        for (const [name, index] of Object.entries(LANDMARK_INDEX) as [KeypointName, number][]) {
          const lm = landmarks[index]
          if (!lm) continue
          const keypoint: Keypoint = { x: lm.x, y: lm.y, score: lm.visibility ?? 1 }
          pose[name] = keypoint
        }
        return pose
      },
      dispose() {
        if (released) return
        released = true
        releaseLandmarker()
      },
    }
  },
}
