import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Drop a side-on running clip into public/demo to enable "Watch a sample run" on the idle monitor.
const sampleClip = ['sample-run.mp4', 'sample-run.webm', 'sample-run.mov'].find((file) =>
  existsSync(join(process.cwd(), 'public', 'demo', file)),
)

/** @type {import('next').NextConfig} */
const nextConfig = {
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
