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

export const mediapipeProvider: PoseProvider = {
  id: 'mediapipe',
  label: 'MediaPipe Pose',
  detail: 'Runs on this device · no upload',
  available: true,
  async load(): Promise<PoseSession> {
    const landmarker = await createLandmarker()
    let lastTimestamp = 0

    return {
      poseAt(video) {
        // MediaPipe requires strictly increasing timestamps, even when the clip loops.
        const timestamp = Math.max(performance.now(), lastTimestamp + 1)
        lastTimestamp = timestamp
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
        landmarker.close()
      },
    }
  },
}
