import 'server-only'

/**
 * One structured line per paid event; Vercel function logs are the sink for now.
 * Never log PII: no prompts, sizes, heights, budgets, notes, phone numbers, image data or URLs.
 */
export function logCost(event: string, fields: Record<string, string | number | boolean | null>) {
  console.log(JSON.stringify({ kind: 'cost', event, at: new Date().toISOString(), ...fields }))
}
