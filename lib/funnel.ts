import { track } from '@vercel/analytics'

/** The fitting journey in order, so drop-off between steps shows up as a funnel in Vercel Analytics. */
export type FunnelStep =
  | 'sample_started'
  | 'film_started'
  | 'clip_uploaded'
  | 'measurements_locked'
  | 'shopping_started'
  | 'pick_chosen'
  | 'buy_clicked'
  | 'whatsapp_sent'
  | 'shortlist_feedback'
  | 'limit_hit'

export function trackStep(step: FunnelStep, props: Record<string, string | number | boolean> = {}) {
  track(step, props)
}
