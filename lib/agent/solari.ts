import 'server-only'
import { Output, generateText } from 'ai'
import { Solari, type BrowserSession } from '@solarisdk/browser'
import { z } from 'zod'

export const stockVerdictSchema = z.object({
  verdict: z
    .enum(['in_stock', 'out_of_stock', 'size_not_listed', 'blocked', 'unclear'])
    .describe('blocked = the page is a bot wall, captcha, error or not a product page'),
  sizeFound: z.string().describe('The size label exactly as the retailer shows it, or "" if not found'),
  price: z.string().describe('Current price with currency as shown, or ""'),
  evidence: z.string().describe('One short sentence citing what on the page proves the verdict'),
})

export type StockVerdict = z.infer<typeof stockVerdictSchema>

export interface StockCheck extends StockVerdict {
  productName: string
  productUrl: string
  size: string
  pageTitle: string
  screenshot: string | null
  sessionId: string
  egress: string
  elapsedMs: number
}

const COOKIE_BUTTONS = [
  '#onetrust-accept-btn-handler',
  'button#accept-cookies',
  'button[data-testid="accept-cookies"]',
  'button:has-text("Accept all")',
  'button:has-text("Accept All Cookies")',
  'button:has-text("Accept")',
]

/** Pulls the three signals a stock check needs: structured offers, size controls, and visible copy. */
async function readProductPage(browser: BrowserSession, url: string) {
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 860 })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 })

  for (const selector of COOKIE_BUTTONS) {
    const button = page.locator(selector).first()
    if (await button.isVisible({ timeout: 400 }).catch(() => false)) {
      await button.click({ timeout: 1_500 }).catch(() => {})
      break
    }
  }
  // Size pickers are usually hydrated client-side after DOMContentLoaded.
  await page.waitForTimeout(2_000)

  const signals = await page.evaluate(() => {
    const offers: unknown[] = []
    for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const walk = (node: unknown): void => {
          if (!node || typeof node !== 'object') return
          if (Array.isArray(node)) return node.forEach(walk)
          const record = node as Record<string, unknown>
          if (record.offers) offers.push({ name: record.name, sku: record.sku, offers: record.offers })
          if (record['@graph']) walk(record['@graph'])
        }
        walk(JSON.parse(script.textContent ?? ''))
      } catch {}
    }

    const sizeLike = /\b(?:UK|EU|US)?\s?\d{1,2}(?:\.5)?\b/i
    const sizes = Array.from(document.querySelectorAll('button, option, label, li[role="option"], [data-size]'))
      .map((el) => {
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (!text || text.length > 24 || !sizeLike.test(text)) return null
        const cls = `${el.className}`.toLowerCase()
        const unavailable =
          (el as HTMLButtonElement).disabled ||
          el.getAttribute('aria-disabled') === 'true' ||
          /disabled|unavailable|out-of-stock|oos|sold-out|soldout/.test(cls)
        return `${text}${unavailable ? ' [unavailable]' : ''}`
      })
      .filter(Boolean)
      .slice(0, 60)

    return {
      title: document.title,
      offers: JSON.stringify(offers).slice(0, 3_000),
      sizes: Array.from(new Set(sizes)),
      text: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 5_000),
    }
  })

  const image = await page.screenshot({ type: 'jpeg', quality: 55 }).catch(() => null)
  return { ...signals, screenshot: image ? `data:image/jpeg;base64,${Buffer.from(image).toString('base64')}` : null }
}

async function judgeStock(input: { productName: string; size: string }, page: Awaited<ReturnType<typeof readProductPage>>) {
  const { output } = await generateText({
    // Reading evidence off a page is extraction, not reasoning; the non-reasoning model is ~4x faster here.
    model: 'spacexai/grok-4.20-non-reasoning',
    system:
      'You verify stock on a retailer product page for a shoe fitter. Decide whether the requested size is in stock right now, using only the evidence given: structured offer data, the size controls (entries marked [unavailable] are greyed out), the visible page text and the screenshot. Match sizes sensibly (e.g. "UK 9" matches a "9" button on a UK site). If the page is a bot check, error or not this product, answer blocked. Never guess: prefer unclear over a confident wrong answer.',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `Product: ${input.productName}`,
              `Requested size: ${input.size}`,
              `Page title: ${page.title}`,
              `Structured offers: ${page.offers || 'none'}`,
              `Size controls: ${page.sizes.length ? page.sizes.join(' | ') : 'none found'}`,
              `Visible text:\n${page.text}`,
            ].join('\n'),
          },
          ...(page.screenshot
            ? [{ type: 'file' as const, mediaType: 'image/jpeg', data: page.screenshot.split(',')[1] }]
            : []),
        ],
      },
    ],
    output: Output.object({ schema: stockVerdictSchema }),
    abortSignal: AbortSignal.timeout(30_000),
  })
  return output
}

/**
 * The replay uploads asynchronously after release, so early reads 404 even on a good recording.
 * Callers poll this rather than blocking the stock verdict on it.
 */
export async function getReplayUrl(sessionId: string): Promise<string | null> {
  const apiKey = process.env.SOLARI_API_KEY
  if (!apiKey) throw new Error('SOLARI_API_KEY is not configured')
  const solari = new Solari({ apiKey })
  try {
    const replay = await solari.sessions.getReplayUrl(sessionId).catch(() => null)
    return replay?.url ?? null
  } finally {
    await solari.close()
  }
}

export async function verifyStock(input: { productName: string; productUrl: string; size: string }): Promise<StockCheck> {
  const apiKey = process.env.SOLARI_API_KEY
  if (!apiKey) throw new Error('SOLARI_API_KEY is not configured')

  const started = Date.now()
  const solari = new Solari({ apiKey })
  try {
    // Stealth + UK residential egress so retailers serve the real UK page, not a bot wall. Recording is per-session opt-in.
    const browser = await solari.launch({ stealth: true, proxy: { country: 'gb' }, recording: true, retries: 1 })
    const sessionId = browser.id
    const egress = browser.proxy ? `${browser.proxy.country.toUpperCase()} ${browser.proxy.tier ?? 'residential'}` : 'direct'

    let page: Awaited<ReturnType<typeof readProductPage>>
    try {
      page = await readProductPage(browser, input.productUrl)
    } finally {
      await browser.close()
    }

    // Confirmed release starts the replay upload while Grok reads the page.
    const [verdict] = await Promise.all([judgeStock(input, page), solari.sessions.releaseAndWait(sessionId).catch(() => {})])
    return {
      ...input,
      ...verdict,
      pageTitle: page.title,
      screenshot: page.screenshot,
      sessionId,
      egress,
      elapsedMs: Date.now() - started,
    }
  } finally {
    await solari.close()
  }
}
