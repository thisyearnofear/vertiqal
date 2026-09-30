import 'server-only'
import { Output, generateText } from 'ai'
import { Solari, type BrowserSession, type LaunchOptions } from '@solarisdk/browser'
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
  checkedAt: string
  source: 'live' | 'cache' | 'shared'
}

const COOKIE_BUTTONS = [
  '#onetrust-accept-btn-handler',
  'button#accept-cookies',
  'button[data-testid="accept-cookies"]',
  'button:has-text("Accept all")',
  'button:has-text("Accept All Cookies")',
  'button:has-text("Accept")',
]

const WORK_BUDGET_MS = 50_000
const LAUNCH_TIMEOUT_MS = 15_000
const PAGE_TIMEOUT_MS = 20_000
const JUDGE_TIMEOUT_MS = 15_000
const RELEASE_TIMEOUT_MS = 8_000
const BOT_WALL = /checking your browser|verify you are human|are you a robot|captcha|access denied|unusual traffic|cloudflare/i

async function within<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), Math.max(1, timeoutMs))
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Pulls the three signals a stock check needs: structured offers, size controls, and visible copy. */
async function readProductPage(browser: BrowserSession, url: string) {
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 860 })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })

  for (const selector of COOKIE_BUTTONS) {
    const button = page.locator(selector).first()
    if (await button.isVisible({ timeout: 400 }).catch(() => false)) {
      await button.click({ timeout: 1_500 }).catch(() => {})
      break
    }
  }
  await page.waitForSelector('button, option, select, [data-size]', { timeout: 5_000 }).catch(() => {})
  await page.waitForTimeout(1_000)

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

  const image = await page.screenshot({ type: 'jpeg', quality: 55, timeout: 5_000 }).catch(() => null)
  return {
    ...signals,
    blocked: BOT_WALL.test(`${signals.title}\n${signals.text}`),
    screenshot: image ? `data:image/jpeg;base64,${Buffer.from(image).toString('base64')}` : null,
  }
}

async function judgeStock(input: { productName: string; size: string }, page: Awaited<ReturnType<typeof readProductPage>>, timeoutMs: number) {
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
    abortSignal: AbortSignal.timeout(Math.max(1, timeoutMs)),
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
    await within(solari.close(), RELEASE_TIMEOUT_MS, 'Solari client close').catch(() => {})
  }
}

async function launchBrowser(solari: Solari, proxy: LaunchOptions['proxy'], timeoutMs: number) {
  // A timed-out launch can still resolve server-side; close the late session rather than leaving it running.
  const work = solari.launch({ stealth: true, proxy, recording: true, retries: 1 })
  try {
    return await within(work, timeoutMs, 'Solari browser launch')
  } catch (error) {
    void work.then((browser) => browser.close()).catch(() => {})
    throw error
  }
}

async function readPageSession(solari: Solari, productUrl: string, proxy: LaunchOptions['proxy'], deadline: number) {
  const remaining = () => Math.max(1, deadline - Date.now())
  // Stealth + UK residential egress so retailers serve the real UK page, not a bot wall. Recording is per-session opt-in.
  const browser = await launchBrowser(solari, proxy, Math.min(LAUNCH_TIMEOUT_MS, remaining()))
  const sessionId = browser.id
  const egress = browser.proxy ? `${browser.proxy.country.toUpperCase()} ${browser.proxy.tier ?? 'residential'}` : 'direct'
  try {
    const page = await within(readProductPage(browser, productUrl), Math.min(PAGE_TIMEOUT_MS, remaining()), 'Retailer page read')
    return {
      page,
      sessionId,
      egress,
      release: () => within(solari.sessions.releaseAndWait(sessionId), Math.min(RELEASE_TIMEOUT_MS, remaining()), 'Solari session release'),
    }
  } finally {
    await within(browser.close(), Math.min(RELEASE_TIMEOUT_MS, remaining()), 'Solari browser close').catch(() => {})
  }
}

export async function verifyStock(input: { productName: string; productUrl: string; size: string }): Promise<StockCheck> {
  const apiKey = process.env.SOLARI_API_KEY
  if (!apiKey) throw new Error('SOLARI_API_KEY is not configured')

  const started = Date.now()
  const deadline = started + WORK_BUDGET_MS
  const solari = new Solari({ apiKey, timeoutMs: LAUNCH_TIMEOUT_MS })
  try {
    let run = await readPageSession(solari, input.productUrl, { country: 'gb' }, deadline)

    if (run.page.blocked && deadline - Date.now() > 30_000) {
      await run.release().catch(() => {})
      const smartRun = await readPageSession(solari, input.productUrl, 'smart', deadline).catch(() => null)
      if (smartRun) run = smartRun
    }

    const remaining = Math.max(1, deadline - Date.now())
    const verdict = run.page.blocked
      ? {
          verdict: 'blocked' as const,
          sizeFound: '',
          price: '',
          evidence: 'The retailer returned an access check or bot-protection page.',
        }
      : await judgeStock(input, run.page, Math.min(JUDGE_TIMEOUT_MS, remaining))

    await run.release().catch(() => {})
    return {
      ...input,
      ...verdict,
      pageTitle: run.page.title,
      screenshot: run.page.screenshot,
      sessionId: run.sessionId,
      egress: run.egress,
      elapsedMs: Date.now() - started,
      checkedAt: new Date(started).toISOString(),
      source: 'live',
    }
  } finally {
    await within(solari.close(), RELEASE_TIMEOUT_MS, 'Solari client close').catch(() => {})
  }
}
