import 'server-only'
import { Output, generateText } from 'ai'
import { fitVerdictSchema, type Passport } from './schema'

export async function checkFit(passport: Passport, product: string) {
  const { output } = await generateText({
    model: 'spacexai/grok-4.7',
    system:
      'You are Forma, the vertiqal fitting agent. Judge whether a named shoe suits the passport owner using only their measured passport and your knowledge of that product. Be specific and honest; if you do not know the product, say so in a reason and score conservatively. No medical claims.',
    prompt: `Fit passport:\n${JSON.stringify(passport)}\n\nProduct to judge: ${product}`,
    output: Output.object({ schema: fitVerdictSchema }),
  })
  return { product, ...output }
}

/** Accepts a bare token or any passport URL issued by vertiqal. */
export function tokenFrom(input: string) {
  const trimmed = input.trim()
  const match = trimmed.match(/\/api\/passport\/([^/?#\s]+)/)
  return match ? match[1] : trimmed
}
