
/**
 * Secrets that must never be borrowed from another vendor's key.
 *
 * Fit passports are HMAC-signed so other agents can trust them, and stock-check tokens authorise a
 * live browser session against a retailer. Both used to fall back to a vendor key (Solari)
 * when their own secret was missing, which quietly meant one leaked key could forge passports.
 * A missing secret is now a hard, named failure instead of a silent downgrade.
 */
export class MissingSecretError extends Error {
  readonly secretName: string
  readonly purpose: string
  constructor(secretName: string, purpose: string) {
    super(`${secretName} is not set, so ${purpose} cannot be signed.`)
    this.name = 'MissingSecretError'
    this.secretName = secretName
    this.purpose = purpose
  }
}

/** Reads a required secret, or throws {@link MissingSecretError} naming what is missing. */
export function requireSecret(name: string, purpose: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new MissingSecretError(name, purpose)
  return value
}

/** True when a required secret is configured; for pre-flight checks that must not throw. */
export function hasSecret(name: string): boolean {
  return Boolean(process.env[name]?.trim())
}
