import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Drop a side-on running clip into public/demo to enable "Watch a sample run" on the idle monitor.
const sampleClip = ['sample-run.mp4', 'sample-run.webm', 'sample-run.mov'].find((file) =>
  existsSync(join(process.cwd(), 'public', 'demo', file)),
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion', 'ai', '@ai-sdk/react'],
  },
  env: {
    NEXT_PUBLIC_SAMPLE_CLIP: sampleClip ? `/demo/${sampleClip}` : '',
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['*.vercel.run'],
  // Solari's client wraps patchright (a Playwright fork) whose optional requires can't be bundled.
  serverExternalPackages: ['@solarisdk/browser', 'patchright-core'],
  // The nested pnpm deps above were dropped from the traced serverless bundle — every stock-check
  // request 500'd at module load in prod (Cannot find package) while local builds were fine.
  // Force both packages into the file trace for the routes that import solari.ts.
  outputFileTracingIncludes: {
    '/api/stock-check': ['./node_modules/@solarisdk/browser/**/*', './node_modules/patchright-core/**/*'],
    '/api/stock-check/replay': ['./node_modules/@solarisdk/browser/**/*', './node_modules/patchright-core/**/*'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
        ],
      },
    ]
  },
}

export default nextConfig
