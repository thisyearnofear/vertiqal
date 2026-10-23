import 'server-only'
import { Output, generateText } from 'ai'
import { resolveModel } from '@/lib/agent/models'
import { logCost } from '@/lib/cost-log'
import { fitVerdictSchema, type Passport } from './schema'
import { tokenFrom } from './token'

export { tokenFrom }

export async function checkFit(passport: Passport, product: string) {
  const started = Date.now()
  const model = await resolveModel('agent')
  if (!model) {
    logCost('paid_call', { route: 'passport-fit', ok: false, ms: Date.now() - started, sport: passport.sport, reason: 'no_model_available' })
    throw new Error('No reachable model for the fit check')
  }
  try {
    const { output } = await generateText({
      model,
      system:
        'You are Forma, the vertiqal fitting agent. Judge whether a named shoe suits the passport owner using only their measured passport and your knowledge of that product. Be specific and honest; if you do not know the product, say so in a reason and score conservatively. No medical claims.',
      prompt: `Fit passport:\n${JSON.stringify(passport)}\n\nProduct to judge: ${product}`,
      output: Output.object({ schema: fitVerdictSchema }),
    })
    logCost('paid_call', { route: 'passport-fit', ok: true, ms: Date.now() - started, sport: passport.sport, model })
    return { product, ...output }
  } catch (error) {
    logCost('paid_call', { route: 'passport-fit', ok: false, ms: Date.now() - started, sport: passport.sport, model })
    throw error
  }
}
