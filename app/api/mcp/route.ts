import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { logCost } from '@/lib/cost-log'
import { checkFit, tokenFrom } from '@/lib/passport/fit'
import { passportId, readPassport } from '@/lib/passport/token'
import { guardSurfaceKey } from '@/lib/rate-limit'

export const maxDuration = 60

const passportInput = z
  .string()
  .min(10)
  .max(6200)
  .describe('A vertiqal fit passport URL (https://…/api/passport/<token>) or the bare token')

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })
const failure = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true })

function open(input: string) {
  const token = tokenFrom(input)
  const passport = readPassport(token)
  return passport ? { token, passport } : null
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    'get_fit_passport',
    {
      title: 'Read a fit passport',
      description:
        "Returns the owner's body-measured running or climbing shoe profile: pose-tracked metrics, movement signals, required shoe attributes, size and the shortlist vertiqal picked. The passport is HMAC-signed by vertiqal, so tampered passports are rejected.",
      inputSchema: z.object({ passport: passportInput }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ passport: input }) => {
      const opened = open(input)
      if (!opened) {
        logCost('mcp_call', { tool: 'get_fit_passport', ok: false, reason: 'invalid_passport' })
        return failure('Invalid or tampered passport')
      }
      logCost('mcp_call', { tool: 'get_fit_passport', ok: true, sport: opened.passport.sport })
      return text({ id: passportId(opened.token), issuer: 'vertiqal', passport: opened.passport })
    },
  )

  server.registerTool(
    'check_fit',
    {
      title: 'Check a shoe against a fit passport',
      description:
        'Judges whether a named shoe suits the passport owner. Returns a verdict (great-fit, workable, poor-fit), a 0–100 score and reasons that cite their measurements. Use before recommending or stocking a shoe for this person.',
      inputSchema: z.object({
        passport: passportInput,
        product: z.string().min(2).max(120).describe('Full product name, e.g. "La Sportiva Solution Comp"'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ passport: input, product }) => {
      const opened = open(input)
      if (!opened) {
        logCost('mcp_call', { tool: 'check_fit', ok: false, reason: 'invalid_passport' })
        return failure('Invalid or tampered passport')
      }
      const guard = guardSurfaceKey('passport-fit', passportId(opened.token))
      if (!guard.allowed) {
        logCost('limit_hit', { surface: 'passport-fit', reason: guard.reason, sport: opened.passport.sport })
        return failure(guard.error)
      }
      try {
        const result = await checkFit(opened.passport, product)
        logCost('mcp_call', { tool: 'check_fit', ok: true, sport: opened.passport.sport, verdict: result.verdict })
        return text(result)
      } catch (error) {
        logCost('mcp_call', { tool: 'check_fit', ok: false, sport: opened.passport.sport, reason: 'fit_check_failed' })
        return failure(error instanceof Error ? error.message : 'Fit check failed')
      }
    },
  )
}, { serverInfo: { name: 'vertiqal-fit-passport', version: '1.0.0' } })

export { handler as GET, handler as POST, handler as DELETE }
