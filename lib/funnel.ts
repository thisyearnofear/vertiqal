import { track } from '@vercel/analytics'
import { hasRememberedBrief, visitorId } from './fitting/visitor.ts'

/** The fitting journey in order, so drop-off between steps shows up as a funnel in Vercel Analytics. */
export type FunnelStep =
  | 'sample_started'
  | 'film_started'
  | 'clip_uploaded'
  | 'measurements_locked'
  | 'shopping_started'
  | 'pick_chosen'
  | 'buy_clicked'
  | 'reminder_added'
  | 'share_landing'
  | 'shortlist_feedback'
  | 'limit_hit'

/**
 * Every event carries vid (a random first-party cookie — joins a shopper's steps and the
 * server's cost-log lines without accounts or PII) and `returning: true` when a remembered
 * brief exists, so the weekly return-users metric is the count of events flagged that way.
 */
export function trackStep(step: FunnelStep, props: Record<string, string | number | boolean> = {}) {
  const vid = visitorId()
  track(step, { ...props, ...(vid ? { vid } : {}), ...(hasRememberedBrief() ? { returning: true } : {}) })
}
