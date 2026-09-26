import { mediapipeProvider } from './mediapipe'
import { vlmRunProvider } from './vlmrun'

export const POSE_PROVIDERS = [mediapipeProvider, vlmRunProvider]

export function getPoseProvider(id: string) {
  return POSE_PROVIDERS.find((provider) => provider.id === id) ?? mediapipeProvider
}
