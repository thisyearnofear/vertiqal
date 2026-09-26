import type { PoseProvider } from '../types'
import { mediapipeProvider } from './mediapipe'

const vlmRunProvider: PoseProvider = {
  id: 'vlmrun',
  label: 'VLM Run · ViTPose+',
  detail: 'Hosted vitpose-plus-large',
  available: false,
  unavailableReason: 'Add VLMRUN_API_KEY',
  load() {
    return Promise.reject(new Error('VLM Run provider is not configured'))
  },
}

export const POSE_PROVIDERS: PoseProvider[] = [mediapipeProvider, vlmRunProvider]

export function getPoseProvider(id: string) {
  return POSE_PROVIDERS.find((provider) => provider.id === id) ?? mediapipeProvider
}
