/**
 * Turns a server error into one log line that is safe to keep: no query strings, no tokens, no
 * request bodies. Passport URLs carry the whole passport in the path, so long path segments are
 * replaced with a placeholder before anything leaves the process.
 */
export interface ErrorReport {
  kind: 'error'
  at: string
  route: string
  method: string
  routeType: string
  message: string
  digest?: string
}

const MAX_MESSAGE = 300
const MAX_SEGMENT = 32

export function redactPath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? ''
  return withoutQuery
    .split('/')
    .map((segment) => (segment.length > MAX_SEGMENT ? ':token' : segment))
    .join('/')
}

export function buildErrorReport(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string },
  now = new Date(),
): ErrorReport {
  const message = error instanceof Error ? error.message : String(error)
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error ? String((error as { digest: unknown }).digest) : undefined
  return {
    kind: 'error',
    at: now.toISOString(),
    route: context.routePath ?? redactPath(request.path),
    method: request.method,
    routeType: context.routeType ?? 'unknown',
    message: message.replace(/\s+/g, ' ').slice(0, MAX_MESSAGE),
    ...(digest ? { digest } : {}),
  }
}
